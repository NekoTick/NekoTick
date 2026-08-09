import { DOMSerializer } from '@milkdown/kit/prose/model';
import type { EditorState, Transaction } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  preserveSourceCodeBlockNodeViews,
  renderCodeBlockNodeViewPreviews,
} from './appliedPreviewCodeBlocks';
import { addProseMirrorTrailingBreaks } from './appliedPreviewTrailingBreaks';
import { preserveSourceRenderedAtomNodes } from './appliedPreviewSourceNodes';
import {
  preserveSourceFrontmatterNodeViews,
  preserveSourceImageBlockNodeViews,
} from './appliedPreviewSourceNodes';
import { stabilizePreviewBlankLineLayout } from './appliedPreviewBlankLineLayout';
import { stabilizePreviewListLayout } from './appliedPreviewListLayout';
import { stabilizePreviewMediaAdjacentLayout } from './appliedPreviewMediaLayout';
import { stabilizePreviewRootTypography } from './appliedPreviewRootTypography';
import { stabilizePreviewTopLevelLayoutDecorations } from './appliedPreviewTopLevelLayout';

export { collectAppliedPreviewElements } from './appliedPreviewCollect';
export {
  getPreviewCodeBlockNodes,
} from './appliedPreviewCodeBlocks';
export { cleanupAppliedPreviewDocument } from './appliedPreviewCleanup';
export {
  MAX_APPLIED_PREVIEW_CODE_BLOCK_SCAN_NODES,
  MAX_APPLIED_PREVIEW_DOM_SCAN_ELEMENTS,
  MAX_APPLIED_PREVIEW_MATCHED_ELEMENTS,
  MAX_APPLIED_PREVIEW_TRAILING_BREAK_DEPTH,
  MAX_APPLIED_PREVIEW_TRAILING_BREAK_NODES,
} from './appliedPreviewLimits';
export { addProseMirrorTrailingBreaks } from './appliedPreviewTrailingBreaks';

export function createAppliedPreviewState(
  view: EditorView,
  apply: (previewView: EditorView) => void
): EditorState {
  const previewView: any = {
    ...view,
    state: view.state,
    dom: {},
    dispatch(tr: Transaction) {
      previewView.state = previewView.state.apply(tr);
    },
    focus() {},
    nodeDOM() {
      return null;
    },
  };

  apply(previewView as EditorView);
  return previewView.state;
}

export function renderAppliedPreviewDocument(
  state: EditorState,
  sourceDom: HTMLElement | null,
  ownerDocument: Document,
  extraClassName?: string,
  view?: EditorView,
  options: { passiveCodeBlockNodeViews?: boolean } = {},
): HTMLElement {
  const previewDom = sourceDom
    ? sourceDom.cloneNode(false) as HTMLElement
    : ownerDocument.createElement('div');
  const className = sourceDom?.className || 'ProseMirror';
  previewDom.className = extraClassName ? `${className} ${extraClassName}` : className;
  previewDom.removeAttribute('data-toolbar-preview-hidden');
  previewDom.removeAttribute('contenteditable');
  previewDom.removeAttribute('tabindex');
  previewDom.setAttribute('aria-hidden', 'true');
  previewDom.appendChild(
    DOMSerializer.fromSchema(state.schema).serializeFragment(
      state.doc.content,
      { document: ownerDocument }
    )
  );
  addProseMirrorTrailingBreaks(previewDom, state.doc, ownerDocument);
  const didPreserveCodeBlocks = preserveSourceCodeBlockNodeViews(previewDom, sourceDom);
  if (!didPreserveCodeBlocks && view) {
    // Serialized ProseMirror output is not enough for custom-rendered blocks.
    // Rehydrate preview-only code blocks with the same node view used by the
    // live editor so hover previews stay equivalent to the committed result.
    renderCodeBlockNodeViewPreviews(previewDom, state, view, {
      passive: options.passiveCodeBlockNodeViews,
    });
  }
  preserveSourceImageBlockNodeViews(previewDom, sourceDom);
  preserveSourceFrontmatterNodeViews(previewDom, sourceDom);
  preserveSourceRenderedAtomNodes(previewDom, sourceDom);
  stabilizePreviewMediaAdjacentLayout(previewDom, sourceDom);
  stabilizePreviewBlankLineLayout(previewDom, sourceDom);
  stabilizePreviewTopLevelLayoutDecorations(previewDom, sourceDom);
  stabilizePreviewListLayout(previewDom, sourceDom);
  stabilizePreviewRootTypography(previewDom, sourceDom);
  return previewDom;
}
