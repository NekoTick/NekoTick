import type { NoteCoverMetadata, NoteMetadataEntry } from './types';
import { normalizeNoteCoverMetadata } from './frontmatterCover';
import { normalizeStandardNoteIconValue } from '@/lib/notes/iconValue';
import {
  KEY_COVER,
  KEY_CREATED,
  KEY_ICON,
  KEY_UPDATED,
  MANAGED_FRONTMATTER_PREFIX,
  MANAGED_KEYS,
} from './frontmatterKeys';
import {
  FRONTMATTER_DELIMITER,
  hasTrailingLineEnding,
  normalizeLineEndings,
  parseTopLevelKey,
  parseYamlScalar,
  removeLeadingBlankLine,
  splitLeadingFrontmatter,
  trimTrailingBlankLines,
} from './frontmatterParsing';
import {
  formatCoverLayout,
  formatIconValue,
  getInlineNumber,
  parseLeadingInlineValue,
} from './frontmatterInline';

const MIN_NOTE_ICON_SIZE = 20;
const MAX_NOTE_ICON_SIZE = 150;

function normalizeCover(cover: NoteCoverMetadata | null | undefined): NoteCoverMetadata | undefined {
  return normalizeNoteCoverMetadata(cover);
}

function normalizeStoredIcon(icon: unknown): string | undefined {
  return normalizeStandardNoteIconValue(icon) ?? undefined;
}

function normalizeIconSize(size: unknown): number | undefined {
  let value = Number.NaN;
  if (typeof size === 'number') {
    value = size;
  } else if (typeof size === 'string' && size.length <= 64) {
    const trimmed = size.trim();
    value = /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  }
  if (!Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(MAX_NOTE_ICON_SIZE, Math.max(MIN_NOTE_ICON_SIZE, value));
}

export function normalizeNoteMetadataEntry(
  entry: Partial<NoteMetadataEntry> | null | undefined
): NoteMetadataEntry {
  if (!entry) {
    return {};
  }

  const normalized: NoteMetadataEntry = {};
  const icon = normalizeStoredIcon(entry.icon);

  if (icon) {
    normalized.icon = icon;
    const iconSize = normalizeIconSize(entry.iconSize);
    if (iconSize !== undefined) {
      normalized.iconSize = iconSize;
    }
  }

  const cover = normalizeCover(entry.cover);
  if (cover) {
    normalized.cover = cover;
  }

  if (typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)) {
    normalized.createdAt = entry.createdAt;
  }

  if (typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt)) {
    normalized.updatedAt = entry.updatedAt;
  }

  return normalized;
}

export function readNoteMetadataFromMarkdown(markdown: string): NoteMetadataEntry {
  const { lines } = splitLeadingFrontmatter(markdown);
  if (lines.length === 0) {
    return {};
  }

  const parsedValues = new Map<string, string | number | null>();
  const rawValues = new Map<string, string>();

  for (const line of lines) {
    const key = parseTopLevelKey(line);
    if (!key || !MANAGED_KEYS.has(key)) {
      continue;
    }

    const separatorIndex = line.indexOf(':');
    const rawValue = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : '';
    parsedValues.set(key, parseYamlScalar(rawValue));
    rawValues.set(key, rawValue);
  }

  const coverValue = parsedValues.get(KEY_COVER);
  const normalized: NoteMetadataEntry = {};

  const rawIconValue = parsedValues.get(KEY_ICON);
  const rawIconSource = rawValues.get(KEY_ICON) ?? '';
  if (!/^\s*value\s*=/.test(rawIconSource)) {
    const inlineIcon = parseLeadingInlineValue(rawIconSource);
    const iconValue = inlineIcon?.value ?? rawIconValue;
    const icon = normalizeStoredIcon(iconValue);
    if (icon) {
      normalized.icon = icon;
      const iconSize = normalizeIconSize(
        inlineIcon ? getInlineNumber(inlineIcon.fields, 'size') : undefined
      );
      if (iconSize !== undefined) {
        normalized.iconSize = iconSize;
      }
    }
  }

  if (
    typeof coverValue === 'string'
    && coverValue
    && !/^\s*asset\s*=/.test(rawValues.get(KEY_COVER) ?? '')
  ) {
    const inlineCover = parseLeadingInlineValue(rawValues.get(KEY_COVER));
    const coverLayout = {
      positionX: inlineCover ? getInlineNumber(inlineCover.fields, 'x') : undefined,
      positionY: inlineCover ? getInlineNumber(inlineCover.fields, 'y') : undefined,
      height: inlineCover ? getInlineNumber(inlineCover.fields, 'height') : undefined,
      scale: inlineCover ? getInlineNumber(inlineCover.fields, 'scale') : undefined,
    };
    if (inlineCover?.value) {
      normalized.cover = normalizeCover({
        assetPath: inlineCover.value,
        positionX: coverLayout.positionX,
        positionY: coverLayout.positionY,
        height: coverLayout.height,
        scale: coverLayout.scale,
      });
    }
  }

  return normalizeNoteMetadataEntry(normalized);
}

