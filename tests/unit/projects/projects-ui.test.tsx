/**
 * The project list and the project page (roadmap Wave 10, part 2).
 *
 * Every assertion about content is made AFTER the data has arrived (the screens
 * show "Loading..." first), against a real fake-indexeddb database. `Date` is
 * pinned so "2 days ago" cannot flake around midnight; timers are left real so
 * IndexedDB and react-query still run.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { projectRepo } from '@/lib/db/project.repo';
import { taskRepo } from '@/lib/db/task.repo';
import { sessionRepo } from '@/lib/db/session.repo';
import { DOMAIN_SEED_IDS } from '@/lib/db/seed-domains';
import { ProjectsScreen } from '@/components/projects/ProjectsScreen';
import { ProjectDetail, TIMELINE_PAGE } from '@/components/projects/ProjectDetail';
import { GUILT } from '../planning/w10-helpers';

const NOW = new Date(2026, 5, 17, 10, 0); // Wed 17 Jun 2026, 10:00 local
const at = (daysBack: number, hour = 9, minute = 0) =>
  new Date(2026, 5, 17 - daysBack, hour, minute);

beforeEach(async () => {
  cleanup();
  await resetDbForTesting();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function mount(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

async function makeProject(title: string, extra: Record<string, unknown> = {}, lastWork?: Date) {
  const project = await projectRepo.create({ title, status: 'active', ...extra });
  if (lastWork) await getDb().projects.put({ ...project, lastTouchedAt: lastWork });
  return project;
}

async function makeSession(extra: Record<string, unknown>) {
  return sessionRepo.save({
    startedAt: at(1),
    durationMinutes: 25,
    reps: null,
    rating: 3,
    ...extra,
  } as Parameters<typeof sessionRepo.save>[0]);
}

/** Every link and button has a name, and the name contains its visible text (WCAG 2.5.3). */
function expectNamedControls(root: HTMLElement) {
  const controls = [...within(root).queryAllByRole('link'), ...within(root).queryAllByRole('button')];
  for (const control of controls) {
    const visible = (control.textContent ?? '').replace(/\s+/g, ' ').trim();
    const role = control.tagName === 'A' ? 'link' : 'button';
    const named = within(root)
      .getAllByRole(role)
      .filter((candidate) => candidate === control);
    expect(named, 'control must be found by role').toHaveLength(1);
    if (visible !== '') {
      const escaped = visible.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(
        within(root).getAllByRole(role, { name: new RegExp(escaped, 'i') }),
        `"${visible}" must be inside its accessible name`,
      ).toContain(control);
    } else {
      expect(control.getAttribute('aria-label'), 'an icon-only control needs a name').toBeTruthy();
    }
  }
}

