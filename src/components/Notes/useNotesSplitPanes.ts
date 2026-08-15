import { useCallback, useEffect, useRef, useState } from 'react';
import { useUIStore } from '@/stores/uiSlice';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import { openStoredNotePath } from '@/stores/notes/openNotePath';
import { logNotesSplitDiagnostic } from '@/lib/diagnostics/notesSplitDiagnostics';
import {
  focusCurrentEditorAtViewportPoint,
  type EditorViewportPoint,
} from './features/Editor/utils/focusEditorAtPoint';
import { getCurrentEditorNotePath } from './features/Editor/utils/editorViewRegistry';
import {
  countNotesSplitPreviewLeaves,
  createInitialNotesSplitPaneTree,
  findFirstNotesSplitPreviewLeaf,
  findNotesSplitPreviewLeafByPath,
  promoteNotesSplitPreviewLeafToPrimary,
  pruneNotesSplitPaneTree,
  type NotesSplitPaneTree,
  type NotesSplitPreviewLeaf,
} from './features/Split/notesSplitLayout';
import { isNotePathOpenInLatestTabs } from './notesViewHelpers';
import type { NotesSplitDropTarget } from './notesViewSplitTypes';
import { useNotesSplitResize } from './useNotesSplitResize';
import { useNotesSplitPaneDrag } from './useNotesSplitPaneDrag';
import { useNotesSplitDrop } from './useNotesSplitDrop';

