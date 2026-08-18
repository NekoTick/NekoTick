import { AllSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  isLargeEditorSelection,
  isTextSelectionOverlayEligible,
  POINTER_SELECTION_ACTIVE_ATTRIBUTE,
  textSelectionOverlayPluginKey,
} from './textSelectionOverlayState';
import {
  getSelectionViewportBounds,
  getVisibleSelectionWindowChildren,
} from './visibleSelectionWindow';
import {
  getSelectedEmptyLineSelectionRect,
  TEXT_SELECTION_TEXTBLOCK_SELECTOR,
} from './textSelectionEmptyLineRects';

const MAX_VISIBLE_SELECTION_RECTS = 300;
const RECT_MERGE_TOLERANCE_PX = 0.75;

export interface TextSelectionLayerRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

interface ViewportRect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

interface TextblockLineMetrics {
  blockRect: DOMRect;
  contentTop: number;
  lineHeight: number | null;
}

function parseCssPixels(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function getSelectedDomRange(
  view: EditorView,
  textblock: HTMLElement,
): Range | null {
  const { from, to } = view.state.selection;
  try {
    const first = view.posAtDOM(textblock, 0, 1);
    const last = view.posAtDOM(textblock, textblock.childNodes.length, -1);
    const blockFrom = Math.min(first, last);
    const blockTo = Math.max(first, last);
    const rangeFrom = Math.max(from, blockFrom);
    const rangeTo = Math.min(to, blockTo);
    if (rangeTo <= rangeFrom) return null;

    const start = view.domAtPos(rangeFrom, 1);
    const end = view.domAtPos(rangeTo, -1);
    const range = view.dom.ownerDocument.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range;
  } catch {
    return null;
  }
}

function getTextblocks(child: HTMLElement): HTMLElement[] {
  const blocks = Array.from(
    child.querySelectorAll<HTMLElement>(TEXT_SELECTION_TEXTBLOCK_SELECTOR),
  );
  if (child.matches(TEXT_SELECTION_TEXTBLOCK_SELECTOR)) blocks.unshift(child);
  return blocks;
}

function getTextblockLineMetrics(textblock: HTMLElement): TextblockLineMetrics {
  const blockRect = textblock.getBoundingClientRect();
  const style = textblock.ownerDocument.defaultView?.getComputedStyle(textblock);
  const lineHeight = parseCssPixels(style?.lineHeight);
  return {
    blockRect,
    contentTop: blockRect.top
      + parseCssPixels(style?.borderTopWidth)
      + parseCssPixels(style?.paddingTop),
    lineHeight: lineHeight > 0 ? lineHeight : null,
  };
}

function getCachedTextblockLineMetrics(
  textblock: HTMLElement,
  cache: WeakMap<HTMLElement, TextblockLineMetrics>,
): TextblockLineMetrics {
  const cached = cache.get(textblock);
  if (cached) return cached;
  const metrics = getTextblockLineMetrics(textblock);
  cache.set(textblock, metrics);
  return metrics;
}

function getLineBox(rect: DOMRect, metrics: TextblockLineMetrics): Pick<ViewportRect, 'bottom' | 'top'> {
  const { blockRect, contentTop, lineHeight } = metrics;
  if (lineHeight === null || rect.height > lineHeight * 1.4) {
    return { bottom: rect.bottom, top: rect.top };
  }

  const lineIndex = Math.max(
    0,
    Math.floor(((rect.top + rect.bottom) / 2 - contentTop) / lineHeight),
  );
  const top = contentTop + lineIndex * lineHeight;
  return {
    bottom: Math.min(blockRect.bottom, top + lineHeight),
    top: Math.max(blockRect.top, top),
  };
}

function appendClientRects(
  output: ViewportRect[],
  rects: DOMRectList,
  metrics: TextblockLineMetrics | null,
): void {
  if (output.length >= MAX_VISIBLE_SELECTION_RECTS) return;
  for (let index = 0; index < rects.length; index += 1) {
    const rect = rects[index];
    if (!rect || rect.width <= 0 || rect.height <= 0) continue;
    const line = metrics ? getLineBox(rect, metrics) : rect;
    output.push({ bottom: line.bottom, left: rect.left, right: rect.right, top: line.top });
    if (output.length >= MAX_VISIBLE_SELECTION_RECTS) return;
  }
}

export function mergeTextSelectionLayerRects(rects: readonly ViewportRect[]): ViewportRect[] {
  const sorted = [...rects].sort((left, right) => (
    left.top - right.top || left.left - right.left || left.right - right.right
  ));
  const merged: ViewportRect[] = [];
  for (const rect of sorted) {
    const previous = merged[merged.length - 1];
    const sameLine = previous
      && Math.abs(previous.top - rect.top) <= RECT_MERGE_TOLERANCE_PX
      && Math.abs(previous.bottom - rect.bottom) <= RECT_MERGE_TOLERANCE_PX;
    if (sameLine && rect.left <= previous.right + RECT_MERGE_TOLERANCE_PX) {
      previous.right = Math.max(previous.right, rect.right);
      continue;
    }
    merged.push({ ...rect });
  }
  return merged;
}

export function measureTextSelectionLayerRects(
  view: EditorView,
  layer: HTMLElement,
): TextSelectionLayerRect[] {
  const pluginState = textSelectionOverlayPluginKey.getState(view.state);
  const isPointerSelecting = view.dom.hasAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE);
  if (
    (pluginState?.usePointerNativeSelection && !isPointerSelecting)
    || pluginState?.renderInlineDecorations
    || !isTextSelectionOverlayEligible(view.state)
    || isLargeEditorSelection(view.state)
  ) return [];

  const viewport = getSelectionViewportBounds(view);
  const rawRects: ViewportRect[] = [];
  const lineMetricsByTextblock = new WeakMap<HTMLElement, TextblockLineMetrics>();
  for (const child of getVisibleSelectionWindowChildren(view, viewport)) {
    const textblocks = getTextblocks(child);
    for (const textblock of textblocks) {
      const range = getSelectedDomRange(view, textblock);
      const previousRectCount = rawRects.length;
      if (range) {
        const metrics = getCachedTextblockLineMetrics(textblock, lineMetricsByTextblock);
        try {
          appendClientRects(rawRects, range.getClientRects(), metrics);
        } finally {
          if (rawRects.length === previousRectCount) {
            const emptyLineRect = getSelectedEmptyLineSelectionRect(view, textblock, range);
            if (emptyLineRect) rawRects.push(emptyLineRect);
          }
          range.detach();
        }
      } else {
        const emptyLineRect = getSelectedEmptyLineSelectionRect(view, textblock);
        if (emptyLineRect) rawRects.push(emptyLineRect);
      }
      if (rawRects.length >= MAX_VISIBLE_SELECTION_RECTS) break;
    }
    if (rawRects.length >= MAX_VISIBLE_SELECTION_RECTS) break;
    if (textblocks.length === 0) {
      const emptyLineRect = getSelectedEmptyLineSelectionRect(view, child);
      if (emptyLineRect) {
        rawRects.push(emptyLineRect);
      } else if (view.state.selection instanceof AllSelection) {
        rawRects.push(child.getBoundingClientRect());
      }
    }
  }

  const hostRect = layer.parentElement?.getBoundingClientRect();
  if (!hostRect) return [];
  const output: TextSelectionLayerRect[] = [];
  for (const rect of mergeTextSelectionLayerRects(rawRects)) {
    const bottom = Math.min(rect.bottom, viewport.bottom);
    const left = Math.max(rect.left, hostRect.left);
    const right = Math.min(rect.right, hostRect.right);
    const top = Math.max(rect.top, viewport.top);
    if (right <= left || bottom <= top) continue;
    output.push({
      height: bottom - top,
      left: left - hostRect.left,
      top: top - hostRect.top,
      width: right - left,
    });
    if (output.length >= MAX_VISIBLE_SELECTION_RECTS) break;
  }
  return output;
}
