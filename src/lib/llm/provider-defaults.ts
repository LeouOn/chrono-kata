/**
 * Provider presets. Provider names are the registry keys used throughout
 * the app. Model strings are the values as of 2026-07-21 — verify against
 * provider docs when implementing; users can override in the LLM settings UI.
 *
 * 8 of 10 use the OpenAI-compatible wire format; claude and gemini have
 * their own adapter classes.
 *
 * NOTE: The original Wave 3 plan brief mentioned "11 provider presets" but
 * enumerated only the 10 below. Implemented as-specified; flagged in the
 * implementer report.
 */
export const PROVIDER_DEFAULTS = {
  openai:         { baseUrl: 'https://api.openai.com/v1',                          model: 'gpt-4o' },
  deepseek:       { baseUrl: 'https://api.deepseek.com',                           model: 'deepseek-v4-flash' },
  'deepseek-pro': { baseUrl: 'https://api.deepseek.com',                           model: 'deepseek-v4-pro' },
  openrouter:     { baseUrl: 'https://openrouter.ai/api/v1',                       model: 'anthropic/claude-sonnet-latest' },
  zai:            { baseUrl: 'https://open.bigmodel.cn/api/paas/v4',               model: 'glm-5.2' },
  minimax:        { baseUrl: 'https://api.minimax.io/v1',                            model: 'minimax-m3' },
  nemotron:       { baseUrl: 'https://integrate.api.nvidia.com/v1',                model: 'nvidia/llama-3.1-nemotron-ultra-253b-v1' },
  ollama:         { baseUrl: 'http://localhost:11434/v1',                          model: 'llama3.3' },
  gemini:         { baseUrl: 'https://generativelanguage.googleapis.com/v1beta',   model: 'gemini-2.0-flash' },
  claude:         { baseUrl: 'https://api.anthropic.com/v1',                       model: 'claude-sonnet-4-20250514' },
} as const;

export type ProviderName = keyof typeof PROVIDER_DEFAULTS;

export const PROVIDER_NAMES = Object.keys(PROVIDER_DEFAULTS) as ProviderName[];

/** Which adapter class handles this provider. */
export function adapterFor(name: string): 'openai-compatible' | 'claude' | 'gemini' {
  if (name === 'claude') return 'claude';
  if (name === 'gemini') return 'gemini';
  return 'openai-compatible';
}
