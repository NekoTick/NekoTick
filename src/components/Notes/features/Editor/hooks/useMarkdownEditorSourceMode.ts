import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useNotesStore } from '@/stores/useNotesStore';
import { flushCurrentPendingEditorMarkdown } from '@/stores/notes/pendingEditorMarkdown';
import { themeEditorLayoutTokens } from '@/styles/themeTokens';
import { flushCurrentEditorSave } from '../utils/editorSaveRegistry';
import { NOTE_SOURCE_MODE_TOGGLE_EVENT } from '../sourceMode/sourceModeEvents';
import type { NotesEditorFailure } from '../editorFailureDiagnostics';

type RenderedEditorFailure = Pick<NotesEditorFailure, 'reason' | 'error' | 'componentStack'>;

interface EditorSessionTarget {
  active: boolean;
  path: string | undefined;
  revision: number;
}

function isSameEditorSession(
  target: EditorSessionTarget | null,
  session: EditorSessionTarget,
) {
  return target?.revision === session.revision;
}

export function useMarkdownEditorSourceMode({
  currentNotePath,
  hasActiveNote,
  onEditorFailure,
  onEditorViewReady,
  onModeSwitchStart,
  onModeSwitchLayoutReady,
  scrollRootRef,
}: {
  currentNotePath: string | undefined;
  hasActiveNote: boolean;
  onEditorFailure?: (failure: NotesEditorFailure) => void;
  onEditorViewReady?: () => void;
  onModeSwitchStart?: () => void;
  onModeSwitchLayoutReady?: () => void;
  scrollRootRef?: RefObject<HTMLElement | null>;
}) {
  const editorSessionRef = useRef<EditorSessionTarget>({
    active: hasActiveNote,
    path: currentNotePath,
    revision: 0,
  });
  if (
    editorSessionRef.current.active !== hasActiveNote ||
    editorSessionRef.current.path !== currentNotePath
  ) {
    editorSessionRef.current = {
      active: hasActiveNote,
      path: currentNotePath,
      revision: editorSessionRef.current.revision + 1,
    };
  }
  const editorSession = editorSessionRef.current;
  const [editorReadyTarget, setEditorReadyTarget] = useState<EditorSessionTarget | null>(null);
  const [editorInitTimedOutTarget, setEditorInitTimedOutTarget] = useState<EditorSessionTarget | null>(null);
  const [isSourceMode, setIsSourceMode] = useState(false);
  const pendingScrollRestoreRef = useRef<{ path: string; progress: number } | null>(null);
  const scrollRestoreTimeoutRef = useRef<number | null>(null);
  const modeSwitchPendingRef = useRef(false);
  const isEditorViewReady = isSameEditorSession(editorReadyTarget, editorSession);
  const shouldUseSourceFallback =
    !isSourceMode &&
    hasActiveNote &&
    currentNotePath !== undefined &&
    isSameEditorSession(editorInitTimedOutTarget, editorSession);

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
    if (
      !editorSession.active ||
      editorSessionRef.current.revision !== editorSession.revision
    ) {
      return;
    }

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

  const handleRenderedEditorFailure = useCallback((failure: RenderedEditorFailure = { reason: 'render-error' }) => {
    if (
      !editorSession.active
      || !currentNotePath
      || editorSessionRef.current.revision !== editorSession.revision
    ) {
      return;
    }

    onEditorFailure?.({
      ...failure,
      contentLength: useNotesStore.getState().currentNote?.content.length,
      diskRevision: useNotesStore.getState().currentNoteDiskRevision,
    });
    restorePendingScrollPosition();
    notifyModeSwitchLayoutReady();
    scheduleFinalScrollRestore();
    setEditorReadyTarget(null);
    setEditorInitTimedOutTarget(editorSession);
    onEditorViewReady?.();
  }, [
    currentNotePath,
    editorSession,
    onEditorFailure,
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
    setEditorReadyTarget(null);
    setEditorInitTimedOutTarget(null);
    if (shouldUseSourceFallback) {
      return;
    }
    setIsSourceMode((nextSourceMode) => !nextSourceMode);
  }, [currentNotePath, onModeSwitchStart, scrollRootRef, shouldUseSourceFallback]);

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
    if (isSourceMode || shouldUseSourceFallback || !hasActiveNote || !currentNotePath || isEditorViewReady) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (
        editorSessionRef.current.revision !== editorSession.revision ||
        !editorSessionRef.current.active
      ) {
        return;
      }

      onEditorFailure?.({
        reason: 'init-timeout',
        contentLength: useNotesStore.getState().currentNote?.content.length,
        diskRevision: useNotesStore.getState().currentNoteDiskRevision,
      });
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
    onEditorFailure,
    onEditorViewReady,
    notifyModeSwitchLayoutReady,
    restorePendingScrollPosition,
    scheduleFinalScrollRestore,
    shouldUseSourceFallback,
  ]);

  useEffect(() => {
    if (isSourceMode && hasActiveNote) {
      handleEditorViewReady();
    }
  }, [handleEditorViewReady, hasActiveNote, isSourceMode]);

  return {
    getCurrentNoteContent,
    handleRenderedEditorFailure,
    handleEditorViewReady,
    handleToggleSourceMode,
    isEditorViewReady,
    isSourceMode,
    shouldUseSourceFallback,
  };
}
