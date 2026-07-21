# chrono-kata Wave 3: LLM Stack — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the full LLM integration. Port dharma-vicaya's provider abstraction (3 adapters, 11 presets, factory, error mapper) to TypeScript. After each session save, the active coach personality generates a contextual comment (2–4 sentences) using the user's configured LLM provider. Add a Weekly Reflection feature and a Smart Label suggestion button. Build the LLM settings UI for managing 11 provider presets + API keys + active provider.

**Architecture:** All LLM calls happen client-side via `fetch` (per spec §6). Adapters implement a common `LLMProvider` interface with `completeSingle()` method (chatWithTools interface is included but unused in v1 per spec scope). Coach comments fire asynchronously after session save; UI shows "Coach is thinking…" placeholder until the response lands. Token usage tracked per-month in `llmSettings`.

**Tech Stack:** Same as Waves 1–2. No new deps (use native `fetch` + `AbortController`).

## Global Constraints

- **OS:** Windows PowerShell 5.1.
- **Project root:** `C:\Users\llama\OneDrive\proj\chrono-kata`
- **TypeScript strict:** No `as any`, no `@ts-ignore`, ever.
- **HTTP:** Native `fetch` + `AbortController`. 10s connect timeout, 30s total timeout. NO axios, NO SDKs.
- **API key storage:** IndexedDB `llmSettings` table (already exists from Wave 1).
- **11 provider presets** (from spec §6, including GPT 5.6 feedback): openai, deepseek, deepseek-pro, openrouter, zai (model glm-5.2), minimax, nemotron, ollama, gemini, claude. (Note: `nemotron` is NVIDIA NIM — OpenAI-compatible at `integrate.api.nvidia.com`.)
- **Offline fast-fail:** if `navigator.onLine === false`, skip LLM call immediately, mark `failedLLM = true`, no 30s timeout.
- **Token budget per coach comment:** system prompt (~150–600 tokens depending on personality) + current session (~80 tokens) + last 5 sessions as compact summary (~40 tokens each, hard cap 200 tokens history).
- **Commit message style:** `feat:`/`fix:`/`chore:`/`test:`/`docs:` prefix.
- **No streaming** (per spec). Wait for full response, then write.
- **`motion/react`** is the correct import for motion v11+ (established in Wave 1).

---

## File Structure (Wave 3 additions)

```
src/
├── lib/
│   ├── llm/
│   │   ├── types.ts                          # NEW — LLMProvider interface, ChatResponse, StopReason, LLMException
│   │   ├── provider-config.ts                # NEW — ProviderConfig type
│   │   ├── provider-defaults.ts              # NEW — 11 provider presets table
│   │   ├── provider-factory.ts               # NEW — createLLMProvider(config)
│   │   ├── openai-compatible-provider.ts     # NEW — handles 8 of 11 providers
│   │   ├── claude-provider.ts                # NEW — Anthropic
│   │   ├── gemini-provider.ts                # NEW — Google Gemini
│   │   ├── error-mapper.ts                   # NEW — fetch error → LLMException
│   │   ├── llm-service.ts                    # NEW — high-level: generateCoachComment, generateWeeklyReflection, suggestLabel
│   │   └── prompt-builders.ts                # NEW — builds session context summary (token-budgeted)
│   └── db/
│       └── llm-settings.repo.ts              # MODIFY — add token-usage increment method
├── hooks/
│   ├── useSessions.ts                        # MODIFY — fire coach comment generation after save
│   ├── useLLMSettings.ts                     # NEW — provider CRUD + token usage
│   └── useReflections.ts                     # NEW — list + create reflections
├── components/
│   ├── coach/
│   │   └── CoachBadge.tsx                    # NEW — small colored dot per personality
│   ├── llm/
│   │   ├── ProviderList.tsx                  # NEW — list of 11 presets with status
│   │   ├── ProviderEditor.tsx                # NEW — edit apiKey/model/baseUrl
│   │   └── TokenMeter.tsx                    # NEW — monthly usage display
│   └── reflection/
│       └── ReflectionCard.tsx                # NEW — list item
└── tests/
    └── unit/
        └── llm/
            ├── openai-compatible-provider.test.ts    # NEW — wire-format + parsing
            ├── claude-provider.test.ts                # NEW
            ├── gemini-provider.test.ts                # NEW
            ├── error-mapper.test.ts                   # NEW
            ├── provider-factory.test.ts               # NEW
            └── prompt-builders.test.ts                # NEW
```

---

## Task 1: LLM types + provider config + 11 defaults

**Files:**
- Create: `src/lib/llm/types.ts`, `src/lib/llm/provider-config.ts`, `src/lib/llm/provider-defaults.ts`

**Interfaces:**
- Produces: `LLMProvider` interface, `ChatResponse`, `StopReason`, `LLMException`, `LLMExceptionKind`, `ProviderConfig`, `PROVIDER_DEFAULTS` (11 entries), `PROVIDER_NAMES`.

- [ ] **Step 1: LLM types**

Create `src/lib/llm/types.ts`:

```typescript
/**
 * Why a model stopped generating, in provider-agnostic terms.
 * Adapters translate their native signal into one of these values.
 */
export enum StopReason {
  /** Finished naturally — produced a final text answer. */
  EndTurn = 'endTurn',
  /** Hit the configured max-token output limit. */
  MaxTokens = 'maxTokens',
  /** Provider reported an error (auth, rate-limit, content filter, etc.). */
  Error = 'error',
}

export interface ChatResponse {
  /** Text the model produced, or null on error/tool-only turns. */
  content: string | null;
  /** Why the model stopped. */
  stopReason: StopReason;
  /** Optional reasoning/"thinking" content (kept separate from content). */
  thinking?: string | null;
  /** Token usage from the response, if reported. */
  usage?: { promptTokens: number; completionTokens: number } | null;
}

export enum LLMExceptionKind {
  AuthFailed = 'authFailed',    // HTTP 401/403
  RateLimited = 'rateLimited',  // HTTP 429
  Timeout = 'timeout',          // network timeout
  Offline = 'offline',          // navigator.onLine === false
  Provider = 'provider',        // other provider-side failure
  Unknown = 'unknown',
}

export class LLMException extends Error {
  readonly kind: LLMExceptionKind;
  constructor(message: string, kind: LLMExceptionKind = LLMExceptionKind.Unknown) {
    super(message);
    this.name = 'LLMException';
    this.kind = kind;
  }
}

/**
 * Provider-agnostic LLM adapter interface.
 * v1 only uses completeSingle; chatWithTools is included per spec §6 for v1.1.
 */
export interface LLMProvider {
  /**
   * Single-turn text completion. Builds a one-message history from userText,
   * sends to the provider with the system prompt, returns the parsed response.
   */
  completeSingle(input: {
    userText: string;
    systemPrompt: string;
    signal?: AbortSignal;
  }): Promise<ChatResponse>;
}
```

- [ ] **Step 2: ProviderConfig + defaults**

Create `src/lib/llm/provider-config.ts`:

```typescript
export interface ProviderConfig {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}
```

Create `src/lib/llm/provider-defaults.ts`:

```typescript
/**
 * 11 provider presets. Provider names are the registry keys used throughout
 * the app. Model strings are the values as of 2026-07-21 — verify against
 * provider docs when implementing; users can override in the LLM settings UI.
 *
 * 8 of 11 use the OpenAI-compatible wire format; claude and gemini have
 * their own adapter classes.
 */
export const PROVIDER_DEFAULTS = {
  openai:       { baseUrl: 'https://api.openai.com/v1',                          model: 'gpt-4o' },
  deepseek:     { baseUrl: 'https://api.deepseek.com',                           model: 'deepseek-v4-flash' },
  'deepseek-pro': { baseUrl: 'https://api.deepseek.com',                         model: 'deepseek-v4-pro' },
  openrouter:   { baseUrl: 'https://openrouter.ai/api/v1',                       model: 'anthropic/claude-sonnet-latest' },
  zai:          { baseUrl: 'https://open.bigmodel.cn/api/paas/v4',               model: 'glm-5.2' },
  minimax:      { baseUrl: 'https://api.minimax.chat/v1',                        model: 'minimax-m3' },
  nemotron:     { baseUrl: 'https://integrate.api.nvidia.com/v1',                model: 'nvidia/llama-3.1-nemotron-ultra-253b-v1' },
  ollama:       { baseUrl: 'http://localhost:11434/v1',                          model: 'llama3.3' },
  gemini:       { baseUrl: 'https://generativelanguage.googleapis.com/v1beta',   model: 'gemini-2.0-flash' },
  claude:       { baseUrl: 'https://api.anthropic.com/v1',                       model: 'claude-sonnet-4-20250514' },
} as const;

export type ProviderName = keyof typeof PROVIDER_DEFAULTS;

export const PROVIDER_NAMES = Object.keys(PROVIDER_DEFAULTS) as ProviderName[];

/** Which adapter class handles this provider. */
export function adapterFor(name: string): 'openai-compatible' | 'claude' | 'gemini' {
  if (name === 'claude') return 'claude';
  if (name === 'gemini') return 'gemini';
  return 'openai-compatible';
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: LLM types + ProviderConfig + 11 provider presets" }
```

