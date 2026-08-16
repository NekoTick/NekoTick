import { themeGraphTokens } from '@/styles/themeTokens';
import { getGraphLabelWidth, getGraphNodeVisualRadius } from './graphLabelMetrics';
import type { GraphLabelPlacement } from './graphLabelPlacement';
import type { PositionedGraphNode } from './graphLayout';
import type { GraphViewport } from './graphViewport';

export interface GraphScreenBounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export function getGraphLabelBounds(
  node: PositionedGraphNode,
  viewport: GraphViewport,
  placement: GraphLabelPlacement,
  measuredWidth = getGraphLabelWidth(node.label),
): GraphScreenBounds {
  const textX = viewport.x + node.x * viewport.zoom + placement.x;
  const left = placement.textAnchor === 'start'
    ? textX
    : placement.textAnchor === 'end' ? textX - measuredWidth : textX - measuredWidth / 2;
  const top = viewport.y
    + node.y * viewport.zoom
    + placement.y
    - themeGraphTokens.labelFontAscentPx;
  return {
    bottom: top + themeGraphTokens.labelCollisionHeightPx,
    left,
    right: left + measuredWidth,
    top,
  };
}

export function getGraphNodeBounds(
  node: PositionedGraphNode,
  viewport: GraphViewport,
  prominent = false,
): GraphScreenBounds {
  const radius = getGraphNodeVisualRadius(node, prominent) + themeGraphTokens.labelNodeGapPx;
  const x = viewport.x + node.x * viewport.zoom;
  const y = viewport.y + node.y * viewport.zoom;
  return { bottom: y + radius, left: x - radius, right: x + radius, top: y - radius };
}