export function stripManagedFrontmatter(markdown: string): string {
  const { lines, body, hasFrontmatter } = splitLeadingFrontmatter(markdown, { includeBody: true });
  if (!hasFrontmatter) {
    return normalizeLineEndings(markdown);
  }

  const visibleFrontmatterLines = trimTrailingBlankLines(
    lines.filter((line) => {
      const key = parseTopLevelKey(line);
      return !key || !key.startsWith(MANAGED_FRONTMATTER_PREFIX);
    }),
  );

  if (visibleFrontmatterLines.length === 0) {
    return removeLeadingBlankLine(body);
  }

  return [
    FRONTMATTER_DELIMITER,
    ...visibleFrontmatterLines,
    FRONTMATTER_DELIMITER,
    body,
  ].join('\n');
}

export function stripUpdatedFrontmatter(markdown: string): string {
  const { lines, body, hasFrontmatter } = splitLeadingFrontmatter(markdown, { includeBody: true });
  if (!hasFrontmatter) {
    return normalizeLineEndings(markdown);
  }

  const comparableFrontmatterLines = trimTrailingBlankLines(
    lines.filter((line) => {
      const key = parseTopLevelKey(line);
      return key !== KEY_CREATED && key !== KEY_UPDATED;
    }),
  );

  if (comparableFrontmatterLines.length === 0) {
    return removeLeadingBlankLine(body);
  }

  return [
    FRONTMATTER_DELIMITER,
    ...comparableFrontmatterLines,
    FRONTMATTER_DELIMITER,
    body,
  ].join('\n');
}

export function writeNoteMetadataToMarkdown(
  markdown: string,
  entry: Partial<NoteMetadataEntry> | null | undefined
): string {
  const normalizedEntry = normalizeNoteMetadataEntry(entry);
  const { lines, body, hasFrontmatter } = splitLeadingFrontmatter(markdown, { includeBody: true });
  const preservedLines = lines.filter((line) => {
    const key = parseTopLevelKey(line);
    return !key || !MANAGED_KEYS.has(key);
  });

  const managedLines: string[] = [];
  const cover = normalizedEntry.cover;

  if (cover?.assetPath) {
    managedLines.push(`${KEY_COVER}: ${formatCoverLayout(cover)}`);
  }

  if (normalizedEntry.icon) {
    managedLines.push(`${KEY_ICON}: ${formatIconValue(normalizedEntry.icon, normalizedEntry.iconSize)}`);
  }

  const nextFrontmatterLines = [...preservedLines];
  if (
    preservedLines.length > 0
    && managedLines.length > 0
    && preservedLines[preservedLines.length - 1]?.trim() !== ''
  ) {
    nextFrontmatterLines.push('');
  }
  nextFrontmatterLines.push(...managedLines);

  if (nextFrontmatterLines.length === 0) {
    return hasFrontmatter ? removeLeadingBlankLine(body) : normalizeLineEndings(markdown);
  }

  const frontmatterBlock = [
    FRONTMATTER_DELIMITER,
    ...nextFrontmatterLines,
    FRONTMATTER_DELIMITER,
  ].join('\n');

  if (!body) {
    return hasFrontmatter && hasTrailingLineEnding(markdown) ? `${frontmatterBlock}\n` : frontmatterBlock;
  }

  return hasFrontmatter
    ? `${frontmatterBlock}\n${body}`
    : `${frontmatterBlock}\n\n${body}`;
}

export function updateNoteMetadataInMarkdown(
  markdown: string,
  updates: Partial<NoteMetadataEntry> | null | undefined
): { content: string; metadata: NoteMetadataEntry } {
  const current = readNoteMetadataFromMarkdown(markdown);
  const merged = normalizeNoteMetadataEntry({
    ...current,
    ...updates,
    cover:
      updates && 'cover' in updates
        ? updates.cover ?? undefined
        : current.cover,
  });
  const content = writeNoteMetadataToMarkdown(markdown, merged);
  return {
    content,
    metadata: readNoteMetadataFromMarkdown(content),
  };
}
