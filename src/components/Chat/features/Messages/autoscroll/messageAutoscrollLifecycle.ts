import type { Dispatch, RefObject, SetStateAction } from "react";
import { useEffect, useLayoutEffect } from "react";
import type { ChatMessage } from "@/lib/ai/types";
import type { CurrentTurnAnchorMode, MutableValue } from "./messageAutoscrollTypes";
import {
  CURRENT_TURN_ANCHOR_MAX_ATTEMPTS,
  CURRENT_TURN_REANCHOR_TOLERANCE,
  resolveUserMessageAnchorTop,
} from "./messageAutoscrollLayout";

export function useMessageAutoscrollLifecycle({
  active,
  chatId,
  containerRef,
  currentTurnAnchorModeRef,
  currentTurnTopSpacerHeight,
  currentTurnTopSpacerHeightRef,
  getLastUserMessageIndex,
  hasVisibleAssistantOutput,
  initialScrollPendingRef,
  isAutoFollowRef,
  isCurrentTurnAnchoredRef,
  isStreaming,
  isStreamingRef,
  messages,
  messagesRef,
  pendingChatCreationAnchorRef,
  pendingScrollMessageCountRef,
  pendingScrollToCurrentTurnRef,
  prevChatIdRef,
  restoreCurrentTurnAnchorIfOutputFits,
  scrollCurrentTurnIntoView,
  setCurrentTurnTopSpacerHeight,
  setProgrammaticScrollTop,
  setShouldScrollToBottom,
  setSpacerHeight,
  shouldScrollToBottom,
  spacerHeight,
  spacerHeightRef,
  updateSpacerHeight,
  updateSpacerHeightRef,
  userDetachedFromCurrentTurnRef,
}: {
  active: boolean;
  chatId: string | null;
  containerRef: RefObject<HTMLDivElement | null>;
  currentTurnAnchorModeRef: MutableValue<CurrentTurnAnchorMode>;
  currentTurnTopSpacerHeight: number;
  currentTurnTopSpacerHeightRef: MutableValue<number>;
  getLastUserMessageIndex: () => number;
  hasVisibleAssistantOutput: boolean;
  initialScrollPendingRef: MutableValue<boolean>;
  isAutoFollowRef: MutableValue<boolean>;
  isCurrentTurnAnchoredRef: MutableValue<boolean>;
  isStreaming: boolean;
  isStreamingRef: MutableValue<boolean>;
  messages: ChatMessage[];
  messagesRef: MutableValue<ChatMessage[]>;
  pendingChatCreationAnchorRef: MutableValue<boolean>;
  pendingScrollMessageCountRef: MutableValue<number | null>;
  pendingScrollToCurrentTurnRef: MutableValue<boolean>;
  prevChatIdRef: MutableValue<string | null>;
  restoreCurrentTurnAnchorIfOutputFits: () => boolean;
  scrollCurrentTurnIntoView: () => "estimated" | "rendered" | false;
  setCurrentTurnTopSpacerHeight: Dispatch<SetStateAction<number>>;
  setProgrammaticScrollTop: (container: HTMLElement, nextScrollTop: number) => number;
  setShouldScrollToBottom: Dispatch<SetStateAction<boolean>>;
  setSpacerHeight: Dispatch<SetStateAction<number>>;
  shouldScrollToBottom: boolean;
  spacerHeight: number;
  spacerHeightRef: MutableValue<number>;
  updateSpacerHeight: () => void;
  updateSpacerHeightRef: MutableValue<() => void>;
  userDetachedFromCurrentTurnRef: MutableValue<boolean>;
}): void {
  useEffect(() => {
    updateSpacerHeightRef.current = updateSpacerHeight;
  }, [updateSpacerHeight, updateSpacerHeightRef]);

  useLayoutEffect(() => {
    spacerHeightRef.current = spacerHeight;
  }, [spacerHeight, spacerHeightRef]);

  useLayoutEffect(() => {
    currentTurnTopSpacerHeightRef.current = currentTurnTopSpacerHeight;
  }, [currentTurnTopSpacerHeight, currentTurnTopSpacerHeightRef]);

  useLayoutEffect(() => {
    if (prevChatIdRef.current === chatId) {
      return;
    }

    const shouldPreserveCurrentTurnAnchor =
      pendingScrollToCurrentTurnRef.current || pendingChatCreationAnchorRef.current;
    prevChatIdRef.current = chatId;
    isAutoFollowRef.current = true;

    if (shouldPreserveCurrentTurnAnchor) {
      pendingChatCreationAnchorRef.current = false;
      initialScrollPendingRef.current = false;
      setShouldScrollToBottom(false);
      return;
    }

    pendingChatCreationAnchorRef.current = false;
    pendingScrollToCurrentTurnRef.current = false;
    pendingScrollMessageCountRef.current = null;
    isCurrentTurnAnchoredRef.current = false;
    currentTurnAnchorModeRef.current = "near-composer";
    userDetachedFromCurrentTurnRef.current = false;
    initialScrollPendingRef.current = !!chatId;
    currentTurnTopSpacerHeightRef.current = 0;
    setCurrentTurnTopSpacerHeight(0);
    setSpacerHeight(0);
    setShouldScrollToBottom(!!chatId);
  }, [
    chatId, currentTurnAnchorModeRef, currentTurnTopSpacerHeightRef, initialScrollPendingRef, isAutoFollowRef,
    isCurrentTurnAnchoredRef, pendingChatCreationAnchorRef, pendingScrollMessageCountRef, pendingScrollToCurrentTurnRef,
    prevChatIdRef, setCurrentTurnTopSpacerHeight, setShouldScrollToBottom, setSpacerHeight, userDetachedFromCurrentTurnRef,
  ]);

  useLayoutEffect(() => {
    const previous = isStreamingRef.current;
    isStreamingRef.current = isStreaming;
    if (!active) {
      return;
    }

    if (previous && !isStreaming && isCurrentTurnAnchoredRef.current) {
      const previousLastUserMessage = [...messagesRef.current]
        .reverse()
        .find((message) => message.role === "user");
      const currentLastUserMessage = messages[getLastUserMessageIndex()];
      if (previousLastUserMessage?.id !== currentLastUserMessage?.id) {
        isAutoFollowRef.current = false;
        isCurrentTurnAnchoredRef.current = false;
        currentTurnAnchorModeRef.current = "near-composer";
        userDetachedFromCurrentTurnRef.current = false;
        currentTurnTopSpacerHeightRef.current = 0;
        setCurrentTurnTopSpacerHeight(0);
        setSpacerHeight(0);
        return;
      }

      updateSpacerHeightRef.current();
      restoreCurrentTurnAnchorIfOutputFits();

      let secondFrameId: number | null = null;
      const firstFrameId = requestAnimationFrame(() => {
        updateSpacerHeightRef.current();
        restoreCurrentTurnAnchorIfOutputFits();
        secondFrameId = requestAnimationFrame(() => {
          updateSpacerHeightRef.current();
          restoreCurrentTurnAnchorIfOutputFits();
        });
      });

      return () => {
        cancelAnimationFrame(firstFrameId);
        if (secondFrameId !== null) {
          cancelAnimationFrame(secondFrameId);
        }
      };
    }
  }, [
    active, currentTurnAnchorModeRef, currentTurnTopSpacerHeightRef, getLastUserMessageIndex, isAutoFollowRef,
    isCurrentTurnAnchoredRef, isStreaming, isStreamingRef, messages, messagesRef, restoreCurrentTurnAnchorIfOutputFits,
    setCurrentTurnTopSpacerHeight, setSpacerHeight, updateSpacerHeightRef, userDetachedFromCurrentTurnRef,
  ]);

  useLayoutEffect(() => {
    messagesRef.current = messages;
  }, [messages, messagesRef]);

  useLayoutEffect(() => {
    if (
      !active ||
      !pendingScrollToCurrentTurnRef.current ||
      pendingScrollMessageCountRef.current === null ||
      messages.length <= pendingScrollMessageCountRef.current ||
      !containerRef.current
    ) {
      return;
    }

    updateSpacerHeight();
    const initialAnchorResult = scrollCurrentTurnIntoView();
    if (initialAnchorResult === "rendered") {
      pendingScrollToCurrentTurnRef.current = false;
      pendingScrollMessageCountRef.current = null;
      isAutoFollowRef.current = true;
      return;
    }

    let frameId = 0;
    let attempts = 0;
    const retryUntilRendered = () => {
      frameId = requestAnimationFrame(() => {
        attempts += 1;
        const result = scrollCurrentTurnIntoView();
        if (result === "rendered" || attempts >= CURRENT_TURN_ANCHOR_MAX_ATTEMPTS) {
          pendingScrollToCurrentTurnRef.current = false;
          pendingScrollMessageCountRef.current = null;
          return;
        }
        retryUntilRendered();
      });
    };
    retryUntilRendered();
    isAutoFollowRef.current = true;
    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [
    active, containerRef, isAutoFollowRef, messages, pendingScrollMessageCountRef, pendingScrollToCurrentTurnRef,
    scrollCurrentTurnIntoView, updateSpacerHeight,
  ]);

  useLayoutEffect(() => {
    if (
      !active ||
      !initialScrollPendingRef.current ||
      !chatId ||
      !messages.length ||
      !containerRef.current
    ) {
      return;
    }

    const container = containerRef.current;
    setProgrammaticScrollTop(container, container.scrollHeight);
    isAutoFollowRef.current = true;
    initialScrollPendingRef.current = false;
  }, [active, chatId, containerRef, initialScrollPendingRef, isAutoFollowRef, messages.length, setProgrammaticScrollTop]);

  useLayoutEffect(() => {
    if (!active || !shouldScrollToBottom || !messages.length || !containerRef.current) {
      return;
    }

    const container = containerRef.current;
    setProgrammaticScrollTop(container, container.scrollHeight);
    isAutoFollowRef.current = true;
    setShouldScrollToBottom(false);
  }, [active, containerRef, isAutoFollowRef, messages, setProgrammaticScrollTop, setShouldScrollToBottom, shouldScrollToBottom]);

  useLayoutEffect(() => {
    if (
      !active ||
      !isStreaming ||
      spacerHeight <= 0 ||
      !isCurrentTurnAnchoredRef.current ||
      userDetachedFromCurrentTurnRef.current ||
      hasVisibleAssistantOutput ||
      !containerRef.current
    ) {
      return;
    }

    const container = containerRef.current;
    const lastUserIndex = getLastUserMessageIndex();
    const row = lastUserIndex >= 0
      ? container.querySelector<HTMLElement>(`[data-message-index="${lastUserIndex}"]`)
      : null;
    if (!row) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const targetTopOffset = resolveUserMessageAnchorTop(
      container.clientHeight,
      rowRect.height,
      currentTurnAnchorModeRef.current,
    );
    if (Math.abs(rowRect.top - containerRect.top - targetTopOffset) <= CURRENT_TURN_REANCHOR_TOLERANCE) {
      return;
    }

    const rafId = requestAnimationFrame(() => {
      scrollCurrentTurnIntoView();
    });

    return () => cancelAnimationFrame(rafId);
  }, [
    active, containerRef, currentTurnAnchorModeRef, getLastUserMessageIndex, hasVisibleAssistantOutput,
    isCurrentTurnAnchoredRef, isStreaming, scrollCurrentTurnIntoView, spacerHeight, userDetachedFromCurrentTurnRef,
  ]);

  useLayoutEffect(() => {
    updateSpacerHeight();
  }, [active, messages, updateSpacerHeight]);

  useEffect(() => {
    updateSpacerHeight();
  }, [active, isStreaming, updateSpacerHeight]);
}
