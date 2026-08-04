import type { EditorView } from '@milkdown/kit/prose/view';
import { collectSelectableBlockTargets } from '../plugins/cursor/blockUnitResolver';
import {
  createOutlineHeadingId,
  getHeadingLevelFromTagName,
  readBoundedHeadingText,
} from '../../Sidebar/Outline/outlineUtils';
import {
  MAX_BLOCK_POSITION_SNAPSHOT_BLOCKS,
  TOOLBAR_PREVIEW_HIDDEN_ATTRIBUTE,
  TOOLBAR_PREVIEW_OVERLAY_CLASS,
} from './editorBlockPositionConstants';
import {
  collectTopLevelBlockRanges,
  createBlockIndex,
  resolveDocumentBottom,
  resolveDocumentLeft,
  resolveDocumentRight,
  resolveDocumentTop,
} from './editorBlockPositionGeometry';
import type {
  EditorBlockPositionEntry,
  EditorBlockPositionSnapshot,
  EditorHeadingPositionEntry,
} from './editorBlockPositionTypes';

export function isEditorHiddenByToolbarPreview(view: Pick<EditorView, 'dom'>): boolean {
  return view.dom instanceof HTMLElement && view.dom.getAttribute(TOOLBAR_PREVIEW_HIDDEN_ATTRIBUTE) === 'true';
}

export function resolveToolbarPreviewRoot(view: Pick<EditorView, 'dom'>): HTMLElement | null {
  if (!isEditorHiddenByToolbarPreview(view)) {
    return null;
  }

  const previous = view.dom.previousElementSibling;
  if (previous instanceof HTMLElement && previous.classList.contains(TOOLBAR_PREVIEW_OVERLAY_CLASS)) {
    return previous;
  }

  const parent = view.dom.parentElement;
  return parent?.querySelector<HTMLElement>(`:scope > .${TOOLBAR_PREVIEW_OVERLAY_CLASS}`) ?? null;
}

export function isTooLargeForBlockPositionSnapshot(doc: EditorView['state']['doc']): boolean {
  const childCount = (doc as { childCount?: unknown }).childCount;
  return typeof childCount === 'number' && childCount > MAX_BLOCK_POSITION_SNAPSHOT_BLOCKS;
}

export function createEmptySnapshot(
  view: EditorView,
  version: number,
): EditorBlockPositionSnapshot | null {
  const editorRoot = view.dom;
  if (!editorRoot.isConnected) {
    return null;
  }

  const scrollRoot = view.dom.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
  return {
    version,
    view,
    doc: view.state.doc,
    editorRoot,
    scrollRoot,
    scrollLeft: scrollRoot?.scrollLeft ?? 0,
    scrollTop: scrollRoot?.scrollTop ?? 0,
    geometryValidationScrollLeft: scrollRoot?.scrollLeft ?? 0,
    geometryValidationScrollTop: scrollRoot?.scrollTop ?? 0,
    blocks: [],
    blockIndex: new Map(),
    headings: [],
  };
}

