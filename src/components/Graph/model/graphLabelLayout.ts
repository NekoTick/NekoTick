import { themeGraphTokens } from '@/styles/themeTokens';
import {
  getGraphLabelBounds,
  getGraphLabelWidth,
  getGraphNodeBounds,
  getGraphNodeVisualRadius,
  GraphLabelBoundsIndex,
  type GraphScreenBounds,
} from './graphLabelGeometry';
import type { PositionedGraphNode } from './graphLayout';
import type { GraphPoint, GraphViewport } from './graphViewport';

export interface GraphLabelPlacement {
  text?: string;
  textAnchor: 'end' | 'middle' | 'start';
  x: number;
  y: number;
}

const labelWidthsByNode = new WeakMap<PositionedGraphNode, { label: string; width: number }>();

function getCachedGraphNodeLabelWidth(node: PositionedGraphNode): number {
  const cached = labelWidthsByNode.get(node);
  if (cached?.label === node.label) return cached.width;
  const width = getGraphLabelWidth(node.label);
  labelWidthsByNode.set(node, { label: node.label, width });
  return width;
}

function truncateGraphLabel(label: string, maximumWidth: number): string {
  if (getGraphLabelWidth(label) <= maximumWidth) return label;
  const suffix = '\u2026';
  const segments = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(label)]
      .map((part) => part.segment)
    : Array.from(label);
  let text = '';
  for (const segment of segments) {
    if (getGraphLabelWidth(`${text}${segment}${suffix}`) > maximumWidth) break;
    text += segment;
  }
  return `${text}${suffix}`;
}

function getPlacementOptions(
  node: PositionedGraphNode,
  center: { x: number; y: number },
  prominent: boolean,
): GraphLabelPlacement[] {
  const clearance = getGraphNodeVisualRadius(node, prominent)
    + themeGraphTokens.labelNodeGapPx;
  const verticalCenter = (
    themeGraphTokens.labelFontAscentPx - themeGraphTokens.labelFontDescentPx
  ) / 2;
  const placements = {
    above: {
      textAnchor: 'middle' as const,
      x: 0,
      y: -(clearance + themeGraphTokens.labelFontDescentPx),
    },
    below: {
      textAnchor: 'middle' as const,
      x: 0,
      y: clearance + themeGraphTokens.labelFontAscentPx,
    },
    left: { textAnchor: 'end' as const, x: -clearance, y: verticalCenter },
    right: { textAnchor: 'start' as const, x: clearance, y: verticalCenter },
    aboveLeft: {
      textAnchor: 'end' as const,
      x: -clearance,
      y: -(clearance + themeGraphTokens.labelFontDescentPx),
    },
    aboveRight: {
      textAnchor: 'start' as const,
      x: clearance,
      y: -(clearance + themeGraphTokens.labelFontDescentPx),
    },
    belowLeft: {
      textAnchor: 'end' as const,
      x: -clearance,
      y: clearance + themeGraphTokens.labelFontAscentPx,
    },
    belowRight: {
      textAnchor: 'start' as const,
      x: clearance,
      y: clearance + themeGraphTokens.labelFontAscentPx,
    },
  };
  const deltaX = node.x - center.x;
  const deltaY = node.y - center.y;
  const diagonalOptions = deltaX >= 0
    ? [placements.aboveRight, placements.belowRight, placements.aboveLeft, placements.belowLeft]
    : [placements.aboveLeft, placements.belowLeft, placements.aboveRight, placements.belowRight];
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0
      ? [placements.right, placements.below, placements.above, placements.left, ...diagonalOptions]
      : [placements.left, placements.below, placements.above, placements.right, ...diagonalOptions];
  }
  return deltaY >= 0
    ? [placements.below, placements.right, placements.left, placements.above, ...diagonalOptions]
    : [placements.above, placements.right, placements.left, placements.below, ...diagonalOptions];
}

function expandPlacement(placement: GraphLabelPlacement, amount: number): GraphLabelPlacement {
  if (placement.textAnchor === 'middle') {
    return {
      ...placement,
      y: placement.y + (placement.y < 0 ? -amount : amount),
    };
  }
  return {
    ...placement,
    x: placement.x + (placement.x < 0 ? -amount : amount),
  };
}

function isInsideViewport(
  left: number,
  top: number,
  right: number,
  bottom: number,
  viewportSize?: GraphPoint,
): boolean {
  if (!viewportSize || viewportSize.x <= 0 || viewportSize.y <= 0) return true;
  const padding = themeGraphTokens.labelViewportPaddingPx;
  return left >= padding
    && right <= viewportSize.x - padding
    && top >= padding
    && bottom <= viewportSize.y - padding;
}

function intersectsBounds(left: GraphScreenBounds, right: GraphScreenBounds): boolean {
  return left.left < right.right
    && left.right > right.left
    && left.top < right.bottom
    && left.bottom > right.top;
}

function canNodeLabelReachViewport(
  node: PositionedGraphNode,
  viewport: GraphViewport,
  viewportSize: GraphPoint | undefined,
  labelWidth: number,
  prominent: boolean,
): boolean {
  if (!viewportSize || viewportSize.x <= 0 || viewportSize.y <= 0) return true;
  const padding = themeGraphTokens.labelViewportPaddingPx;
  const clearance = getGraphNodeVisualRadius(node, prominent)
    + themeGraphTokens.labelNodeGapPx;
  const expansion = prominent ? themeGraphTokens.labelPriorityExpansionPx : 0;
  const horizontalReach = clearance + expansion + labelWidth;
  const verticalReach = clearance + expansion + Math.max(
    themeGraphTokens.labelFontAscentPx + themeGraphTokens.labelFontDescentPx,
    themeGraphTokens.labelCollisionHeightPx,
  );
  const screenX = viewport.x + node.x * viewport.zoom;
  const screenY = viewport.y + node.y * viewport.zoom;
  return screenX + horizontalReach >= padding
    && screenX - horizontalReach <= viewportSize.x - padding
    && screenY + verticalReach >= padding
    && screenY - verticalReach <= viewportSize.y - padding;
}

