import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReviewWizard } from '@/components/review/ReviewWizard';
import { ToastProvider } from '@/components/ui/Toast';
import { SessionLauncherProvider } from '@/components/session/SessionLauncher';
import { getDb, resetDbForTesting } from '@/lib/db/db';
import { reviewRepo } from '@/lib/db/review.repo';
import { projectRepo } from '@/lib/db/project.repo';
import { taskRepo } from '@/lib/db/task.repo';
import { weekBefore, weekKeyFor } from '@/lib/review/week';
import { addDays } from '@/lib/pacing/days';
import { toLocalDateString } from '@/lib/utils/date';
import { localDayKeyToDate } from '@/lib/capture/task-input';
import { summarizeWeek } from '@/lib/review/stats';
import { DOMAIN_SEED_IDS } from '@/lib/db/seed-domains';
import type { Task } from '@/lib/schemas/task';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(async () => {
  push.mockClear();
  await resetDbForTesting();
});

const WEEK = weekKeyFor(new Date());
const WAITING_ID = '8a1f6c2d-1111-4111-8111-111111111111';
const INBOX_ID = '8a1f6c2d-2222-4222-8222-222222222222';
const PROJECT_ID = '8a1f6c2d-3333-4333-8333-333333333333';

function renderWizard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        {/* Step 1 renders the inbox's own ProcessMode, which needs both. */}
        <SessionLauncherProvider value={{ openForLink: vi.fn() }}>
          <ReviewWizard />
        </SessionLauncherProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** Seed a task only the way an older row looks: a `next` task untouched for 20 days. */
async function seedWaitingTask(): Promise<void> {
  const now = Date.now();
  const old = new Date(now - 20 * 86_400_000);
  const project = await projectRepo.create({
    title: 'Rebuild the portfolio',
    status: 'active',
    cadencePerWeek: 2,
  });
  const task = {
    id: WAITING_ID,
    title: 'Find the warranty email',
    status: 'next',
    source: 'manual',
    estimateMin: 20,
    projectId: project.id,
    createdAt: old,
    touchedAt: old,
  } as Task;
  await getDb().tasks.put(task);
  await taskRepo.create({ title: 'sort the paper pile', status: 'inbox', source: 'manual' });
}

/**
 * Wait for a control to be usable, then click it. The row is written before
 * React clears `busy`, so a click issued right after a status check can land on
 * a disabled button; a person would wait for the control too.
 */
async function clickWhenEnabled(name: RegExp | string) {
  const button = screen.getByRole('button', { name }) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
}

async function goToStep(index: number) {
  // The wizard resolves its draft first, so wait for step 1 before clicking.
  await screen.findByText(/^Step 1 of 6:/);
  for (let i = 0; i < index; i += 1) {
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  }
  await screen.findByText(new RegExp(`^Step ${index + 1} of 6:`));
}

