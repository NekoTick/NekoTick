import type { EditorView } from '@milkdown/kit/prose/view';
import {
  getBlockSelectionPluginState,
} from '../cursor/blockSelectionPluginState';
import {
  forEachBoundedSelectedNode,
  getSelectionBoundaryTextBlock,
  isTableContainer,
} from './blockCommandsTraversal';
import { MAX_BLOCK_COMMAND_NODE_UPDATES } from './blockCommandsLimits';
import type { TextAlignment } from './types';
import {
  STRUCTURAL_LIST_ITEM_ALIGN_CENTER_CLASS,
  STRUCTURAL_LIST_ITEM_ALIGN_RIGHT_CLASS,
} from '../structural/structuralStyleNodes';
import {
  TOOLBAR_ALIGNMENT_PREVIEW_ATTRIBUTE,
  TOOLBAR_SELECTION_HIDDEN_PREVIEW_CLASS,
} from './previewStyleConstants';
import {
  clearNativeSelectionForPreviewFrames,
  showTextSelectionOverlayForPreview,
} from './previewNativeSelection';
import {
  getSelectionColorPreviewSignature,
  hasSameSelectionColorPreviewSignature,
} from './previewSelectionSignature';
import { capturePreviewScrollSnapshot, restorePreviewScrollSnapshot } from './previewScroll';
import { previewStyleState } from './previewStyleState';
import { withPreviewDomObservationPaused } from './previewDomObservation';

type AlignmentMutation = {
  block: HTMLElement;
  blockDataTextAlign: string | null;
  blockStyle: string | null;
  listItem: HTMLElement | null;
  listItemClassName: string | null;
};

function hasMatchingSelectionAlignmentPreview(view: EditorView, key: string): boolean {
  const preview = previewStyleState.selectionAlignmentPreview;
  return Boolean(
    preview &&
    preview.viewDom === view.dom &&
    preview.key === key &&
    view.state.doc.eq(preview.originalDoc) &&
    hasSameSelectionColorPreviewSignature(
      getSelectionColorPreviewSignature(view),
      preview.selection
    ) &&
    preview.styleMutations.every(({ block }) => block.isConnected)
  );
}

function collectSelectedAlignmentBlocks(view: EditorView): HTMLElement[] {
  const selectedBlocks = getBlockSelectionPluginState(view.state).selectedBlocks;
  const ranges = selectedBlocks.length > 0
    ? selectedBlocks
    : [{ from: view.state.selection.from, to: view.state.selection.to }];
  const blocks: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  for (const range of ranges) {
    if (blocks.length >= MAX_BLOCK_COMMAND_NODE_UPDATES) break;
    forEachBoundedSelectedNode(view.state.doc, range.from, range.to, (node, pos, parent) => {
      if (blocks.length >= MAX_BLOCK_COMMAND_NODE_UPDATES) return false;
      if (
        (node.type?.name !== 'paragraph' && node.type?.name !== 'heading') ||
        isTableContainer(parent?.type?.name)
      ) {
        return;
      }

      const dom = view.nodeDOM(pos);
      if (!(dom instanceof HTMLElement) || seen.has(dom)) return false;
      seen.add(dom);
      blocks.push(dom);
      return false;
    });
  }

  if (blocks.length === 0 && view.state.selection.$from) {
    const boundary = getSelectionBoundaryTextBlock(view.state.selection.$from);
    if (boundary) {
      const dom = view.nodeDOM(boundary.pos);
      if (dom instanceof HTMLElement) blocks.push(dom);
    }
  }

  return blocks;
}

function getListItem(block: HTMLElement): HTMLElement | null {
  const listItem = block.closest('li');
  return listItem instanceof HTMLElement ? listItem : null;
}