function canBoundsIntersectViewport(
  bounds: GraphScreenBounds,
  viewportSize?: GraphPoint,
): boolean {
  if (!viewportSize || viewportSize.x <= 0 || viewportSize.y <= 0) return true;
  return bounds.right > 0
    && bounds.left < viewportSize.x
    && bounds.bottom > 0
    && bounds.top < viewportSize.y;
}

export function layoutGraphLabels(
  nodes: readonly PositionedGraphNode[],
  viewport: GraphViewport,
  priorityIds: readonly string[] = [],
  viewportSize?: GraphPoint,
  obstacleNodes: readonly PositionedGraphNode[] = nodes,
  exclusionBounds: readonly GraphScreenBounds[] = [],
  maximumPlacements = Number.POSITIVE_INFINITY,
): ReadonlyMap<string, GraphLabelPlacement> {
  const placements = new Map<string, GraphLabelPlacement>();
  if (nodes.length === 0) return placements;

  let centerX = 0;
  let centerY = 0;
  for (const node of nodes) {
    centerX += node.x;
    centerY += node.y;
  }
  centerX /= nodes.length;
  centerY /= nodes.length;
  const center = { x: centerX, y: centerY };

  const nodeIndexById = new Map<string, number>();
  const labelWidths: number[] = [];
  const collisionIndex = new GraphLabelBoundsIndex();
  const priorityIdSet = new Set(priorityIds);
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    nodeIndexById.set(node.id, index);
    labelWidths.push(getCachedGraphNodeLabelWidth(node));
  }
  for (let index = 0; index < obstacleNodes.length; index += 1) {
    const node = obstacleNodes[index]!;
    const bounds = getGraphNodeBounds(node, viewport, priorityIdSet.has(node.id));
    if (canBoundsIntersectViewport(bounds, viewportSize)) {
      collisionIndex.insert(bounds, nodeIndexById.get(node.id) ?? nodes.length + index);
    }
  }
  for (const bounds of exclusionBounds) collisionIndex.insert(bounds, -1);

  const priorityNodes: PositionedGraphNode[] = [];
  for (const id of priorityIds) {
    const index = nodeIndexById.get(id);
    if (index === undefined) continue;
    const node = nodes[index]!;
    if (canNodeLabelReachViewport(node, viewport, viewportSize, labelWidths[index]!, true)) {
      priorityNodes.push(node);
    }
  }
  const remainingNodes = nodes
    .filter((node) => {
      if (priorityIdSet.has(node.id)) return false;
      const index = nodeIndexById.get(node.id)!;
      return canNodeLabelReachViewport(
        node,
        viewport,
        viewportSize,
        labelWidths[index]!,
        false,
      );
    })
    .sort((left, right) => right.degree - left.degree || left.id.localeCompare(right.id));
  const place = (node: PositionedGraphNode, isPriority: boolean): void => {
    const owner = nodeIndexById.get(node.id) ?? -1;
    const maximumPriorityWidth = viewportSize
      ? Math.max(
        themeGraphTokens.labelCollisionMinWidthPx,
        (viewportSize.x - themeGraphTokens.labelViewportPaddingPx * 2)
          * themeGraphTokens.labelPriorityMaxWidthRatio,
      )
      : Number.POSITIVE_INFINITY;
    const text = isPriority
      ? truncateGraphLabel(node.label, maximumPriorityWidth)
      : node.label;
    const labelWidth = text === node.label ? labelWidths[owner] : getGraphLabelWidth(text);
    const options = getPlacementOptions(node, center, isPriority);
    const optionCount = options.length * (isPriority ? 2 : 1);
    let fallback: {
      bounds: GraphScreenBounds;
      option: GraphLabelPlacement;
      overlapArea: number;
    } | null = null;
    for (let index = 0; index < optionCount; index += 1) {
      const baseOption = options[index % options.length]!;
      const option = index < options.length
        ? baseOption
        : expandPlacement(baseOption, themeGraphTokens.labelPriorityExpansionPx);
      const bounds = getGraphLabelBounds(node, viewport, option, labelWidth);
      if (
        !isInsideViewport(bounds.left, bounds.top, bounds.right, bounds.bottom, viewportSize)
        || exclusionBounds.some((exclusion) => intersectsBounds(bounds, exclusion))
      ) {
        continue;
      }
      if (collisionIndex.intersects(bounds, owner)) {
        if (isPriority) {
          const overlapArea = collisionIndex.getIntersectionArea(bounds, owner);
          if (!fallback || overlapArea < fallback.overlapArea) {
            fallback = { bounds, option, overlapArea };
          }
        }
        continue;
      }
      placements.set(node.id, text === node.label ? option : { ...option, text });
      collisionIndex.insert(bounds, -1);
      return;
    }
    if (fallback) {
      placements.set(
        node.id,
        text === node.label ? fallback.option : { ...fallback.option, text },
      );
      collisionIndex.insert(fallback.bounds, -1);
    }
  };

  for (const node of priorityNodes) {
    if (placements.size >= maximumPlacements) break;
    place(node, true);
  }
  for (const node of remainingNodes) {
    if (placements.size >= maximumPlacements) break;
    place(node, false);
  }
  return placements;
}
