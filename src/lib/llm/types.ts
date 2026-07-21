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
