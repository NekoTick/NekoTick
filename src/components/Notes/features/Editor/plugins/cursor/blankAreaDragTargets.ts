import type { EditorView } from '@milkdown/kit/prose/view';
import { isClickBelowLastBlock } from './endBlankClickUtils';
import { type BlockDragStartZone } from './blockDragSession';
import {
  getInteractionCachedEditorBlockTargetsNearY,
} from '../../utils/editorBlockPositionCache';
import {
  INTERACTIVE_SELECTOR,
  resolveTextLinePointerHit,
  type CachedTextLinePointerHitResult,
  type TextLinePointerHit,
} from './blankAreaTextLineHit';
import {
  COVER_REGION_SELECTOR,
  IGNORED_BLANK_AREA_DRAG_BOX_SELECTOR,
  MARKDOWN_BLANK_LINE_SELECTOR,
  NOTES_SIDEBAR_SCROLL_ROOT_SELECTOR,
  STRUCTURED_BLOCK_SELECTOR,
  TEXT_BLOCK_SURFACE_SELECTOR,
  getElementFromEventTarget,
  getScrollRoot,
  isExternalBlockSelectionBlankExcludedTarget,
  isExternalBlockSelectionBlankTarget,
  isPointInsideElementClientRects,
  isSameEditorExternalBlankAreaTarget,
} from './blankAreaDragTargetDom';
import {
  isExternalChatReadableTextTarget,
  isPointInSameEditorLayoutBlankArea,
} from './blankAreaExternalTargets';
import { resolveTaskCheckboxTarget } from '../task-list/taskCheckboxHitArea';

const pointerEventTextLineHits = new WeakMap<MouseEvent, {
  editor: HTMLElement;
  hit: TextLinePointerHit | null;
}>();

export {
  MAX_BLANK_AREA_TEXT_HIT_CHARS,
  MAX_BLANK_AREA_TEXT_HIT_NODES,
  MAX_BLANK_AREA_TEXT_HIT_RECTS,
  isPointInTrailingTextSelectionGutter,
  resolveTextLinePointerHit,
} from './blankAreaTextLineHit';

export function isSameEditorBlankAreaInteractionTarget(view: EditorView, target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  if (view.dom.contains(target)) return true;

  const targetElement = target instanceof HTMLElement ? target : target.parentElement;
  if (!targetElement) return false;

  return isSameEditorExternalBlankAreaTarget(
    view,
    targetElement,
    getScrollRoot(view.dom),
  );
}

export function isIgnoredBlankAreaDragBoxTarget(target: EventTarget | null): boolean {
  return !!getElementFromEventTarget(target)?.closest(IGNORED_BLANK_AREA_DRAG_BOX_SELECTOR);
}

export function isPointInsideIgnoredBlankAreaDragBoxElement(view: EditorView, event: MouseEvent): boolean {
  if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return false;
  if (!isSameEditorBlankAreaInteractionTarget(view, event.target)) return false;

  const targetElement = getElementFromEventTarget(event.target);
  if (
    targetElement &&
    targetElement !== view.dom &&
    view.dom.contains(targetElement) &&
    targetElement.closest(TEXT_BLOCK_SURFACE_SELECTOR)
  ) {
    return false;
  }

  const editorScrollRoot = getScrollRoot(view.dom);
  if (!editorScrollRoot) return false;

  const ignoredElements = editorScrollRoot.querySelectorAll(IGNORED_BLANK_AREA_DRAG_BOX_SELECTOR);
  for (let index = 0; index < ignoredElements.length; index += 1) {
    const element = ignoredElements[index];
    if (!element || element.contains(view.dom)) continue;
    if (isPointInsideElementClientRects(element, event.clientX, event.clientY)) {
      return true;
    }
  }
  return false;
}

function isPointNearBlockY(
  rect: Pick<DOMRect, 'top' | 'bottom' | 'height'>,
  clientY: number,
): boolean {
  if (rect.height <= 0) return false;
  const verticalSlack = Math.max(6, Math.min(18, rect.height * 0.25));
  return clientY >= rect.top - verticalSlack && clientY <= rect.bottom + verticalSlack;
}

