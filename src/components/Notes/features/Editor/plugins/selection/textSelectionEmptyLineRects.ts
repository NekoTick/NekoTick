import type { EditorView } from '@milkdown/kit/prose/view';
import { MARKDOWN_BLANK_LINE_SELECTOR } from '../cursor/markdownBlankLineShared';

export const TEXT_SELECTION_TEXTBLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, td, th, dt, dd';

const INVISIBLE_EMPTY_LINE_CHARACTERS = /[\u200B\u200C\u2800\uFEFF\n\r\u2028\u2029]/gu;
const EMPTY_LINE_SELECTION_WIDTH_TOKEN = '--vlaina-size-4px';
const EMPTY_LINE_SELECTION_FALLBACK_WIDTH_PX = 4;

export interface EmptyLineSelectionRect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

function parseCssPixels(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function isVisuallyEmptyLine(element: HTMLElement): boolean {
  if (element.matches(MARKDOWN_BLANK_LINE_SELECTOR)) return true;
  if (!element.matches(TEXT_SELECTION_TEXTBLOCK_SELECTOR)) return false;
  return !/\S/u.test(
    (element.textContent ?? '').replace(INVISIBLE_EMPTY_LINE_CHARACTERS, ''),
  );
}

function getElementDocumentRange(
  view: EditorView,
  element: HTMLElement,
): { from: number; to: number } | null {
  const parent = element.parentNode;
  if (!parent) return null;
  const index = Array.prototype.indexOf.call(parent.childNodes, element) as number;
  if (index < 0) return null;

  try {
    const from = view.posAtDOM(parent, index, 1);
    const to = view.posAtDOM(parent, index + 1, -1);
    return { from: Math.min(from, to), to: Math.max(from, to) };
  } catch {
    return null;
  }
}

function getRangeLineRect(range: Range | null): DOMRect | null {
  if (!range) return null;
  try {
    const rects = range.getClientRects();
    for (let index = 0; index < rects.length; index += 1) {
      const rect = rects[index];
      if (rect && rect.height > 0) return rect;
    }
    const boundingRect = range.getBoundingClientRect();
    return boundingRect.height > 0 ? boundingRect : null;
  } catch {
    return null;
  }
}

function getEmptyLineLeft(
  blockRect: DOMRect,
  lineRect: DOMRect | null,
  style: CSSStyleDeclaration | undefined,
  width: number,
): number {
  const clampToBlock = (left: number) => Math.max(
    blockRect.left,
    Math.min(left, blockRect.right - width),
  );
  if (
    lineRect
    && Number.isFinite(lineRect.left)
    && lineRect.left >= blockRect.left
    && lineRect.left <= blockRect.right
  ) {
    return clampToBlock(lineRect.left);
  }

  const contentLeft = blockRect.left
    + parseCssPixels(style?.borderLeftWidth)
    + parseCssPixels(style?.paddingLeft);
  const contentRight = blockRect.right
    - parseCssPixels(style?.borderRightWidth)
    - parseCssPixels(style?.paddingRight);
  if (style?.textAlign === 'center') {
    return clampToBlock(
      contentLeft + Math.max(0, contentRight - contentLeft - width) / 2,
    );
  }
  if (style?.textAlign === 'right' || style?.textAlign === 'end') {
    return clampToBlock(Math.max(contentLeft, contentRight - width));
  }
  return clampToBlock(contentLeft);
}

export function getSelectedEmptyLineSelectionRect(
  view: EditorView,
  element: HTMLElement,
  range: Range | null = null,
): EmptyLineSelectionRect | null {
  if (!isVisuallyEmptyLine(element)) return null;
  const elementRange = getElementDocumentRange(view, element);
  if (
    !elementRange
    || view.state.selection.to <= elementRange.from
    || view.state.selection.from >= elementRange.to
  ) return null;

  const blockRect = element.getBoundingClientRect();
  if (blockRect.height <= 0 || blockRect.width <= 0) return null;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const width = parseCssPixels(style?.getPropertyValue(EMPTY_LINE_SELECTION_WIDTH_TOKEN))
    || EMPTY_LINE_SELECTION_FALLBACK_WIDTH_PX;
  const left = getEmptyLineLeft(blockRect, getRangeLineRect(range), style, width);
  return {
    bottom: blockRect.bottom,
    left,
    right: Math.min(blockRect.right, left + width),
    top: blockRect.top,
  };
}
