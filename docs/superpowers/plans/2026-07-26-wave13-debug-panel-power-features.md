# chrono-kata Wave 13: Debug Panel & Power Features

> **Goal:** Equip conversation threads with deep observability (🔧 Debug Inspector showing latency, token counts, system prompt, and model info), mid-chat personality and provider overrides, and conversation export to Markdown/JSON.

## Tasks

### Task 1: Message schema additions & LLM metadata instrumentation
- Add optional `systemPrompt?: string` and `rawPrompt?: string` to `MessageSchema` in `src/lib/schemas/message.ts`.
- Update `generateConversationReply`, `generateCoachCommentStream`, and `generateCoachComment` in `src/lib/llm/llm-service.ts` to:
  - Measure execution `latencyMs`.
  - Accept optional `providerOverride?: string` and `personality?: CoachPersonality`.
  - Return `latencyMs`, `systemPrompt`, `providerName`, `model`.
- Update `src/hooks/useConversation.ts` and `src/hooks/useSessions.ts` to record all LLM metadata (`tokensUsed`, `latencyMs`, `provider`, `model`, `personality`, `systemPrompt`) into message records in Dexie and increment global token tracking.

### Task 2: Conversation Export Utilities (TDD)
- Create `src/lib/utils/conversation-export.ts`:
  - `exportConversationAsJson(session: Session, conversation: Conversation, messages: Message[]): string`
  - `exportConversationAsMarkdown(session: Session, conversation: Conversation, messages: Message[]): string`
  - `downloadFile(content: string, filename: string, mimeType: string): void`
  - `copyToClipboard(text: string): Promise<boolean>`
- Unit tests in `tests/unit/conversation/export.test.ts`.

### Task 3: Collapsible Debug Inspector in ConversationThread
- Add `🔧` action button to `MessageBubble` in `src/components/session/ConversationThread.tsx`.
- Collapsible debug card per message rendering:
  - Provider, Model, Coach Personality
  - Token Breakdown (Prompt / Completion / Total)
  - Latency (in seconds / ms)
  - Full System Prompt formatted in a clean mono box
  - Timestamps & ID details

### Task 4: Mid-Chat Personality & Provider Overrides
- Update `FollowUpInput.tsx`:
  - Add collapsible controls drawer or pills for selecting:
    - Coach Personality (Zen, Hype, Analyst, Buddy, Athena)
    - LLM Provider (from active configured providers in `LLMSettings`)
  - Pass overrides to `sendMessage(text, { personalityOverride, providerOverride })` and `regenerateMessage(messageId, { personalityOverride, providerOverride })`.

### Task 5: Export UI on Session Detail Page
- Add Export button with dropdown/menu in session detail page allowing:
  - Export as Markdown (.md)
  - Export as JSON (.json)
  - Copy Markdown to Clipboard (with toast confirmation)

### Task 6: Verification & Wave 13 Report
- Run all unit & integration tests (`vitest run`).
- Run strict typecheck (`tsc --noEmit`).
- Run Next.js production build (`next build`).
- Create `docs/superpowers/plans/wave13-implementer-report.md`.
