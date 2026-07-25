import type { StateCreator } from 'zustand';
import { getStorageAdapter } from '@/lib/storage/adapter';
import { normalizeEditorStateMarkdownDocument } from '@/lib/notes/markdown/markdownSerializationUtils';
import type { NotesStore } from '../types';
import { createCachedNoteContentEntry } from '../document/noteContentCache';
import { hasInternalNotePathSegment } from '../utils/fs/internalNotePaths';
import {
  MAX_SCANNED_NOTE_CONTENT_CHARS,
  MAX_SEARCHABLE_NOTE_BYTES,
  canReadBoundedMarkdownFile,
  canReuseScannedNoteCacheEntry,
  collectNoteContentScanPaths,
  getKnownMarkdownFileSize,
  getKnownMarkdownModifiedAt,
  isSearchableMarkdownContent,
} from './featureSliceContentUtils';
import {
  createNoteContentScanCoordinator,
  type NoteContentScanOutcome,
  type NoteContentScanRunContext,
} from './featureSliceScanCoordinator';
import type { FeatureSlice } from './featureSlice';

interface CreateNoteContentScanActionsOptions {
  get: Parameters<StateCreator<NotesStore, [], [], FeatureSlice>>[1];
  isActiveNotesRootRequest: (notesRootPath: string) => boolean;
  set: Parameters<StateCreator<NotesStore, [], [], FeatureSlice>>[0];
}

const NOTE_CONTENT_SCAN_BATCH_SIZE = 32;

function preserveLiveNoteCacheEntries(
  cache: NotesStore['noteContentsCache'],
  state: NotesStore,
) {
  if (state.currentNote) {
    const currentEntry = state.noteContentsCache.get(state.currentNote.path);
    cache.set(
      state.currentNote.path,
      createCachedNoteContentEntry(
        state.currentNote.content,
        currentEntry?.modifiedAt ?? null,
        {
          baselineContent: currentEntry?.savedContent ?? currentEntry?.content,
          ...(currentEntry?.size !== undefined ? { size: currentEntry.size } : {}),
        },
      ),
    );
  }
  state.openTabs.forEach((tab) => {
    if (tab.path === state.currentNote?.path) return;
    const cachedEntry = state.noteContentsCache.get(tab.path);
    if (cachedEntry && (tab.isDirty || !cache.has(tab.path))) {
      cache.set(tab.path, cachedEntry);
    }
  });
  Object.keys(state.draftNotes).forEach((path) => {
    const cachedEntry = state.noteContentsCache.get(path);
    if (cachedEntry) cache.set(path, cachedEntry);
  });
}

interface ScannedNoteContent {
  baselineContent?: string;
  content: string;
  contentLoaded: boolean;
  modifiedAt: number | null;
  path: string;
  readAttempted: boolean;
  readFailed: boolean;
  size: number | null;
}

function createUnloadedScannedNote(
  path: string,
  options: Partial<Pick<
    ScannedNoteContent,
    'modifiedAt' | 'readAttempted' | 'readFailed' | 'size'
  >> = {},
): ScannedNoteContent {
  return {
    path,
    content: '',
    contentLoaded: false,
    modifiedAt: options.modifiedAt ?? null,
    readAttempted: options.readAttempted ?? false,
    readFailed: options.readFailed ?? false,
    size: options.size ?? null,
  };
}

