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
import type { CoachPersonality } from '@/lib/schemas/coach-personality';

export interface BranchInfo {
  currentIndex: number;
  total: number;
  prevSiblingId: string | null;
  nextSiblingId: string | null;
}

export interface SendMessageOptions {
  personalityOverride?: CoachPersonality;
  providerOverride?: string;
}

export interface RegenerateMessageOptions {
  personalityOverride?: CoachPersonality;
  providerOverride?: string;
}

export interface UseConversationResult {
  conversation: Conversation | null;
  messages: Message[];
  branchMap: Record<string, BranchInfo>;
  isLoading: boolean;
  isStreaming: boolean;
  sendMessage: (text: string, options?: SendMessageOptions) => Promise<void>;
  regenerateMessage: (messageId: string, options?: RegenerateMessageOptions) => Promise<void>;
  editMessage: (messageId: string, newContent: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  switchBranch: (targetSiblingId: string) => Promise<void>;
}

export function computeBranchMap(allMessages: Message[]): Record<string, BranchInfo> {
  const map: Record<string, BranchInfo> = {};
  const grouped = new Map<string, Message[]>();

  for (const m of allMessages) {
    const key = m.parentId ?? '__ROOT__';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(m);
  }

  for (const siblings of grouped.values()) {
    siblings.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const total = siblings.length;
    siblings.forEach((m, idx) => {
      map[m.id] = {
        currentIndex: idx,
        total,
        prevSiblingId: idx > 0 ? siblings[idx - 1]!.id : null,
        nextSiblingId: idx < total - 1 ? siblings[idx + 1]!.id : null,
      };
    });
  }

  return map;
}

export function useConversation(conversationId: string | null | undefined): UseConversationResult {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [branchMap, setBranchMap] = useState<Record<string, BranchInfo>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    if (!conversationId) {
      setConversation(null);
      setMessages([]);
      setBranchMap({});
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    let cancelled = false;

    const resolveAndSet = async () => {
      const conv = await conversationRepo.getById(conversationId);
      const all = await messageRepo.getByConversation(conversationId);
      if (cancelled) return;
      setConversation(conv ?? null);
      setBranchMap(computeBranchMap(all));

      if (!conv?.activeLeafId) {
        setMessages(all);
        setIsLoading(false);
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
      next: async (all) => {
        if (cancelled) return;
        setBranchMap(computeBranchMap(all));
        const conv = await conversationRepo.getById(conversationId);
        if (!conv?.activeLeafId) {
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
    async (text: string, options?: SendMessageOptions) => {
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
        const personalityToUse = options?.personalityOverride ?? appSettings.selectedCoachPersonality;

        const result = await generateConversationReply({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          personality: personalityToUse,
          displayName: appSettings.displayName,
          llmSettings,
          providerOverride: options?.providerOverride,
          onToken: (partial) => {
            void messageRepo.update(placeholder.id, { content: partial });
          },
        });

        await messageRepo.update(placeholder.id, {
          content: result.reply,
          personality: result.personalityUsed,
          provider: result.providerName,
          model: result.model,
          tokensUsed: { prompt: result.promptTokens, completion: result.completionTokens },
          latencyMs: result.latencyMs,
          systemPrompt: result.systemPrompt,
        });
        await conversationRepo.update(conversationId, { activeLeafId: placeholder.id });
        await llmSettingsRepo.incrementTokenUsage(result.promptTokens, result.completionTokens);
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

  const regenerateMessage = useCallback(
    async (messageId: string, options?: RegenerateMessageOptions) => {
      if (!conversation || !conversationId) return;
      if (isStreaming) return;

      const target = await messageRepo.getById(messageId);
      if (!target) return;

      setIsStreaming(true);
      try {
        const placeholder = await messageRepo.save({
          conversationId,
          parentId: target.parentId,
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

        const history = target.parentId
          ? await messageRepo.getPathToLeaf(conversationId, target.parentId)
          : [];
        const personalityToUse =
          options?.personalityOverride ?? target.personality ?? appSettings.selectedCoachPersonality;

        const result = await generateConversationReply({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          personality: personalityToUse,
          displayName: appSettings.displayName,
          llmSettings,
          providerOverride: options?.providerOverride,
          onToken: (partial) => {
            void messageRepo.update(placeholder.id, { content: partial });
          },
        });

        await messageRepo.update(placeholder.id, {
          content: result.reply,
          personality: result.personalityUsed,
          provider: result.providerName,
          model: result.model,
          tokensUsed: { prompt: result.promptTokens, completion: result.completionTokens },
          latencyMs: result.latencyMs,
          systemPrompt: result.systemPrompt,
        });
        await conversationRepo.update(conversationId, { activeLeafId: placeholder.id });
        await llmSettingsRepo.incrementTokenUsage(result.promptTokens, result.completionTokens);
      } catch (e) {
        const msg = e instanceof LLMException ? e.message : e instanceof Error ? e.message : String(e);
        const isOffline = e instanceof LLMException && e.kind === LLMExceptionKind.Offline;
        console.warn('Regenerate failed:', msg);
        if (!isOffline) dispatchToast(msg, 'error');
      } finally {
        setIsStreaming(false);
      }
    },
    [conversation, conversationId, isStreaming],
  );

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (!conversationId) return;
      try {
        await messageRepo.update(messageId, {
          content: newContent,
          isEdited: true,
          editedAt: new Date(),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('Edit message failed:', msg);
        dispatchToast(msg, 'error');
      }
    },
    [conversationId],
  );

  const switchBranch = useCallback(
    async (targetSiblingId: string) => {
      if (!conversationId) return;
      try {
        const leaf = await messageRepo.getDeepestDescendant(targetSiblingId);
        await conversationRepo.update(conversationId, { activeLeafId: leaf.id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('Switch branch failed:', msg);
        dispatchToast(msg, 'error');
      }
    },
    [conversationId],
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!conversationId || !conversation) return;
      try {
        const target = await messageRepo.getById(messageId);
        if (!target) return;

        const allMessages = await messageRepo.getByConversation(conversationId);
        const targetSiblings = allMessages
          .filter((m) =>
            target.parentId == null
              ? m.parentId == null
              : m.parentId === target.parentId
          )
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        const affectedIds = new Set<string>();
        const collect = (id: string) => {
          affectedIds.add(id);
          for (const msg of allMessages) {
            if (msg.parentId === id) collect(msg.id);
          }
        };
        collect(messageId);

        let nextLeafId = conversation.activeLeafId;
        let nextRootId = conversation.rootMessageId;

        if (conversation.activeLeafId && affectedIds.has(conversation.activeLeafId)) {
          const otherSiblings = targetSiblings.filter((s) => !affectedIds.has(s.id));
          if (otherSiblings.length > 0) {
            const targetIdx = targetSiblings.findIndex((s) => s.id === messageId);
            const pick =
              targetIdx > 0
                ? otherSiblings[Math.min(targetIdx - 1, otherSiblings.length - 1)]!
                : otherSiblings[0]!;
            const leaf = await messageRepo.getDeepestDescendant(pick.id);
            nextLeafId = leaf.id;
          } else if (target.parentId) {
            nextLeafId = target.parentId;
          } else {
            nextLeafId = null;
            nextRootId = null;
          }
        }

        if (conversation.rootMessageId && affectedIds.has(conversation.rootMessageId)) {
          const remainingRoots = allMessages.filter(
            (m) => m.parentId == null && !affectedIds.has(m.id)
          );
          nextRootId = remainingRoots[0]?.id ?? null;
        }

        await messageRepo.deleteSubtree(messageId);
        await conversationRepo.update(conversationId, {
          activeLeafId: nextLeafId,
          rootMessageId: nextRootId,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('Delete message failed:', msg);
        dispatchToast(msg, 'error');
      }
    },
    [conversation, conversationId],
  );

  return {
    conversation,
    messages,
    branchMap,
    isLoading,
    isStreaming,
    sendMessage,
    regenerateMessage,
    editMessage,
    deleteMessage,
    switchBranch,
  };
}