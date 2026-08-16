import { themeGraphTokens } from '@/styles/themeTokens';
import type { PositionedGraphNode } from './graphLayout';

/** Selects the nodes that remain useful label anchors in a zoomed-out overview. */
export function getOverviewLabelNodes(
  nodes: readonly PositionedGraphNode[],
  zoom: number,
): readonly PositionedGraphNode[] {
  if (zoom > themeGraphTokens.labelOverviewZoomThreshold || nodes.length === 0) {
    return nodes;
  }
  const parents = nodes.filter(
    (node) => node.degree >= themeGraphTokens.labelOverviewMinimumDegree,
  );
  if (parents.length > 0) return parents;
  return [nodes.reduce((best, node) => node.degree > best.degree ? node : best)];
}

export function shouldUseFastAllLabelLayout(
  showAllLabels: boolean | undefined,
  highlightedPath: string | null,
  nodeCount: number,
): boolean {
  return Boolean(
    showAllLabels
    && !highlightedPath
    && nodeCount > themeGraphTokens.localPreviewAllLabelNodeLimit,
  );
}

export function getGraphLabelPriorityIds(args: {
  activePath: string | null;
  currentPath: string | null;
  highlightedPath: string | null;
  overviewLabelNodes: readonly PositionedGraphNode[];
  selectedPath: string | null;
  showAllLabels?: boolean;
  useFastAllLabelLayout: boolean;
}): readonly string[] {
  const overviewPriorityIds = args.showAllLabels
    && !args.highlightedPath
    && !args.useFastAllLabelLayout
    ? args.overviewLabelNodes.map((node) => node.id)
    : [];
  return [...new Set([
    args.activePath,
    args.selectedPath,
    args.currentPath,
    ...overviewPriorityIds,
  ].filter((id): id is string => Boolean(id)))];
}

export function getGraphLabelCandidates(args: {
  connectedToHighlighted: ReadonlySet<string>;
  highlightedPath: string | null;
  nodes: readonly PositionedGraphNode[];
  overviewLabelNodes: readonly PositionedGraphNode[];
}): readonly PositionedGraphNode[] {
  if (!args.highlightedPath) return args.overviewLabelNodes;
  return args.nodes.filter((node) => (
    node.id === args.highlightedPath || args.connectedToHighlighted.has(node.id)
  ));
}
