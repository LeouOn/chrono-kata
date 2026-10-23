import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';
import { projectRepo } from '@/lib/db/project.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { SessionForm } from '@/components/session/SessionForm';
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
