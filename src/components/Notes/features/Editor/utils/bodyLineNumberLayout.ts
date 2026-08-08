import { getMarkdownBodyLineNumbers } from './bodyLineNumbers';
import {
  collectBodyLineNumberTargets,
  MAX_BODY_LINE_NUMBER_LIST_SCAN_ELEMENTS,
  MAX_BODY_LINE_NUMBER_TARGETS,
} from './bodyLineNumberTargets';
import {
  collectSelectedBlockDescendantTargets,
  isInsideSelectedBlock,
  shouldCollectSelectedBlockDescendantTargets,
  syncBodyLineNumberLabelSelection,
  MAX_BODY_LINE_NUMBER_SELECTION_SCAN_ELEMENTS,
} from './bodyLineNumberSelection';

const BODY_LINE_NUMBER_LABEL_WIDTH = 40;
const BODY_LINE_NUMBER_LABEL_GAP = 18;
const MAX_BODY_LINE_NUMBER_TEXT_ANCHOR_SCAN_NODES = 256;
const MAX_BODY_LINE_NUMBER_TABLE_CELL_ANCHOR_SCAN_ELEMENTS = 128;
export const MAX_BODY_LINE_NUMBER_PRECISE_TEXT_ANCHOR_TARGETS = 400;
export {
  collectBodyLineNumberTargets,
  syncBodyLineNumberLabelSelection,
  MAX_BODY_LINE_NUMBER_LIST_SCAN_ELEMENTS,
  MAX_BODY_LINE_NUMBER_SELECTION_SCAN_ELEMENTS,
  MAX_BODY_LINE_NUMBER_TARGETS,
};

export interface BodyLineNumberLabel {
  lineNumber: number;
  top: number;
  left: number;
  selected?: boolean;
}

export interface BodyLineNumberLabelLayout {
  labels: BodyLineNumberLabel[];
  targets: HTMLElement[];
}

interface BodyLineNumberAnchorOptions {
  allowContentEditableFalse?: boolean;
}

function shouldIgnoreAnchorElement(
  target: HTMLElement,
  element: HTMLElement,
  options: BodyLineNumberAnchorOptions = {},
): boolean {
  if (!target.contains(element)) return true;
  if (element.closest('.frontmatter-block-container')) return true;
  const codeBlock = element.closest('.code-block-container');
  if (codeBlock && codeBlock !== target && !codeBlock.contains(target) && !target.contains(codeBlock)) return true;
  if (element.closest('.body-line-number-gutter')) return true;
  if (target.tagName === 'LI' && element.closest('li') !== target) return true;

  for (let current: HTMLElement | null = element; current && current !== target.parentElement; current = current.parentElement) {
    if (current.getAttribute('aria-hidden') === 'true') return true;
    if (current.matches('.cm-gutters, .cm-gutter, .cm-gutterElement, .cm-lineNumbers')) return true;
    if (!options.allowContentEditableFalse && current.getAttribute('contenteditable') === 'false') return true;
    if (current.matches('button, .editor-collapse-btn, .callout-icon, .callout-title-inner')) return true;
  }

  return false;
}

function getFirstVisibleClientRect(rects: DOMRectList): DOMRect | null {
  for (let index = 0; index < rects.length; index += 1) {
    const rect = rects.item?.(index) ?? (rects as ArrayLike<DOMRect>)[index];
    if (!rect) continue;
    if (rect.width <= 0 && rect.height <= 0) continue;
    return rect;
  }
  return null;
}

function resolveFirstTextLineRect(
  target: HTMLElement,
  options: BodyLineNumberAnchorOptions = {},
): DOMRect | null {
  const doc = target.ownerDocument;
  const walker = doc.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  let scanned = 0;

  for (
    let node = walker.nextNode();
    node && scanned < MAX_BODY_LINE_NUMBER_TEXT_ANCHOR_SCAN_NODES;
    node = walker.nextNode()
  ) {
    scanned += 1;
    if (!node.textContent?.trim()) continue;
    const parent = node.parentElement;
    if (!parent || shouldIgnoreAnchorElement(target, parent, options)) continue;

    const range = doc.createRange();
    try {
      range.selectNodeContents(node);
      const rect = getFirstVisibleClientRect(range.getClientRects());
      if (rect) return rect;
    } finally {
      range.detach();
    }
  }

  return null;
}

function isTableLineNumberTarget(target: HTMLElement): boolean {
  const tagName = target.tagName.toLowerCase();
  return target.classList.contains('milkdown-table-block')
    || tagName === 'table'
    || (tagName === 'tr' && target.closest('table') !== null);
}

function isCodeBlockLineNumberTarget(target: HTMLElement): boolean {
  return target.classList.contains('code-block-container')
    || target.matches('pre[data-language], pre.code-block-wrapper');
}

function isMediaLineNumberTarget(target: HTMLElement): boolean {
  if (
    target.classList.contains('editor-paragraph-has-image-block')
    || target.classList.contains('image-block-container')
    || target.classList.contains('video-block')
    || target.dataset.type === 'video'
  ) {
    return true;
  }

  return target.dataset.type === 'html-block'
    && target.querySelector('img, video, audio, iframe, source, track') !== null;
}

