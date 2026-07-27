'use client';

import { useCallback, useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { getDb } from '@/lib/db/db';
import { conversationRepo } from '@/lib/db/conversation.repo';
import { messageRepo } from '@/lib/db/message.repo';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { generateConversationReply } from '@/lib/llm/llm-service';
import { LLMException, LLMExceptionKind } from '@/lib/llm/types';
import { dispatchToast } from '@/components/ui/Toast';
import type { Conversation } from '@/lib/schemas/conversation';
import type { Message } from '@/lib/schemas/message';

export interface UseConversationResult {
  conversation: Conversation | null;
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  sendMessage: (text: string) => Promise<void>;
}

export function useConversation(conversationId: string | null | undefined): UseConversationResult {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    if (!conversationId) {
      setConversation(null);
      setMessages([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    let cancelled = false;

    const resolveAndSet = async () => {
      const conv = await conversationRepo.getById(conversationId);
      if (cancelled) return;
      setConversation(conv ?? null);
      if (!conv?.activeLeafId) {
        const all = await messageRepo.getByConversation(conversationId);
        if (!cancelled) {
          setMessages(all);
          setIsLoading(false);
        }
        return;
      }
      const path = await messageRepo.getPathToLeaf(conversationId, conv.activeLeafId);
      if (!cancelled) {
        setMessages(path);
        setIsLoading(false);
      }
    };

    resolveAndSet();

    const convSub = liveQuery(() => getDb().conversations.get(conversationId)).subscribe({
      next: (c) => {
        if (cancelled) return;
        setConversation(c ?? null);
      },
    });

    const msgSub = liveQuery(() =>
      getDb().messages.where('conversationId').equals(conversationId).toArray()
    ).subscribe({
      next: async () => {
        if (cancelled) return;
        const conv = await conversationRepo.getById(conversationId);
        if (!conv?.activeLeafId) {
          const all = await messageRepo.getByConversation(conversationId);
          setMessages(all);
          return;
        }
        const path = await messageRepo.getPathToLeaf(conversationId, conv.activeLeafId);
        setMessages(path);
      },
    });

    return () => {
      cancelled = true;
      convSub.unsubscribe();
      msgSub.unsubscribe();
    };
  }, [conversationId]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!conversation || !conversationId) return;
      if (isStreaming) return;

      setIsStreaming(true);
      try {
        const userMessage = await messageRepo.save({
          conversationId,
          parentId: conversation.activeLeafId,
          role: 'user',
          content: text,
        });

        const placeholder = await messageRepo.save({
          conversationId,
          parentId: userMessage.id,
          role: 'assistant',
          content: '',
        });
        await conversationRepo.update(conversationId, { activeLeafId: placeholder.id });

        const [llmSettings, appSettings] = await Promise.all([
          llmSettingsRepo.get(),
          settingsRepo.get(),
        ]);

        if (Object.keys(llmSettings.providers).length === 0) {
          await messageRepo.update(placeholder.id, {
            content: 'No LLM provider configured. Add one in LLM settings.',
          });
          return;
        }

        const history = await messageRepo.getPathToLeaf(conversationId, userMessage.id);

        await generateConversationReply({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          personality: appSettings.selectedCoachPersonality,
          displayName: appSettings.displayName,
          llmSettings,
          onToken: (partial) => {
            void messageRepo.update(placeholder.id, { content: partial });
          },
        });

        const finalMsg = await messageRepo.getById(placeholder.id);
        const personalityUsed = appSettings.selectedCoachPersonality;
        await messageRepo.update(placeholder.id, {
          content: finalMsg?.content ?? '',
          personality: personalityUsed,
        });
        await conversationRepo.update(conversationId, { activeLeafId: placeholder.id });
      } catch (e) {
        const msg = e instanceof LLMException ? e.message : e instanceof Error ? e.message : String(e);
        const isOffline = e instanceof LLMException && e.kind === LLMExceptionKind.Offline;
        console.warn('Follow-up message failed:', msg);
        if (!isOffline) dispatchToast(msg, 'error');
      } finally {
        setIsStreaming(false);
      }
    },
    [conversation, conversationId, isStreaming],
  );

  return { conversation, messages, isLoading, isStreaming, sendMessage };
}