import type { PositionedGraphEdge } from './graphLayout';

export interface GraphEdgeNeighborhood {
  edges: PositionedGraphEdge[];
  neighborIds: Set<string>;
}

export type GraphEdgeIndex = ReadonlyMap<string, GraphEdgeNeighborhood>;

export function buildGraphEdgeIndex(edges: readonly PositionedGraphEdge[]): GraphEdgeIndex {
  const index = new Map<string, GraphEdgeNeighborhood>();
  for (const edge of edges) {
    const source = index.get(edge.source.id) ?? { edges: [], neighborIds: new Set<string>() };
    const target = index.get(edge.target.id) ?? { edges: [], neighborIds: new Set<string>() };
    source.edges.push(edge);
    source.neighborIds.add(edge.target.id);
    target.edges.push(edge);
    target.neighborIds.add(edge.source.id);
    index.set(edge.source.id, source);
    index.set(edge.target.id, target);
  }
  return index;
}
