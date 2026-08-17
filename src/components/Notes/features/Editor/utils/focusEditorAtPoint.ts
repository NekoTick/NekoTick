import { Selection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  applyBlankAreaPlainClickSelection,
  resolveBlankAreaPlainClickAction,
  type BlankAreaPlainClickAction,
} from '../plugins/cursor/blankAreaPlainClick';
import { createBlockRectResolver } from '../plugins/cursor/blockRectResolver';
import { SCROLL_ROOT_SELECTOR } from '../plugins/cursor/blankAreaInteractionUtils';
import { resolveTextblockLineEndAtPoint } from '../plugins/cursor/listParagraphEndPlainClick';
import { getCurrentEditorView } from './editorViewRegistry';

export interface EditorViewportPoint {
  clientX: number;
  clientY: number;
  contentOffset?: {
    left: number;
    top: number;
  };
  contentAnchor?: {
    text: string;
    textOffset?: number;
  };
}

interface EditorTextRange {
  from: number;
  to: number;
}

const MAX_EDITOR_CONTENT_ANCHOR_LENGTH = 512;

function findEditorTextRanges(view: EditorView, text: string): EditorTextRange[] {
  if (!text || text.length > MAX_EDITOR_CONTENT_ANCHOR_LENGTH) return [];

  const ranges: EditorTextRange[] = [];
  view.state.doc.descendants((node, pos) => {
    if (!node.isText || typeof node.text !== 'string') {
      return undefined;
    }

    let searchStart = 0;
    while (searchStart < node.text.length) {
      const index = node.text.indexOf(text, searchStart);
      if (index < 0) break;
      ranges.push({ from: pos + index, to: pos + index + text.length });
      searchStart = index + Math.max(1, text.length);
    }
    return undefined;
  });
  return ranges;
}

function resolveContentAnchorPosition(
  view: EditorView,
  anchor: NonNullable<EditorViewportPoint['contentAnchor']>,
  preferredPosition: number | null,
): number | null {
  const text = anchor.text.trim();
  if (!text) return null;

  const ranges = findEditorTextRanges(view, text);
  if (ranges.length === 0) return null;
  const range = ranges.find((candidate) => (
    preferredPosition !== null &&
    preferredPosition >= candidate.from &&
    preferredPosition <= candidate.to
  )) ?? ranges[0];
  const textOffset = Math.max(0, Math.min(anchor.textOffset ?? 0, text.length));
  return range.from + textOffset;
}

function isPositionWithinEditorTextRange(
  position: number | null,
  ranges: readonly EditorTextRange[],
): boolean {
  return position !== null && ranges.some((range) => position >= range.from && position <= range.to);
}

function resolveEditorViewportPoint(
  view: EditorView,
  point: EditorViewportPoint,
): EditorViewportPoint {
  if (!point.contentOffset) {
    return point;
  }

  const editorRect = view.dom.getBoundingClientRect();
  return {
    clientX: editorRect.left + point.contentOffset.left,
    clientY: editorRect.top + point.contentOffset.top,
    contentAnchor: point.contentAnchor,
  };
}

export function getCurrentEditorPositionAtViewportPoint(point: EditorViewportPoint): number | null {
  const view = getCurrentEditorView();
  if (!view) {
    return null;
  }

  const resolvedPoint = resolveEditorViewportPoint(view, point);
  const position = view.posAtCoords({
    left: resolvedPoint.clientX,
    top: resolvedPoint.clientY,
  })?.pos ?? null;
  if (!point.contentAnchor) return position;

  const ranges = findEditorTextRanges(view, point.contentAnchor.text.trim());
  return isPositionWithinEditorTextRange(position, ranges)
    ? position
    : resolveContentAnchorPosition(view, point.contentAnchor, position);
}

function resolveBlankAreaActionAtViewportPoint(
  view: EditorView,
  point: EditorViewportPoint,
): BlankAreaPlainClickAction | null {
  const textblockLineEndAction = resolveTextblockLineEndAtPoint(
    view,
    point.clientX,
    point.clientY,
  );
  if (textblockLineEndAction) return textblockLineEndAction;

  const resolver = createBlockRectResolver({
    view,
    scrollRootSelector: SCROLL_ROOT_SELECTOR,
  });
  try {
    return resolveBlankAreaPlainClickAction({
      blockRects: resolver.getTopLevelBlockRects(),
      clientX: point.clientX,
      clientY: point.clientY,
    });
  } finally {
    resolver.invalidate();
  }
}

function createSelectionAtViewportPoint(
  view: EditorView,
  point: EditorViewportPoint,
  resolveBlankArea: boolean,
): Selection | null {
  if (resolveBlankArea) {
    const blankAreaAction = resolveBlankAreaActionAtViewportPoint(view, point);
    if (blankAreaAction) {
      return applyBlankAreaPlainClickSelection(view.state.tr, blankAreaAction).selection;
    }
  }

  const resolved = view.posAtCoords({
    left: point.clientX,
    top: point.clientY,
  });
  const resolvedPosition = resolved?.pos ?? null;
  if (point.contentAnchor) {
    const anchorText = point.contentAnchor.text.trim();
    const ranges = findEditorTextRanges(view, anchorText);
    if (!isPositionWithinEditorTextRange(resolvedPosition, ranges)) {
      const anchorPosition = resolveContentAnchorPosition(view, point.contentAnchor, resolvedPosition);
      if (anchorPosition !== null) {
        try {
          return TextSelection.create(view.state.doc, anchorPosition);
        } catch {
          return Selection.near(view.state.doc.resolve(anchorPosition), 1);
        }
      }
    }
  }

  if (resolvedPosition === null) {
    return null;
  }

  const pos = Math.max(0, Math.min(resolvedPosition, view.state.doc.content.size));
  const $pos = view.state.doc.resolve(pos);
  if (!$pos.parent.inlineContent) {
    const blankAreaAction = resolveBlankAreaActionAtViewportPoint(view, point);
    if (blankAreaAction) {
      return applyBlankAreaPlainClickSelection(view.state.tr, blankAreaAction).selection;
    }
    return Selection.near($pos, 1);
  }

  try {
    return TextSelection.create(view.state.doc, pos);
  } catch {
    return Selection.near($pos, 1);
  }
}

export function focusCurrentEditorAtViewportPoint(point: EditorViewportPoint): boolean {
  const view = getCurrentEditorView();
  if (!view) {
    return false;
  }

  const selection = createSelectionAtViewportPoint(
    view,
    resolveEditorViewportPoint(view, point),
    !point.contentOffset,
  );
  if (selection) {
    view.dispatch(
      view.state.tr
        .setSelection(selection)
        .scrollIntoView()
    );
  }
  window.focus();
  view.dom.focus({ preventScroll: true });
  view.focus();
  return Boolean(selection) || !point.contentAnchor;
}
