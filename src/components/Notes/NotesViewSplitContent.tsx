import { Suspense, useCallback, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import type { NoteMetadataEntry } from '@/stores/notes/types';
import { NoteToolbarActions } from './features/Editor/NoteToolbarActions';
import {
  LargeMarkdownFirstPaintPreview,
} from './features/Editor/LargeMarkdownFirstPaintPreview';
import type { EditorViewportPoint } from './features/Editor/utils/focusEditorAtPoint';
import {
  NotesSplitPaneChrome,
  NotesSplitDropOverlay,
  NotesSplitPreviewPane,
} from './features/Split/NotesSplitPreviewPane';
import type {
  NotesSplitOrientation,
  NotesSplitPaneTree,
  NotesSplitPreviewLeaf,
} from './features/Split/notesSplitLayout';
import { MarkdownEditor } from './notesViewLazyComponents';
import type { NotesSplitDropTarget } from './notesViewSplitTypes';

const EMPTY_NOTE_CONTENTS_CACHE: ReturnType<typeof useNotesStore.getState>['noteContentsCache'] = new Map();

export function NotesViewSplitContent({
  active,
  activeSplitPreviewLeafId,
  activatePrimaryPreviewPane,
  activateSplitPane,
  beginSplitPaneDrag,
  beginSplitResize,
  canLoadMarkdownEditor,
  closeActiveSplitPane,
  closePrimaryPreviewPane,
  closeSplitPane,
  currentNoteMetadata,
  currentNotePath,
  currentNoteStarred,
  firstPaintPreviewMarkdown,
  getDisplayName,
  hasSplitPanes,
  isPrimaryContentReady,
  notesPath,
  onPrimaryContentReady,
  primaryPreviewLeaf,
  splitDropTarget,
  splitPaneTree,
  toggleStarred,
}: {
  active: boolean;
  activeSplitPreviewLeafId: string | null;
  activatePrimaryPreviewPane: (path: string, point?: EditorViewportPoint) => Promise<void>;
  activateSplitPane: (leafId: string, path: string, point?: EditorViewportPoint) => Promise<void>;
  beginSplitPaneDrag: (event: ReactPointerEvent<HTMLDivElement>, sourceLeafId: string) => void;
  beginSplitResize: (splitId: string, orientation: NotesSplitOrientation, event: ReactPointerEvent<HTMLDivElement>) => void;
  canLoadMarkdownEditor: boolean;
  closeActiveSplitPane: () => void;
  closePrimaryPreviewPane: () => void;
  closeSplitPane: (leafId: string) => void;
  currentNoteMetadata: NoteMetadataEntry | undefined;
  currentNotePath: string | undefined;
  currentNoteStarred: boolean;
  firstPaintPreviewMarkdown: string | null;
  getDisplayName: ReturnType<typeof useNotesStore.getState>['getDisplayName'];
  hasSplitPanes: boolean;
  isPrimaryContentReady: boolean;
  notesPath: string;
  onPrimaryContentReady: () => void;
  primaryPreviewLeaf: NotesSplitPreviewLeaf | null;
  splitDropTarget: NotesSplitDropTarget | null;
  splitPaneTree: NotesSplitPaneTree;
  toggleStarred: ReturnType<typeof useNotesStore.getState>['toggleStarred'];
}) {
  const currentNoteContent = useNotesStore(
    useCallback((state) => {
      const currentNote = state.currentNote;
      if (!hasSplitPanes || !currentNotePath || !currentNote || currentNote.path !== currentNotePath) {
        return '';
      }
      return currentNote.content;
    }, [currentNotePath, hasSplitPanes]),
  );
  const noteContentsCache = useNotesStore(
    useCallback((state) => (
      hasSplitPanes ? state.noteContentsCache : EMPTY_NOTE_CONTENTS_CACHE
    ), [hasSplitPanes]),
  );
  const getCurrentNoteContent = useCallback(() => {
    const currentNote = useNotesStore.getState().currentNote;
    return currentNote && currentNote.path === currentNotePath ? currentNote.content : '';
  }, [currentNotePath]);
  const currentSplitPaneTitle = currentNotePath ? getDisplayName(currentNotePath) : '';
  const primaryEditorContent = (
    <div
      className="relative h-full min-h-0 min-w-0"
      data-notes-split-pane-content="primary"
    >
      {firstPaintPreviewMarkdown ? (
        <div className="absolute inset-0 z-[var(--vlaina-z-1)] flex justify-center bg-[var(--vlaina-bg-primary)]">
          <LargeMarkdownFirstPaintPreview markdown={firstPaintPreviewMarkdown} />
        </div>
      ) : null}

      {canLoadMarkdownEditor ? (
        <Suspense fallback={null}>
          <MarkdownEditor
            active={active}
            onEditorViewReady={onPrimaryContentReady}
            compactHeader={hasSplitPanes}
            hideNoteActions={hasSplitPanes}
          />
        </Suspense>
      ) : null}
    </div>
  );
  const renderPrimaryEditorPane = (sourceLeafId?: string, activationFallback?: ReactNode) => (
    hasSplitPanes ? (
      <section
        className="relative flex h-full min-h-0 min-w-0 flex-col bg-[var(--vlaina-bg-primary)]"
        data-notes-split-pane="primary"
      >
        <NotesSplitPaneChrome
          path={currentNotePath ?? undefined}
          sourceLeafId={sourceLeafId}
          title={currentSplitPaneTitle}
          onDragPointerDown={beginSplitPaneDrag}
          actions={(
            <NoteToolbarActions
              currentNotePath={currentNotePath}
              currentNoteTitle={currentSplitPaneTitle}
              getCurrentNoteContent={getCurrentNoteContent}
              notesPath={notesPath}
              starred={currentNoteStarred}
              toggleStarred={toggleStarred}
              currentNoteMetadata={currentNoteMetadata}
              buttonClassName="h-7 w-7"
              forceShowChat
            />
          )}
          onClose={closeActiveSplitPane}
        />
        <div className="relative min-h-0 flex-1">
          {activationFallback}
          {primaryEditorContent}
        </div>
      </section>
    ) : (
      <div
        className="relative h-full min-h-0 min-w-0"
        data-notes-split-pane="primary"
      >
        {primaryEditorContent}
      </div>
    )
  );

  const getSplitPaneContent = (path: string) => (
    currentNotePath === path
      ? currentNoteContent
      : noteContentsCache.get(path)?.content ?? ''
  );

  const getSplitPaneActivationFallbackContent = (path: string) => (
    noteContentsCache.get(path)?.content ?? (currentNotePath === path ? currentNoteContent : '')
  );

  const renderSplitActivationFallback = (path: string, title: string) => (
    !isPrimaryContentReady ? (
      <div
        className="pointer-events-none absolute inset-0 z-[var(--vlaina-z-1)]"
        data-notes-split-activation-fallback="true"
      >
        <NotesSplitPreviewPane
          content={getSplitPaneActivationFallbackContent(path)}
          path={path}
          title={title}
          interactive={false}
          showChrome={false}
          onActivate={() => undefined}
          onPaneDragPointerDown={beginSplitPaneDrag}
          onClose={() => undefined}
        />
      </div>
    ) : null
  );

  const renderLeafDropOverlay = (leafId: string) => (
    splitDropTarget?.leafId === leafId ? (
      <NotesSplitDropOverlay direction={splitDropTarget.direction} />
    ) : null
  );

  function renderSplitPaneTree(node: NotesSplitPaneTree): React.ReactNode {
    if (node.type === 'primary') {
      const displacedPrimaryLeaf = activeSplitPreviewLeafId && primaryPreviewLeaf ? primaryPreviewLeaf : null;
      const leafPath = displacedPrimaryLeaf?.path ?? currentNotePath;

      return (
        <div
          key={node.id}
          className="relative h-full min-h-0 min-w-0"
          data-notes-split-leaf-id={node.id}
          data-notes-split-leaf-path={leafPath ?? undefined}
          data-notes-split-pane={displacedPrimaryLeaf ? 'preview' : undefined}
        >
          {displacedPrimaryLeaf ? (
            <NotesSplitPreviewPane
              content={getSplitPaneContent(displacedPrimaryLeaf.path)}
              path={displacedPrimaryLeaf.path}
              sourceLeafId={node.id}
              title={getDisplayName(displacedPrimaryLeaf.path)}
              onActivate={(point) => activatePrimaryPreviewPane(displacedPrimaryLeaf.path, point)}
              onPaneDragPointerDown={beginSplitPaneDrag}
              onClose={closePrimaryPreviewPane}
            />
          ) : renderPrimaryEditorPane(
            node.id,
            currentNotePath ? renderSplitActivationFallback(currentNotePath, currentSplitPaneTitle) : null,
          )}
          {renderLeafDropOverlay(node.id)}
        </div>
      );
    }

    if (node.type === 'preview') {
      const isActivePreviewLeaf = activeSplitPreviewLeafId === node.id && currentNotePath === node.path;
      const content = getSplitPaneContent(node.path);

      return (
        <div
          key={node.id}
          className="relative h-full min-h-0 min-w-0"
          data-notes-split-leaf-id={node.id}
          data-notes-split-leaf-path={node.path}
          data-notes-split-pane={isActivePreviewLeaf ? 'primary' : 'preview'}
        >
          {isActivePreviewLeaf ? (
            renderPrimaryEditorPane(
              node.id,
              renderSplitActivationFallback(node.path, getDisplayName(node.path)),
            )
          ) : (
            <NotesSplitPreviewPane
              content={content}
              path={node.path}
              sourceLeafId={node.id}
              title={getDisplayName(node.path)}
              onActivate={(point) => activateSplitPane(node.id, node.path, point)}
              onPaneDragPointerDown={beginSplitPaneDrag}
              onClose={() => closeSplitPane(node.id)}
            />
          )}
          {renderLeafDropOverlay(node.id)}
        </div>
      );
    }

    const isHorizontal = node.orientation === 'horizontal';
    const divider = (
      <div
        role="separator"
        aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
        data-notes-split-divider={node.orientation}
        data-notes-split-id={node.id}
        className={cn('group relative z-[var(--vlaina-z-10)] touch-none bg-transparent', isHorizontal ? 'cursor-col-resize' : 'cursor-row-resize')}
        onPointerDown={(event) => beginSplitResize(node.id, node.orientation, event)}
      >
        <div className={cn('absolute bg-[var(--vlaina-accent)]', isHorizontal ? 'bottom-0 left-1/2 top-0 w-[var(--vlaina-size-2px)] -translate-x-1/2' : 'left-0 right-0 top-1/2 h-[var(--vlaina-size-2px)] -translate-y-1/2')} />
      </div>
    );

    return (
      <div
        key={node.id}
        className="grid h-full min-h-0 w-full min-w-0"
        data-notes-split-layout={node.direction}
        data-notes-split-orientation={node.orientation}
        style={isHorizontal
          ? { gridTemplateColumns: `minmax(0, ${node.ratio}fr) var(--vlaina-size-4px) minmax(0, ${1 - node.ratio}fr)` }
          : { gridTemplateRows: `minmax(0, ${node.ratio}fr) var(--vlaina-size-4px) minmax(0, ${1 - node.ratio}fr)` }}
      >
        <div className="min-h-0 min-w-0">{renderSplitPaneTree(node.first)}</div>
        {divider}
        <div className="min-h-0 min-w-0">{renderSplitPaneTree(node.second)}</div>
      </div>
    );
  }

  return <>{renderSplitPaneTree(splitPaneTree)}</>;
}
