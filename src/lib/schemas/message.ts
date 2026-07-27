import { z } from 'zod';
import { CoachPersonalitySchema } from './coach-personality';

export const MessageRoleSchema = z.enum(['user', 'assistant']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const TokenUsageSchema = z.object({
  prompt: z.number().int().nonnegative(),
  completion: z.number().int().nonnegative(),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/**
 * A single message in a conversation. Messages form a tree via parentId.
 * root messages have parentId === null. Branches share parents.
 */
export const MessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  role: MessageRoleSchema,
  content: z.string(),
  provider: z.string().optional(),
  model: z.string().optional(),
  personality: CoachPersonalitySchema.optional(),
  tokensUsed: TokenUsageSchema.optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  isEdited: z.boolean().optional(),
  createdAt: z.date(),
  editedAt: z.date().optional(),
});

export type Message = z.infer<typeof MessageSchema>;

export const MessageInputSchema = MessageSchema.omit({
  id: true,
  createdAt: true,
});
export type MessageInput = z.infer<typeof MessageInputSchema>;

/** The shape returned to LLMs as chat history. */
export const ChatMessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
