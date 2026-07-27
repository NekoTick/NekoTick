import { mapMarkdownOutsideProtectedBlocks } from './markdownProtectedBlocks';

interface HardBreakLine {
  index: number;
  key: string;
  marker: string;
  prefix: string;
}

export function restoreHardBreakStyleFromReference(
  markdown: string,
  referenceMarkdown?: string,
): string {
  if (!referenceMarkdown) return markdown;

  const references = collectHardBreakLines(referenceMarkdown);
  if (references.length === 0) return markdown;

  const referenceMarkers = new Map<string, string[]>();
  for (const reference of references) {
    const markers = referenceMarkers.get(reference.key) ?? [];
    markers.push(reference.marker);
    referenceMarkers.set(reference.key, markers);
  }

  const normalizedMarkdown = markdown.replace(/\r\n?/g, '\n');
  const lines = normalizedMarkdown.split('\n');
  let changed = false;
  for (const hardBreak of collectHardBreakLines(normalizedMarkdown)) {
    const referenceMarker = referenceMarkers.get(hardBreak.key)?.shift();
    if (!referenceMarker || referenceMarker === hardBreak.marker) continue;
    lines[hardBreak.index] = `${hardBreak.prefix}${referenceMarker}`;
    changed = true;
  }

  return changed ? lines.join('\n') : markdown;
}

function collectHardBreakLines(markdown: string): HardBreakLine[] {
  const normalizedMarkdown = markdown.replace(/\r\n?/g, '\n');
  const hardBreaks: HardBreakLine[] = [];

  mapMarkdownOutsideProtectedBlocks(normalizedMarkdown, (line, index, lines) => {
    const parsed = parseHardBreakLine(line);
    const nextLine = lines[index + 1];
    if (parsed && nextLine !== undefined && nextLine.trim() !== '') {
      hardBreaks.push({
        index,
        key: `${parsed.prefix}\n${nextLine}`,
        marker: parsed.marker,
        prefix: parsed.prefix,
      });
    }
    return line;
  });

  return hardBreaks;
}

function parseHardBreakLine(line: string): { marker: string; prefix: string } | null {
  const trailingSpaces = / {2,}$/.exec(line)?.[0];
  if (trailingSpaces) {
    return {
      marker: trailingSpaces,
      prefix: line.slice(0, -trailingSpaces.length),
    };
  }

  const trailingBackslashes = /\\+$/.exec(line)?.[0];
  if (!trailingBackslashes || trailingBackslashes.length % 2 === 0) return null;
  return {
    marker: trailingBackslashes,
    prefix: line.slice(0, -trailingBackslashes.length),
  };
}