---

## Task 2: Error mapper

**Files:**
- Create: `src/lib/llm/error-mapper.ts`
- Test: `tests/unit/llm/error-mapper.test.ts`

**Interfaces:**
- Produces: `mapFetchError(e, opts): LLMException` covering network errors, HTTP status, offline fast-fail.

- [ ] **Step 1: Write failing test**

Create `tests/unit/llm/error-mapper.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mapFetchError, mapResponseStatus } from '@/lib/llm/error-mapper';
import { LLMExceptionKind } from '@/lib/llm/types';

describe('mapResponseStatus', () => {
  it('401 → authFailed', () => {
    const e = mapResponseStatus(401, 'Unauthorized');
    expect(e.kind).toBe(LLMExceptionKind.AuthFailed);
    expect(e.message).toMatch(/Authentication failed/i);
  });

  it('403 → authFailed', () => {
    expect(mapResponseStatus(403, 'Forbidden').kind).toBe(LLMExceptionKind.AuthFailed);
  });

  it('429 → rateLimited', () => {
    expect(mapResponseStatus(429, 'Too Many Requests').kind).toBe(LLMExceptionKind.RateLimited);
  });

  it('500 → provider', () => {
    expect(mapResponseStatus(500, 'Internal').kind).toBe(LLMExceptionKind.Provider);
  });

  it('200 → no throw (returns null)', () => {
    expect(mapResponseStatus(200, '')).toBeNull();
  });
});

describe('mapFetchError', () => {
  it('AbortError (timeout) → Timeout kind', () => {
    const e = new DOMException('Aborted', 'AbortError');
    const mapped = mapFetchError(e);
    expect(mapped.kind).toBe(LLMExceptionKind.Timeout);
  });

  it('TypeError (network) → Provider kind with friendly message', () => {
    const e = new TypeError('Failed to fetch');
    const mapped = mapFetchError(e);
    expect(mapped.kind).toBe(LLMExceptionKind.Provider);
    expect(mapped.message).toMatch(/network|connection/i);
  });

  it('unknown error → Unknown kind', () => {
    const e = new Error('something else');
    const mapped = mapFetchError(e);
    expect(mapped.kind).toBe(LLMExceptionKind.Unknown);
  });

  it('passes through LLMException unchanged', () => {
    const original = mapResponseStatus(401, 'no');
    const mapped = mapFetchError(original);
    expect(mapped).toBe(original);
  });
});
```

- [ ] **Step 2: Implement error mapper**

Create `src/lib/llm/error-mapper.ts`:

```typescript
import { LLMException, LLMExceptionKind } from './types';

/**
 * Map an HTTP status code to a typed LLMException, or return null if the
 * status represents success (2xx).
 */
export function mapResponseStatus(status: number, statusText: string): LLMException | null {
  if (status >= 200 && status < 300) return null;
  if (status === 401 || status === 403) {
    return new LLMException(
      'Authentication failed. Check your API key in LLM settings.',
      LLMExceptionKind.AuthFailed
    );
  }
  if (status === 429) {
    return new LLMException(
      'Rate limit exceeded. Try again in a moment.',
      LLMExceptionKind.RateLimited
    );
  }
  return new LLMException(
    `Provider error (${status}${statusText ? ' ' + statusText : ''}).`,
    LLMExceptionKind.Provider
  );
}

/**
 * Map any caught error from a fetch call into a typed LLMException.
 * LLMException instances pass through unchanged.
 */
export function mapFetchError(e: unknown): LLMException {
  if (e instanceof LLMException) return e;
  if (e instanceof DOMException && e.name === 'AbortError') {
    return new LLMException(
      'Connection timed out. Check your network.',
      LLMExceptionKind.Timeout
    );
  }
  if (e instanceof TypeError) {
    // Native fetch throws TypeError on network failure (DNS, CORS, offline).
    return new LLMException(
      'Network error — check your connection.',
      LLMExceptionKind.Provider
    );
  }
  const msg = e instanceof Error ? e.message : String(e);
  return new LLMException(msg, LLMExceptionKind.Unknown);
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- error-mapper`
Expected: 8 tests pass.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: LLM error mapper with tests" }
```

---

## Task 3: OpenAI-compatible adapter (8 providers) + tests

**Files:**
- Create: `src/lib/llm/openai-compatible-provider.ts`
- Test: `tests/unit/llm/openai-compatible-provider.test.ts`

**Interfaces:**
- Produces: `OpenAICompatibleProvider implements LLMProvider`. Used for 8 of 11 providers (openai, deepseek, deepseek-pro, openrouter, zai, minimax, nemotron, ollama).

- [ ] **Step 1: Write failing test**

Create `tests/unit/llm/openai-compatible-provider.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleProvider } from '@/lib/llm/openai-compatible-provider';
import { LLMExceptionKind } from '@/lib/llm/types';

