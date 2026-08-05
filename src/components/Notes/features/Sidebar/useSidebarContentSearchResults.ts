import { useEffect, useMemo, useRef, useState } from 'react';
import type { FolderNode } from '@/stores/useNotesStore';
import type { StarredEntry } from '@/stores/notes/types';
import {
  buildNotesSidebarSearchIndex,
  createNotesSidebarSearchSession,
  NOTES_SIDEBAR_MAX_SEARCH_RESULTS,
  type NotesSidebarSearchEntry,
  queryNotesSidebarSearch,
  queryNotesSidebarStructuralSearch,
  shouldSearchNotesSidebarContents,
} from './notesSidebarSearchResults';

const EMPTY_STARRED_ENTRIES: StarredEntry[] = [];
const CONTENT_SEARCH_BATCH_ENTRIES = 32;
const CONTENT_SEARCH_BATCH_CHARS = 256 * 1024;

export function useSidebarContentSearchResults({
  rootFolder,
  getDisplayName,
  noteContentsCache,
  scanAllNotes,
  cancelNoteContentScan,
  pruneNoteContentsCacheToOpenNotes,
  searchQuery,
  isSearchOpen,
  starredEntries = EMPTY_STARRED_ENTRIES,
  currentNotesRootPath = null,
  noteContentsCacheRevision = 0,
  liveNoteContent = null,
}: {
  rootFolder: FolderNode | null;
  getDisplayName: (path: string) => string;
  noteContentsCache: Map<string, { content: string }>;
  noteContentsCacheRevision?: number;
  liveNoteContent?: { path: string; content: string } | null;
  scanAllNotes: (options?: { signal?: AbortSignal }) => Promise<unknown>;
  cancelNoteContentScan: () => void;
  pruneNoteContentsCacheToOpenNotes: () => void;
  searchQuery: string;
  isSearchOpen: boolean;
  starredEntries?: StarredEntry[];
  currentNotesRootPath?: string | null;
}) {
  const contentScanPromiseRef = useRef<Promise<unknown> | null>(null);
  const contentScanAbortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const scanInvalidatedWhileRunningRef = useRef(false);
  const shouldPruneAfterScanRef = useRef(false);
  const wasContentSearchActiveRef = useRef(false);
  const completedContentScanRef = useRef<{
    entries: NotesSidebarSearchEntry[];
    revision: number;
  } | null>(null);
  const [isContentScanPending, setIsContentScanPending] = useState(false);
  const [scanCompletionRevision, setScanCompletionRevision] = useState(0);
  const [incrementalSearch, setIncrementalSearch] = useState<{
    key: object;
    results: ReturnType<typeof queryNotesSidebarSearch>;
  } | null>(null);

  const searchIndex = useMemo(
    () => buildNotesSidebarSearchIndex(rootFolder, getDisplayName, {
      currentNotesRootPath,
      starredEntries,
    }),
    [currentNotesRootPath, getDisplayName, rootFolder, starredEntries],
  );
  const contentSearchEntries = useMemo(
    () => searchIndex.filter((entry) => entry.contentSearchable !== false),
    [searchIndex],
  );
  const searchableNoteCount = contentSearchEntries.length;
  const shouldSearchContents = shouldSearchNotesSidebarContents(searchQuery);
  const structuralSearchResults = useMemo(
    () => queryNotesSidebarStructuralSearch(searchIndex, searchQuery),
    [searchIndex, searchQuery],
  );
  const structuralResultsFillLimit =
    structuralSearchResults.length >= NOTES_SIDEBAR_MAX_SEARCH_RESULTS;
  const isContentSearchActive =
    isSearchOpen && shouldSearchContents && searchableNoteCount > 0 && !structuralResultsFillLimit;
  const isContentIndexReady = useMemo(
    () =>
      searchableNoteCount > 0 &&
      contentSearchEntries.every((entry) => noteContentsCache.has(entry.path)),
    [contentSearchEntries, noteContentsCache, searchableNoteCount],
  );

  const incrementalSearchKey = useMemo(() => ({}), [
    currentNotesRootPath,
    liveNoteContent?.content,
    liveNoteContent?.path,
    noteContentsCache,
    noteContentsCacheRevision,
    rootFolder,
    searchQuery,
    starredEntries,
  ]);
  const incrementalSearchStart = useMemo(() => {
    const session = createNotesSidebarSearchSession(
      searchIndex,
      searchQuery,
      (path) => liveNoteContent?.path === path
        ? liveNoteContent.content
        : noteContentsCache.get(path)?.content,
      structuralSearchResults,
    );
    return {
      session,
      firstBatch: session.runBatch(CONTENT_SEARCH_BATCH_ENTRIES, CONTENT_SEARCH_BATCH_CHARS),
    };
  }, [incrementalSearchKey]);
  const searchResults = !shouldSearchContents || structuralResultsFillLimit
    ? structuralSearchResults
    : incrementalSearch?.key === incrementalSearchKey
      ? incrementalSearch.results
      : incrementalSearchStart.firstBatch.results;

  useEffect(() => {
    if (!shouldSearchContents || structuralResultsFillLimit) {
      setIncrementalSearch(null);
      return;
    }

    if (incrementalSearchStart.firstBatch.done) {
      setIncrementalSearch(null);
      return;
    }

    let cancelled = false;
    let timer: number | null = null;
    const runBatch = () => {
      const next = incrementalSearchStart.session.runBatch(
        CONTENT_SEARCH_BATCH_ENTRIES,
        CONTENT_SEARCH_BATCH_CHARS,
      );
      if (cancelled) return;
      setIncrementalSearch({ key: incrementalSearchKey, results: next.results });
      if (!next.done) timer = window.setTimeout(runBatch, 0);
    };
    timer = window.setTimeout(runBatch, 0);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [
    incrementalSearchKey,
    incrementalSearchStart,
    shouldSearchContents,
    structuralResultsFillLimit,
  ]);

  useEffect(() => {
    const wasContentSearchActive = wasContentSearchActiveRef.current;
    wasContentSearchActiveRef.current = isContentSearchActive;

    if (!isContentSearchActive) {
      setIsContentScanPending(false);
      if (
        wasContentSearchActive ||
        contentScanPromiseRef.current ||
        contentScanAbortControllerRef.current
      ) {
        contentScanAbortControllerRef.current?.abort();
        contentScanAbortControllerRef.current = null;
        completedContentScanRef.current = null;
        cancelNoteContentScan();
        shouldPruneAfterScanRef.current = true;
        pruneNoteContentsCacheToOpenNotes();
      }
      return;
    }

    if (isContentIndexReady) {
      completedContentScanRef.current = {
        entries: contentSearchEntries,
        revision: noteContentsCacheRevision,
      };
      setIsContentScanPending(false);
      contentScanAbortControllerRef.current?.abort();
      contentScanAbortControllerRef.current = null;
      return;
    }

    const completedScan = completedContentScanRef.current;
    if (
      completedScan?.entries === contentSearchEntries &&
      completedScan.revision === noteContentsCacheRevision
    ) {
      setIsContentScanPending(false);
      return;
    }

    shouldPruneAfterScanRef.current = false;

    if (contentScanPromiseRef.current) {
      scanInvalidatedWhileRunningRef.current = true;
      setIsContentScanPending(true);
      return;
    }

    const abortController = new AbortController();
    scanInvalidatedWhileRunningRef.current = false;
    contentScanAbortControllerRef.current?.abort();
    contentScanAbortControllerRef.current = abortController;
    setIsContentScanPending(true);

    let scanCompleted = false;
    const promise = scanAllNotes({ signal: abortController.signal })
      .then(() => {
        scanCompleted = true;
      })
      .catch((_error: unknown) => {
        if (import.meta.env.DEV) {
        }
      })
      .finally(() => {
        if (contentScanPromiseRef.current === promise) {
          contentScanPromiseRef.current = null;
        }
        if (contentScanAbortControllerRef.current === abortController) {
          contentScanAbortControllerRef.current = null;
        }

        const shouldRecheckScan = scanInvalidatedWhileRunningRef.current;
        scanInvalidatedWhileRunningRef.current = false;
        if (scanCompleted && !abortController.signal.aborted && !shouldRecheckScan) {
          completedContentScanRef.current = {
            entries: contentSearchEntries,
            revision: noteContentsCacheRevision,
          };
        }
        if (isMountedRef.current) {
          setIsContentScanPending(false);
          if (shouldRecheckScan) {
            setScanCompletionRevision((revision) => revision + 1);
          }
        }

        if (shouldPruneAfterScanRef.current) {
          pruneNoteContentsCacheToOpenNotes();
        }
      });

    contentScanPromiseRef.current = promise;
  }, [
    cancelNoteContentScan,
    contentSearchEntries,
    isContentIndexReady,
    isContentSearchActive,
    noteContentsCacheRevision,
    pruneNoteContentsCacheToOpenNotes,
    scanCompletionRevision,
    scanAllNotes,
  ]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      contentScanAbortControllerRef.current?.abort();
      cancelNoteContentScan();
    };
  }, [cancelNoteContentScan]);

  return {
    isContentScanPending,
    searchIndex,
    searchResults,
  };
}
