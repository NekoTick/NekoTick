import type { EditorView } from '@milkdown/kit/prose/view';
import {
  createOutlineHeadingId,
  getHeadingLevelFromTagName,
  readBoundedHeadingText,
} from '../../Sidebar/Outline/outlineUtils';
import { previewStyleState } from '../plugins/floating-toolbar/previewStyleState';
import { MAX_BLOCK_POSITION_SNAPSHOT_BLOCKS } from './editorBlockPositionConstants';
import {
  collectTopLevelBlockRanges,
  createBlockIndex,
  resolveDocumentBottom,
  resolveDocumentLeft,
  resolveDocumentRight,
  resolveDocumentTop,
} from './editorBlockPositionGeometry';
import { collectDocumentHeadingMetadata } from './editorHeadingPositionCollection';
import type {
  EditorBlockPositionEntry,
  EditorBlockPositionSnapshot,
  EditorHeadingPositionEntry,
} from './editorBlockPositionTypes';

export function createPreviewSnapshot(
  view: EditorView,
  previewRoot: HTMLElement,
  version: number,
): EditorBlockPositionSnapshot | null {
  if (!previewRoot.isConnected) return null;

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
    index < previewRoot.children.length
      && index < topLevelRanges.length
      && blocks.length < MAX_BLOCK_POSITION_SNAPSHOT_BLOCKS;
    index += 1
  ) {
    const element = previewRoot.children.item(index);
    const range = topLevelRanges[index];
    if (!(element instanceof HTMLElement) || !range) continue;

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
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

    if (headingLevel && headingId && headingText) {
      headings.push({
        id: headingId,
        level: headingLevel,
        text: headingText,
        from: range.from,
        to: range.to,
        element,
        hasExactGeometry: true,
        top: documentTop,
        bottom: documentBottom,
      });
    }
  }

  const previewDoc = previewStyleState.previewOverlay?.node === previewRoot
    && previewStyleState.previewOverlay.viewDom === view.dom
    ? previewStyleState.previewOverlay.previewState.doc
    : view.state.doc;
  const documentHeadings = collectDocumentHeadingMetadata(previewDoc);
  if (documentHeadings) {
    const previewHeadings = previewRoot.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6');
    const pairedHeadings: EditorHeadingPositionEntry[] = [];
    for (
      let index = 0;
      index < previewHeadings.length
        && index < documentHeadings.length
        && pairedHeadings.length < MAX_BLOCK_POSITION_SNAPSHOT_BLOCKS;
      index += 1
    ) {
      const element = previewHeadings.item(index);
      const documentHeading = documentHeadings[index];
      if (!element || !documentHeading) continue;
      const rect = element.getBoundingClientRect();
      const level = getHeadingLevelFromTagName(element.tagName) ?? documentHeading.level;
      const text = readBoundedHeadingText(element);
      pairedHeadings.push({
        id: createOutlineHeadingId(pairedHeadings.length, level, text),
        level,
        text,
        from: documentHeading.from,
        to: documentHeading.to,
        element,
        hasExactGeometry: rect.width > 0 && rect.height > 0,
        top: resolveDocumentTop(rect, scrollRootTop, scrollTop),
        bottom: resolveDocumentBottom(rect, scrollRootTop, scrollTop),
      });
    }
    headings.splice(0, headings.length, ...pairedHeadings);
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
