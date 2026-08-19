# chrono-kata LLM Workspace Expansion Spec

> **Status:** Draft for implementation
> **Date:** 2026-07-26
> **Supersedes:** Coach comment portions of original spec §6

## 1. Vision

Transform one-shot coach comments into a full LLM conversation workspace. Each session has a conversation thread. Users can chat with their coach, branch alternative responses, edit/regenerate any message, view debug info, and switch providers mid-conversation.

Think: a practice journal where each entry has its own mini ChatGPT-style thread attached — with branching, regeneration, and debug visibility.

## 2. Data Model

### New tables

```
conversations/{id}
  id: string
  sessionId: string  // FK to Session
  rootMessageId: string | null
  activeLeafId: string | null  // currently displayed path endpoint
  createdAt: Date
  updatedAt: Date

messages/{id}
  id: string
  conversationId: string
  parentId: string | null  // null = root message
  role: 'user' | 'assistant'
  content: string
  provider?: string  // 'zai', 'openrouter', 'claude', etc.
  model?: string
  personality?: CoachPersonality
  tokensUsed?: { prompt: number; completion: number }
  latencyMs?: number
  isEdited: boolean
  createdAt: Date
  editedAt?: Date
```

### Session schema change

```typescript
// Add to SessionSchema:
conversationId: z.string().nullable().optional(),
// Remove (or deprecate): coachComment, coachPersonalityAtGeneration, failedLLM
// These become derived from the conversation's active leaf message.
```

**Migration:** existing sessions with `coachComment` get a conversation created with one assistant message containing the old comment text.

### Branch model

Messages form a tree. Each message has `parentId`. Multiple children of the same parent = branches. The conversation tracks `activeLeafId` — the currently displayed path from root to that leaf.

```
root (user: session context)
├── child A (assistant: "good session!")
│   └── child A1 (user: "tell me more")
│       └── child A1a (assistant: "...")  ← activeLeafId
└── child B (assistant: "one step back...")  // alternative branch
```

Branch navigation: `← 1/2 →` arrows on messages with siblings.

## 3. UI

### Session Detail Page (redesigned)

```
┌─────────────────────────────┐
│ ← Back    Session Detail     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ 😄 30m · meditation · 4/5   │
│ "still mind"                │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                              │
│  ┌─ Coach (Zen) ──────────┐│
│  │ One step back from     ││
│  │ five — note it, don't  ││
│  │ narrate it...           ││
│  │ ↻ Regen  ✏ Edit  🗑 Del ││
│  │ 🔧 Debug  ← 1/2 →       ││
│  └────────────────────────┘│
│                              │
│  ┌─ You ─────────────────┐  │
│  │ What should I focus on │  │
│  │ tomorrow?              │  │
│  └────────────────────────┘  │
│                              │
│  ┌─ Coach (Zen) ──────────┐│
│  │ Return without         ││
│  │ rehearsing...           ││
│  │ ↻ ✏ 🗑 🔧               ││
│  └────────────────────────┘│
│                              │
│ ┌─────────────────────────┐│
│ │ Ask a follow-up...    ➤ ││
│ └─────────────────────────┘│
└─────────────────────────────┘
```

### Message Actions

| Action | What it does |
|---|---|
| **↻ Regen** | Re-runs LLM with same parent context. Creates a NEW child (sibling branch). User can navigate between alternatives. |
| **✏ Edit** | Inline edit of message text. Sets `isEdited: true`, `editedAt: now`. |
| **🗑 Delete** | Removes message + all descendants. If active leaf is deleted, moves to nearest sibling. |
| **🔧 Debug** | Expands inline panel: provider, model, tokens (prompt/completion), latency, system prompt used, full user text sent. |
| **← N/M →** | Navigate between sibling branches. Updates `activeLeafId`. |

### Input bar

Bottom of conversation. Type → send → user message created → LLM call fires → assistant message streams in. Uses active provider + personality from settings.

### Debug panel (expandable per message)

```
🔧 Debug
  Provider: openrouter (minimax-m3)
  Tokens: 347 in / 128 out ($0.002)
  Latency: 2.3s
  System prompt: "You are a Zen-flavored practice coach..."
  User text: "2026-07-26 | 1m | testing | 4/5\n\nRespond with..."
```