function resolveCachedTextLinePointerHit(
  view: EditorView,
  scrollRoot: HTMLElement | null,
  clientX: number,
  clientY: number,
): CachedTextLinePointerHitResult {
  const targets = getInteractionCachedEditorBlockTargetsNearY(view, clientY, isPointNearBlockY);
  if (!targets) return { checked: false, hit: null };

  for (const target of targets) {
    if (getScrollRoot(target.element) !== scrollRoot) continue;
    const hit = resolveTextLinePointerHit(target.element, clientX, clientY);
    if (hit) {
      return { checked: true, hit };
    }
  }
  return { checked: true, hit: null };
}

export function resolveTargetTextLinePointerHit(
  view: EditorView,
  target: HTMLElement,
  clientX: number,
  clientY: number,
): TextLinePointerHit | null {
  const textBlock = target.closest(TEXT_BLOCK_SURFACE_SELECTOR);
  if (textBlock instanceof HTMLElement && view.dom.contains(textBlock)) {
    return resolveTextLinePointerHit(textBlock, clientX, clientY);
  }

  return resolveTextLinePointerHit(view.dom, clientX, clientY);
}

export function resolvePointerEventTargetTextLineHit(
  view: EditorView,
  event: MouseEvent,
): TextLinePointerHit | null {
  const cached = pointerEventTextLineHits.get(event);
  if (cached?.editor === view.dom) {
    return cached.hit;
  }

  const target = getElementFromEventTarget(event.target);
  const hit = target instanceof HTMLElement
    ? resolveTargetTextLinePointerHit(view, target, event.clientX, event.clientY)
    : null;
  pointerEventTextLineHits.set(event, { editor: view.dom, hit });
  return hit;
}

function resolveSameEditorExternalTextLinePointerHit(
  view: EditorView,
  target: HTMLElement,
  editorScrollRoot: HTMLElement | null,
  clientX: number,
  clientY: number,
): TextLinePointerHit | null {
  const targetScrollRoot = getScrollRoot(target);
  if (!editorScrollRoot || !targetScrollRoot || editorScrollRoot !== targetScrollRoot) {
    return null;
  }

  const cachedTextLineHit = resolveCachedTextLinePointerHit(
    view,
    editorScrollRoot,
    clientX,
    clientY,
  );
  return cachedTextLineHit.checked
    ? cachedTextLineHit.hit
    : resolveTextLinePointerHit(view.dom, clientX, clientY);
}

export function isExternalTextLineGutterNativeSelectionTarget(view: EditorView, event: MouseEvent): boolean {
  if (!(event.target instanceof HTMLElement)) return false;
  const target = event.target;
  if (view.dom.contains(target)) return false;
  if (!isSameEditorBlankAreaInteractionTarget(view, target)) return false;
  if (target.closest(COVER_REGION_SELECTOR)) return false;
  if (target.closest(INTERACTIVE_SELECTOR)) return false;

  const hit = resolveSameEditorExternalTextLinePointerHit(
    view,
    target,
    getScrollRoot(view.dom),
    event.clientX,
    event.clientY,
  );
  return (hit?.type === 'gutter' && hit.edge === 'trailing')
    || hit?.type === 'measurement-limit';
}

function isTextBlockBlankSurfaceTarget(view: EditorView, target: HTMLElement): boolean {
  if (target === view.dom) return true;

  const textBlock = target.closest(TEXT_BLOCK_SURFACE_SELECTOR);
  if (!textBlock || !view.dom.contains(textBlock)) return false;

  const structuredBlock = target.closest(STRUCTURED_BLOCK_SELECTOR);
  return !structuredBlock || structuredBlock === textBlock;
}

function isNativeEditableEmptyTextBlockTarget(view: EditorView, target: HTMLElement): boolean {
  const textBlock = target.closest(TEXT_BLOCK_SURFACE_SELECTOR);
  if (!(textBlock instanceof HTMLElement) || !view.dom.contains(textBlock)) return false;
  if (textBlock.matches(MARKDOWN_BLANK_LINE_SELECTOR)) return false;

  const structuredBlock = target.closest(STRUCTURED_BLOCK_SELECTOR);
  if (structuredBlock && structuredBlock !== textBlock) return false;

  const text = (textBlock.textContent ?? '').replace(/[\u200B\u200C\u2800]/g, '').trim();
  if (text.length > 0) return false;

  return textBlock.matches('p, li, blockquote, h1, h2, h3, h4, h5, h6');
}

