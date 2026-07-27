import { collectMarkdownSourceStyleLines } from './markdownSourceStyleLines';
import { collectMarkdownProtectedLineInfo } from './markdownFenceProtectedLines';

interface ParsedListMarkerLine {
  delimiter?: '.' | ')';
  key: string;
  marker: string;
}

const LIST_MARKER_LINE_PATTERN =
  /^((?: {0,3}>[ \t]?)*[ \t]*)([-+*]|\d{1,9}[.)])([ \t]+(?:\[(?: |x|X)\][ \t]+)?)(.*)$/;

export function restoreListMarkerStyleFromReference(
  markdown: string,
  referenceMarkdown?: string,
): string {
  if (!referenceMarkdown) return markdown;

  const normalizedReference = referenceMarkdown.replace(/\r\n?/g, '\n');
  const referenceLines = collectMarkdownSourceStyleLines(normalizedReference);
  const referenceOpenLines = collectMarkdownProtectedLineInfo(
    normalizedReference.split('\n')
  ).containerBlockOpenLineIndexes;
  const referenceStyles = new Map<string, ParsedListMarkerLine[]>();
  for (let index = 0; index < referenceLines.length; index += 1) {
    const line = referenceLines[index];
    if (!line || (line.protected && !referenceOpenLines.has(index))) continue;
    const parsed = parseListMarkerLine(line.text);
    if (!parsed) continue;
    const styles = referenceStyles.get(parsed.key) ?? [];
    styles.push(parsed);
    referenceStyles.set(parsed.key, styles);
  }
  if (referenceStyles.size === 0) return markdown;

  const normalizedMarkdown = markdown.replace(/\r\n?/g, '\n');
  const lines = collectMarkdownSourceStyleLines(normalizedMarkdown);
  const outputOpenLines = collectMarkdownProtectedLineInfo(
    normalizedMarkdown.split('\n')
  ).containerBlockOpenLineIndexes;
  let changed = false;
  const output = lines.map((line, index) => {
    if (line.protected && !outputOpenLines.has(index)) return line.text;

    const parsed = parseListMarkerLine(line.text);
    if (!parsed) return line.text;

    const reference = referenceStyles.get(parsed.key)?.shift();
    if (!reference || reference.marker === parsed.marker) return line.text;

    changed = true;
    return line.text.replace(LIST_MARKER_LINE_PATTERN, (_match, prefix: string, marker: string, spacing: string, content: string) => {
      if (isOrderedMarker(marker) && isOrderedMarker(reference.marker)) {
        return `${prefix}${reference.marker}${spacing}${content}`;
      }
      if (!isOrderedMarker(marker) && !isOrderedMarker(reference.marker)) {
        return `${prefix}${reference.marker}${spacing}${content}`;
      }
      return line.text;
    });
  });

  return changed ? output.join('\n') : markdown;
}

function parseListMarkerLine(line: string): ParsedListMarkerLine | null {
  const match = LIST_MARKER_LINE_PATTERN.exec(line);
  if (!match) return null;

  const marker = match[2] ?? '';
  const spacing = match[3] ?? '';
  const content = match[4] ?? '';
  const listType = isOrderedMarker(marker) ? 'ordered' : 'bullet';
  const container = (match[1] ?? '').replace(/[ \t]+$/g, '');
  const task = /^\[(?: |x|X)\]/.exec(spacing.trimStart())?.[0]?.toLowerCase() ?? '';
  const normalizedContent = content.trim();
  const key = `${container}\u0000${listType}\u0000${task}\u0000${normalizedContent}`;

  return {
    delimiter: isOrderedMarker(marker) ? marker.at(-1) as '.' | ')' : undefined,
    key,
    marker,
  };
}

function isOrderedMarker(marker: string): boolean {
  return /\d[.)]$/.test(marker);
}
