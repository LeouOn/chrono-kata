/**
 * Strip <think>...</think> reasoning blocks that some models (minimax,
 * DeepSeek-R1, GLM with thinking enabled) embed inline in the content
 * field rather than in a separate reasoning_content field.
 *
 * Also strips wrapping quotes and trims whitespace.
 */
export function cleanLLMResponse(text: string): string {
  let cleaned = text;
  // Remove <think>...</think> blocks (non-greedy, multiline).
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Remove orphaned opening <think> without closing tag (streaming partial).
  cleaned = cleaned.replace(/<think>[\s\S]*$/gi, '');
  // Remove orphaned closing </think> without opening (streaming partial).
  cleaned = cleaned.replace(/<\/think>/gi, '');
  // Strip wrapping quotes.
  cleaned = cleaned.trim().replace(/^["']|["']$/g, '');
  return cleaned.trim();
}

/**
 * Streaming-safe filter: given accumulated text so far, return only the
 * "visible" portion (everything outside <think> blocks). Handles partial
 * tags by checking if we're currently inside an unclosed <think>.
 */
export function filterStreamingText(accumulated: string): string {
  // If there's an unclosed <think>, everything after it is hidden.
  const lastOpen = accumulated.lastIndexOf('<think>');
  const lastClose = accumulated.lastIndexOf('</think>');
  if (lastOpen > lastClose) {
    // We're inside a think block — show everything before <think>.
    return cleanLLMResponse(accumulated.slice(0, lastOpen));
  }
  // No unclosed think block — clean normally.
  return cleanLLMResponse(accumulated);
}