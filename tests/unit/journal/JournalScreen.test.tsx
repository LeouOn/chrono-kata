import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JournalScreen } from '@/components/journal/JournalScreen';
import { useJournalWrites } from '@/hooks/useJournal';
import { JournalLink } from '@/components/journal/JournalLink';
import { ToastProvider } from '@/components/ui/Toast';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { journalRepo } from '@/lib/db/journal.repo';
import { taskRepo } from '@/lib/db/task.repo';
import { dayPlanRepo } from '@/lib/db/day-plan.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { DOMAIN_SEED_IDS } from '@/lib/db/seed-domains';
import { toLocalDateString } from '@/lib/utils/date';
import { renderJournalTemplate, resolveJournalTemplate } from '@/lib/journal/template';
import { formatLongDate } from '@/lib/journal/export';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));

const TODAY = toLocalDateString(new Date());

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  push.mockClear();
});

/**
 * Click a control once it is usable. Both writes in the journal disable their
 * button while in flight (a guard that silently drops a click would lie), so a
 * test that clicks twice in a row waits for the control, the way a person does.
 */
async function clickWhenEnabled(name: RegExp | string) {
  const button = (await screen.findByRole('button', { name })) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
}

beforeEach(async () => {
  await resetDbForTesting();
  await settingsRepo.setFlag('taskInbox', true);
});

