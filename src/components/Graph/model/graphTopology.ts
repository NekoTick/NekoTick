import type { PositionedNoteGraph } from './graphLayout';

function compareGraphIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function getGraphTopologyKey(graph: PositionedNoteGraph): string {
  const nodeIds = graph.nodes.map((node) => node.id).sort(compareGraphIds);
  const edges = graph.edges.map((edge) => {
    const [left, right] = edge.source.id < edge.target.id
      ? [edge.source.id, edge.target.id]
      : [edge.target.id, edge.source.id];
    return [left, right] as const;
  }).sort((left, right) => (
    compareGraphIds(left[0], right[0]) || compareGraphIds(left[1], right[1])
  ));
  return JSON.stringify([nodeIds, edges]);
}
