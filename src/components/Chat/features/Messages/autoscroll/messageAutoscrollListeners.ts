import type { ChatMessage } from "@/lib/ai/types";
import { isEditableShortcutTarget } from "@/lib/shortcuts/editableGuards";
import {
  isEventWithinRoot,
  isUpwardKeyboardScrollIntent,
  NEAR_BOTTOM_THRESHOLD,
  STREAMING_REATTACH_BOTTOM_THRESHOLD,
} from "./messageAutoscrollLayout";
import { findLastUserMessageIndex } from "./messageAutoscrollAnchoring";

type MutableValue<T> = { current: T };

export function attachMessageAutoscrollListeners({
  container,
  detachFromStreamingFollow,
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
}: {
  container: HTMLElement;
  detachFromStreamingFollow: () => void;
  isAutoFollowRef: MutableValue<boolean>;
  isCurrentTurnAnchoredRef: MutableValue<boolean>;
  isPointerInsideScrollRootRef: MutableValue<boolean>;
  isStreamingRef: MutableValue<boolean>;
  lastObservedScrollTopRef: MutableValue<number | null>;
  lastTouchYRef: MutableValue<number | null>;
  messagesRef: MutableValue<ChatMessage[]>;
  programmaticScrollTopRef: MutableValue<number | null>;
  setProgrammaticScrollTop: (container: HTMLElement, nextScrollTop: number) => number;
  userDetachedFromCurrentTurnRef: MutableValue<boolean>;
}): () => void {
  let scrollFrameId: number | null = null;
  let scrollFrameScheduled = false;

  const cancelPendingScrollFrame = () => {
    if (scrollFrameId !== null) {
      window.cancelAnimationFrame(scrollFrameId);
    }
    scrollFrameId = null;
    scrollFrameScheduled = false;
  };

  const processScrollPosition = (currentScrollTop: number) => {
    if (
      isCurrentTurnAnchoredRef.current &&
      isAutoFollowRef.current &&
      !userDetachedFromCurrentTurnRef.current
    ) {
      const activeMessages = messagesRef.current;
      const lastUserIndex = findLastUserMessageIndex(activeMessages);

      const userRow = lastUserIndex >= 0
        ? container.querySelector<HTMLElement>(`[data-message-index="${lastUserIndex}"]`)
        : null;
      const lastRow = activeMessages.length > 0
        ? container.querySelector<HTMLElement>(`[data-message-index="${activeMessages.length - 1}"]`)
        : null;

      if (userRow && lastRow) {
        const containerRect = container.getBoundingClientRect();
        const userRect = userRow.getBoundingClientRect();
        const lastRect = lastRow.getBoundingClientRect();
        const currentUserTopOffset = userRect.top - containerRect.top;
        const outputBottomOffset = lastRect.bottom - containerRect.top;
        const currentUserTop = currentUserTopOffset + currentScrollTop;
        const outputBottom = outputBottomOffset + currentScrollTop;
        const outputBottomScrollTop = outputBottom - container.clientHeight;

        const maxUsefulScrollTop = Math.max(
          currentUserTop,
          outputBottomScrollTop,
        );

        if (currentScrollTop > maxUsefulScrollTop + 1) {
          setProgrammaticScrollTop(container, maxUsefulScrollTop);
          return;
        }
      }
    }

    const distanceToBottom = container.scrollHeight - (currentScrollTop + container.clientHeight);
    const shouldReattach = isStreamingRef.current
      ? distanceToBottom <= STREAMING_REATTACH_BOTTOM_THRESHOLD
      : distanceToBottom <= NEAR_BOTTOM_THRESHOLD;

    if (shouldReattach) {
      isAutoFollowRef.current = true;
      userDetachedFromCurrentTurnRef.current = false;
      return;
    }

    if (isStreamingRef.current) {
      detachFromStreamingFollow();
    }
  };

  const scheduleScrollProcessing = () => {
    if (scrollFrameScheduled) {
      return;
    }

    scrollFrameScheduled = true;
    const frameId = window.requestAnimationFrame(() => {
      scrollFrameId = null;
      scrollFrameScheduled = false;
      processScrollPosition(container.scrollTop);
    });
    if (scrollFrameScheduled) {
      scrollFrameId = frameId;
    }
  };

  const observeScroll = (deferProcessing: boolean) => {
    const currentScrollTop = container.scrollTop;
    const previousScrollTop = lastObservedScrollTopRef.current;
    if (
      programmaticScrollTopRef.current !== null &&
      Math.abs(currentScrollTop - programmaticScrollTopRef.current) <= 1
    ) {
      cancelPendingScrollFrame();
      programmaticScrollTopRef.current = null;
      lastObservedScrollTopRef.current = currentScrollTop;
      return;
    }

    const userScrolledUp =
      previousScrollTop !== null && currentScrollTop < previousScrollTop - 1;
    lastObservedScrollTopRef.current = currentScrollTop;

    if (isStreamingRef.current && userScrolledUp) {
      cancelPendingScrollFrame();
      detachFromStreamingFollow();
      return;
    }

    if (deferProcessing) {
      scheduleScrollProcessing();
    } else {
      processScrollPosition(currentScrollTop);
    }
  };

  const handleScroll = () => {
    observeScroll(true);
  };

  const handleWheel = (event: WheelEvent) => {
    if (!isStreamingRef.current || event.deltaY >= 0) {
      return;
    }

    cancelPendingScrollFrame();
    detachFromStreamingFollow();
  };

  const handleTouchStart = (event: TouchEvent) => {
    lastTouchYRef.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (event: TouchEvent) => {
    if (!isStreamingRef.current) {
      return;
    }

    const nextTouchY = event.touches[0]?.clientY ?? null;
    const previousTouchY = lastTouchYRef.current;
    lastTouchYRef.current = nextTouchY;

    if (nextTouchY === null || previousTouchY === null) {
      return;
    }

    if (nextTouchY > previousTouchY + 2) {
      cancelPendingScrollFrame();
      detachFromStreamingFollow();
    }
  };

  const handlePointerEnter = () => {
    isPointerInsideScrollRootRef.current = true;
  };

  const handlePointerLeave = () => {
    isPointerInsideScrollRootRef.current = false;
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (
      !isStreamingRef.current ||
      event.isComposing ||
      !isUpwardKeyboardScrollIntent(event) ||
      isEditableShortcutTarget(event.target)
    ) {
      return;
    }

    if (
      isEventWithinRoot(container, event.target) ||
      isPointerInsideScrollRootRef.current
    ) {
      cancelPendingScrollFrame();
      detachFromStreamingFollow();
    }
  };

  container.addEventListener("scroll", handleScroll, { passive: true });
  container.addEventListener("wheel", handleWheel, { passive: true });
  container.addEventListener("touchstart", handleTouchStart, { passive: true });
  container.addEventListener("touchmove", handleTouchMove, { passive: true });
  container.addEventListener("pointerenter", handlePointerEnter);
  container.addEventListener("pointerleave", handlePointerLeave);
  document.addEventListener("keydown", handleKeyDown, true);
  observeScroll(false);

  return () => {
    cancelPendingScrollFrame();
    container.removeEventListener("scroll", handleScroll);
    container.removeEventListener("wheel", handleWheel);
    container.removeEventListener("touchstart", handleTouchStart);
    container.removeEventListener("touchmove", handleTouchMove);
    container.removeEventListener("pointerenter", handlePointerEnter);
    container.removeEventListener("pointerleave", handlePointerLeave);
    document.removeEventListener("keydown", handleKeyDown, true);
    lastTouchYRef.current = null;
    isPointerInsideScrollRootRef.current = false;
  };
}
