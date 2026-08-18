import type { EditorView } from '@milkdown/kit/prose/view';
import { iterateGraphemes } from '@/lib/text-segmentation';

export interface TextOffsetResolution {
  offset: number;
  distance: number;
}

export const MAX_POINTER_TEXT_GRAPHEME_MEASUREMENTS = 2048;

export function* iterateTextGraphemeRanges(text: string): Generator<{ from: number; to: number }> {
  let from = 0;
  for (const grapheme of iterateGraphemes(text)) {
    const to = from + grapheme.length;
    yield { from, to };
    from = to;
  }
}

export function clampDocPosition(view: EditorView, pos: number): number {
  return Math.max(0, Math.min(pos, view.state.doc.content.size));
}

export function isInlineTextSelectionEndpoint(view: EditorView, pos: number): boolean {
  try {
    return view.state.doc.resolve(clampDocPosition(view, pos)).parent.inlineContent;
  } catch {
    return false;
  }
}

function isPointVerticallyInsideRect(rect: Pick<DOMRect, 'top' | 'bottom' | 'height'>, clientY: number): boolean {
  const verticalSlack = Math.max(2, Math.min(6, rect.height * 0.2));
  return clientY >= rect.top - verticalSlack && clientY <= rect.bottom + verticalSlack;
}

export function resolveTextOffsetAtPoint(
  node: Text,
  clientX: number,
  clientY: number,
): TextOffsetResolution | null {
  const text = node.textContent ?? '';
  if (!text) return null;

  const doc = node.ownerDocument;
  let firstLeftOnLine: number | null = null;
  let lastRightOnLine: number | null = null;
  let caretOffset: number | null = null;

  let measuredGraphemes = 0;
  for (const grapheme of iterateTextGraphemeRanges(text)) {
    if (measuredGraphemes >= MAX_POINTER_TEXT_GRAPHEME_MEASUREMENTS) break;
    measuredGraphemes += 1;
    const range = doc.createRange();
    try {
      range.setStart(node, grapheme.from);
      range.setEnd(node, grapheme.to);
      const rects = range.getClientRects();

      for (let index = 0; index < rects.length; index += 1) {
        const rect = rects[index];
        if (!rect || rect.width <= 0 || rect.height <= 0) continue;
        if (!isPointVerticallyInsideRect(rect, clientY)) continue;

        firstLeftOnLine ??= rect.left;
        lastRightOnLine = rect.right;

        if (caretOffset === null || clientX > rect.left + rect.width / 2) {
          caretOffset = clientX <= rect.left + rect.width / 2 ? grapheme.from : grapheme.to;
        }
      }
    } finally {
      range.detach();
    }
  }

  if (firstLeftOnLine === null || lastRightOnLine === null || caretOffset === null) return null;

  const distance = clientX < firstLeftOnLine
    ? firstLeftOnLine - clientX
    : clientX > lastRightOnLine
      ? clientX - lastRightOnLine
      : 0;

  return { offset: caretOffset, distance };
}

export function resolveTextNodeDocumentPosition(view: EditorView, node: Text, offset: number): number | null {
  const text = node.textContent ?? '';
  if (!text) return null;

  const boundedOffset = Math.max(0, Math.min(offset, text.length));
  const docSize = view.state.doc.content.size;
  const candidateStarts: number[] = [];
  const sampleOffsets = Array.from(new Set([
    0,
    Math.min(1, text.length),
    Math.max(0, text.length - 1),
    text.length,
  ]));

  for (const sampleOffset of sampleOffsets) {
    try {
      candidateStarts.push(view.posAtDOM(node, sampleOffset, -1) - sampleOffset);
    } catch {
    }
    try {
      candidateStarts.push(view.posAtDOM(node, sampleOffset, 1) - sampleOffset);
    } catch {
    }
  }

  for (const start of Array.from(new Set(candidateStarts))) {
    if (start < 0 || start + text.length > docSize) continue;
    if (view.state.doc.textBetween(start, start + text.length, '') === text) {
      return start + boundedOffset;
    }
  }

  return null;
}

export function resolveTextPositionInRootAtPointer(
  view: EditorView,
  root: HTMLElement | null,
  clientX: number,
  clientY: number,
): number | null {
  if (!root || !view.dom.contains(root)) return null;

  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  let best: { distance: number; pos: number } | null = null;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node instanceof Text)) continue;
    const resolved = resolveTextOffsetAtPoint(node, clientX, clientY);
    if (resolved === null) continue;

    const pos = resolveTextNodeDocumentPosition(view, node, resolved.offset);
    let textPos = pos;
    if (textPos === null) {
      try {
        const domPos = view.posAtDOM(node, resolved.offset, -1);
        textPos = isInlineTextSelectionEndpoint(view, domPos) ? clampDocPosition(view, domPos) : null;
      } catch {
        textPos = null;
      }
    }
    if (textPos === null) continue;
    if (best === null || resolved.distance < best.distance) {
      best = { distance: resolved.distance, pos: textPos };
    }
  }

  return best?.pos ?? null;
}

function resolveDomDocumentPosition(view: EditorView, node: Node, offset: number): number | null {
  if (node instanceof Text) {
    const textPos = resolveTextNodeDocumentPosition(view, node, offset);
    if (textPos !== null) return textPos;
  }

  try {
    const pos = view.posAtDOM(node, offset, -1);
    return isInlineTextSelectionEndpoint(view, pos) ? clampDocPosition(view, pos) : null;
  } catch {
    return null;
  }
}

export function resolveEditorTextPositionAtPointer(
  view: EditorView,
  clientX: number,
  clientY: number,
  scanRoot: HTMLElement | null = null,
): number | null {
  if (typeof view.posAtDOM === 'function') {
    const doc = view.dom.ownerDocument as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    const position = doc.caretPositionFromPoint?.(clientX, clientY);
    if (position) {
      const pos = resolveDomDocumentPosition(view, position.offsetNode, position.offset);
      if (pos !== null) return pos;
    }

    const range = doc.caretRangeFromPoint?.(clientX, clientY) ?? null;
    if (range) {
      try {
        const pos = resolveDomDocumentPosition(view, range.startContainer, range.startOffset);
        if (pos !== null) return pos;
      } catch {
      } finally {
        range.detach();
      }
    }
  }

  const scannedPos = resolveTextPositionInRootAtPointer(view, scanRoot, clientX, clientY);
  if (scannedPos !== null) return scannedPos;

  const coordsPos = typeof view.posAtCoords === 'function'
    ? view.posAtCoords({ left: clientX, top: clientY })?.pos ?? null
    : null;
  if (coordsPos !== null && isInlineTextSelectionEndpoint(view, coordsPos)) {
    return clampDocPosition(view, coordsPos);
  }
  return null;
}
