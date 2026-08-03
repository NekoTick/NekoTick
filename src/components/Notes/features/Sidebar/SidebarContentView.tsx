import { lazy, Suspense, type RefObject } from 'react';
import { SidebarSearchDrawer } from '@/components/layout/sidebar/SidebarSearchDrawer';
import {
  SidebarCapsulePanel,
  SIDEBAR_CAPSULE_SCROLLBAR_INSET_RIGHT,
} from '@/components/layout/sidebar/SidebarPrimitives';
import { cn } from '@/lib/utils';
import type { FolderNode } from '@/stores/useNotesStore';
import type { NotesRootInfo } from '@/stores/useNotesRootStore';
import { StarredSection } from '../Starred';
import { NotesSidebarScrollArea } from './NotesSidebarPrimitives';
import { SidebarEmptyWorkspacePanel } from './SidebarEmptyWorkspacePanel';
import { NotesSidebarTopActions } from './NotesSidebarTopActions';
import type { NotesSidebarSearchResult } from './notesSidebarSearchResults';
import { NotesTagsSection } from './NotesTagsSection';
import type { NotesSidebarTagEntry, NotesSidebarTagPath } from './notesSidebarTags';

const SidebarSearchResultsList = lazy(async () => {
  const mod = await import('./SidebarSearchResultsList');
  return { default: mod.SidebarSearchResultsList };
});
const RootFolderRow = lazy(async () => {
  const mod = await import('./RootFolderRow');
  return { default: mod.RootFolderRow };
});

interface SidebarContentViewProps {
  active: boolean;
  activeSearchResultId: string | null;
  className?: string;
  createFolder: (path: string) => Promise<string | null>;
  createNote: (folderPath?: string) => Promise<unknown>;
  currentNotePath?: string | null;
  deferredSearchQuery: string;
  displayRootFolder: FolderNode | null;
  effectiveSearchOpen: boolean;
  effectiveSearchQuery: string;
  folderLabel: string;
  getDisplayName: (path: string) => string;
  handleOpenRecentNotesRoot: (path: string) => void;
  handleOpenSearchResult: (result: NotesSidebarSearchResult) => void;
  handleOpenTagPath: (target: NotesSidebarTagPath) => void;
  hasFileTreeEntries: boolean;
  hideSearch: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  isContentScanPending: boolean;
  isLoading: boolean;
  isPeeking: boolean;
  openFileLabel: string;
  openFolderLabel: string;
  onOpenFile: () => void;
  onOpenFolder: () => void;
  recentNotesRoots: NotesRootInfo[];
  rootBlankAreaRef: RefObject<HTMLDivElement | null>;
  scrollRootRef: RefObject<HTMLDivElement | null>;
  searchResults: NotesSidebarSearchResult[];
  selectedSearchResult: NotesSidebarSearchResult | null;
  setSearchQuery: (value: string) => void;
  shouldRenderRootFolderRow: boolean;
  shouldShowEmptyWorkspacePanel: boolean;
  shouldShowSearchResults: boolean;
  sidebarRootRef: RefObject<HTMLDivElement | null>;
  tags: NotesSidebarTagEntry[];
  closeSearchLabel: string;
  selectNextSearchResult: () => void;
  selectPreviousSearchResult: () => void;
}

