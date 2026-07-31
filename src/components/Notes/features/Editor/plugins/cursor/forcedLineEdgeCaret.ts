import type { EditorView } from '@milkdown/kit/prose/view';
import { applyBlankAreaPlainClickSelection, type BlankAreaPlainClickAction } from './blankAreaPlainClick';
import { blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION } from './blockSelectionPluginState';
import { resolveBlockElementAtPos } from './topLevelBlockDom';
import { floatingToolbarKey } from '../floating-toolbar/floatingToolbarKey';
import { TOOLBAR_ACTIONS } from '../floating-toolbar/types';
import { setActiveForcedCaret } from './forcedLineEdgeCaretOverlay';
export { clearForcedCaretForOwner } from './forcedLineEdgeCaretOverlay';

const TRAILING_LINE_END_CLICK_GAP_PX = 8;
const LEADING_LINE_START_CLICK_GAP_PX = 8;
const FORCED_CARET_POSITION_TOLERANCE_PX = 2;
const TEXTBLOCK_CARET_CLASS = 'editor-textblock-caret-overlay-active';
const TEXTBLOCK_CARET_ELEMENT_SELECTOR = '.editor-textblock-caret-overlay';
export const MAX_FORCED_LINE_EDGE_TEXT_CHARS = 100_000;
export const MAX_FORCED_LINE_EDGE_TEXT_NODES = 512;
export const MAX_FORCED_LINE_EDGE_RECTS = 1024;
export const MAX_FORCED_LINE_EDGE_INLINE_ATOMS = 512;
export const MAX_TEXTBLOCK_CARET_OVERLAY_SCAN_ELEMENTS = 10_000;

export interface SerializedRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface RefinedBlankAreaPlainClickAction extends BlankAreaPlainClickAction {
  textRect?: SerializedRect;
  forcedCaretX?: number;
}

interface VisualLineEdgeResolution {
  pos: number;
  textRect: SerializedRect;
  forcedCaretX: number;
}

function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

function serializeRect(rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>): SerializedRect {
  return {
    left: roundCoord(rect.left),
    top: roundCoord(rect.top),
    right: roundCoord(rect.right),
    bottom: roundCoord(rect.bottom),
    width: roundCoord(rect.width),
    height: roundCoord(rect.height),
  };
}

export function clearTextBlockCaretOverlay(view: EditorView): number {
  const doc = view.dom.ownerDocument;
  const overlays: Element[] = [];
  const walker = doc.createTreeWalker(doc.body, 1);
  let scanned = 0;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    scanned += 1;
    if (scanned > MAX_TEXTBLOCK_CARET_OVERLAY_SCAN_ELEMENTS) {
      break;
    }

    if (node instanceof Element && node.matches(TEXTBLOCK_CARET_ELEMENT_SELECTOR)) {
      overlays.push(node);
    }
  }

  overlays.forEach((overlay) => overlay.remove());
  view.dom.classList.remove(TEXTBLOCK_CARET_CLASS);
  return overlays.length;
}

function isIgnoredTrailingLineEndElement(element: Element): boolean {
  return Boolean(element.closest([
    'button',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[contenteditable="false"]',
  ].join(', ')));
}

function isPointVerticallyInsideRect(rect: Pick<DOMRect, 'top' | 'bottom' | 'height'>, clientY: number): boolean {
  const verticalSlack = Math.max(2, Math.min(6, rect.height * 0.35));
  return clientY >= rect.top - verticalSlack && clientY <= rect.bottom + verticalSlack;
}

function isIgnoredInlineAtom(element: HTMLElement): boolean {
  if (!element.matches('[contenteditable="false"]')) return true;
  if (element.parentElement?.closest('[contenteditable="false"]')) return true;
  if (element.closest('button, input, textarea, select, [role="button"]')) return true;
  return !element.ownerDocument.defaultView?.getComputedStyle(element).display.startsWith('inline');
}

