import {
  createTextEditorValueSessionActions,
  type TextEditorValueSessionRefs,
} from '../shared/textEditorValueSession';
import type { TextEditorSessionActionArgs } from '../shared/textEditorViewSession';
import { applyMermaidNodeCode, removeMermaidNode } from './mermaidEditorEditing';
import { normalizeMermaidEditorCodeInput } from './mermaidFenceCode';
import { mermaidEditorPluginKey } from './mermaidEditorPluginKey';
import {
  createClosedMermaidEditorState,
  shouldDiscardNewMermaidNodeOnCancel,
  shouldRemoveMermaidNodeOnSave,
} from './mermaidEditorState';
import type { MermaidEditorState } from './types';

export type MermaidEditorSessionRefs = TextEditorValueSessionRefs;

type MermaidEditorSessionActionArgs = TextEditorSessionActionArgs<
  MermaidEditorState,
  MermaidEditorSessionRefs
>;

function closeMermaidEditorSession(args: MermaidEditorSessionActionArgs) {
  const { editorView, resetSessionDom } = args;
  resetSessionDom();
  editorView.dispatch(
    editorView.state.tr.setMeta(mermaidEditorPluginKey, createClosedMermaidEditorState())
  );
}

const mermaidEditorSessionActions = createTextEditorValueSessionActions<
  MermaidEditorState,
  MermaidEditorSessionRefs
>({
  applyValue: applyMermaidNodeCode,
  closeSession: closeMermaidEditorSession,
  getStateValue: (state) => state.code,
  normalizeDraft: normalizeMermaidEditorCodeInput,
  removeNode: (editorView, nodePos) => removeMermaidNode(editorView as never, nodePos),
  shouldDiscardOnCancel: shouldDiscardNewMermaidNodeOnCancel,
  shouldRemoveOnSave: shouldRemoveMermaidNodeOnSave,
});

export const cancelMermaidEditorSession = mermaidEditorSessionActions.cancelSession;
export const saveMermaidEditorSession = mermaidEditorSessionActions.saveSession;
