import type { Dispatch, SetStateAction } from "react";
import type { ChatMessage } from "@/lib/ai/types";
import {
  buildChatMessageFrameLayout,
  CHAT_MESSAGE_LOADING_GAP,
  CHAT_MESSAGE_LIST_GAP,
  CHAT_MESSAGE_LIST_TOP_PADDING,
} from "@/components/Chat/features/Layout/chatMessageFrames";
import { normalizeChatContainerWidth } from "@/components/Chat/features/Layout/chatWidthBuckets";
import type { CurrentTurnAnchorMode, UseMessageAutoscrollOptions } from "./messageAutoscrollTypes";
import { findLastUserMessageIndex } from "./messageAutoscrollAnchoring";
import { computeSpacerHeight, resolveUserMessageAnchorTop } from "./messageAutoscrollLayout";

type MutableValue<T> = { current: T };

export function hasVisibleAssistantOutputAfterLastUser(messages: ChatMessage[]): boolean {
  const lastUserIndex = findLastUserMessageIndex(messages);
  if (lastUserIndex < 0) {
    return false;
  }

  for (let index = lastUserIndex + 1; index < messages.length; index += 1) {
    const message = messages[index]!;
    if (message.role === "assistant" && message.content.trim().length > 0) {
      return true;
    }
  }

  return false;
}

export function updateMessageAutoscrollSpacers({
  active,
  container,
  chatId,
  currentTurnAnchorMode,
  currentTurnTopSpacerHeightRef,
  estimateLoadingHeight,
  estimateMessageHeight,
  hasVisibleAssistantOutput,
  isCurrentTurnAnchored,
  isStreaming,
  lastContainerHeightRef,
  messages,
  setCurrentTurnTopSpacerHeight,
  setSpacerHeight,
  showLoading,
}: {
  active: boolean;
  container: HTMLElement | null;
  chatId: string | null;
  currentTurnAnchorMode: CurrentTurnAnchorMode;
  currentTurnTopSpacerHeightRef: MutableValue<number>;
  estimateLoadingHeight: UseMessageAutoscrollOptions["estimateLoadingHeight"];
  estimateMessageHeight: UseMessageAutoscrollOptions["estimateMessageHeight"];
  hasVisibleAssistantOutput: boolean;
  isCurrentTurnAnchored: boolean;
  isStreaming: boolean;
  lastContainerHeightRef: MutableValue<number>;
  messages: ChatMessage[];
  setCurrentTurnTopSpacerHeight: Dispatch<SetStateAction<number>>;
  setSpacerHeight: Dispatch<SetStateAction<number>>;
  showLoading: boolean;
}): void {
  if (!active || !container) {
    return;
  }

  const containerHeight = container.clientHeight;
  if (containerHeight <= 0 || container.clientWidth <= 0) {
    return;
  }
  lastContainerHeightRef.current = containerHeight;

  const layoutWidth = normalizeChatContainerWidth(container.clientWidth);
  const lastUserIndex = findLastUserMessageIndex(messages);

  if (lastUserIndex < 0 || (!isStreaming && !isCurrentTurnAnchored)) {
    currentTurnTopSpacerHeightRef.current = 0;
    setCurrentTurnTopSpacerHeight(0);
    setSpacerHeight(0);
    return;
  }

  let targetMessageHeight = 0;
  let targetMessageTop = CHAT_MESSAGE_LIST_TOP_PADDING;
  let contentHeightAfterTarget = 0;

  if (estimateMessageHeight) {
    for (let index = 0; index < lastUserIndex; index += 1) {
      targetMessageTop += estimateMessageHeight(
        messages[index]!,
        false,
        layoutWidth,
      );
      targetMessageTop += CHAT_MESSAGE_LIST_GAP;
    }
    targetMessageHeight = estimateMessageHeight(
      messages[lastUserIndex]!,
      false,
      layoutWidth,
    );
    for (let index = lastUserIndex + 1; index < messages.length; index += 1) {
      contentHeightAfterTarget += estimateMessageHeight(
        messages[index]!,
        isStreaming && index === messages.length - 1,
        layoutWidth,
      );
    }

    if (messages.length > lastUserIndex + 1) {
      contentHeightAfterTarget +=
        (messages.length - lastUserIndex - 1) * CHAT_MESSAGE_LIST_GAP;
    }
  } else {
    const estimatedLayout = buildChatMessageFrameLayout(messages, {
      cacheKey: chatId,
      containerWidth: layoutWidth,
      isSessionActive: isStreaming,
    });
    const targetFrame = estimatedLayout.items[lastUserIndex];
    if (!targetFrame) {
      currentTurnTopSpacerHeightRef.current = 0;
      setCurrentTurnTopSpacerHeight(0);
      setSpacerHeight(0);
      return;
    }

    targetMessageHeight = targetFrame.height;
    targetMessageTop = targetFrame.top;
    if (estimatedLayout.items.length > lastUserIndex + 1) {
      const lastFrame = estimatedLayout.items[estimatedLayout.items.length - 1]!;
      contentHeightAfterTarget = lastFrame.bottom - targetFrame.bottom;
    }
  }

  if (showLoading && isStreaming) {
    contentHeightAfterTarget += CHAT_MESSAGE_LOADING_GAP + (estimateLoadingHeight?.() ?? 0);
  }

  let targetVisibleHeight = targetMessageHeight;
  const renderedTargetRow = container.querySelector<HTMLElement>(`[data-message-index="${lastUserIndex}"]`);
  const renderedTargetHeight = renderedTargetRow?.getBoundingClientRect().height ?? 0;
  if (renderedTargetHeight > 0) {
    targetVisibleHeight = renderedTargetHeight;
  }

  const nextTopSpacerHeight = isCurrentTurnAnchored
    ? Math.max(
      0,
      resolveUserMessageAnchorTop(
        containerHeight,
        targetVisibleHeight,
        currentTurnAnchorMode,
      ) - targetMessageTop,
    )
    : 0;
  currentTurnTopSpacerHeightRef.current = nextTopSpacerHeight;
  setCurrentTurnTopSpacerHeight((current) => (
    current === nextTopSpacerHeight ? current : nextTopSpacerHeight
  ));
  const nextSpacerHeight = computeSpacerHeight(
    containerHeight,
    targetMessageHeight,
    contentHeightAfterTarget,
    isStreaming && hasVisibleAssistantOutput,
    targetVisibleHeight,
  );
  setSpacerHeight((current) => (current === nextSpacerHeight ? current : nextSpacerHeight));
}
