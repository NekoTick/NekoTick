import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useSidebarContentSearchResults } from '@/components/Notes/features/Sidebar/useSidebarContentSearchResults';
import { useWhiteboardStore } from '@/components/Whiteboard/stores/useWhiteboardStore';
import { collectNoteGraphSearchNodes } from '@/components/Graph/model/graphNotePaths';
import { useGraphUIStore } from '@/components/Graph/store/useGraphUIStore';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n';
import { WHITEBOARD_SYSTEM_STORAGE_SCOPE } from '@/lib/storage/whiteboardStoragePaths';
import { cn } from '@/lib/utils';
import { openStoredNotePath } from '@/stores/notes/openNotePath';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { useNotesRootStore } from '@/stores/useNotesRootStore';
import { useNotesStore } from '@/stores/useNotesStore';
import { actions as aiActions } from '@/stores/useAIStore';
import { useUIStore } from '@/stores/uiSlice';
import { themeIconTokens } from '@/styles/themeTokens';
import { GlobalSearchPreview } from './GlobalSearchPreview';
import {
  getGlobalSearchGroupLabel,
  GlobalSearchResultIcon,
} from './GlobalSearchResultPresentation';
import { didOpenGlobalSearchResult } from './globalSearchOpenState';
import {
  buildGlobalSearchGroups,
  createDefaultNoteSearchResults,
  type GlobalSearchResult,
} from './globalSearchResults';
import {
  prepareGlobalChatSearch,
  prepareGlobalWhiteboardSearch,
  sortDefaultGlobalGraphNodes,
} from './globalSearchSources';

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY_SESSIONS: never[] = [];
const EMPTY_CHAT_MESSAGES: never[] = [];

