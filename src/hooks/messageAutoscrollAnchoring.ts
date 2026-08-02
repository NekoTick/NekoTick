import type { ChatMessage } from "@/lib/ai/types";
import {
  buildChatMessageFrameLayout,
  CHAT_MESSAGE_LIST_GAP,
} from "@/components/Chat/features/Layout/chatMessageFrames";
import { normalizeChatContainerWidth } from "@/components/Chat/features/Layout/chatWidthBuckets";
import type { CurrentTurnAnchorMode } from "./messageAutoscrollTypes";
import { resolveUserMessageAnchorTop } from "./messageAutoscrollLayout";

export function findLastUserMessageIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      return i;
    }
  }
  return -1;
}

export function scrollCurrentTurnIntoViewForContainer({
  active,
  container,
  messages,
  chatId,
  isStreaming,
  currentTurnAnchorMode,
  currentTurnTopSpacerHeight,
  setProgrammaticScrollTop,
}: {
  active: boolean;
  container: HTMLElement | null;
  messages: ChatMessage[];
  chatId: string | null;
  isStreaming: boolean;
  currentTurnAnchorMode: CurrentTurnAnchorMode;
  currentTurnTopSpacerHeight: number;
  setProgrammaticScrollTop: (container: HTMLElement, nextScrollTop: number) => number;
}): "estimated" | "rendered" | false {
  if (!active || !container) {
    return false;
  }

  const lastUserIndex = findLastUserMessageIndex(messages);
  if (lastUserIndex < 0) {
    return false;
  }

  const layoutWidth = normalizeChatContainerWidth(container.clientWidth);
  const estimatedLayout = buildChatMessageFrameLayout(messages, {
    cacheKey: chatId,
    containerWidth: layoutWidth,
    isSessionActive: isStreaming,
  });
  const targetFrame = estimatedLayout.items[lastUserIndex];
  if (!targetFrame) {
    return false;
  }
  const desiredTopOffset = resolveUserMessageAnchorTop(
    container.clientHeight,
    targetFrame.height,
    currentTurnAnchorMode,
  );
  const desiredTopSpacerHeight = Math.max(0, desiredTopOffset - targetFrame.top);
  const isTopSpacerReady = Math.abs(currentTurnTopSpacerHeight - desiredTopSpacerHeight) <= 1;

  const row = container.querySelector<HTMLElement>(`[data-message-index="${lastUserIndex}"]`);
  if (row) {
    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const renderedDesiredTopOffset = resolveUserMessageAnchorTop(
      container.clientHeight,
      rowRect.height,
      currentTurnAnchorMode,
    );
    const nextScrollTop = container.scrollTop + rowRect.top - containerRect.top - renderedDesiredTopOffset;
    const actualScrollTop = setProgrammaticScrollTop(container, nextScrollTop);
    return Math.abs(actualScrollTop - nextScrollTop) <= 1 && isTopSpacerReady ? "rendered" : "estimated";
  }

  const containerRect = container.getBoundingClientRect();
  const renderedRows = Array.from(
    container.querySelectorAll<HTMLElement>("[data-message-index]"),
  );
  let previousRenderedRow: HTMLElement | null = null;
  let previousRenderedIndex = -1;

  for (const renderedRow of renderedRows) {
    const renderedIndex = Number(renderedRow.dataset.messageIndex);
    if (
      Number.isInteger(renderedIndex) &&
      renderedIndex < lastUserIndex &&
      renderedIndex > previousRenderedIndex
    ) {
      previousRenderedIndex = renderedIndex;
      previousRenderedRow = renderedRow;
    }
  }

  const targetEstimatedScrollTop = targetFrame.top + desiredTopSpacerHeight - desiredTopOffset;

  if (previousRenderedRow) {
    const previousFrame = estimatedLayout.items[previousRenderedIndex];
    const previousRect = previousRenderedRow.getBoundingClientRect();
    const previousBottom = previousRect.bottom - containerRect.top + container.scrollTop;
    const previousEstimatedBottom = previousFrame?.bottom ?? 0;
    const estimatedDistanceToTarget = Math.max(
      CHAT_MESSAGE_LIST_GAP,
      targetEstimatedScrollTop - previousEstimatedBottom,
    );
    const requestedScrollTop = previousBottom + estimatedDistanceToTarget - desiredTopOffset;
    setProgrammaticScrollTop(container, requestedScrollTop);
    return "estimated";
  }

  setProgrammaticScrollTop(container, targetEstimatedScrollTop);
  return "estimated";
}