## 4. Conversation Flow

### Initial coach comment (on session save)

1. Session saved to Dexie
2. Create conversation + root user message (session context)
3. Fire LLM call → assistant message streams in as child of root
4. Set `activeLeafId` to the assistant message

### Follow-up message

1. User types in input bar → send
2. Create user message as child of `activeLeafId`
3. Build context: walk from root to this user message, collect all messages on the path
4. Fire LLM call with full conversation history → assistant message streams in
5. Update `activeLeafId`

### Regenerate

1. User taps ↻ on an assistant message
2. Build context from the PARENT of the target message (all messages up to and including the parent)
3. Fire LLM call → new assistant message as ANOTHER child of the parent
4. Set `activeLeafId` to the new message
5. Old message remains as a sibling (navigable via ← →)

### Branch navigation

1. User taps ← or → on a message with siblings
2. Recompute `activeLeafId` to the selected sibling (or its deepest descendant)
3. UI re-renders the path from root to new leaf

## 5. Rating Style Themes

### Settings addition

```typescript
ratingStyle: z.enum(['slider', 'emoji', 'dots']).optional()
```

### Three RatingPicker variants

| Style | UI |
|---|---|
| `slider` | Horizontal range input (1-5) with large number readout + word label |
| `emoji` | 5 emoji buttons (😄🙂😐😕😢) — current default |
| `dots` | 5 circular dots that fill left-to-right, with number below |

`<RatingPicker>` component reads `settings.ratingStyle` and renders the appropriate variant. Default: `slider`.

### RatingStyle setting UI

In Settings → Appearance card, add a "Rating style" row with 3 buttons (Slider / Emoji / Dots).

## 6. Implementation Waves

### Wave 11: Conversation Model + Basic Chat (foundation)

- New Dexie tables: `conversations`, `messages`
- `ConversationRepository`, `MessageRepository` with interfaces
- Session schema: add `conversationId`
- Migration: existing sessions with `coachComment` get a conversation auto-created
- Session detail page: conversation thread UI with chat bubbles
- Input bar for follow-up messages
- Initial coach comment creates conversation + root + first assistant message
- Streaming still works (token-by-token into the latest message)

### Wave 12: Message Management

- Regenerate button (creates sibling branch via LLM re-call)
- Edit button (inline text editing)
- Delete button (removes message + descendants)
- Branch navigation (← N/M → arrows)
- `getPathToLeaf(conversationId)` utility for building LLM context

### Wave 13: Debug + Power Features

- Debug panel per message (tokens, latency, provider, model, raw prompt)
- Provider switching mid-conversation (override active provider for this message)
- Personality switching mid-conversation
- System prompt visibility + editing in debug panel
- Export conversation as JSON

### Wave 14: Rating Style Themes

- `ratingStyle` field in Settings schema
- Three RatingPicker variants: SliderRatingPicker, EmojiRatingPicker, DotsRatingPicker
- RatingPicker component that switches based on settings
- Settings UI for rating style selection

## 7. Backward Compatibility

- Sessions created before Wave 11 (with `coachComment` as a flat string) continue to display correctly
- On first access to session detail, if `conversationId` is null but `coachComment` exists, auto-create a conversation with one assistant message containing the old comment
- The `coachComment` field on Session is deprecated but not removed (display falls back to it if no conversation exists)
- Streak, dashboard, sessions list continue to work unchanged (they read `coachComment` for display — this is populated from the conversation's active leaf)

## 8. Performance Considerations

- Conversations are typically short (< 20 messages). No pagination needed.
- LLM context building walks the path from root to active leaf (typically < 10 messages). No optimization needed.
- Token usage is tracked per-message. Monthly total still tracked at the `llmSettings` level.
- Streaming writes to the active message's `content` field on each token. Dexie handles this efficiently for small writes.

## 9. Out of Scope (future)

- Cross-session conversation search
- Conversation templates / presets
- Export conversation to Markdown
- Conversation sharing
- Multi-user collaboration on conversations
- Tool/function calling within conversations (v1.1 LLM feature)
