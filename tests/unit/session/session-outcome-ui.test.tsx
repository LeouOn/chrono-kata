import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';
import { projectRepo } from '@/lib/db/project.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { SessionForm } from '@/components/session/SessionForm';
import { readSessionTimer, writeSessionTimer } from '@/lib/timers/session-timer';
import { WorkingOnPicker } from '@/components/session/WorkingOnPicker';
import { InboxScreen } from '@/components/tasks/InboxScreen';
import { ProcessMode } from '@/components/tasks/ProcessMode';
import { ToastProvider } from '@/components/ui/Toast';
import { SessionLauncherProvider } from '@/components/session/SessionLauncher';
import type { SessionInput } from '@/lib/schemas/session';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  await resetDbForTesting();
});

function renderWithProviders(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{node}</ToastProvider>
    </QueryClientProvider>,
  );
}

async function seedWork() {
  const task = await taskRepo.create({
    title: 'write the report',
    status: 'next',
    source: 'manual',
    nextAction: 'open the outline',
    estimateMin: 20,
  });
  const project = await projectRepo.create({
    title: 'report',
    status: 'active',
    breadcrumb: 'draft the intro',
  });
  return { task, project };
}

/** Every control in the form must have an accessible name (LLM-editor lesson). */
function expectEveryControlNamed(container: HTMLElement) {
  const controls = Array.from(container.querySelectorAll<HTMLElement>('input, select, textarea'));
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) {
    const name =
      control.getAttribute('aria-label') ??
      (control.getAttribute('aria-labelledby')
        ? document.getElementById(control.getAttribute('aria-labelledby')!)?.textContent
        : null) ??
      (control as HTMLInputElement).labels?.[0]?.textContent ??
      '';
    expect(name.trim(), `${control.tagName} ${control.id || '(no id)'} has no accessible name`).not.toBe('');
  }
}

describe('WorkingOnPicker', () => {
  it('renders nothing while the taskInbox flag is off', async () => {
    const { task } = await seedWork();
    const onSelect = vi.fn();
    renderWithProviders(<WorkingOnPicker taskId={null} projectId={null} onSelect={onSelect} />);
    await waitFor(() => expect(screen.queryByLabelText(/Working on/)).toBeNull());
    expect(task.id).toBeTruthy();
  });

  it('lists active work and reports the selection with its label, estimate and breadcrumb', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const { task, project } = await seedWork();
    const onSelect = vi.fn();
    renderWithProviders(<WorkingOnPicker taskId={null} projectId={null} onSelect={onSelect} />);

    const select = await screen.findByLabelText('Working on (optional)');
    await screen.findByRole('option', { name: 'write the report' });
    fireEvent.change(select, { target: { value: `task:${task.id}` } });

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: task.id,
        projectId: null,
        label: 'open the outline',
        estimateMin: 20,
        hint: 'open the outline',
      }),
    );

    fireEvent.change(select, { target: { value: `project:${project.id}` } });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: project.id, taskId: null, hint: 'draft the intro' }),
    );

    fireEvent.change(select, { target: { value: '' } });
    expect(onSelect).toHaveBeenLastCalledWith({ taskId: null, projectId: null });
  });

  it('shows the breadcrumb of the selected task', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const { task } = await seedWork();
    renderWithProviders(<WorkingOnPicker taskId={task.id} projectId={null} onSelect={() => {}} />);
    expect(await screen.findByText(/Pick up here:/)).toBeInTheDocument();
    expect(screen.getByText('open the outline')).toBeInTheDocument();
  });
});

