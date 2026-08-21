import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { Serializer } from '@milkdown/kit/transformer';
import {
  getCurrentEditorView,
  getCurrentMarkdownSerializer,
} from '../utils/editorViewRegistry';

interface MarkdownPositionRange {
  markdownFrom: number;
  markdownTo: number;
  positionFrom: number;
  positionTo: number;
}

interface RenderedDocumentMapping {
  markdown: string;
  markdownRanges: Map<number, MarkdownPositionRange>;
  positionRanges: Array<Pick<MarkdownPositionRange, 'positionFrom' | 'positionTo'>>;
}

export interface RenderedMarkdownRuntime {
  mapping: RenderedDocumentMapping;
  serializer: Serializer;
  view: EditorView;
}

const renderedDocumentMappingCache = new WeakMap<ProseMirrorNode, RenderedDocumentMapping>();

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function findClosestOccurrence(markdown: string, value: string, expectedOffset: number): number | null {
  let closestOffset: number | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  let searchFrom = 0;
  while (searchFrom <= markdown.length) {
    const match = markdown.indexOf(value, searchFrom);
    if (match < 0) break;
    const distance = Math.abs(match - expectedOffset);
    if (distance < closestDistance) {
      closestOffset = match;
      closestDistance = distance;
    }
    searchFrom = match + 1;
  }
  return closestOffset;
}

function getRenderedDocumentMapping(
  doc: ProseMirrorNode,
  serializer: Serializer,
): RenderedDocumentMapping {
  const cached = renderedDocumentMappingCache.get(doc);
  if (cached) return cached;
  const positionRanges: RenderedDocumentMapping['positionRanges'] = [];
  doc.forEach((node, positionFrom) => {
    positionRanges.push({ positionFrom, positionTo: positionFrom + node.nodeSize });
  });
  const mapping = {
    markdown: serializer(doc),
    markdownRanges: new Map<number, MarkdownPositionRange>(),
    positionRanges,
  };
  renderedDocumentMappingCache.set(doc, mapping);
  return mapping;
}

function getMarkdownPositionRange(
  runtime: RenderedMarkdownRuntime,
  index: number,
): MarkdownPositionRange {
  const cached = runtime.mapping.markdownRanges.get(index);
  if (cached) return cached;
  const { doc } = runtime.view.state;
  const positionRange = runtime.mapping.positionRanges[index]!;
  const isolatedMarkdown = runtime.serializer(doc.copy(doc.content.cut(
    positionRange.positionFrom,
    positionRange.positionTo,
  ))).trim();
  const expectedOffset = Math.round(
    (positionRange.positionFrom / Math.max(1, doc.content.size)) * runtime.mapping.markdown.length,
  );
  const match = isolatedMarkdown
    ? findClosestOccurrence(runtime.mapping.markdown, isolatedMarkdown, expectedOffset)
    : null;
  const range = {
    markdownFrom: match ?? expectedOffset,
    markdownTo: match === null
      ? Math.round((positionRange.positionTo / Math.max(1, doc.content.size)) * runtime.mapping.markdown.length)
      : match + isolatedMarkdown.length,
    ...positionRange,
  };
  runtime.mapping.markdownRanges.set(index, range);
  return range;
}

function findPositionRangeIndex(
  positionRanges: RenderedDocumentMapping['positionRanges'],
  position: number,
): number {
  return positionRanges.findIndex(({ positionFrom, positionTo }) => (
    position >= positionFrom && position <= positionTo
  ));
}

function rangeDistance(range: MarkdownPositionRange, markdownOffset: number): number {
  return Math.min(
    Math.abs(markdownOffset - range.markdownFrom),
    Math.abs(markdownOffset - range.markdownTo),
  );
}

function findMarkdownRangeAtOffset(
  runtime: RenderedMarkdownRuntime,
  markdownOffset: number,
): MarkdownPositionRange | null {
  let low = 0;
  let high = runtime.mapping.positionRanges.length - 1;
  let closest: MarkdownPositionRange | null = null;
  while (low <= high) {
    const index = Math.floor((low + high) / 2);
    const range = getMarkdownPositionRange(runtime, index);
    if (!closest || rangeDistance(range, markdownOffset) < rangeDistance(closest, markdownOffset)) {
      closest = range;
    }
    if (markdownOffset < range.markdownFrom) high = index - 1;
    else if (markdownOffset > range.markdownTo) low = index + 1;
    else return range;
  }
  return closest;
}

export function getRenderedMarkdownRuntime(): RenderedMarkdownRuntime | null {
  const view = getCurrentEditorView();
  const serializer = getCurrentMarkdownSerializer();
  if (!view || !serializer) return null;
  return {
    mapping: getRenderedDocumentMapping(view.state.doc, serializer),
    serializer,
    view,
  };
}

export function getMarkdownOffsetAtEditorPosition(
  runtime: RenderedMarkdownRuntime,
  position: number,
): number {
  const rangeIndex = findPositionRangeIndex(runtime.mapping.positionRanges, position);
  const range = rangeIndex >= 0 ? getMarkdownPositionRange(runtime, rangeIndex) : null;
  const progress = range
    ? (position - range.positionFrom) / Math.max(1, range.positionTo - range.positionFrom)
    : position / Math.max(1, runtime.view.state.doc.content.size);
  return range
    ? range.markdownFrom + progress * (range.markdownTo - range.markdownFrom)
    : progress * runtime.mapping.markdown.length;
}

export function getEditorPositionAtMarkdownOffset(
  runtime: RenderedMarkdownRuntime,
  markdownOffset: number,
): number {
  const range = findMarkdownRangeAtOffset(runtime, markdownOffset);
  const progress = range
    ? (markdownOffset - range.markdownFrom) / Math.max(1, range.markdownTo - range.markdownFrom)
    : markdownOffset / Math.max(1, runtime.mapping.markdown.length);
  return range
    ? range.positionFrom + clamp(progress, 0, 1) * (range.positionTo - range.positionFrom)
    : progress * runtime.view.state.doc.content.size;
}
