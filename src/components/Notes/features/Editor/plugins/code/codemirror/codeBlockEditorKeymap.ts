import type { EditorView as CodeMirror, KeyBinding } from '@codemirror/view';
import type { Node } from '@milkdown/kit/prose/model';
import { exitCode } from '@milkdown/kit/prose/commands';
import { redo, undo } from '@milkdown/kit/prose/history';
import * as proseState from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { deleteSelectedBlocks } from '../../cursor/blockSelectionCommands';
import {
  blankAreaDragBoxPluginKey,
  CLEAR_BLOCKS_ACTION,
  getBlockSelectionPluginState,
} from '../../cursor/blockSelectionPluginState';
import { getCodeBlockSourceText } from '../codeBlockText';
import {
  createCodeBlockEditorClipboardHandlers,
} from './codeBlockEditorClipboard';
import type { CreateCodeBlockKeymapOptions } from './codeBlockEditorKeymapTypes';

const { TextSelection } = proseState;
const AllSelection = (
  proseState as typeof proseState & {
    AllSelection: (new (doc: unknown) => unknown) & {
      create?: (doc: unknown) => unknown;
    };
  }
).AllSelection;

export { createCodeBlockEditorClipboardHandlers };

function createAllSelection(doc: unknown) {
  if (typeof AllSelection.create === 'function') {
    return AllSelection.create(doc);
  }

  return new AllSelection(doc);
}

function isEntireDocumentSelected(cm: CodeMirror): boolean {
  const selection = cm.state.selection.main;
  return selection.from === 0 && selection.to === cm.state.doc.length;
}

function deleteActiveBlockSelection(view: EditorView): boolean {
  const { selectedBlocks } = getBlockSelectionPluginState(view.state);
  if (selectedBlocks.length === 0) {
    return false;
  }

  return deleteSelectedBlocks(
    view,
    selectedBlocks,
    (tr) => tr.setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION)
  );
}

function deleteLeadingEmptyLine(cm: CodeMirror): boolean {
  const ranges = cm.state.selection.ranges;
  if (ranges.length !== 1) {
    return false;
  }

  const selection = ranges[0];
  if (!selection.empty || selection.anchor !== 0 || cm.state.doc.lines < 2) {
    return false;
  }

  const firstLine = cm.state.doc.line(1);
  if (firstLine.length > 0) {
    return false;
  }

  const nextLine = cm.state.doc.line(2);
  const nextLineEndAfterDelete = Math.max(0, nextLine.to - 1);
  cm.dispatch({
    changes: { from: 0, to: 1, insert: '' },
    selection: { anchor: nextLineEndAfterDelete, head: nextLineEndAfterDelete },
  });
  cm.focus();
  return true;
}


function maybeEscape(
  getCodeMirror: () => CodeMirror | undefined,
  view: EditorView,
  getNode: () => Node,
  getPos: () => number | undefined,
  unit: 'line' | 'char',
  direction: -1 | 1
) {
  const cm = getCodeMirror();
  if (!cm) {
    return false;
  }

  const { state } = cm;
  const selection = state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const range = unit === 'line' ? state.doc.lineAt(selection.head) : selection;

  if (direction < 0 ? range.from > 0 : range.to < state.doc.length) {
    return false;
  }

  const pos = getPos();
  if (pos === undefined) {
    return false;
  }

  const node = getNode();
  const targetPos = pos + (direction < 0 ? 0 : node.nodeSize);
  const nextSelection = TextSelection.near(view.state.doc.resolve(targetPos), direction);
  view.dispatch(view.state.tr.setSelection(nextSelection).scrollIntoView());
  view.focus();
  return true;
}

export function createCodeBlockEditorKeymap({
  getCodeMirror,
  view,
  getNode,
  getPos,
}: CreateCodeBlockKeymapOptions): KeyBinding[] {
  return [
    {
      key: 'Backspace',
      run: () => deleteActiveBlockSelection(view),
    },
    {
      key: 'Delete',
      run: () => deleteActiveBlockSelection(view),
    },
    {
      key: 'Backspace',
      run: () => {
        const cm = getCodeMirror();
        return cm ? deleteLeadingEmptyLine(cm) : false;
      },
    },
    {
      key: 'Mod-a',
      run: () => {
        const cm = getCodeMirror();
        if (!cm) {
          return false;
        }

        if (isEntireDocumentSelected(cm)) {
          view.dispatch(view.state.tr.setSelection(createAllSelection(view.state.doc) as never));
          view.focus();
          return true;
        }

        cm.dispatch({
          selection: {
            anchor: 0,
            head: cm.state.doc.length,
          },
        });
        cm.focus();
        return true;
      },
    },
    { key: 'ArrowUp', run: () => maybeEscape(getCodeMirror, view, getNode, getPos, 'line', -1) },
    { key: 'ArrowLeft', run: () => maybeEscape(getCodeMirror, view, getNode, getPos, 'char', -1) },
    { key: 'ArrowDown', run: () => maybeEscape(getCodeMirror, view, getNode, getPos, 'line', 1) },
    { key: 'ArrowRight', run: () => maybeEscape(getCodeMirror, view, getNode, getPos, 'char', 1) },
    {
      key: 'Mod-Enter',
      run: () => {
        if (!exitCode(view.state, view.dispatch)) {
          return false;
        }

        view.focus();
        return true;
      },
    },
    { key: 'Mod-z', run: () => undo(view.state, view.dispatch) },
    { key: 'Shift-Mod-z', run: () => redo(view.state, view.dispatch) },
    { key: 'Mod-y', run: () => redo(view.state, view.dispatch) },
    {
      key: 'Backspace',
      run: () => {
        const cm = getCodeMirror();
        if (!cm) {
          return false;
        }

        const ranges = cm.state.selection.ranges;
        if (ranges.length !== 1) {
          return false;
        }

        const selection = ranges[0];
        if (!selection.empty || selection.anchor > 0 || cm.state.doc.lines >= 2) {
          return false;
        }

        const pos = getPos();
        if (pos === undefined) {
          return false;
        }

        const paragraph = view.state.schema.nodes.paragraph;
        if (!paragraph) {
          return false;
        }

        const node = getNode();
        const rawText = getCodeBlockSourceText(node);
        const paragraphContent = rawText
          ? view.state.schema.text(rawText)
          : undefined;
        const tr = view.state.tr.replaceWith(
          pos,
          pos + node.nodeSize,
          paragraph.create(null, paragraphContent)
        );

        tr.setSelection(TextSelection.near(tr.doc.resolve(pos)));
        view.dispatch(tr);
        view.focus();
        return true;
      },
    },
  ];
}
