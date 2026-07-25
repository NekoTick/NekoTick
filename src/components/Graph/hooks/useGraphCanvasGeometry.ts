import { useMemo } from 'react';
import type { PositionedNoteGraph } from '../model/graphLayout';
import type { GraphNodePosition, GraphNodePositions } from '../store/useGraphUIStore';

export function useGraphCanvasGeometry(args: {
  dragPosition: { id: string; position: GraphNodePosition } | null;
  graph: PositionedNoteGraph;
  positionOverrides: GraphNodePositions;
  simulationPositions: GraphNodePositions;
  simulationVersion: number;
}) {
  const nodes = useMemo(() => args.graph.nodes.map((node) => {
    const position = args.simulationPositions[node.id]
      ?? (args.dragPosition?.id === node.id
        ? args.dragPosition.position
        : args.positionOverrides[node.id]);
    return position ? { ...node, ...position } : node;
  }), [
    args.dragPosition,
    args.graph.nodes,
    args.positionOverrides,
    args.simulationPositions,
    args.simulationVersion,
  ]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const edges = useMemo(() => args.graph.edges.map((edge) => ({
    source: nodeById.get(edge.source.id)!,
    target: nodeById.get(edge.target.id)!,
  })), [args.graph.edges, nodeById]);
  const nodeKey = useMemo(
    () => nodes.map((node) => node.id).sort().join('\n'),
    [nodes],
  );

  return { edges, nodeKey, nodes };
}