export function GlobalSearchDialog({ open, onOpenChange }: GlobalSearchDialogProps) {
  const { t } = useI18n();
  const appViewMode = useUIStore((state) => state.appViewMode);
  const setAppViewMode = useUIStore((state) => state.setAppViewMode);
  const setGraphMode = useGraphUIStore((state) => state.setMode);
  const setGraphSelectedPath = useGraphUIStore((state) => state.setSelectedPath);
  const rootFolder = useNotesStore((state) => state.rootFolder);
  const currentNote = useNotesStore((state) => state.currentNote);
  const noteContentsCache = useNotesStore((state) => state.noteContentsCache);
  const noteContentsCacheRevision = useNotesStore((state) => state.noteContentsCacheRevision);
  const starredEntries = useNotesStore((state) => state.starredEntries);
  const notesPath = useNotesStore((state) => state.notesPath);
  const getDisplayName = useNotesStore((state) => state.getDisplayName);
  const scanAllNotes = useNotesStore((state) => state.scanAllNotes);
  const cancelNoteContentScan = useNotesStore((state) => state.cancelNoteContentScan);
  const pruneNoteContentsCacheToOpenNotes = useNotesStore((state) => state.pruneNoteContentsCacheToOpenNotes);
  const prefetchNote = useNotesStore((state) => state.prefetchNote);
  const cancelPrefetchNote = useNotesStore((state) => state.cancelPrefetchNote);
  const openNote = useNotesStore((state) => state.openNote);
  const openNoteByAbsolutePath = useNotesStore((state) => state.openNoteByAbsolutePath);
  const currentNotesRoot = useNotesRootStore((state) => state.currentNotesRoot);
  const sessions = useUnifiedStore((state) => state.data.ai?.sessions ?? EMPTY_SESSIONS);
  const boards = useWhiteboardStore((state) => state.boards);
  const activeBoardId = useWhiteboardStore((state) => state.activeBoardId);
  const activeSnapshot = useWhiteboardStore((state) => state.activeSnapshot);
  const loadWhiteboards = useWhiteboardStore((state) => state.loadForNotesRoot);
  const selectBoard = useWhiteboardStore((state) => state.selectBoard);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const resultListRef = useRef<HTMLDivElement>(null);
  const openRequestRef = useRef(0);
  const whiteboardOpenQueueRef = useRef<Promise<void>>(Promise.resolve());
  const isInputComposingRef = useRef(false);
  const deferredQuery = useDeferredValue(query);
  const whiteboardRootPath = currentNotesRoot?.path ?? WHITEBOARD_SYSTEM_STORAGE_SCOPE;

  const {
    isContentScanPending,
    searchIndex: noteSearchIndex,
    searchResults: noteSearchResults,
  } = useSidebarContentSearchResults({
    rootFolder,
    getDisplayName,
    noteContentsCache,
    noteContentsCacheRevision,
    scanAllNotes,
    cancelNoteContentScan,
    pruneNoteContentsCacheToOpenNotes,
    searchQuery: deferredQuery,
    isSearchOpen: open,
    starredEntries,
    currentNotesRootPath: currentNotesRoot?.path ?? notesPath,
    liveNoteContent: currentNote,
  });
  const defaultNoteResults = useMemo(
    () => createDefaultNoteSearchResults(noteSearchIndex),
    [noteSearchIndex],
  );
  const graphNodes = useMemo(
    () => collectNoteGraphSearchNodes(rootFolder?.children ?? []),
    [rootFolder],
  );
  const chatSearch = useMemo(() => prepareGlobalChatSearch(sessions), [sessions]);
  const defaultGraphNodes = useMemo(() => sortDefaultGlobalGraphNodes(graphNodes), [graphNodes]);
  const preparedWhiteboards = useMemo(() => prepareGlobalWhiteboardSearch(boards), [boards]);
  const searchSources = useMemo(() => ({
    ...chatSearch,
    defaultGraphNodes,
    graphNodes,
    whiteboards: preparedWhiteboards,
  }), [chatSearch, defaultGraphNodes, graphNodes, preparedWhiteboards]);
  const noteResults = deferredQuery.trim() ? noteSearchResults : defaultNoteResults;
  const groups = useMemo(() => buildGlobalSearchGroups({
    appViewMode,
    chatTitleFallback: t('chat.newChatTitle'),
    noteResults,
    query: deferredQuery,
    sources: searchSources,
  }), [appViewMode, deferredQuery, noteResults, searchSources, t]);
  const visibleResults = useMemo(() => groups.flatMap((group) => group.results), [groups]);
  const resultIndexById = useMemo(
    () => new Map(visibleResults.map((result, index) => [result.id, index])),
    [visibleResults],
  );
  const selectedResult = visibleResults[selectedIndex] ?? null;
  const selectedNotePath = selectedResult?.kind === 'notes'
    ? selectedResult.note.openPath ?? selectedResult.note.path
    : null;
  const selectedNoteContent = selectedResult?.kind === 'notes' && selectedNotePath
    ? currentNote?.path === selectedNotePath
      ? currentNote.content
      : noteContentsCache.get(selectedNotePath)?.content ?? selectedResult.note.contentSnippet ?? ''
    : '';
  const selectedChatId = selectedResult?.kind === 'chat' ? selectedResult.session.id : null;
  const selectedChatMessages = useUnifiedStore(useCallback(
    (state) => selectedChatId
      ? state.data.ai?.messages[selectedChatId] ?? EMPTY_CHAT_MESSAGES
      : EMPTY_CHAT_MESSAGES,
    [selectedChatId],
  ));

  useEffect(() => {
    if (!open) return;
    void loadWhiteboards(whiteboardRootPath).catch(() => undefined);
  }, [loadWhiteboards, open, whiteboardRootPath]);
  useEffect(() => setSelectedIndex(0), [deferredQuery]);
  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(visibleResults.length - 1, 0)));
  }, [visibleResults.length]);
  useEffect(() => {
    resultListRef.current
      ?.querySelector<HTMLElement>(`[data-global-search-index="${selectedIndex}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedIndex, visibleResults]);
  useEffect(() => {
    if (!selectedResult) return;
    if (selectedResult.kind === 'notes') {
      if (!selectedNotePath || selectedResult.note.isExternal || currentNote?.path === selectedNotePath) return;
      void prefetchNote(selectedNotePath);
      return () => cancelPrefetchNote(selectedNotePath);
    }
    if (selectedResult.kind === 'chat') {
      void aiActions.prefetchSession(selectedResult.session.id);
      return () => aiActions.cancelSessionPrefetch(selectedResult.session.id);
    }
  }, [cancelPrefetchNote, currentNote?.path, prefetchNote, selectedNotePath, selectedResult]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      openRequestRef.current += 1;
      isInputComposingRef.current = false;
      setQuery('');
      setSelectedIndex(0);
    }
    onOpenChange(nextOpen);
  };
  const openGraphPath = (path: string) => {
    setGraphMode('local');
    setGraphSelectedPath(path);
    setAppViewMode('graph');
    handleOpenChange(false);
  };
  const openResult = async (result: GlobalSearchResult | null) => {
    if (!result) return;
    const requestId = ++openRequestRef.current;
    if (result.kind === 'notes') {
      await openStoredNotePath(result.note.openPath ?? result.note.path, { openNote, openNoteByAbsolutePath });
    } else if (result.kind === 'chat') {
      await aiActions.switchSession(result.session.id);
    } else if (result.kind === 'graph') {
      setGraphMode('local');
      setGraphSelectedPath(result.node.id);
    } else if (result.kind === 'whiteboard') {
      const openWhiteboard = whiteboardOpenQueueRef.current.then(async () => {
        await loadWhiteboards(whiteboardRootPath);
        await selectBoard(result.board.id);
      });
      whiteboardOpenQueueRef.current = openWhiteboard.catch(() => undefined);
      await openWhiteboard;
    }
    if (requestId !== openRequestRef.current) return;
    if (!didOpenGlobalSearchResult(result)) return;
    setAppViewMode(result.kind);
    handleOpenChange(false);
  };
  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    const nativeEvent = event.nativeEvent as KeyboardEvent & { isComposing?: boolean; keyCode?: number };
    if (isInputComposingRef.current || nativeEvent.isComposing || nativeEvent.keyCode === 229) return;
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && visibleResults.length > 0) {
      event.preventDefault();
      const offset = event.key === 'ArrowDown' ? 1 : -1;
      setSelectedIndex((current) => (current + offset + visibleResults.length) % visibleResults.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (query !== deferredQuery) return;
      void openResult(selectedResult).catch(() => undefined);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} useBlurBackdrop className="!flex h-[var(--vlaina-height-global-search)] w-[var(--vlaina-width-global-search)] max-w-none flex-col gap-0 overflow-hidden rounded-[var(--vlaina-ui-radius-panel)] border-[var(--vlaina-color-border-shell)] bg-[var(--vlaina-color-floating-surface)] p-0 sm:max-w-none">
        <DialogTitle className="sr-only">{t('sidebar.search')}</DialogTitle>
        <DialogDescription className="sr-only">{t('shortcut.action.sidebarSearch')}</DialogDescription>
        <div className="flex h-[var(--vlaina-size-48px)] shrink-0 items-center border-b border-[var(--vlaina-color-border-shell)] px-4">
          <Icon name="common.search" size={themeIconTokens.sizeCompact} className="shrink-0 text-[var(--vlaina-sidebar-notes-text-soft)]" />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onCompositionStart={() => { isInputComposingRef.current = true; }} onCompositionEnd={() => { isInputComposingRef.current = false; }} onKeyDown={handleInputKeyDown} placeholder={t('sidebar.search')} aria-label={t('sidebar.search')} aria-controls="global-search-results" aria-activedescendant={selectedResult ? `global-search-result-${selectedIndex}` : undefined} className="h-full min-w-0 flex-1 bg-transparent px-3 text-[length:var(--vlaina-font-sm)] text-[var(--vlaina-text-primary)] outline-none placeholder:text-[var(--vlaina-text-tertiary)]" />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[var(--vlaina-width-global-search-results)_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col border-r border-[var(--vlaina-color-border-shell)]">
            <div ref={resultListRef} id="global-search-results" role="listbox" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {isContentScanPending ? <div className="px-2 py-2 text-[length:var(--vlaina-font-12)] text-[var(--vlaina-sidebar-notes-text-soft)]">{t('notes.searchingNoteContents')}</div> : null}
              {groups.map((group) => (
                <section key={group.kind}>
                  <div className="shrink-0 px-2 pb-1 pt-3 text-[length:var(--vlaina-font-11)] font-medium text-[var(--vlaina-sidebar-notes-text-soft)]">{getGlobalSearchGroupLabel(group.kind, t)}</div>
                  {group.results.map((result) => {
                    const index = resultIndexById.get(result.id) ?? 0;
                    return (
                      <button key={result.id} id={`global-search-result-${index}`} data-global-search-index={index} type="button" role="option" aria-selected={index === selectedIndex} onPointerMove={() => setSelectedIndex(index)} onFocus={() => setSelectedIndex(index)} onClick={() => void openResult(result).catch(() => undefined)} className={cn('group/global-search-result mb-0.5 flex w-full cursor-pointer items-start gap-2 rounded-[var(--vlaina-notes-ui-radius-compact)] px-2 py-2 text-left [contain-intrinsic-size:auto_var(--vlaina-size-44px)] [content-visibility:auto]', index === selectedIndex && 'bg-[var(--vlaina-sidebar-row-selected-bg)] shadow-[var(--vlaina-shadow-selection-soft)]')}>
                        <span className="mt-0.5 flex size-[var(--vlaina-size-18px)] shrink-0 items-center justify-center"><GlobalSearchResultIcon result={result} notesRootPath={currentNotesRoot?.path ?? notesPath} /></span>
                        <span className="min-w-0 flex-1">
                          <span className={cn(
                            'block truncate text-[length:var(--vlaina-font-13)] font-medium group-hover/global-search-result:text-[var(--vlaina-sidebar-row-selected-text)] group-focus-within/global-search-result:text-[var(--vlaina-sidebar-row-selected-text)]',
                            index === selectedIndex
                              ? 'text-[var(--vlaina-sidebar-row-selected-text)]'
                              : 'text-[var(--vlaina-sidebar-notes-text)]',
                          )}>{result.title}</span>
                          {result.subtitle ? (
                            <span className={cn(
                              'block truncate text-[length:var(--vlaina-font-11)] group-hover/global-search-result:text-[var(--vlaina-sidebar-row-selected-text-soft)] group-focus-within/global-search-result:text-[var(--vlaina-sidebar-row-selected-text-soft)]',
                              index === selectedIndex
                                ? 'text-[var(--vlaina-sidebar-row-selected-text-soft)]'
                                : 'text-[var(--vlaina-sidebar-notes-text-soft)]',
                            )}>{result.subtitle}</span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </section>
              ))}
              {!isContentScanPending && visibleResults.length === 0 ? <div className="px-2 py-8 text-center text-[length:var(--vlaina-font-12)] text-[var(--vlaina-sidebar-notes-text-soft)]">{t('shortcut.noResults')}</div> : null}
            </div>
          </div>
          <div className="relative min-h-0 bg-[var(--vlaina-bg-primary)]">
            {selectedResult ? (
              <>
                <GlobalSearchPreview result={selectedResult} noteContent={selectedNoteContent} chatMessages={selectedChatMessages} notesRootPath={whiteboardRootPath} activeBoardId={activeBoardId} activeSnapshot={activeSnapshot} onOpenGraph={openGraphPath} />
                <button type="button" onClick={() => void openResult(selectedResult).catch(() => undefined)} className="absolute bottom-4 right-4 z-[var(--vlaina-z-20)] flex h-[var(--vlaina-size-36px)] cursor-pointer items-center gap-1.5 rounded-[var(--vlaina-radius-pill)] bg-[var(--vlaina-color-floating-surface)] px-3 text-[length:var(--vlaina-font-13)] font-medium text-[var(--vlaina-text-primary)] shadow-[var(--vlaina-shadow-raised-soft)] transition-colors duration-[var(--vlaina-duration-150)] hover:text-[var(--vlaina-accent)] motion-reduce:transition-none"><Icon name="nav.arrowUpRight" size="sm" />{t('editor.video.open')}</button>
              </>
            ) : <div className="flex h-full items-center justify-center text-[length:var(--vlaina-font-12)] text-[var(--vlaina-sidebar-notes-text-soft)]">{t('shortcut.noResults')}</div>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
