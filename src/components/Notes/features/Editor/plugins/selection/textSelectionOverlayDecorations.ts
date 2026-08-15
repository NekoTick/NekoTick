import { AllSelection, type EditorState } from '@milkdown/kit/prose/state';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { ATOMIC_TEXT_SELECTION_OVERLAY_NODE_NAMES } from '../shared/blockNodeTypes';
import {
  MAX_TEXT_SELECTION_OVERLAY_DECORATIONS,
  MAX_TEXT_SELECTION_OVERLAY_SCAN_NODES,
  TEXT_SELECTION_OVERLAY_CLASS,
  VISIBLE_TEXT_PATTERN,
  isTextSelectionOverlayEligible,
  type TextSelectionOverlayState,
} from './textSelectionOverlayState';

const TEXT_SELECTION_OVERLAY_EXCLUDED_CHARACTERS = /[\u200B\u200C\u2800\n\r\u2028\u2029]/gu;

function hasVisibleText(text: string): boolean {
  TEXT_SELECTION_OVERLAY_EXCLUDED_CHARACTERS.lastIndex = 0;
  return VISIBLE_TEXT_PATTERN.test(text.replace(TEXT_SELECTION_OVERLAY_EXCLUDED_CHARACTERS, ''));
}

export function addTextSelectionOverlayDecorations(
  decorations: Decoration[],
  text: string,
  nodeStart: number,
  selectionFrom: number,
  selectionTo: number,
  includeWhitespace = false,
): void {
  const from = Math.max(selectionFrom, nodeStart);
  const to = Math.min(selectionTo, nodeStart + text.length);
  if (to <= from) return;

  const pushVisibleDecoration = (rangeFrom: number, rangeTo: number) => {
    if (decorations.length >= MAX_TEXT_SELECTION_OVERLAY_DECORATIONS) return;
    if (rangeTo <= rangeFrom) return;
    const selectedText = text.slice(rangeFrom - nodeStart, rangeTo - nodeStart);
    if (!includeWhitespace && !VISIBLE_TEXT_PATTERN.test(selectedText)) {
      return;
    }
    decorations.push(Decoration.inline(rangeFrom, rangeTo, {
      class: TEXT_SELECTION_OVERLAY_CLASS,
    }));
  };

  const selectedText = text.slice(from - nodeStart, to - nodeStart);
  let segmentStart = 0;
  TEXT_SELECTION_OVERLAY_EXCLUDED_CHARACTERS.lastIndex = 0;
  let excludedMatch: RegExpExecArray | null;
  while (
    decorations.length < MAX_TEXT_SELECTION_OVERLAY_DECORATIONS &&
    (excludedMatch = TEXT_SELECTION_OVERLAY_EXCLUDED_CHARACTERS.exec(selectedText)) !== null
  ) {
    pushVisibleDecoration(
      from + segmentStart,
      from + excludedMatch.index,
    );
    segmentStart = excludedMatch.index + excludedMatch[0].length;
  }

  if (segmentStart < selectedText.length) {
    pushVisibleDecoration(from + segmentStart, to);
  }
}

function forEachTextSelectionOverlayNode(
  doc: ProseNode,
  from: number,
  to: number,
  visit: (node: ProseNode, pos: number, parent: ProseNode) => boolean | void,
  maxScanNodes: number
): void {
  let scannedNodes = 0;
  const stack: Array<{
    contentStart: number;
    index: number;
    node: ProseNode;
    offset: number;
  }> = [{
    contentStart: 0,
    index: 0,
    node: doc,
    offset: 0,
  }];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame.index >= frame.node.childCount) {
      stack.pop();
      continue;
    }
    if (scannedNodes >= maxScanNodes) {
      return;
    }

    const node = frame.node.child(frame.index);
    const pos = frame.contentStart + frame.offset;
    frame.index += 1;
    frame.offset += node.nodeSize;

    if (pos >= to) {
      frame.index = frame.node.childCount;
      continue;
    }
    if (pos + node.nodeSize <= from) {
      continue;
    }

    scannedNodes += 1;
    const shouldDescend = visit(node, pos, frame.node);
    if (shouldDescend === false || node.childCount === 0) {
      continue;
    }

    stack.push({
      contentStart: pos + 1,
      index: 0,
      node,
      offset: 0,
    });
  }
}

export function addTextSelectionOverlayDecorationsForRange(
  decorations: Decoration[],
  doc: ProseNode,
  from: number,
  to: number,
  options: {
    includeAtomicBlocks?: boolean;
    includeText?: boolean;
    maxScanNodes?: number;
  } = {}
): void {
  const visibleTextByParent = new Map<ProseNode, boolean>();
  forEachTextSelectionOverlayNode(doc, from, to, (node, pos, parent) => {
    if (decorations.length >= MAX_TEXT_SELECTION_OVERLAY_DECORATIONS) {
      return false;
    }

    if (
      options.includeAtomicBlocks &&
      ATOMIC_TEXT_SELECTION_OVERLAY_NODE_NAMES.has(node.type.name) &&
      from <= pos &&
      pos + node.nodeSize <= to
    ) {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, {
        class: 'editor-block-selected md-focus editor-atomic-selected',
      }));
      return false;
    }

    if (!node.isText || options.includeText === false) return undefined;
    let parentHasVisibleText = visibleTextByParent.get(parent);
    if (parentHasVisibleText === undefined) {
      parentHasVisibleText = hasVisibleText(parent.textContent);
      visibleTextByParent.set(parent, parentHasVisibleText);
    }
    addTextSelectionOverlayDecorations(
      decorations,
      node.text ?? '',
      pos,
      from,
      to,
      parentHasVisibleText,
    );
    return undefined;
  }, options.maxScanNodes ?? MAX_TEXT_SELECTION_OVERLAY_SCAN_NODES);
}

export function createAtomicTextSelectionDecorationState(
  state: EditorState,
): Pick<TextSelectionOverlayState, 'decorationCount' | 'decorations'> {
  if (!(state.selection instanceof AllSelection)) {
    return { decorationCount: 0, decorations: DecorationSet.empty };
  }

  const decorations: Decoration[] = [];
  addTextSelectionOverlayDecorationsForRange(
    decorations,
    state.doc,
    state.selection.from,
    state.selection.to,
    { includeAtomicBlocks: true, includeText: false },
  );
  return {
    decorationCount: decorations.length,
    decorations: decorations.length > 0
      ? DecorationSet.create(state.doc, decorations)
      : DecorationSet.empty,
  };
}

export function createTextSelectionDecorationState(
  state: EditorState,
  maxScanNodes = MAX_TEXT_SELECTION_OVERLAY_SCAN_NODES
): Pick<TextSelectionOverlayState, 'decorationCount' | 'decorations'> {
  const { doc, selection } = state;
  if (!isTextSelectionOverlayEligible(state)) {
    return { decorationCount: 0, decorations: DecorationSet.empty };
  }

  const decorations: Decoration[] = [];
  addTextSelectionOverlayDecorationsForRange(
    decorations,
    doc,
    selection.from,
    selection.to,
    {
      includeAtomicBlocks: selection instanceof AllSelection,
      maxScanNodes,
    }
  );

  return {
    decorationCount: decorations.length,
    decorations: decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty,
  };
}
