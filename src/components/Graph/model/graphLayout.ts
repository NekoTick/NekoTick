import { themeGraphTokens } from '@/styles/themeTokens';
import type { NoteGraph } from './noteGraph';

export interface PositionedGraphNode {
  id: string;
  label: string;
  degree: number;
  x: number;
  y: number;
}

export interface PositionedGraphEdge {
  source: PositionedGraphNode;
  target: PositionedGraphNode;
}

export interface PositionedNoteGraph {
  nodes: PositionedGraphNode[];
  edges: PositionedGraphEdge[];
  focusNodeId: string | null;
}

function distributeOnEllipse(
  nodes: NoteGraph['nodes'],
  radiusX: number,
  radiusY: number,
  angleOffset: number,
): PositionedGraphNode[] {
  return nodes.map((node, index) => {
    const angle = angleOffset + (index / Math.max(1, nodes.length)) * Math.PI * 2;
    return {
      ...node,
      x: themeGraphTokens.viewBoxWidthPx / 2 + Math.cos(angle) * radiusX,
      y: themeGraphTokens.viewBoxHeightPx / 2 + Math.sin(angle) * radiusY,
    };
  });
}

function distributeOnSpiral(nodes: NoteGraph['nodes']): PositionedGraphNode[] {
  return [...nodes]
    .sort((left, right) => right.degree - left.degree || left.id.localeCompare(right.id))
    .map((node, index) => {
      const radius = themeGraphTokens.outerStartRadiusPx
        + Math.sqrt(index) * themeGraphTokens.outerSpiralSpacingPx;
      const angle = index * themeGraphTokens.outerSpiralAngle;
      return {
        ...node,
        x: themeGraphTokens.viewBoxWidthPx / 2 + Math.cos(angle) * radius,
        y: themeGraphTokens.viewBoxHeightPx / 2
          + Math.sin(angle) * radius * themeGraphTokens.outerSpiralYScale,
      };
    });
}

export function layoutNoteGraph(graph: NoteGraph, preferredFocusPath?: string | null): PositionedNoteGraph {
  if (graph.nodes.length === 0) return { nodes: [], edges: [], focusNodeId: null };

  const focusNode = graph.nodes.find((node) => node.id === preferredFocusPath)
    ?? [...graph.nodes].sort((left, right) => right.degree - left.degree || left.id.localeCompare(right.id))[0]!;
  const neighborIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.source === focusNode.id) neighborIds.add(edge.target);
    if (edge.target === focusNode.id) neighborIds.add(edge.source);
  }

  const neighbors = graph.nodes.filter((node) => neighborIds.has(node.id));
  const remaining = graph.nodes.filter((node) => node.id !== focusNode.id && !neighborIds.has(node.id));
  const centerNode: PositionedGraphNode = {
    ...focusNode,
    x: themeGraphTokens.viewBoxWidthPx / 2,
    y: themeGraphTokens.viewBoxHeightPx / 2,
  };
  const positionedNodes = [
    centerNode,
    ...distributeOnEllipse(
      neighbors,
      themeGraphTokens.neighborRadiusXPx,
      themeGraphTokens.neighborRadiusYPx,
      -Math.PI / 2,
    ),
    ...distributeOnSpiral(remaining),
  ];
  const nodeById = new Map(positionedNodes.map((node) => [node.id, node]));

  return {
    nodes: positionedNodes,
    edges: graph.edges.map((edge) => ({
      source: nodeById.get(edge.source)!,
      target: nodeById.get(edge.target)!,
    })),
    focusNodeId: focusNode.id,
  };
}
