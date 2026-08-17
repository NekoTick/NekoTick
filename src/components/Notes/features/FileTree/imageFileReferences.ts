import { findExportMarkdownAssetSourceTokensWithOptions } from '../Export/noteExportMarkdownAssetTokens';
import { resolveNotesRootAssetPathCandidates } from '@/lib/assets/core/paths';
import { resolveObsidianImagePath } from '@/lib/notes/markdown/obsidianImagePath';
import { getStorageAdapter } from '@/lib/storage/adapter';
import { collectNoteContentScanPaths, MAX_SEARCHABLE_NOTE_BYTES } from '@/stores/notes/slices/featureSliceContentUtils';
import { resolveNotesRootRelativeFullPath } from '@/stores/notes/utils/fs/notesRootPathContainment';
import type { FileTreeNode, NotesStore } from '@/stores/notes/types';

export interface ImageFileReference {
  path: string;
  name: string;
  kind: 'body' | 'cover';
  source?: string;
  offset?: number;
}

const MAX_REFERENCE_RESULTS = 50;
const MAX_REFERENCE_SCAN_CHARS = 8 * 1024 * 1024;
const MAX_IMAGE_TOKENS_PER_NOTE = 200;
const REFERENCE_READ_BATCH_SIZE = 8;
const REFERENCE_SOURCE_BATCH_SIZE = 8;
const REFERENCE_CACHE_TTL_MS = 10_000;
const MAX_REFERENCE_CACHE_ENTRIES = 100;

interface ReferenceCacheEntry {
  currentNote: NotesStore['currentNote'];
  noteContentsCache: NotesStore['noteContentsCache'];
  noteMetadata: NotesStore['noteMetadata'];
  rootFolder: NotesStore['rootFolder'];
  result: ImageFileReference[];
  storedAt: number;
}

const referenceCache = new Map<string, ReferenceCacheEntry>();

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Image reference scan aborted.', 'AbortError');
  }
}

function getCachedReferences(
  cacheKey: string,
  input: Pick<NotesStore, 'currentNote' | 'noteContentsCache' | 'noteMetadata' | 'rootFolder'>,
) {
  const cached = referenceCache.get(cacheKey);
  if (
    !cached
    || Date.now() - cached.storedAt > REFERENCE_CACHE_TTL_MS
    || cached.currentNote !== input.currentNote
    || cached.noteContentsCache !== input.noteContentsCache
    || cached.noteMetadata !== input.noteMetadata
    || cached.rootFolder !== input.rootFolder
  ) {
    referenceCache.delete(cacheKey);
    return null;
  }
  referenceCache.delete(cacheKey);
  referenceCache.set(cacheKey, cached);
  return cached.result;
}

function cacheReferences(
  cacheKey: string,
  input: Pick<NotesStore, 'currentNote' | 'noteContentsCache' | 'noteMetadata' | 'rootFolder'>,
  result: ImageFileReference[],
) {
  referenceCache.set(cacheKey, { ...input, result, storedAt: Date.now() });
  while (referenceCache.size > MAX_REFERENCE_CACHE_ENTRIES) {
    const oldestKey = referenceCache.keys().next().value;
    if (oldestKey === undefined) break;
    referenceCache.delete(oldestKey);
  }
}

function getPathComparisonKey(path: string) {
  const normalized = path.replace(/\\/g, '/');
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith('//')
    ? normalized.toLowerCase()
    : normalized;
}

async function sourceReferencesImage(
  storage: ReturnType<typeof getStorageAdapter>,
  notesPath: string,
  notePath: string,
  source: string,
  targetFullPathKey: string,
  signal?: AbortSignal,
) {
  throwIfAborted(signal);
  const candidates = await resolveNotesRootAssetPathCandidates(notesPath, source, notePath);
  const targetIndex = candidates.findIndex(
    (candidate) => getPathComparisonKey(candidate) === targetFullPathKey,
  );
  if (targetIndex < 0) return false;

  for (const earlierCandidate of candidates.slice(0, targetIndex)) {
    throwIfAborted(signal);
    if (await storage.exists(earlierCandidate).catch(() => false)) {
      return false;
    }
  }
  return true;
}