export function SidebarContentView({
  active,
  activeSearchResultId,
  className,
  closeSearchLabel,
  createFolder,
  createNote,
  currentNotePath,
  deferredSearchQuery,
  displayRootFolder,
  effectiveSearchOpen,
  effectiveSearchQuery,
  folderLabel,
  getDisplayName,
  handleOpenRecentNotesRoot,
  handleOpenSearchResult,
  handleOpenTagPath,
  hasFileTreeEntries,
  hideSearch,
  inputRef,
  isContentScanPending,
  isLoading,
  isPeeking,
  openFileLabel,
  openFolderLabel,
  onOpenFile,
  onOpenFolder,
  recentNotesRoots,
  rootBlankAreaRef,
  scrollRootRef,
  searchResults,
  selectedSearchResult,
  setSearchQuery,
  shouldRenderRootFolderRow,
  shouldShowEmptyWorkspacePanel,
  shouldShowSearchResults,
  sidebarRootRef,
  tags,
  selectNextSearchResult,
  selectPreviousSearchResult,
}: SidebarContentViewProps) {
  return (
    <div
      ref={sidebarRootRef}
      className={cn('group/sidebar-content relative flex h-full min-h-0 min-w-0 flex-col', className)}
    >
      <SidebarSearchDrawer
        isSearchOpen={effectiveSearchOpen}
        shouldShowTopActions={false}
        searchQuery={effectiveSearchQuery}
        setSearchQuery={setSearchQuery}
        inputRef={inputRef}
        hideSearch={hideSearch}
        canSubmit={Boolean(selectedSearchResult)}
        onSubmit={() => {
          const result = selectedSearchResult;
          if (!result) {
            return;
          }
          handleOpenSearchResult(result);
        }}
        canSelectPrevious={searchResults.length > 0}
        canSelectNext={searchResults.length > 0}
        onSelectPrevious={selectPreviousSearchResult}
        onSelectNext={selectNextSearchResult}
        placeholder=""
        closeLabel={closeSearchLabel}
        topActions={null}
      />

      <SidebarCapsulePanel>
        {!shouldShowSearchResults ? <NotesSidebarTopActions /> : null}

        <NotesSidebarScrollArea
          ref={scrollRootRef}
          className={cn('pt-0', isPeeking && 'app-scrollbar-rounded')}
          scrollbarInsetRight={SIDEBAR_CAPSULE_SCROLLBAR_INSET_RIGHT}
          data-notes-sidebar-scroll-root="true"
        >
          {shouldShowSearchResults ? (
            <Suspense fallback={null}>
              <SidebarSearchResultsList
                results={searchResults}
                query={deferredSearchQuery}
                currentNotePath={currentNotePath}
                activeResultId={activeSearchResultId}
                highlightedResultId={selectedSearchResult?.id ?? null}
                onOpen={handleOpenSearchResult}
                scrollRootRef={scrollRootRef}
                isContentScanPending={isContentScanPending}
              />
            </Suspense>
          ) : (
            <div className="relative flex min-h-full flex-col">
              <StarredSection showTitle={false} />
              {shouldRenderRootFolderRow ? (
                <Suspense fallback={null}>
                  <RootFolderRow
                    rootFolder={displayRootFolder}
                    isLoading={isLoading}
                    onCreateNote={createNote}
                    onCreateFolder={() => createFolder('')}
                    blankContextMenuRef={rootBlankAreaRef}
                    scrollRootRef={scrollRootRef}
                    active={active}
                  />
                </Suspense>
              ) : null}
              <NotesTagsSection
                tags={tags}
                currentNotePath={currentNotePath}
                getDisplayName={getDisplayName}
                onOpenNote={handleOpenTagPath}
              />
              <div
                ref={rootBlankAreaRef}
                data-notes-sidebar-blank-drag-root="true"
                data-notes-external-block-selection-root={displayRootFolder ? 'true' : undefined}
                data-file-tree-root-drop-target={displayRootFolder ? 'true' : undefined}
                className={cn(
                  'flex flex-1 justify-center',
                  hasFileTreeEntries ? 'min-h-0 items-center' : 'min-h-[var(--vlaina-size-160px)] items-center',
                )}
              >
                {shouldShowEmptyWorkspacePanel ? (
                  <SidebarEmptyWorkspacePanel
                    folderLabel={folderLabel}
                    openFileLabel={openFileLabel}
                    openFolderLabel={openFolderLabel}
                    recentNotesRoots={recentNotesRoots}
                    onOpenFile={onOpenFile}
                    onOpenFolder={onOpenFolder}
                    onOpenRecentNotesRoot={handleOpenRecentNotesRoot}
                  />
                ) : null}
              </div>
            </div>
          )}
        </NotesSidebarScrollArea>
      </SidebarCapsulePanel>
    </div>
  );
}
