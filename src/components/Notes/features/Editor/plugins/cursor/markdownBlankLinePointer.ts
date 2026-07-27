import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION } from './blockSelectionPluginState';
import { resolveInsideBlockVisualLinePlainClickAction } from './blankAreaPlainClick';
import { createBlockRectResolver } from './blockRectResolver';
import { isSameEditorScrollRoot, SCROLL_ROOT_SELECTOR } from './blankAreaInteractionUtils';
import {
  DEFAULT_PROSE_DOC_SCAN_NODE_LIMIT,
  STOP_PROSE_SCAN,
  scanProseDescendants,
} from '../shared/boundedProseNodeScan';
import {
  EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
  isEditableBlankLinePlaceholderNode,
  MARKDOWN_BLANK_LINE_DEBUG_STORAGE_KEY,
  MARKDOWN_BLANK_LINE_SELECTOR,
} from './markdownBlankLineShared';

export const MAX_MARKDOWN_BLANK_LINE_NODE_POS_SCAN_NODES = DEFAULT_PROSE_DOC_SCAN_NODE_LIMIT;

function resolveMarkdownBlankLineTarget(view: EditorView, target: EventTarget | null): HTMLElement | null {
  const targetElement = target instanceof HTMLElement
    ? target
    : target instanceof Node
      ? target.parentElement
      : null;
  const blankLine = targetElement?.closest(MARKDOWN_BLANK_LINE_SELECTOR);
  return blankLine instanceof HTMLElement && view.dom.contains(blankLine) ? blankLine : null;
}

function isPointInsideMarkdownBlankLineRect(
  blankLine: HTMLElement,
  clientX: number,
  clientY: number,
  horizontalBounds?: DOMRect,
): boolean {
  const rect = blankLine.getBoundingClientRect();
  if (rect.height <= 0) return false;

  const verticalSlack = Math.max(1, Math.min(4, rect.height / 4));
  const previousRect = blankLine.previousElementSibling instanceof HTMLElement
    ? blankLine.previousElementSibling.getBoundingClientRect()
    : null;
  const hitTop = previousRect && previousRect.bottom < rect.top - verticalSlack
    ? previousRect.bottom
    : rect.top - verticalSlack;
  const horizontalSlack = 4;
  const horizontalRect = horizontalBounds && horizontalBounds.width > 0
    ? horizontalBounds
    : rect;
  if (horizontalRect.width <= 0) return false;
  return (
    clientX >= horizontalRect.left - horizontalSlack &&
    clientX <= horizontalRect.right + horizontalSlack &&
    clientY >= hitTop &&
    clientY <= rect.bottom + verticalSlack
  );
}

function resolveAdjacentMarkdownBlankLineTargetAtCoords(
  view: EditorView,
  target: EventTarget | null,
  clientX: number,
  clientY: number,
): HTMLElement | null {
  const targetElement = target instanceof HTMLElement
    ? target
    : target instanceof Node
      ? target.parentElement
      : null;
  if (!targetElement || !view.dom.contains(targetElement)) return null;

  let topLevelTarget: HTMLElement | null = targetElement;
  while (topLevelTarget?.parentElement && topLevelTarget.parentElement !== view.dom) {
    topLevelTarget = topLevelTarget.parentElement;
  }
  if (!topLevelTarget || topLevelTarget.parentElement !== view.dom) return null;

  const candidates = [
    topLevelTarget.previousElementSibling,
    topLevelTarget.nextElementSibling,
  ];
  const editorRect = view.dom.getBoundingClientRect();
  for (const candidate of candidates) {
    if (
      candidate instanceof HTMLElement &&
      candidate.matches(MARKDOWN_BLANK_LINE_SELECTOR) &&
      isPointInsideMarkdownBlankLineRect(candidate, clientX, clientY, editorRect)
    ) {
      return candidate;
    }
  }
  return null;
}

export function resolveMarkdownBlankLineTargetAtCoords(
  view: EditorView,
  clientX: number,
  clientY: number,
  target: EventTarget | null = null,
): HTMLElement | null {
  const adjacentBlankLine = resolveAdjacentMarkdownBlankLineTargetAtCoords(view, target, clientX, clientY);
  if (adjacentBlankLine) return adjacentBlankLine;

  let closestBlankLine: HTMLElement | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  const blankLines = view.dom.querySelectorAll(MARKDOWN_BLANK_LINE_SELECTOR);
  const editorRect = view.dom.getBoundingClientRect();

  for (let index = 0; index < blankLines.length; index += 1) {
    const blankLine = blankLines.item(index);
    if (!(blankLine instanceof HTMLElement)) continue;

    const rect = blankLine.getBoundingClientRect();
    if (!isPointInsideMarkdownBlankLineRect(blankLine, clientX, clientY, editorRect)) continue;

    const yCenter = rect.top + rect.height / 2;
    const xCenter = rect.left + rect.width / 2;
    const distance = Math.abs(clientY - yCenter) + Math.abs(clientX - xCenter) / Math.max(1, rect.width);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestBlankLine = blankLine;
    }
  }

  return closestBlankLine;
}

