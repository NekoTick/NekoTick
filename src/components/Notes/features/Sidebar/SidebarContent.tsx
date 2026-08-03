import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSidebarSearchDrawerState } from '@/components/layout/sidebar/SidebarSearchDrawer';
import type { SidebarSearchState } from '@/components/layout/sidebar/useSidebarSearchState';
import { useNotesStore, type FolderNode } from '@/stores/useNotesStore';
import { useNotesRootStore } from '@/stores/useNotesRootStore';
import { useUIStore } from '@/stores/uiSlice';
import { isDraftNotePath } from '@/stores/notes/draftNote';
import { getEmptyWorkspaceRecentNotesRoots } from './SidebarEmptyWorkspacePanel';
import { useSidebarContentSearchResults } from './useSidebarContentSearchResults';
import { useI18n } from '@/lib/i18n';
import { useNotesSidebarTags } from './useNotesSidebarTags';
import { useSidebarContentNavigation } from './useSidebarContentNavigation';
import { useSidebarCurrentNoteReveal } from './useSidebarCurrentNoteReveal';
import { useSidebarDisplayRootFolder } from './useSidebarDisplayRootFolder';
import { useSidebarLiveNoteContent } from './useSidebarLiveNoteContent';
import { useSidebarRenameShortcut } from './useSidebarRenameShortcut';
import { SidebarContentView } from './SidebarContentView';
import { themeUiFeedbackTokens } from '@/styles/themeTokens';

const EMPTY_NOTE_CONTENTS_CACHE = new Map<string, { content: string; modifiedAt: number | null }>();
interface SidebarContentProps {
  rootFolder: FolderNode | null;
  isLoading: boolean;
  currentNotePath?: string | null;
  createNote: (folderPath?: string) => Promise<unknown>;
  createFolder: (path: string) => Promise<string | null>;
  search: SidebarSearchState;
  className?: string;
  isPeeking?: boolean;
  active?: boolean;
}

