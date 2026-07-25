import { useMemo, useRef } from 'react';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import type { FileTreeNode, NoteContentCacheEntry } from '@/stores/notes/types';
import { filterNoteGraph } from '../model/graphFilters';
import { buildNoteGraph } from '../model/noteGraph';
import { collectNoteGraphSearchNodes } from '../model/graphNotePaths';
import { useGraphUIStore, type GraphMode } from '../store/useGraphUIStore';

const EMPTY_FILE_TREE: readonly FileTreeNode[] = [];
const EMPTY_NOTE_CACHE: ReadonlyMap<string, NoteContentCacheEntry> = new Map();

export function useNoteGraphModel(
  active = true,
  options: { includeSearchNodes?: boolean } = {},
) {
  const activeRootFolder = useNotesStore((state) => active ? state.rootFolder : null);
  const activeCurrentNotePath = useNotesStore((state) => active ? state.currentNote?.path ?? null : null);
  const activeNoteCache = useNotesStore((state) => active ? state.noteContentsCache : EMPTY_NOTE_CACHE);
  const activeCacheRevision = useNotesStore((state) => active ? state.noteContentsCacheRevision : -1);
  const activeMode = useGraphUIStore((state) => active ? state.mode : null);
  const activeSelectedPath = useGraphUIStore((state) => active ? state.selectedPath : null);
  const snapshotRef = useRef({
    rootFolder: activeRootFolder,
    currentNotePath: activeCurrentNotePath,
    noteContentsCache: activeNoteCache,
    noteContentsCacheRevision: activeCacheRevision,
    mode: (activeMode ?? 'all') as GraphMode,
    selectedPath: activeSelectedPath,
  });
  if (active) {
    snapshotRef.current = {
      rootFolder: activeRootFolder,
      currentNotePath: activeCurrentNotePath,
      noteContentsCache: activeNoteCache,
      noteContentsCacheRevision: activeCacheRevision,
      mode: activeMode ?? 'all',
      selectedPath: activeSelectedPath,
    };
  }
  const {
    rootFolder,
    currentNotePath,
    noteContentsCache,
    noteContentsCacheRevision,
    mode,
    selectedPath,
  } = snapshotRef.current;
  const priorityPaths = useMemo(
    () => [selectedPath, currentNotePath].filter((path): path is string => Boolean(path)),
    [currentNotePath, selectedPath],
  );
  const fullGraph = useMemo(
    () => buildNoteGraph(
      rootFolder?.children ?? EMPTY_FILE_TREE,
      noteContentsCache,
      noteContentsCacheRevision,
      priorityPaths,
    ),
    [noteContentsCache, noteContentsCacheRevision, priorityPaths, rootFolder],
  );
  const searchNodes = useMemo(() => {
    if (!options.includeSearchNodes) return [];
    const degreeByPath = new Map(fullGraph.nodes.map((node) => [node.id, node.degree]));
    return collectNoteGraphSearchNodes(rootFolder?.children ?? EMPTY_FILE_TREE).map((node) => ({
      ...node,
      degree: degreeByPath.get(node.id) ?? 0,
    }));
  }, [fullGraph.nodes, options.includeSearchNodes, rootFolder]);
  const fallbackFocusPath = fullGraph.nodes.some((node) => node.id === currentNotePath)
    ? currentNotePath
    : fullGraph.nodes[0]?.id ?? null;
  const focusPath = fullGraph.nodes.some((node) => node.id === selectedPath)
    ? selectedPath
    : fallbackFocusPath;
  const visibleGraph = useMemo(() => filterNoteGraph(fullGraph, {
    scope: mode,
    focusNodeId: focusPath,
    localDepth: 1,
  }), [focusPath, fullGraph, mode]);

  return {
    currentNotePath,
    fallbackFocusPath,
    focusPath,
    fullGraph,
    mode,
    searchNodes,
    selectedPath,
    visibleGraph,
  };
}
