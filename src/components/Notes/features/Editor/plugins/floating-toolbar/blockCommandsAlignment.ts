import type { EditorView } from '@milkdown/kit/prose/view';
import type { TextAlignment } from './types';
import { getBlockSelectionPluginState } from '../cursor/blockSelectionPluginState';
import { markEditorUserInput } from '../shared/userInputEvents';
import { MAX_BLOCK_COMMAND_NODE_UPDATES } from './blockCommandsLimits';
import { forEachBoundedSelectedNode } from './blockCommandsTraversal';

export function setTextAlignment(view: EditorView, alignment: TextAlignment): void {
  const { state, dispatch } = view;
  const { from, to, $from } = state.selection;
  const tr = state.tr;
  let updated = false;
  let updateCount = 0;
  const selectedBlocks = getBlockSelectionPluginState(state).selectedBlocks;

  const isUnsupportedContainer = (typeName: string | undefined) =>
    typeName === 'table_cell' || typeName === 'table_header';
  const getUpdatedAttrs = (attrs: Record<string, unknown> | undefined) => ({
    ...attrs,
    align: alignment,
    ...(alignment === 'left' ? { vlainaAlignmentCommentPlacement: null } : {}),
  });

  const applyAlignmentAcrossRange = (rangeFrom: number, rangeTo: number) => {
    forEachBoundedSelectedNode(state.doc, rangeFrom, rangeTo, (node, pos, parent) => {
      if (updateCount >= MAX_BLOCK_COMMAND_NODE_UPDATES) return false;
      if (node.type?.name !== 'paragraph' && node.type?.name !== 'heading') return;
      if (isUnsupportedContainer(parent?.type?.name)) return false;

      tr.setNodeMarkup(pos, undefined, getUpdatedAttrs(node.attrs));
      updated = true;
      updateCount += 1;
      return false;
    });
  };

  if (selectedBlocks.length > 0) {
    for (const range of selectedBlocks) {
      if (updateCount >= MAX_BLOCK_COMMAND_NODE_UPDATES) break;
      applyAlignmentAcrossRange(range.from, range.to);
    }
  } else {
    applyAlignmentAcrossRange(from, to);
  }

  if (!updated && selectedBlocks.length === 0) {
    const parent = $from.parent;
    const ancestor = $from.node(-1);
    if (
      (parent.type.name === 'paragraph' || parent.type.name === 'heading') &&
      !isUnsupportedContainer(ancestor.type.name)
    ) {
      const targetPos = $from.before();
      tr.setNodeMarkup(targetPos, undefined, getUpdatedAttrs(parent.attrs));
      updated = true;
    }
  }

  if (!updated) return;

  markEditorUserInput(view);
  dispatch(tr);
  view.focus();
}