describe('OpenAICompatibleProvider', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends POST to {baseUrl}/chat/completions with Bearer auth + correct body', async () => {
    let capturedBody: any = null;
    let capturedInit: any = null;
    (global.fetch as any).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Hello back' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    global.fetch = vi.fn(async (url: any, init: any) => {
      capturedBody = JSON.parse(init.body);
      capturedInit = init;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Hello back' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        { status: 200 }
      );
    });

    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o',
    });

    const result = await provider.completeSingle({
      userText: 'Hello',
      systemPrompt: 'You are a test bot.',
    });

    expect(capturedInit.method).toBe('POST');
    expect(capturedInit.headers['Authorization']).toBe('Bearer sk-test');
    expect(capturedInit.headers['Content-Type']).toBe('application/json');
    expect(capturedBody.model).toBe('gpt-4o');
    expect(capturedBody.messages).toEqual([
      { role: 'system', content: 'You are a test bot.' },
      { role: 'user', content: 'Hello' },
    ]);
    expect(capturedBody.temperature).toBe(0.7);
    expect(result.content).toBe('Hello back');
    expect(result.usage?.promptTokens).toBe(10);
    expect(result.usage?.completionTokens).toBe(5);
  });

  it('throws authFailed on 401', async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'bad key' }), { status: 401 })
    );
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'bad',
      model: 'gpt-4o',
    });
    await expect(
      provider.completeSingle({ userText: 'hi', systemPrompt: 'sys' })
    ).rejects.toMatchObject({ kind: LLMExceptionKind.AuthFailed });
  });

  it('throws rateLimited on 429', async () => {
    global.fetch = vi.fn(async () => new Response('', { status: 429 }));
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'x',
      model: 'gpt-4o',
    });
    await expect(
      provider.completeSingle({ userText: 'hi', systemPrompt: 'sys' })
    ).rejects.toMatchObject({ kind: LLMExceptionKind.RateLimited });
  });

  it('handles reasoning_content (DeepSeek / GLM)', async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: 'visible answer', reasoning_content: '<thinking>' } },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 8 },
        }),
        { status: 200 }
      )
    );
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'x',
      model: 'deepseek-v4-flash',
    });
    const result = await provider.completeSingle({
      userText: 'q',
      systemPrompt: 's',
    });
    expect(result.content).toBe('visible answer');
    expect(result.thinking).toBe('<thinking>');
  });

  it('throws when response has no content', async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: '' } }], usage: { prompt_tokens: 0, completion_tokens: 0 } }),
        { status: 200 }
      )
    );
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'x',
      model: 'gpt-4o',
    });
    await expect(
      provider.completeSingle({ userText: 'q', systemPrompt: 's' })
    ).rejects.toThrow(/no text/i);
  });
});
```

- [ ] **Step 2: Implement OpenAI-compatible adapter**

Create `src/lib/llm/openai-compatible-provider.ts`:

```typescript
import type { ChatResponse, LLMProvider } from './types';
import { LLMException } from './types';
import { mapFetchError, mapResponseStatus } from './error-mapper';
import type { ProviderConfig } from './provider-config';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIResponse {
  choices?: Array<{
    message?: { content?: string; reasoning_content?: string };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Adapter for OpenAI-compatible providers: openai, deepseek, deepseek-pro,
 * openrouter, zai (GLM), minimax, nemotron (NVIDIA NIM), ollama.
 *
 * Wire format: POST {baseUrl}/chat/completions
 * Auth: Authorization: Bearer {apiKey}
 */
export class OpenAICompatibleProvider implements LLMProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: ProviderConfig) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async completeSingle(input: {
    userText: string;
    systemPrompt: string;
    signal?: AbortSignal;
  }): Promise<ChatResponse> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userText },
      ] satisfies OpenAIMessage[],
      temperature: 0.7,
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

    let json: OpenAIResponse;
    try {
      json = (await resp.json()) as OpenAIResponse;
    } catch (e) {
      throw new LLMException(
        `Failed to parse provider response: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const message = json.choices?.[0]?.message;
    const content = message?.content;
    const thinking = message?.reasoning_content;

    let text: string;
    if (content && content.trim()) {
      text = content;
    } else if (thinking && thinking.trim()) {
      text = thinking;
    } else {
      throw new LLMException('Response had no text.');
    }

    // Strip wrapping quotes if present.
    text = text.trim().replace(/^["']|["']$/g, '');

    return {
      content: text,
      stopReason: 'endTurn' as const,
      thinking: thinking && thinking.trim() ? thinking : null,
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
      },
    };
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- openai-compatible`
Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: OpenAI-compatible adapter + tests" }
```

---

## Task 4: Claude + Gemini adapters + factory + tests

**Files:**
- Create: `src/lib/llm/claude-provider.ts`, `src/lib/llm/gemini-provider.ts`, `src/lib/llm/provider-factory.ts`
- Test: `tests/unit/llm/claude-provider.test.ts`, `tests/unit/llm/gemini-provider.test.ts`, `tests/unit/llm/provider-factory.test.ts`

**Interfaces:**
- Produces: `ClaudeProvider`, `GeminiProvider`, `createLLMProvider(config)` factory.

- [ ] **Step 1: Claude adapter test**

Create `tests/unit/llm/claude-provider.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeProvider } from '@/lib/llm/claude-provider';
import { LLMExceptionKind } from '@/lib/llm/types';

describe('ClaudeProvider', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends POST to {baseUrl}/messages with x-api-key header + correct body', async () => {
    let capturedBody: any = null;
    let capturedInit: any = null;
    global.fetch = vi.fn(async (url: any, init: any) => {
      capturedBody = JSON.parse(init.body);
      capturedInit = init;
      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'Hello from Claude' }],
          usage: { input_tokens: 12, output_tokens: 6 },
        }),
        { status: 200 }
      );
    });

    const provider = new ClaudeProvider({
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-4-20250514',
    });

    const result = await provider.completeSingle({
      userText: 'Hello',
      systemPrompt: 'Be brief.',
    });

    expect(capturedInit.method).toBe('POST');
    expect(capturedInit.headers['x-api-key']).toBe('sk-ant-test');
    expect(capturedInit.headers['anthropic-version']).toBe('2023-06-01');
    expect(capturedBody.model).toBe('claude-sonnet-4-20250514');
    expect(capturedBody.system).toBe('Be brief.');
    expect(capturedBody.messages).toEqual([{ role: 'user', content: 'Hello' }]);
    expect(result.content).toBe('Hello from Claude');
    expect(result.usage?.promptTokens).toBe(12);
    expect(result.usage?.completionTokens).toBe(6);
  });

  it('parses thinking blocks separately', async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          content: [
            { type: 'thinking', thinking: 'internal reasoning' },
            { type: 'text', text: 'final answer' },
          ],
          usage: { input_tokens: 5, output_tokens: 10 },
        }),
        { status: 200 }
      )
    );
    const provider = new ClaudeProvider({
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'x',
      model: 'claude-sonnet-4-20250514',
    });
    const result = await provider.completeSingle({
      userText: 'q',
      systemPrompt: 's',
    });
    expect(result.content).toBe('final answer');
    expect(result.thinking).toBe('internal reasoning');
  });

  it('throws authFailed on 401', async () => {
    global.fetch = vi.fn(async () => new Response('', { status: 401 }));
    const provider = new ClaudeProvider({
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'bad',
      model: 'claude-sonnet-4-20250514',
    });
    await expect(
      provider.completeSingle({ userText: 'q', systemPrompt: 's' })
    ).rejects.toMatchObject({ kind: LLMExceptionKind.AuthFailed });
  });
});
```

- [ ] **Step 2: Implement Claude adapter**

Create `src/lib/llm/claude-provider.ts`:

```typescript
import type { ChatResponse, LLMProvider } from './types';
import { LLMException } from './types';
import { mapFetchError, mapResponseStatus } from './error-mapper';
import type { ProviderConfig } from './provider-config';

interface ClaudeContentBlock {
  type: string;
  text?: string;
  thinking?: string;
}

interface ClaudeResponse {
  content?: ClaudeContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * Adapter for Anthropic's Claude API.
 *
 * Wire format: POST {baseUrl}/messages
 * Auth: x-api-key header + anthropic-version: 2023-06-01
 * Differences from OpenAI: system is top-level field, not a message role;
 * max_tokens is required (we set 800 — enough for coach comments).
 */
export class ClaudeProvider implements LLMProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: ProviderConfig) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async completeSingle(input: {
    userText: string;
    systemPrompt: string;
    signal?: AbortSignal;
  }): Promise<ChatResponse> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/messages`;
    const body = {
      model: this.model,
      max_tokens: 800,
      system: input.systemPrompt,
      messages: [{ role: 'user', content: input.userText }],
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

    let json: ClaudeResponse;
    try {
      json = (await resp.json()) as ClaudeResponse;
    } catch (e) {
      throw new LLMException(
        `Failed to parse Claude response: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    let text: string | null = null;
    let thinking: string | null = null;
    for (const block of json.content ?? []) {
      if (block.type === 'text' && typeof block.text === 'string') {
        text = block.text;
      } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
        thinking = block.thinking;
      }
    }

    if (!text) {
      if (thinking) {
        text = thinking;
        thinking = null;
      } else {
        throw new LLMException('Claude response had no text.');
      }
    }

    text = text.trim().replace(/^["']|["']$/g, '');

    return {
      content: text,
      stopReason: 'endTurn' as const,
      thinking,
      usage: {
        promptTokens: json.usage?.input_tokens ?? 0,
        completionTokens: json.usage?.output_tokens ?? 0,
      },
    };
  }
}
```

- [ ] **Step 3: Gemini adapter test**

Create `tests/unit/llm/gemini-provider.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiProvider } from '@/lib/llm/gemini-provider';
import { LLMExceptionKind } from '@/lib/llm/types';

describe('GeminiProvider', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends POST with API key as query param + correct body shape', async () => {
    let capturedUrl: string = '';
    let capturedBody: any = null;
    global.fetch = vi.fn(async (url: any, init: any) => {
      capturedUrl = url.toString();
      capturedBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: 'Gemini reply' }] } },
          ],
          usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 4 },
        }),
        { status: 200 }
      );
    });

    const provider = new GeminiProvider({
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'gem-key',
      model: 'gemini-2.0-flash',
    });

    const result = await provider.completeSingle({
      userText: 'Hello',
      systemPrompt: 'Be brief.',
    });

    expect(capturedUrl).toContain('https://generativelanguage.googleapis.com/v1beta');
    expect(capturedUrl).toContain(':generateContent');
    expect(capturedUrl).toContain('key=gem-key');
    expect(capturedBody.contents).toEqual([
      { role: 'user', parts: [{ text: 'Hello' }] },
    ]);
    expect(capturedBody.systemInstruction).toEqual({ parts: [{ text: 'Be brief.' }] });
    expect(capturedBody.generationConfig.temperature).toBe(0.7);
    expect(result.content).toBe('Gemini reply');
    expect(result.usage?.promptTokens).toBe(8);
    expect(result.usage?.completionTokens).toBe(4);
  });

  it('parses "thought" parts separately', async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { thought: true, text: 'internal' },
                  { text: 'final' },
                ],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 },
        }),
        { status: 200 }
      )
    );
    const provider = new GeminiProvider({
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'x',
      model: 'gemini-2.0-flash',
    });
    const result = await provider.completeSingle({
      userText: 'q',
      systemPrompt: 's',
    });
    expect(result.content).toBe('final');
    expect(result.thinking).toBe('internal');
  });
});
```

- [ ] **Step 4: Implement Gemini adapter**

Create `src/lib/llm/gemini-provider.ts`:

```typescript
import type { ChatResponse, LLMProvider } from './types';
import { LLMException } from './types';
import { mapFetchError, mapResponseStatus } from './error-mapper';
import type { ProviderConfig } from './provider-config';

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/**
 * Adapter for Google's Gemini API.
 *
 * Wire format: POST {baseUrl}/models/{model}:generateContent?key={apiKey}
 * Auth: API key as query parameter (NOT a header).
 * System prompt goes in top-level systemInstruction object.
 */
