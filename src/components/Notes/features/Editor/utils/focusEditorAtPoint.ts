import { Selection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  applyBlankAreaPlainClickSelection,
  resolveInsideBlockTrailingPlainClickAction,
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
  };
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
    return resolveInsideBlockTrailingPlainClickAction({
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
): Selection | null {
  const blankAreaAction = resolveBlankAreaActionAtViewportPoint(view, point);
  if (blankAreaAction) {
    return applyBlankAreaPlainClickSelection(view.state.tr, blankAreaAction).selection;
  }

  const resolved = view.posAtCoords({
    left: point.clientX,
    top: point.clientY,
  });
  if (!resolved) {
    return null;
  }

  const pos = Math.max(0, Math.min(resolved.pos, view.state.doc.content.size));
  const $pos = view.state.doc.resolve(pos);
  if (!$pos.parent.inlineContent) {
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

  const selection = createSelectionAtViewportPoint(view, resolveEditorViewportPoint(view, point));
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
  return true;
}