export function SidebarContent({
  rootFolder,
  isLoading,
  currentNotePath,
  createNote,
  createFolder,
  search,
  className,
  isPeeking = false,
  active = true,
}: SidebarContentProps) {
  const { t } = useI18n();
  const openNote = useNotesStore((s) => s.openNote);
  const openNoteByAbsolutePath = useNotesStore((s) => s.openNoteByAbsolutePath);
  const draftNotes = useNotesStore((s) => s.draftNotes);
  const revealFolder = useNotesStore((s) => s.revealFolder);
  const getDisplayName = useNotesStore((s) => s.getDisplayName);
  const notesPath = useNotesStore((s) => s.notesPath);
  const scanAllNotes = useNotesStore((s) => s.scanAllNotes);
  const cancelNoteContentScan = useNotesStore((s) => s.cancelNoteContentScan);
  const pruneNoteContentsCacheToOpenNotes = useNotesStore((s) => s.pruneNoteContentsCacheToOpenNotes);
  const starredEntries = useNotesStore((s) => s.starredEntries);
  const currentNotesRoot = useNotesRootStore((s) => s.currentNotesRoot);
  const recentNotesRoots = useNotesRootStore((s) => s.recentNotesRoots);
  const notesRootStoreHasInitialized = useNotesRootStore((s) => s.hasInitialized);
  const notesRootStoreIsLoading = useNotesRootStore((s) => s.isLoading);
  const openNotesRoot = useNotesRootStore((s) => s.openNotesRoot);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const currentDraftPreviewTitle = useUIStore((s) => {
    if (!currentNotePath || s.notesPreviewTitle?.path !== currentNotePath) {
      return '';
    }

    return s.notesPreviewTitle.title.trim();
  });
  const effectiveSearchOpen = active && search.isSearchOpen;
  const effectiveSearchQuery = active ? search.searchQuery : '';
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(effectiveSearchQuery);
  useEffect(() => {
    if (!effectiveSearchOpen || effectiveSearchQuery.trim().length < 2) {
      setDebouncedSearchQuery(effectiveSearchQuery);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(effectiveSearchQuery);
    }, themeUiFeedbackTokens.notesSidebarSearchDebounceMs);
    return () => window.clearTimeout(timeoutId);
  }, [effectiveSearchOpen, effectiveSearchQuery]);
  const deferredSearchQuery = useDeferredValue(debouncedSearchQuery);
  const shouldSubscribeToSearchContents =
    active || (effectiveSearchOpen && deferredSearchQuery.trim().length >= 2);
  const noteContentsCache = useNotesStore((s) =>
    shouldSubscribeToSearchContents ? s.noteContentsCache : EMPTY_NOTE_CONTENTS_CACHE
  );
  const noteContentsCacheRevision = useNotesStore((s) =>
    shouldSubscribeToSearchContents ? s.noteContentsCacheRevision : 0
  );
  const currentDraftContent = useNotesStore((s) =>
    currentNotePath && isDraftNotePath(currentNotePath)
      ? s.currentNote?.path === currentNotePath
        ? s.currentNote.content
        : s.noteContentsCache.get(currentNotePath)?.content ?? ''
      : ''
  );
  const sidebarRootRef = useRef<HTMLDivElement | null>(null);
  const rootBlankAreaRef = useRef<HTMLDivElement | null>(null);
  const displayRootFolder = useSidebarDisplayRootFolder({
    rootFolder,
    currentNotePath,
    draftNotes,
    currentDraftPreviewTitle,
    currentDraftContent,
  });
  const {
    inputRef,
    scrollRootRef,
    hideSearch,
    shouldShowSearchResults,
  } = useSidebarSearchDrawerState({
    enabled: active,
    isOpen: effectiveSearchOpen,
    query: effectiveSearchQuery,
    onClose: search.closeSearch,
    scopeRef: sidebarRootRef,
  });
  const hasNotesRootPendingRoot = Boolean(currentNotesRoot && notesPath === currentNotesRoot.path && !displayRootFolder);
  const hasFileTreeEntries = Boolean(displayRootFolder && displayRootFolder.children.length > 0);
  const liveNoteContent = useSidebarLiveNoteContent({
    active,
    currentNotePath,
  });
  const { isContentScanPending, searchResults } = useSidebarContentSearchResults({
    rootFolder: displayRootFolder,
    getDisplayName,
    noteContentsCache,
    noteContentsCacheRevision,
    scanAllNotes,
    cancelNoteContentScan,
    pruneNoteContentsCacheToOpenNotes,
    searchQuery: deferredSearchQuery,
    isSearchOpen: effectiveSearchOpen,
    starredEntries,
    currentNotesRootPath: currentNotesRoot?.path ?? notesPath,
    liveNoteContent,
  });
  const { tags } = useNotesSidebarTags({
    rootFolder: displayRootFolder,
    noteContentsCache,
    noteContentsCacheRevision,
    liveNoteContent: liveNoteContent?.path === currentNotePath ? liveNoteContent : null,
    scanAllNotes,
    starredEntries,
    currentNotesRootPath: currentNotesRoot?.path ?? notesPath,
    active: active && !effectiveSearchOpen,
  });
  const hasLoadedRootFolder = Boolean(displayRootFolder);
  const shouldShowInlineEmptyHint = !isLoading && hasLoadedRootFolder && !hasFileTreeEntries;
  const shouldShowFloatingEmptyHint = !isLoading && !hasNotesRootPendingRoot && !hasLoadedRootFolder;
  const shouldShowEmptyWorkspacePanel =
    notesRootStoreHasInitialized &&
    !notesRootStoreIsLoading &&
    (shouldShowInlineEmptyHint || (shouldShowFloatingEmptyHint && (!sidebarCollapsed || isPeeking)));
  const shouldRenderRootFolderRow = Boolean(
    displayRootFolder || hasNotesRootPendingRoot || shouldShowInlineEmptyHint,
  );
  const recentEmptyWorkspaceNotesRoots = useMemo(() => (
    getEmptyWorkspaceRecentNotesRoots(
      recentNotesRoots,
      shouldRenderRootFolderRow ? currentNotesRoot?.path : null,
    )
  ), [currentNotesRoot?.path, recentNotesRoots, shouldRenderRootFolderRow]);
  const {
    activeSearchResultId,
    handleOpenSearchResult,
    handleOpenTagPath,
    selectedSearchResult,
    selectNextSearchResult,
    selectPreviousSearchResult,
  } = useSidebarContentNavigation({
    active,
    currentNotePath,
    deferredSearchQuery,
    effectiveSearchOpen,
    effectiveSearchQuery,
    openNote,
    openNoteByAbsolutePath,
    searchResults,
  });

  useSidebarRenameShortcut(active);
  useSidebarCurrentNoteReveal({
    active,
    currentNotePath,
    displayRootFolder,
    revealFolder,
    scrollRootRef,
    shouldShowSearchResults,
  });

  const handleOpenMarkdownFile = () => {
    window.dispatchEvent(new Event('app-open-markdown-target-file'));
  };

  const handleOpenFolder = () => {
    window.dispatchEvent(new Event('app-open-markdown-target-folder'));
  };

  const handleOpenRecentNotesRoot = (path: string) => {
    void openNotesRoot(path).catch(() => undefined);
  };

  return (
    <SidebarContentView
      active={active}
      activeSearchResultId={activeSearchResultId}
      className={className}
      closeSearchLabel={t('notes.closeSidebarSearch')}
      createFolder={createFolder}
      createNote={createNote}
      currentNotePath={currentNotePath}
      deferredSearchQuery={deferredSearchQuery}
      displayRootFolder={displayRootFolder}
      effectiveSearchOpen={effectiveSearchOpen}
      effectiveSearchQuery={effectiveSearchQuery}
      folderLabel={t('notes.folder')}
      getDisplayName={getDisplayName}
      handleOpenRecentNotesRoot={handleOpenRecentNotesRoot}
      handleOpenSearchResult={handleOpenSearchResult}
      handleOpenTagPath={handleOpenTagPath}
      hasFileTreeEntries={hasFileTreeEntries}
      hideSearch={hideSearch}
      inputRef={inputRef}
      isContentScanPending={isContentScanPending}
      isLoading={isLoading}
      isPeeking={isPeeking}
      openFileLabel={t('notes.file')}
      openFolderLabel={t('notes.folder')}
      onOpenFile={handleOpenMarkdownFile}
      onOpenFolder={handleOpenFolder}
      recentNotesRoots={recentEmptyWorkspaceNotesRoots}
      rootBlankAreaRef={rootBlankAreaRef}
      scrollRootRef={scrollRootRef}
      searchResults={searchResults}
      selectedSearchResult={selectedSearchResult}
      setSearchQuery={search.setSearchQuery}
      shouldRenderRootFolderRow={shouldRenderRootFolderRow}
      shouldShowEmptyWorkspacePanel={shouldShowEmptyWorkspacePanel}
      shouldShowSearchResults={shouldShowSearchResults}
      sidebarRootRef={sidebarRootRef}
      tags={tags}
      selectNextSearchResult={selectNextSearchResult}
      selectPreviousSearchResult={selectPreviousSearchResult}
    />
  );
}
