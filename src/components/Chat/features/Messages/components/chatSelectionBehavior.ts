import { isComposerFocusTarget } from "@/lib/ui/composerFocusRegistry";
import {
  isInsideChatScrollable,
  isInsideMessageItem,
  rangeIntersectsMessageItem,
  toElement,
} from "./chatSelectionDom";
import { getSelectionTextForComposer } from "./chatSelectionTextExtraction";

export {
  canStartChatSelection,
  isInsideAssistantMessageItem,
  isInsideChatScrollable,
  isInsideMessageItem,
  isInsideSelectionExcluded,
  isInsideSelectionStartSurface,
  isInsideSelectionSurface,
  MAX_CHAT_SELECTION_FILTER_SCAN_ELEMENTS,
  MAX_CHAT_SELECTION_MESSAGE_SCAN_ELEMENTS,
} from "./chatSelectionDom";
export {
  extractTextWithBlockBreaks,
  getSelectionTextForComposer,
  MAX_CHAT_SELECTION_TEXT_CHARS,
  MAX_CHAT_SELECTION_TEXT_DEPTH,
  MAX_CHAT_SELECTION_TEXT_NODES,
} from "./chatSelectionTextExtraction";

export interface SelectionInsertState {
  text: string;
  x: number;
  y: number;
  placeBelow: boolean;
}

export interface OutsideMoveDecision {
  nextFrozen: boolean;
  shouldPreventDefault: boolean;
  shouldRestore: boolean;
}

export interface LastValidSelectionSnapshot {
  anchorNode: Node;
  anchorOffset: number;
  focusNode: Node;
  focusOffset: number;
  range: Range;
  text: string;
}

export function resolveOutsideMoveDecision({
  isSelectingFromChat,
  pointerInsideSelectionSurface,
  isSelectionFrozen,
}: {
  isSelectingFromChat: boolean;
  pointerInsideSelectionSurface: boolean;
  isSelectionFrozen: boolean;
}): OutsideMoveDecision {
  if (!isSelectingFromChat) {
    return {
      nextFrozen: isSelectionFrozen,
      shouldPreventDefault: false,
      shouldRestore: false,
    };
  }
  if (pointerInsideSelectionSurface) {
    return {
      nextFrozen: false,
      shouldPreventDefault: false,
      shouldRestore: false,
    };
  }
  return {
    nextFrozen: true,
    shouldPreventDefault: true,
    shouldRestore: !isSelectionFrozen,
  };
}

export function setChatSelectionLock(active: boolean) {
  if (typeof document === "undefined") {
    return;
  }
  if (active) {
    document.body.setAttribute("data-chat-selection-lock", "1");
    return;
  }
  document.body.removeAttribute("data-chat-selection-lock");
}

export function clearChatTextSelection(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  window.getSelection()?.removeAllRanges();
  document.dispatchEvent(new Event("selectionchange"));
}

function isSelectionInsideChatMessages(selection: Selection, range: Range): boolean {
  const anchorElement = toElement(selection.anchorNode);
  const focusElement = toElement(selection.focusNode);
  const ancestorElement = toElement(range.commonAncestorContainer);

  if (anchorElement && isComposerFocusTarget(anchorElement)) return false;
  if (focusElement && isComposerFocusTarget(focusElement)) return false;
  if (ancestorElement && isComposerFocusTarget(ancestorElement)) return false;

  const endpointInChat = [anchorElement, focusElement, ancestorElement].some((element) =>
    isInsideChatScrollable(element)
  );
  if (!endpointInChat) {
    return false;
  }

  const endpointInMessageItem = [anchorElement, focusElement, ancestorElement].some((element) =>
    isInsideMessageItem(element)
  );
  if (endpointInMessageItem) {
    return true;
  }

  const chatScrollable =
    ancestorElement?.closest('[data-chat-scrollable="true"]') ??
    anchorElement?.closest('[data-chat-scrollable="true"]') ??
    focusElement?.closest('[data-chat-scrollable="true"]') ??
    document.querySelector('[data-chat-scrollable="true"]');
  if (!chatScrollable) {
    return false;
  }

  return rangeIntersectsMessageItem(range, chatScrollable);
}

export function isSelectionFullyInsideChatMessages(selection: Selection, range: Range): boolean {
  const anchorElement = toElement(selection.anchorNode);
  const focusElement = toElement(selection.focusNode);

  if (!isInsideChatScrollable(anchorElement) || !isInsideChatScrollable(focusElement)) {
    return false;
  }

  const chatScrollable =
    anchorElement?.closest('[data-chat-scrollable="true"]') ??
    focusElement?.closest('[data-chat-scrollable="true"]') ??
    document.querySelector('[data-chat-scrollable="true"]');
  if (!chatScrollable) {
    return false;
  }

  return rangeIntersectsMessageItem(range, chatScrollable);
}

export function isSameRange(a: Range, b: Range): boolean {
  try {
    return (
      a.compareBoundaryPoints(Range.START_TO_START, b) === 0 &&
      a.compareBoundaryPoints(Range.END_TO_END, b) === 0
    );
  } catch {
    return false;
  }
}

function isConnectedNode(node: Node | null): node is Node {
  return !!node?.isConnected;
}

export function createSelectionSnapshot(
  selection: Selection,
  range: Range,
  text: string,
): LastValidSelectionSnapshot | null {
  if (!selection.anchorNode || !selection.focusNode) {
    return null;
  }

  return {
    anchorNode: selection.anchorNode,
    anchorOffset: selection.anchorOffset,
    focusNode: selection.focusNode,
    focusOffset: selection.focusOffset,
    range: range.cloneRange(),
    text,
  };
}

export function restoreSelectionSnapshot(selection: Selection, snapshot: LastValidSelectionSnapshot): boolean {
  if (isConnectedNode(snapshot.anchorNode) && isConnectedNode(snapshot.focusNode)) {
    try {
      selection.setBaseAndExtent(
        snapshot.anchorNode,
        snapshot.anchorOffset,
        snapshot.focusNode,
        snapshot.focusOffset,
      );
      return true;
    } catch {}
  }

  if (!isConnectedNode(snapshot.range.commonAncestorContainer)) {
    return false;
  }

  selection.removeAllRanges();
  selection.addRange(snapshot.range);
  return true;
}

export function computeStateFromSelection(): SelectionInsertState | null {
  if (typeof window === "undefined") {
    return null;
  }
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!isSelectionInsideChatMessages(selection, range)) {
    return null;
  }

  const text = getSelectionTextForComposer(selection, range);
  if (!text) {
    return null;
  }

  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    return null;
  }

  const minX = 24;
  const maxX = Math.max(24, window.innerWidth - 24);
  const centerX = rect.left + rect.width / 2;
  const x = Math.min(Math.max(centerX, minX), maxX);

  const placeBelow = rect.top < 64;
  const y = placeBelow ? rect.bottom + 10 : rect.top - 10;

  return { text, x, y, placeBelow };
}

export function getStateSignature(state: SelectionInsertState | null): string {
  if (!state) {
    return "";
  }
  return `${state.text}|${Math.round(state.x)}|${Math.round(state.y)}|${state.placeBelow ? "1" : "0"}`;
}
