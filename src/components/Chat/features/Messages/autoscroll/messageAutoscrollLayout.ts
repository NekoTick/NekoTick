import {
  CHAT_MESSAGE_LIST_TOP_PADDING,
} from "@/components/Chat/features/Layout/chatMessageFrames";
import type { CurrentTurnAnchorMode } from "./messageAutoscrollTypes";

export const NEAR_BOTTOM_THRESHOLD = 96;
export const STREAMING_REATTACH_BOTTOM_THRESHOLD = 8;
export const STREAMING_EXTRA_SPACER_RATIO = 0.08;
export const CURRENT_TURN_ANCHOR_MAX_ATTEMPTS = 8;
export const CURRENT_TURN_REANCHOR_TOLERANCE = 16;
export const ACTIVE_OUTPUT_OVERFLOW_THRESHOLD = 1;

const SHORT_USER_MESSAGE_ANCHOR_BOTTOM_RATIO = 0.64;

export function hasUsableScrollContainer(container: HTMLElement | null): container is HTMLElement {
  return !!container && container.clientHeight > 0 && container.clientWidth > 0;
}

export function isEventWithinRoot(root: HTMLElement, target: EventTarget | null): boolean {
  return target instanceof Node && root.contains(target);
}

export function isUpwardKeyboardScrollIntent(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }

  return (
    event.key === "PageUp" ||
    event.key === "Home" ||
    event.key === "ArrowUp" ||
    (event.key === " " && event.shiftKey)
  );
}

export function computeSpacerHeight(
  containerHeight: number,
  targetMessageHeight: number,
  contentHeightAfterTarget: number,
  hasVisibleAssistantOutput: boolean,
  targetVisibleHeight = targetMessageHeight,
): number {
  const unclampedBaseHeight = Math.max(
    0,
    containerHeight - contentHeightAfterTarget - targetVisibleHeight,
  );
  const extraSpaceForAssistant = hasVisibleAssistantOutput
    ? containerHeight * STREAMING_EXTRA_SPACER_RATIO
    : 0;

  return Math.max(0, Math.round(unclampedBaseHeight + extraSpaceForAssistant));
}

function resolveShortUserMessageAnchorTop(
  containerHeight: number,
  targetMessageHeight: number,
  anchorMode: CurrentTurnAnchorMode = "near-composer",
): number {
  if (anchorMode === "top") {
    return CHAT_MESSAGE_LIST_TOP_PADDING;
  }

  return Math.max(
    0,
    Math.round(containerHeight * SHORT_USER_MESSAGE_ANCHOR_BOTTOM_RATIO - targetMessageHeight),
  );
}

export function resolveUserMessageAnchorTop(
  containerHeight: number,
  targetMessageHeight: number,
  anchorMode: CurrentTurnAnchorMode = "near-composer",
): number {
  if (targetMessageHeight > containerHeight) {
    return CHAT_MESSAGE_LIST_TOP_PADDING;
  }
  return resolveShortUserMessageAnchorTop(containerHeight, targetMessageHeight, anchorMode);
}
