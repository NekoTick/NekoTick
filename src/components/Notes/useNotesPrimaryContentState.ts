import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { requestNativeCaretOverlayRefresh } from '@/hooks/useNativeCaretOverlay';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import type { NoteMetadataEntry } from '@/stores/notes/types';
import { preloadMarkdownEditor } from './features/Editor/preloadMarkdownEditor';
import { shouldShowLargeMarkdownFirstPaintPreview } from './features/Editor/LargeMarkdownFirstPaintPreview';
import { focusNoteTitleInputAtEnd } from './features/Editor/utils/titleInputDom';
import { isEmptyUntitledDraft } from './notesViewHelpers';

export function useNotesPrimaryContentState(args: {
  active: boolean;
  applyPendingSplitEditorFocus: () => void;
  currentDraftMetadata: NoteMetadataEntry | undefined;
  currentNotePath: string | undefined;
  currentNotesRoot: { path: string } | null | undefined;
  draftNotes: ReturnType<typeof useNotesStore.getState>['draftNotes'];
  isLoading: boolean;
  notesViewRef: MutableRefObject<HTMLDivElement | null>;
  onPrimaryContentReady?: () => void;
  onStartupReady?: () => void;
  openTabs: ReturnType<typeof useNotesStore.getState>['openTabs'];
}) {
  const {
    active,
    applyPendingSplitEditorFocus,
    currentDraftMetadata,
    currentNotePath,
    currentNotesRoot,
    draftNotes,
    isLoading,
    notesViewRef,
    onPrimaryContentReady,
    onStartupReady,
    openTabs,
  } = args;
  const previousActiveRef = useRef(active);
  const [canLoadMarkdownEditor, setCanLoadMarkdownEditor] = useState(() => active);
  const [primaryContentReadyPath, setPrimaryContentReadyPath] = useState<string | null>(null);
  const firstPaintNoteContent = useNotesStore(
    useCallback((state) => {
      if (!active || !currentNotePath || primaryContentReadyPath === currentNotePath) {
        return '';
      }
      return state.currentNote?.path === currentNotePath ? state.currentNote.content : '';
    }, [active, currentNotePath, primaryContentReadyPath]),
  );

  useEffect(() => {
    onStartupReady?.();
  }, [currentNotePath, currentNotesRoot, isLoading, onStartupReady, openTabs.length]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void preloadMarkdownEditor().catch(() => undefined);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [active]);

  useEffect(() => {
    const wasActive = previousActiveRef.current;
    previousActiveRef.current = active;
    if (!active || wasActive) {
      return;
    }

    const currentNote = useNotesStore.getState().currentNote;
    if (
      openTabs.length !== 1 ||
      openTabs[0]?.path !== currentNotePath ||
      !isEmptyUntitledDraft({
        content: currentNote?.path === currentNotePath ? currentNote.content : '',
        draftMetadata: currentDraftMetadata,
        draftNotes,
        path: currentNotePath,
      })
    ) {
      return;
    }

    let cancelled = false;
    let nextFrameId: number | null = null;
    const frameId = window.requestAnimationFrame(() => {
      nextFrameId = window.requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }
        if (focusNoteTitleInputAtEnd(notesViewRef.current ?? document)) {
          requestNativeCaretOverlayRefresh();
        }
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      if (nextFrameId !== null) {
        window.cancelAnimationFrame(nextFrameId);
      }
    };
  }, [active, currentDraftMetadata, currentNotePath, draftNotes, notesViewRef, openTabs]);

  const reportNotesPrimaryContentReady = useCallback(() => {
    setPrimaryContentReadyPath(currentNotePath ?? null);
    applyPendingSplitEditorFocus();
    onPrimaryContentReady?.();
  }, [applyPendingSplitEditorFocus, currentNotePath, onPrimaryContentReady]);

  useEffect(() => {
    if (!currentNotePath || primaryContentReadyPath === currentNotePath) {
      return;
    }

    setPrimaryContentReadyPath(null);
  }, [currentNotePath, primaryContentReadyPath]);

  const firstPaintPreviewMarkdown = useMemo(() => {
    if (!active || !currentNotePath || primaryContentReadyPath === currentNotePath) {
      return null;
    }

    return shouldShowLargeMarkdownFirstPaintPreview(firstPaintNoteContent)
      ? firstPaintNoteContent
      : null;
  }, [active, currentNotePath, firstPaintNoteContent, primaryContentReadyPath]);

  useEffect(() => {
    setCanLoadMarkdownEditor(active || Boolean(currentNotePath));
  }, [active, currentNotePath]);

  return {
    canLoadMarkdownEditor,
    firstPaintPreviewMarkdown,
    isPrimaryContentReady: Boolean(currentNotePath && primaryContentReadyPath === currentNotePath),
    reportNotesPrimaryContentReady,
  };
}
