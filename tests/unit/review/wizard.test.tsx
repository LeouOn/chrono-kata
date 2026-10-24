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
import { DOMAIN_SEED_IDS } from '@/lib/db/seed-domains';
import type { Task } from '@/lib/schemas/task';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));

afterEach(cleanup);
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
    const letGo = screen.getByRole('button', { name: /Let go of/ });
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
    fireEvent.click(screen.getByRole('button', { name: /Name a new next step/ }));
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
    renderWizard();

    await goToStep(1);
    fireEvent.click(screen.getByRole('button', { name: /Defer “Find the warranty email”/ }));
    fireEvent.change(await screen.findByLabelText(/Day to look at/), {
      target: { value: '2026-07-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Defer$/ }));

    await waitFor(async () => {
      const task = await taskRepo.getById(WAITING_ID);
      expect(task?.status).toBe('scheduled');
      expect(task?.deferUntil ? task.deferUntil.getTime() : null).toBe(
        new Date(2026, 6, 1, 12).getTime(),
      );
    });
    expect(await screen.findByText('Deferred to 2026-07-01.')).toBeTruthy();
  });

  it('finishes a draft that belongs to the previous week under that week, not today', async () => {
    await seedWaitingTask();
    const lastWeek = weekBefore(WEEK);
    await reviewRepo.saveDraft(lastWeek, {
      step: 5,
      decisions: { notes: 'carried over from Sunday night' },
    });
    renderWizard();

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