export function resolveMarkdownBlankLineNodePos(view: EditorView, blankLine: HTMLElement): number | null {
  try {
    const directPos = view.posAtDOM(blankLine, 0);
    const directNode = view.state.doc.nodeAt(directPos);
    if (
      isEditableBlankLinePlaceholderNode(directNode) &&
      view.nodeDOM(directPos) === blankLine
    ) {
      return directPos;
    }
  } catch {
  }

  let found: number | null = null;
  scanProseDescendants(view.state.doc, (node, pos) => {
    if (!isEditableBlankLinePlaceholderNode(node)) return true;
    if (view.nodeDOM(pos) === blankLine) {
      found = pos;
      return STOP_PROSE_SCAN;
    }
    return true;
  }, MAX_MARKDOWN_BLANK_LINE_NODE_POS_SCAN_NODES);
  return found;
}

export function findEditableMarkdownBlankLineElement(root: HTMLElement): HTMLParagraphElement | null {
  for (let index = 0; index < root.children.length; index += 1) {
    const child = root.children.item(index);
    if (
      child instanceof HTMLParagraphElement &&
      child.textContent === EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER
    ) {
      return child;
    }
  }
  return null;
}

function isMarkdownBlankLineDebugEnabled(): boolean {
  const globalValue = globalThis as typeof globalThis & {
    __debugMarkdownBlankLine?: boolean;
    localStorage?: Pick<Storage, 'getItem'>;
  };
  if (globalValue.__debugMarkdownBlankLine === true) return true;
  try {
    return globalValue.localStorage?.getItem(MARKDOWN_BLANK_LINE_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function logMarkdownBlankLineDebug(message: string, payload: Record<string, unknown>): void {
  if (!isMarkdownBlankLineDebugEnabled()) return;
  console.debug('[editor:markdown-blank-line]', message, payload);
}

function isAdjacentVisualLineEdgeClick(
  view: EditorView,
  blankLineNodePos: number,
  clientX: number,
  clientY: number,
): boolean {
  const resolver = createBlockRectResolver({
    view,
    scrollRootSelector: SCROLL_ROOT_SELECTOR,
  });
  try {
    const action = resolveInsideBlockVisualLinePlainClickAction({
      blockRects: resolver.getTopLevelBlockRects(),
      clientX,
      clientY,
    });
    return action !== null && action.blockFrom !== blankLineNodePos;
  } finally {
    resolver.invalidate();
  }
}

export function handleMarkdownBlankLinePointerDown(view: EditorView, event: MouseEvent): boolean {
  if (!isSameEditorScrollRoot(view, event.target)) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;

  const blankLine = resolveMarkdownBlankLineTarget(view, event.target)
    ?? resolveMarkdownBlankLineTargetAtCoords(view, event.clientX, event.clientY, event.target);
  if (!blankLine) return false;

  const nodePos = resolveMarkdownBlankLineNodePos(view, blankLine);
  if (nodePos === null) return false;
  if (isAdjacentVisualLineEdgeClick(view, nodePos, event.clientX, event.clientY)) return false;

  const node = view.state.doc.nodeAt(nodePos);
  if (!node || node.type.name !== 'html_block') return false;
  const paragraphType = view.state.schema.nodes.paragraph;
  if (!paragraphType) return false;

  const debugEnabled = isMarkdownBlankLineDebugEnabled();
  const beforeRect = debugEnabled ? blankLine.getBoundingClientRect() : null;
  const nextElement = debugEnabled && blankLine.nextElementSibling instanceof HTMLElement
    ? blankLine.nextElementSibling
    : null;
  const nextTopBefore = nextElement?.getBoundingClientRect().top ?? null;
  event.preventDefault();
  const paragraph = paragraphType.create(null, view.state.schema.text(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER));
  let tr = view.state.tr.replaceWith(nodePos, nodePos + node.nodeSize, paragraph);
  tr = tr
    .setSelection(TextSelection.create(tr.doc, nodePos + 1 + EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length))
    .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION);
  view.dispatch(tr.scrollIntoView());
  view.focus();

  const editableBlankLine = debugEnabled ? findEditableMarkdownBlankLineElement(view.dom) : null;
  const afterRect = editableBlankLine?.getBoundingClientRect() ?? null;
  const nextTopAfter = nextElement?.getBoundingClientRect().top ?? null;
  logMarkdownBlankLineDebug('click converted placeholder to editable paragraph', {
    nodePos,
    selectionType: view.state.selection.constructor.name,
    blankLineHeightBefore: beforeRect?.height ?? null,
    blankLineHeightAfter: afterRect?.height ?? null,
    nextTopBefore,
    nextTopAfter,
    nextTopDelta: nextTopBefore !== null && nextTopAfter !== null ? nextTopAfter - nextTopBefore : null,
  });
  return true;
}
