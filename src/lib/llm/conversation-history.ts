import type { Message } from '@/lib/schemas/message';
import type { ChatMessage } from '@/lib/schemas/message';

/** Convert a list of messages to the chat history shape consumed by LLMs. */
export function buildConversationContext(messages: Message[]): ChatMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}