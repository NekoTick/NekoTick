import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ErrorInfo } from 'react';
import { OverlayScrollArea } from '@/components/ui/overlay-scroll-area';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { useNotesStore } from '@/stores/useNotesStore';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { selectMarkdownBodyLineNumbersEnabled } from '@/stores/unified/settings/markdownSettings';
import { cn } from '@/lib/utils';
import { NoteHeader } from './NoteHeader';
import { EditorTopRightToolbar, MilkdownEditorRuntime } from './MarkdownEditorLazyComponents';
import { MarkdownSourceEditor } from './MarkdownSourceEditor';
import { MarkdownSourceFallback } from './MarkdownSourceFallback';
import { NoteCoverCanvas } from '../Cover';
import { EDITOR_LAYOUT_CLASS } from '@/lib/layout';
import { useEditorLayout } from './hooks/useEditorLayout';
import {
  canPersistNoteScrollPosition,
  useMarkdownEditorScrollPersistence,
} from './hooks/useMarkdownEditorScrollPersistence';
import { useMarkdownEditorCoverState } from './hooks/useMarkdownEditorCoverState';
import { useMarkdownEditorFocus } from './hooks/useMarkdownEditorFocus';
import { useMarkdownEditorSourceMode } from './hooks/useMarkdownEditorSourceMode';
import { useHeldPageScroll } from '@/hooks/useHeldPageScroll';
import { useNoteEditorFind } from './find/useNoteEditorFind';
import { findStarredEntryByPath } from '@/stores/notes/starred';
import {
  getSidebarSearchNavigationPendingPath,
  subscribeSidebarSearchNavigationPending,
} from '../Sidebar/sidebarSearchNavigation';
import { getNoteMetadataEntry } from '@/stores/notes/noteMetadataState';
import { themeEditorLayoutTokens, themeRenderingTokens } from '@/styles/themeTokens';
import { focusEditorFromNoteUpperBlankArea } from './utils/focusEditorFromNoteUpperBlankArea';
import { reportNotesEditorFailure } from './editorFailureDiagnostics';
import 'katex/dist/katex.min.css';
import './styles/index.css';

export { canPersistNoteScrollPosition };

