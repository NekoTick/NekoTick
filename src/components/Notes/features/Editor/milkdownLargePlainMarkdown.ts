import type { Node as ProseNode, Schema } from '@milkdown/kit/prose/model';
import type { ProseMirrorJSONNode } from './MilkdownEditorInnerTypes';

const LARGE_PLAIN_MARKDOWN_FAST_PARSE_MIN_LENGTH = 1_000_000;
const LARGE_MARKDOWN_LAZY_BLOCK_VISIBILITY_MIN_LENGTH = 1_000_000;
const LARGE_MARKDOWN_VIRTUALIZED_VIEW_MIN_LENGTH = 250_000;
const LAZY_BLOCK_VISIBILITY_MIN_LENGTH = 60_000;
const LAZY_BLOCK_VISIBILITY_MIN_NON_EMPTY_LINES = 500;
const LAZY_BLOCK_VISIBILITY_MIN_BLOCK_LIKE_LINES = 900;
const LAZY_BLOCK_VISIBILITY_MIN_MERMAID_BLOCKS = 4;
const LAZY_BLOCK_VISIBILITY_DENSE_HEAVY_MIN_LINES = 40;
const LAZY_BLOCK_VISIBILITY_DENSE_HEAVY_LINE_RATIO = 5;
const MARKDOWN_BLANK_LINE_COMMENT = '<!--vlaina-markdown-blank-line-->';
const FAST_PARSE_DISALLOWED_TEXT_PATTERN = /[`*_~[\]()<>\\|&]/;
const FAST_PARSE_GFM_AUTOLINK_TEXT_PATTERN = /(?:https?:\/\/|www\.|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i;
const FAST_PARSE_HEADING_PATTERN = /^(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/;
const FAST_PARSE_STRUCTURAL_LINE_PATTERN = /^(?: {0,3})(?:[-+*]\s+|\d+[.)]\s+|:\s+|(?:[-*_][ \t]*){3,}$|=+[ \t]*$)/;
const LAZY_BLOCK_VISIBILITY_HEAVY_LINE_PATTERN = /^(?:`{3,}|~{3,}|\$\$\s*$|<(?:!--|\/?[A-Za-z]))/;

function needsFullMarkdownInlineParsing(text: string): boolean {
  return FAST_PARSE_DISALLOWED_TEXT_PATTERN.test(text) || FAST_PARSE_GFM_AUTOLINK_TEXT_PATTERN.test(text);
}

export function shouldUseLazyBlockVisibility(markdown: string): boolean {
  return markdown.length >= LARGE_MARKDOWN_LAZY_BLOCK_VISIBILITY_MIN_LENGTH
    || hasMultipleMermaidBlocksOrLargeScrollableMarkdownShape(markdown);
}

export function shouldUseVirtualizedEditorView(markdown: string): boolean {
  return markdown.length >= LARGE_MARKDOWN_VIRTUALIZED_VIEW_MIN_LENGTH;
}

function hasMultipleMermaidBlocksOrLargeScrollableMarkdownShape(markdown: string): boolean {
  const shouldAnalyzeScrollableShape = markdown.length >= LAZY_BLOCK_VISIBILITY_MIN_LENGTH;
  let mermaidBlockCount = 0;
  let nonEmptyLines = 0;
  let heavyBlockLines = 0;
  let blockLikeLines = 0;
  let lineStart = 0;
  while (lineStart < markdown.length) {
    const nextBreak = markdown.indexOf('\n', lineStart);
    const lineEnd = nextBreak === -1 ? markdown.length : nextBreak;
    const trimmedLine = markdown.slice(lineStart, lineEnd).trim();
    if (trimmedLine.length > 0) {
      if (/^(?:`{3,}|~{3,})mermaid(?:\s|$)/i.test(trimmedLine)) {
        mermaidBlockCount += 1;
        if (mermaidBlockCount >= LAZY_BLOCK_VISIBILITY_MIN_MERMAID_BLOCKS) return true;
      }
      if (shouldAnalyzeScrollableShape) {
        nonEmptyLines += 1;
        if (
          LAZY_BLOCK_VISIBILITY_HEAVY_LINE_PATTERN.test(trimmedLine)
          || (trimmedLine.startsWith('|') && trimmedLine.endsWith('|'))
        ) {
          heavyBlockLines += 1;
        }
        if (
          /^(?:#{1,6}\s+|(?:[-+*]|\d+[.)])\s+|>\s*|\|.*\|$|`{3,}|~{3,}|<\/?[A-Za-z]|<!--|\[\^)/.test(trimmedLine)
        ) {
          blockLikeLines += 1;
        }
      }
    }

    if (nextBreak === -1) {
      break;
    }
    lineStart = nextBreak + 1;
  }

  if (!shouldAnalyzeScrollableShape) {
    return false;
  }

  if (nonEmptyLines < LAZY_BLOCK_VISIBILITY_MIN_NON_EMPTY_LINES) {
    return false;
  }

  if (blockLikeLines >= LAZY_BLOCK_VISIBILITY_MIN_BLOCK_LIKE_LINES) {
    return true;
  }

  const hasDenseHeavyBlocks = (
    heavyBlockLines >= LAZY_BLOCK_VISIBILITY_DENSE_HEAVY_MIN_LINES
    && heavyBlockLines * LAZY_BLOCK_VISIBILITY_DENSE_HEAVY_LINE_RATIO >= nonEmptyLines
  );
  return !hasDenseHeavyBlocks;
}

