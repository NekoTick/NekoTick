import { stripSupportedMarkdownExtension } from '@/lib/notes/markdownFile';
import { getNoteTitleFromPath } from '@/lib/notes/displayName';
import { getNoteGraphLinkReferences } from '@/lib/notes/noteTextAnalysis';
import type { FileTreeNode, NoteContentCacheEntry } from '@/stores/notes/types';
import { collectNotePaths } from './graphNotePaths';
import { buildVisibleNoteGraph } from './graphNoteVisibility';

export const MAX_GRAPH_NODES = 240;
export const MAX_GRAPH_EDGES = 4_000;
export const MAX_GRAPH_CANDIDATE_NODES = 5_000;

const EXTERNAL_LINK_TARGET_PATTERN = /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu;

export interface NoteGraphNode {
  id: string;
  label: string;
  degree: number;
}

export interface NoteGraphEdge {
  source: string;
  target: string;
}

export interface NoteGraph {
  nodes: NoteGraphNode[];
  edges: NoteGraphEdge[];
}

export interface NoteGraphScanInput {
  key: string;
  priorityPaths: string[];
}

export interface NoteGraphStats {
  totalCandidateNodes: number;
  totalCandidateEdges: number;
  nodesTruncated: boolean;
  edgesTruncated: boolean;
}

export interface BuiltNoteGraph extends NoteGraph {
  stats: NoteGraphStats;
}

let graphBuildCache: {
  baselineGraph: BuiltNoteGraph;
  candidateEdges: NoteGraphEdge[];
  candidateEdgesTruncated: boolean;
  candidatePaths: string[];
  fileTree: readonly FileTreeNode[];
  totalCandidateNodes: number;
  noteContentsCache: ReadonlyMap<string, NoteContentCacheEntry>;
  priorityKey: string;
  revision: number;
  graph: BuiltNoteGraph;
} | null = null;

export function createNoteGraphScanInput(nodes: readonly FileTreeNode[]): NoteGraphScanInput {
  const candidatePaths = collectNotePaths(nodes, MAX_GRAPH_CANDIDATE_NODES).paths;
  return {
    key: candidatePaths.join('\0'),
    priorityPaths: candidatePaths.slice(0, MAX_GRAPH_NODES),
  };
}

function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return '';
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

function withoutExtension(path: string): string {
  return stripSupportedMarkdownExtension(path).toLocaleLowerCase();
}

function sourceDirectory(path: string): string {
  const slashIndex = path.lastIndexOf('/');
  return slashIndex < 0 ? '' : path.slice(0, slashIndex);
}

function decodeLinkTarget(value: string): string {
  const rawTarget = value.split('#', 1)[0]?.split('?', 1)[0]?.trim() ?? '';
  if (EXTERNAL_LINK_TARGET_PATTERN.test(rawTarget)) return '';
  if (!rawTarget) return '';
  try {
    return decodeURIComponent(rawTarget);
  } catch {
    return rawTarget;
  }
}

function createTargetResolver(paths: readonly string[]) {
  const pathByKey = new Map(paths.map((path) => [withoutExtension(normalizePath(path)), path]));
  const pathsByTitle = new Map<string, string[]>();
  const resolvedTargets = new Map<string, string | null>();
  for (const path of paths) {
    const title = getNoteTitleFromPath(path).toLocaleLowerCase();
    const titlePaths = pathsByTitle.get(title);
    if (titlePaths) titlePaths.push(path);
    else pathsByTitle.set(title, [path]);
  }

  const resolveTarget = (sourcePath: string, rawTarget: string): string | null => {
    const target = decodeLinkTarget(rawTarget);
    if (!target) return null;

    const relativeCandidate = normalizePath([sourceDirectory(sourcePath), target].filter(Boolean).join('/'));
    const relativeMatch = pathByKey.get(withoutExtension(relativeCandidate));
    if (relativeMatch) return relativeMatch;

    const rootMatch = pathByKey.get(withoutExtension(normalizePath(target)));
    if (rootMatch) return rootMatch;

    const titleMatches = pathsByTitle.get(getNoteTitleFromPath(target).toLocaleLowerCase()) ?? [];
    if (titleMatches.length < 2) return titleMatches[0] ?? null;
    const currentDirectory = sourceDirectory(sourcePath);
    return [...titleMatches].sort((left, right) => {
      const leftIsLocal = sourceDirectory(left) === currentDirectory;
      const rightIsLocal = sourceDirectory(right) === currentDirectory;
      if (leftIsLocal !== rightIsLocal) return leftIsLocal ? -1 : 1;
      const leftDepth = normalizePath(left).split('/').length;
      const rightDepth = normalizePath(right).split('/').length;
      return leftDepth - rightDepth || left.localeCompare(right);
    })[0] ?? null;
  };

  return (sourcePath: string, rawTarget: string): string | null => {
    const key = `${sourcePath}\n${rawTarget}`;
    if (resolvedTargets.has(key)) return resolvedTargets.get(key) ?? null;
    const resolved = resolveTarget(sourcePath, rawTarget);
    resolvedTargets.set(key, resolved);
    return resolved;
  };
}