export function createNoteContentScanActions({
  get,
  isActiveNotesRootRequest,
  set,
}: CreateNoteContentScanActionsOptions) {
  const runNoteContentScan = async (
    scan: NoteContentScanRunContext,
  ): Promise<NoteContentScanOutcome> => {
    const isScanActive = scan.isActive;
    const priorityPaths = scan.priorityPaths;

    if (!isScanActive()) return 'cancelled';

    const { notesPath, rootFolder, noteContentsCache } = get();
    if (!rootFolder || !notesPath || hasInternalNotePathSegment(notesPath)) {
      return 'complete';
    }

    const storage = getStorageAdapter();
    const scannedCache: NotesStore['noteContentsCache'] = new Map();
    const filePaths = collectNoteContentScanPaths(rootFolder.children, notesPath, isScanActive);
    if (!isScanActive()) return 'cancelled';

    scan.initializePriorityRequests(filePaths.map(({ path }) => path), () => {
      if (!isActiveNotesRootRequest(notesPath) || !isScanActive()) return false;
      if (scannedCache.size === 0) return false;
      const latestState = get();
      const cache = new Map(latestState.noteContentsCache);
      scannedCache.forEach((entry, path) => cache.set(path, entry));
      preserveLiveNoteCacheEntries(cache, latestState);
      set({ noteContentsCache: cache });
      return true;
    });

    let scannedContentChars = 0;
    let attemptedReadCount = 0;
    let failedReadCount = 0;
    const addScannedEntry = (
      path: string,
      content: string,
      contentLoaded: boolean,
      modifiedAt: number | null,
      options: { baselineContent?: string; size?: number | null } = {},
    ) => {
      if (
        !contentLoaded ||
        !isSearchableMarkdownContent(content) ||
        scannedContentChars + content.length > MAX_SCANNED_NOTE_CONTENT_CHARS
      ) {
        return;
      }

      scannedContentChars += content.length;
      scannedCache.set(path, createCachedNoteContentEntry(content, modifiedAt, options));
    };

    let sortedPriorityPathCount = -1;
    for (let i = 0; i < filePaths.length; i += NOTE_CONTENT_SCAN_BATCH_SIZE) {
      if (!isScanActive()) return 'cancelled';

      if (sortedPriorityPathCount !== priorityPaths.size) {
        const remainingPaths = filePaths.slice(i);
        remainingPaths.sort((left, right) => (
          Number(priorityPaths.has(right.path)) - Number(priorityPaths.has(left.path))
        ));
        filePaths.splice(i, remainingPaths.length, ...remainingPaths);
        sortedPriorityPathCount = priorityPaths.size;
      }

      const batch = filePaths.slice(i, i + NOTE_CONTENT_SCAN_BATCH_SIZE);
      if (scannedContentChars >= MAX_SCANNED_NOTE_CONTENT_CHARS) {
        scan.finishPriorityPaths(batch.map(({ path }) => path));
        continue;
      }

      const results = await Promise.allSettled(
        batch.map(async ({ path, fullPath }): Promise<ScannedNoteContent> => {
          if (!isScanActive()) return createUnloadedScannedNote(path);

          const fileInfo = await storage.stat(fullPath).catch(() => null);
          if (!isScanActive()) return createUnloadedScannedNote(path);
          const modifiedAt = getKnownMarkdownModifiedAt(fileInfo);
          const size = getKnownMarkdownFileSize(fileInfo);
          const cachedEntry = noteContentsCache.get(path);
          if (cachedEntry && canReuseScannedNoteCacheEntry(cachedEntry, fileInfo)) {
            return {
              path,
              content: cachedEntry.content,
              contentLoaded: true,
              baselineContent: cachedEntry.savedContent ?? cachedEntry.content,
              modifiedAt,
              readAttempted: false,
              readFailed: false,
              size,
            };
          }

          if (!canReadBoundedMarkdownFile(fileInfo, MAX_SEARCHABLE_NOTE_BYTES)) {
            return createUnloadedScannedNote(path, { modifiedAt, size });
          }

          try {
            const rawContent = await storage.readFile(fullPath, MAX_SEARCHABLE_NOTE_BYTES);
            if (!isSearchableMarkdownContent(rawContent)) {
              return createUnloadedScannedNote(path, {
                modifiedAt,
                readAttempted: true,
                size,
              });
            }

            const content = normalizeEditorStateMarkdownDocument(rawContent);
            if (!isScanActive()) {
              return createUnloadedScannedNote(path, { readAttempted: true });
            }
            return {
              path,
              content,
              contentLoaded: true,
              baselineContent: rawContent,
              modifiedAt,
              readAttempted: true,
              readFailed: false,
              size,
            };
          } catch {
            return createUnloadedScannedNote(path, {
              readAttempted: true,
              readFailed: true,
            });
          }
        })
      );

      if (!isScanActive()) return 'cancelled';

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          if (result.value.readAttempted) attemptedReadCount += 1;
          if (result.value.readFailed) failedReadCount += 1;
          addScannedEntry(
            result.value.path,
            result.value.content,
            result.value.contentLoaded,
            result.value.modifiedAt,
            {
              baselineContent: result.value.baselineContent,
              size: result.value.size,
            },
          );
        }
      });
      scan.finishPriorityPaths(batch.map(({ path }) => path));
    }

    if (attemptedReadCount > 0 && failedReadCount === attemptedReadCount) {
      throw new Error('Unable to read any scannable notes');
    }

    if (!isActiveNotesRootRequest(notesPath) || !isScanActive()) return 'cancelled';

    const latestState = get();
    const cache = new Map(scannedCache);
    preserveLiveNoteCacheEntries(cache, latestState);

    if (isScanActive()) {
      set({ noteContentsCache: cache });
    }
    return 'complete';
  };

  return createNoteContentScanCoordinator(runNoteContentScan);
}
