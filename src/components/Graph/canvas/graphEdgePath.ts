import { themeGraphTokens } from '@/styles/themeTokens';

interface GraphEdgePathPoint {
  x: number;
  y: number;
}

function formatGraphEdgeCoordinate(value: number): number {
  const rounded = Math.round(value * themeGraphTokens.edgePathCoordinateScale)
    / themeGraphTokens.edgePathCoordinateScale;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function createGraphEdgePathSegment(
  source: GraphEdgePathPoint,
  target: GraphEdgePathPoint,
): string {
  return `M${formatGraphEdgeCoordinate(source.x)},${formatGraphEdgeCoordinate(source.y)}`
    + `L${formatGraphEdgeCoordinate(target.x)},${formatGraphEdgeCoordinate(target.y)}`;
}

export function createGraphEdgePath(
  edges: readonly { source: GraphEdgePathPoint; target: GraphEdgePathPoint }[],
): string {
  let path = '';
  for (const edge of edges) {
    path += createGraphEdgePathSegment(edge.source, edge.target);
  }
  return path;
}
