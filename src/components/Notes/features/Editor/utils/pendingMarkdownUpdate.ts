import {
  normalizeSerializedMarkdownDocument,
  restoreMathBlockFenceStylesFromReference,
} from '@/lib/notes/markdown/markdownSerializationUtils';
import { restoreAutolinkStyleFromReference } from '@/lib/notes/markdown/markdownAutolinkStyle';
import { restoreBlockquoteMarkerSpacingFromReference } from '@/lib/notes/markdown/markdownBlockquoteMarkerSpacing';
import { restoreFenceMarkerStyleFromReference } from '@/lib/notes/markdown/markdownFenceMarkerStyle';
import { restoreHardBreakStyleFromReference } from '@/lib/notes/markdown/markdownHardBreakStyle';
import { restoreSetextHeadingStyleFromReference } from '@/lib/notes/markdown/markdownHeadingMarkerStyle';
import { restoreListMarkerStyleFromReference } from '@/lib/notes/markdown/markdownListMarkerStyle';
import { restoreReferenceLinkStyleFromReference } from '@/lib/notes/markdown/markdownReferenceLinkStyle';
import { restoreThematicBreakMarkerStyleFromReference } from '@/lib/notes/markdown/markdownThematicBreakMarkerStyle';
import { mapMarkdownOutsideProtectedSegments } from '@/lib/notes/markdown/markdownProtectedBlocks';
import { serializeLeadingFrontmatterMarkdown } from '../plugins/frontmatter/frontmatterMarkdown';
import { restoreMermaidFenceSourceFromReference } from '../plugins/mermaid/mermaidFenceSourceRestore';

const EDITOR_PARAGRAPH_SEPARATOR_SENTINEL = '\u0000VLAINA_EDITOR_PARAGRAPH_SEPARATOR\u0000';
const INTERNAL_MARKDOWN_BLANK_LINE_COMMENT_PATTERN = /^\s*<!--\s*vlaina-markdown-blank-line\s*-->\s*$/i;
const INTERNAL_TIGHT_HEADING_COMMENT_PATTERN = /^\s*<!--\s*vlaina-markdown-tight-heading\s*-->\s*$/i;
const EDITOR_EMPTY_PARAGRAPH_LINE_PATTERN = /^\s*(?:<br\s*\/?>|\\?\u200B)\s*$/i;
const STRUCTURAL_MARKDOWN_LINE_PATTERN =
  /^(?:\s*(?:#{1,6}\s+|(?:[-+*]|\d+[.)])\s+|(?:[-*_][ \t]*){3,}|={2,}\s*$|-{2,}\s*$|\|.*\|\s*$|:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$|\$\$\s*$|```|~~~|\\\[|\\\]|\[|\]|>|\[[^\]]+\]:|\[\^[^\]]+\]:|:\s+|<\/?[A-Za-z][^>]*>|<!--|<![A-Za-z]|<\?))/;
const MARKDOWN_IMAGE_ONLY_LINE_PATTERN = /^\s*!\[[^\]\n]*\]\([^)\n]+\)\s*$/;

type PendingMarkdownUpdateResolution = {
  markdownToApply: string;
  source: 'pending-markdown' | 'live-editor' | 'pending-markdown-without-live-editor';
  liveMarkdown: string | null;
};

export function resolvePendingMarkdownUpdate({
  pendingMarkdown,
  latestNoteContent,
  liveSerializedMarkdown,
}: {
  pendingMarkdown: string;
  latestNoteContent: string;
  liveSerializedMarkdown: string | null;
}): PendingMarkdownUpdateResolution {
  if (liveSerializedMarkdown === null) {
    return {
      markdownToApply: pendingMarkdown,
      source: 'pending-markdown-without-live-editor',
      liveMarkdown: null,
    };
  }

  const liveMarkdown = serializeEditorMarkdownSnapshot(liveSerializedMarkdown, latestNoteContent);

  if (pendingMarkdown !== latestNoteContent) {
    return {
      markdownToApply: pendingMarkdown,
      source: 'pending-markdown',
      liveMarkdown,
    };
  }

  if (liveMarkdown !== pendingMarkdown) {
    return {
      markdownToApply: liveMarkdown,
      source: 'live-editor',
      liveMarkdown,
    };
  }

  return {
    markdownToApply: pendingMarkdown,
    source: 'pending-markdown',
    liveMarkdown,
  };
}