export function MarkdownEditor({
  active = true,
  isPeeking = false,
  peekOffset = 0,
  onEditorViewReady,
  onEditorModeChange,
  compactHeader = false,
  hideNoteActions = false,
}: {
  active?: boolean;
  isPeeking?: boolean;
  peekOffset?: number;
  onEditorViewReady?: () => void;
  onEditorModeChange?: (mode: 'rendered' | 'source' | 'fallback') => void;
  compactHeader?: boolean;
  hideNoteActions?: boolean;
}) {
  const { contentOffset } = useEditorLayout(isPeeking, peekOffset);

  const currentNotePath = useNotesStore(s => s.currentNote?.path);
  const currentNoteRevision = useNotesStore(s => s.currentNoteRevision);
  const currentNoteDiskRevision = useNotesStore(s => s.currentNoteDiskRevision);
  const workspaceRestoredNote = useNotesStore(s => s.workspaceRestoredNote);
  const showBodyLineNumbers = useUnifiedStore(selectMarkdownBodyLineNumbersEnabled);
  const saveNote = useNotesStore(s => s.saveNote);
  const notesPath = useNotesStore(s => s.notesPath);
  const currentNoteTitle = useNotesStore(
    useCallback((state) => {
      if (!currentNotePath) return '';
      return state.getDisplayName(currentNotePath);
    }, [currentNotePath])
  );
  const openTabs = useNotesStore(s => s.openTabs);
  const starred = useNotesStore(
    useCallback((state) => {
      if (!currentNotePath) return false;
      return Boolean(findStarredEntryByPath(state.starredEntries, 'note', currentNotePath, state.notesPath));
    }, [currentNotePath])
  );
  const toggleStarred = useNotesStore(s => s.toggleStarred);
  const currentNoteCreatedAt = useNotesStore(
    useCallback((state) => {
      return getNoteMetadataEntry(state.noteMetadata, currentNotePath)?.createdAt;
    }, [currentNotePath])
  );
  const currentNoteUpdatedAt = useNotesStore(
    useCallback((state) => {
      return getNoteMetadataEntry(state.noteMetadata, currentNotePath)?.updatedAt;
    }, [currentNotePath])
  );

  const currentNoteMetadata = useMemo(() => {
    if (currentNoteCreatedAt === undefined && currentNoteUpdatedAt === undefined) {
      return undefined;
    }

    return {
      createdAt: currentNoteCreatedAt,
      updatedAt: currentNoteUpdatedAt,
    };
  }, [currentNoteCreatedAt, currentNoteUpdatedAt]);
  const openTabPathsKey = useMemo(
    () => openTabs.map((tab) => tab.path).join('\0'),
    [openTabs],
  );
  const pendingSidebarSearchNavigationPath = useSyncExternalStore(
    subscribeSidebarSearchNavigationPending,
    getSidebarSearchNavigationPendingPath,
    getSidebarSearchNavigationPendingPath,
  );
  const isSidebarSearchJumpPending =
    Boolean(currentNotePath && pendingSidebarSearchNavigationPath === currentNotePath);
  const shouldStartWorkspaceRestoredNoteAtTop = Boolean(
    currentNotePath &&
    workspaceRestoredNote?.path === currentNotePath &&
    workspaceRestoredNote.revision === currentNoteRevision
  );

  const hasRenderableNote = Boolean(currentNotePath);
  const hasActiveNote = active && hasRenderableNote;
  const scrollRootRef = useMarkdownEditorScrollPersistence({
    active,
    currentNotePath,
    hasActiveNote,
    notesPath,
    openTabPathsKey,
    startAtTop: shouldStartWorkspaceRestoredNoteAtTop,
  });
  const handleEditorClick = useMarkdownEditorFocus({ active, hasActiveNote });
  const editorModeShellRef = useRef<HTMLDivElement | null>(null);
  const modeSwitchVisibilityTimeoutRef = useRef<number | null>(null);
  const [editorModeShellMinHeight, setEditorModeShellMinHeight] = useState<number | null>(null);
  const [isModeSwitchLayoutPending, setIsModeSwitchLayoutPending] = useState(false);
  const handleModeSwitchLayoutReady = useCallback(() => {
    if (modeSwitchVisibilityTimeoutRef.current !== null) {
      window.clearTimeout(modeSwitchVisibilityTimeoutRef.current);
      modeSwitchVisibilityTimeoutRef.current = null;
    }
    setIsModeSwitchLayoutPending(false);
    setEditorModeShellMinHeight(null);
  }, []);
  const handleModeSwitchStart = useCallback(() => {
    setIsModeSwitchLayoutPending(true);
    const editorModeShell = editorModeShellRef.current;
    if (editorModeShell) {
      setEditorModeShellMinHeight(Math.ceil(editorModeShell.getBoundingClientRect().height));
    }
  }, []);
  useEffect(() => {
    if (!isModeSwitchLayoutPending) return;
    modeSwitchVisibilityTimeoutRef.current = window.setTimeout(
      handleModeSwitchLayoutReady,
      themeEditorLayoutTokens.scrollRestoreTimeoutFallbackDelayMs,
    );
    return () => {
      if (modeSwitchVisibilityTimeoutRef.current !== null) {
        window.clearTimeout(modeSwitchVisibilityTimeoutRef.current);
        modeSwitchVisibilityTimeoutRef.current = null;
      }
    };
  }, [handleModeSwitchLayoutReady, isModeSwitchLayoutPending]);
  const editorFind = useNoteEditorFind(currentNotePath);
  useHeldPageScroll(scrollRootRef, {
    enabled: active,
    ignoreEditableTargets: true,
  });
  const {
    editorRuntimeRevision,
    getCurrentNoteContent,
    handleRenderedEditorFailure,
    handleEditorViewReady,
    handleToggleSourceMode,
    isEditorViewReady,
    isSourceMode,
    shouldUseSourceFallback,
  } = useMarkdownEditorSourceMode({
    currentNoteDiskRevision,
    currentNotePath,
    hasActiveNote,
    onEditorFailure: reportNotesEditorFailure,
    onEditorViewReady,
    onModeSwitchStart: handleModeSwitchStart,
    onModeSwitchLayoutReady: handleModeSwitchLayoutReady,
    scrollRootRef,
  });
  const handleEditorRenderError = useCallback((error: Error, info: ErrorInfo) => {
    handleRenderedEditorFailure({
      reason: 'render-error',
      error,
      componentStack: info.componentStack ?? undefined,
    });
  }, [handleRenderedEditorFailure]);
  const handleEditorContentSyncFailure = useCallback((error?: unknown) => {
    handleRenderedEditorFailure({ reason: 'content-sync', error });
  }, [handleRenderedEditorFailure]);
  const handleEditorCreationFailure = useCallback((error: unknown) => {
    handleRenderedEditorFailure({ reason: 'creation-error', error });
  }, [handleRenderedEditorFailure]);
  const handleEditorActivationFailure = useCallback((error: unknown) => {
    handleRenderedEditorFailure({ reason: 'activation-error', error });
  }, [handleRenderedEditorFailure]);
  useEffect(() => {
    onEditorModeChange?.(
      isSourceMode ? 'source' : shouldUseSourceFallback ? 'fallback' : 'rendered',
    );
  }, [isSourceMode, onEditorModeChange, shouldUseSourceFallback]);
  const {
    coverController,
    coverLayoutActive,
    coverUrl,
    handlePreviewLayoutActiveChange,
    renderedCoverController,
    reservedCoverHeight,
    shouldRenderCover,
    shouldReserveCoverSpace,
  } = useMarkdownEditorCoverState({
    currentNotePath,
    hasActiveNote,
    isEditorViewReady,
  });

  return (
    <div
      className="h-full flex flex-col relative"
      data-note-toolbar-root="true"
      onClick={handleEditorClick}
    >
      {hasActiveNote ? (
        <Suspense fallback={null}>
          <EditorTopRightToolbar
            editorFind={editorFind}
            currentNotePath={currentNotePath}
            currentNoteTitle={currentNoteTitle}
            getCurrentNoteContent={getCurrentNoteContent}
            isSourceMode={isSourceMode}
            onToggleSourceMode={shouldUseSourceFallback ? undefined : handleToggleSourceMode}
            notesPath={notesPath}
            starred={starred}
            toggleStarred={toggleStarred}
            currentNoteMetadata={currentNoteMetadata}
            showNoteActions={!hideNoteActions}
            showOutline={isEditorViewReady && !shouldUseSourceFallback}
          />
        </Suspense>
      ) : null}

      <OverlayScrollArea
        ref={scrollRootRef}
        className={cn(
          'flex-1 relative transition-opacity duration-[var(--vlaina-duration-75)]',
          isModeSwitchLayoutPending && 'invisible',
          isSidebarSearchJumpPending && 'opacity-[var(--vlaina-opacity-0)] pointer-events-none',
        )}
        viewportClassName="flex flex-col items-center relative"
        draggingBodyClassName="app-overlay-scrollbar-dragging"
        preserveWheelIntentKey={currentNotePath}
        scrollbarVariant="compact"
        data-note-mode-switch-pending={isModeSwitchLayoutPending ? 'true' : undefined}
        data-note-scroll-root="true"
        data-note-cover-viewport="true"
      >
        {renderedCoverController ? (
          <NoteCoverCanvas
            controller={renderedCoverController}
            notePath={currentNotePath}
            readOnly={!shouldRenderCover}
            onPreviewLayoutActiveChange={handlePreviewLayoutActiveChange}
          />
        ) : shouldReserveCoverSpace ? (
          <div
            aria-hidden="true"
            className="relative w-full shrink-0"
            data-note-cover-placeholder="true"
            style={{ height: reservedCoverHeight, overflowAnchor: themeRenderingTokens.overflowAnchorNone }}
          />
        ) : null}

        <div
          className="w-full flex flex-col items-center relative translate-x-[var(--vlaina-window-resize-content-compensation-x)]"
          onClick={hasActiveNote ? focusEditorFromNoteUpperBlankArea : undefined}
          style={{
            marginLeft: contentOffset,
            transition: themeEditorLayoutTokens.contentOffsetTransition,
          }}
        >
          {hasRenderableNote ? (
            <>
              <NoteHeader
                key={currentNotePath}
                coverUrl={coverUrl}
                coverLayoutActive={coverLayoutActive}
                onAddCover={coverController.openCoverPicker}
                compactTitle={compactHeader}
              />

              <div
                ref={editorModeShellRef}
                className="w-full flex flex-col items-center"
                style={editorModeShellMinHeight === null
                  ? undefined
                  : { minHeight: editorModeShellMinHeight }}
              >
                <Suspense fallback={null}>
                  {isSourceMode ? (
                    <MarkdownSourceEditor
                      active={hasActiveNote}
                      currentNotePath={currentNotePath ?? ''}
                      showBodyLineNumbers={showBodyLineNumbers}
                      saveNote={saveNote}
                      mode="source"
                    />
                  ) : shouldUseSourceFallback ? (
                    <MarkdownSourceFallback
                      active={hasActiveNote}
                      currentNotePath={currentNotePath ?? ''}
                      showBodyLineNumbers={showBodyLineNumbers}
                      saveNote={saveNote}
                      onRetry={handleToggleSourceMode}
                    />
                  ) : (
                    <ErrorBoundary
                      onError={handleEditorRenderError}
                      resetKey={currentNotePath}
                      fallback={(
                        <MarkdownSourceFallback
                          active={hasActiveNote}
                          currentNotePath={currentNotePath ?? ''}
                          showBodyLineNumbers={showBodyLineNumbers}
                          saveNote={saveNote}
                          onRetry={handleToggleSourceMode}
                        />
                      )}
                    >
                      <MilkdownEditorRuntime
                        key={editorRuntimeRevision}
                        active={active}
                        showBodyLineNumbers={showBodyLineNumbers}
                        onEditorContentSyncFailure={handleEditorContentSyncFailure}
                        onEditorCreationFailure={handleEditorCreationFailure}
                        onEditorActivationFailure={handleEditorActivationFailure}
                        onEditorViewReady={handleEditorViewReady}
                      />
                    </ErrorBoundary>
                  )}
                </Suspense>
              </div>
            </>
          ) : null}

          {!hasRenderableNote ? (
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px overflow-hidden opacity-[var(--vlaina-opacity-0)] pointer-events-none"
              data-note-editor-prewarm="true"
            >
              <Suspense fallback={null}>
                <MilkdownEditorRuntime
                  active={false}
                  showBodyLineNumbers={false}
                />
              </Suspense>
            </div>
          ) : null}

          {!hasRenderableNote ? (
            <div
              className={cn(
                'milkdown-editor min-h-[var(--vlaina-size-420px)]',
                showBodyLineNumbers && 'markdown-body-line-numbers',
                EDITOR_LAYOUT_CLASS
              )}
              data-note-placeholder-root="true"
            />
          ) : null}
        </div>
      </OverlayScrollArea>
    </div>
  );
}
