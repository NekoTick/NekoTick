import { mapMarkdownOutsideProtectedSegments } from './markdownProtectedBlocks';
import {
  isMarkdownLineInContainer,
  parseMarkdownContainerLinePrefix,
} from './markdownFenceProtectedLines';
import {
  LATEX_LIKE_MATH_CONTENT_PATTERN,
} from './markdownSerializationShared';

const ALTERNATIVE_MATH_OPEN_MARKER_PATTERN = /^((?:\\+\[\\?)|\[\\?|\[)\s*$/;
const BRACKET_MATH_CLOSE_MARKER_PATTERN = /^]\s*$/;
const BRACKET_MATH_CLOSE_SUFFIX_PATTERN = /^(.*)]\s*$/;
const STANDALONE_BRACKET_MATH_MARKER_PATTERN = /^\\\[[ \t]*(\S(?:.*?\S)?)[ \t]*\\\]\s*$/;
const STANDALONE_DOLLAR_MATH_MARKER_PATTERN = /^\$\$[ \t]*(\S(?:.*?\S)?)[ \t]*\$\$\s*$/;
const STANDARD_MATH_CLOSE_MARKER_PATTERN = /^\\\]\s*$/;
const STANDARD_MATH_CLOSE_SUFFIX_PATTERN = /^(.*)\\\]\s*$/;

export interface AlternativeMathBlockOpen {
  blockquoteDepth: number;
  bracketCloseFence: boolean;
  bracketOnlyFence: boolean;
  containerIndent: number;
  prefix: string;
}

export interface StandaloneMathBlockLine {
  continuationPrefix: string;
  latex: string;
  prefix: string;
  style: 'bracket-inline' | 'dollar-inline';
}

export function normalizeAlternativeMathBlockFences(text: string): string {
  return mapMarkdownOutsideProtectedSegments(text, (segment) => {
    const lines = segment.split('\n');
    const output: string[] = [];
    let pendingFence: (AlternativeMathBlockOpen & { lines: string[] }) | null = null;

    for (const line of lines) {
      if (pendingFence && !isMarkdownLineInContainer(line, pendingFence)) {
        output.push(...pendingFence.lines);
        pendingFence = null;
      }

      if (pendingFence) {
        const close = getAlternativeMathBlockClose(line, pendingFence);

        if (
          close
          && (!pendingFence.bracketOnlyFence
            || isLatexLikeMathBlock([
              ...pendingFence.lines.slice(1),
              ...(close.contentLine === null ? [] : [close.contentLine]),
            ]))
        ) {
          const converted = [
            `${pendingFence.prefix}$$`,
            ...pendingFence.lines.slice(1),
            ...(close.contentLine === null ? [] : [close.contentLine]),
            `${close.prefix}$$`,
          ];
          if (close.bracketClose && converted.length > 2) {
            const contentLineIndex = converted.length - 2;
            converted[contentLineIndex] = stripSingleTrailingBackslash(
              converted[contentLineIndex] ?? ''
            );
          }
          output.push(...converted);
          pendingFence = null;
          continue;
        }

        pendingFence.lines.push(line);
        continue;
      }

      const standalone = parseStandaloneMathBlockLine(line);
      if (standalone) {
        output.push(
          `${standalone.prefix}$$`,
          `${standalone.continuationPrefix}${standalone.latex}`,
          `${standalone.continuationPrefix}$$`,
        );
        continue;
      }

      const open = getAlternativeMathBlockOpen(line);
      if (open) {
        pendingFence = {
          ...open,
          lines: [line],
        };
        continue;
      }

      output.push(line);
    }

    if (pendingFence) {
      output.push(...pendingFence.lines);
    }

    return output.join('\n');
  }, { protectMathBlocks: false });
}

