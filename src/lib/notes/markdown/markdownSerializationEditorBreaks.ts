import { mapMarkdownOutsideProtectedBlocks, mapMarkdownOutsideProtectedSegments, } from './markdownProtectedBlocks';
import { containsAsciiCaseInsensitive } from './markdownSerializationAscii';
import { getBlockquotePrefix } from './markdownSerializationBlockquote';
import {
  BLOCKQUOTE_STANDALONE_BR_LINE_PATTERN,
  BR_ONLY_PATTERN,
  EDITABLE_LIST_GAP_MARKER_PLACEHOLDER_PATTERN,
  EDITABLE_LIST_GAP_PLACEHOLDER_PATTERN,
  EMPTY_TABLE_CELL_PLACEHOLDER_PATTERN,
  ESCAPED_HIGHLIGHT_PATTERN,
  INLINE_TERMINAL_LIST_BR_PATTERN,
  INTERNAL_MARKDOWN_BLANK_LINE_COMMENT_PATTERN,
  INVISIBLE_EMPTY_LINE_PLACEHOLDER_PATTERN, INVISIBLE_LIST_GAP_PLACEHOLDER_PATTERN,
  LIST_GAP_SENTINEL,
  LIST_ITEM_LINE_PATTERN,
  MARKED_BLOCKQUOTE_USER_BR_PATTERN,
  MARKED_BLOCKQUOTE_USER_BR_TOKEN_PATTERN,
  MARKED_BLOCKQUOTE_USER_BR_WITH_DEPTH_PATTERN,
  MARKED_EMPTY_LINE_PATTERN, MARKED_EMPTY_LINE_TOKEN_PATTERN,
  MARKED_LIST_GAP_TOKEN_PATTERN,
  MARKED_USER_BR_PATTERN,
  MARKED_USER_BR_TOKEN_PATTERN,
  STANDALONE_BR_LINE_PATTERN,
  USER_BR_SENTINEL
} from './markdownSerializationShared';

const BLOCKQUOTE_EDITABLE_LIST_GAP_MARKER_PLACEHOLDER_PATTERN =
  /^(\s*(?:>\s*)+)(?:[-+*]|\d+[.)])\s+\\?\u2800\s*$/;

export function normalizeEmptyAtxHeadingMarkers(text: string): string {
  return text;
}

export function normalizeEscapedHighlightSyntax(text: string): string {
  if (!text.includes('\\==')) return text;

  return mapMarkdownOutsideProtectedSegments(text, (segment) =>
    segment.replace(ESCAPED_HIGHLIGHT_PATTERN, '==$1==')
  );
}

export function normalizeTableCellBreakPlaceholders(text: string): string {
  if (!hasPotentialHtmlBreakTag(text)) return text;

  return mapMarkdownOutsideProtectedSegments(text, (segment) =>
    segment.replace(EMPTY_TABLE_CELL_PLACEHOLDER_PATTERN, '$1 $2')
  );
}

export function normalizeStandaloneBreakHtmlToMarkdown(text: string): string {
  if (!hasPotentialHtmlBreakTag(text)) return text;

  return mapMarkdownOutsideProtectedSegments(text, (segment) => {
    const lines = segment.split('\n');
    const output: string[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      const inlineListBreakMatch = INLINE_TERMINAL_LIST_BR_PATTERN.exec(line);
      if (inlineListBreakMatch) {
        output.push((inlineListBreakMatch[1] ?? '').replace(/[ \t]*$/, ''));
        continue;
      }

      const blockquoteBreakMatch = BLOCKQUOTE_STANDALONE_BR_LINE_PATTERN.exec(line);
      if (blockquoteBreakMatch) {
        const prefix = (blockquoteBreakMatch[1] ?? '').trimEnd();
        const previousIndex = output.length - 1;
        const previousLine = previousIndex >= 0 ? output[previousIndex] : null;
        const nextLine = lines[index + 1] ?? '';
        if (
          previousLine !== null
          && previousLine.trim() !== ''
          && nextLine.trim() !== ''
          && nextLine.trimStart().startsWith('>')
        ) {
          output[previousIndex] = previousLine.replace(/[ \t]*$/, '\\');
        } else {
          output.push(prefix);
        }
        continue;
      }

      if (STANDALONE_BR_LINE_PATTERN.test(line)) {
        const previousIndex = output.length - 1;
        const previousLine = previousIndex >= 0 ? output[previousIndex] : null;
        const nextLine = lines[index + 1] ?? '';
        if (previousLine !== null && previousLine.trim() !== '' && nextLine.trim() !== '') {
          output[previousIndex] = previousLine.replace(/[ \t]*$/, '\\');
        } else if (previousLine === null || nextLine.trim() !== '') {
          output.push('');
        }
        continue;
      }

      output.push(line);
    }

    return output.join('\n');
  });
}

export function normalizeEditorEmptyParagraphBreaks(text: string): string {
  if (!hasPotentialHtmlBreakTag(text)) return text;

  return mapMarkdownOutsideProtectedSegments(text, (segment) => {
    const lines = segment.split('\n');
    return lines.map((line, index) => {
      if (!BR_ONLY_PATTERN.test(line.trim())) {
        return line;
      }

      if (shouldPreserveEditorBreakLineInListContext(lines, index)) {
        return LIST_GAP_SENTINEL;
      }

      if (index <= 0 || index >= lines.length - 1) {
        return line;
      }

      const previousLine = index > 0 ? lines[index - 1] ?? '' : '';
      const nextLine = index < lines.length - 1 ? lines[index + 1] ?? '' : '';
      return previousLine.trim() !== '' && nextLine.trim() !== '' ? line : null;
    }).filter((line) => line !== null).join('\n');
  });
}