export function serializeEditorMarkdownSnapshot(markdown: string, referenceMarkdown: string): string {
  const markdownWithParagraphSeparators = markEditorParagraphSeparators(markdown);
  const normalizedMarkdown = normalizeSerializedMarkdownDocument(
    restoreThematicBreakMarkerStyleFromReference(
      restoreMathBlockFenceStylesFromReference(markdownWithParagraphSeparators, referenceMarkdown),
      referenceMarkdown,
    )
  );
  const serializedMarkdown = stripEditorParagraphSeparatorSentinels(stripAutomaticEditorTrailingNewline(serializeLeadingFrontmatterMarkdown(
    normalizedMarkdown,
    referenceMarkdown,
  )));
  return restoreHardBreakStyleFromReference(restoreBlockquoteMarkerSpacingFromReference(
    restoreThematicBreakMarkerStyleFromReference(
      restoreListMarkerStyleFromReference(
        restoreFenceMarkerStyleFromReference(
          restoreMermaidFenceSourceFromReference(
            restoreReferenceLinkStyleFromReference(
              restoreAutolinkStyleFromReference(
                restoreSetextHeadingStyleFromReference(serializedMarkdown, referenceMarkdown),
                referenceMarkdown,
              ),
              referenceMarkdown,
            ),
            referenceMarkdown,
          ),
          referenceMarkdown,
        ),
        referenceMarkdown,
      ),
      referenceMarkdown,
    ),
    referenceMarkdown,
  ), referenceMarkdown);
}

export function normalizeMarkdownParagraphSeparatorsForEditorComparison(markdown: string): string {
  const normalizedMarkdown = markdown.replace(/\r\n?/g, '\n');
  const lines = normalizedMarkdown.split('\n');
  const output: string[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index] ?? '';
    if (line.trim() !== '') {
      output.push(line);
      index += 1;
      continue;
    }

    const runStart = index;
    while (index < lines.length && (lines[index] ?? '').trim() === '') {
      index += 1;
    }

    const previousLine = output[output.length - 1] ?? null;
    const nextLine = lines[index] ?? null;
    const isPlainParagraphGap =
      previousLine !== null &&
      nextLine !== null &&
      isPlainTextParagraphLine(previousLine) &&
      isPlainTextParagraphLine(nextLine) &&
      !beginsDefinitionList(lines, index);

    if (isPlainParagraphGap) {
      continue;
    }

    for (let blankIndex = runStart; blankIndex < index; blankIndex += 1) {
      output.push(lines[blankIndex] ?? '');
    }
  }

  return stripEditorParagraphSeparatorSentinels(output.join('\n'));
}

function stripAutomaticEditorTrailingNewline(markdown: string): string {
  return markdown.endsWith('\n') ? markdown.slice(0, -1) : markdown;
}

function markEditorParagraphSeparators(markdown: string): string {
  if (!markdown.includes('\n\n')) return markdown;

  return mapMarkdownOutsideProtectedSegments(
    markdown,
    markEditorParagraphSeparatorsInSegment,
  );
}

