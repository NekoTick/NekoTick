import type { EditorView } from '@milkdown/kit/prose/view';

export const SCROLL_ROOT_SELECTOR = '[data-note-scroll-root="true"]';
export const NOTES_SIDEBAR_SCROLL_ROOT_SELECTOR = '[data-notes-sidebar-scroll-root="true"]';
export const NOTES_SIDEBAR_BLANK_DRAG_ROOT_SELECTOR = '[data-notes-sidebar-blank-drag-root="true"]';
export const FILE_TREE_ROOT_DROP_TARGET_SELECTOR = '[data-file-tree-root-drop-target="true"]';
export const EXTERNAL_BLOCK_SELECTION_BLANK_ROOT_SELECTOR = '[data-notes-external-block-selection-root="true"]';
export const EXTERNAL_BLOCK_SELECTION_BLANK_EXCLUDED_SELECTOR = [
  '[data-notes-external-block-selection-excluded="true"]',
  '[data-chat-selection-excluded="true"]',
  '[data-chat-input="true"]',
  'img',
  'video',
  'canvas',
].join(', ');
export const COVER_REGION_SELECTOR = '[data-note-cover-region="true"]';
export const NOTE_CONTENT_ROOT_SELECTOR = '[data-note-content-root="true"]';
export const NO_EDITOR_DRAG_BOX_SELECTOR = '[data-no-editor-drag-box="true"]';
export const IGNORED_BLANK_AREA_DRAG_BOX_SELECTOR = [
  COVER_REGION_SELECTOR,
  NO_EDITOR_DRAG_BOX_SELECTOR,
  '.wiki-link-expanded[data-wiki-link-expanded]',
].join(', ');
export const MARKDOWN_BLANK_LINE_SELECTOR = [
  "[data-type='html-block'][data-value='<!--vlaina-markdown-blank-line-->']",
  "[data-type='html-block'][data-value='<!--vlaina-rendered-html-boundary-blank-line-->']",
].join(', ');
export const TEXT_BLOCK_SURFACE_SELECTOR = [
  'p',
  'li',
  'blockquote',
  '.frontmatter-block-container',
  MARKDOWN_BLANK_LINE_SELECTOR,
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
].join(', ');
export const STRUCTURED_BLOCK_SELECTOR = [
  'table',
  'pre',
  '.frontmatter-block-container',
  `[data-type]:not(:is(${MARKDOWN_BLANK_LINE_SELECTOR}))`,
  '[data-node-view-root]',
].join(', ');

export function getScrollRoot(element: HTMLElement | null): HTMLElement | null {
  if (!element) return null;
  return element.closest(SCROLL_ROOT_SELECTOR) as HTMLElement | null;
}

export function getElementFromEventTarget(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

export function isPointInsideElementClientRects(element: Element, clientX: number, clientY: number): boolean {
  const rects = element.getClientRects();
  for (let index = 0; index < rects.length; index += 1) {
    const rect = rects.item?.(index) ?? rects[index];
    if (!rect || rect.width <= 0 || rect.height <= 0) continue;
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return true;
    }
  }
  return false;
}

export function isExternalBlockSelectionBlankTarget(target: HTMLElement): boolean {
  return target.closest(EXTERNAL_BLOCK_SELECTION_BLANK_ROOT_SELECTOR) instanceof HTMLElement;
}

export function isExternalBlockSelectionBlankExcludedTarget(target: HTMLElement): boolean {
  return target.closest(EXTERNAL_BLOCK_SELECTION_BLANK_EXCLUDED_SELECTOR) instanceof HTMLElement;
}

export function isSameEditorExternalBlankAreaTarget(
  view: EditorView,
  target: HTMLElement,
  editorScrollRoot: HTMLElement | null,
): boolean {
  if (!editorScrollRoot || getScrollRoot(target) !== editorScrollRoot) {
    return false;
  }
  if (target === editorScrollRoot) {
    return true;
  }

  const contentRoot = view.dom.closest(NOTE_CONTENT_ROOT_SELECTOR);
  return contentRoot instanceof HTMLElement && (
    target === contentRoot ||
    contentRoot.contains(target)
  );
}
