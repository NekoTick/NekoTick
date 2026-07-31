import {
  collectNonCodeProtectedLineIndexes,
  isMarkdownLineInContainer,
  parseMarkdownContainerFenceCloseLine,
  parseMarkdownContainerFenceLine,
} from './markdownFenceProtectedLines';
import { isStableParseBoundaryBlankLine } from './markdownBlankLineBoundaries';

interface FenceBlock {
  close: string;
  closeIndex: number;
  info: string;
  key: string;
  open: string;
  openIndex: number;
}

interface CodeBlockReference {
  block: FenceBlock | null;
  indentation: string[] | null;
  info: string;
  key: string;
  openIndex: number;
  structuralBlankAfter: boolean;
}

const TIGHT_INDENTED_CODE_PREDECESSOR_PATTERNS = [
  /^(?: {0,3})#{1,6}(?:[ \t]+|$)/,
  /^(?: {0,3})(?:[-*_][ \t]*){3,}$/,
  /^(?: {0,3})(?:={2,}|-{2,})[ \t]*$/,
  /^(?: {0,3})(?:\$\$|\\\])[ \t]*$/,
  /^\s*\|.*\|[ \t]*$/,
  /^(?: {0,3})>.*/,
  /(?:-->|\?>|\]\]>)[ \t]*$/,
  /^(?: {0,3})<![A-Za-z][^>]*>[ \t]*$/,
  /^(?: {0,3})<\/[A-Za-z][A-Za-z0-9-]*\s*>[ \t]*$/,
] as const;

export function restoreFenceMarkerStyleFromReference(
  markdown: string,
  referenceMarkdown?: string,
): string {
  if (!referenceMarkdown || !markdown.includes('```')) return markdown;

  const referenceBlocks = collectCodeBlockReferences(
    referenceMarkdown.replace(/\r\n?/g, '\n').split('\n')
  );
  if (referenceBlocks.length === 0) return markdown;

  const referenceByKey = new Map<string, CodeBlockReference[]>();
  for (const block of referenceBlocks) {
    const blocks = referenceByKey.get(block.key) ?? [];
    blocks.push(block);
    referenceByKey.set(block.key, blocks);
  }

  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks = collectFenceBlocks(lines);
  const blocksByKey = new Map<string, FenceBlock[]>();
  for (const block of blocks) {
    const matches = blocksByKey.get(block.key) ?? [];
    matches.push(block);
    blocksByKey.set(block.key, matches);
  }
  let changed = false;
  const indentedReplacements: Array<{
    body: string[];
    closeIndex: number;
    openIndex: number;
    restoreStructuralBlankAfter: boolean;
  }> = [];

  for (const [key, references] of referenceByKey) {
    const candidates = blocksByKey.get(key) ?? [];
    for (const [reference, block] of matchCodeBlockReferences(references, candidates)) {
      if (!reference.block) {
        if (block.info || !reference.indentation) continue;
        const body = lines.slice(block.openIndex + 1, block.closeIndex).map((line, index) => {
          if (line.trim() === '') return '';
          const indentation = reference.indentation?.[index]
            || reference.indentation?.find(Boolean)
            || '    ';
          return `${indentation}${line}`;
        });
        indentedReplacements.push({
          body,
          closeIndex: block.closeIndex,
          openIndex: block.openIndex,
          restoreStructuralBlankAfter: reference.structuralBlankAfter
            && !hasStableBlankLineAfter(lines, block.closeIndex),
        });
        changed = true;
        continue;
      }

      if (lines[block.openIndex] !== reference.block.open) {
        lines[block.openIndex] = reference.block.open;
        changed = true;
      }
      if (lines[block.closeIndex] !== reference.block.close) {
        lines[block.closeIndex] = reference.block.close;
        changed = true;
      }
    }
  }

  for (const replacement of indentedReplacements.sort(
    (left, right) => right.openIndex - left.openIndex
  )) {
    lines.splice(
      replacement.openIndex,
      replacement.closeIndex - replacement.openIndex + 1,
      ...replacement.body,
      ...(replacement.restoreStructuralBlankAfter ? [''] : []),
    );
  }

  return changed ? lines.join('\n') : markdown;
}

function collectFenceBlocks(
  lines: readonly string[],
  nonCodeProtectedLines = collectNonCodeProtectedLineIndexes(lines),
): FenceBlock[] {
  const blocks: FenceBlock[] = [];
  let active: {
    blockquoteDepth: number;
    containerIndent: number;
    info: string;
    marker: string;
    length: number;
    open: string;
    openIndex: number;
  } | null = null;
  let bodyStart = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (nonCodeProtectedLines.has(index)) continue;

    if (active && !isMarkdownLineInContainer(line, active)) {
      active = null;
    }

    if (active) {
      if (parseMarkdownContainerFenceCloseLine(line, active)) {
        blocks.push({
          close: line,
          closeIndex: index,
          info: active.info,
          key: lines.slice(bodyStart, index).join('\n'),
          open: active.open,
          openIndex: active.openIndex,
        });
        active = null;
      }
      continue;
    }

    const fence = parseMarkdownContainerFenceLine(line);
    if (fence && (fence.marker !== '`' || line.indexOf('`', fence.infoStart) === -1)) {
      active = {
        blockquoteDepth: fence.blockquoteDepth,
        containerIndent: fence.containerIndent,
        marker: fence.marker,
        length: fence.length,
        info: line.slice(fence.infoStart).trim(),
        open: line,
        openIndex: index,
      };
      bodyStart = index + 1;
    }
  }

  return blocks;
}

