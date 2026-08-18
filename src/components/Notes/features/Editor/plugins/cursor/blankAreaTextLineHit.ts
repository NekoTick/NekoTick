export const MAX_BLANK_AREA_TEXT_HIT_CHARS = 100_000;
export const MAX_BLANK_AREA_TEXT_HIT_NODES = 512;
export const MAX_BLANK_AREA_TEXT_HIT_RECTS = 1024;

const TRAILING_TEXT_SELECTION_GUTTER_PX = 48;
const TRAILING_TEXT_SELECTION_TEXT_OVERLAP_PX = 24;
const LEADING_TEXT_SELECTION_GUTTER_PX = 32;

export const INTERACTIVE_SELECTOR = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'summary',
  'label',
  '[role="button"]',
  '[contenteditable="false"]',
  '[data-no-editor-drag-box="true"]',
].join(', ');

interface TextLineRectLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

interface TextSelectionGutterHit {
  edge: 'leading' | 'trailing';
}

export type TextLinePointerHit =
  | { type: 'content' }
  | ({ type: 'gutter' } & TextSelectionGutterHit)
  | { type: 'measurement-limit' };

export interface CachedTextLinePointerHitResult {
  checked: boolean;
  hit: TextLinePointerHit | null;
}

export function isPointInTrailingTextSelectionGutter(
  rect: TextLineRectLike,
  clientX: number,
  clientY: number,
  gutterPx = TRAILING_TEXT_SELECTION_GUTTER_PX,
): boolean {
  if (rect.width < 0 || rect.height <= 0) return false;

  const verticalSlack = Math.max(2, Math.min(6, rect.height * 0.2));
  const isVerticallyAligned = clientY >= rect.top - verticalSlack && clientY <= rect.bottom + verticalSlack;
  if (!isVerticallyAligned) return false;

  const textOverlapPx = Math.min(TRAILING_TEXT_SELECTION_TEXT_OVERLAP_PX, Math.max(2, rect.width));
  return clientX >= rect.right - textOverlapPx && clientX <= rect.right + gutterPx;
}

function isPointInLeadingTextSelectionGutter(
  rect: TextLineRectLike,
  clientX: number,
  clientY: number,
  gutterPx = LEADING_TEXT_SELECTION_GUTTER_PX,
): boolean {
  if (rect.width <= 0 || rect.height <= 0) return false;

  const verticalSlack = Math.max(2, Math.min(6, rect.height * 0.2));
  const isVerticallyAligned = clientY >= rect.top - verticalSlack && clientY <= rect.bottom + verticalSlack;
  if (!isVerticallyAligned) return false;

  return clientX >= rect.left - gutterPx && clientX <= rect.left + 2;
}

function isPointInTextLineContent(rect: TextLineRectLike, clientX: number, clientY: number): boolean {
  if (rect.width <= 0 || rect.height <= 0) return false;

  const verticalSlack = Math.max(2, Math.min(6, rect.height * 0.2));
  return (
    clientY >= rect.top - verticalSlack &&
    clientY <= rect.bottom + verticalSlack &&
    clientX >= rect.left &&
    clientX <= rect.right
  );
}

function isIgnoredTextLineElement(element: Element): boolean {
  return Boolean(element.closest(INTERACTIVE_SELECTOR));
}

export function resolveTextLinePointerHit(root: HTMLElement, clientX: number, clientY: number): TextLinePointerHit | null {
  const doc = root.ownerDocument;
  let measuredTextChars = 0;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.textContent ?? '';
      measuredTextChars += text.length;
      if (measuredTextChars > MAX_BLANK_AREA_TEXT_HIT_CHARS) return NodeFilter.FILTER_ACCEPT;
      if (!text.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || isIgnoredTextLineElement(parent)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let measuredTextNodes = 0;
  let measuredRects = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (measuredTextChars > MAX_BLANK_AREA_TEXT_HIT_CHARS) {
      return { type: 'measurement-limit' };
    }

    measuredTextNodes += 1;
    if (measuredTextNodes > MAX_BLANK_AREA_TEXT_HIT_NODES) {
      return { type: 'measurement-limit' };
    }

    const range = doc.createRange();
    try {
      range.selectNodeContents(node);
      const rects = range.getClientRects();

      for (let index = 0; index < rects.length; index += 1) {
        measuredRects += 1;
        if (measuredRects > MAX_BLANK_AREA_TEXT_HIT_RECTS) {
          return { type: 'measurement-limit' };
        }

        const rect = rects[index];
        if (!rect) continue;
        if (isPointInTextLineContent(rect, clientX, clientY)) {
          return { type: 'content' };
        }
        if (isPointInTrailingTextSelectionGutter(rect, clientX, clientY)) {
          return { type: 'gutter', edge: 'trailing' };
        }
        if (isPointInLeadingTextSelectionGutter(rect, clientX, clientY)) {
          return { type: 'gutter', edge: 'leading' };
        }
      }
    } finally {
      range.detach();
    }
  }

  return null;
}