export function resolveVisualLineEdgePos(
  view: EditorView,
  action: BlankAreaPlainClickAction,
  clientX: number,
  clientY: number,
): VisualLineEdgeResolution | null {
  const blockNode = view.state.doc.nodeAt(action.blockFrom);
  if (blockNode && blockNode.nodeSize > MAX_FORCED_LINE_EDGE_TEXT_CHARS + 2) {
    return null;
  }

  const blockElement = resolveBlockElementAtPos(view, action.blockFrom);
  if (!blockElement) {
    return null;
  }

  const doc = blockElement.ownerDocument;
  let measuredTextChars = 0;
  const walker = doc.createTreeWalker(blockElement, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.textContent ?? '';
      measuredTextChars += text.length;
      if (measuredTextChars > MAX_FORCED_LINE_EDGE_TEXT_CHARS) return NodeFilter.FILTER_ACCEPT;
      if (!text.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || isIgnoredTrailingLineEndElement(parent)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const lineEdgeRectRef = { current: null as DOMRect | null };
  let measuredTextNodes = 0;
  let measuredRects = 0;
  const considerRect = (rect: DOMRect): boolean => {
    measuredRects += 1;
    if (measuredRects > MAX_FORCED_LINE_EDGE_RECTS) return false;
    if (rect.width <= 0 || rect.height <= 0) return true;
    if (!isPointVerticallyInsideRect(rect, clientY)) return true;

    if (!lineEdgeRectRef.current) {
      lineEdgeRectRef.current = rect;
    } else if (action.bias === -1) {
      if (rect.right > lineEdgeRectRef.current.right) lineEdgeRectRef.current = rect;
    } else if (rect.left < lineEdgeRectRef.current.left) {
      lineEdgeRectRef.current = rect;
    }
    return true;
  };

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (measuredTextChars > MAX_FORCED_LINE_EDGE_TEXT_CHARS) {
      return null;
    }

    measuredTextNodes += 1;
    if (measuredTextNodes > MAX_FORCED_LINE_EDGE_TEXT_NODES) {
      return null;
    }

    const range = doc.createRange();
    try {
      range.selectNodeContents(node);
      const rects = range.getClientRects();

      for (let index = 0; index < rects.length; index += 1) {
        const rect = rects[index];
        if (rect && !considerRect(rect)) return null;
      }
    } finally {
      range.detach();
    }
  }

  const inlineAtoms = blockElement.querySelectorAll<HTMLElement>('[contenteditable="false"]');
  if (inlineAtoms.length > MAX_FORCED_LINE_EDGE_INLINE_ATOMS) return null;
  for (let index = 0; index < inlineAtoms.length; index += 1) {
    const atom = inlineAtoms.item(index);
    if (!atom || isIgnoredInlineAtom(atom)) continue;
    const rects = atom.getClientRects();
    for (let rectIndex = 0; rectIndex < rects.length; rectIndex += 1) {
      const rect = rects[rectIndex];
      if (rect && !considerRect(rect)) return null;
    }
  }

  const lineEdgeRect = lineEdgeRectRef.current;
  if (!lineEdgeRect) {
    return null;
  }

  if (action.bias === -1) {
    if (clientX < lineEdgeRect.right + TRAILING_LINE_END_CLICK_GAP_PX) {
      return null;
    }
  } else if (clientX > lineEdgeRect.left - LEADING_LINE_START_CLICK_GAP_PX) {
    return null;
  }

  const forcedCaretX = action.bias === -1 ? lineEdgeRect.right : lineEdgeRect.left;
  const serializedTextRect = serializeRect(lineEdgeRect);
  return { pos: action.targetPos, textRect: serializedTextRect, forcedCaretX };
}

function refineBlankAreaPlainClickAction(
  view: EditorView,
  action: BlankAreaPlainClickAction,
  clientX?: number,
  clientY?: number,
): RefinedBlankAreaPlainClickAction {
  if (typeof clientX !== 'number' || typeof clientY !== 'number') return action;
  const lineEdgePos = resolveVisualLineEdgePos(view, action, clientX, clientY);
  const refinedAction = lineEdgePos === null
    ? action
    : {
      ...action,
      targetPos: lineEdgePos.pos,
      textRect: lineEdgePos.textRect,
      forcedCaretX: lineEdgePos.forcedCaretX,
    };
  return refinedAction;
}

function showForcedLineEndCaret(view: EditorView, action: RefinedBlankAreaPlainClickAction): boolean {
  if (!action.textRect || typeof action.forcedCaretX !== 'number') return false;
  setActiveForcedCaret(view, action.textRect, action.forcedCaretX);
  return true;
}

function refreshForcedCaretGeometry(
  view: EditorView,
  action: RefinedBlankAreaPlainClickAction,
  clientX?: number,
  clientY?: number,
): RefinedBlankAreaPlainClickAction | null {
  if (!action.textRect || typeof action.forcedCaretX !== 'number') return action;
  if (typeof clientX !== 'number' || typeof clientY !== 'number') return action;

  const refreshed = resolveVisualLineEdgePos(view, {
    ...action,
    targetPos: view.state.selection.head,
  }, clientX, clientY);
  if (!refreshed) return null;
  if (
    Math.abs(refreshed.forcedCaretX - action.forcedCaretX)
    > FORCED_CARET_POSITION_TOLERANCE_PX
  ) return null;

  return {
    ...action,
    textRect: refreshed.textRect,
    forcedCaretX: refreshed.forcedCaretX,
  };
}

export function dispatchBlankAreaPlainClick(
  view: EditorView,
  action: BlankAreaPlainClickAction,
  clientX?: number,
  clientY?: number,
): void {
  const refinedAction = refineBlankAreaPlainClickAction(view, action, clientX, clientY);
  let tr = applyBlankAreaPlainClickSelection(view.state.tr, refinedAction);
  tr = tr
    .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION)
    .setMeta(floatingToolbarKey, { type: TOOLBAR_ACTIONS.HIDE })
    .setMeta('addToHistory', false);
  view.dispatch(tr.scrollIntoView());
  view.focus();
  const refreshedAction = refreshForcedCaretGeometry(
    view,
    refinedAction,
    clientX,
    clientY,
  );
  if (refreshedAction) showForcedLineEndCaret(view, refreshedAction);
}
