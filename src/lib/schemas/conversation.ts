import { z } from 'zod';

/**
 * Conversation threads messages from a single LLM session.
 * Each session has at most one conversation. The conversation tracks
 * rootMessageId + activeLeafId so the UI can render the currently
 * displayed path through the message tree.
 */
export const ConversationSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
rootMessageId: z.string().uuid().nullable().optional(),
  activeLeafId: z.string().uuid().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Conversation = z.infer<typeof ConversationSchema>;

export const ConversationInputSchema = ConversationSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ConversationInput = z.infer<typeof ConversationInputSchema>;
