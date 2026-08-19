# chrono-kata Wave 11: Conversation Model + Chat UI + Rating Themes

> **Goal:** Replace one-shot coach comments with a full conversation thread per session. Each session detail page becomes a chat interface. Ship rating style themes (slider/emoji/dots).

## Tasks

### Task 1: Dexie tables + repositories for conversations/messages

Create `src/lib/schemas/conversation.ts` and `message.ts`:

```typescript
// conversation.ts
export const ConversationSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  rootMessageId: z.string().nullable().optional(),
  activeLeafId: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// message.ts
export const MessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  parentId: z.string().nullable().optional(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  provider: z.string().optional(),
  model: z.string().optional(),
  personality: z.enum(['zen', 'hype', 'analyst', 'buddy', 'athena']).optional(),
  tokensUsed: z.object({ prompt: z.number(), completion: z.number() }).optional(),
  latencyMs: z.number().optional(),
  isEdited: z.boolean().optional(),
  createdAt: z.date(),
  editedAt: z.date().optional(),
});
```

Add to Dexie DB (`src/lib/db/db.ts`) version 2:
```typescript
this.version(2).stores({
  sessions: 'id, startedAt, calendarEventId, conversationId',
  conversations: 'id, sessionId',
  messages: 'id, conversationId, parentId',
  // ... existing tables unchanged
});
```

Create `src/lib/db/conversation.repo.ts` and `message.repo.ts` with standard CRUD + tree helpers:
- `getBySessionId(sessionId)`, `getRootMessages(conversationId)`, `getChildren(messageId)`, `getPathToLeaf(conversationId, leafId)`

### Task 2: Session schema migration

Add `conversationId: z.string().nullable().optional()` to SessionSchema. Backward compatible — existing sessions without it parse fine.

Auto-migration in `sessionRepo.getById()`: if `conversationId` is null AND `coachComment` exists, lazily create a conversation with one assistant message containing the old comment text.

### Task 3: Conversation UI on session detail page

Redesign `src/app/(main)/sessions/[id]/page.tsx`:
- Session info header (unchanged: rating, duration, label, note)
- Below: conversation thread (chat bubbles)
  - Assistant messages: left-aligned card with personality-colored left border
  - User messages: right-aligned card with surface-2 background
  - Each assistant message shows: content + small footer with provider/model/tokens
- Input bar at bottom: `<input>` + send button
- On send: create user message → fire LLM with conversation history → stream assistant response

### Task 4: Wire conversation into useSessions

Update `generateCoachCommentSideEffect` in `useSessions.ts`:
- Instead of writing to `session.coachComment`, create a conversation (if none exists)
- Create root user message (session context via `buildCoachUserText`)
- Stream assistant response into a new message via `onToken` callback
- Update `session.conversationId` to point to the new conversation
- Also update `session.coachComment` to the latest assistant message content (for backward compat display on dashboard/sessions list)

### Task 5: Conversation history builder

Create `src/lib/llm/conversation-history.ts`:
- `buildConversationContext(conversationId, leafId)`: walks from root to leaf, collects messages, formats as `[{role, content}]` array for the LLM call
- Used by both initial coach comment AND follow-up messages

Update `generateCoachCommentStream` in llm-service to accept an optional `messages` array (conversation history) instead of just `userText`. If `messages` provided, use `chatWithTools`-style multi-turn call.

### Task 6: Rating style themes

Add `ratingStyle` to Settings (already done in previous edits — just needs the 3 picker components):

Create `src/components/session/DotsRatingPicker.tsx`:
- 5 circular dots, click to fill from left
- Number label below

Update `src/components/session/SessionForm.tsx`:
- Import all 3 pickers (SliderRatingPicker, RatingPicker [emoji], DotsRatingPicker)
- Read `settings.ratingStyle` via useSettings
- Render the appropriate one

Add rating style selector to Settings → Appearance card:
- 3 buttons: Slider / Emoji / Dots

### Task 7: Follow-up message hook

Create `src/hooks/useConversation.ts`:
- `sendMessage(conversationId, text)`: creates user message, fires LLM, streams assistant response
- `getConversation(conversationId)`: returns messages on the active path
- Uses `generateCoachCommentStream` with conversation history

### Task 8: Final verification + commit

- typecheck, tests, build all pass
- Session detail shows conversation thread
- New sessions create conversations automatically
- Old sessions (with coachComment only) auto-migrate on detail view
- Rating picker respects settings.ratingStyle
