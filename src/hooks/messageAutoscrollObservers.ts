import type { RefObject } from "react";
import { useEffect, useLayoutEffect } from "react";
import type { ChatMessage } from "@/lib/ai/types";
import type { CurrentTurnAnchorMode, MutableValue } from "./messageAutoscrollTypes";
import { attachMessageAutoscrollListeners } from "./messageAutoscrollListeners";

export function useMessageAutoscrollObservers({
  active,
  activeOutputFollowRafRef,
  cancelScheduledSpacerHeightUpdate,
  containerRef,
  contentResizeObserverRef,
  currentTurnAnchorModeRef,
  hasVisibleAssistantOutput,
  isAutoFollowRef,
  isCurrentTurnAnchoredRef,
  isPointerInsideScrollRootRef,
  isStreaming,
  isStreamingRef,
  lastContainerHeightRef,
  lastObservedScrollTopRef,
  lastTouchYRef,
  messages,
  messagesRef,
  observedContainerRef,
  observedContentRef,
  pendingChatCreationAnchorRef,
  pendingScrollMessageCountRef,
  pendingScrollToCurrentTurnRef,
  programmaticScrollTopRef,
  resizeObserverRef,
  restoreCurrentTurnAnchorIfOutputFitsRef,
  scheduleSpacerHeightUpdate,
  scrollActiveOutputIfNeeded,
  scrollActiveOutputIfNeededRef,
  setProgrammaticScrollTop,
  userDetachedFromCurrentTurnRef,
}: {
  active: boolean;
  activeOutputFollowRafRef: MutableValue<number | null>;
  cancelScheduledSpacerHeightUpdate: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
  contentResizeObserverRef: MutableValue<ResizeObserver | null>;
  currentTurnAnchorModeRef: MutableValue<CurrentTurnAnchorMode>;
  hasVisibleAssistantOutput: boolean;
  isAutoFollowRef: MutableValue<boolean>;
  isCurrentTurnAnchoredRef: MutableValue<boolean>;
  isPointerInsideScrollRootRef: MutableValue<boolean>;
  isStreaming: boolean;
  isStreamingRef: MutableValue<boolean>;
  lastContainerHeightRef: MutableValue<number>;
  lastObservedScrollTopRef: MutableValue<number | null>;
  lastTouchYRef: MutableValue<number | null>;
  messages: ChatMessage[];
  messagesRef: MutableValue<ChatMessage[]>;
  observedContainerRef: MutableValue<HTMLDivElement | null>;
  observedContentRef: MutableValue<Element | null>;
  pendingChatCreationAnchorRef: MutableValue<boolean>;
  pendingScrollMessageCountRef: MutableValue<number | null>;
  pendingScrollToCurrentTurnRef: MutableValue<boolean>;
  programmaticScrollTopRef: MutableValue<number | null>;
  resizeObserverRef: MutableValue<ResizeObserver | null>;
  restoreCurrentTurnAnchorIfOutputFitsRef: MutableValue<() => boolean>;
  scheduleSpacerHeightUpdate: () => void;
  scrollActiveOutputIfNeeded: () => void;
  scrollActiveOutputIfNeededRef: MutableValue<() => void>;
  setProgrammaticScrollTop: (container: HTMLElement, nextScrollTop: number) => number;
  userDetachedFromCurrentTurnRef: MutableValue<boolean>;
}): void {
  useEffect(() => {
    scrollActiveOutputIfNeededRef.current = scrollActiveOutputIfNeeded;
  }, [scrollActiveOutputIfNeeded, scrollActiveOutputIfNeededRef]);

  useEffect(() => {
    if (!active) {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      observedContainerRef.current = null;
      cancelScheduledSpacerHeightUpdate();
      return;
    }

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const container = containerRef.current;
    if (!container || observedContainerRef.current === container) {
      return;
    }

    resizeObserverRef.current?.disconnect();
    const resizeObserver = new ResizeObserver(() => {
      scheduleSpacerHeightUpdate();
    });

    resizeObserver.observe(container);
    resizeObserverRef.current = resizeObserver;
    observedContainerRef.current = container;
  }, [
    active,
    cancelScheduledSpacerHeightUpdate,
    containerRef,
    messages.length,
    observedContainerRef,
    resizeObserverRef,
    scheduleSpacerHeightUpdate,
  ]);

  useEffect(() => {
    if (!active) {
      contentResizeObserverRef.current?.disconnect();
      contentResizeObserverRef.current = null;
      observedContentRef.current = null;
      cancelScheduledSpacerHeightUpdate();
      return;
    }

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const container = containerRef.current;
    const content = container?.firstElementChild;
    if (!container || !content || observedContentRef.current === content) {
      return;
    }

    contentResizeObserverRef.current?.disconnect();
    const resizeObserver = new ResizeObserver(() => {
      scheduleSpacerHeightUpdate();
      if (isStreamingRef.current) {
        if (
          isCurrentTurnAnchoredRef.current &&
          !userDetachedFromCurrentTurnRef.current &&
          restoreCurrentTurnAnchorIfOutputFitsRef.current()
        ) {
          return;
        }
        scrollActiveOutputIfNeededRef.current();
      }
    });

    resizeObserver.observe(content);
    contentResizeObserverRef.current = resizeObserver;
    observedContentRef.current = content;
  }, [
    active,
    cancelScheduledSpacerHeightUpdate,
    containerRef,
    contentResizeObserverRef,
    hasVisibleAssistantOutput,
    isCurrentTurnAnchoredRef,
    isStreamingRef,
    messages.length,
    observedContentRef,
    restoreCurrentTurnAnchorIfOutputFitsRef,
    scheduleSpacerHeightUpdate,
    scrollActiveOutputIfNeededRef,
    userDetachedFromCurrentTurnRef,
  ]);

  useLayoutEffect(() => {
    if (
      !active ||
      !isStreaming ||
      !hasVisibleAssistantOutput ||
      !isAutoFollowRef.current ||
      !containerRef.current
    ) {
      return;
    }

    const rafId = requestAnimationFrame(() => {
      scrollActiveOutputIfNeeded();
    });

    return () => cancelAnimationFrame(rafId);
  }, [active, containerRef, hasVisibleAssistantOutput, isAutoFollowRef, isStreaming, messages, scrollActiveOutputIfNeeded]);

  useEffect(() => {
    if (!active || !containerRef.current) {
      return;
    }

    const container = containerRef.current;
    if (container.clientHeight > 0) {
      lastContainerHeightRef.current = container.clientHeight;
    }
    return attachMessageAutoscrollListeners({
      container,
      detachFromStreamingFollow: () => {
        if (!isAutoFollowRef.current && userDetachedFromCurrentTurnRef.current) {
          return;
        }
        if (isCurrentTurnAnchoredRef.current) {
          userDetachedFromCurrentTurnRef.current = true;
        }
        isAutoFollowRef.current = false;
        if (activeOutputFollowRafRef.current !== null && activeOutputFollowRafRef.current !== 0) {
          cancelAnimationFrame(activeOutputFollowRafRef.current);
        }
        activeOutputFollowRafRef.current = null;
      },
      isAutoFollowRef,
      isCurrentTurnAnchoredRef,
      isPointerInsideScrollRootRef,
      isStreamingRef,
      lastObservedScrollTopRef,
      lastTouchYRef,
      messagesRef,
      programmaticScrollTopRef,
      setProgrammaticScrollTop,
      userDetachedFromCurrentTurnRef,
    });
  }, [
    active,
    activeOutputFollowRafRef,
    containerRef,
    isAutoFollowRef,
    isCurrentTurnAnchoredRef,
    isPointerInsideScrollRootRef,
    isStreamingRef,
    lastContainerHeightRef,
    lastObservedScrollTopRef,
    lastTouchYRef,
    messagesRef,
    programmaticScrollTopRef,
    setProgrammaticScrollTop,
    userDetachedFromCurrentTurnRef,
  ]);

  useEffect(() => {
    if (!active || typeof ResizeObserver !== "undefined") {
      return;
    }

    const handleResize = () => {
      scheduleSpacerHeightUpdate();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelScheduledSpacerHeightUpdate();
    };
  }, [active, cancelScheduledSpacerHeightUpdate, scheduleSpacerHeightUpdate]);

  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      contentResizeObserverRef.current?.disconnect();
      contentResizeObserverRef.current = null;
      if (activeOutputFollowRafRef.current !== null && activeOutputFollowRafRef.current !== 0) {
        cancelAnimationFrame(activeOutputFollowRafRef.current);
      }
      activeOutputFollowRafRef.current = null;
      cancelScheduledSpacerHeightUpdate();
      observedContainerRef.current = null;
      observedContentRef.current = null;
      pendingScrollToCurrentTurnRef.current = false;
      pendingScrollMessageCountRef.current = null;
      pendingChatCreationAnchorRef.current = false;
      isCurrentTurnAnchoredRef.current = false;
      currentTurnAnchorModeRef.current = "near-composer";
      userDetachedFromCurrentTurnRef.current = false;
      messagesRef.current = [];
    };
  }, []);
}