export function isNativeTextSelectionHit(hit: TextLinePointerHit | null): boolean {
  return hit?.type === 'content'
    || hit?.type === 'measurement-limit'
    || (hit?.type === 'gutter' && hit.edge === 'trailing');
}

export function resolveBlankAreaDragStartZone(view: EditorView, event: MouseEvent): BlockDragStartZone | null {
  if (!(event.target instanceof HTMLElement)) return null;
  const target = event.target;
  if (
    view.dom.contains(target) &&
    resolveTaskCheckboxTarget(view.dom, target, event.clientX, event.clientY)
  ) {
    return null;
  }

  const editorScrollRoot = getScrollRoot(view.dom);
  const targetScrollRoot = getScrollRoot(target);
  const isSameEditorScrollRoot = !!editorScrollRoot && !!targetScrollRoot && editorScrollRoot === targetScrollRoot;
  const isSidebarTarget = Boolean(target.closest(NOTES_SIDEBAR_SCROLL_ROOT_SELECTOR));
  const isExplicitExternalBlankTarget = isExternalBlockSelectionBlankTarget(target);
  if (isSidebarTarget && !isExplicitExternalBlankTarget) return null;
  const isSameEditorBlankAreaStart = isSameEditorScrollRoot
    && (
      view.dom.contains(target) ||
      isSameEditorExternalBlankAreaTarget(view, target, editorScrollRoot) ||
      isPointInSameEditorLayoutBlankArea(view, target, editorScrollRoot, event.clientY)
    );
  if (isExplicitExternalBlankTarget) {
    if (target.closest(INTERACTIVE_SELECTOR)) return null;
    if (isExternalBlockSelectionBlankExcludedTarget(target)) return null;
    if (isExternalChatReadableTextTarget(target, event.clientX, event.clientY)) return null;
    return 'external-sidebar-blank';
  }
  if (!isSameEditorBlankAreaStart) return null;

  if (target.closest(COVER_REGION_SELECTOR)) return null;
  if (target.closest(INTERACTIVE_SELECTOR)) return null;

  if (view.dom.contains(target)) {
    if (target === view.dom && view.dom.childElementCount === 0) {
      return 'outside-editor';
    }

    const targetTextBlock = target.closest(TEXT_BLOCK_SURFACE_SELECTOR);
    if (targetTextBlock instanceof HTMLElement && view.dom.contains(targetTextBlock)) {
      const textLineHit = resolvePointerEventTargetTextLineHit(view, event);
      const isFrontmatterGutterHit = targetTextBlock.matches('.frontmatter-block-container')
        && textLineHit?.type === 'gutter';
      if (isNativeTextSelectionHit(textLineHit) && !isFrontmatterGutterHit) {
        return null;
      }
      if (isNativeEditableEmptyTextBlockTarget(view, target)) {
        return null;
      }
      return isTextBlockBlankSurfaceTarget(view, target) ? 'outside-editor' : null;
    }

    const cachedTextLineHit = resolveCachedTextLinePointerHit(
      view,
      editorScrollRoot,
      event.clientX,
      event.clientY,
    );
    const textLineHit = cachedTextLineHit.checked
      ? cachedTextLineHit.hit
      : resolveTargetTextLinePointerHit(view, target, event.clientX, event.clientY);

    if (isNativeTextSelectionHit(textLineHit)) {
      return null;
    }
    if (isNativeEditableEmptyTextBlockTarget(view, target)) {
      return null;
    }
    if (target === view.dom && isClickBelowLastBlock(view.dom, event.clientY)) {
      return 'below-last-block';
    }
    if (isTextBlockBlankSurfaceTarget(view, target)) {
      return 'outside-editor';
    }
    return null;
  }

  const externalTextLineHit = isSameEditorScrollRoot
    ? resolveSameEditorExternalTextLinePointerHit(
      view,
      target,
      editorScrollRoot,
      event.clientX,
      event.clientY,
    )
    : null;
  if (isNativeTextSelectionHit(externalTextLineHit)) {
    return null;
  }

  return isSameEditorBlankAreaStart ? 'outside-editor' : null;
}