export function shouldPreserveEditorBreakLineInListContext(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? '';
  const match = STANDALONE_BR_LINE_PATTERN.exec(line);
  if (!match) return false;

  const indent = match[1] ?? '';
  if (indent.length === 0) {
    return isBetweenListContextLines(lines, index);
  }

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const previousLine = lines[cursor] ?? '';
    if (previousLine.trim() === '') continue;
    if (LIST_ITEM_LINE_PATTERN.test(previousLine)) return true;
    if (!previousLine.startsWith(indent)) return false;
  }

  return false;
}

export function isBetweenListContextLines(lines: readonly string[], index: number): boolean {
  let previousIsListItem = false;

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const previousLine = lines[cursor] ?? '';
    if (isListContextSpacerLine(previousLine)) continue;
    previousIsListItem = LIST_ITEM_LINE_PATTERN.test(previousLine);
    break;
  }

  if (!previousIsListItem) return false;

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const nextLine = lines[cursor] ?? '';
    if (isListContextSpacerLine(nextLine)) continue;
    return LIST_ITEM_LINE_PATTERN.test(nextLine);
  }

  return true;
}

export function isListContextSpacerLine(line: string): boolean {
  return line.trim() === '' || STANDALONE_BR_LINE_PATTERN.test(line);
}

export function normalizeEditorBreakPlaceholders(text: string): string {
  if (!hasPotentialEditorBreakPlaceholder(text)) return text;

  return mapMarkdownOutsideProtectedBlocks(
    text,
    (line) => {
      const trimmed = line.trim();
      const blockquoteListGapMatch =
        BLOCKQUOTE_EDITABLE_LIST_GAP_MARKER_PLACEHOLDER_PATTERN.exec(line);
      if (blockquoteListGapMatch) {
        return `${(blockquoteListGapMatch[1] ?? '>').trimEnd()} ${LIST_GAP_SENTINEL}`;
      }
      if (INVISIBLE_LIST_GAP_PLACEHOLDER_PATTERN.test(line)) {
        return LIST_GAP_SENTINEL;
      }
      if (EDITABLE_LIST_GAP_PLACEHOLDER_PATTERN.test(line)) {
        return LIST_GAP_SENTINEL;
      }
      if (EDITABLE_LIST_GAP_MARKER_PLACEHOLDER_PATTERN.test(line)) {
        return LIST_GAP_SENTINEL;
      }
      if (INVISIBLE_EMPTY_LINE_PLACEHOLDER_PATTERN.test(line)) {
        return '';
      }
      if (MARKED_EMPTY_LINE_PATTERN.test(trimmed)) {
        return '';
      }
      if (INTERNAL_MARKDOWN_BLANK_LINE_COMMENT_PATTERN.test(line)) {
        return '';
      }
      const blockquoteUserBrWithDepthMatch =
        MARKED_BLOCKQUOTE_USER_BR_WITH_DEPTH_PATTERN.exec(line);
      if (blockquoteUserBrWithDepthMatch) {
        const prefix = blockquoteUserBrWithDepthMatch[1] || getBlockquotePrefix(
          Number(
            blockquoteUserBrWithDepthMatch[2]
            ?? blockquoteUserBrWithDepthMatch[3]
            ?? blockquoteUserBrWithDepthMatch[4]
            ?? 0
          )
        );
        return `${prefix}<br />`;
      }
      if (MARKED_USER_BR_PATTERN.test(trimmed)) {
        return USER_BR_SENTINEL;
      }
      const blockquoteUserBrMatch = MARKED_BLOCKQUOTE_USER_BR_PATTERN.exec(line);
      if (blockquoteUserBrMatch) {
        return `${blockquoteUserBrMatch[1] ?? ''}${USER_BR_SENTINEL}`;
      }
      return line
        .replace(MARKED_LIST_GAP_TOKEN_PATTERN, LIST_GAP_SENTINEL)
        .replace(MARKED_EMPTY_LINE_TOKEN_PATTERN, '\n')
        .replace(
          MARKED_BLOCKQUOTE_USER_BR_TOKEN_PATTERN,
          (_match, doubleQuotedDepth: string, singleQuotedDepth: string, unquotedDepth: string) =>
            `\n${getBlockquotePrefix(Number(
              doubleQuotedDepth ?? singleQuotedDepth ?? unquotedDepth
            ))}${USER_BR_SENTINEL}`
        )
        .replace(MARKED_USER_BR_TOKEN_PATTERN, `\n${USER_BR_SENTINEL}\n`);
    },
  );
}

export function hasPotentialEditorBreakPlaceholder(text: string): boolean {
  return text.includes('\u200B')
    || text.includes('\u200C')
    || text.includes('\u2800')
    || containsAsciiCaseInsensitive(text, '<br')
    || containsAsciiCaseInsensitive(text, 'vlaina-markdown-')
    || containsAsciiCaseInsensitive(text, 'vlaina-rendered-html-boundary-blank-line');
}

export function hasPotentialHtmlBreakTag(text: string): boolean {
  return containsAsciiCaseInsensitive(text, '<br');
}
