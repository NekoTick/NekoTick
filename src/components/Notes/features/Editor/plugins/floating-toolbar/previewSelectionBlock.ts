import { Fragment, type Node as ProseNode } from '@milkdown/kit/prose/model';
import { EditorState } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { themeStyleResetTokens } from '@/styles/themeTokens';
import { resolveTopLevelBlockElement } from '../cursor/topLevelBlockDom';
import { cleanupAppliedPreviewDocument } from './appliedPreviewCleanup';
import { makePreviewCloneNonInteractive } from './appliedPreviewClone';
import {
  createAppliedPreviewState,
  renderAppliedPreviewDocument,
} from './appliedPreviewState';
import { withPreviewDomObservationPaused } from './previewDomObservation';
import {
  clearNativeSelectionForPreviewFrames,
  showTextSelectionOverlayForPreview,
} from './previewNativeSelection';
import {
  getSelectionColorPreviewSignature,
  hasSameSelectionColorPreviewSignature,
} from './previewSelectionSignature';
import { capturePreviewScrollSnapshot, restorePreviewScrollSnapshot } from './previewScroll';
import {
  TOOLBAR_BLOCK_PREVIEW_ATTRIBUTE,
  TOOLBAR_BLOCK_PREVIEW_NODE_ATTRIBUTE,
  TOOLBAR_SELECTION_HIDDEN_PREVIEW_CLASS,
} from './previewStyleConstants';
import { previewStyleState } from './previewStyleState';

type TopLevelEntry = {
  node: ProseNode;
  pos: number;
};

function collectChangedTopLevelNodes(
  doc: ProseNode,
  from: number,
  to: number,
): TopLevelEntry[] {
  const entries: TopLevelEntry[] = [];
  const rangeTo = Math.max(from + 1, to);

  doc.forEach((node, pos) => {
    if (pos < rangeTo && pos + node.nodeSize > from) {
      entries.push({ node, pos });
    }
  });
  return entries;
}

function getChangedTopLevelRanges(
  originalDoc: ProseNode,
  previewDoc: ProseNode,
): { original: TopLevelEntry[]; preview: TopLevelEntry[] } | null {
  const diffStart = originalDoc.content.findDiffStart(previewDoc.content);
  if (diffStart === null) return { original: [], preview: [] };

  const diffEnd = originalDoc.content.findDiffEnd(previewDoc.content);
  if (!diffEnd) return null;

  return {
    original: collectChangedTopLevelNodes(originalDoc, diffStart, diffEnd.a),
    preview: collectChangedTopLevelNodes(previewDoc, diffStart, diffEnd.b),
  };
}

function hasMatchingSelectionBlockPreview(view: EditorView, key: string): boolean {
  const preview = previewStyleState.selectionBlockPreview;
  return Boolean(
    preview &&
    preview.viewDom === view.dom &&
    preview.key === key &&
    view.state.doc.eq(preview.originalDoc) &&
    hasSameSelectionColorPreviewSignature(
      getSelectionColorPreviewSignature(view),
      preview.selection,
    ) &&
    preview.previewNodes.every((node) => node.isConnected)
  );
}

export function refreshMatchingSelectionBlockPreview(view: EditorView, key: string): boolean {
  if (!hasMatchingSelectionBlockPreview(view, key)) return false;
  clearNativeSelectionForPreviewFrames(view.dom);
  return true;
}

export function hasActiveSelectionBlockPreview(view: EditorView): boolean {
  return previewStyleState.selectionBlockPreview?.viewDom === view.dom;
}

export function clearSelectionBlockPreview(): boolean {
  const preview = previewStyleState.selectionBlockPreview;
  if (!preview) return false;

  const scrollSnapshot = capturePreviewScrollSnapshot(preview.viewDom);
  withPreviewDomObservationPaused(preview.view, () => {
    if (preview.viewDom.isConnected) {
      const connectedPreviewNode = preview.previewNodes.find(
        (node) => node.parentNode === preview.viewDom,
      );
      const restoreBefore = connectedPreviewNode ?? (
        preview.restoreBefore?.parentNode === preview.viewDom
          ? preview.restoreBefore
          : null
      );
      preview.sourceNodes.forEach((node) => {
        preview.viewDom.insertBefore(node, restoreBefore);
      });
      preview.previewNodes.forEach((node) => node.remove());
      preview.viewDom.classList.remove(TOOLBAR_SELECTION_HIDDEN_PREVIEW_CLASS);
      preview.viewDom.removeAttribute(TOOLBAR_BLOCK_PREVIEW_ATTRIBUTE);
    }
  });
  if (preview.previewRoot) {
    cleanupAppliedPreviewDocument(preview.previewRoot);
  }
  previewStyleState.selectionBlockPreview = null;
  restorePreviewScrollSnapshot(scrollSnapshot);
  return true;
}

