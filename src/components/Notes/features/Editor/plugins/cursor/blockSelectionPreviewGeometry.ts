import type { EditorState } from '@milkdown/kit/prose/state';
import { themeBlockSelectionPreviewTokens } from '@/styles/themeTokens';
import { areBlockSelectionDisplayRangesVisuallyAdjacent } from './blockSelectionDecorationAdjacency';
import {
  isNodeDecorationRange,
  isTextLikeDecorationRange,
} from './blockSelectionDecorationClasses';
import type { BlockRect, RectBounds } from './blockSelectionTypes';

export interface BlockSelectionPreviewMetrics {
  horizontalBleedPx: number;
  compactVerticalBleedPx: number;
  richVerticalBleedPx: number;
  gapPx: number;
  radiusPx: number;
}

function readPixelVariable(style: CSSStyleDeclaration | null, name: string, fallback: number): number {
  const parsed = Number.parseFloat(style?.getPropertyValue(name) ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveBlockSelectionPreviewMetrics(element: HTMLElement): BlockSelectionPreviewMetrics {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element) ?? null;
  const spacingYPx = readPixelVariable(
    style,
    '--vlaina-space-1px',
    themeBlockSelectionPreviewTokens.spacingYPx,
  );
  return {
    horizontalBleedPx: readPixelVariable(
      style,
      '--vlaina-space-72px',
      themeBlockSelectionPreviewTokens.horizontalBleedPx,
    ),
    compactVerticalBleedPx: spacingYPx * 2,
    richVerticalBleedPx: spacingYPx * 4,
    gapPx: spacingYPx,
    radiusPx: readPixelVariable(
      style,
      '--vlaina-radius-8px',
      themeBlockSelectionPreviewTokens.radiusPx,
    ),
  };
}

export function resolveBlockSelectionPreviewRects(
  doc: EditorState['doc'],
  blocks: readonly BlockRect[],
  metrics: BlockSelectionPreviewMetrics,
): RectBounds[] {
  return blocks.map((block, index) => {
    const previous = blocks[index - 1];
    const next = blocks[index + 1];
    const hasPrevious = Boolean(
      previous && areBlockSelectionDisplayRangesVisuallyAdjacent(doc, previous, block),
    );
    const hasNext = Boolean(
      next && areBlockSelectionDisplayRangesVisuallyAdjacent(doc, block, next),
    );
    const isNodeRange = isNodeDecorationRange(doc, block);
    const verticalBleedPx = isTextLikeDecorationRange(doc, block, isNodeRange)
      ? metrics.compactVerticalBleedPx
      : metrics.richVerticalBleedPx;

    return {
      left: block.left - metrics.horizontalBleedPx,
      top: block.top + (hasPrevious ? metrics.gapPx : -verticalBleedPx),
      right: block.right + metrics.horizontalBleedPx,
      bottom: block.bottom - (hasNext ? metrics.gapPx : -verticalBleedPx),
    };
  });
}

export function createRoundedBlockSelectionPreviewPath(
  rects: readonly RectBounds[],
  radiusPx: number,
): string {
  const commands: string[] = [];
  for (const rect of rects) {
    const width = rect.right - rect.left;
    const height = rect.bottom - rect.top;
    if (width <= 0 || height <= 0) continue;
    const radius = Math.max(0, Math.min(radiusPx, width / 2, height / 2));
    commands.push([
      `M${rect.left + radius} ${rect.top}`,
      `H${rect.right - radius}`,
      `A${radius} ${radius} 0 0 1 ${rect.right} ${rect.top + radius}`,
      `V${rect.bottom - radius}`,
      `A${radius} ${radius} 0 0 1 ${rect.right - radius} ${rect.bottom}`,
      `H${rect.left + radius}`,
      `A${radius} ${radius} 0 0 1 ${rect.left} ${rect.bottom - radius}`,
      `V${rect.top + radius}`,
      `A${radius} ${radius} 0 0 1 ${rect.left + radius} ${rect.top}`,
      'Z',
    ].join(''));
  }
  return commands.join('');
}
