import {
  getMarkdownLinkHref,
  MARKDOWN_LINK_DESTINATION_SOURCE,
  MARKDOWN_LINK_PATTERN_GLOBAL,
} from './markdownLinkParser';
import {
  countMarkerRunsInRange,
  isRedundantMarkdownEscape,
  isSingleMarkerRunInCurrentTextToken,
} from './markdownSerializationEscapes';
import { collectMarkdownSourceStyleLines } from './markdownSourceStyleLines';

const LINE_ALIGNMENT_LOOKAHEAD = 32;
const RESTORABLE_SERIALIZER_ESCAPE_MARKERS = new Set(['#', '$', '-', '.', ':', '=', '[', '`', ')', '|']);
const RESTORABLE_AUTHORED_ESCAPE_MARKERS = new Set([
  '!', '"', '#', '$', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/', ':',
  ';', '<', '=', '>', '?', '@', '[', ']', '^', '_', '`', '{', '|', '}', '~',
]);
const INLINE_DELIMITER_MARKERS = new Set(['$', '*', '+', '=', '^', '_', '`', '{', '}', '~']);
const MARKDOWN_CONTAINER_PREFIX_PATTERN =
  /^[ \t]*(?:(?:>[ \t]*)|(?:(?:[-+*]|\d+[.)]|\[\^[^\]]+\]:|:)[ \t]+))*/;
