import { createElement, memo } from 'react';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { getWhiteboardAutoDrawCatalogEntry } from '../../model/autodraw/whiteboardAutoDrawCatalog';
import type { WhiteboardAutoDrawIcon as WhiteboardAutoDrawIconName } from '../../model/autodraw/whiteboardAutoDrawTypes';

interface WhiteboardAutoDrawIconProps {
  className?: string;
  color: string;
  height: number;
  icon: WhiteboardAutoDrawIconName;
  strokeWidth?: number;
  width: number;
}

export const WhiteboardAutoDrawIcon = memo(function WhiteboardAutoDrawIcon({
  className,
  color,
  height,
  icon,
  strokeWidth: targetStrokeWidth = themeWhiteboardTokens.autoShapeStrokeWidthPx,
  width,
}: WhiteboardAutoDrawIconProps) {
  const entry = getWhiteboardAutoDrawCatalogEntry(icon);
  const viewBoxSize = themeWhiteboardTokens.autoDrawIconViewBoxSizePx;
  const strokeWidth = targetStrokeWidth * viewBoxSize
    / Math.max(1, Math.min(width, height));
  return (
    <svg
      aria-hidden="true"
      className={className}
      data-whiteboard-autodraw-icon={icon}
      fill={themeWhiteboardTokens.strokeNoFill}
      preserveAspectRatio="xMidYMid meet"
      stroke={color}
      strokeLinecap={themeWhiteboardTokens.strokeLineCap}
      strokeLinejoin={themeWhiteboardTokens.strokeLineJoin}
      strokeWidth={strokeWidth}
      style={{ height: themeWhiteboardTokens.autoDrawIconFullSize, width: themeWhiteboardTokens.autoDrawIconFullSize }}
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
    >
      {entry.nodes.map(([element, attributes], index) => {
        const { key: _sourceKey, ...nodeAttributes } = attributes;
        return createElement(element, {
          ...nodeAttributes,
          key: index,
        });
      })}
    </svg>
  );
});