export function createLargePlainMarkdownDocJSON(markdown: string): ProseMirrorJSONNode | null {
  if (markdown.length < LARGE_PLAIN_MARKDOWN_FAST_PARSE_MIN_LENGTH || markdown.includes('\r')) {
    return null;
  }

  const content: ProseMirrorJSONNode[] = [];
  let lineStart = 0;
  let previousLineWasParagraph = false;
  while (lineStart < markdown.length) {
    const nextBreak = markdown.indexOf('\n', lineStart);
    const lineEnd = nextBreak === -1 ? markdown.length : nextBreak;
    const line = markdown.slice(lineStart, lineEnd);
    const trimmed = line.trim();
    if (!trimmed) {
      previousLineWasParagraph = false;
      if (nextBreak === -1) {
        break;
      }
      lineStart = nextBreak + 1;
      continue;
    }

    if (trimmed === MARKDOWN_BLANK_LINE_COMMENT) {
      content.push({
        type: 'html_block',
        attrs: { value: MARKDOWN_BLANK_LINE_COMMENT },
      });
      previousLineWasParagraph = false;
      if (nextBreak === -1) {
        break;
      }
      lineStart = nextBreak + 1;
      continue;
    }

    const headingMatch = FAST_PARSE_HEADING_PATTERN.exec(line);
    if (headingMatch) {
      const text = (headingMatch[2] ?? '').replace(/(?:^|[ \t]+)#+[ \t]*$/, '').trimEnd();
      if (!text || needsFullMarkdownInlineParsing(text)) {
        return null;
      }
      content.push({
        type: 'heading',
        attrs: { level: Math.min(6, headingMatch[1]?.length ?? 1) },
        content: [
          {
            type: 'text',
            marks: [{
              type: 'markdownSyntax',
              attrs: { edge: 'prefix', kind: 'heading' },
            }],
            text: `${headingMatch[1]} `,
          },
          ...(text.trimEnd() ? [{ type: 'text', text: text.trimEnd() }] : []),
        ],
      });
      previousLineWasParagraph = false;
      if (nextBreak === -1) {
        break;
      }
      lineStart = nextBreak + 1;
      continue;
    }

    if (
      /^\s/.test(line)
      || FAST_PARSE_STRUCTURAL_LINE_PATTERN.test(line)
      || needsFullMarkdownInlineParsing(line)
    ) {
      return null;
    }

    if (previousLineWasParagraph) {
      return null;
    }

    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: line }],
    });
    previousLineWasParagraph = true;

    if (nextBreak === -1) {
      break;
    }
    lineStart = nextBreak + 1;
  }

  return content.length > 0 ? { type: 'doc', content } : null;
}

export function createLargePlainMarkdownDoc(schema: Schema, markdown: string): ProseNode | null {
  const json = createLargePlainMarkdownDocJSON(markdown);
  if (!json) {
    return null;
  }

  try {
    return schema.nodeFromJSON(json);
  } catch {
    return null;
  }
}
