import { useCallback, useLayoutEffect, useRef } from 'react';
import type { ChatMessage } from '@/lib/ai/types';
import type { CurrentTurnAnchorMode, MutableValue } from './messageAutoscrollTypes';

interface PendingEditAnchor {
  followingMessageId: string | null;
  messageId: string;
}

interface PendingRegenerateAnchor {
  content: string;
  currentVersionCreatedAt: number | null;
  currentVersionIndex: number;
  messageId: string;
  versionCount: number;
}

interface CurrentTurnActionRefs {
  currentTurnAnchorModeRef: MutableValue<CurrentTurnAnchorMode>;
  isAutoFollowRef: MutableValue<boolean>;
  isCurrentTurnAnchoredRef: MutableValue<boolean>;
  pendingChatCreationAnchorRef: MutableValue<boolean>;
  pendingScrollMessageCountRef: MutableValue<number | null>;
  pendingScrollToCurrentTurnRef: MutableValue<boolean>;
  userDetachedFromCurrentTurnRef: MutableValue<boolean>;
}

function activateCurrentTurnTopAnchor(refs: CurrentTurnActionRefs): void {
  refs.pendingScrollToCurrentTurnRef.current = false;
  refs.pendingScrollMessageCountRef.current = null;
  refs.pendingChatCreationAnchorRef.current = false;
  refs.isCurrentTurnAnchoredRef.current = true;
  refs.currentTurnAnchorModeRef.current = 'top';
  refs.userDetachedFromCurrentTurnRef.current = false;
  refs.isAutoFollowRef.current = true;
}

function prepareRegenerateMessageAutoscroll({
  messageId,
  messages,
  pendingEditAnchorRef,
  pendingRegenerateAnchorRef,
  refs,
}: {
  messageId: string;
  messages: ChatMessage[];
  pendingEditAnchorRef: MutableValue<PendingEditAnchor | null>;
  pendingRegenerateAnchorRef: MutableValue<PendingRegenerateAnchor | null>;
  refs: CurrentTurnActionRefs;
}): void {
  const messageIndex = messages.findIndex((message) => message.id === messageId);
  const message = messages[messageIndex];
  const promptMessage = messageIndex > 0 ? messages[messageIndex - 1] : null;
  if (messageIndex < 0 || message?.role !== 'assistant' || promptMessage?.role !== 'user') return;

  pendingEditAnchorRef.current = null;
  if (messageIndex !== messages.length - 1) {
    pendingRegenerateAnchorRef.current = null;
    refs.isAutoFollowRef.current = false;
    refs.isCurrentTurnAnchoredRef.current = false;
    refs.userDetachedFromCurrentTurnRef.current = true;
    return;
  }

  const currentVersionIndex = message.currentVersionIndex ?? 0;
  pendingRegenerateAnchorRef.current = {
    content: message.content,
    currentVersionCreatedAt: message.versions?.[currentVersionIndex]?.createdAt ?? null,
    currentVersionIndex,
    messageId,
    versionCount: message.versions?.length ?? 0,
  };
  refs.isAutoFollowRef.current = false;
  refs.isCurrentTurnAnchoredRef.current = false;
  refs.userDetachedFromCurrentTurnRef.current = false;
}

function prepareEditMessageAutoscroll(
  messageId: string,
  messages: ChatMessage[],
  pendingEditAnchorRef: MutableValue<PendingEditAnchor | null>,
  pendingRegenerateAnchorRef: MutableValue<PendingRegenerateAnchor | null>,
  refs: CurrentTurnActionRefs,
): void {
  const messageIndex = messages.findIndex((message) => message.id === messageId && message.role === 'user');
  if (messageIndex < 0) return;
  pendingEditAnchorRef.current = {
    followingMessageId: messages[messageIndex + 1]?.id ?? null,
    messageId,
  };
  pendingRegenerateAnchorRef.current = null;
  refs.isAutoFollowRef.current = false;
  refs.isCurrentTurnAnchoredRef.current = false;
  refs.userDetachedFromCurrentTurnRef.current = false;
}

function usePendingEditMessageAutoscroll({
  active,
  isStreaming,
  messages,
  pendingEditAnchorRef,
  refs,
  scrollCurrentTurnIntoView,
  updateSpacerHeight,
}: {
  active: boolean;
  isStreaming: boolean;
  messages: ChatMessage[];
  pendingEditAnchorRef: MutableValue<PendingEditAnchor | null>;
  refs: CurrentTurnActionRefs;
  scrollCurrentTurnIntoView: () => 'estimated' | 'rendered' | false;
  updateSpacerHeight: () => void;
}): void {
  useLayoutEffect(() => {
    const pendingAnchor = pendingEditAnchorRef.current;
    if (!active || !isStreaming || !pendingAnchor || messages.length < 2) return;
    const userMessage = messages[messages.length - 2];
    const assistantMessage = messages[messages.length - 1];
    if (
      userMessage?.id !== pendingAnchor.messageId ||
      userMessage.role !== 'user' ||
      assistantMessage?.role !== 'assistant' ||
      assistantMessage.id === pendingAnchor.followingMessageId
    ) return;

    pendingEditAnchorRef.current = null;
    activateCurrentTurnTopAnchor(refs);
    updateSpacerHeight();
    scrollCurrentTurnIntoView();
  }, [active, isStreaming, messages, pendingEditAnchorRef, refs, scrollCurrentTurnIntoView, updateSpacerHeight]);
}