describe('SessionForm linked flow', () => {
  it('has an accessible name for every control in a linked session', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const { task } = await seedWork();
    const { container } = renderWithProviders(
      <SessionForm open onSave={vi.fn()} onCancel={vi.fn()} initialLink={{ taskId: task.id }} />,
    );

    expect(await screen.findByLabelText('Working on (optional)')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'How did it end?' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Pick up here next time/)).toBeInTheDocument();
    // The controls this part adds are named; the tripwire also keeps any future
    // linked-session control from shipping unnamed.
    const newControls = [
      screen.getByLabelText('Working on (optional)'),
      screen.getByLabelText(/Pick up here next time/),
    ];
    for (const control of newControls) expect(control).toBeInTheDocument();
    expect(container.querySelector('#working-on')).toHaveAccessibleName('Working on (optional)');
    expect(container.querySelector('#session-breadcrumb')).toHaveAccessibleName(
      /Pick up here next time/,
    );
  });

  it('prefills the label and the estimate from the launched task', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const { task } = await seedWork();
    renderWithProviders(
      <SessionForm
        open
        onSave={vi.fn()}
        onCancel={vi.fn()}
        initialLink={{ taskId: task.id, label: 'open the outline', estimateMin: 20 }}
      />,
    );

    expect(await screen.findByDisplayValue('open the outline')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('20 min')).toBeInTheDocument());
  });

  it('saves the outcome and breadcrumb for a linked task', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const { task } = await seedWork();
    const onSave = vi.fn(async (_input: SessionInput) => {});
    renderWithProviders(
      <SessionForm
        open
        onSave={onSave}
        onCancel={vi.fn()}
        initialLink={{ taskId: task.id, estimateMin: 20 }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Good' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.change(screen.getByLabelText(/Pick up here next time/), {
      target: { value: 'Pick up here next time: finish the intro' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save session/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const input = onSave.mock.calls[0]![0] as SessionInput;
    expect(input.taskId).toBe(task.id);
    expect(input.projectId).toBeNull();
    expect(input.outcome).toBe('done');
    expect(input.breadcrumb).toBe('finish the intro');
  });

  it('refuses a project session without a breadcrumb, in plain words', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const { project } = await seedWork();
    const onSave = vi.fn();
    renderWithProviders(
      <SessionForm
        open
        onSave={onSave}
        onCancel={vi.fn()}
        initialLink={{ projectId: project.id, estimateMin: 20 }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Good' }));
    fireEvent.click(screen.getByRole('button', { name: /save session/i }));

    expect(
      await screen.findByText(/Add a pick-up note for this project/),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('stays a practice session when no link is chosen', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const onSave = vi.fn();
    renderWithProviders(<SessionForm open onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: /^start$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^stop$/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Good' }));
    fireEvent.click(screen.getByRole('button', { name: /save session/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const input = onSave.mock.calls[0]![0] as SessionInput;
    expect(input.taskId).toBeUndefined();
    expect(input.projectId).toBeUndefined();
    expect(input.outcome).toBeUndefined();
  });
});

describe('save-path safety', () => {
  function deferred() {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  async function fillMinimalForm() {
    fireEvent.click(await screen.findByRole('button', { name: /^start$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^stop$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Good$/ }));
  }

  it('writes only one session when Save is double-clicked', async () => {
    const pending = deferred();
    const onSave = vi.fn(() => pending.promise);
    renderWithProviders(<SessionForm open onSave={onSave} onCancel={vi.fn()} />);
    await fillMinimalForm();

    // Submit the form directly twice: the disabled button alone is not the
    // guard we are testing (fireEvent.click on a disabled button is a no-op).
    const form = screen.getByRole('button', { name: /save session/i }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
    // Still only one, and the button is usable again afterwards.
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('allows a retry after a rejected save', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error('storage offline')).mockResolvedValueOnce(undefined);
    renderWithProviders(<SessionForm open onSave={onSave} onCancel={vi.fn()} />);
    await fillMinimalForm();

    const save = screen.getByRole('button', { name: /save session/i });
    fireEvent.click(save);
    expect(await screen.findByText('storage offline')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /save session/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
  });

  it('keeps the running timer draft when the save fails, and clears it on success', async () => {
    writeSessionTimer({
      startedAtMs: Date.now() - 5 * 60_000,
      mode: 'timed',
      durationMinutes: null,
      reps: null,
      activityLabel: 'kept draft',
      note: '',
      templateId: null,
      softCapMinutes: null,
      capPromptShown: false,
      keepGoing: false,
      taskId: null,
      projectId: null,
    });

    const onSave = vi.fn().mockRejectedValueOnce(new Error('nope')).mockResolvedValueOnce(undefined);
    renderWithProviders(<SessionForm open onSave={onSave} onCancel={vi.fn()} />);

    // The restored timer is still RUNNING (a stopped timer is cleared when it is
    // stopped, by design); enter minutes manually and rate it.
    fireEvent.change(await screen.findByLabelText('Minutes'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /^Good$/ }));
    expect(readSessionTimer()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /save session/i }));
    await screen.findByText('nope');
    expect(readSessionTimer()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /save session/i }));
    await waitFor(() => expect(readSessionTimer()).toBeNull());
  });

  it('uses the loading label while a save is in flight', async () => {
    const pending = deferred();
    const onSave = vi.fn(() => pending.promise);
    renderWithProviders(<SessionForm open onSave={onSave} onCancel={vi.fn()} />);
    await fillMinimalForm();

    fireEvent.click(screen.getByRole('button', { name: /save session/i }));
    expect(await screen.findByRole('button', { name: /saving/i })).toBeDisabled();
    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
  });
});

describe('start affordances', () => {
  it('the inbox row starts a linked session', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const task = await taskRepo.create({
      title: 'write the report',
      status: 'inbox',
      source: 'manual',
      nextAction: 'open the outline',
      estimateMin: 20,
    });
    const openForLink = vi.fn();
    renderWithProviders(
      <SessionLauncherProvider value={{ openForLink }}>
        <InboxScreen />
      </SessionLauncherProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: `Start a session for ${task.title}` }));
    expect(openForLink).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: task.id, label: 'open the outline', estimateMin: 20 }),
    );
  });

  it('process mode offers Start now after a Next action outcome', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const task = await taskRepo.create({
      title: 'write the report',
      status: 'inbox',
      source: 'manual',
      estimateMin: 20,
    });
    const openForLink = vi.fn();
    renderWithProviders(
      <SessionLauncherProvider value={{ openForLink }}>
        <ProcessMode open onClose={() => {}} />
      </SessionLauncherProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /2: Next action/i }));
    fireEvent.change(await screen.findByLabelText('The next small step'), {
      target: { value: 'write the first paragraph' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Start now' }));
    expect(openForLink).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: task.id, label: 'write the first paragraph' }),
    );
    expect(await getDb().tasks.count()).toBe(1);
  });
});