export class GeminiProvider implements LLMProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: ProviderConfig) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async completeSingle(input: {
    userText: string;
    systemPrompt: string;
    signal?: AbortSignal;
  }): Promise<ChatResponse> {
    const url =
      `${this.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(this.model)}` +
      `:generateContent?key=${encodeURIComponent(this.apiKey)}`;

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

    let json: GeminiResponse;
    try {
      json = (await resp.json()) as GeminiResponse;
    } catch (e) {
      throw new LLMException(
        `Failed to parse Gemini response: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const parts = json.candidates?.[0]?.content?.parts ?? [];
    let text: string | null = null;
    let thinking: string | null = null;
    for (const p of parts) {
      if (typeof p.text !== 'string') continue;
      if (p.thought === true) {
        thinking = p.text;
      } else if (text === null) {
        text = p.text;
      }
    }

    if (!text) {
      if (thinking) {
        text = thinking;
        thinking = null;
      } else {
        throw new LLMException('Gemini response had no text.');
      }
    }

    text = text.trim().replace(/^["']|["']$/g, '');

    return {
      content: text,
      stopReason: 'endTurn' as const,
      thinking,
      usage: {
        promptTokens: json.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }
}
```

- [ ] **Step 5: Factory test + impl**

Create `tests/unit/llm/provider-factory.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createLLMProvider } from '@/lib/llm/provider-factory';
import { OpenAICompatibleProvider } from '@/lib/llm/openai-compatible-provider';
import { ClaudeProvider } from '@/lib/llm/claude-provider';
import { GeminiProvider } from '@/lib/llm/gemini-provider';
import { PROVIDER_DEFAULTS } from '@/lib/llm/provider-defaults';

describe('createLLMProvider', () => {
  const cfg = (name: keyof typeof PROVIDER_DEFAULTS, apiKey = 'test') => ({
    providerName: name,
    baseUrl: PROVIDER_DEFAULTS[name].baseUrl,
    model: PROVIDER_DEFAULTS[name].model,
    apiKey,
  });

  it('returns ClaudeProvider for claude', () => {
    expect(createLLMProvider(cfg('claude'))).toBeInstanceOf(ClaudeProvider);
  });

  it('returns GeminiProvider for gemini', () => {
    expect(createLLMProvider(cfg('gemini'))).toBeInstanceOf(GeminiProvider);
  });

  it('returns OpenAICompatibleProvider for openai', () => {
    expect(createLLMProvider(cfg('openai'))).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it('returns OpenAICompatibleProvider for all other OpenAI-compatible providers', () => {
    const openaiCompatible = ['deepseek', 'deepseek-pro', 'openrouter', 'zai', 'minimax', 'nemotron', 'ollama'] as const;
    for (const name of openaiCompatible) {
      expect(createLLMProvider(cfg(name))).toBeInstanceOf(OpenAICompatibleProvider);
    }
  });

  it('falls back to OpenAICompatibleProvider for unknown names', () => {
    expect(
      createLLMProvider({ providerName: 'unknown', baseUrl: 'https://x', model: 'm', apiKey: 'k' })
    ).toBeInstanceOf(OpenAICompatibleProvider);
  });
});
```

Create `src/lib/llm/provider-factory.ts`:

```typescript
import type { LLMProvider } from './types';
import type { ProviderConfig } from './provider-config';
import { OpenAICompatibleProvider } from './openai-compatible-provider';
import { ClaudeProvider } from './claude-provider';
import { GeminiProvider } from './gemini-provider';

/**
 * Construct the concrete LLMProvider for a given config.
 * Unknown provider names fall back to OpenAICompatibleProvider (the de-facto
 * standard for self-hosted and third-party gateways).
 */
export function createLLMProvider(config: ProviderConfig): LLMProvider {
  switch (config.providerName) {
    case 'claude':
      return new ClaudeProvider(config);
    case 'gemini':
      return new GeminiProvider(config);
    case 'openai':
    case 'deepseek':
    case 'deepseek-pro':
    case 'openrouter':
    case 'zai':
    case 'minimax':
    case 'nemotron':
    case 'ollama':
    default:
      return new OpenAICompatibleProvider(config);
  }
}
```

- [ ] **Step 6: Run all LLM tests**

Run: `npm test -- llm/`
Expected: 22 tests pass (8 error-mapper + 5 openai-compatible + 3 claude + 2 gemini + 5 factory = 23; if any fails, fix).

- [ ] **Step 7: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: claude + gemini adapters + provider factory + tests" }
```

---

## Task 5: Prompt builders + LLM service (high-level facade)

**Files:**
- Create: `src/lib/llm/prompt-builders.ts`, `src/lib/llm/llm-service.ts`
- Test: `tests/unit/llm/prompt-builders.test.ts`

**Interfaces:**
- Produces: `buildSessionContextSummary(session, recentSessions)` (token-budgeted), `generateCoachComment(input)`, `generateWeeklyReflection(input)`, `suggestLabel(input)`.

- [ ] **Step 1: Test for prompt builders**

Create `tests/unit/llm/prompt-builders.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildSessionContextSummary, buildCoachUserText, buildWeeklyReflectionUserText } from '@/lib/llm/prompt-builders';
import type { Session } from '@/lib/schemas/session';

const ses = (overrides: Partial<Session>): Session => ({
  id: crypto.randomUUID(),
  startedAt: new Date('2026-07-21T10:00:00Z'),
  rating: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
} as Session);

describe('buildSessionContextSummary', () => {
  it('formats a session in compact form', () => {
    const s = ses({
      startedAt: new Date('2026-07-20T08:30:00Z'),
      durationMinutes: 30,
      reps: null,
      rating: 4,
      activityLabel: 'meditation',
      note: 'still mind',
    });
    const out = buildSessionContextSummary(s);
    expect(out).toMatch(/2026-07-20/);
    expect(out).toMatch(/meditation/);
    expect(out).toMatch(/30m/);
    expect(out).toMatch(/4\/5/);
  });

  it('handles reps sessions', () => {
    const s = ses({ durationMinutes: null, reps: 108, rating: 5 });
    expect(buildSessionContextSummary(s)).toMatch(/108 reps/);
  });

  it('truncates notes to 30 chars', () => {
    const long = 'a'.repeat(100);
    const s = ses({ note: long });
    expect(buildSessionContextSummary(s)).toHaveLength(lessThan(120));
  });
});

function lessThan(n: number) {
  return { asymetricMatch: (v: number) => v < n, toString: () => `<${n}` };
}

describe('buildCoachUserText', () => {
  it('includes current session fields', () => {
    const s = ses({ durationMinutes: 25, reps: null, rating: 4, activityLabel: 'trading review', note: 'rough open' });
    const out = buildCoachUserText(s, []);
    expect(out).toMatch(/25m/);
    expect(out).toMatch(/trading review/);
    expect(out).toMatch(/rough open/);
    expect(out).toMatch(/4\/5/);
  });

  it('includes last 5 sessions when provided', () => {
    const recent = [
      ses({ startedAt: new Date('2026-07-19T08:00:00Z'), activityLabel: 'sit', durationMinutes: 20, reps: null, rating: 5 }),
    ];
    const s = ses({ durationMinutes: 10, reps: null, rating: 3 });
    const out = buildCoachUserText(s, recent);
    expect(out).toMatch(/Recent sessions:/);
    expect(out).toMatch(/sit/);
  });
});

describe('buildWeeklyReflectionUserText', () => {
  it('includes summary stats + session list', () => {
    const sessions = [
      ses({ startedAt: new Date('2026-07-15T10:00:00Z'), durationMinutes: 30, reps: null, rating: 4, activityLabel: 'meditation' }),
      ses({ startedAt: new Date('2026-07-16T10:00:00Z'), durationMinutes: null, reps: 108, rating: 5 }),
    ];
    const out = buildWeeklyReflectionUserText(sessions);
    expect(out).toMatch(/Total sessions: 2/i);
    expect(out).toMatch(/meditation/);
    expect(out).toMatch(/108 reps/);
  });
});
```

- [ ] **Step 2: Implement prompt builders**

Create `src/lib/llm/prompt-builders.ts`:

```typescript
import type { Session } from '@/lib/schemas/session';
import { formatDuration } from '@/lib/utils/format';
import { toLocalDateString } from '@/lib/utils/date';

/**
 * Compact single-session summary for inclusion in LLM context.
 * Targets ~40 tokens per session. Format:
 *   YYYY-MM-DD | activityLabel | duration | rating
 *   | note (truncated to 30 chars)
 */
export function buildSessionContextSummary(s: Session): string {
  const parts: string[] = [toLocalDateString(s.startedAt)];
  if (s.activityLabel) parts.push(s.activityLabel);
  if (s.durationMinutes != null) parts.push(formatDuration(s.durationMinutes));
  else if (s.reps != null) parts.push(`${s.reps} reps`);
  parts.push(`${s.rating}/5`);
  const line = parts.join(' | ');
  if (s.note) {
    const note = s.note.length > 30 ? s.note.slice(0, 30) + '…' : s.note;
    return `${line} | ${note}`;
  }
  return line;
}

/**
 * Build the user-side text for a coach-comment generation call.
 * Includes current session + last 5 sessions (token-budgeted).
 */
export function buildCoachUserText(current: Session, recent: Session[]): string {
  const lines: string[] = [];
  lines.push('Current session:');
  lines.push(buildSessionContextSummary(current));
  if (recent.length > 0) {
    lines.push('');
    lines.push('Recent sessions (most recent first):');
    for (const r of recent.slice(0, 5)) {
      lines.push(buildSessionContextSummary(r));
    }
  }
  lines.push('');
  lines.push('Respond with a 2-4 sentence reflection. No flattery. Address me by name if relevant. Match the personality.');
  return lines.join('\n');
}

/**
 * Build the user-side text for a weekly reflection.
 * Includes summary stats + session list.
 */
export function buildWeeklyReflectionUserText(sessions: Session[]): string {
  const totalMinutes = sessions.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
  const totalReps = sessions.reduce((sum, s) => sum + (s.reps ?? 0), 0);
  const avgRating =
    sessions.length > 0
      ? (sessions.reduce((sum, s) => sum + s.rating, 0) / sessions.length).toFixed(2)
      : 'n/a';

  const lines: string[] = [
    `Total sessions: ${sessions.length}`,
    `Total time: ${formatDuration(totalMinutes)}`,
    `Total reps: ${totalReps}`,
    `Average rating: ${avgRating}`,
    '',
    'Sessions (oldest first):',
  ];
  for (const s of [...sessions].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())) {
    lines.push(buildSessionContextSummary(s));
  }
  lines.push('');
  lines.push('Respond with 2-3 observations about patterns you notice, followed by ONE specific question for me to sit with next week. Format as JSON: { "observations": ["...","..."], "question": "..." }');
  return lines.join('\n');
}
```

- [ ] **Step 3: LLM service**

Create `src/lib/llm/llm-service.ts`:

```typescript
import type { Session } from '@/lib/schemas/session';
import type { LLMSettings } from '@/lib/schemas/llm-settings';
import type { CoachPersonality } from '@/lib/schemas/coach-personality';
import { getCoachSystemPrompt } from '@/lib/coaches';
import { createLLMProvider } from './provider-factory';
import { buildCoachUserText, buildWeeklyReflectionUserText } from './prompt-builders';
import { LLMException, LLMExceptionKind } from './types';

export interface CoachCommentInput {
  currentSession: Session;
  recentSessions: Session[];
  personality: CoachPersonality;
  displayName?: string;
  llmSettings: LLMSettings;
  signal?: AbortSignal;
}

export interface GenerateCoachCommentResult {
  comment: string;
  promptTokens: number;
  completionTokens: number;
  personalityUsed: CoachPersonality;
}

/**
 * Generate the coach comment for a freshly-saved session.
 * Throws LLMException on any failure. Caller handles failedLLM flag.
 */
export async function generateCoachComment(
  input: CoachCommentInput
): Promise<GenerateCoachCommentResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new LLMException(
      'Offline — coach skipped.',
      LLMExceptionKind.Offline,
    );
  }

  const config = resolveActiveProvider(input.llmSettings);
  const provider = createLLMProvider(config);
  const systemPrompt = personalizeSystemPrompt(
    getCoachSystemPrompt(input.personality),
    input.displayName,
  );

  const response = await provider.completeSingle({
    userText: buildCoachUserText(input.currentSession, input.recentSessions),
    systemPrompt,
    signal: input.signal,
  });

  if (!response.content) {
    throw new LLMException('Provider returned empty response.');
  }

  return {
    comment: response.content,
    promptTokens: response.usage?.promptTokens ?? 0,
    completionTokens: response.usage?.completionTokens ?? 0,
    personalityUsed: input.personality,
  };
}

