import type { EditorView } from '@milkdown/kit/prose/view';
import type {
  TextEditorSessionActionArgs,
  TextEditorSessionRefs,
  TextEditorSessionState,
} from './textEditorViewSessionTypes';

export interface TextEditorValueSessionRefs extends TextEditorSessionRefs {
  draftValue: string;
  initialValue: string;
}

export function createTextEditorValueSessionRefs(): TextEditorValueSessionRefs {
  return {
    textareaElement: null,
    draftValue: '',
    initialValue: '',
  };
}

export const textEditorValueSessionBindings = {
  setInitialValue(refs: TextEditorValueSessionRefs, value: string) {
    refs.initialValue = value;
  },
  setDraftValue(refs: TextEditorValueSessionRefs, value: string) {
    refs.draftValue = value;
  },
  getInitialValue(refs: TextEditorValueSessionRefs) {
    return refs.initialValue;
  },
  resetRefs(refs: TextEditorValueSessionRefs) {
    refs.draftValue = '';
    refs.initialValue = '';
  },
};

export function createTextEditorValueSessionActions<
  TState extends TextEditorSessionState,
  TRefs extends TextEditorValueSessionRefs,
>(config: {
  applyValue: (editorView: EditorView, nodePos: number, value: string) => void;
  closeSession: (args: TextEditorSessionActionArgs<TState, TRefs>) => void;
  getStateValue: (state: TState) => string;
  normalizeDraft?: (value: string) => string;
  removeNode: (editorView: EditorView, nodePos: number) => void;
  shouldDiscardOnCancel: (state: TState) => boolean;
  shouldRemoveOnSave: (state: TState, value: string) => boolean;
}) {
  type SessionArgs = TextEditorSessionActionArgs<TState, TRefs>;

  const resolveDraft = (refs: TRefs) => {
    if (refs.textareaElement) refs.draftValue = refs.textareaElement.value;
    return config.normalizeDraft?.(refs.draftValue) ?? refs.draftValue;
  };

  return {
    cancelSession(args: SessionArgs) {
      const state = args.getEditorState();
      if (state && config.shouldDiscardOnCancel(state)) {
        config.removeNode(args.editorView, state.nodePos);
      } else if (state) {
        config.applyValue(
          args.editorView,
          state.nodePos,
          args.refs.initialValue || config.getStateValue(state),
        );
      }

      config.closeSession(args);
      args.editorView.focus();
    },
    saveSession(args: SessionArgs) {
      const state = args.getEditorState();
      if (!state || state.nodePos < 0) {
        config.closeSession(args);
        return;
      }

      const draft = resolveDraft(args.refs);
      if (config.shouldRemoveOnSave(state, draft)) {
        config.removeNode(args.editorView, state.nodePos);
      } else {
        config.applyValue(args.editorView, state.nodePos, draft);
      }

      config.closeSession(args);
      args.editorView.focus();
    },
  };
}
