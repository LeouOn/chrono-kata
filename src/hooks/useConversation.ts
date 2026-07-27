'use client';

import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { getDb } from '@/lib/db/db';
import { conversationRepo } from '@/lib/db/conversation.repo';
import { messageRepo } from '@/lib/db/message.repo';
import type { Conversation } from '@/lib/schemas/conversation';
import type { Message } from '@/lib/schemas/message';

export interface UseConversationResult {
  conversation: Conversation | null;
  messages: Message[];
  isLoading: boolean;
}

export function useConversation(conversationId: string | null | undefined): UseConversationResult {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!conversationId) {
      setConversation(null);
      setMessages([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    let cancelled = false;

    const convSub = liveQuery(() => getDb().conversations.get(conversationId)).subscribe({
      next: async (c) => {
        if (cancelled) return;
        setConversation(c ?? null);
        if (!c) {
          setMessages([]);
        }
      },
    });

    const msgSub = liveQuery(() =>
      getDb().messages.where('conversationId').equals(conversationId).toArray()
    ).subscribe({
      next: async (rows) => {
        if (cancelled) return;
        if (!conversation) {
          // Wait for conversation to be resolved, then walk path.
          const conv = await conversationRepo.getById(conversationId);
          if (!conv?.activeLeafId) {
            setMessages(rows);
            setIsLoading(false);
            return;
          }
          const path = await messageRepo.getPathToLeaf(conversationId, conv.activeLeafId);
          setMessages(path);
        } else if (conversation.activeLeafId) {
          const path = await messageRepo.getPathToLeaf(conversationId, conversation.activeLeafId);
          setMessages(path);
        } else {
          setMessages([]);
        }
        setIsLoading(false);
      },
    });

    return () => {
      cancelled = true;
      convSub.unsubscribe();
      msgSub.unsubscribe();
    };
  }, [conversationId, conversation?.activeLeafId]);

  return { conversation, messages, isLoading };
}