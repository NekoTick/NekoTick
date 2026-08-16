import {
  createTextEditorValueSessionActions,
  type TextEditorValueSessionRefs,
} from '../shared/textEditorValueSession';
import type { TextEditorSessionActionArgs } from '../shared/textEditorViewSession';
import { applyMathNodeLatex, removeMathNode } from './mathEditorEditing';
import { mathEditorPluginKey } from './mathEditorPluginKey';
import { createClosedMathEditorState, shouldDiscardNewMathNodeOnCancel } from './mathEditorState';
import type { MathEditorState } from './types';

export type MathEditorSessionRefs = TextEditorValueSessionRefs;

type MathEditorSessionActionArgs = TextEditorSessionActionArgs<
  MathEditorState,
  MathEditorSessionRefs
>;

function closeMathEditorSession(args: MathEditorSessionActionArgs) {
  const { editorView, resetSessionDom } = args;
  resetSessionDom();
  editorView.dispatch(
    editorView.state.tr.setMeta(mathEditorPluginKey, createClosedMathEditorState())
  );
}

const mathEditorSessionActions = createTextEditorValueSessionActions<
  MathEditorState,
  MathEditorSessionRefs
>({
  applyValue: applyMathNodeLatex,
  closeSession: closeMathEditorSession,
  getStateValue: (state) => state.latex,
  removeNode: (editorView, nodePos) => removeMathNode(editorView as never, nodePos),
  shouldDiscardOnCancel: shouldDiscardNewMathNodeOnCancel,
  shouldRemoveOnSave: (_state, draftLatex) => !draftLatex.trim(),
});

export const cancelMathEditorSession = mathEditorSessionActions.cancelSession;
export const saveMathEditorSession = mathEditorSessionActions.saveSession;
