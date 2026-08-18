import type { StarredEntry } from '@/stores/notes/types';
import type { FileTreeNode, FolderNode } from '@/stores/useNotesStore';
import {
  getNotesSidebarContentMatches,
  MAX_CONTENT_SEARCH_SCANNED_CHARS,
} from './notesSidebarContentSearch';
import { collectStarredSearchEntries } from './notesSidebarStarredSearchEntries';
import {
  attachSearchEntryMetadata,
  attachSearchIndexMetadata,
  getContentSearchEntriesByPath,
  getSearchEntryMetadata,
} from './notesSidebarSearchMetadata';
import { isSupportedMarkdownPath } from '@/lib/notes/markdownFile';
import { hasInternalNotePathSegment } from '@/stores/notes/utils/fs/internalNotePaths';
import { normalizeNotesRootRelativePath } from '@/stores/notes/utils/fs/notesRootPathContainment';

export interface NotesSidebarSearchEntry {
  path: string;
  openPath?: string;
  name: string;
  preview: string;
  isExternal?: boolean;
  contentSearchable?: boolean;
}

export interface NotesSidebarSearchResult extends NotesSidebarSearchEntry {
  id: string;
  matchIndex: number;
  matchKind: 'name' | 'path' | 'content';
  contentSnippet: string | null;
  contentMatchOrdinal: number | null;
}

export interface NotesSidebarSearchIndexOptions {
  starredEntries?: StarredEntry[];
  currentNotesRootPath?: string | null;
}

const CONTENT_SEARCH_MIN_QUERY_LENGTH = 2;
export const NOTES_SIDEBAR_MAX_SEARCH_QUERY_CHARS = 4096;
export const NOTES_SIDEBAR_MAX_SEARCH_RESULTS = 200;
export const NOTES_SIDEBAR_MAX_CONTENT_SEARCH_ENTRIES = 1000;
export const NOTES_SIDEBAR_MAX_CONTENT_SEARCH_CHARS = 16 * 1024 * 1024;
const MAX_SEARCH_INDEX_TREE_ENTRIES = 10_000;

function collectNotesSidebarSearchEntries(
  children: FileTreeNode[],
  getDisplayName: (path: string) => string,
) {
  const bucket: NotesSidebarSearchEntry[] = [];
  const stack = children
    .slice()
    .reverse()
    .map((node) => ({ node, parentPath: '' }));

  while (stack.length > 0 && bucket.length < MAX_SEARCH_INDEX_TREE_ENTRIES) {
    const { node, parentPath } = stack.pop()!;
    if (node.isFolder) {
      const normalizedFolderPath = normalizeNotesRootRelativePath(node.path, { allowEmpty: true });
      if (normalizedFolderPath === null || hasInternalNotePathSegment(normalizedFolderPath)) {
        continue;
      }

      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        stack.push({ node: node.children[index], parentPath: normalizedFolderPath });
      }
      continue;
    }

    const normalizedPath = normalizeNotesRootRelativePath(node.path);
    if (
      normalizedPath &&
      !hasInternalNotePathSegment(normalizedPath) &&
      isSupportedMarkdownPath(normalizedPath)
    ) {
      bucket.push(attachSearchEntryMetadata({
        path: normalizedPath,
        name: getDisplayName(normalizedPath) || node.name,
        preview: parentPath ? `${parentPath}/` : '',
      }));
    }
  }

  return bucket;
}

export function buildNotesSidebarSearchIndex(
  rootFolder: FolderNode | null,
  getDisplayName: (path: string) => string,
  options: NotesSidebarSearchIndexOptions = {},
): NotesSidebarSearchEntry[] {
  const treeEntries = rootFolder
    ? collectNotesSidebarSearchEntries(rootFolder.children, getDisplayName)
    : [];

  if (!options.starredEntries?.length) {
    return attachSearchIndexMetadata(treeEntries);
  }

  return attachSearchIndexMetadata([
    ...treeEntries,
    ...collectStarredSearchEntries(
      options.starredEntries,
      options.currentNotesRootPath,
      new Set(treeEntries.map((entry) => entry.path)),
    ).map(attachSearchEntryMetadata),
  ]);
}

export function countNotesSidebarSearchEntries(rootFolder: FolderNode | null): number {
  if (!rootFolder) {
    return 0;
  }

  return collectNotesSidebarSearchEntries(rootFolder.children, () => '').length;
}

export function shouldSearchNotesSidebarContents(query: string): boolean {
  if (query.length > NOTES_SIDEBAR_MAX_SEARCH_QUERY_CHARS) {
    return false;
  }

  return query.trim().length >= CONTENT_SEARCH_MIN_QUERY_LENGTH;
}

function getBoundedTrimmedSearchQuery(query: string): string | null {
  if (query.length > NOTES_SIDEBAR_MAX_SEARCH_QUERY_CHARS) {
    return null;
  }

  const trimmedQuery = query.trim();
  return trimmedQuery ? trimmedQuery : null;
}

function compareSearchResults(a: NotesSidebarSearchResult, b: NotesSidebarSearchResult): number {
  if (a.matchKind !== b.matchKind) {
    const rank = { name: 0, path: 1, content: 2 };
    return rank[a.matchKind] - rank[b.matchKind];
  }

  if (a.path !== b.path) {
    return a.path.localeCompare(b.path);
  }

  return (
    a.matchIndex - b.matchIndex ||
    (a.contentMatchOrdinal ?? -1) - (b.contentMatchOrdinal ?? -1) ||
    a.name.localeCompare(b.name)
  );
}

