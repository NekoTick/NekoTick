import { extractNoteTagOccurrences, extractNoteTags } from '@/lib/notes/tags';
import { getNoteTagOccurrences } from '@/lib/notes/noteTextAnalysis';
import { stripManagedFrontmatter } from '@/stores/notes/frontmatter';
import type { NotesSidebarTagScopeEntry } from './notesSidebarTagScope';
export {
  buildNotesSidebarTagScopeEntries,
  type NotesSidebarTagScopeEntry,
} from './notesSidebarTagScope';

export interface NotesSidebarTagPath {
  path: string;
  query: string;
  contentMatchOrdinal: number;
}

export interface NotesSidebarTagEntry {
  tag: string;
  count: number;
  paths: NotesSidebarTagPath[];
}

export interface NotesSidebarTagPathIndexEntry {
  contentSignature: string;
  contentIdentity?: object;
  tags: Map<string, NotesSidebarTagPath>;
}

export interface NotesSidebarTagIndex {
  paths: Map<string, NotesSidebarTagPathIndexEntry>;
  tags: Map<string, Map<string, NotesSidebarTagPath>>;
}

const MAX_SIDEBAR_TAGS = 200;
const TAG_CONTENT_SIGNATURE_SAMPLE_CHARS = 256;

function createContentSignature(content: string): string {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const head = content.slice(0, TAG_CONTENT_SIGNATURE_SAMPLE_CHARS);
  const tail = content.slice(-TAG_CONTENT_SIGNATURE_SAMPLE_CHARS);
  return `${content.length}:${hash >>> 0}:${head}:${tail}`;
}

function createTagRelevantContentSignature(content: string): string {
  return createContentSignature(stripManagedFrontmatter(content));
}

export function extractNotesSidebarTags(content: string): string[] {
  return extractNoteTags(content);
}

export function buildNotesSidebarTags(
  entries: readonly NotesSidebarTagScopeEntry[],
  getNoteContent: (path: string) => string | undefined,
): NotesSidebarTagEntry[] {
  const index = createNotesSidebarTagIndex();
  reconcileNotesSidebarTagIndex(index, entries, getNoteContent);
  return buildNotesSidebarTagsFromTagIndex(index);
}

export function buildNotesSidebarTagPathIndexEntry(
  path: string,
  content: string,
  contentIdentity?: object,
): NotesSidebarTagPathIndexEntry {
  const tags = new Map<string, NotesSidebarTagPath>();

  const occurrences = contentIdentity
    ? getNoteTagOccurrences(contentIdentity, content)
    : extractNoteTagOccurrences(content);
  for (const occurrence of occurrences) {
    if (!tags.has(occurrence.tag)) {
      tags.set(occurrence.tag, {
        path,
        query: occurrence.token,
        contentMatchOrdinal: occurrence.matchOrdinal,
      });
    }
  }

  return {
    contentSignature: createTagRelevantContentSignature(content),
    ...(contentIdentity ? { contentIdentity } : {}),
    tags,
  };
}

export function reconcileNotesSidebarTagPathIndex(
  index: Map<string, NotesSidebarTagPathIndexEntry>,
  entries: readonly NotesSidebarTagScopeEntry[],
  getNoteContent: (path: string) => string | undefined,
): Map<string, NotesSidebarTagPathIndexEntry> {
  const scopedPaths = new Set(entries.map((entry) => entry.path));

  for (const path of index.keys()) {
    if (!scopedPaths.has(path)) {
      index.delete(path);
    }
  }

  for (const entry of entries) {
    const content = getNoteContent(entry.path);
    if (content === undefined) {
      index.delete(entry.path);
      continue;
    }

    const indexed = index.get(entry.path);
    const contentSignature = createTagRelevantContentSignature(content);
    if (indexed?.contentSignature === contentSignature) {
      continue;
    }

    index.set(entry.path, buildNotesSidebarTagPathIndexEntry(entry.path, content));
  }

  return index;
}

export function createNotesSidebarTagIndex(): NotesSidebarTagIndex {
  return {
    paths: new Map(),
    tags: new Map(),
  };
}

function removePathFromTagIndex(index: NotesSidebarTagIndex, path: string) {
  const existing = index.paths.get(path);
  if (!existing) {
    return;
  }

  for (const tag of existing.tags.keys()) {
    const paths = index.tags.get(tag);
    if (!paths) {
      continue;
    }

    paths.delete(path);
    if (paths.size === 0) {
      index.tags.delete(tag);
    }
  }

  index.paths.delete(path);
}

function addPathToTagIndex(
  index: NotesSidebarTagIndex,
  path: string,
  pathIndexEntry: NotesSidebarTagPathIndexEntry,
) {
  index.paths.set(path, pathIndexEntry);

  for (const [tag, tagPath] of pathIndexEntry.tags) {
    const paths = index.tags.get(tag) ?? new Map<string, NotesSidebarTagPath>();
    paths.set(path, tagPath);
    index.tags.set(tag, paths);
  }
}

export function reconcileNotesSidebarTagIndexPath(
  index: NotesSidebarTagIndex,
  path: string,
  content: string | undefined,
  contentIdentity?: object,
): NotesSidebarTagIndex {
  if (content === undefined) {
    removePathFromTagIndex(index, path);
    return index;
  }

  const indexed = index.paths.get(path);
  if (contentIdentity && indexed?.contentIdentity === contentIdentity) {
    return index;
  }

  const contentSignature = createTagRelevantContentSignature(content);
  if (indexed?.contentSignature === contentSignature) {
    if (contentIdentity && indexed.contentIdentity !== contentIdentity) {
      indexed.contentIdentity = contentIdentity;
    }
    return index;
  }

  removePathFromTagIndex(index, path);
  addPathToTagIndex(
    index,
    path,
    buildNotesSidebarTagPathIndexEntry(path, content, contentIdentity),
  );
  return index;
}

export function reconcileNotesSidebarTagIndex(
  index: NotesSidebarTagIndex,
  entries: readonly NotesSidebarTagScopeEntry[],
  getNoteContent: (path: string) => string | undefined,
  getNoteContentIdentity?: (path: string) => object | undefined,
): NotesSidebarTagIndex {
  const scopedPaths = new Set(entries.map((entry) => entry.path));

  for (const path of index.paths.keys()) {
    if (!scopedPaths.has(path)) {
      removePathFromTagIndex(index, path);
    }
  }

  for (const entry of entries) {
    const contentIdentity = getNoteContentIdentity?.(entry.path);
    reconcileNotesSidebarTagIndexPath(
      index,
      entry.path,
      getNoteContent(entry.path),
      contentIdentity,
    );
  }

  return index;
}

export function buildNotesSidebarTagsFromTagIndex(
  index: NotesSidebarTagIndex,
): NotesSidebarTagEntry[] {
  return Array.from(index.tags.entries())
    .map(([tag, paths]) => ({
      tag,
      count: paths.size,
      paths: Array.from(paths.values()).sort((a, b) => a.path.localeCompare(b.path)),
    }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, MAX_SIDEBAR_TAGS);
}