describe('ProjectsScreen', () => {
  it('says there are no projects once it has looked, and never before', async () => {
    mount(<ProjectsScreen />);
    // First paint, before the queries resolve: loading, not an empty state.
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByText('No projects yet.')).toBeNull();
    expect(await screen.findByText('No projects yet.')).toBeTruthy();
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('lists active then paused projects, most recently worked first, and leaves finished ones off', async () => {
    const busy = await makeProject('Write the novel', { cadencePerWeek: 2, cadenceBlockMin: 45 }, at(60));
    const quiet = await makeProject('Learn the cello', {}, at(40));
    const paused = await makeProject('Garden redesign', { status: 'paused' }, at(1));
    await makeProject('Taxes', { status: 'done' }, at(1));
    await makeProject('Old idea', { status: 'dropped' }, at(1));
    // Work on "busy" is recorded the way every Start button records it: on a TASK.
    const task = await taskRepo.create({ title: 'Outline act two', status: 'next', projectId: busy.id, source: 'manual' });
    await makeSession({ taskId: task.id, startedAt: at(2), durationMinutes: 10 });

    mount(<ProjectsScreen />);
    const list = await screen.findByRole('list', { name: 'Projects' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('.font-serif')?.textContent)).toEqual([
      'Write the novel',
      'Learn the cello',
      'Garden redesign',
    ]);

    const [first] = rows as [HTMLElement];
    expect(first.querySelector('a')?.getAttribute('href')).toBe(`/projects/detail?id=${busy.id}`);
    expect(first.textContent).toContain('Worked on 2 days ago'); // from the task session, not lastTouchedAt (60 days)
    expect(first.textContent).toContain('2 a week, 45 min each');
    expect(first.textContent).toContain('This week: 10 of 90 min');
    expect(first.textContent).toContain('1 next task');
    expect(rows[1]!.textContent).toContain('no rhythm set');
    expect(rows[2]!.textContent).toContain('Garden redesign Paused'); // a space between title and status
    expect(within(list).getByRole('link', { name: /Garden redesign Paused/ })).toBeTruthy();
    expect(within(list).queryByText(/Taxes|Old idea/)).toBeNull();
    expect(quiet.id).toBeTruthy();
    expect(paused.id).toBeTruthy();
  });

  it('is calm: no guilt word for a project untouched for months, every control named', async () => {
    await makeProject('Ancient plan', { cadencePerWeek: 3 }, at(200));
    const { container } = mount(<ProjectsScreen />);
    await screen.findByRole('list', { name: 'Projects' });
    expect(container.textContent).toContain('Worked on 6 months ago');
    expect(container.textContent).not.toMatch(GUILT);
    expectNamedControls(container);
    for (const link of within(container).getAllByRole('link')) expect(link.className).toContain('min-h-11');
  });
});

describe('ProjectDetail', () => {
  it('says calmly that a project is missing, once the data has loaded', async () => {
    const { container } = mount(<ProjectDetail projectId="00000000-0000-4000-8000-00000000dead" />);
    // Not "missing" until the data has arrived: the first paint is loading.
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByText("This project isn't here.")).toBeNull();
    expect(await screen.findByText("This project isn't here.")).toBeTruthy();
    expect(screen.getByRole('link', { name: 'All projects' }).getAttribute('href')).toBe('/projects');
    expectNamedControls(container);
  });

  it('shows what is next, the rhythm, the time put in, and a timeline from direct AND task sessions', async () => {
    const project = await makeProject(
      'Write the novel',
      { domainId: DOMAIN_SEED_IDS.career, cadencePerWeek: 2, cadenceBlockMin: 45, breadcrumb: 'Start act two with the storm' },
      at(30),
    );
    const other = await makeProject('Other project');
    vi.setSystemTime(at(5, 12));
    const older = await taskRepo.create({ title: 'Outline act two', nextAction: 'List the beats', status: 'next', projectId: project.id, source: 'manual' });
    vi.setSystemTime(at(1, 12));
    const newer = await taskRepo.create({ title: 'Draft the storm scene', status: 'next', projectId: project.id, source: 'manual' });
    const foreign = await taskRepo.create({ title: 'Not this one', status: 'next', projectId: other.id, source: 'manual' });
    vi.setSystemTime(NOW);

    const viaTask = await makeSession({ taskId: newer.id, startedAt: at(0, 8), durationMinutes: 40, outcome: 'progress', breadcrumb: 'Pick up at the lighthouse' });
    const direct = await makeSession({ projectId: project.id, startedAt: at(2, 14), durationMinutes: 15, outcome: 'done', breadcrumb: 'Chapter 7 is ready' });
    await makeSession({ projectId: project.id, startedAt: at(9, 20), durationMinutes: null, reps: 5, outcome: 'blocked', breadcrumb: null });
    // Older than seven days with minutes, so the all-time total differs from the last-7-days figure.
    await makeSession({ projectId: project.id, startedAt: at(12, 10), durationMinutes: 30, outcome: 'progress', breadcrumb: 'Old note' });
    await makeSession({ projectId: other.id, startedAt: at(1), durationMinutes: 99 });
    await makeSession({ taskId: foreign.id, startedAt: at(1), durationMinutes: 77 });

    const { container } = mount(<ProjectDetail projectId={project.id} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Write the novel' })).toBeTruthy();

    // Header: status, domain, last work (from today's TASK session, not lastTouchedAt 30 days ago).
    expect(container.textContent).toContain('Active · Career/Build · Worked on today');

    // What is next.
    expect(screen.getByText('Pick up here')).toBeTruthy();
    expect(screen.getByText('Start act two with the storm')).toBeTruthy();
    const nextList = screen.getByRole('list', { name: 'Next tasks' });
    expect(within(nextList).getAllByRole('listitem').map((li) => li.firstChild?.textContent)).toEqual([
      'Draft the storm scene',
      'Outline act two',
    ]); // most recently touched first, only this project's
    expect(within(nextList).getByText('List the beats')).toBeTruthy();
    expect(older.id).toBeTruthy();

    // Rhythm and time: 40 + 15 + 0 (reps-only) + 30 minutes across 4 sessions; 55 of them in the last 7 days.
    expect(screen.getByText('Rhythm: 2 a week, 45 min each')).toBeTruthy();
    expect(screen.getByText('This week: 55 of 90 min')).toBeTruthy();
    expect(screen.getByText('1h 25m across 4 sessions')).toBeTruthy();
    expect(screen.getByText('Last 7 days: 55m in 2 sessions')).toBeTruthy();

    // Timeline: grouped by local day, newest first, notes and neutral outcomes.
    const days = [...container.querySelectorAll('time')].map((t) => t.getAttribute('datetime'));
    expect(days).toEqual(['2026-06-17', '2026-06-15', '2026-06-08', '2026-06-05']);
    expect(screen.getByText('Pick up here: Pick up at the lighthouse')).toBeTruthy();
    expect(screen.getByText('Pick up here: Chapter 7 is ready')).toBeTruthy();
    expect(container.textContent).toMatch(/40m · Progress/);
    expect(container.textContent).toMatch(/15m · Done/);
    expect(container.textContent).toMatch(/5 reps · Blocked/);
    // Every session links to its own detail page, and nobody else's sessions are here.
    const opens = screen.getAllByRole('link', { name: /^Open session from / });
    expect(opens.map((a) => a.getAttribute('href'))).toEqual([
      `/sessions/detail?id=${viaTask.id}`,
      `/sessions/detail?id=${direct.id}`,
      expect.stringMatching(/^\/sessions\/detail\?id=/),
      expect.stringMatching(/^\/sessions\/detail\?id=/),
    ]);
    expect(container.textContent).not.toMatch(/99m|77m/);

    expect(container.textContent).not.toMatch(GUILT);
    expectNamedControls(container);
  });

  it('shows the note a TASK session left as "Pick up here" when the project has none of its own', async () => {
    const project = await makeProject('Write the novel');
    const task = await taskRepo.create({ title: 'Draft the storm scene', status: 'next', projectId: project.id, source: 'manual' });
    // The way real work is recorded: on the task, so project.breadcrumb stays empty.
    vi.setSystemTime(at(0, 11));
    await makeSession({ taskId: task.id, startedAt: at(0, 9), breadcrumb: 'Pick up at the lighthouse' });
    vi.setSystemTime(NOW);

    mount(<ProjectDetail projectId={project.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Write the novel' });
    expect(screen.queryByText('No note yet. The next session will leave one.')).toBeNull();
    const next = screen.getByRole('heading', { name: 'What is next' }).parentElement!;
    expect(within(next).getByText('Pick up here')).toBeTruthy();
    expect(within(next).getByText('Pick up at the lighthouse')).toBeTruthy();
  });

  it('reads calmly for a project with no note, no tasks and no sessions', async () => {
    const project = await makeProject('Brand new');
    const { container } = mount(<ProjectDetail projectId={project.id} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Brand new' })).toBeTruthy();
    expect(screen.getByText('No note yet. The next session will leave one.')).toBeTruthy();
    expect(screen.getByText('No next tasks.')).toBeTruthy();
    expect(screen.getByText('No rhythm set.')).toBeTruthy();
    expect(screen.getByText('No sessions yet.')).toBeTruthy();
    expect(screen.getByText(/Each session you spend on this project adds a line/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show earlier sessions' })).toBeNull();
    expect(container.textContent).not.toMatch(GUILT);
  });

  it('shows the history a page at a time, and the button goes away at the end', async () => {
    const project = await makeProject('Long haul');
    const total = TIMELINE_PAGE * 2 + 5;
    for (let i = 0; i < total; i += 1) {
      await makeSession({ projectId: project.id, startedAt: new Date(2026, 5, 17, 9, 0, 0, 0 - i * 1000 - i), breadcrumb: `note ${i}` });
    }
    mount(<ProjectDetail projectId={project.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Long haul' });
    const opens = () => screen.getAllByRole('link', { name: /^Open session from / });

    expect(opens()).toHaveLength(TIMELINE_PAGE);
    fireEvent.click(screen.getByRole('button', { name: 'Show earlier sessions' }));
    expect(opens()).toHaveLength(TIMELINE_PAGE * 2);
    fireEvent.click(screen.getByRole('button', { name: 'Show earlier sessions' }));
    expect(opens()).toHaveLength(total);
    expect(screen.queryByRole('button', { name: 'Show earlier sessions' })).toBeNull();
    // Newest first across the pages.
    expect(screen.getByText('Pick up here: note 0')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(`Pick up here: note ${total - 1}`)).toBeTruthy());
  });

  it('is read-only: opening a project writes nothing', async () => {
    const project = await makeProject('Look but do not touch');
    const writes = [
      vi.spyOn(projectRepo, 'update'),
      vi.spyOn(projectRepo, 'touch'),
      vi.spyOn(taskRepo, 'update'),
      vi.spyOn(sessionRepo, 'save'),
    ];
    mount(<ProjectDetail projectId={project.id} />);
    await screen.findByRole('heading', { level: 1, name: 'Look but do not touch' });
    for (const spy of writes) expect(spy).not.toHaveBeenCalled();
  });
});
