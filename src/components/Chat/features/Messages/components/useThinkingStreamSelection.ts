import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { themeUiFeedbackTokens } from "@/styles/themeTokens";
import { addChatSelectionStreamFreezeListener } from "./chatSelectionStreamFreeze";

export const MAX_THINKING_SELECTION_TEXT_NODES = 2_000;

function rangeHasSelectedText(range: Range): boolean {
  const root = range.commonAncestorContainer;
  if (root.nodeType === Node.TEXT_NODE) {
    const text = root.textContent ?? "";
    const start = root === range.startContainer ? range.startOffset : 0;
    const end = root === range.endContainer ? range.endOffset : text.length;
    return /\S/.test(text.slice(start, end));
  }

  const ownerDocument = root.ownerDocument ?? document;
  const walker = ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let scannedTextNodes = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    scannedTextNodes += 1;
    if (scannedTextNodes > MAX_THINKING_SELECTION_TEXT_NODES) {
      return true;
    }
    try {
      if (!range.intersectsNode(node)) {
        continue;
      }
    } catch {
      continue;
    }

    const text = node.textContent ?? "";
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : text.length;
    if (/\S/.test(text.slice(start, end))) {
      return true;
    }
  }

  return false;
}

function hasActiveSelectionText(): boolean {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return false;
  }
  for (let index = 0; index < selection.rangeCount; index += 1) {
    try {
      if (rangeHasSelectedText(selection.getRangeAt(index))) {
        return true;
      }
    } catch {
      return true;
    }
  }
  return false;
}

function selectionIntersectsElement(element: Element | null): boolean {
  const selection = window.getSelection();
  if (!element || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return false;
  }

  for (let index = 0; index < selection.rangeCount; index += 1) {
    try {
      if (selection.getRangeAt(index).intersectsNode(element)) {
        return true;
      }
    } catch {
      return true;
    }
  }
  return false;
}

