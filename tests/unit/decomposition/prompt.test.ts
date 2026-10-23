import { describe, expect, it } from 'vitest';
import {
  buildDecompositionMessages,
  buildDecompositionSystemPrompt,
  buildDecompositionUserText,
  type DecompositionTaskInput,
} from '@/lib/decomposition/prompt';
import { DECOMPOSITION_FEATURE, type Decomposition } from '@/lib/decomposition/schema';

const task: DecompositionTaskInput = {
  title: 'Prepare tax documents',
  nextAction: 'find last year’s return',
  estimateMinutes: 120,
  project: { title: 'Admin', breadcrumb: 'Life > Admin' },
};

const valid: Decomposition = {
  firstAction: 'Open the folder labeled Tax 2025 and take out the envelope on top',
  firstActionMinutes: 3,
  needs: ['the envelope', 'a pen'],
  steps: [
    { title: 'Gather documents', minutes: 20 },
    { title: 'Sort into categories', minutes: 15 },
  ],
  pitfalls: ['Trying to finish everything in one sitting'],
  canSkipOrDoBadly: ['Perfect sorting — a rough pile is enough'],
};

describe('buildDecompositionUserText (payload minimization)', () => {
  it('snapshots the exact wire text and leaves notes and health data out', () => {
    // A caller passing a DB row with note/health fields must not leak them:
    // the wire text is built only from the allowed fields.
    const row = {
      ...task,
      note: 'secret task note',
      sessionNote: 'secret session note',
      energy: 2,
      checkInNote: 'secret check-in note',
      journal: 'secret journal text',
    } as DecompositionTaskInput;
    const text = buildDecompositionUserText(row);
    expect(text).not.toContain('secret');
    expect(text).toMatchInlineSnapshot(`
      "Task to decompose:
      - title: Prepare tax documents
      - next action already noted: find last year’s return
      - current estimate: 120 minutes
      - project: Admin
      - project path: Life > Admin

      Decompose this task. JSON only."
    `);
  });

  it('omits optional lines when the caller has no next action, estimate, or project', () => {
    const text = buildDecompositionUserText({ title: 'Water the plants' });
    expect(text).not.toContain('next action');
    expect(text).not.toContain('estimate');
    expect(text).not.toContain('project');
  });
});

describe('prompt modes', () => {
  it('differs between break-it-down and this-feels-heavy', () => {
    const light = buildDecompositionSystemPrompt('break-it-down');
    const heavy = buildDecompositionSystemPrompt('this-feels-heavy');
    expect(light).not.toBe(heavy);
    expect(heavy).toMatch(/shrink/i);
    expect(light).toMatch(/startable/i);
    expect(buildDecompositionMessages('this-feels-heavy', task)[0]!.content).toBe(heavy);
  });

  it('always carries the roadmap rules: one 5-minute action, steps <= 7, pitfalls, skip list', () => {
    const system = buildDecompositionSystemPrompt('break-it-down');
    expect(system).toMatch(/within 5 minutes/i);
    expect(system).toMatch(/at most 7/i);
    expect(system).toMatch(/pitfall/i);
    expect(system).toMatch(/canSkipOrDoBadly/i);
  });
});

describe('routing slot', () => {
  it('exposes the Wave 5 per-feature routing name', () => {
    expect(DECOMPOSITION_FEATURE).toBe('decomposition');
    expect(valid.firstActionMinutes).toBeLessThanOrEqual(25);
  });
});