function createPreviewSnapshot(
  view: EditorView,
  previewRoot: HTMLElement,
  version: number,
): EditorBlockPositionSnapshot | null {
  if (!previewRoot.isConnected) {
    return null;
  }

  const scrollRoot = view.dom.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
  const scrollLeft = scrollRoot?.scrollLeft ?? 0;
  const scrollTop = scrollRoot?.scrollTop ?? 0;
  const scrollRootRect = scrollRoot?.getBoundingClientRect() ?? null;
  const scrollRootLeft = scrollRootRect?.left ?? null;
  const scrollRootTop = scrollRootRect?.top ?? null;
  const topLevelRanges = collectTopLevelBlockRanges(view.state.doc);
  const blocks: EditorBlockPositionEntry[] = [];
  const headings: EditorHeadingPositionEntry[] = [];

  for (
    let index = 0;
    index < previewRoot.children.length && index < topLevelRanges.length && blocks.length < MAX_BLOCK_POSITION_SNAPSHOT_BLOCKS;
    index += 1
  ) {
    const element = previewRoot.children.item(index);
    if (!(element instanceof HTMLElement)) {
      continue;
    }

    const range = topLevelRanges[index];
    if (!range) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }

    const tagName = element.tagName.toUpperCase();
    const headingLevel = getHeadingLevelFromTagName(tagName);
    const headingText = headingLevel ? readBoundedHeadingText(element) : null;
    const documentLeft = resolveDocumentLeft(rect, scrollRootLeft, scrollLeft);
    const documentRight = resolveDocumentRight(rect, scrollRootLeft, scrollLeft);
    const documentTop = resolveDocumentTop(rect, scrollRootTop, scrollTop);
    const documentBottom = resolveDocumentBottom(rect, scrollRootTop, scrollTop);
    const headingId = headingLevel
      ? createOutlineHeadingId(headings.length, headingLevel, headingText ?? '')
      : null;

    blocks.push({
      from: range.from,
      to: range.to,
      element,
      rect,
      documentLeft,
      documentRight,
      documentTop,
      documentBottom,
      tagName,
      headingLevel,
      headingId,
      headingText,
    });

    if (!headingLevel || !headingId || !headingText) {
      continue;
    }

    headings.push({
      id: headingId,
      level: headingLevel,
      text: headingText,
      from: range.from,
      to: range.to,
      element,
      top: documentTop,
      bottom: documentBottom,
    });
  }

  return {
    version,
    view,
    doc: view.state.doc,
    editorRoot: view.dom,
    editorRect: previewRoot.getBoundingClientRect(),
    scrollRoot,
    scrollRootRect,
    scrollLeft,
    scrollTop,
    geometryValidationScrollLeft: scrollLeft,
    geometryValidationScrollTop: scrollTop,
    blocks,
    blockIndex: createBlockIndex(blocks),
    headings,
  };
}

export function createSnapshot(
  view: EditorView,
  nextVersion: () => number,
): EditorBlockPositionSnapshot | null {
  const editorRoot = view.dom;
  if (!editorRoot.isConnected) {
    return null;
  }

  if (isTooLargeForBlockPositionSnapshot(view.state.doc)) {
    return createEmptySnapshot(view, nextVersion());
  }

  const previewRoot = resolveToolbarPreviewRoot(view);
  if (previewRoot) {
    return createPreviewSnapshot(view, previewRoot, nextVersion());
  }

  const scrollRoot = view.dom.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
  const scrollLeft = scrollRoot?.scrollLeft ?? 0;
  const scrollTop = scrollRoot?.scrollTop ?? 0;
  const scrollRootRect = scrollRoot?.getBoundingClientRect() ?? null;
  const editorRect = editorRoot.getBoundingClientRect();
  const scrollRootLeft = scrollRootRect?.left ?? null;
  const scrollRootTop = scrollRootRect?.top ?? null;
  const targets = collectSelectableBlockTargets(view);
  const blocks: EditorBlockPositionEntry[] = [];
  const headings: EditorHeadingPositionEntry[] = [];

  targets.forEach((target) => {
    const tagName = target.element.tagName.toUpperCase();
    const headingMatch = /^H([1-6])$/.exec(tagName);
    const headingLevel = headingMatch ? Number.parseInt(headingMatch[1], 10) : null;
    const headingText = headingLevel ? readBoundedHeadingText(target.element) : null;
    const documentLeft = resolveDocumentLeft(target.rect, scrollRootLeft, scrollLeft);
    const documentRight = resolveDocumentRight(target.rect, scrollRootLeft, scrollLeft);
    const documentTop = resolveDocumentTop(target.rect, scrollRootTop, scrollTop);
    const documentBottom = resolveDocumentBottom(target.rect, scrollRootTop, scrollTop);
    const headingId = headingLevel
      ? createOutlineHeadingId(headings.length, headingLevel, headingText ?? '')
      : null;

    blocks.push({
      from: target.range.from,
      to: target.range.to,
      element: target.element,
      rect: target.rect,
      documentLeft,
      documentRight,
      documentTop,
      documentBottom,
      tagName,
      headingLevel,
      headingId,
      headingText,
    });

    if (!headingLevel || !headingId || !headingText) {
      return;
    }

    headings.push({
      id: headingId,
      level: headingLevel,
      text: headingText,
      from: target.range.from,
      to: target.range.to,
      element: target.element,
      top: documentTop,
      bottom: documentBottom,
    });
  });

  return {
    version: nextVersion(),
    view,
    doc: view.state.doc,
    editorRoot,
    editorRect,
    scrollRoot,
    scrollRootRect,
    scrollLeft,
    scrollTop,
    geometryValidationScrollLeft: scrollLeft,
    geometryValidationScrollTop: scrollTop,
    blocks,
    blockIndex: createBlockIndex(blocks),
    headings,
  };
}
