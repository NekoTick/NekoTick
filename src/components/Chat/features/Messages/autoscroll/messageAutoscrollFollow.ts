import type { ChatMessage } from "@/lib/ai/types";
import {
  ACTIVE_OUTPUT_OVERFLOW_THRESHOLD,
  hasUsableScrollContainer,
} from "./messageAutoscrollLayout";

type MutableValue<T> = { current: T };

export function scheduleActiveOutputFollow({
  active,
  activeOutputFollowRafRef,
  container,
  isAutoFollowRef,
  isCurrentTurnAnchoredRef,
  isStreamingRef,
  messagesRef,
  setProgrammaticScrollTop,
}: {
  active: boolean;
  activeOutputFollowRafRef: MutableValue<number | null>;
  container: HTMLElement | null;
  isAutoFollowRef: MutableValue<boolean>;
  isCurrentTurnAnchoredRef: MutableValue<boolean>;
  isStreamingRef: MutableValue<boolean>;
  messagesRef: MutableValue<ChatMessage[]>;
  setProgrammaticScrollTop: (container: HTMLElement, nextScrollTop: number) => number;
}): void {
  if (!active || !isAutoFollowRef.current || !container) {
    return;
  }

  if (!hasUsableScrollContainer(container)) {
    return;
  }

  if (activeOutputFollowRafRef.current !== null) {
    return;
  }

  activeOutputFollowRafRef.current = 0;
  const activeOutputFollowRafId = requestAnimationFrame(() => {
    activeOutputFollowRafRef.current = null;
    if (!hasUsableScrollContainer(container)) {
      return;
    }

    if (!isStreamingRef.current || !isAutoFollowRef.current) {
      return;
    }

    if (isCurrentTurnAnchoredRef.current) {
      const activeMessages = messagesRef.current;
      const lastMessageIndex = activeMessages.length - 1;
      const row = container.querySelector<HTMLElement>(`[data-message-index="${lastMessageIndex}"]`);
      if (!row) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const overflow = rowRect.bottom - containerRect.bottom;
      if (overflow > ACTIVE_OUTPUT_OVERFLOW_THRESHOLD) {
        setProgrammaticScrollTop(container, container.scrollTop + overflow);
      }
      return;
    }

    setProgrammaticScrollTop(container, container.scrollHeight);
  });
  if (activeOutputFollowRafRef.current === 0) {
    activeOutputFollowRafRef.current = activeOutputFollowRafId;
  }
}
