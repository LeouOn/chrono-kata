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