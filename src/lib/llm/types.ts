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

  /**
   * Multi-message, tool-augmented completion. Reserved for v1.1 —
   * throws UnimplementedError in v1 adapters.
   */
  chatWithTools?(input: {
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>;
    tools?: Array<{ name: string; description: string; input_schema: object }>;
    systemPrompt?: string;
    signal?: AbortSignal;
  }): Promise<ChatResponse>;
}

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
