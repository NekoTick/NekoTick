import { isAbsolutePath } from '@/lib/storage/adapter';
import { joinPath as joinLocalPath } from '@/lib/storage/adapter/pathUtils';
import { isSupportedMarkdownPath } from '@/lib/notes/markdownFile';
import type { FileTreeNode, NoteContentCacheEntry } from '../types';
import { assertEditorSafeMarkdownContent } from '../document/noteDocumentPersistence';
import { hasInternalNotePathSegment } from '../utils/fs/internalNotePaths';
import {
  hasUnsafeNotesRootPathSegment,
  normalizeNotesRootRelativePath,
} from '../utils/fs/notesRootPathContainment';

export const MAX_SEARCHABLE_NOTE_BYTES = 512 * 1024;
export const MAX_SCANNED_NOTE_CONTENT_CHARS = 8 * 1024 * 1024;
export const MAX_METADATA_UPDATE_NOTE_BYTES = 10 * 1024 * 1024;
export const MAX_NOTE_CONTENT_SCAN_PATHS = 5000;
export const MAX_NOTE_CONTENT_SCAN_TREE_NODES = 20_000;
export const MAX_BACKLINK_TARGET_TITLE_CHARS = 512;
export const MAX_BACKLINK_RESULTS = 200;
export const MAX_BACKLINK_SCAN_ENTRIES = 5000;
export const MAX_BACKLINK_SCAN_CHARS = 8 * 1024 * 1024;
export const MAX_ALL_TAGS = 5000;
export const MAX_TAG_CACHE_SCAN_ENTRIES = 5000;
export const MAX_TAG_CACHE_SCAN_CHARS = 8 * 1024 * 1024;
export const NOTE_CONTENT_SCAN_FRESH_MS = 1000;

const searchableNoteUtf8Encoder = new TextEncoder();

export function canReadBoundedMarkdownFile(
  fileInfo: { isFile?: boolean; isDirectory?: boolean; size?: number | null } | null | undefined,
  maxBytes: number,
): boolean {
  if (!fileInfo || fileInfo.isDirectory === true || fileInfo.isFile === false) {
    return false;
  }

  if (typeof fileInfo.size !== 'number') {
    return true;
  }

  return (
    Number.isFinite(fileInfo.size) &&
    fileInfo.size >= 0 &&
    fileInfo.size <= maxBytes
  );
}

export function getKnownMarkdownFileSize(
  fileInfo: { size?: number | null } | null | undefined,
): number | null {
  return typeof fileInfo?.size === 'number' &&
    Number.isFinite(fileInfo.size) &&
    fileInfo.size >= 0
    ? fileInfo.size
    : null;
}

export function getKnownMarkdownModifiedAt(
  fileInfo: { modifiedAt?: number | null } | null | undefined,
): number | null {
  return typeof fileInfo?.modifiedAt === 'number' && Number.isFinite(fileInfo.modifiedAt)
    ? fileInfo.modifiedAt
    : null;
}

export function hasUnsafeNotePathSegment(path: string): boolean {
  return hasUnsafeNotesRootPathSegment(path, {
    allowNavigationSegments: true,
  });
}

export function isSafeStoredNotePath(path: string): boolean {
  if (hasInternalNotePathSegment(path) || hasUnsafeNotePathSegment(path)) {
    return false;
  }

  return isAbsolutePath(path) || normalizeNotesRootRelativePath(path) != null;
}

export function isSearchableMarkdownContent(content: string): boolean {
  if (content.length > MAX_SEARCHABLE_NOTE_BYTES) {
    return false;
  }
  if (searchableNoteUtf8Encoder.encode(content).length > MAX_SEARCHABLE_NOTE_BYTES) {
    return false;
  }

  try {
    assertEditorSafeMarkdownContent(content);
    return true;
  } catch {
    return false;
  }
}

export function isMetadataUpdateSourceContentWithinReadLimit(content: string): boolean {
  if (content.length > MAX_METADATA_UPDATE_NOTE_BYTES) {
    return false;
  }
  if (
    content.length > Math.floor(MAX_METADATA_UPDATE_NOTE_BYTES / 3) &&
    searchableNoteUtf8Encoder.encode(content).length > MAX_METADATA_UPDATE_NOTE_BYTES
  ) {
    return false;
  }

  return true;
}

function getNoteContentScanNodePriority(node: FileTreeNode): number {
  const normalizedPath = normalizeNotesRootRelativePath(node.path, { allowEmpty: node.isFolder });
  if (!normalizedPath || hasInternalNotePathSegment(normalizedPath)) {
    return 3;
  }

  if (!node.isFolder && isSupportedMarkdownPath(normalizedPath)) {
    return 0;
  }

  return node.isFolder ? 1 : 2;
}

function prioritizeNoteContentScanNodes(nodes: readonly FileTreeNode[]): FileTreeNode[] {
  const priorityBuckets: FileTreeNode[][] = [[], [], [], []];
  for (const node of nodes) {
    priorityBuckets[getNoteContentScanNodePriority(node)]?.push(node);
  }
  return priorityBuckets.flat();
}

export function canReuseScannedNoteCacheEntry(
  cachedEntry: NoteContentCacheEntry,
  fileInfo: { isFile?: boolean; isDirectory?: boolean; modifiedAt?: number | null; size?: number | null } | null | undefined,
): boolean {
  if (!canReadBoundedMarkdownFile(fileInfo, MAX_SEARCHABLE_NOTE_BYTES)) {
    return false;
  }

  const modifiedAt = getKnownMarkdownModifiedAt(fileInfo);
  const size = getKnownMarkdownFileSize(fileInfo);
  if (modifiedAt === null) {
    return false;
  }

  if (cachedEntry.modifiedAt !== modifiedAt) {
    return false;
  }

  if (cachedEntry.content === '' && cachedEntry.savedContent === undefined && (size ?? 0) > 0) {
    return false;
  }

  if (cachedEntry.size !== undefined) {
    return cachedEntry.size === size;
  }

  return size === null;
}

export function collectNoteContentScanPaths(
  nodes: readonly FileTreeNode[],
  notesPath: string,
  isScanActive: () => boolean,
): { path: string; fullPath: string }[] {
  const filePaths: { path: string; fullPath: string }[] = [];
  const stack = prioritizeNoteContentScanNodes(nodes).reverse();
  let visitedNodes = 0;

  while (
    stack.length > 0 &&
    filePaths.length < MAX_NOTE_CONTENT_SCAN_PATHS &&
    visitedNodes < MAX_NOTE_CONTENT_SCAN_TREE_NODES
  ) {
    if (!isScanActive()) return filePaths;

    const node = stack.pop()!;
    visitedNodes += 1;
    if (node.isFolder) {
      const folderPath = normalizeNotesRootRelativePath(node.path, { allowEmpty: true });
      if (folderPath === null || hasInternalNotePathSegment(folderPath)) continue;

      const prioritizedChildren = prioritizeNoteContentScanNodes(node.children);
      for (let index = prioritizedChildren.length - 1; index >= 0; index -= 1) {
        stack.push(prioritizedChildren[index]);
      }
      continue;
    }

    const relativePath = normalizeNotesRootRelativePath(node.path);
    if (
      relativePath &&
      !hasInternalNotePathSegment(relativePath) &&
      isSupportedMarkdownPath(relativePath)
    ) {
      filePaths.push({
        path: relativePath,
        fullPath: joinLocalPath(notesPath, relativePath),
      });
    }
  }

  return filePaths;
}
