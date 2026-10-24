import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetDbForTesting } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';
import { confirmApply, ApplyTargetGoneError } from '@/lib/decomposition/apply';
import { DecompositionSchema } from '@/lib/decomposition/schema';
import type { Task } from '@/lib/schemas/task';

const decomposition = DecompositionSchema.parse({
  firstAction: 'Find the washer',
  firstActionMinutes: 5,
  needs: ['a wrench'],
  steps: [
    { title: 'Turn off the water', minutes: 2 },
    { title: 'Swap the washer', minutes: 10 },
  ],
  pitfalls: ['Water on'],
  canSkipOrDoBadly: ['Polish'],
});

let task: Task;

beforeEach(async () => {
  await resetDbForTesting();
  task = await taskRepo.create({ title: 'Fix the hose', nextAction: 'old next action' });
});

describe('confirmApply (atomic)', () => {
  it('writes the next action and the picked subtasks', async () => {
    await confirmApply({
      taskId: task.id,
      decomposition,
      checkedSteps: [1],
      useAsNextAction: true,
    });
    expect((await taskRepo.getById(task.id))?.nextAction).toBe('Find the washer');
    const kids = await taskRepo.children(task.id);
    expect(kids.map((k) => k.title)).toEqual(['Swap the washer']);
    expect(kids[0]?.source).toBe('ai');
  });

  it('rolls the WHOLE apply back when any write fails (one transaction)', async () => {
    const createSpy = vi.spyOn(taskRepo, 'create').mockImplementationOnce(taskRepo.create.bind(taskRepo)).mockImplementationOnce(() => {
      throw new Error('boom on the second subtask');
    });
    await expect(
      confirmApply({ taskId: task.id, decomposition, checkedSteps: [0, 1], useAsNextAction: true })
    ).rejects.toThrow('boom');
    // Nothing survived: no next-action change, no subtasks.
    expect((await taskRepo.getById(task.id))?.nextAction).toBe('old next action');
    expect(await taskRepo.children(task.id)).toHaveLength(0);
    createSpy.mockRestore();
  });

  it('writes nothing and says so when the target task is gone', async () => {
    await taskRepo.delete(task.id);
    await expect(
      confirmApply({ taskId: task.id, decomposition, checkedSteps: [0], useAsNextAction: true })
    ).rejects.toBeInstanceOf(ApplyTargetGoneError);
    expect((await taskRepo.getAll()).length).toBe(0);
  });

  it('writes nothing when the target left the inbox (done/dropped)', async () => {
    await taskRepo.setStatus(task.id, 'dropped');
    await expect(
      confirmApply({ taskId: task.id, decomposition, checkedSteps: [0], useAsNextAction: true })
    ).rejects.toBeInstanceOf(ApplyTargetGoneError);
    expect(await taskRepo.children(task.id)).toHaveLength(0);
  });

  it('leaves the old next action alone when the toggle is off', async () => {
    await confirmApply({
      taskId: task.id,
      decomposition,
      checkedSteps: [0],
      useAsNextAction: false,
    });
    expect((await taskRepo.getById(task.id))?.nextAction).toBe('old next action');
    expect(await taskRepo.children(task.id)).toHaveLength(1);
  });
});

describe('DecompositionSchema boundary alignment', () => {
  it('rejects a 250-character step title at the parse boundary (task titles cap at 200)', () => {
    const long = 'x'.repeat(250);
    expect(() =>
      DecompositionSchema.parse({
        ...decomposition,
        steps: [{ title: long, minutes: 5 }],
      })
    ).toThrow(/too_big/);
  });

  it('accepts a 200-character step title', () => {
    const edge = 'y'.repeat(200);
    expect(() =>
      DecompositionSchema.parse({
        ...decomposition,
        steps: [{ title: edge, minutes: 5 }],
      })
    ).not.toThrow();
  });
});
