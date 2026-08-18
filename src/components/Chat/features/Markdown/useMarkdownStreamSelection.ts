import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {
  addChatSelectionStreamFreezeListener,
} from '@/components/Chat/features/Messages/components/chatSelectionStreamFreeze';
import {
  hasActiveSelectionText,
  isSelectionSurfaceTarget,
  selectionIntersectsElement,
} from './chatMarkdownSelectionUtils';
import { themeUiFeedbackTokens } from '@/styles/themeTokens';

export function useMarkdownStreamSelection({
  content,
  isStreaming,
  markdownSurfaceRef,
  suspendStreamAnimation,
}: {
  content: string;
  isStreaming: boolean;
  markdownSurfaceRef: RefObject<HTMLDivElement | null>;
  suspendStreamAnimation: boolean;
}) {
  const [, bumpSelectionFreezeRevision] = useState(0);
  const isPointerSelectingRef = useRef(false);
  const selectionStreamClockPausedRef = useRef(false);
  const unlockTimeoutRef = useRef<number | null>(null);
  const releaseSelectionFreezeTimeoutRef = useRef<number | null>(null);
  const latestStreamingRef = useRef(isStreaming);
  const selectionFrozenContentRef = useRef<string | null>(null);
  const suspendedStreamContentRef = useRef<string | null>(null);

  latestStreamingRef.current = isStreaming;
  if (isStreaming && suspendStreamAnimation) {
    suspendedStreamContentRef.current ??= content;
  } else {
    suspendedStreamContentRef.current = null;
  }

  const renderedContent =
    selectionFrozenContentRef.current ?? suspendedStreamContentRef.current ?? content;

  const clearReleaseSelectionFreezeTimeout = useCallback(() => {
    if (releaseSelectionFreezeTimeoutRef.current === null) {
      return;
    }
    window.clearTimeout(releaseSelectionFreezeTimeoutRef.current);
    releaseSelectionFreezeTimeoutRef.current = null;
  }, []);

  const releaseSelectionFreeze = useCallback((_reason: string) => {
    if (selectionFrozenContentRef.current === null) {
      return;
    }
    selectionFrozenContentRef.current = null;
    selectionStreamClockPausedRef.current = false;
    bumpSelectionFreezeRevision((revision) => revision + 1);
  }, []);

  const scheduleSelectionFreezeRelease = useCallback(() => {
    clearReleaseSelectionFreezeTimeout();
    if (!latestStreamingRef.current) {
      releaseSelectionFreeze('not-streaming');
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
      releaseSelectionFreeze('selection-grace');
    }, themeUiFeedbackTokens.chatThinkingSelectionReleaseDelayMs);
  }, [clearReleaseSelectionFreezeTimeout, releaseSelectionFreeze]);

  const unlockSelectionContentIfIdle = useCallback(() => {
    if (isPointerSelectingRef.current) {
      return;
    }
    if (!selectionFrozenContentRef.current) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !hasActiveSelectionText()) {
      clearReleaseSelectionFreezeTimeout();
      releaseSelectionFreeze('collapsed');
      return;
    }
    if (!selectionIntersectsElement(markdownSurfaceRef.current)) {
      clearReleaseSelectionFreezeTimeout();
      releaseSelectionFreeze('selection-outside');
      return;
    }
    scheduleSelectionFreezeRelease();
  }, [clearReleaseSelectionFreezeTimeout, markdownSurfaceRef, releaseSelectionFreeze, scheduleSelectionFreezeRelease]);

  const scheduleUnlockSelectionContentIfIdle = useCallback(() => {
    if (unlockTimeoutRef.current !== null) {
      window.clearTimeout(unlockTimeoutRef.current);
    }
    unlockTimeoutRef.current = window.setTimeout(() => {
      unlockTimeoutRef.current = null;
      unlockSelectionContentIfIdle();
    }, themeUiFeedbackTokens.chatThinkingSelectionSettleDelayMs);
  }, [unlockSelectionContentIfIdle]);

  const beginSelectionFreeze = useCallback((
    target: EventTarget | null,
    button: number,
  ) => {
    const isSurfaceTarget =
      isSelectionSurfaceTarget(target) &&
      target instanceof Element &&
      !!markdownSurfaceRef.current?.contains(target);
    if (!isStreaming || button !== 0 || !isSurfaceTarget) {
      return;
    }

    clearReleaseSelectionFreezeTimeout();
    isPointerSelectingRef.current = true;
    selectionStreamClockPausedRef.current = true;
    if (selectionFrozenContentRef.current !== content) {
      selectionFrozenContentRef.current = content;
    }
  }, [clearReleaseSelectionFreezeTimeout, content, isStreaming, markdownSurfaceRef]);

  useEffect(() => {
    if (!isStreaming) {
      isPointerSelectingRef.current = false;
      selectionStreamClockPausedRef.current = false;
      clearReleaseSelectionFreezeTimeout();
      if (selectionFrozenContentRef.current !== null) {
        selectionFrozenContentRef.current = null;
        bumpSelectionFreezeRevision((revision) => revision + 1);
      }
    }
  }, [clearReleaseSelectionFreezeTimeout, isStreaming]);

  useEffect(() => {
    return () => {
      if (unlockTimeoutRef.current !== null) {
        window.clearTimeout(unlockTimeoutRef.current);
        unlockTimeoutRef.current = null;
      }
      clearReleaseSelectionFreezeTimeout();
    };
  }, [clearReleaseSelectionFreezeTimeout]);

  useEffect(() => {
    const handlePointerUp = () => {
      isPointerSelectingRef.current = false;
      scheduleUnlockSelectionContentIfIdle();
    };

    document.addEventListener('pointerup', handlePointerUp, true);
    document.addEventListener('pointercancel', handlePointerUp, true);
    window.addEventListener('blur', handlePointerUp);
    return () => {
      document.removeEventListener('pointerup', handlePointerUp, true);
      document.removeEventListener('pointercancel', handlePointerUp, true);
      window.removeEventListener('blur', handlePointerUp);
    };
  }, [scheduleUnlockSelectionContentIfIdle]);

  useEffect(() => {
    const handleSelectionChange = () => {
      if (selectionFrozenContentRef.current === null) {
        return;
      }
      if (isPointerSelectingRef.current) {
        return;
      }
      scheduleUnlockSelectionContentIfIdle();
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [renderedContent, scheduleUnlockSelectionContentIfIdle]);

  useEffect(() => {
    return addChatSelectionStreamFreezeListener(({ button, target }) => {
      beginSelectionFreeze(target, button);
    });
  }, [beginSelectionFreeze]);

  const handleSelectionPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    beginSelectionFreeze(event.target, event.button);
  }, [beginSelectionFreeze]);

  const handleSelectionMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    beginSelectionFreeze(event.target, event.button);
  }, [beginSelectionFreeze]);

  return {
    handleSelectionMouseDown,
    handleSelectionPointerDown,
    renderedContent,
    selectionStreamClockPausedRef,
  };
}