export function queryNotesSidebarSearch(
  index: NotesSidebarSearchEntry[],
  query: string,
  getNoteContent?: (path: string) => string | undefined,
  structuralResults = queryNotesSidebarStructuralSearch(index, query),
  getNoteContentIdentity?: (path: string) => object | undefined,
): NotesSidebarSearchResult[] {
  const session = createNotesSidebarSearchSession(
    index,
    query,
    getNoteContent,
    structuralResults,
    getNoteContentIdentity,
  );
  let result = session.runBatch(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  while (!result.done) {
    result = session.runBatch(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  }
  return result.results;
}

export function createNotesSidebarSearchSession(
  index: NotesSidebarSearchEntry[],
  query: string,
  getNoteContent?: (path: string) => string | undefined,
  structuralResults = queryNotesSidebarStructuralSearch(index, query),
  getNoteContentIdentity?: (path: string) => object | undefined,
) {
  const trimmedQuery = getBoundedTrimmedSearchQuery(query);
  const boundedStructuralResults = trimmedQuery
    ? structuralResults.slice(0, NOTES_SIDEBAR_MAX_SEARCH_RESULTS)
    : [];
  const canSearchContent = Boolean(
    trimmedQuery &&
    shouldSearchNotesSidebarContents(trimmedQuery) &&
    getNoteContent &&
    structuralResults.length < NOTES_SIDEBAR_MAX_SEARCH_RESULTS
  );
  const lowerQuery = trimmedQuery?.toLocaleLowerCase() ?? '';

  const contentResults: NotesSidebarSearchResult[] = [];
  const contentResultLimit = NOTES_SIDEBAR_MAX_SEARCH_RESULTS - structuralResults.length;
  const contentEntries = canSearchContent ? getContentSearchEntriesByPath(index) : [];
  let contentEntryIndex = 0;
  let searchedContentEntries = 0;
  let searchedContentChars = 0;

  const buildResults = () => {
    contentResults.sort(compareSearchResults);
    return [...boundedStructuralResults, ...contentResults].slice(0, NOTES_SIDEBAR_MAX_SEARCH_RESULTS);
  };

  return {
    runBatch(maxInspectedEntries: number, maxContentChars: number) {
      let inspectedEntries = 0;
      let batchContentChars = 0;
      while (
        contentEntryIndex < contentEntries.length &&
        contentResults.length < contentResultLimit &&
        searchedContentEntries < NOTES_SIDEBAR_MAX_CONTENT_SEARCH_ENTRIES &&
        searchedContentChars < NOTES_SIDEBAR_MAX_CONTENT_SEARCH_CHARS &&
        inspectedEntries < maxInspectedEntries &&
        batchContentChars < maxContentChars
      ) {
        const entry = contentEntries[contentEntryIndex++];
        inspectedEntries += 1;
        const content = getNoteContent?.(entry.path);
        if (!content) continue;

        searchedContentEntries += 1;
        const scannedChars = Math.min(content.length, MAX_CONTENT_SEARCH_SCANNED_CHARS);
        searchedContentChars += scannedChars;
        batchContentChars += scannedChars;

        for (const contentMatch of getNotesSidebarContentMatches(
          content,
          lowerQuery,
          getNoteContentIdentity?.(entry.path),
        )) {
          contentResults.push({
            ...entry,
            id: `${entry.path}::content::${contentMatch.ordinal}`,
            matchIndex: contentMatch.matchIndex,
            matchKind: 'content',
            contentSnippet: contentMatch.snippet,
            contentMatchOrdinal: contentMatch.ordinal,
          });
          if (contentResults.length >= contentResultLimit) break;
        }
      }

      const done = (
        contentEntryIndex >= contentEntries.length ||
        contentResults.length >= contentResultLimit ||
        searchedContentEntries >= NOTES_SIDEBAR_MAX_CONTENT_SEARCH_ENTRIES ||
        searchedContentChars >= NOTES_SIDEBAR_MAX_CONTENT_SEARCH_CHARS
      );
      return {
        done,
        results: buildResults(),
      };
    },
  };
}

export function queryNotesSidebarStructuralSearch(
  index: NotesSidebarSearchEntry[],
  query: string,
): NotesSidebarSearchResult[] {
  const trimmedQuery = getBoundedTrimmedSearchQuery(query);
  if (!trimmedQuery) {
    return [];
  }

  const lowerQuery = trimmedQuery.toLocaleLowerCase();
  const structuralResults: NotesSidebarSearchResult[] = [];

  for (const entry of index) {
    const {
      lowerName,
      lowerNameStartOffsets,
      lowerPreview,
      lowerPreviewStartOffsets,
    } = getSearchEntryMetadata(entry);
    const nameMatchIndex = lowerName.indexOf(lowerQuery);
    const pathMatchIndex = lowerPreview.indexOf(lowerQuery);

    if (nameMatchIndex !== -1) {
      structuralResults.push({
        ...entry,
        id: `${entry.path}::name`,
        matchIndex: lowerNameStartOffsets[nameMatchIndex] ?? nameMatchIndex,
        matchKind: 'name',
        contentSnippet: null,
        contentMatchOrdinal: null,
      });
    }

    if (pathMatchIndex !== -1) {
      structuralResults.push({
        ...entry,
        id: `${entry.path}::path`,
        matchIndex: lowerPreviewStartOffsets[pathMatchIndex] ?? pathMatchIndex,
        matchKind: 'path',
        contentSnippet: null,
        contentMatchOrdinal: null,
      });
    }
  }

  structuralResults.sort(compareSearchResults);
  return structuralResults.slice(0, NOTES_SIDEBAR_MAX_SEARCH_RESULTS);
}