export function restoreCurrentTurnAnchorIfOutputFitsForContainer({
  active,
  container,
  isCurrentTurnAnchored,
  userDetachedFromCurrentTurn,
  messages,
  chatId,
  isStreaming,
  currentTurnAnchorMode,
  currentTurnTopSpacerHeight,
  setProgrammaticScrollTop,
}: {
  active: boolean;
  container: HTMLElement | null;
  isCurrentTurnAnchored: boolean;
  userDetachedFromCurrentTurn: boolean;
  messages: ChatMessage[];
  chatId: string | null;
  isStreaming: boolean;
  currentTurnAnchorMode: CurrentTurnAnchorMode;
  currentTurnTopSpacerHeight: number;
  setProgrammaticScrollTop: (container: HTMLElement, nextScrollTop: number) => number;
}): boolean {
  if (!active || !container || !isCurrentTurnAnchored || userDetachedFromCurrentTurn) {
    return false;
  }

  const lastUserIndex = findLastUserMessageIndex(messages);
  if (lastUserIndex < 0) {
    return false;
  }

  const userRow = lastUserIndex >= 0
    ? container.querySelector<HTMLElement>(`[data-message-index="${lastUserIndex}"]`)
    : null;
  const lastRow = messages.length > 0
    ? container.querySelector<HTMLElement>(`[data-message-index="${messages.length - 1}"]`)
    : null;

  if (userRow && lastRow) {
    const containerRect = container.getBoundingClientRect();
    const userRect = userRow.getBoundingClientRect();
    const lastRect = lastRow.getBoundingClientRect();
    const desiredUserTopOffset = resolveUserMessageAnchorTop(
      container.clientHeight,
      userRect.height,
      currentTurnAnchorMode,
    );
    const currentTurnHeight = Math.max(
      userRect.height,
      lastRect.bottom - userRect.top,
    );
    if (desiredUserTopOffset + currentTurnHeight > container.clientHeight + 1) {
      return false;
    }

    const restoreOffset = userRect.top - containerRect.top - desiredUserTopOffset;
    if (Math.abs(restoreOffset) > 1) {
      setProgrammaticScrollTop(container, container.scrollTop + restoreOffset);
    }
    return true;
  }

  const layoutWidth = normalizeChatContainerWidth(container.clientWidth);
  const estimatedLayout = buildChatMessageFrameLayout(messages, {
    cacheKey: chatId,
    containerWidth: layoutWidth,
    isSessionActive: isStreaming,
  });
  const targetFrame = estimatedLayout.items[lastUserIndex];
  const lastFrame = estimatedLayout.items[estimatedLayout.items.length - 1];
  if (!targetFrame || !lastFrame) {
    return false;
  }

  const desiredUserTopOffset = resolveUserMessageAnchorTop(
    container.clientHeight,
    targetFrame.height,
    currentTurnAnchorMode,
  );
  if (
    desiredUserTopOffset + lastFrame.bottom - targetFrame.top >
    container.clientHeight + 1
  ) {
    return false;
  }

  return scrollCurrentTurnIntoViewForContainer({
    active,
    container,
    messages,
    chatId,
    isStreaming,
    currentTurnAnchorMode,
    currentTurnTopSpacerHeight,
    setProgrammaticScrollTop,
  }) !== false;
}