async function noteReferencesImage(
  storage: ReturnType<typeof getStorageAdapter>,
  notesPath: string,
  notePath: string,
  content: string,
  targetFullPathKey: string,
  targetImagePath: string,
  rootNodes: readonly FileTreeNode[],
  signal?: AbortSignal,
) {
  const tokens = findExportMarkdownAssetSourceTokensWithOptions(
    content,
    { maxTokens: MAX_IMAGE_TOKENS_PER_NOTE },
  );
  for (let index = 0; index < tokens.length; index += REFERENCE_SOURCE_BATCH_SIZE) {
    throwIfAborted(signal);
    const batch = tokens.slice(index, index + REFERENCE_SOURCE_BATCH_SIZE);
    const matches = await Promise.all(batch.map(async (token) => {
      const obsidianPath = token.obsidianEmbed
        ? resolveObsidianImagePath(token.lookupSrc ?? token.src, rootNodes, notePath)
        : null;
      if (obsidianPath) {
        return getPathComparisonKey(obsidianPath) === getPathComparisonKey(targetImagePath);
      }
      return sourceReferencesImage(
        storage,
        notesPath,
        notePath,
        token.lookupSrc ?? token.src,
        targetFullPathKey,
        signal,
      );
    }));
    const matchIndex = matches.findIndex(Boolean);
    if (matchIndex >= 0) {
      const token = batch[matchIndex];
      return token ? {
        source: token.referenceSource ?? token.src,
        offset: token.referenceOffset ?? token.start,
      } : null;
    }
  }
  return null;
}

export async function findImageFileReferences(input: Pick<
  NotesStore,
  'notesPath' | 'rootFolder' | 'currentNote' | 'noteContentsCache' | 'noteMetadata'
> & { imagePath: string }, options?: { signal?: AbortSignal }): Promise<ImageFileReference[]> {
  if (!input.notesPath || !input.rootFolder) {
    return [];
  }

  const signal = options?.signal;
  throwIfAborted(signal);
  const cacheKey = `${input.notesPath}\0${input.imagePath}`;
  const cached = getCachedReferences(cacheKey, input);
  if (cached) return cached;

  const { fullPath } = await resolveNotesRootRelativeFullPath(input.notesPath, input.imagePath);
  const targetFullPathKey = getPathComparisonKey(fullPath);
  const storage = getStorageAdapter();
  const notePaths = collectNoteContentScanPaths(
    input.rootFolder.children,
    input.notesPath,
    () => !signal?.aborted,
  );
  const references: ImageFileReference[] = [];
  let scannedChars = 0;

  for (let index = 0; index < notePaths.length; index += REFERENCE_READ_BATCH_SIZE) {
    throwIfAborted(signal);
    const batch = notePaths.slice(index, index + REFERENCE_READ_BATCH_SIZE);
    const loadedBatch = await Promise.all(batch.map(async (note) => {
      let content = input.currentNote?.path === note.path
        ? input.currentNote.content
        : input.noteContentsCache.get(note.path)?.content;
      if (content === undefined || (content === '' && input.currentNote?.path !== note.path)) {
        content = await storage.readFile(note.fullPath, MAX_SEARCHABLE_NOTE_BYTES).catch(() => '');
      }
      return { note, content };
    }));

    for (const { note, content } of loadedBatch) {
      throwIfAborted(signal);
      if (references.length >= MAX_REFERENCE_RESULTS || scannedChars >= MAX_REFERENCE_SCAN_CHARS) {
        cacheReferences(cacheKey, input, references);
        return references;
      }
      if (!content || scannedChars + content.length > MAX_REFERENCE_SCAN_CHARS) continue;
      scannedChars += content.length;

      const bodyReference = await noteReferencesImage(
        storage,
        input.notesPath,
        note.path,
        content,
        targetFullPathKey,
        input.imagePath,
        input.rootFolder.children,
        signal,
      );
      const coverSource = input.noteMetadata?.notes[note.path]?.cover?.assetPath;
      const referencesCover = !bodyReference && coverSource
        ? await sourceReferencesImage(storage, input.notesPath, note.path, coverSource, targetFullPathKey, signal)
        : false;
      if (bodyReference || referencesCover) {
        references.push({
          path: note.path,
          name: note.path.split('/').pop()?.replace(/\.(md|markdown|mdown|mkd)$/i, '') ?? note.path,
          ...(bodyReference
            ? { kind: 'body' as const, source: bodyReference.source, offset: bodyReference.offset }
            : { kind: 'cover' as const }),
        });
      }
    }
  }

  cacheReferences(cacheKey, input, references);
  return references;
}
