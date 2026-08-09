import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model';
import type { EditorState } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { CodeBlockNodeView } from '../code/CodeBlockNodeView';
import {
  STOP_PROSE_SCAN,
  scanProseDescendants,
} from '../shared/boundedProseNodeScan';
import { collectAppliedPreviewElements } from './appliedPreviewCollect';
import { makePreviewCloneNonInteractive } from './appliedPreviewClone';
import { registerAppliedPreviewCleanup } from './appliedPreviewCleanup';
import { MAX_APPLIED_PREVIEW_CODE_BLOCK_SCAN_NODES } from './appliedPreviewLimits';

function hasDirectPreCodeChild(element: HTMLElement): boolean {
  for (let child = element.firstElementChild; child; child = child.nextElementSibling) {
    if (child.tagName !== 'PRE') {
      continue;
    }

    for (let preChild = child.firstElementChild; preChild; preChild = preChild.nextElementSibling) {
      if (preChild.tagName === 'CODE') {
        return true;
      }
    }
  }

  return false;
}

function getSerializedCodeBlockElements(previewDom: HTMLElement): HTMLElement[] | null {
  const collection = collectAppliedPreviewElements(previewDom, (element) => {
    if (element.matches('pre.code-block-wrapper')) {
      return true;
    }

    return element.tagName === 'DIV' && hasDirectPreCodeChild(element);
  });
  return collection.complete ? collection.elements : null;
}

export function getPreviewCodeBlockNodes(
  state: EditorState,
  expectedCount: number
): Array<{ node: ProseMirrorNode; pos: number }> | null {
  if (expectedCount <= 0) {
    return [];
  }

  const codeBlocks: Array<{ node: ProseMirrorNode; pos: number }> = [];

  const completed = scanProseDescendants(state.doc, (node, pos) => {
    if (node.type?.name === 'code_block') {
      codeBlocks.push({ node: node as ProseMirrorNode, pos });
      return codeBlocks.length >= expectedCount ? STOP_PROSE_SCAN : true;
    }
    return true;
  }, MAX_APPLIED_PREVIEW_CODE_BLOCK_SCAN_NODES);

  return completed && codeBlocks.length === expectedCount ? codeBlocks : null;
}

export function renderCodeBlockNodeViewPreviews(
  previewDom: HTMLElement,
  state: EditorState,
  view: EditorView,
  options: { passive?: boolean } = {},
): void {
  const previewCodeBlocks = getSerializedCodeBlockElements(previewDom);
  if (!previewCodeBlocks || previewCodeBlocks.length === 0) {
    return;
  }

  const codeBlockNodes = getPreviewCodeBlockNodes(state, previewCodeBlocks.length);
  if (!codeBlockNodes) {
    return;
  }

  const nodeViews: CodeBlockNodeView[] = [];

  previewCodeBlocks.forEach((previewCodeBlock, index) => {
    const entry = codeBlockNodes[index];
    if (!entry) {
      return;
    }

    const nodeView = new CodeBlockNodeView(
      entry.node,
      view,
      () => undefined,
      options.passive
        ? { lazyCodeMirror: true, passiveLazyCodeMirror: false }
        : {},
    );
    nodeView.dom.setAttribute('aria-hidden', 'true');
    if (!makePreviewCloneNonInteractive(nodeView.dom)) {
      nodeView.destroy();
      return;
    }
    previewCodeBlock.replaceWith(nodeView.dom);
    nodeViews.push(nodeView);
  });

  if (nodeViews.length > 0) {
    registerAppliedPreviewCleanup(previewDom, () => {
      nodeViews.forEach((nodeView) => nodeView.destroy());
    });
  }
}

export function preserveSourceCodeBlockNodeViews(previewDom: HTMLElement, sourceDom: HTMLElement | null): boolean {
  if (!sourceDom) {
    return false;
  }

  const sourceCodeBlockCollection = collectAppliedPreviewElements(
    sourceDom,
    (element) => element.classList.contains('code-block-container')
  );
  if (!sourceCodeBlockCollection.complete) {
    return false;
  }

  const { elements: sourceCodeBlocks } = sourceCodeBlockCollection;
  if (sourceCodeBlocks.length === 0) {
    return false;
  }

  const previewCodeBlocks = getSerializedCodeBlockElements(previewDom);
  if (!previewCodeBlocks || previewCodeBlocks.length !== sourceCodeBlocks.length) {
    return false;
  }

  const clones: HTMLElement[] = [];
  for (let index = 0; index < previewCodeBlocks.length; index += 1) {
    const sourceCodeBlock = sourceCodeBlocks[index];
    if (!sourceCodeBlock) {
      return false;
    }

    const clone = sourceCodeBlock.cloneNode(true) as HTMLElement;
    if (!makePreviewCloneNonInteractive(clone)) {
      return false;
    }
    clones.push(clone);
  }

  previewCodeBlocks.forEach((previewCodeBlock, index) => {
    const clone = clones[index];
    if (!clone) {
      return;
    }
    previewCodeBlock.replaceWith(clone);
  });
  return true;
}
