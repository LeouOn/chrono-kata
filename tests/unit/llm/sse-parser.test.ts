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
    expect(parseSSELines(input)).toEqual(['line1\nline2']);
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