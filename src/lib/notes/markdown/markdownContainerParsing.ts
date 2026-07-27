import { getMarkdownBlockContentStartOffset } from '@/lib/markdown/markdownHtmlBlockClassification';
import {
  BLOCKQUOTE_CONTAINER_PREFIX_PATTERN,
  LIST_CONTAINER_PREFIX_PATTERN,
  type MarkdownFenceLine,
} from './markdownSerializationShared';

export interface MarkdownContainerState {
  blockquoteDepth: number;
  containerIndent: number;
}

interface MarkdownContainerParseOptions {
  blockquoteDepth?: number;
  maxIndent?: number;
  minIndent?: number;
  stripListMarker?: boolean;
}

export interface MarkdownContainerMathFenceLine {
  blockquoteDepth: number;
  containerIndent: number;
  continuationPrefix: string;
  kind: 'bracket-close' | 'bracket-open' | 'dollar';
  length: number;
  markerStart: number;
}

export interface MarkdownContainerLinePrefix {
  blockquoteDepth: number;
  containerIndent: number;
  continuationPrefix: string;
  markerStart: number;
}

export function parseMarkdownContainerFenceLine(
  line: string,
  options: MarkdownContainerParseOptions = {},
): MarkdownFenceLine | null {
  const container = parseMarkdownContainerLinePrefix(line, options);
  if (!container) return null;
  const { containerIndent, markerStart } = container;

  const marker = line[markerStart];
  if (marker !== '`' && marker !== '~') return null;

  let length = 0;
  while (line[markerStart + length] === marker) length += 1;
  if (length < 3) return null;

  return {
    blockquoteDepth: container.blockquoteDepth,
    containerIndent,
    infoStart: markerStart + length,
    length,
    marker,
  };
}

export function parseMarkdownContainerMathFenceLine(
  line: string,
  options: MarkdownContainerParseOptions = {},
): MarkdownContainerMathFenceLine | null {
  const container = parseMarkdownContainerLinePrefix(line, options);
  if (!container) return null;

  const marker = line.slice(container.markerStart).trimEnd();
  let dollarLength = 0;
  while (marker[dollarLength] === '$') dollarLength += 1;
  if (dollarLength >= 2 && dollarLength === marker.length) {
    return { ...container, kind: 'dollar', length: dollarLength };
  }
  if (marker === '\\[') return { ...container, kind: 'bracket-open', length: 2 };
  if (marker === '\\]') return { ...container, kind: 'bracket-close', length: 2 };
  return null;
}

export function parseMarkdownContainerLinePrefix(
  line: string,
  options: MarkdownContainerParseOptions = {},
): MarkdownContainerLinePrefix | null {
  const blockquoteOffset = getMarkdownBlockContentStartOffset(line);
  const blockquotePrefix = line.slice(0, blockquoteOffset);
  const blockContent = line.slice(blockquoteOffset);
  const listPrefix = options.stripListMarker === false
    ? ''
    : LIST_CONTAINER_PREFIX_PATTERN.exec(blockContent)?.[0] ?? '';
  let cursor = blockquoteOffset + listPrefix.length;
  let indentationColumns = 0;

  while (line[cursor] === ' ' || line[cursor] === '\t') {
    indentationColumns = line[cursor] === '\t'
      ? indentationColumns + 4 - (indentationColumns % 4)
      : indentationColumns + 1;
    cursor += 1;
  }
  const blockquoteDepth = countMarkdownBlockquoteMarkers(blockquotePrefix);
  if (options.blockquoteDepth !== undefined && blockquoteDepth !== options.blockquoteDepth) {
    return null;
  }
  if (
    indentationColumns < (options.minIndent ?? 0)
    || indentationColumns > (options.maxIndent ?? 3)
  ) return null;
  const containerIndent = getMarkdownColumns(listPrefix);
  return {
    blockquoteDepth,
    containerIndent,
    continuationPrefix: listPrefix
      ? `${blockquotePrefix}${' '.repeat(containerIndent + indentationColumns)}`
      : line.slice(0, cursor),
    markerStart: cursor,
  };
}

export function isMarkdownLineInContainer(
  line: string,
  state: MarkdownContainerState,
): boolean {
  let offset = 0;
  for (let depth = 0; depth < state.blockquoteDepth; depth += 1) {
    const prefix = BLOCKQUOTE_CONTAINER_PREFIX_PATTERN.exec(line.slice(offset))?.[0];
    if (!prefix) return false;
    offset += prefix.length;
  }

  const content = line.slice(offset);
  if (state.containerIndent === 0 || content.trim() === '') return true;
  return getLeadingMarkdownColumns(content) >= state.containerIndent;
}

export function getMarkdownContentInContainer(
  line: string,
  state: MarkdownContainerState,
): string | null {
  if (!isMarkdownLineInContainer(line, state)) return null;

  let offset = 0;
  for (let depth = 0; depth < state.blockquoteDepth; depth += 1) {
    offset += BLOCKQUOTE_CONTAINER_PREFIX_PATTERN.exec(line.slice(offset))?.[0].length ?? 0;
  }
  let columns = 0;
  while (offset < line.length && columns < state.containerIndent) {
    if (line[offset] === ' ') {
      columns += 1;
    } else if (line[offset] === '\t') {
      columns += 4 - (columns % 4);
    } else {
      break;
    }
    offset += 1;
  }
  return line.slice(offset);
}

export function parseMarkdownContainerFenceCloseLine(
  line: string,
  state: MarkdownContainerState & { marker: string; length: number },
): MarkdownFenceLine | null {
  if (!isMarkdownLineInContainer(line, state)) return null;
  const fence = parseMarkdownContainerFenceLine(line, {
    blockquoteDepth: state.blockquoteDepth,
    maxIndent: state.containerIndent + 3,
    minIndent: state.containerIndent,
    stripListMarker: false,
  });
  return fence
    && fence.marker === state.marker
    && fence.length >= state.length
    && line.slice(fence.infoStart).trim() === ''
    ? fence
    : null;
}

export function parseMarkdownContainerMathFenceLineInContainer(
  line: string,
  state: MarkdownContainerState,
): MarkdownContainerMathFenceLine | null {
  if (!isMarkdownLineInContainer(line, state)) return null;
  return parseMarkdownContainerMathFenceLine(line, {
    blockquoteDepth: state.blockquoteDepth,
    maxIndent: state.containerIndent + 3,
    minIndent: state.containerIndent,
    stripListMarker: false,
  });
}

export function isMarkdownContainerMathFenceCloseLine(
  line: string,
  state: MarkdownContainerState & { length: number; style: 'bracket' | 'dollar' },
): boolean {
  const fence = parseMarkdownContainerMathFenceLineInContainer(line, state);
  return state.style === 'dollar'
    ? fence?.kind === 'dollar' && fence.length >= state.length
    : fence?.kind === 'bracket-close';
}

function countMarkdownBlockquoteMarkers(prefix: string): number {
  let count = 0;
  for (const character of prefix) {
    if (character === '>') count += 1;
  }
  return count;
}

function getMarkdownColumns(value: string): number {
  let columns = 0;
  for (const character of value) {
    columns = character === '\t'
      ? columns + 4 - (columns % 4)
      : columns + 1;
  }
  return columns;
}

function getLeadingMarkdownColumns(value: string): number {
  let end = 0;
  while (value[end] === ' ' || value[end] === '\t') end += 1;
  return getMarkdownColumns(value.slice(0, end));
}