const STANDALONE_OPEN_BRACKET_PATTERN =
  /^[ \t]*(?:>[ \t]*)*(?:(?:[-+*]|\d+[.)]|\[\^[^\]]+\]:|:)[ \t]+)?\[[ \t]*$/;
const LINK_DESTINATION_PATTERN = new RegExp(`^(${MARKDOWN_LINK_DESTINATION_SOURCE})`);
const INLINE_LINK_PATTERN = new RegExp(MARKDOWN_LINK_PATTERN_GLOBAL.source, 'g');

function getInlineLinkStyleKey(
  line: string,
  index: number,
  label: string,
  target: string,
): string {
  const kind = line[index - 1] === '!' ? 'image' : 'link';
  return `${kind}\u0000${label}\u0000${getMarkdownLinkHref(target)}`;
}

function collectLinkAmpersandEscapeStyles(markdown: string): Map<string, boolean[]> {
  const styles = new Map<string, boolean[]>();
  for (const line of collectMarkdownSourceStyleLines(markdown)) {
    if (line.protected) continue;
    for (const match of line.text.matchAll(INLINE_LINK_PATTERN)) {
      const target = match[2] ?? '';
      const destination = LINK_DESTINATION_PATTERN.exec(target)?.[1] ?? '';
      if (!destination.includes('&')) continue;
      const key = getInlineLinkStyleKey(line.text, match.index ?? 0, match[1] ?? '', target);
      const values = styles.get(key) ?? [];
      values.push(destination.includes('\\&'));
      styles.set(key, values);
    }
  }
  return styles;
}

function restoreLinkAmpersandEscapeStyles(markdown: string, reference: string): string {
  if (!markdown.includes('\\&')) return markdown;
  const styles = collectLinkAmpersandEscapeStyles(reference);
  const styleIndexes = new Map<string, number>();
  const lines = collectMarkdownSourceStyleLines(markdown);

  for (const line of lines) {
    if (line.protected) continue;
    line.text = line.text.replace(
      INLINE_LINK_PATTERN,
      (raw, label: string, target: string, offset: number, source: string) => {
        const destination = LINK_DESTINATION_PATTERN.exec(target)?.[1] ?? '';
        if (!destination.includes('\\&')) return raw;

        const key = getInlineLinkStyleKey(source, offset, label, target);
        const styleIndex = styleIndexes.get(key) ?? 0;
        styleIndexes.set(key, styleIndex + 1);
        if (styles.get(key)?.[styleIndex] === true) return raw;

        const targetIndex = raw.lastIndexOf(target);
        const restoredTarget = `${destination.replaceAll('\\&', '&')}${target.slice(destination.length)}`;
        return `${raw.slice(0, targetIndex)}${restoredTarget}${raw.slice(targetIndex + target.length)}`;
      },
    );
  }

  return lines.map((line) => line.text).join('\n');
}

function isStandaloneEscapedOpenBracket(serialized: string, reference: string): boolean {
  if (!STANDALONE_OPEN_BRACKET_PATTERN.test(reference)) return false;
  const markerIndex = serialized.lastIndexOf('\\[');
  return markerIndex !== -1
    && `${serialized.slice(0, markerIndex)}${serialized.slice(markerIndex + 1)}` === reference;
}

function canRestoreSerializerEscape(marker: string, reference: string): boolean {
  if (!RESTORABLE_SERIALIZER_ESCAPE_MARKERS.has(marker)) return false;
  return (marker !== '$' && marker !== '`') || !reference.includes(`\\${marker}`);
}

function wouldChangeBlockSyntax(reference: string, slashIndex: number, marker: string): boolean {
  const prefix = reference.slice(0, slashIndex).replace(MARKDOWN_CONTAINER_PREFIX_PATTERN, '');
  let runEnd = slashIndex + 2;
  while (reference[runEnd] === marker) runEnd += 1;
  const afterRun = reference[runEnd];
  const runLength = runEnd - slashIndex - 1;

  if (
    (marker === '.' || marker === ')')
    && /^\d{1,9}$/.test(prefix)
    && Boolean(afterRun && /\s/u.test(afterRun))
  ) {
    return true;
  }
  if (prefix.length > 0) return false;
  if (marker === '>') return true;
  if (marker === '#' && (!afterRun || /[ \t]/.test(afterRun))) return true;
  if ((marker === '*' || marker === '+' || marker === '-') && runLength === 1 && /[ \t]/.test(afterRun ?? '')) {
    return true;
  }
  if ((marker === '*' || marker === '_' || marker === '-') && runLength >= 3 && reference.slice(runEnd).trim() === '') {
    return true;
  }
  if ((marker === '=' || marker === '-') && runLength >= 2 && reference.slice(runEnd).trim() === '') {
    return true;
  }
  if (marker === '$' && runLength >= 2 && reference.slice(runEnd).trim() === '') return true;
  if (marker === ':' && /[ \t]/.test(afterRun ?? '')) return true;
  return (marker === '[' || marker === ']') && reference.slice(slashIndex + 2).trim() === '';
}

function canRestoreAuthoredEscape(reference: string, slashIndex: number): boolean {
  const marker = reference[slashIndex + 1] ?? '';
  if (!RESTORABLE_AUTHORED_ESCAPE_MARKERS.has(marker)) return false;
  if (wouldChangeBlockSyntax(reference, slashIndex, marker)) return false;
  if (isRedundantMarkdownEscape(reference, slashIndex, marker)) return true;
  if (
    INLINE_DELIMITER_MARKERS.has(marker)
    && !isSingleMarkerRunInCurrentTextToken(reference, slashIndex, marker)
  ) {
    return false;
  }

  if (marker === '!') return reference[slashIndex + 2] !== '[';
  if (marker === '&' || marker === '@') return false;
  if (marker === '[') return reference.indexOf(']', slashIndex + 2) === -1;
  if (marker === ']') return reference.lastIndexOf('[', slashIndex - 1) === -1;
  if (marker === '<') return reference.indexOf('>', slashIndex + 2) === -1;
  if (marker === '>') return reference.lastIndexOf('<', slashIndex - 1) === -1;
  if (marker === ')') return reference.lastIndexOf('(', slashIndex - 1) === -1;
  if (marker === '{') return reference.indexOf('}', slashIndex + 2) === -1;
  if (marker === '}') return reference.lastIndexOf('{', slashIndex - 1) === -1;
  if (marker === '|') return countMarkerRunsInRange(reference, marker, 0, reference.length) === 1;
  return true;
}

function restoreLineEscapes(serialized: string, reference: string): string | null {
  if (isStandaloneEscapedOpenBracket(serialized, reference)) {
    return serialized;
  }

  let serializedIndex = 0;
  let referenceIndex = 0;

  while (serializedIndex < serialized.length && referenceIndex < reference.length) {
    if (
      serialized[serializedIndex] === '\\'
      && reference[referenceIndex] === '\\'
      && reference[referenceIndex + 1] === '\\'
      && serialized[serializedIndex + 1] !== '\\'
    ) {
      serializedIndex += 1;
      referenceIndex += 2;
      continue;
    }
    if (serialized[serializedIndex] === reference[referenceIndex]) {
      serializedIndex += 1;
      referenceIndex += 1;
      continue;
    }
    if (
      serialized[serializedIndex] === '\\'
      && serialized[serializedIndex + 1] === reference[referenceIndex]
      && canRestoreSerializerEscape(serialized[serializedIndex + 1] ?? '', reference)
    ) {
      serializedIndex += 2;
      referenceIndex += 1;
      continue;
    }
    if (
      reference[referenceIndex] === '\\'
      && reference[referenceIndex + 1] === serialized[serializedIndex]
      && canRestoreAuthoredEscape(reference, referenceIndex)
    ) {
      serializedIndex += 1;
      referenceIndex += 2;
      continue;
    }
    return null;
  }

  return serializedIndex === serialized.length && referenceIndex === reference.length
    ? reference
    : null;
}

function findReferenceLineOffset(
  serializedLine: string,
  referenceLines: readonly string[],
  startIndex: number,
): number | null {
  const endIndex = Math.min(referenceLines.length, startIndex + LINE_ALIGNMENT_LOOKAHEAD + 1);
  for (let index = startIndex + 1; index < endIndex; index += 1) {
    if (restoreLineEscapes(serializedLine, referenceLines[index] ?? '') !== null) {
      return index - startIndex;
    }
  }
  return null;
}

function findSerializedLineOffset(
  serializedLines: readonly string[],
  startIndex: number,
  referenceLine: string,
): number | null {
  const endIndex = Math.min(serializedLines.length, startIndex + LINE_ALIGNMENT_LOOKAHEAD + 1);
  for (let index = startIndex + 1; index < endIndex; index += 1) {
    if (restoreLineEscapes(serializedLines[index] ?? '', referenceLine) !== null) {
      return index - startIndex;
    }
  }
  return null;
}

export function restoreUnrequestedMarkdownEscapesFromReference(
  markdown: string,
  referenceMarkdown: string,
): string {
  if (!markdown.includes('\\') && !referenceMarkdown.includes('\\')) return markdown;

  const markdownWithLinkStyles = restoreLinkAmpersandEscapeStyles(markdown, referenceMarkdown);
  if (referenceMarkdown.length === 0) return markdownWithLinkStyles;

  const markdownLines = markdownWithLinkStyles.split('\n');
  const referenceLines = referenceMarkdown.replace(/\r\n?/g, '\n').split('\n');
  const output: string[] = [];
  let markdownIndex = 0;
  let referenceIndex = 0;

  while (markdownIndex < markdownLines.length) {
    const line = markdownLines[markdownIndex] ?? '';
    const referenceLine = referenceLines[referenceIndex];
    if (referenceLine === undefined) {
      output.push(line);
      markdownIndex += 1;
      continue;
    }

    const restored = restoreLineEscapes(line, referenceLine);
    if (restored !== null) {
      output.push(restored);
      markdownIndex += 1;
      referenceIndex += 1;
      continue;
    }

    const referenceOffset = line.length === 0
      ? null
      : findReferenceLineOffset(line, referenceLines, referenceIndex);
    const markdownOffset = referenceLine.length === 0
      ? null
      : findSerializedLineOffset(markdownLines, markdownIndex, referenceLine);
    if (referenceOffset !== null && (markdownOffset === null || referenceOffset < markdownOffset)) {
      referenceIndex += referenceOffset;
      continue;
    }

    output.push(line);
    markdownIndex += 1;
    if (markdownOffset === null) referenceIndex += 1;
  }

  return output.join('\n');
}
