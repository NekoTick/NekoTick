import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { GapCursor } from '@milkdown/kit/prose/gapcursor';
import { Selection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

export function createGapCursorSelectionAt(doc: ProseNode, pos: number): GapCursor | null {
  try {
    const $pos = doc.resolve(pos);
    return GapCursor.valid($pos) ? new GapCursor($pos) : null;
  } catch {
    return null;
  }
}

export function syncEditorSelectionFromDOM(view: EditorView): boolean {
  const domSelection = view.dom.ownerDocument.getSelection();
  const anchorNode = domSelection?.anchorNode;
  const focusNode = domSelection?.focusNode;
  if (
    !domSelection ||
    !anchorNode ||
    !focusNode ||
    !view.dom.contains(anchorNode) ||
    !view.dom.contains(focusNode)
  ) {
    return false;
  }

  try {
    const anchor = view.posAtDOM(anchorNode, domSelection.anchorOffset, 1);
    const head = view.posAtDOM(focusNode, domSelection.focusOffset, -1);
    const $anchor = view.state.doc.resolve(anchor);
    const $head = view.state.doc.resolve(head);
    if (!$anchor.parent.inlineContent || !$head.parent.inlineContent) {
      return false;
    }
    const selection = TextSelection.create(view.state.doc, anchor, head);
    if (selection.eq(view.state.selection)) return false;
    view.dispatch(view.state.tr.setSelection(selection).setMeta('addToHistory', false));
    return true;
  } catch {
    return false;
  }
}

function isInlineLineBreakNode(node: ProseNode): boolean {
  const nodeName = node.type.name;
  return (
    nodeName === 'hardbreak' ||
    nodeName === 'hard_break' ||
    nodeName === 'softbreak' ||
    nodeName === 'soft_break'
  );
}

function createCollapsedTextSelectionNear(doc: ProseNode, pos: number, bias: -1 | 1): Selection {
  const $pos = doc.resolve(pos);
  if ($pos.parent.inlineContent) {
    return TextSelection.create(doc, pos);
  }
  return Selection.near($pos, bias);
}

export function createDocumentStartTextSelection(doc: ProseNode): Selection {
  let textSelectionPos: number | null = null;

  doc.descendants((node, pos) => {
    if (textSelectionPos !== null) return false;
    if (node.isTextblock) {
      textSelectionPos = pos + 1;
      return false;
    }
    return true;
  });

  if (textSelectionPos !== null) {
    try {
      return TextSelection.create(doc, textSelectionPos);
    } catch {
      // Fall through to ProseMirror's nearest valid selection.
    }
  }

  return (
    createGapCursorSelectionAt(doc, 0)
    ?? createGapCursorSelectionAt(doc, doc.content.size)
    ?? Selection.near(doc.resolve(0), 1)
  );
}

export function createDocumentFirstLineEndTextSelection(doc: ProseNode): Selection {
  let textSelectionPos: number | null = null;

  doc.descendants((node, pos) => {
    if (textSelectionPos !== null) return false;
    if (!node.isTextblock) return true;

    let lineEndOffset = 0;
    let foundLineBreak = false;
    node.forEach((child) => {
      if (foundLineBreak) return;

      if (child.isText) {
        const text = child.text ?? '';
        const newlineIndex = text.indexOf('\n');
        if (newlineIndex >= 0) {
          lineEndOffset += newlineIndex;
          foundLineBreak = true;
          return;
        }
      }

      if (isInlineLineBreakNode(child)) {
        foundLineBreak = true;
        return;
      }

      lineEndOffset += child.nodeSize;
    });

    textSelectionPos = pos + 1 + lineEndOffset;
    return false;
  });

  if (textSelectionPos !== null) {
    return createCollapsedTextSelectionNear(doc, textSelectionPos, -1);
  }

  return (
    createGapCursorSelectionAt(doc, doc.content.size)
    ?? createGapCursorSelectionAt(doc, 0)
    ?? Selection.near(doc.resolve(0), 1)
  );
}
