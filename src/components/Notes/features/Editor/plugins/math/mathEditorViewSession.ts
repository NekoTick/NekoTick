import type { EditorView } from '@milkdown/kit/prose/view';
import { translate } from '@/lib/i18n';
import { createTextEditorViewSession } from '../shared/textEditorViewSession';
import {
  cancelMathEditorSession,
  saveMathEditorSession,
  type MathEditorSessionRefs,
} from './mathEditorSessionActions';
import { mathEditorPluginKey } from './mathEditorPluginKey';
import { configureMathFormulaPicker } from './mathFormulaPicker';
import { renderMathEditorLivePreview } from './mathEditorLivePreview';
import {
  getMathAnchorViewportPosition,
  resolveMathAnchorElement,
} from './mathEditorPlacement';
import type { MathEditorState } from './types';

export function createMathEditorViewSession(args: {
  editorView: EditorView;
  onOutsideCloseIntent: () => void;
}) {
  const { editorView, onOutsideCloseIntent } = args;
  const refs: MathEditorSessionRefs = {
    textareaElement: null,
    draftLatex: '',
    initialLatex: '',
  };

  return createTextEditorViewSession<MathEditorState, MathEditorSessionRefs>({
    editorView,
    onOutsideCloseIntent,
    refs,
    popupClassName: 'text-editor-popup math-editor-popup text-editor-workspace-popup math-formula-editor-popup',
    popupLayout: 'viewport-centered',
    deferConfigurePopup: true,
    placeholder: translate('editor.mathPlaceholder'),
    getEditorState: () =>
      mathEditorPluginKey.getState(editorView.state) as MathEditorState | undefined,
    getStateRenderKey: (state) => `${state.nodePos}:${state.displayMode ? 'block' : 'inline'}`,
    getValue: (state) => state.latex,
    setInitialValue: (nextRefs, value) => {
      nextRefs.initialLatex = value;
    },
    setDraftValue: (nextRefs, value) => {
      nextRefs.draftLatex = value;
    },
    getInitialValue: (nextRefs) => nextRefs.initialLatex,
    resetRefs: (nextRefs) => {
      nextRefs.draftLatex = '';
      nextRefs.initialLatex = '';
    },
    resolveAnchorElement: (_state, nodeDom) => resolveMathAnchorElement(null, nodeDom),
    getAnchorViewportPosition: getMathAnchorViewportPosition,
    preferStatePositionOnInitialRender: (state) => state.openSource === 'new-empty-block',
    resizeTextareaToContent: false,
    previewInputDebounceMs: 0,
    configurePopup: configureMathFormulaPicker,
    previewInput({ state, value, resolveAnchor, scheduleResize }) {
      renderMathEditorLivePreview({
        anchor: resolveAnchor(),
        latex: value,
        displayMode: state.displayMode,
      });
      scheduleResize();
    },
    previewCancel({ state, value, resolveAnchor, scheduleResize }) {
      renderMathEditorLivePreview({
        anchor: resolveAnchor(),
        latex: value,
        displayMode: state.displayMode,
      });
      scheduleResize();
    },
    cancelSession: cancelMathEditorSession,
    saveSession: saveMathEditorSession,
  });
}
