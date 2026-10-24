/**
 * The /projects and /projects/detail routes exist only behind the `taskInbox`
 * flag. Flag off: the route sends the user home, renders nothing, and has read
 * no projects, tasks or domains. Flag on: it renders. "Flag off is inert" is
 * asserted only AFTER settings have arrived (that is when the redirect fires),
 * so a read that merely had not happened yet cannot pass.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const replace = vi.hoisted(() => vi.fn());
const params = vi.hoisted(() => ({ id: null as string | null }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'id' ? params.id : null) }),
  usePathname: () => '/projects',
}));

import ProjectsPage from '@/app/(main)/projects/page';
import ProjectDetailPage from '@/app/(main)/projects/detail/page';
import { resetDbForTesting } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';
import { projectRepo } from '@/lib/db/project.repo';
import { taskRepo } from '@/lib/db/task.repo';
import { domainRepo } from '@/lib/db/domain.repo';

function mount(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(async () => {
  cleanup();
  replace.mockClear();
  params.id = null;
  await resetDbForTesting();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each([
  ['/projects', () => <ProjectsPage />],
  ['/projects/detail', () => <ProjectDetailPage />],
])('%s', (_route, page) => {
  it('flag OFF: sends the user home, renders nothing and reads nothing', async () => {
    const project = await projectRepo.create({ title: 'Should stay unread', status: 'active' });
    params.id = project.id;
    const reads = [
      vi.spyOn(projectRepo, 'getAll'),
      vi.spyOn(taskRepo, 'getAll'),
      vi.spyOn(domainRepo, 'getAll'),
    ];
    expect((await settingsRepo.get()).flags?.taskInbox ?? false).toBe(false);

    const { container } = mount(page());
    // The redirect fires only once settings have arrived: wait for it, THEN look.
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(container.textContent).not.toContain('Should stay unread');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    for (const read of reads) expect(read).not.toHaveBeenCalled();
  });
});

describe('flag ON', () => {
  beforeEach(async () => {
    await settingsRepo.setFlag('taskInbox', true);
  });

  it('/projects renders the list and does not redirect', async () => {
    await projectRepo.create({ title: 'Write the novel', status: 'active' });
    mount(<ProjectsPage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Projects' })).toBeTruthy();
    expect(await screen.findByRole('link', { name: /Write the novel/ })).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('/projects/detail reads the project from ?id= and renders it', async () => {
    const project = await projectRepo.create({ title: 'Write the novel', status: 'active', breadcrumb: 'Start with the storm' });
    params.id = project.id;
    mount(<ProjectDetailPage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Write the novel' })).toBeTruthy();
    expect(screen.getByText('Start with the storm')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('/projects/detail with no id, or an unknown one, says so calmly', async () => {
    mount(<ProjectDetailPage />);
    expect(await screen.findByText("This project isn't here.")).toBeTruthy();
    cleanup();
    params.id = '00000000-0000-4000-8000-00000000dead';
    mount(<ProjectDetailPage />);
    expect(await screen.findByText("This project isn't here.")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});
