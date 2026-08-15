import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useNotesStore } from '@/stores/useNotesStore';
import { flushCurrentPendingEditorMarkdown } from '@/stores/notes/pendingEditorMarkdown';
import { themeEditorLayoutTokens } from '@/styles/themeTokens';
import { flushCurrentEditorSave } from '../utils/editorSaveRegistry';
import { NOTE_SOURCE_MODE_TOGGLE_EVENT } from '../sourceMode/sourceModeEvents';

export function useMarkdownEditorSourceMode({
  currentNotePath,
  hasActiveNote,
  onEditorViewReady,
  onModeSwitchStart,
  onModeSwitchLayoutReady,
  scrollRootRef,
}: {
  currentNotePath: string | undefined;
  hasActiveNote: boolean;
  onEditorViewReady?: () => void;
  onModeSwitchStart?: () => void;
  onModeSwitchLayoutReady?: () => void;
  scrollRootRef?: RefObject<HTMLElement | null>;
}) {
  const editorSession = useMemo(() => ({
    active: hasActiveNote,
    path: currentNotePath,
  }), [currentNotePath, hasActiveNote]);
  const [editorReadyTarget, setEditorReadyTarget] = useState<typeof editorSession | null>(null);
  const [editorInitTimedOutTarget, setEditorInitTimedOutTarget] = useState<typeof editorSession | null>(null);
  const [isSourceMode, setIsSourceMode] = useState(false);
  const pendingScrollRestoreRef = useRef<{ path: string; progress: number } | null>(null);
  const scrollRestoreTimeoutRef = useRef<number | null>(null);
  const modeSwitchPendingRef = useRef(false);
  const isEditorViewReady = editorReadyTarget === editorSession;

  const notifyModeSwitchLayoutReady = useCallback(() => {
    if (modeSwitchPendingRef.current) {
      onModeSwitchLayoutReady?.();
    }
  }, [onModeSwitchLayoutReady]);

  const restorePendingScrollPosition = useCallback((finish = false) => {
    const pending = pendingScrollRestoreRef.current;
    const scrollRoot = scrollRootRef?.current;
    if (!pending || pending.path !== currentNotePath || !scrollRoot) {
      return;
    }

    const maxScrollTop = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
    if (maxScrollTop > 0) {
      scrollRoot.scrollTop = pending.progress * maxScrollTop;
    }
    if (finish) {
      pendingScrollRestoreRef.current = null;
    }
  }, [currentNotePath, scrollRootRef]);

  const scheduleFinalScrollRestore = useCallback(() => {
    if (!modeSwitchPendingRef.current) {
      return;
    }
    if (scrollRestoreTimeoutRef.current !== null) {
      window.clearTimeout(scrollRestoreTimeoutRef.current);
    }
    scrollRestoreTimeoutRef.current = window.setTimeout(() => {
      scrollRestoreTimeoutRef.current = null;
      restorePendingScrollPosition(true);
      modeSwitchPendingRef.current = false;
    }, themeEditorLayoutTokens.scrollRestoreTimeoutFallbackDelayMs);
  }, [restorePendingScrollPosition]);

  const handleEditorViewReady = useCallback(() => {
    restorePendingScrollPosition();
    notifyModeSwitchLayoutReady();
    scheduleFinalScrollRestore();
    setEditorInitTimedOutTarget(null);
    setEditorReadyTarget(editorSession);
    onEditorViewReady?.();
  }, [
    editorSession,
    onEditorViewReady,
    notifyModeSwitchLayoutReady,
    restorePendingScrollPosition,
    scheduleFinalScrollRestore,
  ]);

  const handleEditorContentSyncFailure = useCallback(() => {
    if (!currentNotePath) {
      return;
    }

    restorePendingScrollPosition();
    notifyModeSwitchLayoutReady();
    scheduleFinalScrollRestore();
    setEditorInitTimedOutTarget(editorSession);
    onEditorViewReady?.();
  }, [
    currentNotePath,
    editorSession,
    onEditorViewReady,
    notifyModeSwitchLayoutReady,
    restorePendingScrollPosition,
    scheduleFinalScrollRestore,
  ]);

  const getCurrentNoteContent = useCallback(() => {
    if (!currentNotePath) {
      return '';
    }

    const state = useNotesStore.getState();
    const currentNote = state.currentNote;
    if (currentNote?.path === currentNotePath) {
      return currentNote.content;
    }

    return state.noteContentsCache.get(currentNotePath)?.content ?? '';
  }, [currentNotePath]);

  const handleToggleSourceMode = useCallback(() => {
    onModeSwitchStart?.();
    if (scrollRestoreTimeoutRef.current !== null) {
      window.clearTimeout(scrollRestoreTimeoutRef.current);
      scrollRestoreTimeoutRef.current = null;
    }
    modeSwitchPendingRef.current = true;
    const scrollRoot = scrollRootRef?.current;
    const maxScrollTop = scrollRoot
      ? Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight)
      : 0;
    pendingScrollRestoreRef.current = currentNotePath && scrollRoot && maxScrollTop > 0
      ? {
          path: currentNotePath,
          progress: Math.min(1, Math.max(0, scrollRoot.scrollTop / maxScrollTop)),
        }
      : null;
    flushCurrentPendingEditorMarkdown();
    void flushCurrentEditorSave();
    setEditorInitTimedOutTarget(null);
    setIsSourceMode((nextSourceMode) => !nextSourceMode);
  }, [currentNotePath, onModeSwitchStart, scrollRootRef]);

  useLayoutEffect(() => {
    if (!pendingScrollRestoreRef.current) {
      return;
    }

    restorePendingScrollPosition();
    const frameId = window.requestAnimationFrame(() => {
      restorePendingScrollPosition();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isSourceMode, restorePendingScrollPosition]);

  useEffect(() => () => {
    if (scrollRestoreTimeoutRef.current !== null) {
      window.clearTimeout(scrollRestoreTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!hasActiveNote) {
      return;
    }

    window.addEventListener(NOTE_SOURCE_MODE_TOGGLE_EVENT, handleToggleSourceMode);
    return () => {
      window.removeEventListener(NOTE_SOURCE_MODE_TOGGLE_EVENT, handleToggleSourceMode);
    };
  }, [handleToggleSourceMode, hasActiveNote]);

  useEffect(() => {
    if (isSourceMode || !hasActiveNote || !currentNotePath || isEditorViewReady) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      restorePendingScrollPosition();
      notifyModeSwitchLayoutReady();
      scheduleFinalScrollRestore();
      setEditorInitTimedOutTarget(editorSession);
      onEditorViewReady?.();
    }, themeEditorLayoutTokens.editorInitFallbackDelayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    currentNotePath,
    editorSession,
    hasActiveNote,
    isEditorViewReady,
    isSourceMode,
    onEditorViewReady,
    notifyModeSwitchLayoutReady,
    restorePendingScrollPosition,
    scheduleFinalScrollRestore,
  ]);

  useEffect(() => {
    if (isSourceMode && hasActiveNote) {
      handleEditorViewReady();
    }
  }, [handleEditorViewReady, hasActiveNote, isSourceMode]);

  return {
    getCurrentNoteContent,
    handleEditorContentSyncFailure,
    handleEditorViewReady,
    handleToggleSourceMode,
    isEditorViewReady,
    isSourceMode,
    shouldUseSourceFallback:
      !isSourceMode && hasActiveNote && currentNotePath !== undefined && editorInitTimedOutTarget === editorSession,
  };
}
