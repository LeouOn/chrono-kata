/**
 * The ten-minute button on the project page and the REAL session form.
 *
 * The launcher's "Working on" picker lists only ACTIVE projects. A link to any other
 * project leaves the select with a value that matches no option: it shows "No link"
 * while the form still holds the project in its state, so the person sees a plain
 * practice session. The page therefore offers the button only where the real form can
 * keep the link. These tests drive the actual form (not a stub) and assert the select's
 * VALUE after the picker's options have loaded: the option list contains every project
 * name, so a text match would prove nothing.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting } from '@/lib/db/db';
import { projectRepo } from '@/lib/db/project.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { ProjectDetail } from '@/components/projects/ProjectDetail';
import { SessionForm } from '@/components/session/SessionForm';
import { SessionLauncherProvider, type SessionLink } from '@/components/session/SessionLauncher';
import { minimumSessionLink } from '@/lib/planning/revive';
import type { ProjectStatus } from '@/lib/schemas/project';

const STATUSES: ProjectStatus[] = ['active', 'paused', 'done', 'dropped'];

beforeEach(async () => {
  cleanup();
  localStorage.clear();
  await resetDbForTesting();
  await settingsRepo.setFlag('taskInbox', true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** The real form, opened with a link, and the picker once its options have loaded. */
async function openRealForm(link: SessionLink, anOptionThatMustLoad: string) {
  render(
    <QueryClientProvider client={client()}>
      <SessionForm open onSave={vi.fn()} onCancel={vi.fn()} initialLink={link} />
    </QueryClientProvider>,
  );
  const select = (await screen.findByLabelText('Working on (optional)')) as HTMLSelectElement;
  // Data has arrived once the active project is one of the options.
  await screen.findByRole('option', { name: anOptionThatMustLoad });
  return select;
}

describe('the ten-minute session and the real session form', () => {
  it('an ACTIVE project: the form is linked, asserted on the select\'s value', async () => {
    const project = await projectRepo.create({ title: 'Write the novel', status: 'active' });
    const select = await openRealForm(minimumSessionLink(project), 'Write the novel');
    expect(select.value).toBe(`project:${project.id}`);
  });

  it('the picker lists only active projects, which is WHY the button is not offered for the others', async () => {
    const active = await projectRepo.create({ title: 'Still going', status: 'active' });
    const paused = await projectRepo.create({ title: 'Resting', status: 'paused' });
    const select = await openRealForm(minimumSessionLink(paused), active.title);
    expect(screen.queryByRole('option', { name: 'Resting' })).toBeNull();
    // The link is not shown: the select falls back to "No link". If the picker ever starts
    // listing paused projects this fails, and the button can be offered for them again.
    expect(select.value).toBe('');
  });

  for (const status of STATUSES) {
    it(`${status}: the page offers the button only if the real form keeps the link`, async () => {
      const keeper = await projectRepo.create({ title: 'Always listed', status: 'active' });
      const project = await projectRepo.create({ title: `Project ${status}`, status });

      const openForLink = vi.fn();
      render(
        <QueryClientProvider client={client()}>
          <SessionLauncherProvider value={{ openForLink }}>
            <ProjectDetail projectId={project.id} />
          </SessionLauncherProvider>
        </QueryClientProvider>,
      );
      await screen.findByRole('heading', { level: 1, name: `Project ${status}` });
      const button = screen.queryByRole('button', { name: /^Start a 10-minute session/ });

      if (!button) {
        expect(openForLink, `${status} has no button, so nothing can open an unlinked session`).not.toHaveBeenCalled();
        return;
      }
      fireEvent.click(button);
      expect(openForLink).toHaveBeenCalledTimes(1);
      const link = openForLink.mock.calls[0]![0] as SessionLink;
      cleanup();

      const select = await openRealForm(link, keeper.title);
      expect(select.value, `${status}: the form must stay linked to the project`).toBe(`project:${project.id}`);
    });
  }

  it('a paused project says calmly where it comes back, instead of offering a session it cannot link', async () => {
    const paused = await projectRepo.create({ title: 'Garden', status: 'paused' });
    render(
      <QueryClientProvider client={client()}>
        <ProjectDetail projectId={paused.id} />
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { level: 1, name: 'Garden' });
    expect(screen.getByText(/Paused for now\. “Make active again” in the weekly review brings it back\./)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /10-minute/ })).toBeNull();
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
  });
});