export function renderSelectionBlockPreview(
  view: EditorView,
  key: string,
  apply: (previewView: EditorView) => void,
): boolean {
  if (!(view.dom instanceof HTMLElement)) return false;
  if (hasMatchingSelectionBlockPreview(view, key)) {
    clearNativeSelectionForPreviewFrames(view.dom);
    return true;
  }

  clearSelectionBlockPreview();
  showTextSelectionOverlayForPreview(view);
  const previewState = createAppliedPreviewState(view, apply);
  const changed = getChangedTopLevelRanges(view.state.doc, previewState.doc);
  if (!changed) return false;

  let previewRoot: HTMLElement | null = null;
  let previewNodes: HTMLElement[] = [];
  let sourceNodes: HTMLElement[] = [];
  let restoreBefore: ChildNode | null = null;

  if (changed.original.length > 0 || changed.preview.length > 0) {
    sourceNodes = changed.original
      .map(({ pos }) => resolveTopLevelBlockElement(view, pos))
      .filter((node): node is HTMLElement => node !== null);
    if (sourceNodes.length !== changed.original.length || sourceNodes.length === 0) {
      return false;
    }

    const reducedDoc = previewState.schema.topNodeType.create(
      null,
      Fragment.fromArray(changed.preview.map(({ node }) => node)),
    );
    const reducedState = EditorState.create({ doc: reducedDoc });
    const sourceRoot = view.dom.cloneNode(false) as HTMLElement;
    sourceNodes.forEach((node) => sourceRoot.append(node.cloneNode(true)));
    previewRoot = renderAppliedPreviewDocument(
      reducedState,
      sourceRoot,
      view.dom.ownerDocument,
      undefined,
      view,
      { passiveCodeBlockNodeViews: true },
    );
    previewNodes = Array.from(previewRoot.children)
      .filter((node): node is HTMLElement => node instanceof HTMLElement);
    if (
      previewNodes.length === 0 ||
      previewNodes.some((node) => !makePreviewCloneNonInteractive(node))
    ) {
      cleanupAppliedPreviewDocument(previewRoot);
      return false;
    }
    previewNodes.forEach((node) => {
      node.setAttribute(TOOLBAR_BLOCK_PREVIEW_NODE_ATTRIBUTE, 'true');
      node.style.pointerEvents = themeStyleResetTokens.pointerEventsNone;
    });
    restoreBefore = sourceNodes[sourceNodes.length - 1]?.nextSibling ?? null;
  }

  const scrollSnapshot = capturePreviewScrollSnapshot(view.dom);
  withPreviewDomObservationPaused(view, () => {
    if (sourceNodes.length > 0) {
      const insertBefore = sourceNodes[0];
      previewNodes.forEach((node) => view.dom.insertBefore(node, insertBefore));
      sourceNodes.forEach((node) => node.remove());
    }
    view.dom.classList.add(TOOLBAR_SELECTION_HIDDEN_PREVIEW_CLASS);
    view.dom.setAttribute(TOOLBAR_BLOCK_PREVIEW_ATTRIBUTE, key.slice('block:'.length));
  });

  previewStyleState.selectionBlockPreview = {
    key,
    originalDoc: view.state.doc,
    previewNodes,
    previewRoot,
    previewState,
    restoreBefore,
    selection: getSelectionColorPreviewSignature(view),
    sourceNodes,
    view,
    viewDom: view.dom,
  };
  clearNativeSelectionForPreviewFrames(view.dom);
  restorePreviewScrollSnapshot(scrollSnapshot);
  return true;
}
