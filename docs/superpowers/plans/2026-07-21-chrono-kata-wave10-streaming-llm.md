# chrono-kata Wave 10: Streaming LLM Coach Comments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Replace the polling-style "Coach is thinking…" placeholder with token-by-token streaming. Coach comments appear progressively as the LLM generates them — better UX, perceived as faster, more engaging.

**Architecture:** Add a `streamCompleteSingle` method to `LLMProvider` interface (optional, falls back to `completeSingle` if not supported). OpenAI-compatible adapter uses SSE (`stream: true`). Claude adapter uses its native streaming. Gemini adapter uses `streamGenerateContent`. The `generateCoachComment` service detects streaming support and uses it when available. The UI subscribes to a callback that updates `session.coachComment` in real-time.

**Tech Stack:** Same as Waves 1–9. Uses native `fetch` with `ReadableStream` + `TextDecoder` for SSE parsing. No new deps.

## Global Constraints

- **OS:** Windows PowerShell 5.1.
- **Project root:** `C:\Users\llama\OneDrive\proj\chrono-kata`
- **TypeScript strict:** No `as any`, no `@ts-ignore`.
- **Streaming is OPTIONAL on providers:** if an adapter doesn't implement `streamCompleteSingle`, the service falls back to `completeSingle`. No error, no broken UX.
- **Dexie writes:** Streaming updates to IndexedDB on every token would be too expensive. Write only the FINAL result. The UI updates in real-time via callback, not via Dexie liveQuery.
- **AbortController timeout:** Same 30s timeout as non-streaming. Applied to the fetch signal.
- **Commit message style:** `feat:`/`fix:`/`chore:` prefix.

---

## File Structure (Wave 10 additions)

```
src/
├── lib/llm/
│   ├── types.ts                              # MODIFY — add StreamChunk + optional streamCompleteSingle
│   ├── openai-compatible-provider.ts         # MODIFY — add streamCompleteSingle
│   ├── claude-provider.ts                    # MODIFY — add streamCompleteSingle
│   ├── gemini-provider.ts                    # MODIFY — add streamCompleteSingle
│   ├── llm-service.ts                        # MODIFY — generateCoachComment accepts onToken callback
│   └── sse-parser.ts                         # NEW — minimal SSE line parser
├── hooks/
│   └── useSessions.ts                        # MODIFY — pass onToken callback that updates optimistic session
├── components/session/
│   └── SessionCard.tsx                       # MODIFY — show streaming text (no change to interface, just receives updates via Dexie)
tests/
└── unit/llm/
    └── sse-parser.test.ts                    # NEW — SSE parsing tests
```

---

## Task 1: SSE parser utility (TDD)

