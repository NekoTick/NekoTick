import { themeGraphTokens } from '@/styles/themeTokens';
import { iterateGraphemes } from '@/lib/text-segmentation';
import { getGraphLabelWidth, getGraphNodeVisualRadius } from './graphLabelMetrics';
import type { PositionedGraphNode } from './graphLayout';

export interface GraphLabelPlacement {
  text?: string;
  textAnchor: 'end' | 'middle' | 'start';
  x: number;
  y: number;
}

export function truncateGraphLabel(label: string, maximumWidth: number): string {
  if (getGraphLabelWidth(label) <= maximumWidth) return label;
  const suffix = '\u2026';
  let text = '';
  for (const segment of iterateGraphemes(label)) {
    if (getGraphLabelWidth(`${text}${segment}${suffix}`) > maximumWidth) break;
    text += segment;
  }
  return `${text}${suffix}`;
}

export function getGraphLabelPlacementOptions(
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

export function expandGraphLabelPlacement(
  placement: GraphLabelPlacement,
  amount: number,
): GraphLabelPlacement {
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