describe('ReviewWizard', () => {
  it('resumes a draft at the stored step with its decisions', async () => {
    await seedWaitingTask();
    await reviewRepo.saveDraft(WEEK, {
      step: 2,
      decisions: { projects: { [PROJECT_ID]: { breadcrumb: 'from the draft' } } },
    });

    renderWizard();
    expect(await screen.findByText(/^Step 3 of 6: Projects/)).toBeTruthy();
  });

  it('finishing twice in one act() saves exactly one review', async () => {
    await seedWaitingTask();
    const complete = vi.spyOn(reviewRepo, 'complete');
    renderWizard();

    await goToStep(5);
    fireEvent.change(screen.getByLabelText('What stood out?'), {
      target: { value: 'A steady week.' },
    });

    const finish = screen.getByRole('button', { name: 'Finish review' });
    act(() => {
      fireEvent.click(finish);
      fireEvent.click(finish);
    });

    expect(await screen.findByRole('heading', { name: 'Review saved' })).toBeTruthy();
    expect(complete).toHaveBeenCalledTimes(1);
    const reviews = await getDb().reviews.toArray();
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.notes).toBe('A steady week.');
    expect(await getDb().reviewDrafts.count()).toBe(0);
  });

  it('a failed finish says nothing was saved and leaves the button usable', async () => {
    await seedWaitingTask();
    const real = reviewRepo.complete.bind(reviewRepo);
    const complete = vi
      .spyOn(reviewRepo, 'complete')
      .mockRejectedValueOnce(new Error('storage went away'))
      .mockImplementation(real);
    renderWizard();

    await goToStep(5);
    fireEvent.click(screen.getByRole('button', { name: 'Finish review' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('nothing was changed');
    const finish = screen.getByRole('button', { name: 'Finish review' }) as HTMLButtonElement;
    expect(finish.disabled).toBe(false);

    // The guard reset: pressing again works, and the review is saved once.
    fireEvent.click(finish);
    expect(await screen.findByRole('heading', { name: 'Review saved' })).toBeTruthy();
    expect(complete).toHaveBeenCalledTimes(2);
    expect(await getDb().reviews.count()).toBe(1);
  });

  it('letting a waiting task go writes dropped once, even with two clicks in one act', async () => {
    await seedWaitingTask();
    const write = vi.spyOn(taskRepo, 'updateStatus');
    renderWizard();

    await goToStep(1);
    const letGo = screen.getByRole('button', { name: /^Let it go:/ });
    act(() => {
      fireEvent.click(letGo);
      fireEvent.click(letGo);
    });

    expect(await screen.findByText('Let go. Nothing was deleted.')).toBeTruthy();
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    await waitFor(async () => {
      expect((await taskRepo.getById(WAITING_ID))?.status).toBe('dropped');
      const draft = await reviewRepo.getDraft(WEEK);
      expect(draft?.decisions.sweep).toMatchObject({ [WAITING_ID]: { action: 'drop' } });
    });
  });

  it('redefining the next step clears a stale defer date, like the inbox does', async () => {
    await seedWaitingTask();
    const stale = await taskRepo.getById(WAITING_ID);
    await getDb().tasks.put({ ...stale!, deferUntil: new Date(2026, 0, 1, 12) });
    renderWizard();

    await goToStep(1);
    fireEvent.click(screen.getByRole('button', { name: /^New next step:/ }));
    fireEvent.change(await screen.findByLabelText(/The next small step for/), {
      target: { value: 'ask the editor for the receipt' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save next step' }));

    await waitFor(async () => {
      const task = await taskRepo.getById(WAITING_ID);
      expect(task?.status).toBe('next');
      expect(task?.nextAction).toBe('ask the editor for the receipt');
      expect(task?.deferUntil ?? null).toBeNull();
    });
  });

  it('deferring writes the day and the scheduled status together', async () => {
    await seedWaitingTask();
    const future = addDays(toLocalDateString(new Date()), 7);
    renderWizard();

    await goToStep(1);
    fireEvent.click(screen.getByRole('button', { name: /^Defer:/ }));
    fireEvent.change(await screen.findByLabelText(/Day to look at/), { target: { value: future } });
    fireEvent.click(screen.getByRole('button', { name: /^Defer$/ }));

    await waitFor(async () => {
      const task = await taskRepo.getById(WAITING_ID);
      expect(task?.status).toBe('scheduled');
      expect(task?.deferUntil ? task.deferUntil.getTime() : null).toBe(
        localDayKeyToDate(future).getTime(),
      );
    });
    expect(await screen.findByText(`Deferred to ${future}.`)).toBeTruthy();
  });

  it('a deliberate keep refreshes the touch so the task stops asking', async () => {
    await seedWaitingTask();
    const before = await taskRepo.getById(WAITING_ID);
    expect(before?.status).toBe('next');
    const startedAt = Date.now();
    // The seeded task was untouched for 20 days, so it is waiting before the keep.
    const waitingBefore = summarizeWeek({
      weekOf: WEEK,
      sessions: [],
      tasks: await getDb().tasks.toArray(),
      projects: await getDb().projects.toArray(),
      domains: await getDb().domains.toArray(),
      now: new Date(),
    });
    expect(waitingBefore.waitingTaskIds).toContain(WAITING_ID);

    renderWizard();
    await goToStep(1);
    await clickWhenEnabled(/^Keep:/);

    await waitFor(async () => {
      const stored = await taskRepo.getById(WAITING_ID);
      expect(stored?.status).toBe('next');
      expect(stored?.touchedAt.getTime()).toBeGreaterThanOrEqual(startedAt);
    });

    // It stays on the next list but no longer counts as waiting, so the next
    // review does not ask about it again.
    const waitingAfter = summarizeWeek({
      weekOf: WEEK,
      sessions: [],
      tasks: await getDb().tasks.toArray(),
      projects: await getDb().projects.toArray(),
      domains: await getDb().domains.toArray(),
      now: new Date(),
    });
    expect(waitingAfter.waitingTaskIds).not.toContain(WAITING_ID);
  });

  it('defers to today when today is the day chosen', async () => {
    await seedWaitingTask();
    const today = toLocalDateString(new Date());
    renderWizard();
    await goToStep(1);

    await clickWhenEnabled(/^Defer:/);
    fireEvent.change(await screen.findByLabelText(/Day to look at/), { target: { value: today } });
    await clickWhenEnabled(/^Defer$/);

    await waitFor(async () => {
      const stored = await taskRepo.getById(WAITING_ID);
      expect(stored?.status).toBe('scheduled');
      expect(stored?.deferUntil ? stored.deferUntil.getTime() : null).toBe(
        localDayKeyToDate(today).getTime(),
      );
    });
    expect(await screen.findByText(`Deferred to ${today}.`)).toBeTruthy();
  });

  it('refuses to schedule a task for nowhere: an empty or past day writes nothing', async () => {
    await seedWaitingTask();
    renderWizard();
    await goToStep(1);

    fireEvent.click(screen.getByRole('button', { name: /^Defer:/ }));
    const dayInput = (await screen.findByLabelText(/Day to look at/)) as HTMLInputElement;
    const deferButton = screen.getByRole('button', { name: /^Defer$/ }) as HTMLButtonElement;

    fireEvent.change(dayInput, { target: { value: '' } });
    expect(deferButton.disabled).toBe(true);
    expect(screen.getByText('Pick a day from today onwards.')).toBeTruthy();
    fireEvent.click(deferButton);

    fireEvent.change(dayInput, { target: { value: '2020-01-01' } });
    expect(deferButton.disabled).toBe(true);
    fireEvent.click(deferButton);

    await waitFor(async () => {
      const task = await taskRepo.getById(WAITING_ID);
      expect(task?.status).toBe('next');
      expect(task?.deferUntil ?? null).toBeNull();
      const draft = await reviewRepo.getDraft(WEEK);
      expect(draft?.decisions.sweep ?? {}).toEqual({});
    });
  });

  it('no sequence of clicks can reach an illegal transition', async () => {
    await seedWaitingTask();
    const future = addDays(toLocalDateString(new Date()), 3);
    renderWizard();
    await goToStep(1);

    async function expectStatus(expected: string) {
      await waitFor(async () => expect((await taskRepo.getById(WAITING_ID))?.status).toBe(expected));
    }
    async function deferTo(dayKey: string) {
      await clickWhenEnabled(/^Defer:/);
      fireEvent.change(await screen.findByLabelText(/Day to look at/), { target: { value: dayKey } });
      await clickWhenEnabled(/^Defer$/);
      await expectStatus('scheduled');
    }

    // keep -> defer -> let it go -> undo -> defer
    await clickWhenEnabled(/^Keep:/);
    await expectStatus('next');
    await deferTo(future);

    await clickWhenEnabled(/^Let it go:/);
    await expectStatus('dropped');
    // A dropped row offers Undo only, so dropped -> scheduled is not reachable.
    expect(screen.queryByRole('button', { name: /^Defer:/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Undo let go' })).toBeTruthy();

    await clickWhenEnabled('Undo let go');
    await expectStatus('next');
    await deferTo(future);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('finishes a draft that belongs to the previous week under that week, not today', async () => {
    await seedWaitingTask();
    const lastWeek = weekBefore(WEEK);
    await reviewRepo.saveDraft(lastWeek, {
      step: 5,
      decisions: { notes: 'carried over from Sunday night' },
    });
    renderWizard();

    // A draft from an earlier week is never resumed behind the user's back.
    fireEvent.click(await screen.findByRole('button', { name: 'Continue that review' }));
    await screen.findByText(/^Step 6 of 6:/);
    const notes = screen.getByLabelText('What stood out?') as HTMLTextAreaElement;
    expect(notes.value).toBe('carried over from Sunday night');

    fireEvent.click(screen.getByRole('button', { name: 'Finish review' }));
    expect(await screen.findByRole('heading', { name: 'Review saved' })).toBeTruthy();
    const reviews = await getDb().reviews.toArray();
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.weekOf).toBe(lastWeek);
    expect(reviews[0]?.notes).toBe('carried over from Sunday night');
  });

  it('offers a choice instead of silently resuming an older draft', async () => {
    await seedWaitingTask();
    const lastWeek = weekBefore(WEEK);
    await reviewRepo.saveDraft(lastWeek, { step: 3, decisions: { notes: 'old notes' } });
    renderWizard();

    expect(await screen.findByText(/You have an unfinished review for the week of/)).toBeTruthy();
    expect(screen.queryByText(/^Step 1 of 6:/)).toBeNull();
    expect(screen.queryByText(/^Step 4 of 6:/)).toBeNull();

    // Starting this week leaves the older draft exactly where it was.
    fireEvent.click(screen.getByRole('button', { name: /Start this week/ }));
    expect(await screen.findByText(/^Step 1 of 6:/)).toBeTruthy();
    expect((await reviewRepo.getDraft(lastWeek))?.step).toBe(3);
  });

  it('discards an older draft only after a confirm', async () => {
    await seedWaitingTask();
    const lastWeek = weekBefore(WEEK);
    await reviewRepo.saveDraft(lastWeek, { step: 3, decisions: { notes: 'old notes' } });
    renderWizard();

    fireEvent.click(await screen.findByRole('button', { name: /Discard the unfinished review/ }));
    expect(await screen.findByText(/Discard the unfinished review for the week of/)).toBeTruthy();
    expect(await reviewRepo.getDraft(lastWeek)).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Discard it' }));
    await waitFor(async () => expect(await reviewRepo.getDraft(lastWeek)).toBeNull());
    expect(await screen.findByText(/^Step 1 of 6:/)).toBeTruthy();
  });

  it('resumes a draft that lands on the sweep step with the undecided rows visible', async () => {
    await seedWaitingTask();
    await reviewRepo.saveDraft(WEEK, { step: 1, decisions: {} });

    // Make the tasks arrive AFTER the wizard has landed on the sweep step, which
    // is the real resume race: the draft read is fast and the task store is not.
    const realGetAll = taskRepo.getAll.bind(taskRepo);
    let firstCall = true;
    vi.spyOn(taskRepo, 'getAll').mockImplementation(async () => {
      if (firstCall) {
        firstCall = false;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      return realGetAll();
    });

    renderWizard();

    expect(await screen.findByText(/^Step 2 of 6:/)).toBeTruthy();
    // The snapshot must be taken AFTER the tasks load; an empty one would hide
    // the undecided waiting task for the whole visit.
    expect(await screen.findByText('Find the warranty email')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Keep:/ })).toBeTruthy();
  });

  it('keeps the aim typed on the balance step in the draft', async () => {
    await seedWaitingTask();
    renderWizard();
    await goToStep(3);

    const aim = screen.getByLabelText(/Minutes you aimed for in Trading this week/) as HTMLInputElement;
    fireEvent.change(aim, { target: { value: '120' } });

    await waitFor(async () => {
      const draft = await reviewRepo.getDraft(WEEK);
      expect(draft?.decisions.weekIntentions).toEqual({ [DOMAIN_SEED_IDS.trading]: 120 });
    });
  });

  it('uses calm vocabulary and keeps every visible label inside its accessible name', async () => {
    await seedWaitingTask();
    renderWizard();

    for (let step = 0; step < 6; step += 1) {
      await screen.findByText(new RegExp(`^Step ${step + 1} of 6:`));
      const text = document.body.textContent ?? '';
      // The project's vocabulary: waiting, let go. Never a failure word.
      expect(text).not.toMatch(/\b(dropped|abandoned|failed|behind|overdue|late)\b/i);

      for (const control of Array.from(document.querySelectorAll<HTMLElement>('button, a[href]'))) {
        const visible = (control.textContent ?? '').trim().toLowerCase();
        if (visible === '') continue;
        const accessible = (control.getAttribute('aria-label') ?? control.textContent ?? '').trim().toLowerCase();
        expect(accessible, `label-in-name: ${visible}`).toContain(visible);
      }

      if (step < 5) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    }
  });

  it('closing for now saves the draft step and returns home', async () => {
    await seedWaitingTask();
    renderWizard();

    await goToStep(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close for now' }));

    await waitFor(async () => {
      expect((await reviewRepo.getDraft(WEEK))?.step).toBe(1);
    });
    // push happens after the draft write resolves.
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  });
});