**Files:**
- Create: `src/lib/llm/sse-parser.ts`
- Test: `tests/unit/llm/sse-parser.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/llm/sse-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseSSELines, extractContentFromOpenAIChunk, extractContentFromClaudeEvent, extractContentFromGeminiChunk } from '@/lib/llm/sse-parser';

describe('parseSSELines', () => {
  it('parses a single data line', () => {
    const chunks = parseSSELines('data: {"hello":1}\n\n');
    expect(chunks).toEqual(['{"hello":1}']);
  });

  it('parses multiple data lines from a buffered chunk', () => {
    const input = 'data: {"a":1}\n\ndata: {"a":2}\n\n';
    expect(parseSSELines(input)).toEqual(['{"a":1}', '{"a":2}']);
  });

  it('handles [DONE] sentinel', () => {
    expect(parseSSELines('data: [DONE]\n\n')).toEqual(['[DONE]']);
  });

  it('ignores comment lines starting with :', () => {
    expect(parseSSELines(': keepalive\n\ndata: {"x":1}\n\n')).toEqual(['{"x":1}']);
  });

  it('handles partial buffers (no complete event yet)', () => {
    expect(parseSSELines('data: {"partial"')).toEqual([]);
  });

  it('handles multi-line data fields (concatenated)', () => {
    const input = 'data: line1\ndata: line2\n\n';
    expect(parseSSELines(input)).toEqual(['line1\ndata: line2']);
  });
});

describe('extractContentFromOpenAIChunk', () => {
  it('extracts delta content', () => {
    expect(extractContentFromOpenAIChunk('{"choices":[{"delta":{"content":"Hello"}}]}')).toBe('Hello');
  });

  it('returns empty string for chunks with no content', () => {
    expect(extractContentFromOpenAIChunk('{"choices":[{"delta":{"role":"assistant"}}]}')).toBe('');
  });

  it('returns null for [DONE]', () => {
    expect(extractContentFromOpenAIChunk('[DONE]')).toBeNull();
  });

  it('returns empty string for malformed JSON', () => {
    expect(extractContentFromOpenAIChunk('not json')).toBe('');
  });
});

describe('extractContentFromClaudeEvent', () => {
  it('extracts text from content_block_delta', () => {
    const data = '{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}';
    expect(extractContentFromClaudeEvent(data)).toBe('Hi');
  });

  it('returns empty string for non-text deltas', () => {
    const data = '{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"..."}}';
    expect(extractContentFromClaudeEvent(data)).toBe('');
  });

  it('returns null for message_stop', () => {
    expect(extractContentFromClaudeEvent('{"type":"message_stop"}')).toBeNull();
  });
});

describe('extractContentFromGeminiChunk', () => {
  it('extracts text from candidates parts', () => {
    const data = '{"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}';
    expect(extractContentFromGeminiChunk(data)).toBe('Hello');
  });

  it('returns empty string for chunks with no text parts', () => {
    expect(extractContentFromGeminiChunk('{"candidates":[{"content":{"parts":[{"thought":true,"text":"..."}]}}]}')).toBe('');
  });
});
```

- [ ] **Step 2: Implement SSE parser**

Create `src/lib/llm/sse-parser.ts`:

```typescript
/**
 * Parse a buffer of SSE text into individual data payloads.
 * Returns only complete events (terminated by \n\n). Incomplete trailing
 * data is discarded (the caller should buffer it themselves if needed).
 *
 * Each event may have multiple `data:` lines — they're joined with \n.
 * Comment lines (starting with `:`) are ignored.
 */
export function parseSSELines(buffer: string): string[] {
  const results: string[] = [];
  const events = buffer.split('\n\n');
  // Last element may be incomplete (no trailing \n\n).
  events.pop();

  for (const event of events) {
    const lines = event.split('\n');
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith(':')) continue; // comment
      if (line.startsWith('data: ')) {
        dataLines.push(line.slice(6));
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5));
      }
    }
    if (dataLines.length > 0) {
      results.push(dataLines.join('\n'));
    }
  }
  return results;
}

/** Extract text content from an OpenAI streaming chunk. Returns null on [DONE]. */
export function extractContentFromOpenAIChunk(data: string): string | null {
  if (data === '[DONE]') return null;
  try {
    const parsed = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: string } }>;
    };
    return parsed.choices?.[0]?.delta?.content ?? '';
  } catch {
    return '';
  }
}

/** Extract text content from a Claude streaming event. Returns null on message_stop. */
export function extractContentFromClaudeEvent(data: string): string | null {
  try {
    const parsed = JSON.parse(data) as {
      type?: string;
      delta?: { type?: string; text?: string };
    };
    if (parsed.type === 'message_stop') return null;
    if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
      return parsed.delta.text ?? '';
    }
    return '';
  } catch {
    return '';
  }
}

/** Extract text content from a Gemini streaming chunk. */
export function extractContentFromGeminiChunk(data: string): string {
  try {
    const parsed = JSON.parse(data) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      }>;
    };
    const parts = parsed.candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) {
      if (typeof p.text === 'string' && !p.thought) {
        return p.text;
      }
    }
    return '';
  } catch {
    return '';
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- sse-parser`
Expected: 13 tests pass.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: SSE parser for streaming LLM responses + tests" }
```

---

## Task 2: Add streaming to LLM types + OpenAI-compatible adapter

**Files:**
- Modify: `src/lib/llm/types.ts`
- Modify: `src/lib/llm/openai-compatible-provider.ts`

- [ ] **Step 1: Add streaming types**

Add to `src/lib/llm/types.ts`:

```typescript
/** A single chunk from a streaming response. */
export interface StreamChunk {
  /** Text content delta, or null when stream is done. */
  content: string | null;
  /** Optional reasoning/thinking delta (kept separate). */
  thinking?: string | null;
}

