import { describe, it, expect, beforeEach } from 'vitest';
import { resetDbForTesting, type ChronoKataDB } from '@/lib/db/db';
import { DexieMessageRepository } from '@/lib/db/message.repo';
import type { MessageInput } from '@/lib/schemas/message';

let db: ChronoKataDB;
let repo: DexieMessageRepository;

beforeEach(async () => {
  db = await resetDbForTesting();
  repo = new DexieMessageRepository();
});

const validInput: MessageInput = {
  conversationId: '123e4567-e89b-12d3-a456-426614174001',
  role: 'user',
  content: 'Hello!',
};

describe('DexieMessageRepository', () => {
  it('saves a message and assigns id', async () => {
    const saved = await repo.save(validInput);
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved.createdAt).toBeInstanceOf(Date);
  });

  it('getById returns the saved message', async () => {
    const saved = await repo.save(validInput);
    const fetched = await repo.getById(saved.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(saved.id);
    expect(fetched!.content).toBe('Hello!');
  });

  it('getById returns null for unknown id', async () => {
    const fetched = await repo.getById('123e4567-e89b-12d3-a456-426614174999');
    expect(fetched).toBeNull();
  });

  it('getRootMessages returns only messages with null parentId', async () => {
    const root = await repo.save(validInput);
    await repo.save({ ...validInput, parentId: root.id, role: 'assistant' });
    const roots = await repo.getRootMessages(validInput.conversationId);
    expect(roots).toHaveLength(1);
    expect(roots[0]!.id).toBe(root.id);
  });

  it('getChildren returns only direct children of a message', async () => {
    const root = await repo.save(validInput);
    const child1 = await repo.save({ ...validInput, parentId: root.id, role: 'assistant' });
    const child2 = await repo.save({ ...validInput, parentId: root.id, role: 'assistant' });
    await repo.save({ ...validInput, parentId: child1.id, role: 'user' });
    const children = await repo.getChildren(root.id);
    expect(children).toHaveLength(2);
    const childIds = children.map((c) => c.id);
    expect(childIds).toContain(child1.id);
    expect(childIds).toContain(child2.id);
  });

  it('getPathToLeaf returns path from root to leaf', async () => {
    const root = await repo.save(validInput);
    const child = await repo.save({ ...validInput, parentId: root.id, role: 'assistant' });
    const grandchild = await repo.save({ ...validInput, parentId: child.id, role: 'user' });
    const path = await repo.getPathToLeaf(validInput.conversationId, grandchild.id);
    expect(path).toHaveLength(3);
    expect(path[0]!.id).toBe(root.id);
    expect(path[1]!.id).toBe(child.id);
    expect(path[2]!.id).toBe(grandchild.id);
  });

  it('getPathToLeaf returns single-element path for root', async () => {
    const root = await repo.save(validInput);
    const path = await repo.getPathToLeaf(validInput.conversationId, root.id);
    expect(path).toHaveLength(1);
    expect(path[0]!.id).toBe(root.id);
  });

  it('getPathToLeaf returns empty array for unknown leaf', async () => {
    const path = await repo.getPathToLeaf(validInput.conversationId, '123e4567-e89b-12d3-a456-426614174999');
    expect(path).toHaveLength(0);
  });

  it('update mutates only patched fields', async () => {
    const saved = await repo.save(validInput);
    const updated = await repo.update(saved.id, { content: 'Updated!' });
    expect(updated.content).toBe('Updated!');
    expect(updated.role).toBe('user');
  });

  it('delete removes the message', async () => {
    const saved = await repo.save(validInput);
    await repo.delete(saved.id);
    const fetched = await repo.getById(saved.id);
    expect(fetched).toBeNull();
  });

  it('update throws on unknown id', async () => {
    await expect(repo.update('nonexistent', { content: 'x' })).rejects.toThrow();
  });
});
