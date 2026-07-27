import type { Ctx } from '@milkdown/kit/ctx';
import { editorViewCtx } from '@milkdown/kit/core';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { Selection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { themeDomStyleTokens } from '@/styles/themeTokens';
export {
  findInsertedNodePos,
  moveSelectionAfterInsertedNode,
} from '../shared/insertedNodeSelection';

const EDITABLE_BLANK_LINE_PLACEHOLDER_PATTERN = /[\u200B\u200C]/g;

export function isEditorInsertionContextCurrent(
  view: EditorView,
  sourceDoc: ProseNode,
  sourceSelection: Selection,
): boolean {
  return view.state.doc.eq(sourceDoc) && view.state.selection.eq(sourceSelection);
}

export function getSlashInsertViewportPosition(ctx: Ctx) {
  const view = ctx.get(editorViewCtx);
  try {
    const coords = view.coordsAtPos(view.state.selection.from);
    return {
      x: coords.left,
      y: coords.bottom + themeDomStyleTokens.editorPopupAnchorOffsetPx,
    };
  } catch {
    return {
      x: themeDomStyleTokens.editorPopupFallbackX,
      y: themeDomStyleTokens.editorPopupFallbackY,
    };
  }
}

function isEditableBlankLineText(text: string): boolean {
  return text.replace(EDITABLE_BLANK_LINE_PLACEHOLDER_PATTERN, '').trim().length === 0;
}

function getCurrentBlankTextBlockReplaceRange(selection: TextSelection) {
  return {
    from: selection.$from.before(1),
    to: selection.$from.after(1),
  };
}

export function replaceSelectionOrCurrentBlankTextBlockWithNode<TNode, TTransaction>(state: {
  selection: unknown;
  tr: {
    doc: {
      nodeAt: (pos: number) => { content?: { size?: number }; nodeSize?: number; type?: { name?: string } } | null;
    };
    replaceSelectionWith: (node: TNode, inheritMarks?: boolean) => TTransaction;
    replaceWith: (from: number, to: number, node: TNode) => TTransaction;
  };
}, node: TNode): TTransaction {
  const { selection } = state;
  if (
    selection instanceof TextSelection &&
    selection.empty &&
    selection.$from.depth === 1 &&
    selection.$from.parent.type.name === 'paragraph' &&
    (
      selection.$from.parent.content.size === 0 ||
      isEditableBlankLineText(selection.$from.parent.textContent)
    )
  ) {
    const range = getCurrentBlankTextBlockReplaceRange(selection);
    return state.tr.replaceWith(range.from, range.to, node);
  }

  if (
    selection instanceof TextSelection &&
    selection.empty &&
    selection.$from.depth === 1 &&
    selection.$from.parent.type.name === 'paragraph' &&
    selection.$from.parent.content.size > 0 &&
    selection.$from.parentOffset === selection.$from.parent.content.size
  ) {
    const nextPos = selection.$from.after(1);
    const nextNode = state.tr.doc.nodeAt(nextPos);
    if (nextNode?.type?.name === 'paragraph' && nextNode.content?.size === 0) {
      return state.tr.replaceWith(nextPos, nextPos + Math.max(1, nextNode.nodeSize ?? 1), node);
    }
  }

  return state.tr.replaceSelectionWith(node);
}
