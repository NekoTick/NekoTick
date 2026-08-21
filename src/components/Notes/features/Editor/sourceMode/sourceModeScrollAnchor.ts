import {
  createTextareaOffsetMeasurer,
  findSourceOffsetAtTop,
} from './sourceModeTextareaGeometry';
import {
  getEditorPositionAtMarkdownOffset,
  getMarkdownOffsetAtEditorPosition,
  getRenderedMarkdownRuntime,
} from './sourceModeMarkdownPosition';

export interface MarkdownScrollAnchor {
  contextAfter: string;
  contextBefore: string;
  markdownLength: number;
  markdownOffset: number;
  viewportOffset: number;
}

type EditorMode = 'rendered' | 'source';

const ANCHOR_CONTEXT_LENGTH = 48;
const SOURCE_EDITOR_SELECTOR = '[data-note-source-editor="true"]';

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function createAnchor(
  markdown: string,
  markdownOffset: number,
  viewportOffset: number,
): MarkdownScrollAnchor {
  const offset = clamp(Math.round(markdownOffset), 0, markdown.length);
  return {
    contextAfter: markdown.slice(offset, offset + ANCHOR_CONTEXT_LENGTH),
    contextBefore: markdown.slice(Math.max(0, offset - ANCHOR_CONTEXT_LENGTH), offset),
    markdownLength: markdown.length,
    markdownOffset: offset,
    viewportOffset,
  };
}

function findClosestContext(
  markdown: string,
  context: string,
  expectedOffset: number,
  offsetWithinContext: number,
): number | null {
  if (!context) return null;

  let closestOffset: number | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  let searchFrom = 0;
  while (searchFrom <= markdown.length) {
    const match = markdown.indexOf(context, searchFrom);
    if (match < 0) break;
    const candidate = match + offsetWithinContext;
    const distance = Math.abs(candidate - expectedOffset);
    if (distance < closestDistance) {
      closestOffset = candidate;
      closestDistance = distance;
    }
    searchFrom = match + 1;
  }
  return closestOffset;
}

function resolveAnchorOffset(anchor: MarkdownScrollAnchor, markdown: string): number {
  const expectedOffset = anchor.markdownLength > 0
    ? Math.round((anchor.markdownOffset / anchor.markdownLength) * markdown.length)
    : 0;
  const combinedContext = anchor.contextBefore + anchor.contextAfter;
  const combinedMatch = findClosestContext(
    markdown,
    combinedContext,
    expectedOffset,
    anchor.contextBefore.length,
  );
  if (combinedMatch !== null) return combinedMatch;

  const beforeMatch = findClosestContext(
    markdown,
    anchor.contextBefore,
    expectedOffset,
    anchor.contextBefore.length,
  );
  if (beforeMatch !== null) return beforeMatch;

  const afterMatch = findClosestContext(markdown, anchor.contextAfter, expectedOffset, 0);
  return clamp(afterMatch ?? expectedOffset, 0, markdown.length);
}

function captureRenderedAnchor(scrollRoot: HTMLElement): MarkdownScrollAnchor | null {
  const runtime = getRenderedMarkdownRuntime();
  if (!runtime || !scrollRoot.contains(runtime.view.dom)) return null;

  const rootRect = scrollRoot.getBoundingClientRect();
  const editorRect = runtime.view.dom.getBoundingClientRect();
  if (editorRect.width <= 0 || editorRect.height <= 0) return null;
  const top = clamp(rootRect.top + 1, editorRect.top + 1, editorRect.bottom - 1);
  const left = clamp(editorRect.left + 24, editorRect.left + 1, editorRect.right - 1);
  const position = runtime.view.posAtCoords({ left, top })?.pos;
  if (position === undefined) return null;

  const coordinates = runtime.view.coordsAtPos(position);
  const markdownOffset = getMarkdownOffsetAtEditorPosition(runtime, position);
  return createAnchor(runtime.mapping.markdown, markdownOffset, coordinates.top - rootRect.top);
}

function captureSourceAnchor(scrollRoot: HTMLElement): MarkdownScrollAnchor | null {
  const textarea = scrollRoot.querySelector<HTMLTextAreaElement>(SOURCE_EDITOR_SELECTOR);
  if (!textarea || textarea.getBoundingClientRect().width <= 0) return null;
  const rootRect = scrollRoot.getBoundingClientRect();
  const textareaRect = textarea.getBoundingClientRect();
  const sourcePosition = findSourceOffsetAtTop(textarea, rootRect.top - textareaRect.top);
  return createAnchor(
    textarea.value,
    sourcePosition.offset,
    textareaRect.top + sourcePosition.top - rootRect.top,
  );
}

function setScrollTop(scrollRoot: HTMLElement, nextScrollTop: number): void {
  const maxScrollTop = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
  scrollRoot.scrollTop = clamp(nextScrollTop, 0, maxScrollTop);
}

function restoreRenderedAnchor(scrollRoot: HTMLElement, anchor: MarkdownScrollAnchor): boolean {
  const runtime = getRenderedMarkdownRuntime();
  if (!runtime || !scrollRoot.contains(runtime.view.dom)) return false;
  const markdownOffset = resolveAnchorOffset(anchor, runtime.mapping.markdown);
  const position = getEditorPositionAtMarkdownOffset(runtime, markdownOffset);
  const coordinates = runtime.view.coordsAtPos(Math.round(position));
  const rootTop = scrollRoot.getBoundingClientRect().top;
  setScrollTop(scrollRoot, scrollRoot.scrollTop + coordinates.top - rootTop - anchor.viewportOffset);
  return true;
}

function restoreSourceAnchor(scrollRoot: HTMLElement, anchor: MarkdownScrollAnchor): boolean {
  const textarea = scrollRoot.querySelector<HTMLTextAreaElement>(SOURCE_EDITOR_SELECTOR);
  if (!textarea || textarea.getBoundingClientRect().width <= 0) return false;
  const markdownOffset = resolveAnchorOffset(anchor, textarea.value);
  const measurer = createTextareaOffsetMeasurer(textarea);
  try {
    const offsetTop = measurer.measure(markdownOffset);
    const rootTop = scrollRoot.getBoundingClientRect().top;
    const textareaTop = textarea.getBoundingClientRect().top;
    setScrollTop(scrollRoot, scrollRoot.scrollTop + textareaTop + offsetTop - rootTop - anchor.viewportOffset);
    return true;
  } finally {
    measurer.remove();
  }
}

export function captureSourceModeScrollAnchor(
  scrollRoot: HTMLElement,
  mode: EditorMode,
): MarkdownScrollAnchor | null {
  try {
    return mode === 'source'
      ? captureSourceAnchor(scrollRoot)
      : captureRenderedAnchor(scrollRoot);
  } catch {
    return null;
  }
}

export function restoreSourceModeScrollAnchor(
  scrollRoot: HTMLElement,
  mode: EditorMode,
  anchor: MarkdownScrollAnchor,
): boolean {
  try {
    return mode === 'source'
      ? restoreSourceAnchor(scrollRoot, anchor)
      : restoreRenderedAnchor(scrollRoot, anchor);
  } catch {
    return false;
  }
}
