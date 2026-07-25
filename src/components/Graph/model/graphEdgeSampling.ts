export type GraphEdgeEndpoint = string | { id: string };

export interface GraphEdgeLike {
  source: GraphEdgeEndpoint;
  target: GraphEdgeEndpoint;
}

function getEndpointId(endpoint: GraphEdgeEndpoint): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id;
}

export function selectRepresentativeGraphEdges<T extends GraphEdgeLike>(
  edges: readonly T[],
  maximumCount: number,
): readonly T[] {
  const limit = Math.max(0, Math.floor(maximumCount));
  if (limit >= edges.length) return edges;
  if (limit === 0) return [];

  const selectedIndexes = new Set<number>();
  const coveredNodeIds = new Set<string>();
  for (let index = 0; index < edges.length && selectedIndexes.size < limit; index += 1) {
    const edge = edges[index]!;
    const sourceId = getEndpointId(edge.source);
    const targetId = getEndpointId(edge.target);
    if (coveredNodeIds.has(sourceId) && coveredNodeIds.has(targetId)) continue;
    selectedIndexes.add(index);
    coveredNodeIds.add(sourceId);
    coveredNodeIds.add(targetId);
  }

  const remainingSlots = limit - selectedIndexes.size;
  if (remainingSlots > 0) {
    const stride = edges.length / remainingSlots;
    for (let slot = 0; slot < remainingSlots; slot += 1) {
      let index = Math.min(edges.length - 1, Math.floor(slot * stride));
      while (selectedIndexes.has(index)) index = (index + 1) % edges.length;
      selectedIndexes.add(index);
    }
  }

  return [...selectedIndexes]
    .sort((left, right) => left - right)
    .map((index) => edges[index]!);
}