function collectCodeBlockReferences(lines: readonly string[]): CodeBlockReference[] {
  const protectedLines = collectNonCodeProtectedLineIndexes(lines);
  const fencedBlocks = collectFenceBlocks(lines, protectedLines);
  const references: CodeBlockReference[] = fencedBlocks.map((block) => ({
    block,
    indentation: null,
    info: block.info,
    key: block.key,
    openIndex: block.openIndex,
    structuralBlankAfter: false,
  }));
  for (const block of fencedBlocks) {
    for (let index = block.openIndex; index <= block.closeIndex; index += 1) {
      protectedLines.add(index);
    }
  }

  for (let index = 0; index < lines.length;) {
    if (
      protectedLines.has(index)
      || !isIndentedCodeLine(lines[index] ?? '')
      || !canStartIndentedCodeReference(lines, index, protectedLines)
    ) {
      index += 1;
      continue;
    }

    const openIndex = index;
    const body: string[] = [];
    while (index < lines.length && !protectedLines.has(index)) {
      const line = lines[index] ?? '';
      if (isIndentedCodeLine(line)) {
        body.push(stripIndentedCodePrefix(line));
        index += 1;
        continue;
      }
      if (line.trim() === '' && hasFollowingIndentedCodeLine(lines, index, protectedLines)) {
        body.push('');
        index += 1;
        continue;
      }
      break;
    }

    references.push({
      block: null,
      indentation: lines.slice(openIndex, index).map(getIndentedCodePrefix),
      info: '',
      key: body.join('\n'),
      openIndex,
      structuralBlankAfter: hasStableBlankLineAfter(lines, index - 1),
    });
  }

  return references.sort((left, right) => left.openIndex - right.openIndex);
}

function hasStableBlankLineAfter(lines: readonly string[], blockEndIndex: number): boolean {
  for (let index = blockEndIndex + 1; index < lines.length; index += 1) {
    if ((lines[index] ?? '').trim() !== '') return false;
    if (isStableParseBoundaryBlankLine(lines, index)) return true;
  }
  return false;
}

function matchCodeBlockReferences(
  references: readonly CodeBlockReference[],
  blocks: readonly FenceBlock[],
): Array<[CodeBlockReference, FenceBlock]> {
  if (references.length === blocks.length) {
    return references.map((reference, index) => [reference, blocks[index]!]);
  }

  const available = new Set(blocks);
  const matches: Array<[CodeBlockReference, FenceBlock]> = [];
  for (const reference of references) {
    const block = Array.from(available).sort((left, right) => {
      const infoDifference = getFenceInfoDifference(reference.info, left.info)
        - getFenceInfoDifference(reference.info, right.info);
      return infoDifference || Math.abs(reference.openIndex - left.openIndex)
        - Math.abs(reference.openIndex - right.openIndex);
    })[0];
    if (!block) break;
    available.delete(block);
    matches.push([reference, block]);
  }
  return matches;
}

function getFenceInfoDifference(reference: string, serialized: string): number {
  if (reference === serialized) return 0;
  return Boolean(reference) === Boolean(serialized) ? 1 : 2;
}

function isIndentedCodeLine(line: string): boolean {
  return /^(?: {4}|\t)/.test(line);
}

function canStartIndentedCodeReference(
  lines: readonly string[],
  index: number,
  protectedLines: ReadonlySet<number>,
): boolean {
  if (index === 0 || (lines[index - 1] ?? '').trim() === '') return true;
  if (protectedLines.has(index - 1)) return true;

  const previous = lines[index - 1] ?? '';
  return TIGHT_INDENTED_CODE_PREDECESSOR_PATTERNS.some((pattern) => pattern.test(previous));
}

function stripIndentedCodePrefix(line: string): string {
  return line[0] === '\t' ? line.slice(1) : line.slice(4);
}

function getIndentedCodePrefix(line: string): string {
  if (line.trim() === '') return '';
  return line[0] === '\t' ? '\t' : '    ';
}

function hasFollowingIndentedCodeLine(
  lines: readonly string[],
  startIndex: number,
  protectedLines: ReadonlySet<number>,
): boolean {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (protectedLines.has(index)) return false;
    const line = lines[index] ?? '';
    if (line.trim() === '') continue;
    return isIndentedCodeLine(line);
  }
  return false;
}