function renderScreen(dateParam: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <JournalScreen dateParam={dateParam} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** A stand-in for another surface (or tab) that writes the same day. */
function OtherSurface({ dayKey, note }: { dayKey: string; note: string }) {
  const { applyShutdown } = useJournalWrites();
  return (
    <button
      type="button"
      onClick={() => applyShutdown.mutate({ date: dayKey, decisions: [], shutdownNote: note })}
    >
      other surface
    </button>
  );
}

describe('JournalScreen', () => {
  it('starts a new entry from the rendered template, with the domains as a checklist', async () => {
    renderScreen();
    const text = (await screen.findByLabelText('What happened today')) as HTMLTextAreaElement;
    const domains = await getDb().domains.toArray();
    const expected = renderJournalTemplate(resolveJournalTemplate(undefined), {
      date: TODAY,
      weekday: formatLongDate(TODAY).split(' ')[0]!,
      domains: domains
        .slice()
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .map((domain) => ({ id: domain.id, name: domain.name })),
    });
    expect(text.value).toBe(expected);
    expect(screen.getByLabelText('Trading')).toBeTruthy();
  });

  it('saves the entry and the domain ticks, and shows them again on a fresh load', async () => {
    renderScreen();
    const text = (await screen.findByLabelText('What happened today')) as HTMLTextAreaElement;
    fireEvent.change(text, { target: { value: 'Trading felt calm.\nPractice was short.' } });
    fireEvent.click(screen.getByLabelText('Trading'));
    fireEvent.click(screen.getByRole('button', { name: 'Save journal' }));

    await waitFor(async () => {
      const stored = await journalRepo.findByDate(TODAY);
      expect(stored?.journal).toBe('Trading felt calm.\nPractice was short.');
      expect(stored?.domainChecks).toEqual({ [DOMAIN_SEED_IDS.trading]: true });
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Saved on this device.');
  });

  it('closes the day: one pick moved, one back on the list', async () => {
    const done = await taskRepo.create({ title: 'Fix the hose', status: 'next' });
    const back = await taskRepo.create({ title: 'Write the report', status: 'next' });
    await dayPlanRepo.upsert(TODAY, { picks: [done.id, back.id], capacityMin: 180 });
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: /^Done: “Fix the hose”$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Back on the list: “Write the report”$/ }));
    fireEvent.change(screen.getByLabelText('Shutdown note'), { target: { value: 'A calm evening.' } });
    fireEvent.change(screen.getByLabelText(/Tomorrow's first move/), {
      target: { value: 'Start with trading prep.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close the day' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'The day is closed: 1 moved, 1 back on the list.',
    );
    expect((await taskRepo.getById(done.id))?.status).toBe('done');
    expect((await taskRepo.getById(back.id))?.status).toBe('next');

    const stored = await journalRepo.findByDate(TODAY);
    expect(stored?.picksDone).toEqual([done.id]);
    expect(stored?.picksBack).toEqual([back.id]);
    expect(stored?.shutdownNote).toBe('A calm evening.');
    expect(stored?.firstActionTomorrow).toBe('Start with trading prep.');
    expect(stored?.shutdownAt).not.toBeNull();
  });

  it('a second identical close writes nothing (the day stays as it was)', async () => {
    const finished = await taskRepo.create({ title: 'Fix the hose', status: 'next' });
    await dayPlanRepo.upsert(TODAY, { picks: [finished.id], capacityMin: 180 });
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: /^Done: “Fix the hose”$/ }));
    await clickWhenEnabled('Close the day');
    await screen.findByText(/The day is closed/);
    const first = await journalRepo.findByDate(TODAY);
    expect(first?.shutdownAt).not.toBeNull();

    // The screen now offers "Save changes"; pressing it with the same choices
    // must not rewrite the row.
    await clickWhenEnabled('Save changes');
    await waitFor(async () => {
      const second = await journalRepo.findByDate(TODAY);
      expect(second?.updatedAt.getTime()).toBe(first?.updatedAt.getTime());
      expect(second?.picksDone).toEqual(first?.picksDone);
    });
  });

  it('two clicks on Close the day in one act send one shutdown', async () => {
    const finished = await taskRepo.create({ title: 'Fix the hose', status: 'next' });
    await dayPlanRepo.upsert(TODAY, { picks: [finished.id], capacityMin: 180 });
    const shutdown = vi.spyOn(journalRepo, 'applyShutdown');
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: /^Done: “Fix the hose”$/ }));
    const button = screen.getByRole('button', { name: 'Close the day' });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    await waitFor(() => expect(shutdown).toHaveBeenCalledTimes(1));
  });

  it('a rejected close says nothing was saved and the button works again', async () => {
    const finished = await taskRepo.create({ title: 'Fix the hose', status: 'next' });
    await dayPlanRepo.upsert(TODAY, { picks: [finished.id], capacityMin: 180 });
    const real = journalRepo.applyShutdown.bind(journalRepo);
    const spy = vi
      .spyOn(journalRepo, 'applyShutdown')
      .mockRejectedValueOnce(new Error('storage went away'))
      .mockImplementation(real);
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: /^Done: “Fix the hose”$/ }));
    await clickWhenEnabled('Close the day');
    expect(await screen.findByRole('alert')).toHaveTextContent('storage went away');
    expect((await taskRepo.getById(finished.id))?.status).toBe('next');

    await clickWhenEnabled('Close the day');
    expect(await screen.findByRole('status')).toHaveTextContent('The day is closed: 1 moved.');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('saves an edited template through the settings merge, keeping other settings', async () => {
    await settingsRepo.patch({ displayName: 'Ada' });
    renderScreen();

    const box = (await screen.findByLabelText('Journal template (markdown)')) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: '## {{date}}\n\nHow was it?\n' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));

    await waitFor(async () => {
      const stored = await settingsRepo.get();
      expect(stored.journalTemplate).toBe('## {{date}}\n\nHow was it?');
      expect(stored.displayName).toBe('Ada');
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Template saved on this device.');
  });

  it('keeps unsaved shutdown typing and choices when the journal is saved', async () => {
    const finished = await taskRepo.create({ title: 'Fix the hose', status: 'next' });
    await dayPlanRepo.upsert(TODAY, { picks: [finished.id], capacityMin: 180 });
    renderScreen();

    // Type into the shutdown card and press a choice, but save nothing there yet.
    fireEvent.change(await screen.findByLabelText('Shutdown note'), {
      target: { value: 'typed but not saved' },
    });
    fireEvent.change(screen.getByLabelText(/Tomorrow's first move/), {
      target: { value: 'call the plumber' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Done: “Fix the hose”$/ }));

    // Save the journal above: the day's row changes underneath the shutdown card.
    fireEvent.change(screen.getByLabelText('What happened today'), { target: { value: 'Journal text.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save journal' }));
    await waitFor(async () => expect((await journalRepo.findByDate(TODAY))?.journal).toBe('Journal text.'));

    expect((screen.getByLabelText('Shutdown note') as HTMLTextAreaElement).value).toBe('typed but not saved');
    expect((screen.getByLabelText(/Tomorrow's first move/) as HTMLInputElement).value).toBe('call the plumber');
    expect(screen.getByRole('button', { name: /^Done: “Fix the hose”$/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('does not overwrite unsaved shutdown typing when the row changes elsewhere', async () => {
    const finished = await taskRepo.create({ title: 'Fix the hose', status: 'next' });
    await dayPlanRepo.upsert(TODAY, { picks: [finished.id], capacityMin: 180 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <JournalScreen dateParam={null} />
          <OtherSurface dayKey={TODAY} note="from the other tab" />
        </ToastProvider>
      </QueryClientProvider>,
    );

    fireEvent.change(await screen.findByLabelText('Shutdown note'), {
      target: { value: 'typing here, not saved' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'other surface' }));
    await waitFor(async () => expect((await journalRepo.findByDate(TODAY))?.shutdownNote).toBe('from the other tab'));

    // The person's unsaved words win while they are typing.
    expect((screen.getByLabelText('Shutdown note') as HTMLTextAreaElement).value).toBe(
      'typing here, not saved',
    );
  });

  it('picks up a change made elsewhere while the card is pristine', async () => {
    await dayPlanRepo.upsert(TODAY, { picks: [], capacityMin: 180 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <JournalScreen dateParam={null} />
          <OtherSurface dayKey={TODAY} note="from the other tab" />
        </ToastProvider>
      </QueryClientProvider>,
    );

    await screen.findByLabelText('Shutdown note');
    fireEvent.click(screen.getByRole('button', { name: 'other surface' }));
    await waitFor(() =>
      expect((screen.getByLabelText('Shutdown note') as HTMLTextAreaElement).value).toBe('from the other tab'),
    );
  });

  it('re-seeds from the stored row after its own save', async () => {
    const finished = await taskRepo.create({ title: 'Fix the hose', status: 'next' });
    await dayPlanRepo.upsert(TODAY, { picks: [finished.id], capacityMin: 180 });
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: /^Done: “Fix the hose”$/ }));
    fireEvent.change(screen.getByLabelText('Shutdown note'), { target: { value: 'Saved note.' } });
    await clickWhenEnabled('Close the day');
    await screen.findByText(/The day is closed/);

    // The card now shows the stored row: the same choices and the saved note.
    expect((screen.getByLabelText('Shutdown note') as HTMLTextAreaElement).value).toBe('Saved note.');
    expect(screen.getByRole('button', { name: /^Done: “Fix the hose”$/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeTruthy();
  });

  it('pressing a stored choice again does nothing, and switching works both ways', async () => {
    const finished = await taskRepo.create({ title: 'Fix the hose', status: 'next' });
    await dayPlanRepo.upsert(TODAY, { picks: [finished.id], capacityMin: 180 });
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: /^Back on the list: “Fix the hose”$/ }));
    await clickWhenEnabled('Close the day');
    // Wait for the confirmation itself, not any role=status on the page (the
    // loading line is one too, and resolving on it raced the save).
    await screen.findByText(/The day is closed/);
    const storedAfterClose = await journalRepo.findByDate(TODAY);
    expect(storedAfterClose?.picksBack).toEqual([finished.id]);

    // Pressing the pressed choice again must not show it as off.
    fireEvent.click(screen.getByRole('button', { name: /^Back on the list: “Fix the hose”$/ }));
    expect(screen.getByRole('button', { name: /^Back on the list: “Fix the hose”$/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Saving changes with no change writes nothing at all.
    await clickWhenEnabled('Save changes');
    await waitFor(async () => {
      const stored = await journalRepo.findByDate(TODAY);
      expect(stored?.updatedAt.getTime()).toBe(storedAfterClose?.updatedAt.getTime());
      expect(stored?.picksBack).toEqual([finished.id]);
    });

    // Switching to Done moves it between the lists.
    fireEvent.click(screen.getByRole('button', { name: /^Done: “Fix the hose”$/ }));
    await clickWhenEnabled('Save changes');
    await waitFor(async () => {
      const stored = await journalRepo.findByDate(TODAY);
      expect(stored?.picksDone).toEqual([finished.id]);
      expect(stored?.picksBack).toEqual([]);
    });
  });

  it('disables Close the day while its write is in flight and re-enables it', async () => {
    const finished = await taskRepo.create({ title: 'Fix the hose', status: 'next' });
    await dayPlanRepo.upsert(TODAY, { picks: [finished.id], capacityMin: 180 });
    const real = journalRepo.applyShutdown.bind(journalRepo);
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(journalRepo, 'applyShutdown').mockImplementation(async (input) => {
      await gate;
      return real(input);
    });
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: /^Done: “Fix the hose”$/ }));
    const button = screen.getByRole('button', { name: 'Close the day' }) as HTMLButtonElement;
    fireEvent.click(button);

    // A control that looks usable while its click would be dropped is a lie.
    await waitFor(() => expect(button.disabled).toBe(true));
    expect(button.getAttribute('aria-busy')).toBe('true');

    release!();
    await waitFor(() => expect(button.disabled).toBe(false));
    expect(button.getAttribute('aria-busy')).toBe('false');
    expect(await screen.findByText(/The day is closed/)).toBeTruthy();
  });

  it('disables Save journal while its write is in flight and re-enables it', async () => {
    await dayPlanRepo.upsert(TODAY, { picks: [], capacityMin: 120 });
    const real = journalRepo.saveDayFields.bind(journalRepo);
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(journalRepo, 'saveDayFields').mockImplementation(async (...args) => {
      await gate;
      return real(...args);
    });
    renderScreen();

    fireEvent.change(await screen.findByLabelText('What happened today'), { target: { value: 'Journal text.' } });
    const button = screen.getByRole('button', { name: 'Save journal' }) as HTMLButtonElement;
    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(true));
    expect(button.getAttribute('aria-busy')).toBe('true');

    release!();
    await waitFor(() => expect(button.disabled).toBe(false));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved on this device.');
  });

  it('sends one save for two Save journal clicks in one act', async () => {
    await dayPlanRepo.upsert(TODAY, { picks: [], capacityMin: 120 });
    const save = vi.spyOn(journalRepo, 'saveDayFields');
    renderScreen();

    fireEvent.change(await screen.findByLabelText('What happened today'), { target: { value: 'Journal text.' } });
    const button = screen.getByRole('button', { name: 'Save journal' });
    // Both clicks land before React re-renders (one act), so the disabled state
    // cannot be what limits it: the REF guard must.
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });

  it('keeps the day’s domain ticks when the day is closed', async () => {
    const finished = await taskRepo.create({ title: 'Fix the hose', status: 'next' });
    await dayPlanRepo.upsert(TODAY, { picks: [finished.id], capacityMin: 180 });
    renderScreen();

    // Save the entry with a tick, then close the day.
    fireEvent.change(await screen.findByLabelText('What happened today'), { target: { value: 'Ticked a domain.' } });
    fireEvent.click(screen.getByLabelText('Trading'));
    await clickWhenEnabled('Save journal');
    await waitFor(async () =>
      expect((await journalRepo.findByDate(TODAY))?.domainChecks).toEqual({ [DOMAIN_SEED_IDS.trading]: true }),
    );

    fireEvent.click(screen.getByRole('button', { name: /^Done: “Fix the hose”$/ }));
    fireEvent.change(screen.getByLabelText('Shutdown note'), { target: { value: 'Closed.' } });
    await clickWhenEnabled('Close the day');
    await screen.findByText(/The day is closed/);

    const stored = await journalRepo.findByDate(TODAY);
    expect(stored?.domainChecks).toEqual({ [DOMAIN_SEED_IDS.trading]: true });
    expect(stored?.picksDone).toEqual([finished.id]);
    expect(stored?.shutdownNote).toBe('Closed.');
  });

  it('says the day is opening instead of claiming it has no picks on first paint', async () => {
    const finished = await taskRepo.create({ title: 'Fix the hose', status: 'next' });
    await dayPlanRepo.upsert(TODAY, { picks: [finished.id], capacityMin: 180 });

    // Hold the day read so the first paint is observable.
    const real = journalRepo.findByDate.bind(journalRepo);
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(journalRepo, 'findByDate').mockImplementation(async (day: string) => {
      await gate;
      return real(day);
    });

    renderScreen();
    expect(await screen.findByText('Opening the day…')).toBeTruthy();
    expect(screen.queryByText(/No picks for this day/)).toBeNull();

    release!();
    await waitFor(() => expect(screen.getByText('Fix the hose')).toBeTruthy());
  });

  it('shows each day its own entry and saves them without touching each other (multi-day)', async () => {
    const days = ['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19'];
    // Five realistic days: four with entries and domain ticks, one still empty.
    for (const [index, day] of days.entries()) {
      if (index === 3) {
        await dayPlanRepo.upsert(day, { picks: [], capacityMin: 0 });
        continue;
      }
      await dayPlanRepo.upsert(day, { picks: [], capacityMin: 120 });
      await journalRepo.saveDayFields(day, {
        journal: `Entry for ${day}.\nSecond line ${index}.`,
        domainChecks: { [DOMAIN_SEED_IDS.trading]: index % 2 === 0 },
      });
    }

    for (const [index, day] of days.entries()) {
      const view = renderScreen(day);
      const text = (await screen.findByLabelText('What happened today')) as HTMLTextAreaElement;
      if (index === 3) {
        // The empty day starts from its own rendered template.
        expect(text.value).toContain(`## ${day}`);
      } else {
        expect(text.value).toBe(`Entry for ${day}.\nSecond line ${index}.`);
        expect((screen.getByLabelText('Trading') as HTMLInputElement).checked).toBe(index % 2 === 0);
      }
      fireEvent.change(text, { target: { value: `Edited ${day}.` } });
      fireEvent.click(screen.getByRole('button', { name: 'Save journal' }));
      await waitFor(async () => expect((await journalRepo.findByDate(day))?.journal).toBe(`Edited ${day}.`));
      view.unmount();
    }

    // Every day kept its own text: nothing leaked between them.
    for (const day of days) {
      expect((await journalRepo.findByDate(day))?.journal).toBe(`Edited ${day}.`);
    }
  });

  it('moves between days with the day keys, staying on today when that is the target', async () => {
    renderScreen();
    await screen.findByLabelText('What happened today');
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/journal\?date=\d{4}-\d{2}-\d{2}$/));
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(push).toHaveBeenLastCalledWith('/journal');
  });
});

describe('JournalLink', () => {
  it('renders nothing and reads nothing when the flag is off', async () => {
    await settingsRepo.setFlag('taskInbox', false);
    const read = vi.spyOn(journalRepo, 'findByDate');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <JournalLink />
        </ToastProvider>
      </QueryClientProvider>,
    );
    await waitFor(async () => expect((await settingsRepo.get()).flags?.taskInbox).toBe(false));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(container.textContent).toBe('');
    expect(read).not.toHaveBeenCalled();
  });
});
