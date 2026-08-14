import type { EditorView } from '@milkdown/kit/prose/view';
import { translate } from '@/lib/i18n';
import { createTextEditorViewSession } from '../shared/textEditorViewSession';
import { renderMermaidEditorLivePreview } from './mermaidDom';
import {
  cancelMermaidEditorSession,
  saveMermaidEditorSession,
  type MermaidEditorSessionRefs,
} from './mermaidEditorSessionActions';
import {
  getMermaidAnchorViewportPosition,
  resolveMermaidAnchorElement,
} from './mermaidEditorOpenInteraction';
import { mermaidEditorPluginKey } from './mermaidEditorPluginKey';
import { configureMermaidEditorWorkspace } from './mermaidEditorWorkspace';
import type { MermaidEditorState } from './types';

export function createMermaidEditorViewSession(args: {
  editorView: EditorView;
  onOutsideCloseIntent: () => void;
}) {
  const { editorView, onOutsideCloseIntent } = args;
  const refs: MermaidEditorSessionRefs = {
    textareaElement: null,
    draftCode: '',
    initialCode: '',
  };
  let renderDraftPreview: ((code: string) => void) | null = null;

  return createTextEditorViewSession<MermaidEditorState, MermaidEditorSessionRefs>({
    editorView,
    onOutsideCloseIntent,
    refs,
    popupClassName: 'text-editor-popup math-editor-popup text-editor-workspace-popup mermaid-editor-popup',
    popupLayout: 'viewport-centered',
    placeholder: translate('editor.mermaidPlaceholder'),
    getEditorState: () =>
      mermaidEditorPluginKey.getState(editorView.state) as MermaidEditorState | undefined,
    getStateRenderKey: (state) => String(state.nodePos),
    getValue: (state) => state.code,
    setInitialValue: (nextRefs, value) => {
      nextRefs.initialCode = value;
    },
    setDraftValue: (nextRefs, value) => {
      nextRefs.draftCode = value;
    },
    getInitialValue: (nextRefs) => nextRefs.initialCode,
    resetRefs: (nextRefs) => {
      nextRefs.draftCode = '';
      nextRefs.initialCode = '';
    },
    resolveAnchorElement: (_state, nodeDom) => resolveMermaidAnchorElement(null, nodeDom),
    getAnchorViewportPosition: getMermaidAnchorViewportPosition,
    preferStatePositionOnInitialRender: (state) => state.openSource === 'new-empty-block',
    resizeTextareaToContent: false,
    configurePopup(elements, notifyInput) {
      const workspace = configureMermaidEditorWorkspace(elements, notifyInput);
      renderDraftPreview = workspace.renderPreview;
      return () => {
        if (renderDraftPreview === workspace.renderPreview) renderDraftPreview = null;
        workspace.cleanup();
      };
    },
    previewInput({ value }) {
      renderDraftPreview?.(value);
    },
    previewCancel({ value, resolveAnchor, scheduleResize }) {
      void renderMermaidEditorLivePreview({
        anchor: resolveAnchor(),
        code: value,
        onRendered: scheduleResize,
      }).catch(() => undefined);
    },
    cancelSession: cancelMermaidEditorSession,
    saveSession: saveMermaidEditorSession,
  });
}