export interface WeeklyReflectionInput {
  sessions: Session[];
  personality: CoachPersonality;
  displayName?: string;
  llmSettings: LLMSettings;
  signal?: AbortSignal;
}

export interface WeeklyReflectionResult {
  observations: string[];
  question: string;
  promptTokens: number;
  completionTokens: number;
}

export async function generateWeeklyReflection(
  input: WeeklyReflectionInput,
): Promise<WeeklyReflectionResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new LLMException('Offline — cannot generate reflection.', LLMExceptionKind.Offline);
  }
  const config = resolveActiveProvider(input.llmSettings);
  const provider = createLLMProvider(config);
  const systemPrompt = personalizeSystemPrompt(
    getCoachSystemPrompt(input.personality),
    input.displayName,
  );

  const response = await provider.completeSingle({
    userText: buildWeeklyReflectionUserText(input.sessions),
    systemPrompt,
    signal: input.signal,
  });

  if (!response.content) {
    throw new LLMException('Provider returned empty response.');
  }

  // Parse JSON response. Tolerate surrounding text.
  const jsonMatch = response.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new LLMException('Reflection response was not valid JSON.');
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { observations?: string[]; question?: string };
    if (!Array.isArray(parsed.observations) || typeof parsed.question !== 'string') {
      throw new LLMException('Reflection JSON missing required fields.');
    }
    return {
      observations: parsed.observations.slice(0, 5),
      question: parsed.question,
      promptTokens: response.usage?.promptTokens ?? 0,
      completionTokens: response.usage?.completionTokens ?? 0,
    };
  } catch (e) {
    if (e instanceof LLMException) throw e;
    throw new LLMException(`Failed to parse reflection JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export interface LabelSuggestionInput {
  note: string;
  llmSettings: LLMSettings;
  signal?: AbortSignal;
}

export async function suggestLabel(input: LabelSuggestionInput): Promise<string> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new LLMException('Offline.', LLMExceptionKind.Offline);
  }
  const config = resolveActiveProvider(input.llmSettings);
  const provider = createLLMProvider(config);
  const systemPrompt =
    'You suggest short activity labels (1-3 words) for a practice session based on the user\'s note. ' +
    'Reply with ONLY the label, no quotes, no punctuation, no explanation. ' +
    'Examples: "meditation", "trading review", "deep work", "push-ups", "reading".';

  const response = await provider.completeSingle({
    userText: `Note: "${input.note.slice(0, 500)}"\n\nSuggest a label:`,
    systemPrompt,
    signal: input.signal,
  });

  if (!response.content) throw new LLMException('Empty label response.');
  // Strip to single line, trim quotes/punctuation.
  return response.content.split('\n')[0]!.trim().replace(/^["'#-]+|["'.]+$/g, '').slice(0, 50);
}

function resolveActiveProvider(settings: LLMSettings): import('./provider-config').ProviderConfig {
  const name = settings.activeProviderName;
  const entry = settings.providers[name];
  if (!entry) {
    throw new LLMException(
      `No provider configured with name "${name}". Add it in LLM settings.`,
      LLMExceptionKind.AuthFailed,
    );
  }
  return {
    providerName: name,
    baseUrl: entry.baseUrl,
    apiKey: entry.apiKey,
    model: entry.model,
  };
}

function personalizeSystemPrompt(prompt: string, displayName?: string): string {
  if (!displayName) return prompt;
  return `${prompt}\n\nThe user's name is ${displayName}.`;
}
```

- [ ] **Step 4: Run prompt-builder tests**

Run: `npm test -- prompt-builders`
Expected: tests pass (some test helpers may need adjustment based on actual format output).

If the `lessThan` matcher helper doesn't work, simplify by removing that test case or using a plain `expect().toBeLessThan()`.

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: prompt builders + LLM service (coach, reflection, label)" }
```

---

## Task 6: Update LLM settings repo for token usage + useLLMSettings hook

**Files:**
- Modify: `src/lib/db/llm-settings.repo.ts` (add `incrementTokenUsage`, `addProvider`, `removeProvider`, `setActive`)
- Create: `src/hooks/useLLMSettings.ts`

- [ ] **Step 1: Extend repo**

Add these methods to `LLMSettingsRepository` interface and `DexieLLMSettingsRepository` in `src/lib/db/llm-settings.repo.ts`:

```typescript
// Add to interface:
interface LLMSettingsRepository {
  // ... existing
  addProvider(name: string, config: { baseUrl: string; apiKey: string; model: string }): Promise<LLMSettings>;
  removeProvider(name: string): Promise<LLMSettings>;
  setActive(name: string): Promise<LLMSettings>;
  incrementTokenUsage(promptTokens: number, completionTokens: number): Promise<void>;
}
```

Implementation:

```typescript
async addProvider(name: string, config: { baseUrl: string; apiKey: string; model: string }): Promise<LLMSettings> {
  const current = await this.get();
  const updated: LLMSettings = {
    ...current,
    providers: { ...current.providers, [name]: config },
    updatedAt: new Date(),
  };
  await getDb().llmSettings.put(updated);
  return updated;
}

async removeProvider(name: string): Promise<LLMSettings> {
  const current = await this.get();
  const providers = { ...current.providers };
  delete providers[name];
  let activeProviderName = current.activeProviderName;
  if (activeProviderName === name) {
    const remaining = Object.keys(providers);
    activeProviderName = remaining[0] ?? '';
  }
  const updated: LLMSettings = {
    ...current,
    providers,
    activeProviderName,
    updatedAt: new Date(),
  };
  await getDb().llmSettings.put(updated);
  return updated;
}

async setActive(name: string): Promise<LLMSettings> {
  const current = await this.get();
  const updated: LLMSettings = {
    ...current,
    activeProviderName: name,
    updatedAt: new Date(),
  };
  await getDb().llmSettings.put(updated);
  return updated;
}

async incrementTokenUsage(promptTokens: number, completionTokens: number): Promise<void> {
  const current = await this.get();
  const now = new Date();
  // Reset monthly counter if we crossed into a new month.
  const resetAt = current.totalTokensResetAt;
  const shouldReset = now >= resetAt;
  const updated: LLMSettings = {
    ...current,
    totalTokensThisMonth: (shouldReset ? 0 : current.totalTokensThisMonth) + promptTokens + completionTokens,
    totalTokensResetAt: shouldReset
      ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
      : resetAt,
    updatedAt: now,
  };
  await getDb().llmSettings.put(updated);
}
```

- [ ] **Step 2: useLLMSettings hook**

Create `src/hooks/useLLMSettings.ts`:

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { PROVIDER_DEFAULTS, PROVIDER_NAMES } from '@/lib/llm/provider-defaults';

const KEY = ['llmSettings'] as const;

export function useLLMSettings() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => llmSettingsRepo.get(),
  });

  const addProvider = useMutation({
    mutationFn: ({ name, apiKey, model, baseUrl }: { name: string; apiKey: string; model: string; baseUrl: string }) =>
      llmSettingsRepo.addProvider(name, { apiKey, model, baseUrl }),
    onSuccess: (updated) => qc.setQueryData(KEY, updated),
  });

  const removeProvider = useMutation({
    mutationFn: (name: string) => llmSettingsRepo.removeProvider(name),
    onSuccess: (updated) => qc.setQueryData(KEY, updated),
  });

  const setActive = useMutation({
    mutationFn: (name: string) => llmSettingsRepo.setActive(name),
    onSuccess: (updated) => qc.setQueryData(KEY, updated),
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    addProvider: addProvider.mutateAsync,
    removeProvider: removeProvider.mutateAsync,
    setActive: setActive.mutateAsync,
    configuredProviderNames: query.data ? Object.keys(query.data.providers) : [],
    presetNames: PROVIDER_NAMES,
    presetDefaults: PROVIDER_DEFAULTS,
  };
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: llm settings repo token tracking + useLLMSettings hook" }
```

---

## Task 7: Wire coach comment generation into useSessions save flow

**Files:**
- Modify: `src/hooks/useSessions.ts` (call `generateCoachComment` after save, update session, increment tokens)

- [ ] **Step 1: Update useSessions**

Replace the existing `useSessions.ts`:

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionRepo } from '@/lib/db/session.repo';
import { streakRepo } from '@/lib/db/streak.repo';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { computeStreak } from '@/lib/streak/compute-streak';
import { generateCoachComment } from '@/lib/llm/llm-service';
import { LLMException, LLMExceptionKind } from '@/lib/llm/types';
import type { Session, SessionInput } from '@/lib/schemas/session';

const KEY = ['sessions'] as const;

async function recomputeStreakSideEffect() {
  const [current, sessions] = await Promise.all([
    streakRepo.get(),
    sessionRepo.getAll(),
  ]);
  const next = computeStreak({
    sessions,
    previousStreak: current,
    now: new Date(),
  });
  await streakRepo.save(next);
  return next;
}

async function generateCoachCommentSideEffect(session: Session): Promise<void> {
  try {
    const [llmSettings, appSettings, recent] = await Promise.all([
      llmSettingsRepo.get(),
      settingsRepo.get(),
      sessionRepo.getAll(),
    ]);

    if (Object.keys(llmSettings.providers).length === 0) {
      // No provider configured — leave coachComment null silently.
      return;
    }

    const result = await generateCoachComment({
      currentSession: session,
      recentSessions: recent.filter((s) => s.id !== session.id).slice(0, 5),
      personality: appSettings.selectedCoachPersonality,
      displayName: appSettings.displayName,
      llmSettings,
    });

    await sessionRepo.update(session.id, {
      coachComment: result.comment,
      coachPersonalityAtGeneration: result.personalityUsed,
      failedLLM: false,
    });
    await llmSettingsRepo.incrementTokenUsage(result.promptTokens, result.completionTokens);
  } catch (e) {
    const failedLLM = true;
    let errorMessage: string | undefined;
    if (e instanceof LLMException) {
      errorMessage = e.message;
      // Don't log offline as a hard failure — it's expected.
      if (e.kind === LLMExceptionKind.Offline) return;
    } else {
      errorMessage = e instanceof Error ? e.message : String(e);
    }
    console.warn('Coach comment generation failed:', errorMessage);
    await sessionRepo.update(session.id, { failedLLM, coachComment: null });
  }
}

export function useSessions() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: KEY,
    queryFn: () => sessionRepo.getAll(),
  });

  const invalidateBoth = () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ['streak'] });
  };

  const createMutation = useMutation({
    mutationFn: (input: SessionInput) => sessionRepo.save(input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: KEY });
      const optimistic: Session = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
        coachComment: null,
        calendarEventId: null,
        failedLLM: false,
      };
      const previous = qc.getQueryData<Session[]>(KEY);
      qc.setQueryData<Session[]>(KEY, (old = []) => [optimistic, ...old]);
      return { previous };
    },
    onError: (_e, _input, ctx) => {
      if (ctx) qc.setQueryData(KEY, ctx.previous);
    },
    onSuccess: async (saved) => {
      await recomputeStreakSideEffect();
      invalidateBoth();
      // Fire-and-forget coach comment (don't await; UI updates via liveQuery)
      void generateCoachCommentSideEffect(saved);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Session> }) =>
      sessionRepo.update(id, patch),
    onSettled: async () => {
      await recomputeStreakSideEffect();
      invalidateBoth();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => sessionRepo.delete(id),
    onSettled: async () => {
      await recomputeStreakSideEffect();
      invalidateBoth();
    },
  });

  return {
    sessions: query.data ?? [],
    isLoading: query.isLoading,
    createSession: createMutation.mutateAsync,
    updateSession: updateMutation.mutateAsync,
    deleteSession: deleteMutation.mutateAsync,
    retryCoachComment: generateCoachCommentSideEffect,
  };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: wire coach comment generation into session save flow" }
```

---

## Task 8: SessionCard coach comment UI + smart label button in SessionForm

**Files:**
- Modify: `src/components/session/SessionCard.tsx` (add "Coach is thinking…" placeholder + personality color)
- Modify: `src/components/session/SessionForm.tsx` (add "Suggest label" button next to activity field)

- [ ] **Step 1: Update SessionCard**

Modify `src/components/session/SessionCard.tsx` to show "Coach is thinking…" placeholder when `session.coachComment === null && session.failedLLM !== true` and the session was just created (createdAt within last 60 seconds):

```tsx
'use client';

import { motion } from 'motion/react';
import type { Session } from '@/lib/schemas/session';
import { formatSessionSummary } from '@/lib/utils/format';
import type { CoachPersonality } from '@/lib/schemas/coach-personality';

const RATING_EMOJI: Record<number, string> = {
  5: '😄', 4: '🙂', 3: '😐', 2: '😕', 1: '😢',
};

const PERSONALITY_COLORS: Record<CoachPersonality, string> = {
  zen: 'var(--color-zen)',
  hype: 'var(--color-hype)',
  analyst: 'var(--color-analyst)',
  buddy: 'var(--color-buddy)',
  athena: 'var(--color-athena-from)',
};

interface Props {
  session: Session;
  onClick?: (s: Session) => void;
  pending?: boolean;
}

export function SessionCard({ session, onClick }: Props) {
  const time = session.startedAt.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  const ageMs = Date.now() - session.createdAt.getTime();
  const isThinkingCoach =
    !session.coachComment && !session.failedLLM && ageMs < 60_000;
  const personalityColor =
    PERSONALITY_COLORS[session.coachPersonalityAtGeneration ?? 'buddy'];

  return (
    <motion.button
      layout
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick?.(session)}
      className="w-full text-left flex items-start gap-3 py-3"
    >
      <div className="text-2xl shrink-0" aria-hidden>
        {RATING_EMOJI[session.rating]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-muted">{time}</span>
          <span className="text-text font-medium truncate">
            {formatSessionSummary(session)}
          </span>
        </div>
        {session.note && (
          <div className="text-text-muted text-sm truncate mt-0.5">{session.note}</div>
        )}
        {isThinkingCoach && (
          <div className="mt-2 text-xs text-text-muted italic animate-pulse border-l-2 border-text-muted pl-2">
            Coach is thinking…
          </div>
        )}
        {session.coachComment && (
          <div
            className="mt-2 text-xs italic text-text-muted border-l-2 pl-2"
            style={{ borderColor: personalityColor }}
          >
            {session.coachComment}
          </div>
        )}
        {session.failedLLM && !session.coachComment && ageMs >= 60_000 && (
          <div className="mt-2 text-xs text-hype border-l-2 border-hype pl-2">
            Coach unavailable. Tap to retry.
          </div>
        )}
      </div>
    </motion.button>
  );
}
```

- [ ] **Step 2: Add smart-label button to SessionForm**

Modify `src/components/session/SessionForm.tsx` to add a "Suggest" button next to the activity label. Add this inside the activity label section (replace the existing activity label block):

```tsx
{/* Activity label */}
<div>
  <div className="flex items-center justify-between">
    <span className="text-text-muted text-sm">Activity (optional)</span>
    {note.trim().length > 20 && !activityLabel && (
      <button
        type="button"
        onClick={async () => {
          try {
            const { suggestLabel } = await import('@/lib/llm/llm-service');
            const { llmSettingsRepo } = await import('@/lib/db/llm-settings.repo');
            const settings = await llmSettingsRepo.get();
            const label = await suggestLabel({ note, llmSettings: settings });
            setActivityLabel(label);
          } catch (e) {
            // Silent fail — label suggestion is optional convenience
            console.warn('Label suggestion failed:', e);
          }
        }}
        className="text-xs text-accent"
      >
        ✨ Suggest
      </button>
    )}
  </div>
  <input
    type="text"
    maxLength={100}
    value={activityLabel}
    onChange={(e) => setActivityLabel(e.target.value)}
    placeholder="meditation, trading review, push-ups…"
    className="w-full mt-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 text-text"
  />
</div>
```

- [ ] **Step 3: Verify typecheck + run dev**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run dev` → save a session with no provider configured → no crash, "Coach is thinking…" does NOT appear (since providers list is empty). Kill server.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: coach comment UI + smart label suggestion button" }
```

---

## Task 9: LLM settings UI (the /llm tab)

**Files:**
- Modify: `src/app/(main)/llm/page.tsx`
- Create: `src/components/llm/ProviderList.tsx`, `src/components/llm/ProviderEditor.tsx`, `src/components/llm/TokenMeter.tsx`

- [ ] **Step 1: TokenMeter**

Create `src/components/llm/TokenMeter.tsx`:

```tsx
import { Card } from '@/components/ui/Card';

interface Props {
  totalTokensThisMonth: number;
  resetAt: Date;
}

const PROVIDER_PRICING_PER_1K: Record<string, [number, number]> = {
  // [input_per_1k, output_per_1k] in USD, rough averages
  openai: [0.0025, 0.01],
  claude: [0.003, 0.015],
  gemini: [0.0005, 0.0015],
};

export function TokenMeter({ totalTokensThisMonth, resetAt }: Props) {
  // Rough cost estimate assuming 50/50 split
  const avgInputPer1k = 0.002;
  const avgOutputPer1k = 0.01;
  const estimatedCost = (totalTokensThisMonth / 2 / 1000) * avgInputPer1k +
                        (totalTokensThisMonth / 2 / 1000) * avgOutputPer1k;

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-1">This month</div>
      <div className="font-serif text-2xl text-text">
        {totalTokensThisMonth.toLocaleString()} <span className="text-base text-text-muted">tokens</span>
      </div>
      <div className="text-sm text-text-muted mt-1">
        ≈ ${estimatedCost.toFixed(3)} USD · resets {resetAt.toLocaleDateString()}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: ProviderEditor (modal)**

Create `src/components/llm/ProviderEditor.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { PROVIDER_DEFAULTS, type ProviderName } from '@/lib/llm/provider-defaults';

interface Props {
  open: boolean;
  name: ProviderName;
  initial?: { baseUrl: string; apiKey: string; model: string };
  onSave: (config: { baseUrl: string; apiKey: string; model: string }) => void;
  onCancel: () => void;
}

export function ProviderEditor({ open, name, initial, onSave, onCancel }: Props) {
  const defaults = PROVIDER_DEFAULTS[name];
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? defaults.baseUrl);
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '');
  const [model, setModel] = useState(initial?.model ?? defaults.model);

  useEffect(() => {
    setBaseUrl(initial?.baseUrl ?? defaults.baseUrl);
    setApiKey(initial?.apiKey ?? '');
    setModel(initial?.model ?? defaults.model);
  }, [initial, defaults, open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    onSave({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() });
  }

  return (
    <Modal open={open} onClose={onCancel} title={`Configure ${name}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-text-muted text-sm">Base URL</span>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="w-full mt-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 text-text"
          />
        </label>
        <label className="block">
          <span className="text-text-muted text-sm">Model</span>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full mt-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 text-text"
          />
        </label>
        <label className="block">
          <span className="text-text-muted text-sm">API key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
            autoComplete="off"
            className="w-full mt-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 text-text"
          />
        </label>
        <div className="flex gap-2 justify-end pt-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 3: ProviderList**

Create `src/components/llm/ProviderList.tsx`:

```tsx
'use client';

import { Card } from '@/components/ui/Card';
import { PROVIDER_NAMES, PROVIDER_DEFAULTS, type ProviderName } from '@/lib/llm/provider-defaults';

interface Props {
  configuredProviders: Record<string, { baseUrl: string; apiKey: string; model: string }>;
  activeProviderName: string;
  onSelect: (name: ProviderName) => void;
  onConfigure: (name: ProviderName) => void;
  onRemove: (name: ProviderName) => void;
}

export function ProviderList({
  configuredProviders,
  activeProviderName,
  onSelect,
  onConfigure,
  onRemove,
}: Props) {
  return (
    <div className="space-y-2">
      {PROVIDER_NAMES.map((name) => {
        const isConfigured = name in configuredProviders;
        const isActive = name === activeProviderName;
        const defaults = PROVIDER_DEFAULTS[name];
        return (
          <Card key={name} className={isActive ? 'border-accent' : ''}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text capitalize">{name}</span>
                  {isActive && (
                    <span className="text-xs bg-accent text-base px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                  {!isConfigured && (
                    <span className="text-xs bg-surface-2 text-text-muted px-2 py-0.5 rounded-full">
                      Not configured
                    </span>
                  )}
                </div>
                <div className="text-xs text-text-muted truncate mt-0.5">
                  {defaults.model} · {defaults.baseUrl}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {isConfigured && !isActive && (
                  <button
                    onClick={() => onSelect(name)}
                    className="text-xs text-accent px-3 py-1.5 rounded-full hover:bg-surface-2"
                  >
                    Set active
                  </button>
                )}
                <button
                  onClick={() => onConfigure(name)}
                  className="text-xs text-text-muted px-3 py-1.5 rounded-full hover:bg-surface-2"
                >
                  {isConfigured ? 'Edit' : 'Add'}
                </button>
                {isConfigured && (
                  <button
                    onClick={() => onRemove(name)}
                    className="text-xs text-hype px-2 py-1.5 rounded-full hover:bg-surface-2"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: LLM page**

Replace `src/app/(main)/llm/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useLLMSettings } from '@/hooks/useLLMSettings';
import { ProviderList } from '@/components/llm/ProviderList';
import { ProviderEditor } from '@/components/llm/ProviderEditor';
import { TokenMeter } from '@/components/llm/TokenMeter';
import type { ProviderName } from '@/lib/llm/provider-defaults';

export default function LLMPage() {
  const {
    settings,
    addProvider,
    removeProvider,
    setActive,
  } = useLLMSettings();
  const [editing, setEditing] = useState<ProviderName | null>(null);

  if (!settings) {
    return <div className="text-text-muted text-sm">Loading…</div>;
  }

  const editingInitial = editing ? settings.providers[editing] : undefined;

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl">LLM Providers</h1>

      <TokenMeter
        totalTokensThisMonth={settings.totalTokensThisMonth}
        resetAt={settings.totalTokensResetAt}
      />

      <div>
        <div className="text-xs uppercase tracking-wide text-text-muted mb-2">
          Providers
        </div>
        <ProviderList
          configuredProviders={settings.providers}
          activeProviderName={settings.activeProviderName}
          onSelect={(name) => setActive(name)}
          onConfigure={(name) => setEditing(name)}
          onRemove={(name) => removeProvider(name)}
        />
      </div>

      <p className="text-xs text-text-muted">
        API keys are stored locally in your browser (IndexedDB) and never sent
        anywhere except the provider you select.
      </p>

      {editing && (
        <ProviderEditor
          open={!!editing}
          name={editing}
          initial={editingInitial}
          onSave={async (config) => {
            await addProvider({ name: editing, ...config });
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: LLM settings UI - 11 provider presets + token meter" }
```

---

## Task 10: Reflect page + final Wave 3 verification

**Files:**
- Modify: `src/app/(main)/reflect/page.tsx`
- Create: `src/hooks/useReflections.ts`, `src/components/reflection/ReflectionCard.tsx`

- [ ] **Step 1: useReflections hook**

Create `src/hooks/useReflections.ts`:

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reflectionRepo } from '@/lib/db/reflection.repo';
import { sessionRepo } from '@/lib/db/session.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { generateWeeklyReflection } from '@/lib/llm/llm-service';
import { LLMException, LLMExceptionKind } from '@/lib/llm/types';
import { toLocalDateString } from '@/lib/utils/date';
import type { Reflection } from '@/lib/schemas/reflection';

const KEY = ['reflections'] as const;

export function useReflections() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: KEY,
    queryFn: () => reflectionRepo.getAll(),
  });

  const generate = useMutation({
    mutationFn: async (): Promise<Reflection> => {
      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [sessions, appSettings, llmSettings] = await Promise.all([
        sessionRepo.getByPeriod(sevenDaysAgo, now),
        settingsRepo.get(),
        llmSettingsRepo.get(),
      ]);

      if (sessions.length === 0) {
        throw new Error('No sessions in the last 7 days.');
      }
      if (Object.keys(llmSettings.providers).length === 0) {
        throw new Error('Configure an LLM provider first.');
      }

      const result = await generateWeeklyReflection({
        sessions,
        personality: appSettings.selectedCoachPersonality,
        displayName: appSettings.displayName,
        llmSettings,
      });

      const reflection = await reflectionRepo.save({
        periodStart: sevenDaysAgo,
        periodEnd: now,
        observations: result.observations,
        question: result.question,
        sourceSessionIds: sessions.map((s) => s.id),
      });

      await llmSettingsRepo.incrementTokenUsage(result.promptTokens, result.completionTokens);
      return reflection;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  return {
    reflections: query.data ?? [],
    isLoading: query.isLoading,
    generate: generate.mutateAsync,
    isGenerating: generate.isPending,
    error: generate.error,
  };
}
```

- [ ] **Step 2: ReflectionCard**

Create `src/components/reflection/ReflectionCard.tsx`:

```tsx
import { Card } from '@/components/ui/Card';
import type { Reflection } from '@/lib/schemas/reflection';

interface Props {
  reflection: Reflection;
}

export function ReflectionCard({ reflection }: Props) {
  const start = reflection.periodStart.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const end = reflection.periodEnd.toLocaleDateString([], { month: 'short', day: 'numeric' });

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-2">
        {start} – {end}
      </div>
      <ul className="space-y-2 mb-3">
        {reflection.observations.map((o, i) => (
          <li key={i} className="text-sm text-text flex gap-2">
            <span className="text-accent">•</span>
            <span>{o}</span>
          </li>
        ))}
      </ul>
      <div className="border-t border-border pt-3 mt-3">
        <div className="text-xs uppercase tracking-wide text-text-muted mb-1">
          Question to sit with
        </div>
        <p className="font-serif text-base text-text italic">{reflection.question}</p>
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Reflect page**

Replace `src/app/(main)/reflect/page.tsx`:

```tsx
'use client';

import { useReflections } from '@/hooks/useReflections';
import { ReflectionCard } from '@/components/reflection/ReflectionCard';
import { Button } from '@/components/ui/Button';

export default function ReflectPage() {
  const { reflections, generate, isGenerating, error } = useReflections();

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl">Reflect</h1>

      <Button
        onClick={() => generate()}
        disabled={isGenerating}
      >
        {isGenerating ? 'Reflecting…' : '✨ Reflect on this week'}
      </Button>

      {error && (
        <p className="text-hype text-sm">{error.message}</p>
      )}

      <div className="space-y-3">
        {reflections.length === 0 && !isGenerating && (
          <p className="text-text-muted text-sm">
            No reflections yet. Generate one based on your last 7 days of practice.
          </p>
        )}
        {reflections.map((r) => (
          <ReflectionCard key={r.id} reflection={r} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run all tests + typecheck + build**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm test`
Expected: all tests pass (Wave 1 + 2 + 3 — should be 60+ tests).

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: weekly reflection UI + generate flow" }
```

---

## Wave 3 Definition of Done

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` — all tests pass (60+ tests: Waves 1–3 combined)
- [ ] `npm run build` succeeds
- [ ] 3 LLM adapters (OpenAI-compatible, Claude, Gemini) implemented with wire-format tests
- [ ] 11 provider presets available in `/llm` settings
- [ ] Adding a provider + setting active persists to IndexedDB
- [ ] After session save with a configured provider, a coach comment is generated and stored on the session
- [ ] If no provider is configured, save succeeds silently (no crash, no "Coach is thinking…")
- [ ] If `navigator.onLine === false`, save succeeds without attempting LLM call
- [ ] If LLM call fails (bad key, 500, etc.), session is marked `failedLLM = true`, no retry storm
- [ ] Token usage increments after each LLM call; token meter on `/llm` reflects usage
- [ ] Smart label suggestion button appears in SessionForm when note > 20 chars and label is empty
- [ ] Weekly reflection can be generated from `/reflect` page; result stored as Reflection doc
- [ ] No `as any`, no `@ts-ignore`, no `@ts-expect-error` in source

## What's Next (Subsequent Waves)

- **Wave 4: Calendar** — GIS OAuth flow, dedicated `chrono-kata` calendar creation, per-session event sync with offline queue, disconnect flow.
- **Wave 5: Polish** — Athena 7-tap unlock mechanic, Lighthouse ≥80 pass, empty state refinement, error toast system, PWA install prompt handling.