function markEditorParagraphSeparatorsInSegment(markdown: string): string {
  const normalizedMarkdown = markdown.replace(/\r\n?/g, '\n');
  const lines = normalizedMarkdown.split('\n');
  const output: string[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index] ?? '';
    if (line.trim() !== '') {
      output.push(line);
      index += 1;
      continue;
    }

    const runStart = index;
    while (index < lines.length && (lines[index] ?? '').trim() === '') {
      index += 1;
    }

    const previousLine = output[output.length - 1] ?? null;
    const nextLine = lines[index] ?? null;
    const emptyParagraphRun = consumeEditorEmptyParagraphRun({
      lines,
      cursor: index,
      previousLine,
    });
    if (emptyParagraphRun !== null) {
      output[output.length - 1] = `${previousLine}${EDITOR_PARAGRAPH_SEPARATOR_SENTINEL}`;
      for (let blankIndex = 0; blankIndex < emptyParagraphRun.blankLineCount; blankIndex += 1) {
        output.push('');
      }
      index = emptyParagraphRun.nextIndex;
      continue;
    }

    const shouldCompact = previousLine !== null
      && nextLine !== null
      && isPlainTextParagraphLine(previousLine)
      && isPlainTextParagraphLine(nextLine)
      && !beginsDefinitionList(lines, index);

    if (!shouldCompact) {
      for (let blankIndex = runStart; blankIndex < index; blankIndex += 1) {
        output.push(lines[blankIndex] ?? '');
      }
      continue;
    }

    output[output.length - 1] = `${previousLine}${EDITOR_PARAGRAPH_SEPARATOR_SENTINEL}`;
    for (let blankIndex = runStart + 1; blankIndex < index; blankIndex += 1) {
      output.push(lines[blankIndex] ?? '');
    }
  }

  return output.join('\n');
}

function consumeEditorEmptyParagraphRun({
  lines,
  cursor,
  previousLine,
}: {
  lines: readonly string[];
  cursor: number;
  previousLine: string | null;
}): { blankLineCount: number; nextIndex: number } | null {
  if (previousLine === null || !isPlainTextParagraphLine(previousLine)) return null;

  let scanIndex = cursor;
  let blankLineCount = 0;
  while (scanIndex < lines.length && isEditorEmptyParagraphLine(lines[scanIndex] ?? '')) {
    blankLineCount += 1;
    scanIndex += 1;
    while (scanIndex < lines.length && (lines[scanIndex] ?? '').trim() === '') {
      scanIndex += 1;
    }
  }

  const nextLine = lines[scanIndex] ?? null;
  if (blankLineCount === 0 || nextLine === null || !isPlainTextParagraphLine(nextLine)) {
    return null;
  }

  return {
    blankLineCount,
    nextIndex: scanIndex,
  };
}

function isEditorEmptyParagraphLine(line: string): boolean {
  return EDITOR_EMPTY_PARAGRAPH_LINE_PATTERN.test(line)
    || isInternalEditorBlankLineComment(line);
}

function isPlainTextParagraphLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  if (/^(?: {2,}|\t)/.test(line)) return false;
  if (trimmed.includes(EDITOR_PARAGRAPH_SEPARATOR_SENTINEL)) return false;
  if (isInternalEditorArtifactLine(line)) return false;
  if (STRUCTURAL_MARKDOWN_LINE_PATTERN.test(line)) return false;
  if (MARKDOWN_IMAGE_ONLY_LINE_PATTERN.test(line)) return false;
  return true;
}

function beginsDefinitionList(lines: readonly string[], termIndex: number): boolean {
  if (!isPlainTextParagraphLine(lines[termIndex] ?? '')) return false;

  let descriptionIndex = termIndex + 1;
  while (descriptionIndex < lines.length && (lines[descriptionIndex] ?? '').trim() === '') {
    descriptionIndex += 1;
  }
  return /^\s{0,3}:\s+\S/.test(lines[descriptionIndex] ?? '');
}

function isInternalEditorBlankLineComment(line: string): boolean {
  return INTERNAL_MARKDOWN_BLANK_LINE_COMMENT_PATTERN.test(line);
}

function isInternalEditorArtifactLine(line: string): boolean {
  return isInternalEditorBlankLineComment(line)
    || INTERNAL_TIGHT_HEADING_COMMENT_PATTERN.test(line);
}

function stripEditorParagraphSeparatorSentinels(markdown: string): string {
  if (!markdown.includes(EDITOR_PARAGRAPH_SEPARATOR_SENTINEL)) return markdown;
  return markdown
    .replaceAll(`${EDITOR_PARAGRAPH_SEPARATOR_SENTINEL}\\\n`, '\n')
    .replaceAll(`${EDITOR_PARAGRAPH_SEPARATOR_SENTINEL}\n`, '\n')
    .replaceAll(EDITOR_PARAGRAPH_SEPARATOR_SENTINEL, '');
}
