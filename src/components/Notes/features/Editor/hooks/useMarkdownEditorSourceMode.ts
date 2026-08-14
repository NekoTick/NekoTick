import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNotesStore } from '@/stores/useNotesStore';
import { flushCurrentPendingEditorMarkdown } from '@/stores/notes/pendingEditorMarkdown';
import { themeEditorLayoutTokens } from '@/styles/themeTokens';
import { flushCurrentEditorSave } from '../utils/editorSaveRegistry';
import { NOTE_SOURCE_MODE_TOGGLE_EVENT } from '../sourceMode/sourceModeEvents';

export function useMarkdownEditorSourceMode({
  currentNotePath,
  hasActiveNote,
  onEditorViewReady,
}: {
  currentNotePath: string | undefined;
  hasActiveNote: boolean;
  onEditorViewReady?: () => void;
}) {
  const editorSession = useMemo(() => ({
    active: hasActiveNote,
    path: currentNotePath,
  }), [currentNotePath, hasActiveNote]);
  const [editorReadyTarget, setEditorReadyTarget] = useState<typeof editorSession | null>(null);
  const [editorInitTimedOutTarget, setEditorInitTimedOutTarget] = useState<typeof editorSession | null>(null);
  const [isSourceMode, setIsSourceMode] = useState(false);
  const isEditorViewReady = editorReadyTarget === editorSession;

  const handleEditorViewReady = useCallback(() => {
    setEditorInitTimedOutTarget(null);
    setEditorReadyTarget(editorSession);
    onEditorViewReady?.();
  }, [editorSession, onEditorViewReady]);

  const handleEditorContentSyncFailure = useCallback(() => {
    if (!currentNotePath) {
      return;
    }

    setEditorInitTimedOutTarget(editorSession);
    onEditorViewReady?.();
  }, [currentNotePath, editorSession, onEditorViewReady]);

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
    flushCurrentPendingEditorMarkdown();
    void flushCurrentEditorSave();
    setEditorInitTimedOutTarget(null);
    setIsSourceMode((nextSourceMode) => !nextSourceMode);
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
      setEditorInitTimedOutTarget(editorSession);
      onEditorViewReady?.();
    }, themeEditorLayoutTokens.editorInitFallbackDelayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentNotePath, editorSession, hasActiveNote, isEditorViewReady, isSourceMode, onEditorViewReady]);

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