function applyAlignmentToBlock(
  block: HTMLElement,
  listItem: HTMLElement | null,
  alignment: TextAlignment,
): void {
  if (alignment === 'left') {
    block.removeAttribute('data-text-align');
    block.style.removeProperty('text-align');
  } else {
    block.setAttribute('data-text-align', alignment);
    block.style.setProperty('text-align', alignment);
  }

  if (!listItem) return;
  listItem.classList.remove(
    STRUCTURAL_LIST_ITEM_ALIGN_CENTER_CLASS,
    STRUCTURAL_LIST_ITEM_ALIGN_RIGHT_CLASS,
  );
  if (alignment === 'center') {
    listItem.classList.add(STRUCTURAL_LIST_ITEM_ALIGN_CENTER_CLASS);
  } else if (alignment === 'right') {
    listItem.classList.add(STRUCTURAL_LIST_ITEM_ALIGN_RIGHT_CLASS);
  }
}

export function refreshMatchingSelectionAlignmentPreview(view: EditorView, key: string): boolean {
  if (!hasMatchingSelectionAlignmentPreview(view, key)) return false;
  clearNativeSelectionForPreviewFrames(view.dom);
  return true;
}

export function clearSelectionAlignmentPreview(): boolean {
  const preview = previewStyleState.selectionAlignmentPreview;
  if (!preview) return false;

  const scrollSnapshot = capturePreviewScrollSnapshot(preview.viewDom);
  withPreviewDomObservationPaused(preview.view, () => {
    if (preview.viewDom.isConnected) {
      preview.viewDom.classList.remove(TOOLBAR_SELECTION_HIDDEN_PREVIEW_CLASS);
      preview.viewDom.removeAttribute(TOOLBAR_ALIGNMENT_PREVIEW_ATTRIBUTE);
    }
    preview.styleMutations.forEach(({ block, blockDataTextAlign, blockStyle, listItem, listItemClassName }) => {
      if (block.isConnected) {
        if (blockStyle === null) block.removeAttribute('style');
        else block.setAttribute('style', blockStyle);
        if (blockDataTextAlign === null) block.removeAttribute('data-text-align');
        else block.setAttribute('data-text-align', blockDataTextAlign);
      }
      if (listItem?.isConnected && listItemClassName !== null) {
        listItem.className = listItemClassName;
      }
    });
  });
  previewStyleState.selectionAlignmentPreview = null;
  restorePreviewScrollSnapshot(scrollSnapshot);
  return true;
}

export function renderSelectionAlignmentPreview(
  view: EditorView,
  alignment: TextAlignment,
  key: string,
): boolean {
  if (!(view.dom instanceof HTMLElement)) return false;
  if (hasMatchingSelectionAlignmentPreview(view, key)) {
    clearNativeSelectionForPreviewFrames(view.dom);
    return true;
  }

  clearSelectionAlignmentPreview();
  const blocks = collectSelectedAlignmentBlocks(view);
  if (blocks.length === 0) return false;

  const scrollSnapshot = capturePreviewScrollSnapshot(view.dom);
  showTextSelectionOverlayForPreview(view);
  const styleMutations: AlignmentMutation[] = [];
  const mutatedListItems = new Set<HTMLElement>();

  withPreviewDomObservationPaused(view, () => {
    blocks.forEach((block) => {
      const listItem = getListItem(block);
      styleMutations.push({
        block,
        blockDataTextAlign: block.getAttribute('data-text-align'),
        blockStyle: block.getAttribute('style'),
        listItem,
        listItemClassName: listItem && !mutatedListItems.has(listItem) ? listItem.className : null,
      });
      if (listItem) mutatedListItems.add(listItem);
      applyAlignmentToBlock(block, listItem, alignment);
    });

    view.dom.classList.add(TOOLBAR_SELECTION_HIDDEN_PREVIEW_CLASS);
    view.dom.setAttribute(TOOLBAR_ALIGNMENT_PREVIEW_ATTRIBUTE, alignment);
  });

  previewStyleState.selectionAlignmentPreview = {
    key,
    originalDoc: view.state.doc,
    selection: getSelectionColorPreviewSignature(view),
    styleMutations,
    view,
    viewDom: view.dom,
  };
  clearNativeSelectionForPreviewFrames(view.dom);
  restorePreviewScrollSnapshot(scrollSnapshot);
  return true;
}