export function useThinkingStreamSelection({
  activelyThinking,
  contentRef,
  isMessageStreaming,
  suspendStreamAnimation,
  thinking,
}: {
  activelyThinking: boolean;
  contentRef: RefObject<HTMLDivElement | null>;
  isMessageStreaming: boolean;
  suspendStreamAnimation: boolean;
  thinking: string;
}) {
  const [, bumpSelectionFreezeRevision] = useState(0);
  const suspendedThinkingRef = useRef<string | null>(null);
  const selectionFrozenThinkingRef = useRef<string | null>(null);
  const isPointerSelectingRef = useRef(false);
  const selectionRenderFrozenRef = useRef(false);
  const selectionStreamClockPausedRef = useRef(false);
  const unlockTimeoutRef = useRef<number | null>(null);
  const releaseSelectionFreezeTimeoutRef = useRef<number | null>(null);
  const messageStreamingRef = useRef(isMessageStreaming);
  const beginSelectionFreezeRef = useRef<(target: EventTarget | null, button: number) => void>(() => {});

  messageStreamingRef.current = isMessageStreaming;
  if (!isMessageStreaming) {
    selectionFrozenThinkingRef.current = null;
    isPointerSelectingRef.current = false;
    selectionRenderFrozenRef.current = false;
    selectionStreamClockPausedRef.current = false;
  }
  if (activelyThinking && suspendStreamAnimation) {
    suspendedThinkingRef.current ??= thinking;
  } else {
    suspendedThinkingRef.current = null;
  }

  const renderedThinking =
    selectionFrozenThinkingRef.current ?? suspendedThinkingRef.current ?? thinking;

  const clearReleaseSelectionFreezeTimeout = () => {
    if (releaseSelectionFreezeTimeoutRef.current === null) {
      return;
    }
    window.clearTimeout(releaseSelectionFreezeTimeoutRef.current);
    releaseSelectionFreezeTimeoutRef.current = null;
  };

  const clearUnlockTimeout = () => {
    if (unlockTimeoutRef.current === null) {
      return;
    }
    window.clearTimeout(unlockTimeoutRef.current);
    unlockTimeoutRef.current = null;
  };

  const releaseSelectionFreeze = (_reason: string) => {
    if (selectionFrozenThinkingRef.current === null) {
      return;
    }
    selectionFrozenThinkingRef.current = null;
    selectionRenderFrozenRef.current = false;
    selectionStreamClockPausedRef.current = false;
    bumpSelectionFreezeRevision((revision) => revision + 1);
  };

  const scheduleSelectionFreezeRelease = () => {
    clearReleaseSelectionFreezeTimeout();
    if (!messageStreamingRef.current) {
      releaseSelectionFreeze("not-streaming");
      return;
    }
    if (hasActiveSelectionText()) {
      return;
    }
    releaseSelectionFreezeTimeoutRef.current = window.setTimeout(() => {
      releaseSelectionFreezeTimeoutRef.current = null;
      if (isPointerSelectingRef.current) {
        return;
      }
      releaseSelectionFreeze("selection-grace");
    }, themeUiFeedbackTokens.chatThinkingSelectionReleaseDelayMs);
  };

  beginSelectionFreezeRef.current = (target: EventTarget | null, button: number) => {
    const isThinkingTarget =
      target instanceof Element &&
      !!contentRef.current?.contains(target);
    if (!isMessageStreaming || button !== 0 || !isThinkingTarget) {
      return;
    }

    clearReleaseSelectionFreezeTimeout();
    isPointerSelectingRef.current = true;
    selectionRenderFrozenRef.current = true;
    selectionStreamClockPausedRef.current = activelyThinking;
    if (selectionFrozenThinkingRef.current !== thinking) {
      selectionFrozenThinkingRef.current = thinking;
    }
  };

  const handleSelectionPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    beginSelectionFreezeRef.current(event.target, event.button);
  };

  const handleSelectionMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    beginSelectionFreezeRef.current(event.target, event.button);
  };

  useEffect(() => {
    return addChatSelectionStreamFreezeListener(({ button, target }) => {
      beginSelectionFreezeRef.current(target, button);
    });
  }, []);

  const clearSelectionFreezeIfIdle = () => {
    if (isPointerSelectingRef.current) {
      return;
    }
    if (!selectionFrozenThinkingRef.current) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !hasActiveSelectionText()) {
      clearReleaseSelectionFreezeTimeout();
      releaseSelectionFreeze("collapsed");
      return;
    }
    if (!selectionIntersectsElement(contentRef.current)) {
      clearReleaseSelectionFreezeTimeout();
      releaseSelectionFreeze("selection-outside");
      return;
    }

    scheduleSelectionFreezeRelease();
  };

  const scheduleClearSelectionFreezeIfIdle = () => {
    clearUnlockTimeout();
    unlockTimeoutRef.current = window.setTimeout(() => {
      unlockTimeoutRef.current = null;
      clearSelectionFreezeIfIdle();
    }, themeUiFeedbackTokens.chatThinkingSelectionSettleDelayMs);
  };

  useEffect(() => {
    const handlePointerUp = () => {
      isPointerSelectingRef.current = false;
      scheduleClearSelectionFreezeIfIdle();
    };
    const handleSelectionChange = () => {
      if (isPointerSelectingRef.current) {
        return;
      }
      scheduleClearSelectionFreezeIfIdle();
    };
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("pointercancel", handlePointerUp, true);
    window.addEventListener("blur", handlePointerUp);
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointercancel", handlePointerUp, true);
      window.removeEventListener("blur", handlePointerUp);
      document.removeEventListener("selectionchange", handleSelectionChange);
      clearUnlockTimeout();
      clearReleaseSelectionFreezeTimeout();
    };
  }, []);

  return {
    handleSelectionMouseDown,
    handleSelectionPointerDown,
    renderedThinking,
    selectionRenderFrozenRef,
    selectionStreamClockPausedRef,
  };
}
