import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useSidebarSearchDrawerState } from '@/components/layout/sidebar/SidebarSearchDrawer';
import { SIDEBAR_CLOSE_SEARCH_EVENT, type SidebarSearchScope } from '@/components/layout/sidebar/sidebarEvents';
import { useSidebarSearchState } from '@/components/layout/sidebar/useSidebarSearchState';
import { useSidebarSearchShortcut } from '@/hooks/useSidebarSearchShortcut';
import type { ChatSession } from '@/lib/ai/types';
import {
  buildChatSidebarSearchEntries,
  getVisibleChatSidebarSessions,
  queryChatSidebarSessions,
  sortChatSidebarSessions,
} from './chatSidebarSearch';

interface UseChatSidebarSearchOptions {
  enabled: boolean;
  scopeRef: RefObject<HTMLElement | null>;
  sessions: ChatSession[];
}

const EMPTY_FILTERED_SESSIONS: ChatSession[] = [];
const EMPTY_SEARCH_ENTRIES: ReturnType<typeof buildChatSidebarSearchEntries> = [];

export function useChatSidebarSearch({
  enabled,
  scopeRef,
  sessions,
}: UseChatSidebarSearchOptions) {
  const {
    isSearchOpen,
    searchQuery,
    setSearchQuery,
    closeSearch,
    toggleSearch,
  } = useSidebarSearchState('chat');

  useSidebarSearchShortcut(toggleSearch, enabled, 'chat');

  useEffect(() => {
    if (!enabled) {
      closeSearch();
    }
  }, [closeSearch, enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleCloseSearch = (event: Event) => {
      const eventScope = (event as CustomEvent<{ scope?: SidebarSearchScope }>).detail?.scope;
      if (eventScope !== 'chat') {
        return;
      }
      closeSearch();
    };

    window.addEventListener(SIDEBAR_CLOSE_SEARCH_EVENT, handleCloseSearch);
    return () => window.removeEventListener(SIDEBAR_CLOSE_SEARCH_EVENT, handleCloseSearch);
  }, [closeSearch, enabled]);

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const previousQueryRef = useRef('');
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);

  const drawer = useSidebarSearchDrawerState({
    enabled,
    isOpen: isSearchOpen,
    query: searchQuery,
    onClose: closeSearch,
    scopeRef,
  });

  const visibleSessions = useMemo(
    () => getVisibleChatSidebarSessions(sessions),
    [sessions],
  );

  const sortedSessions = useMemo(
    () => sortChatSidebarSessions(visibleSessions),
    [visibleSessions],
  );

  const shouldComputeSearchResults = enabled && isSearchOpen;
  const searchEntries = useMemo(
    () => shouldComputeSearchResults ? buildChatSidebarSearchEntries(sortedSessions) : EMPTY_SEARCH_ENTRIES,
    [shouldComputeSearchResults, sortedSessions],
  );

  const filteredSessions = useMemo(
    () => shouldComputeSearchResults
      ? queryChatSidebarSessions(searchEntries, deferredSearchQuery)
      : EMPTY_FILTERED_SESSIONS,
    [deferredSearchQuery, searchEntries, shouldComputeSearchResults],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const trimmedQuery = deferredSearchQuery.trim();
    if (trimmedQuery === previousQueryRef.current) {
      return;
    }

    previousQueryRef.current = trimmedQuery;
    setSelectedSearchIndex(0);
    drawer.scrollRootRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [deferredSearchQuery, drawer.scrollRootRef, enabled]);

  useEffect(() => {
    if (!enabled) {
      setSelectedSearchIndex(0);
      return;
    }

    setSelectedSearchIndex((current) => {
      if (filteredSessions.length === 0) {
        return 0;
      }
      return Math.min(current, filteredSessions.length - 1);
    });
  }, [enabled, filteredSessions.length]);

  const selectPreviousSearchResult = useCallback(() => {
    setSelectedSearchIndex((current) => {
      if (filteredSessions.length === 0) {
        return 0;
      }
      return (current - 1 + filteredSessions.length) % filteredSessions.length;
    });
  }, [filteredSessions.length]);

  const selectNextSearchResult = useCallback(() => {
    setSelectedSearchIndex((current) => {
      if (filteredSessions.length === 0) {
        return 0;
      }
      return (current + 1) % filteredSessions.length;
    });
  }, [filteredSessions.length]);

  const selectedSearchSession = filteredSessions[selectedSearchIndex] ?? null;

  return {
    isSearchOpen,
    searchQuery,
    deferredSearchQuery,
    setSearchQuery,
    closeSearch,
    toggleSearch,
    ...drawer,
    filteredSessions,
    selectedSearchIndex,
    selectedSearchSession,
    selectPreviousSearchResult,
    selectNextSearchResult,
    hasSessions: visibleSessions.length > 0,
    sessionsToRender: drawer.shouldShowSearchResults ? filteredSessions : sortedSessions,
  };
}
