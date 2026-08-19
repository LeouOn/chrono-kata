# chrono-kata Wave 12: Message Tree Actions & Branch Navigation

> **Goal:** Support full tree manipulation in conversation threads: branch navigation (`← N/M →`), regeneration (`↻`), inline message editing (`✏`), and subtree deletion (`🗑`).

## Tasks

### Task 1: Extend MessageRepository with tree navigation & pruning helpers (TDD)

Add to `src/lib/db/message.repo.ts`:
- `getSiblings(messageId: string): Promise<Message[]>`: Return all messages sharing the same `parentId` (or all roots if `parentId == null`), ordered by `createdAt` ascending.
- `getDeepestDescendant(messageId: string): Promise<Message>`: Follow newest child branch iteratively until a leaf message is reached.
- `deleteSubtree(messageId: string): Promise<string[]>`: Recursively find and delete the message and all descendants.

Unit tests in `tests/unit/db/message.repo.test.ts`:
- `getSiblings` returns self and sibling messages in order
- `getDeepestDescendant` traverses down through chained children to the latest leaf
- `deleteSubtree` deletes the root message and all nested child messages

### Task 2: Extend `useConversation` hook with actions & branch mapping

Update `src/hooks/useConversation.ts`:
- Expose `branchMap: Record<string, { currentIndex: number; total: number; prevSiblingId: string | null; nextSiblingId: string | null }>`
- Expose `regenerateMessage(messageId: string): Promise<void>`
- Expose `editMessage(messageId: string, newContent: string): Promise<void>`
- Expose `deleteMessage(messageId: string): Promise<void>`
- Expose `switchBranch(targetSiblingId: string): Promise<void>`

### Task 3: Enhance `ConversationThread` component

Update `src/components/session/ConversationThread.tsx`:
- Render action toolbar for assistant messages (`↻ Regen`, `✏ Edit`, `🗑 Del`, `← N/M →` branch pagination).
- Render action toolbar for user messages (`✏ Edit`, `🗑 Del`, `← N/M →` branch pagination).
- Inline editing mode: inline textarea with Cancel / Save controls and `(edited)` tag.
- Delete confirmation: confirmation prompt before pruning.
- Disable actions while `isStreaming` is active.

### Task 4: Wire session detail page

Update `src/app/(main)/sessions/[id]/page.tsx`:
- Pass action handlers (`onRegenerate`, `onEdit`, `onDelete`, `onSwitchBranch`, `branchMap`) from `useConversation` to `ConversationThread`.

### Task 5: Final verification & implementer report

- Verify all vitest tests pass (including new tree action tests).
- Verify typecheck passes (`tsc --noEmit`).
- Verify production build succeeds (`next build`).
- Create `docs/superpowers/plans/wave12-implementer-report.md`.