function resolveMediaVisualRect(target: HTMLElement): DOMRect | null {
  if (
    target.classList.contains('image-block-container')
    || target.classList.contains('video-block')
    || target.dataset.type === 'video'
  ) {
    return getVisibleRect(target);
  }

  const visualMedia = target.querySelector<HTMLElement>(
    '.image-block-container, .video-block, [data-type="video"], img, video, audio, iframe'
  );
  return visualMedia ? getVisibleRect(visualMedia) : getVisibleRect(target);
}

function getVisibleRect(element: HTMLElement): DOMRect | null {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 && rect.height <= 0) return null;
  return rect;
}

function resolveFirstTableLineRect(target: HTMLElement): DOMRect | null {
  const doc = target.ownerDocument;
  const walker = doc.createTreeWalker(target, NodeFilter.SHOW_ELEMENT);
  let scannedCells = 0;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node instanceof HTMLElement)) continue;
    const tagName = node.tagName.toLowerCase();
    if (tagName !== 'th' && tagName !== 'td') continue;
    scannedCells += 1;
    if (scannedCells > MAX_BODY_LINE_NUMBER_TABLE_CELL_ANCHOR_SCAN_ELEMENTS) break;

    const textLineRect = resolveFirstTextLineRect(node, { allowContentEditableFalse: true });
    if (textLineRect) return textLineRect;
  }

  const firstRow = target.querySelector<HTMLElement>('tr');
  return firstRow ? getVisibleRect(firstRow) : null;
}

function resolveFirstCodeBlockLineRect(target: HTMLElement): DOMRect | null {
  const codeBody = target.querySelector<HTMLElement>(
    '.code-block-editable, .code-block-lazy-preview, .cm-content, pre, code'
  );
  return resolveFirstTextLineRect(codeBody ?? target, { allowContentEditableFalse: true });
}

function resolveBodyLineNumberAnchorTop(shellRect: DOMRect, target: HTMLElement, usePreciseTextAnchor: boolean): number {
  const targetRect = target.getBoundingClientRect();
  if (usePreciseTextAnchor && isMediaLineNumberTarget(target)) {
    const mediaRect = resolveMediaVisualRect(target);
    if (mediaRect) {
      return mediaRect.top - shellRect.top + mediaRect.height / 2;
    }
  }

  if (usePreciseTextAnchor && isTableLineNumberTarget(target)) {
    const tableLineRect = resolveFirstTableLineRect(target);
    if (tableLineRect) {
      return tableLineRect.top - shellRect.top + tableLineRect.height / 2;
    }
  }

  if (usePreciseTextAnchor && isCodeBlockLineNumberTarget(target)) {
    const codeLineRect = resolveFirstCodeBlockLineRect(target);
    if (codeLineRect) {
      return codeLineRect.top - shellRect.top + codeLineRect.height / 2;
    }
  }

  if (usePreciseTextAnchor) {
    const textLineRect = resolveFirstTextLineRect(target);
    if (textLineRect) {
      return textLineRect.top - shellRect.top + textLineRect.height / 2;
    }
  }

  return targetRect.top - shellRect.top + targetRect.height / 2;
}

function resolveBodyLineNumberAnchorLeft(shellRect: DOMRect, editorRect: DOMRect): number {
  return Math.max(
    0,
    editorRect.left - shellRect.left - BODY_LINE_NUMBER_LABEL_GAP - BODY_LINE_NUMBER_LABEL_WIDTH
  );
}

export function resolveBodyLineNumberLabelLayout(
  shell: HTMLElement,
  markdown: string,
): BodyLineNumberLabelLayout {
  return resolveBodyLineNumberLabelLayoutFromLineNumbers(
    shell,
    getMarkdownBodyLineNumbers(markdown),
  );
}

export function resolveBodyLineNumberLabelLayoutFromLineNumbers(
  shell: HTMLElement,
  bodyLineNumbers: readonly number[],
): BodyLineNumberLabelLayout {
  const editorRoot = shell.querySelector<HTMLElement>('.ProseMirror');
  if (!editorRoot) {
    return {
      labels: [],
      targets: [],
    };
  }

  const targets = collectBodyLineNumberTargets(editorRoot);
  const selectedDescendantTargets = shouldCollectSelectedBlockDescendantTargets(editorRoot)
    ? collectSelectedBlockDescendantTargets(editorRoot)
    : null;
  const shellRect = shell.getBoundingClientRect();
  const editorRect = editorRoot.getBoundingClientRect();
  const labelCount = Math.min(bodyLineNumbers.length, targets.length);
  const usePreciseTextAnchors = labelCount <= MAX_BODY_LINE_NUMBER_PRECISE_TEXT_ANCHOR_TARGETS;
  const labels: BodyLineNumberLabel[] = [];
  const labelTargets: HTMLElement[] = [];

  for (let index = 0; index < labelCount; index += 1) {
    const target = targets[index];
    if (!target) {
      continue;
    }

    const selected = isInsideSelectedBlock(target, selectedDescendantTargets);
    labels.push({
      lineNumber: bodyLineNumbers[index],
      top: resolveBodyLineNumberAnchorTop(shellRect, target, usePreciseTextAnchors),
      left: resolveBodyLineNumberAnchorLeft(shellRect, editorRect),
      ...(selected ? { selected: true } : {}),
    });
    labelTargets.push(target);
  }

  return {
    labels,
    targets: labelTargets,
  };
}

export function resolveBodyLineNumberLabels(shell: HTMLElement, markdown: string): BodyLineNumberLabel[] {
  return resolveBodyLineNumberLabelLayout(shell, markdown).labels;
}
