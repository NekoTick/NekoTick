import {
  isMarkdownContainerMathFenceCloseLine,
  isMarkdownLineInContainer,
  parseMarkdownContainerMathFenceLine,
} from './markdownFenceProtectedLines';
import { mapMarkdownOutsideProtectedSegments } from './markdownProtectedBlocks';
import { containsAsciiCaseInsensitive } from './markdownSerializationAscii';
import {
  isMultiLineHtmlCommentOpenLine,
  shouldKeepHtmlCommentProtectionActive
} from './markdownSerializationInternalBlankComments';
import {
  INTERNAL_MARKDOWN_BLANK_LINE_COMMENT_PATTERN,
  INTERNAL_TIGHT_HEADING_COMMENT_PATTERN,
  RENDERED_HTML_BOUNDARY_BLANK_LINE_COMMENT_PATTERN
} from './markdownSerializationShared';

interface ArtifactMathBlockState {
  blockquoteDepth: number;
  containerIndent: number;
  length: number;
  style: 'bracket' | 'dollar';
}

export function normalizeInternalTightHeadingComments(text: string): string {
  const afterMathBlockArtifacts = normalizeInternalArtifactCommentsInsideMathBlocks(text);
  if (!containsAsciiCaseInsensitive(afterMathBlockArtifacts, 'vlaina-markdown-tight-heading')) {
    return afterMathBlockArtifacts;
  }

  return mapMarkdownOutsideProtectedSegments(
    afterMathBlockArtifacts,
    (segment) => normalizeInternalTightHeadingCommentSegment(segment),
    { protectHtmlComments: false },
  );
}

export function normalizeInternalArtifactCommentsInsideMathBlocks(text: string): string {
  if (
    !containsAsciiCaseInsensitive(text, 'vlaina-markdown-blank-line')
    && !containsAsciiCaseInsensitive(text, 'vlaina-rendered-html-boundary-blank-line')
    && !containsAsciiCaseInsensitive(text, 'vlaina-markdown-tight-heading')
  ) {
    return text;
  }

  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const output: string[] = [];
  let mathBlock: ArtifactMathBlockState | null = null;
  let mathContent: string[] = [];
  let changed = false;

  const flushMathContent = () => {
    const normalizedContent = normalizeInternalArtifactMathContentLines(mathContent);
    if (normalizedContent !== mathContent) {
      changed = true;
    }
    output.push(...normalizedContent);
    mathContent = [];
  };

  for (const line of lines) {
    if (mathBlock && !isMarkdownLineInContainer(line, mathBlock)) {
      flushMathContent();
      mathBlock = null;
    }

    if (mathBlock) {
      if (isMathBlockFenceCloseLine(line, mathBlock)) {
        flushMathContent();
        output.push(line);
        mathBlock = null;
        continue;
      }

      mathContent.push(line);
      continue;
    }

    const nextMathBlock = getMathBlockFenceOpenState(line);
    if (nextMathBlock) {
      output.push(line);
      mathBlock = nextMathBlock;
      continue;
    }

    output.push(line);
  }

  if (mathBlock) {
    flushMathContent();
  }

  return changed ? output.join('\n') : text;
}

export function normalizeInternalArtifactMathContentLines(lines: string[]): string[] {
  let changed = false;
  const output = lines.map((line) => {
    if (
      INTERNAL_MARKDOWN_BLANK_LINE_COMMENT_PATTERN.test(line)
      || RENDERED_HTML_BOUNDARY_BLANK_LINE_COMMENT_PATTERN.test(line)
      || INTERNAL_TIGHT_HEADING_COMMENT_PATTERN.test(line)
    ) {
      changed = true;
      return '';
    }
    return line;
  });

  if (!changed) return lines;

  while (output.length > 0 && (output[0] ?? '').trim() === '') {
    output.shift();
  }
  while (output.length > 0 && (output[output.length - 1] ?? '').trim() === '') {
    output.pop();
  }

  return output;
}

function getMathBlockFenceOpenState(line: string): ArtifactMathBlockState | null {
  const fence = parseMarkdownContainerMathFenceLine(line);
  if (fence?.kind === 'dollar') {
    return {
      blockquoteDepth: fence.blockquoteDepth,
      containerIndent: fence.containerIndent,
      length: fence.length,
      style: 'dollar',
    };
  }
  if (fence?.kind === 'bracket-open') {
    return {
      blockquoteDepth: fence.blockquoteDepth,
      containerIndent: fence.containerIndent,
      length: fence.length,
      style: 'bracket',
    };
  }
  return null;
}

function isMathBlockFenceCloseLine(line: string, state: ArtifactMathBlockState): boolean {
  return isMarkdownContainerMathFenceCloseLine(line, state);
}

export function normalizeInternalTightHeadingCommentSegment(segment: string): string {
  const lines = segment.split('\n');
  const output: string[] = [];
  let activeHtmlComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (activeHtmlComment || isMultiLineHtmlCommentOpenLine(line)) {
      output.push(line);
      activeHtmlComment = shouldKeepHtmlCommentProtectionActive(activeHtmlComment, line);
      continue;
    }

    if (!INTERNAL_TIGHT_HEADING_COMMENT_PATTERN.test(line)) {
      output.push(line);
      continue;
    }

    while (output.length > 0 && output[output.length - 1]?.trim() === '') {
      output.pop();
    }

    while (index + 1 < lines.length && (lines[index + 1] ?? '').trim() === '') {
      index += 1;
    }
  }

  return output.join('\n');
}