export function getAlternativeMathBlockClose(
  line: string,
  pendingFence: AlternativeMathBlockOpen,
): { bracketClose: boolean; contentLine: string | null; prefix: string } | null {
  const container = parseMarkdownContainerLinePrefix(line, {
    blockquoteDepth: pendingFence.blockquoteDepth,
    maxIndent: pendingFence.containerIndent + 3,
    minIndent: pendingFence.containerIndent,
    stripListMarker: false,
  });
  if (!container) return null;

  const prefix = line.slice(0, container.markerStart);
  const content = line.slice(container.markerStart);
  if (STANDARD_MATH_CLOSE_MARKER_PATTERN.test(content)) {
    return { bracketClose: false, contentLine: null, prefix };
  }

  const canUseBracketClose = pendingFence.bracketCloseFence || pendingFence.bracketOnlyFence;
  if (canUseBracketClose && BRACKET_MATH_CLOSE_MARKER_PATTERN.test(content)) {
    return { bracketClose: true, contentLine: null, prefix };
  }

  const standardSuffix = STANDARD_MATH_CLOSE_SUFFIX_PATTERN.exec(content);
  if (standardSuffix && hasAlternativeMathInlineCloseContent(standardSuffix[1] ?? '')) {
    return {
      bracketClose: false,
      contentLine: `${prefix}${standardSuffix[1] ?? ''}`,
      prefix,
    };
  }

  const bracketSuffix = canUseBracketClose
    ? BRACKET_MATH_CLOSE_SUFFIX_PATTERN.exec(content)
    : null;
  if (bracketSuffix && hasAlternativeMathInlineCloseContent(bracketSuffix[1] ?? '')) {
    return {
      bracketClose: true,
      contentLine: `${prefix}${bracketSuffix[1] ?? ''}`,
      prefix,
    };
  }

  return null;
}

export function getAlternativeMathBlockOpen(line: string): AlternativeMathBlockOpen | null {
  const container = parseMarkdownContainerLinePrefix(line);
  if (!container) return null;

  const marker = ALTERNATIVE_MATH_OPEN_MARKER_PATTERN.exec(
    line.slice(container.markerStart)
  )?.[1];
  if (!marker) return null;

  return {
    blockquoteDepth: container.blockquoteDepth,
    bracketCloseFence: isAlternativeMathBlockBracketCloseFence(marker),
    bracketOnlyFence: marker === '[',
    containerIndent: container.containerIndent,
    prefix: line.slice(0, container.markerStart),
  };
}

export function parseStandaloneMathBlockLine(line: string): StandaloneMathBlockLine | null {
  const container = parseMarkdownContainerLinePrefix(line);
  if (!container) return null;
  const content = line.slice(container.markerStart);
  const dollar = STANDALONE_DOLLAR_MATH_MARKER_PATTERN.exec(content);
  const bracket = dollar ? null : STANDALONE_BRACKET_MATH_MARKER_PATTERN.exec(content);
  const match = dollar ?? bracket;
  if (!match) return null;

  return {
    continuationPrefix: container.continuationPrefix,
    latex: match[1] ?? '',
    prefix: line.slice(0, container.markerStart),
    style: dollar ? 'dollar-inline' : 'bracket-inline',
  };
}

export function hasAlternativeMathInlineCloseContent(contentLine: string): boolean {
  return contentLine.trim().length > 0;
}

export function isLatexLikeMathBlock(lines: readonly string[]): boolean {
  return LATEX_LIKE_MATH_CONTENT_PATTERN.test(lines.join('\n'));
}

export function isAlternativeMathBlockBracketCloseFence(marker: string): boolean {
  return marker === '[' || marker.endsWith('\\');
}

export function stripSingleTrailingBackslash(line: string): string {
  const withoutTrailingWhitespace = line.replace(/[ \t]+$/, '');
  return withoutTrailingWhitespace.endsWith('\\') && !withoutTrailingWhitespace.endsWith('\\\\')
    ? withoutTrailingWhitespace.slice(0, -1)
    : line;
}
