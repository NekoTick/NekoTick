import type { EditorView } from '@milkdown/kit/prose/view';
import type { TextEditorPopupElements } from './textEditorPopupDom';

export interface TextEditorSessionState {
  isOpen: boolean;
  nodePos: number;
  position: { x: number; y: number };
}

export interface TextEditorSessionRefs {
  textareaElement: HTMLTextAreaElement | null;
}

export interface TextEditorSessionActionArgs<
  TState extends TextEditorSessionState,
  TRefs extends TextEditorSessionRefs,
> {
  editorView: EditorView;
  refs: TRefs;
  getEditorState: () => TState | undefined;
  resetSessionDom: () => void;
}

export interface TextEditorPreviewArgs<
  TState extends TextEditorSessionState,
  TRefs extends TextEditorSessionRefs,
> {
  state: TState;
  refs: TRefs;
  value: string;
  resolveAnchor: () => HTMLElement | null;
  scheduleResize: () => void;
}

export interface CreateTextEditorViewSessionArgs<
  TState extends TextEditorSessionState,
  TRefs extends TextEditorSessionRefs,
> {
  editorView: EditorView;
  onOutsideCloseIntent: () => void;
  refs: TRefs;
  popupClassName: string;
  popupLayout?: 'anchored' | 'viewport-centered';
  deferConfigurePopup?: boolean;
  placeholder: string;
  getEditorState: () => TState | undefined;
  getStateRenderKey: (state: TState) => string;
  getValue: (state: TState) => string;
  setInitialValue: (refs: TRefs, value: string) => void;
  setDraftValue: (refs: TRefs, value: string) => void;
  getInitialValue: (refs: TRefs) => string;
  resetRefs: (refs: TRefs) => void;
  resolveAnchorElement: (state: TState | undefined, nodeDom: Node | null) => HTMLElement | null;
  getAnchorViewportPosition: (anchorElement: HTMLElement | null) => { x: number; y: number };
  preferStatePositionOnInitialRender?: (state: TState) => boolean;
  scrollPopupIntoViewOnInitialRender?: boolean;
  constrainTextareaHeightToViewport?: boolean;
  resizeTextareaToContent?: boolean;
  configurePopup?: (
    elements: TextEditorPopupElements,
    notifyInput: () => void,
  ) => void | (() => void);
  previewInput: (args: TextEditorPreviewArgs<TState, TRefs>) => void;
  previewInputDebounceMs?: number;
  previewCancel: (args: TextEditorPreviewArgs<TState, TRefs>) => void;
  cancelSession: (args: TextEditorSessionActionArgs<TState, TRefs>) => void;
  saveSession: (args: TextEditorSessionActionArgs<TState, TRefs>) => void;
}