function usePendingRegenerateMessageAutoscroll({
  active,
  isStreaming,
  messages,
  pendingRegenerateAnchorRef,
  refs,
  scrollCurrentTurnIntoView,
  updateSpacerHeight,
}: {
  active: boolean;
  isStreaming: boolean;
  messages: ChatMessage[];
  pendingRegenerateAnchorRef: MutableValue<PendingRegenerateAnchor | null>;
  refs: CurrentTurnActionRefs;
  scrollCurrentTurnIntoView: () => 'estimated' | 'rendered' | false;
  updateSpacerHeight: () => void;
}): void {
  useLayoutEffect(() => {
    const pendingAnchor = pendingRegenerateAnchorRef.current;
    if (!active || !isStreaming || !pendingAnchor) return;
    const assistantMessage = messages[messages.length - 1];
    if (assistantMessage?.id !== pendingAnchor.messageId || assistantMessage.role !== 'assistant') return;

    const currentVersionIndex = assistantMessage.currentVersionIndex ?? 0;
    const hasRegeneratedVersion =
      assistantMessage.content !== pendingAnchor.content ||
      currentVersionIndex !== pendingAnchor.currentVersionIndex ||
      (assistantMessage.versions?.length ?? 0) !== pendingAnchor.versionCount ||
      (assistantMessage.versions?.[currentVersionIndex]?.createdAt ?? null) !== pendingAnchor.currentVersionCreatedAt;
    if (!hasRegeneratedVersion) return;

    pendingRegenerateAnchorRef.current = null;
    activateCurrentTurnTopAnchor(refs);
    updateSpacerHeight();
    scrollCurrentTurnIntoView();
  }, [active, isStreaming, messages, pendingRegenerateAnchorRef, refs, scrollCurrentTurnIntoView, updateSpacerHeight]);
}

export function useMessageAutoscrollActions({
  active,
  chatId,
  isStreaming,
  messages,
  refs,
  scrollCurrentTurnIntoView,
  updateSpacerHeight,
}: {
  active: boolean;
  chatId: string | null;
  isStreaming: boolean;
  messages: ChatMessage[];
  refs: CurrentTurnActionRefs;
  scrollCurrentTurnIntoView: () => 'estimated' | 'rendered' | false;
  updateSpacerHeight: () => void;
}) {
  const pendingEditAnchorRef = useRef<PendingEditAnchor | null>(null);
  const pendingRegenerateAnchorRef = useRef<PendingRegenerateAnchor | null>(null);
  useLayoutEffect(() => {
    pendingEditAnchorRef.current = null;
    pendingRegenerateAnchorRef.current = null;
  }, [chatId]);

  const handleNewUserMessage = useCallback(() => {
    pendingEditAnchorRef.current = null;
    pendingRegenerateAnchorRef.current = null;
    refs.pendingScrollToCurrentTurnRef.current = true;
    refs.pendingScrollMessageCountRef.current = messages.length;
    refs.pendingChatCreationAnchorRef.current = chatId === null;
    refs.isCurrentTurnAnchoredRef.current = true;
    refs.currentTurnAnchorModeRef.current = 'top';
    refs.userDetachedFromCurrentTurnRef.current = false;
    refs.isAutoFollowRef.current = true;
  }, [chatId, messages.length, refs]);
  const handleRegenerateMessage = useCallback((messageId: string) => {
    prepareRegenerateMessageAutoscroll({
      messageId,
      messages,
      pendingEditAnchorRef,
      pendingRegenerateAnchorRef,
      refs,
    });
  }, [messages, refs]);
  const handleEditMessage = useCallback((messageId: string) => {
    prepareEditMessageAutoscroll(messageId, messages, pendingEditAnchorRef, pendingRegenerateAnchorRef, refs);
  }, [messages, refs]);

  usePendingEditMessageAutoscroll({
    active,
    isStreaming,
    messages,
    pendingEditAnchorRef,
    refs,
    scrollCurrentTurnIntoView,
    updateSpacerHeight,
  });
  usePendingRegenerateMessageAutoscroll({
    active,
    isStreaming,
    messages,
    pendingRegenerateAnchorRef,
    refs,
    scrollCurrentTurnIntoView,
    updateSpacerHeight,
  });

  return { handleEditMessage, handleNewUserMessage, handleRegenerateMessage };
}
