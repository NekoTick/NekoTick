import type { NoteGraph, NoteGraphNode } from './noteGraph';

export type GraphScope = 'all' | 'local';

export interface GraphFilterOptions {
  scope: GraphScope;
  focusNodeId?: string | null;
  localDepth?: number;
}

let graphFilterCache: {
  focusNodeId: string | null;
  graph: NoteGraph;
  localDepth: number;
  result: NoteGraph;
} | null = null;

function buildAdjacency(graph: NoteGraph): Map<string, Set<string>> {
  const adjacency = new Map(graph.nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) continue;
    adjacency.get(edge.source)!.add(edge.target);
    adjacency.get(edge.target)!.add(edge.source);
  }
  return adjacency;
}

export function filterNoteGraph(graph: NoteGraph, options: GraphFilterOptions): NoteGraph {
  if (options.scope === 'all') return graph;

  const focusNodeId = options.focusNodeId ?? null;
  const maxDepth = Math.max(0, Math.floor(options.localDepth ?? 1));
  if (
    graphFilterCache?.graph === graph
    && graphFilterCache.focusNodeId === focusNodeId
    && graphFilterCache.localDepth === maxDepth
  ) {
    return graphFilterCache.result;
  }
  if (!focusNodeId || !graph.nodes.some((node) => node.id === focusNodeId)) {
    const result = { nodes: [], edges: [] };
    graphFilterCache = { focusNodeId, graph, localDepth: maxDepth, result };
    return result;
  }

  const adjacency = buildAdjacency(graph);
  const distances = new Map<string, number>([[focusNodeId, 0]]);
  const queue = [focusNodeId];

  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index]!;
    const distance = distances.get(nodeId)!;
    if (distance >= maxDepth) continue;

    for (const neighborId of adjacency.get(nodeId) ?? []) {
      if (distances.has(neighborId)) continue;
      distances.set(neighborId, distance + 1);
      queue.push(neighborId);
    }
  }

  const visibleNodeIds = new Set(distances.keys());
  const edges = graph.edges.filter(
    (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target),
  );
  const degreeByNodeId = new Map<string, number>();
  for (const edge of edges) {
    degreeByNodeId.set(edge.source, (degreeByNodeId.get(edge.source) ?? 0) + 1);
    degreeByNodeId.set(edge.target, (degreeByNodeId.get(edge.target) ?? 0) + 1);
  }

  const result = {
    nodes: graph.nodes
      .filter((node) => visibleNodeIds.has(node.id))
      .map((node) => ({ ...node, degree: degreeByNodeId.get(node.id) ?? 0 })),
    edges,
  };
  graphFilterCache = { focusNodeId, graph, localDepth: maxDepth, result };
  return result;
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

interface NormalizedGraphSearchNode {
  id: string;
  label: string;
  labelWords: string[];
}

const normalizedGraphSearchNodes = new WeakMap<NoteGraphNode, NormalizedGraphSearchNode>();

function getNormalizedGraphSearchNode(node: NoteGraphNode): NormalizedGraphSearchNode {
  const cached = normalizedGraphSearchNodes.get(node);
  if (cached) return cached;
  const label = normalizeSearchText(node.label);
  const normalized = {
    id: normalizeSearchText(node.id),
    label,
    labelWords: label.split(/[\s/_.-]+/u),
  };
  normalizedGraphSearchNodes.set(node, normalized);
  return normalized;
}

function getSearchRank(node: NoteGraphNode, query: string): number | null {
  const { id, label, labelWords } = getNormalizedGraphSearchNode(node);

  if (label === query || id === query) return 0;
  if (label.startsWith(query)) return 1;
  if (labelWords.some((word) => word.startsWith(query))) return 2;
  if (label.includes(query)) return 3;
  if (id.startsWith(query)) return 4;
  if (id.includes(query)) return 5;
  return null;
}

export function rankGraphNodes(
  nodes: readonly NoteGraphNode[],
  rawQuery: string,
): NoteGraphNode[] {
  const query = normalizeSearchText(rawQuery);
  if (!query) return [];

  const rankedNodes: { node: NoteGraphNode; rank: number }[] = [];
  for (const node of nodes) {
    const rank = getSearchRank(node, query);
    if (rank !== null) rankedNodes.push({ node, rank });
  }
  return rankedNodes
    .sort((left, right) => (
      left.rank - right.rank
      || right.node.degree - left.node.degree
      || left.node.label.localeCompare(right.node.label)
      || left.node.id.localeCompare(right.node.id)
    ))
    .map(({ node }) => node);
}