/**
 * Optional streaming method. Adapters that support SSE streaming implement this;
 * others leave it undefined and callers fall back to completeSingle.
 */
export interface StreamingLLMProvider extends LLMProvider {
  streamCompleteSingle(input: {
    userText: string;
    systemPrompt: string;
    signal?: AbortSignal;
    onChunk: (chunk: StreamChunk) => void;
  }): Promise<{ promptTokens: number; completionTokens: number }>;
}
```

- [ ] **Step 2: Add streaming to OpenAI-compatible adapter**

Add this method to `OpenAICompatibleProvider` in `src/lib/llm/openai-compatible-provider.ts`:

```typescript
async streamCompleteSingle(input: {
  userText: string;
  systemPrompt: string;
  signal?: AbortSignal;
  onChunk: (chunk: StreamChunk) => void;
}): Promise<{ promptTokens: number; completionTokens: number }> {
  const url = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const body = {
    model: this.model,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userText },
    ],
    temperature: 0.7,
    stream: true,
    stream_options: { include_usage: true },
  };

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: input.signal,
    });
  } catch (e) {
    throw mapFetchError(e);
  }

  const statusError = mapResponseStatus(resp.status, resp.statusText);
  if (statusError) throw statusError;

  if (!resp.body) throw new LLMException('No response body for streaming.');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let promptTokens = 0;
  let completionTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = parseSSELines(buffer);
    // Keep the unparsed tail.
    const lastDoubleNewline = buffer.lastIndexOf('\n\n');
    if (lastDoubleNewline >= 0) {
      buffer = buffer.slice(lastDoubleNewline + 2);
    }

    for (const data of lines) {
      const content = extractContentFromOpenAIChunk(data);
      if (content === null) {
        // [DONE]
        input.onChunk({ content: null });
        continue;
      }
      if (content) {
        input.onChunk({ content });
      }
      // Try to extract usage from the chunk (some providers send it at end).
      try {
        const parsed = JSON.parse(data) as { usage?: { prompt_tokens?: number; completion_tokens?: number } };
        if (parsed.usage) {
          promptTokens = parsed.usage.prompt_tokens ?? promptTokens;
          completionTokens = parsed.usage.completion_tokens ?? completionTokens;
        }
      } catch {
        // Not JSON or no usage — fine.
      }
    }
  }

  return { promptTokens, completionTokens };
}
```

Add the necessary imports at the top of the file:
```typescript
import type { StreamChunk } from './types';
import { parseSSELines, extractContentFromOpenAIChunk } from './sse-parser';
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: streaming support in LLM types + OpenAI-compatible adapter" }
```

---

## Task 3: Add streaming to Claude + Gemini adapters

**Files:**
- Modify: `src/lib/llm/claude-provider.ts`
- Modify: `src/lib/llm/gemini-provider.ts`

- [ ] **Step 1: Claude streaming**

Add to `ClaudeProvider`:

```typescript
async streamCompleteSingle(input: {
  userText: string;
  systemPrompt: string;
  signal?: AbortSignal;
  onChunk: (chunk: StreamChunk) => void;
}): Promise<{ promptTokens: number; completionTokens: number }> {
  const url = `${this.baseUrl.replace(/\/$/, '')}/messages`;
  const body = {
    model: this.model,
    max_tokens: 800,
    system: input.systemPrompt,
    messages: [{ role: 'user', content: input.userText }],
    stream: true,
  };

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: input.signal,
    });
  } catch (e) {
    throw mapFetchError(e);
  }

  const statusError = mapResponseStatus(resp.status, resp.statusText);
  if (statusError) throw statusError;

  if (!resp.body) throw new LLMException('No response body for streaming.');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let promptTokens = 0;
  let completionTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = parseSSELines(buffer);
    const lastDoubleNewline = buffer.lastIndexOf('\n\n');
    if (lastDoubleNewline >= 0) {
      buffer = buffer.slice(lastDoubleNewline + 2);
    }

    for (const data of lines) {
      const content = extractContentFromClaudeEvent(data);
      if (content === null) {
        input.onChunk({ content: null });
        continue;
      }
      if (content) {
        input.onChunk({ content });
      }
      // Extract usage from message_delta events.
      try {
        const parsed = JSON.parse(data) as {
          type?: string;
          usage?: { input_tokens?: number; output_tokens?: number };
          message?: { usage?: { input_tokens?: number; output_tokens?: number } };
        };
        if (parsed.type === 'message_start' && parsed.message?.usage) {
          promptTokens = parsed.message.usage.input_tokens ?? 0;
        }
        if (parsed.type === 'message_delta' && parsed.usage) {
          completionTokens = parsed.usage.output_tokens ?? 0;
        }
      } catch {
        // Fine.
      }
    }
  }

  return { promptTokens, completionTokens };
}
```

Add imports:
```typescript
import type { StreamChunk } from './types';
import { parseSSELines, extractContentFromClaudeEvent } from './sse-parser';
```

- [ ] **Step 2: Gemini streaming**

Add to `GeminiProvider`:

```typescript
async streamCompleteSingle(input: {
  userText: string;
  systemPrompt: string;
  signal?: AbortSignal;
  onChunk: (chunk: StreamChunk) => void;
}): Promise<{ promptTokens: number; completionTokens: number }> {
  const url =
    `${this.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(this.model)}` +
    `:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey)}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: input.userText }] }],
    systemInstruction: { parts: [{ text: input.systemPrompt }] },
    generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
  };

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: input.signal,
    });
  } catch (e) {
    throw mapFetchError(e);
  }

  const statusError = mapResponseStatus(resp.status, resp.statusText);
  if (statusError) throw statusError;

  if (!resp.body) throw new LLMException('No response body for streaming.');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let promptTokens = 0;
  let completionTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = parseSSELines(buffer);
    const lastDoubleNewline = buffer.lastIndexOf('\n\n');
    if (lastDoubleNewline >= 0) {
      buffer = buffer.slice(lastDoubleNewline + 2);
    }

    for (const data of lines) {
      const content = extractContentFromGeminiChunk(data);
      if (content) {
        input.onChunk({ content });
      }
      // Extract usage from last chunk.
      try {
        const parsed = JSON.parse(data) as {
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        };
        if (parsed.usageMetadata) {
          promptTokens = parsed.usageMetadata.promptTokenCount ?? promptTokens;
          completionTokens = parsed.usageMetadata.candidatesTokenCount ?? completionTokens;
        }
      } catch {
        // Fine.
      }
    }
  }

  input.onChunk({ content: null });
  return { promptTokens, completionTokens };
}
```

Add imports:
```typescript
import type { StreamChunk } from './types';
import { parseSSELines, extractContentFromGeminiChunk } from './sse-parser';
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: streaming support in Claude + Gemini adapters" }
```

---

## Task 4: Wire streaming into llm-service + useSessions

**Files:**
- Modify: `src/lib/llm/llm-service.ts`
- Modify: `src/hooks/useSessions.ts`

- [ ] **Step 1: Add streaming path to llm-service**

Add a new exported function `generateCoachCommentStream` to `src/lib/llm/llm-service.ts`:

```typescript
import type { StreamChunk, StreamingLLMProvider } from './types';

export interface GenerateCoachCommentStreamInput extends CoachCommentInput {
  onToken: (token: string) => void;
}

export async function generateCoachCommentStream(
  input: GenerateCoachCommentStreamInput,
): Promise<GenerateCoachCommentResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new LLMException('Offline — coach skipped.', LLMExceptionKind.Offline);
  }

  const config = resolveActiveProvider(input.llmSettings);
  const provider = createLLMProvider(config);

  // Check if provider supports streaming.
  if ('streamCompleteSingle' in provider && typeof (provider as StreamingLLMProvider).streamCompleteSingle === 'function') {
    const streamingProvider = provider as StreamingLLMProvider;
    const systemPrompt = personalizeSystemPrompt(
      getCoachSystemPrompt(input.personality),
      input.displayName,
    );

    let fullText = '';
    const usage = await streamingProvider.streamCompleteSingle({
      userText: buildCoachUserText(input.currentSession, input.recentSessions),
      systemPrompt,
      signal: withTimeout(input.signal),
      onChunk: (chunk: StreamChunk) => {
        if (chunk.content) {
          fullText += chunk.content;
          input.onToken(chunk.content);
        }
      },
    });

    if (!fullText.trim()) {
      throw new LLMException('Provider returned empty streaming response.');
    }

    fullText = fullText.trim().replace(/^["']|["']$/g, '');

    return {
      comment: fullText,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      personalityUsed: input.personality,
    };
  }

  // Fallback: non-streaming.
  const result = await generateCoachComment(input);
  input.onToken(result.comment); // emit the full text at once
  return result;
}
```

- [ ] **Step 2: Wire streaming into useSessions**

Modify `src/hooks/useSessions.ts`:

Replace the existing `generateCoachCommentSideEffect` function. Add the import:
```typescript
import { generateCoachCommentStream } from '@/lib/llm/llm-service';
```

Replace the body of `generateCoachCommentSideEffect` to use streaming:

```typescript
async function generateCoachCommentSideEffect(session: Session): Promise<void> {
  try {
    const [llmSettings, appSettings, recent] = await Promise.all([
      llmSettingsRepo.get(),
      settingsRepo.get(),
      sessionRepo.getAll(),
    ]);

    if (Object.keys(llmSettings.providers).length === 0) {
      return;
    }

    let accumulated = '';
    const result = await generateCoachCommentStream({
      currentSession: session,
      recentSessions: recent.filter((s) => s.id !== session.id).slice(0, 5),
      personality: appSettings.selectedCoachPersonality,
      displayName: appSettings.displayName,
      llmSettings,
      onToken: (token) => {
        accumulated += token;
        // Optimistic update: write the partial comment to IndexedDB
        // so the UI (via Dexie liveQuery or React Query refetch) shows progress.
        void sessionRepo.update(session.id, { coachComment: accumulated });
      },
    });

    // Final write with the complete comment.
    await sessionRepo.update(session.id, {
      coachComment: result.comment,
      coachPersonalityAtGeneration: result.personalityUsed,
      failedLLM: false,
    });
    await llmSettingsRepo.incrementTokenUsage(result.promptTokens, result.completionTokens);
  } catch (e) {
    let errorMessage: string | undefined;
    if (e instanceof LLMException) {
      errorMessage = e.message;
      if (e.kind === LLMExceptionKind.Offline) return;
    } else {
      errorMessage = e instanceof Error ? e.message : String(e);
    }
    console.warn('Coach comment generation failed:', errorMessage);
    dispatchToast(errorMessage, 'error');
    await sessionRepo.update(session.id, { failedLLM: true, coachComment: null });
  }
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: stream coach comments token-by-token into the UI" }
```

---

## Task 5: Final Wave 10 verification

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: 136 prior + 13 new SSE parser tests = 149 tests pass.

- [ ] **Step 2: Run typecheck + build**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit any final tweaks**

```powershell
git status; if ($?) { git add .; if ($?) { git commit -m "chore: wave 10 final verification" } }
```

---

## Wave 10 Definition of Done

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` — 149+ tests pass
- [ ] `npm run build` succeeds
- [ ] SSE parser handles OpenAI/Claude/Gemini formats
- [ ] All 3 adapters implement `streamCompleteSingle`
- [ ] `generateCoachCommentStream` uses streaming when available, falls back to non-streaming
- [ ] `useSessions` passes an `onToken` callback that writes partial text to IndexedDB
- [ ] SessionCard shows progressively growing text (via existing Dexie liveQuery)
- [ ] Offline fast-fail still works (no 30s wait)
- [ ] 30s timeout still enforced via `withTimeout`
- [ ] No `as any`, no `@ts-ignore`, no `@ts-expect-error` in source