import { useCallback, useEffect, useMemo, useRef } from 'react';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import { useNotesRootStore } from '@/stores/useNotesRootStore';
import { useUIStore } from '@/stores/uiSlice';
import { GraphCanvas } from './GraphCanvas';
import { layoutNoteGraph } from './model/graphLayout';
import { useGraphUIStore, type GraphNodePositions } from './store/useGraphUIStore';
import { requestEditorFocus } from '@/components/Notes/features/Editor/utils/editorFocusIntent';
import { useNoteGraphModel } from './hooks/useNoteGraphModel';
import { useGraphNoteScan } from './hooks/useGraphNoteScan';
import {
  collectLiveGraphPositionPaths,
  pruneGraphNodePositions,
} from './model/graphPositionPersistence';

const EMPTY_GRAPH_NODE_POSITIONS: GraphNodePositions = {};

interface GraphViewProps {
  active?: boolean;
  onStartupReady?: () => void;
  onPrimaryContentReady?: () => void;
}

export function GraphView({
  active = true,
  onStartupReady,
  onPrimaryContentReady,
}: GraphViewProps) {
  const { t } = useI18n();
  const openNote = useNotesStore((state) => state.openNote);
  const rootFolder = useNotesStore((state) => active ? state.rootFolder : null);
  const currentNotesRootPath = useNotesRootStore((state) => state.currentNotesRoot?.path ?? null);
  const recentNotesRoots = useNotesRootStore((state) => state.recentNotesRoots);
  const notesRootsInitialized = useNotesRootStore((state) => state.hasInitialized);
  const setAppViewMode = useUIStore((state) => state.setAppViewMode);
  const setSelectedPath = useGraphUIStore((state) => state.setSelectedPath);
  const setNodePositions = useGraphUIStore((state) => state.setNodePositions);
  const clearNodePositions = useGraphUIStore((state) => state.clearNodePositions);
  const positionOverrides = useGraphUIStore((state) => (
    currentNotesRootPath
      ? state.nodePositionsByRoot[currentNotesRootPath] ?? EMPTY_GRAPH_NODE_POSITIONS
      : EMPTY_GRAPH_NODE_POSITIONS
  ));
  const {
    currentNotePath,
    focusPath,
    fullGraph,
    selectedPath,
    visibleGraph,
  } = useNoteGraphModel(active);
  const scan = useGraphNoteScan({
    active,
    onPrimaryContentReady,
    onStartupReady,
    priorityPath: selectedPath ?? currentNotePath,
  });
  const selectionContextRef = useRef({
    currentNotePath,
    currentNotesRootPath,
  });
  const layout = useMemo(
    () => layoutNoteGraph(visibleGraph, focusPath),
    [focusPath, visibleGraph],
  );
  const positionPriorityPaths = useMemo(
    () => [currentNotePath, selectedPath].filter((path): path is string => Boolean(path)),
    [currentNotePath, selectedPath],
  );
  const livePositionPaths = useMemo(
    () => rootFolder
      ? collectLiveGraphPositionPaths(rootFolder.children, positionPriorityPaths)
      : null,
    [positionPriorityPaths, rootFolder],
  );

  useEffect(() => {
    if (!active) return;
    const previousContext = selectionContextRef.current;
    const currentNoteChanged = previousContext.currentNotePath !== currentNotePath;
    const notesRootChanged = previousContext.currentNotesRootPath !== currentNotesRootPath;
    selectionContextRef.current = { currentNotePath, currentNotesRootPath };
    if (!selectedPath) return;
    const selectedPathIsCurrent = selectedPath === currentNotePath;
    if (
      notesRootChanged
      || (!selectedPathIsCurrent && currentNoteChanged)
      || !fullGraph.nodes.some((node) => node.id === selectedPath)
    ) {
      setSelectedPath(null);
    }
  }, [
    active,
    currentNotePath,
    currentNotesRootPath,
    fullGraph.nodes,
    selectedPath,
    setSelectedPath,
  ]);

  const handleOpenNode = useCallback(async (path: string) => {
    await openNote(path);
    if (useNotesStore.getState().currentNote?.path !== path) return;
    requestEditorFocus(path);
    setAppViewMode('notes');
  }, [openNote, setAppViewMode]);
  const handleOpenPath = useCallback((path: string) => {
    void handleOpenNode(path);
  }, [handleOpenNode]);

  const handlePositionCommit = useCallback((path: string, position: { x: number; y: number }) => {
    if (!currentNotesRootPath) return;
    const currentPositions = useGraphUIStore.getState().nodePositionsByRoot[currentNotesRootPath]
      ?? EMPTY_GRAPH_NODE_POSITIONS;
    const nextPositions = { ...currentPositions, [path]: position };
    setNodePositions(
      currentNotesRootPath,
      livePositionPaths
        ? pruneGraphNodePositions(nextPositions, livePositionPaths, [path, ...positionPriorityPaths])
        : nextPositions,
    );
  }, [currentNotesRootPath, livePositionPaths, positionPriorityPaths, setNodePositions]);

  const handlePositionsCommit = useCallback((positions: GraphNodePositions) => {
    if (!currentNotesRootPath) return;
    const currentPositions = useGraphUIStore.getState().nodePositionsByRoot[currentNotesRootPath]
      ?? EMPTY_GRAPH_NODE_POSITIONS;
    const mergedPositions = { ...currentPositions, ...positions };
    if (!livePositionPaths) {
      setNodePositions(currentNotesRootPath, mergedPositions);
      return;
    }
    setNodePositions(
      currentNotesRootPath,
      pruneGraphNodePositions(mergedPositions, livePositionPaths, positionPriorityPaths),
    );
  }, [
    currentNotesRootPath,
    livePositionPaths,
    positionPriorityPaths,
    setNodePositions,
  ]);

  useEffect(() => {
    if (!active || !livePositionPaths) return;
    const store = useGraphUIStore.getState();
    if (currentNotesRootPath) {
      const current = store.nodePositionsByRoot[currentNotesRootPath] ?? EMPTY_GRAPH_NODE_POSITIONS;
      const pruned = pruneGraphNodePositions(current, livePositionPaths, positionPriorityPaths);
      const currentKeys = Object.keys(current);
      const prunedKeys = Object.keys(pruned);
      const changed = currentKeys.length !== prunedKeys.length
        || prunedKeys.some((path) => current[path]?.x !== pruned[path]?.x
          || current[path]?.y !== pruned[path]?.y);
      if (changed) setNodePositions(currentNotesRootPath, pruned);
    }
    if (notesRootsInitialized) {
      const validRoots = new Set([
        currentNotesRootPath,
        ...recentNotesRoots.map((notesRoot) => notesRoot.path),
      ].filter((path): path is string => Boolean(path)));
      for (const rootPath of Object.keys(store.nodePositionsByRoot)) {
        if (!validRoots.has(rootPath)) clearNodePositions(rootPath);
      }
    }
  }, [
    active,
    clearNodePositions,
    currentNotesRootPath,
    livePositionPaths,
    notesRootsInitialized,
    positionPriorityPaths,
    recentNotesRoots,
    setNodePositions,
  ]);

  return (
    <section
      aria-label={t('app.viewGraph')}
      aria-busy={scan.status === 'loading' || scan.status === 'provisional'}
      data-graph-view-mode="true"
      data-graph-active={active ? 'true' : 'false'}
      data-graph-scan-status={scan.status}
      className="relative h-full min-h-0 overflow-hidden bg-[var(--vlaina-color-graph-canvas)] text-[var(--vlaina-color-text-primary)]"
    >
      {scan.status === 'loading' ? (
        <div role="status" className="absolute inset-0 flex items-center justify-center text-sm text-[var(--vlaina-color-text-muted)]">
          {t('graph.loading')}
        </div>
      ) : scan.status === 'error' && layout.nodes.length === 0 ? (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-sm text-[var(--vlaina-color-text-muted)]">
          <span>{t('graph.scanError')}</span>
          <button
            type="button"
            onClick={scan.retry}
            className="min-h-[var(--vlaina-size-44px)] cursor-pointer rounded-full bg-[var(--vlaina-sidebar-row-selected-bg)] px-4 font-medium text-[var(--vlaina-sidebar-row-selected-text)]"
          >
            {t('graph.retry')}
          </button>
        </div>
      ) : layout.nodes.length === 0 ? (
        <div role="status" className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-[var(--vlaina-color-text-muted)]">
          {t('graph.empty')}
        </div>
      ) : (
        <GraphCanvas
          active={active}
          currentPath={currentNotePath}
          graph={layout}
          topOverlayVisible={scan.status !== 'complete'}
          positionOverrides={positionOverrides}
          selectedPath={selectedPath}
          onSelectPath={setSelectedPath}
          onOpenPath={handleOpenPath}
          onPositionCommit={handlePositionCommit}
          onPositionsCommit={handlePositionsCommit}
        />
      )}
      {(scan.status === 'loading' || scan.status === 'provisional')
        && layout.nodes.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 top-[var(--vlaina-space-12px)] flex justify-center px-3">
          <div
            role="status"
            className={cn(
              raisedPillSurfaceClass,
              'max-w-full truncate whitespace-nowrap rounded-full px-3 py-1.5 text-xs text-[var(--vlaina-color-text-muted)]',
            )}
          >
            {t('graph.scanning')}
          </div>
        </div>
      ) : null}
      {scan.status === 'error' && layout.nodes.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 top-[var(--vlaina-space-12px)] flex justify-center px-3">
          <div
            role="alert"
            className={cn(
              raisedPillSurfaceClass,
              'pointer-events-auto flex min-h-[var(--vlaina-size-44px)] min-w-0 max-w-full flex-nowrap items-center justify-center gap-2 rounded-full px-3 py-1 text-xs text-[var(--vlaina-color-text-muted)]',
            )}
          >
            <span className="min-w-0 truncate whitespace-nowrap">{t('graph.scanError')}</span>
            <button
              type="button"
              onClick={scan.retry}
              className="min-h-[var(--vlaina-size-44px)] shrink-0 cursor-pointer px-2 font-medium text-[var(--vlaina-color-text-primary)] underline"
            >
              {t('graph.retry')}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
