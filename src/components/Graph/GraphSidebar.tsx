import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { AppViewModeSwitch } from '@/components/layout/sidebar/AppViewModeSwitch';
import {
  SidebarSearchDrawer,
  useSidebarSearchDrawerState,
} from '@/components/layout/sidebar/SidebarSearchDrawer';
import {
  SidebarActionGroup,
  SidebarCapsulePanel,
  SidebarList,
  SidebarScrollArea,
  SidebarSurface,
} from '@/components/layout/sidebar/SidebarPrimitives';
import {
  getSidebarIdleRowSurfaceClass,
  getSidebarSelectedRowSurfaceClass,
} from '@/components/layout/sidebar/sidebarLabelStyles';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useSidebarSearchShortcut } from '@/hooks/useSidebarSearchShortcut';
import { rankGraphNodes } from './model/graphFilters';
import { useNoteGraphModel } from './hooks/useNoteGraphModel';
import { useGraphUIStore, type GraphMode } from './store/useGraphUIStore';

const GRAPH_MODES: GraphMode[] = ['all', 'local'];
const MAX_GRAPH_SEARCH_RESULTS = 80;
const GRAPH_SEARCH_RESULTS_ID = 'graph-search-results';

export function GraphSidebar({ active = true }: { active?: boolean }) {
  const { t } = useI18n();
  const searchQuery = useGraphUIStore((state) => state.searchQuery);
  const setMode = useGraphUIStore((state) => state.setMode);
  const setSearchQuery = useGraphUIStore((state) => state.setSearchQuery);
  const setSelectedPath = useGraphUIStore((state) => state.setSelectedPath);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const {
    focusPath,
    fullGraph,
    mode,
    searchNodes,
    visibleGraph,
  } = useNoteGraphModel(active, { includeSearchNodes: isSearchOpen });
  const [searchResultIndex, setSearchResultIndex] = useState(0);
  const sidebarRootRef = useRef<HTMLDivElement | null>(null);
  const openSearch = useCallback(() => setIsSearchOpen(true), []);
  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
  }, [setSearchQuery]);
  const toggleSearch = useCallback(() => {
    if (isSearchOpen) {
      closeSearch();
      return;
    }
    openSearch();
  }, [closeSearch, isSearchOpen, openSearch]);
  useSidebarSearchShortcut(toggleSearch, active, 'graph');
  useEffect(() => {
    if (!active) closeSearch();
  }, [active, closeSearch]);
  const {
    inputRef,
    scrollRootRef,
    hideSearch,
    shouldShowSearchResults,
  } = useSidebarSearchDrawerState({
    enabled: active,
    isOpen: isSearchOpen,
    query: searchQuery,
    onClose: closeSearch,
    scopeRef: sidebarRootRef,
  });
  const searchResults = useMemo(
    () => rankGraphNodes(searchNodes, searchQuery).slice(0, MAX_GRAPH_SEARCH_RESULTS),
    [searchNodes, searchQuery],
  );
  const selectedSearchResultIndex = Math.min(
    searchResultIndex,
    Math.max(0, searchResults.length - 1),
  );
  const selectedSearchResult = searchResults[selectedSearchResultIndex] ?? null;
  const activeSearchResultId = selectedSearchResult
    ? `graph-search-result-${selectedSearchResultIndex}`
    : undefined;
  const graphIsLimited = (
    fullGraph.stats.nodesTruncated
    || fullGraph.stats.edgesTruncated
    || fullGraph.edges.length < fullGraph.stats.totalCandidateEdges
  );
  const localGraphIsIncomplete = fullGraph.stats.edgesTruncated
    || fullGraph.edges.length < fullGraph.stats.totalCandidateEdges;
  const graphSummary = mode === 'local'
    ? t('graph.summary', {
      links: `${visibleGraph.edges.length}${localGraphIsIncomplete ? '+' : ''}`,
      nodes: `${visibleGraph.nodes.length}${localGraphIsIncomplete ? '+' : ''}`,
    })
    : graphIsLimited
    ? t('graph.summaryLimited', {
      links: fullGraph.edges.length,
      nodes: fullGraph.nodes.length,
      totalLinks: `${fullGraph.stats.totalCandidateEdges}${fullGraph.stats.edgesTruncated ? '+' : ''}`,
      totalNodes: fullGraph.stats.totalCandidateNodes,
    })
    : t('graph.summary', {
      links: fullGraph.edges.length,
      nodes: fullGraph.nodes.length,
    });

  useEffect(() => {
    setSearchResultIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (!shouldShowSearchResults) return;
    const result = sidebarRootRef.current?.querySelector<HTMLElement>(
      `[data-graph-search-index="${selectedSearchResultIndex}"]`,
    );
    result?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedSearchResultIndex, shouldShowSearchResults]);

  const selectPreviousSearchResult = useCallback(() => {
    setSearchResultIndex((current) => (
      searchResults.length === 0
        ? 0
        : (current - 1 + searchResults.length) % searchResults.length
    ));
  }, [searchResults.length]);
  const selectNextSearchResult = useCallback(() => {
    setSearchResultIndex((current) => (
      searchResults.length === 0 ? 0 : (current + 1) % searchResults.length
    ));
  }, [searchResults.length]);

  return (
    <SidebarSurface
      ref={sidebarRootRef}
      data-graph-sidebar="true"
      className="bg-[var(--vlaina-sidebar-notes-surface)] text-[var(--vlaina-sidebar-notes-text)]"
    >
      <SidebarCapsulePanel>
        <SidebarActionGroup>
          <AppViewModeSwitch />
        </SidebarActionGroup>
        <div className="flex min-h-0 flex-1 flex-col pt-3">
          <SidebarSearchDrawer
            isSearchOpen={active && isSearchOpen}
            shouldShowTopActions={false}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            inputRef={inputRef}
            hideSearch={hideSearch}
            canSubmit={Boolean(selectedSearchResult)}
            onSubmit={() => {
              const result = selectedSearchResult;
              if (result) setSelectedPath(result.id);
            }}
            canSelectPrevious={searchResults.length > 0}
            canSelectNext={searchResults.length > 0}
            onSelectPrevious={selectPreviousSearchResult}
            onSelectNext={selectNextSearchResult}
            placeholder={t('graph.searchPlaceholder')}
            ariaLabel={t('graph.searchPlaceholder')}
            activeDescendant={shouldShowSearchResults ? activeSearchResultId : undefined}
            closeLabel={t('graph.clearSearch')}
            hasSearchResults={shouldShowSearchResults && searchResults.length > 0}
            resultsId={GRAPH_SEARCH_RESULTS_ID}
            topActions={null}
          />
          <div
            role="group"
            aria-label={t('app.viewGraph')}
            className={cn(
              'relative mx-2 grid h-[var(--vlaina-size-48px)] grid-cols-2 rounded-full p-[var(--vlaina-space-2px)]',
              isSearchOpen ? 'mt-1' : 'mt-3',
              raisedPillSurfaceClass,
            )}
          >
            <span
              data-graph-mode-indicator="true"
              aria-hidden="true"
              className={cn(
                'absolute inset-y-1 left-1 w-[var(--vlaina-width-graph-mode-indicator)] rounded-full bg-[var(--vlaina-sidebar-row-selected-bg)] shadow-[var(--vlaina-shadow-selection-soft)] transition-transform duration-[var(--vlaina-duration-200)] ease-[var(--vlaina-ease-feedback)] motion-reduce:transition-none',
                mode === 'local' ? 'translate-x-full' : 'translate-x-0',
              )}
            />
            {GRAPH_MODES.map((graphMode) => {
              const active = graphMode === mode;
              return (
                <button
                  key={graphMode}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setMode(graphMode)}
                  className={cn(
                    'relative z-[var(--vlaina-z-10)] h-[var(--vlaina-size-44px)] cursor-pointer rounded-full text-[length:var(--vlaina-font-13)] font-medium transition-colors duration-[var(--vlaina-duration-200)]',
                    active
                      ? 'text-[var(--vlaina-sidebar-row-selected-text)]'
                      : 'text-[var(--vlaina-sidebar-notes-text-soft)] hover:text-[var(--vlaina-sidebar-row-selected-text)]',
                  )}
                >
                  {t(graphMode === 'all' ? 'graph.modeAll' : 'graph.modeLocal')}
                </button>
              );
            })}
          </div>
          <p
            data-graph-summary="true"
            className="px-3 pt-2 text-[length:var(--vlaina-font-13)] text-[var(--vlaina-sidebar-notes-text-soft)]"
          >
            {graphSummary}
          </p>
          <SidebarScrollArea
            ref={scrollRootRef}
            className="min-h-0 flex-1 pt-0"
          >
            {shouldShowSearchResults ? (
              searchResults.length === 0 ? (
                <p role="status" className="px-1 text-[length:var(--vlaina-font-13)] leading-relaxed text-[var(--vlaina-sidebar-notes-text-soft)]">
                  {t('graph.searchNoResults')}
                </p>
              ) : (
                <SidebarList
                  id={GRAPH_SEARCH_RESULTS_ID}
                  role="listbox"
                  aria-label={t('graph.searchResults')}
                >
                  {searchResults.map((node, index) => {
                    const selected = node.id === focusPath;
                    const highlighted = index === selectedSearchResultIndex;
                    return (
                      <button
                        key={node.id}
                        id={`graph-search-result-${index}`}
                        type="button"
                        role="option"
                        tabIndex={-1}
                        aria-label={`${node.label}, ${node.id}`}
                        aria-current={selected ? 'true' : undefined}
                        aria-selected={highlighted}
                        data-graph-search-index={index}
                        onClick={() => {
                          setSearchResultIndex(index);
                          setSelectedPath(node.id);
                        }}
                        className={[
                          'flex min-h-[var(--vlaina-size-44px)] w-full cursor-pointer flex-col justify-center px-2.5 py-1.5 text-left',
                          selected || highlighted
                            ? getSidebarSelectedRowSurfaceClass('notes')
                            : getSidebarIdleRowSurfaceClass('notes'),
                        ].join(' ')}
                      >
                        <span className="w-full truncate text-[length:var(--vlaina-font-sm)] font-medium">
                          {node.label}
                        </span>
                        <span className="w-full truncate text-[length:var(--vlaina-font-13)] text-[var(--vlaina-sidebar-notes-text-soft)]">
                          {node.id}
                        </span>
                      </button>
                    );
                  })}
                </SidebarList>
              )
            ) : (
              <p className="px-1 text-[length:var(--vlaina-font-13)] leading-relaxed text-[var(--vlaina-sidebar-notes-text-soft)]">
                {t('graph.sidebarHint')}
              </p>
            )}
          </SidebarScrollArea>
        </div>
      </SidebarCapsulePanel>
    </SidebarSurface>
  );
}