export function useNotesSplitPanes(args: {
  active: boolean;
  currentNotePath: string | undefined;
  openNote: ReturnType<typeof useNotesStore.getState>['openNote'];
  openNoteByAbsolutePath: ReturnType<typeof useNotesStore.getState>['openNoteByAbsolutePath'];
  openTabs: ReturnType<typeof useNotesStore.getState>['openTabs'];
  prefetchNote: ReturnType<typeof useNotesStore.getState>['prefetchNote'];
}) {
  const {
    active,
    currentNotePath,
    openNote,
    openNoteByAbsolutePath,
    openTabs,
    prefetchNote,
  } = args;
  const setNotesSplitPanesActive = useUIStore((s) => s.setNotesSplitPanesActive);
  const [splitPaneTree, setSplitPaneTree] = useState<NotesSplitPaneTree>(() => createInitialNotesSplitPaneTree());
  const [activeSplitPreviewLeafId, setActiveSplitPreviewLeafId] = useState<string | null>(null);
  const [primaryPreviewLeaf, setPrimaryPreviewLeaf] = useState<NotesSplitPreviewLeaf | null>(null);
  const [splitDropTarget, setSplitDropTarget] = useState<NotesSplitDropTarget | null>(null);
  const splitDropRootRef = useRef<HTMLDivElement>(null);
  const splitPaneIdSequenceRef = useRef(0);
  const splitPaneTreeRef = useRef(splitPaneTree);
  const currentNotePathRef = useRef<string | null>(currentNotePath ?? null);
  const activeSplitPreviewLeafIdRef = useRef<string | null>(activeSplitPreviewLeafId);
  const primaryPreviewLeafRef = useRef<NotesSplitPreviewLeaf | null>(primaryPreviewLeaf);
  const pendingSplitEditorFocusRef = useRef<{
    path: string;
    point: EditorViewportPoint;
  } | null>(null);

  const nextSplitPaneId = useCallback((prefix: 'preview' | 'split') => {
    splitPaneIdSequenceRef.current += 1;
    return `${prefix}:${splitPaneIdSequenceRef.current}`;
  }, []);

  useEffect(() => {
    splitPaneTreeRef.current = splitPaneTree;
  }, [splitPaneTree]);

  useEffect(() => {
    activeSplitPreviewLeafIdRef.current = activeSplitPreviewLeafId;
  }, [activeSplitPreviewLeafId]);

  useEffect(() => {
    primaryPreviewLeafRef.current = primaryPreviewLeaf;
  }, [primaryPreviewLeaf]);

  const hasSplitPanes = countNotesSplitPreviewLeaves(splitPaneTree) > 0;

  useEffect(() => {
    setNotesSplitPanesActive(active && hasSplitPanes);
    return () => setNotesSplitPanesActive(false);
  }, [active, hasSplitPanes, setNotesSplitPanesActive]);

  useEffect(() => {
    if (hasSplitPanes) return;
    setActiveSplitPreviewLeafId(null);
    setPrimaryPreviewLeaf(null);
  }, [hasSplitPanes]);

  useEffect(() => {
    const previousPath = currentNotePathRef.current;
    currentNotePathRef.current = currentNotePath ?? null;
    if (!currentNotePath || !previousPath || currentNotePath === previousPath) {
      return;
    }

    if (primaryPreviewLeafRef.current?.path === currentNotePath) {
      setActiveSplitPreviewLeafId(null);
      setPrimaryPreviewLeaf(null);
      return;
    }

    const targetLeaf = findNotesSplitPreviewLeafByPath(splitPaneTreeRef.current, currentNotePath);
    if (!targetLeaf) {
      setActiveSplitPreviewLeafId(null);
      setPrimaryPreviewLeaf(null);
      return;
    }

    if (!activeSplitPreviewLeafIdRef.current) {
      setPrimaryPreviewLeaf({
        type: 'preview',
        id: nextSplitPaneId('preview'),
        path: previousPath,
        requiresOpenTab: isNotePathOpenInLatestTabs(previousPath),
      });
    }
    setActiveSplitPreviewLeafId(targetLeaf.id);
  }, [currentNotePath, nextSplitPaneId]);

  const { resolveSplitDropTarget } = useNotesSplitDrop({
    active,
    currentNotePathRef,
    nextSplitPaneId,
    openNote,
    openNoteByAbsolutePath,
    openTabs,
    prefetchNote,
    setSplitDropTarget,
    setSplitPaneTree,
    splitDropRootRef,
  });

  const closeSplitPane = useCallback((leafId: string) => {
    setSplitPaneTree((currentTree) => (
      pruneNotesSplitPaneTree(currentTree, (leaf) => leaf.id === leafId) ?? createInitialNotesSplitPaneTree()
    ));
  }, []);

  const closePrimaryPreviewPane = useCallback(() => {
    const activePreviewLeafId = activeSplitPreviewLeafIdRef.current;
    if (!activePreviewLeafId) {
      return;
    }

    setSplitPaneTree((currentTree) => (
      promoteNotesSplitPreviewLeafToPrimary(currentTree, activePreviewLeafId) ?? createInitialNotesSplitPaneTree()
    ));
    setActiveSplitPreviewLeafId(null);
    setPrimaryPreviewLeaf(null);
  }, []);

  const applyPendingSplitEditorFocus = useCallback(() => {
    const pending = pendingSplitEditorFocusRef.current;
    const latestPath = useNotesStore.getState().currentNote?.path ?? null;
    if (!pending || pending.path !== latestPath) {
      return;
    }
    if (getCurrentEditorNotePath() !== pending.path) {
      return;
    }

    if (focusCurrentEditorAtViewportPoint(pending.point)) {
      pendingSplitEditorFocusRef.current = null;
    }
  }, []);

  const activateSplitPane = useCallback((leafId: string, path: string, point?: EditorViewportPoint) => {
    const previousPath = currentNotePathRef.current;
    logNotesSplitDiagnostic('split-activate-preview-start', { leafId, path, point: point ?? null, previousPath });
    pendingSplitEditorFocusRef.current = point ? { path, point } : null;
    return Promise.resolve(openStoredNotePath(path, {
      openNote,
      openNoteByAbsolutePath,
    })).then(() => {
      if (useNotesStore.getState().currentNote?.path !== path) {
        if (pendingSplitEditorFocusRef.current?.path === path) {
          pendingSplitEditorFocusRef.current = null;
        }
        return;
      }
      if (previousPath && previousPath !== path) {
        if (!activeSplitPreviewLeafIdRef.current) {
          setPrimaryPreviewLeaf({
            type: 'preview',
            id: nextSplitPaneId('preview'),
            path: previousPath,
            requiresOpenTab: isNotePathOpenInLatestTabs(previousPath),
          });
        }
        setActiveSplitPreviewLeafId(leafId);
      }
      logNotesSplitDiagnostic('split-activate-preview-complete', {
        activeLeafId: leafId,
        currentPath: useNotesStore.getState().currentNote?.path ?? null,
        path,
        previousPath,
      });
      window.requestAnimationFrame(applyPendingSplitEditorFocus);
    });
  }, [applyPendingSplitEditorFocus, nextSplitPaneId, openNote, openNoteByAbsolutePath]);

  const activatePrimaryPreviewPane = useCallback((path: string, point?: EditorViewportPoint) => {
    logNotesSplitDiagnostic('split-activate-primary-preview-start', {
      path,
      point: point ?? null,
      previousPath: currentNotePathRef.current,
    });
    pendingSplitEditorFocusRef.current = point ? { path, point } : null;
    return Promise.resolve(openStoredNotePath(path, {
      openNote,
      openNoteByAbsolutePath,
    })).then(() => {
      if (useNotesStore.getState().currentNote?.path !== path) {
        if (pendingSplitEditorFocusRef.current?.path === path) {
          pendingSplitEditorFocusRef.current = null;
        }
        return;
      }
      setActiveSplitPreviewLeafId(null);
      setPrimaryPreviewLeaf(null);
      logNotesSplitDiagnostic('split-activate-primary-preview-complete', {
        currentPath: useNotesStore.getState().currentNote?.path ?? null,
        path,
      });
      window.requestAnimationFrame(applyPendingSplitEditorFocus);
    });
  }, [applyPendingSplitEditorFocus, openNote, openNoteByAbsolutePath]);

  const closeActiveSplitPane = useCallback(() => {
    const activePreviewLeafId = activeSplitPreviewLeafIdRef.current;
    if (activePreviewLeafId) {
      const restoreLeaf = primaryPreviewLeafRef.current ?? findFirstNotesSplitPreviewLeaf(splitPaneTreeRef.current);
      setSplitPaneTree((currentTree) => (
        pruneNotesSplitPaneTree(currentTree, (leaf) => leaf.id === activePreviewLeafId) ?? createInitialNotesSplitPaneTree()
      ));
      setActiveSplitPreviewLeafId(null);
      setPrimaryPreviewLeaf(null);
      if (restoreLeaf) {
        void Promise.resolve(openStoredNotePath(restoreLeaf.path, {
          openNote,
          openNoteByAbsolutePath,
        })).catch(() => undefined);
      }
      return;
    }

    const promotedLeaf = findFirstNotesSplitPreviewLeaf(splitPaneTreeRef.current);
    if (!promotedLeaf) {
      return;
    }

    setSplitPaneTree((currentTree) => (
      promoteNotesSplitPreviewLeafToPrimary(currentTree, promotedLeaf.id) ?? createInitialNotesSplitPaneTree()
    ));
    void Promise.resolve(openStoredNotePath(promotedLeaf.path, {
      openNote,
      openNoteByAbsolutePath,
    })).catch(() => undefined);
  }, [openNote, openNoteByAbsolutePath]);

  const { activeSplitResizeRef, beginSplitResize, stopSplitResize } = useNotesSplitResize({ setSplitPaneTree });
  const { beginSplitPaneDrag } = useNotesSplitPaneDrag({
    active,
    activeSplitResizeRef,
    hasSplitPanes,
    nextSplitPaneId,
    resolveSplitDropTarget,
    setSplitDropTarget,
    setSplitPaneTree,
    stopSplitResize,
  });

  return {
    activatePrimaryPreviewPane,
    activateSplitPane,
    activeSplitPreviewLeafId,
    applyPendingSplitEditorFocus,
    beginSplitPaneDrag,
    beginSplitResize,
    closeActiveSplitPane,
    closePrimaryPreviewPane,
    closeSplitPane,
    hasSplitPanes,
    primaryPreviewLeaf,
    splitDropRootRef,
    splitDropTarget,
    splitPaneTree,
  };
}