export function buildNoteGraph(
  fileTree: readonly FileTreeNode[],
  noteContentsCache: ReadonlyMap<string, NoteContentCacheEntry>,
  revision?: number,
  priorityPaths: readonly string[] = [],
): BuiltNoteGraph {
  const priorityKey = JSON.stringify(priorityPaths);
  const cachedSource = graphBuildCache;
  const matchesCachedSource = (
    revision !== undefined
    && cachedSource !== null
    && cachedSource.fileTree === fileTree
    && cachedSource.noteContentsCache === noteContentsCache
    && cachedSource.revision === revision
  );
  if (matchesCachedSource && cachedSource.priorityKey === priorityKey) {
    return cachedSource.graph;
  }

  const cached = matchesCachedSource ? cachedSource : null;
  const collectedPaths = cached
    ? { paths: cached.candidatePaths, total: cached.totalCandidateNodes }
    : collectNotePaths(fileTree, MAX_GRAPH_CANDIDATE_NODES);
  const candidatePaths = collectedPaths.paths;
  let candidateEdges = cached?.candidateEdges ?? [];
  let candidateEdgesTruncated = cached?.candidateEdgesTruncated ?? false;

  if (cached) {
    const baselineIds = new Set(cached.baselineGraph.nodes.map((node) => node.id));
    if (priorityPaths.every((path) => baselineIds.has(path))) {
      graphBuildCache = { ...cached, graph: cached.baselineGraph, priorityKey };
      return cached.baselineGraph;
    }
  } else {
    const candidatePathSet = new Set(candidatePaths);
    const resolveTargetForPath = createTargetResolver(candidatePaths);
    const edgeKeys = new Set<string>();
    candidateEdges = [];

    graphScan:
    for (const source of candidatePaths) {
      const entry = noteContentsCache.get(source);
      if (!entry) continue;

      for (const rawTarget of getNoteGraphLinkReferences(entry, entry.content)) {
        const target = resolveTargetForPath(source, rawTarget);
        if (!target || target === source || !candidatePathSet.has(target)) continue;
        const [left, right] = source < target ? [source, target] : [target, source];
        const key = `${left}\n${right}`;
        if (edgeKeys.has(key)) continue;
        edgeKeys.add(key);
        if (candidateEdges.length >= MAX_GRAPH_EDGES) {
          candidateEdgesTruncated = true;
          break graphScan;
        }
        candidateEdges.push({ source: left, target: right });
      }
    }
  }

  const contentIncomplete = candidateEdgesTruncated
    || candidatePaths.length < collectedPaths.total
    || candidatePaths.some((path) => !noteContentsCache.has(path));
  const baselineGraph = cached?.baselineGraph ?? buildVisibleNoteGraph({
    candidateEdges,
    candidatePaths,
    contentIncomplete,
    maximumNodes: MAX_GRAPH_NODES,
    priorityPaths: [],
    totalCandidateNodes: collectedPaths.total,
  });
  const visibleCandidatePaths = priorityPaths.every((path) => candidatePaths.includes(path))
    ? candidatePaths
    : collectNotePaths(fileTree, MAX_GRAPH_CANDIDATE_NODES, priorityPaths).paths;
  const graph = priorityPaths.length === 0
    ? baselineGraph
    : buildVisibleNoteGraph({
      candidateEdges,
      candidatePaths: visibleCandidatePaths,
      contentIncomplete,
      maximumNodes: MAX_GRAPH_NODES,
      priorityPaths,
      totalCandidateNodes: collectedPaths.total,
    });
  if (revision !== undefined) {
    graphBuildCache = {
      baselineGraph,
      candidateEdges,
      candidateEdgesTruncated,
      candidatePaths: [...candidatePaths],
      fileTree,
      noteContentsCache,
      priorityKey,
      revision,
      graph,
      totalCandidateNodes: collectedPaths.total,
    };
  }
  return graph;
}
