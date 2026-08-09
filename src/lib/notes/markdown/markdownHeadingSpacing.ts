import { mapMarkdownOutsideProtectedSegments } from './markdownProtectedBlocks';

const EMPTY_LINE_PLACEHOLDER_PATTERN = /^[\t ]*\\?\u200B[\t ]*$/;
const MARKED_EMPTY_LINE_PATTERN =
  /^<br\b(?=[^>]*\bdat[ae]-vla(?:ina|ian)-?(?:empty|empt)-line=(?:"true"|'true'|true\b))[^>]*\/?>\s*(?:<\/br>)?$/i;

export function collapseSyntheticBlankLinesBetweenAdjacentHeadings(text: string): string {
  return text;
}

export function collapseSyntheticBlankLinesAroundEmptyPlaceholders(text: string): string {
  return mapMarkdownOutsideProtectedSegments(text, (segment) => {
    const lines = segment.split('\n');
    const output: string[] = [];
    const lastContentIndex = getLastContentIndex(lines);
    let hasPreviousContent = false;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      const isEmptyPlaceholder =
        EMPTY_LINE_PLACEHOLDER_PATTERN.test(line)
        || MARKED_EMPTY_LINE_PATTERN.test(line.trim());

      if (!isEmptyPlaceholder) {
        output.push(line);
        if (line.trim() !== '') {
          hasPreviousContent = true;
        }
        continue;
      }

      if (hasPreviousContent) {
        let removedSeparator = false;
        while (output.length > 0 && (output[output.length - 1] ?? '').trim() === '') {
          output.pop();
          removedSeparator = true;
        }
        const previousContent = output[output.length - 1] ?? '';
        if (removedSeparator && isMarkdownListItemLine(previousContent)) {
          output.push('');
        }
      }

      output.push(line);

      if (index < lastContentIndex) {
        while (index + 1 < lines.length && (lines[index + 1] ?? '').trim() === '') {
          index += 1;
        }
      }
    }

    return output.join('\n');
  });
}

function isMarkdownListItemLine(line: string): boolean {
  return /^(?: {0,3}(?:[-+*]|\d+[.)])\s+\S)/.test(line);
}

function getLastContentIndex(lines: readonly string[]): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if ((lines[index] ?? '').trim() !== '') {
      return index;
    }
  }
  return -1;
}
