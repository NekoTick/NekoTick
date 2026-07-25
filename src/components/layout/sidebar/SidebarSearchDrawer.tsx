import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { cn } from '@/lib/utils';
import { useHeldPageScroll } from '@/hooks/useHeldPageScroll';
import { SidebarSearchField } from './SidebarPrimitives';
import { useSidebarSearchControls } from './useSidebarSearchControls';

interface UseSidebarSearchDrawerStateOptions {
  enabled?: boolean;
  isOpen: boolean;
  query: string;
  onOpen: () => void;
  onClose: () => void;
  scopeRef: RefObject<HTMLElement | null>;
}

interface SidebarSearchDrawerProps {
  isSearchOpen: boolean;
  shouldShowTopActions: boolean;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  hideSearch: () => void;
  canSubmit: boolean;
  onSubmit: () => void;
  canSelectPrevious?: boolean;
  canSelectNext?: boolean;
  onSelectPrevious?: () => void;
  onSelectNext?: () => void;
  placeholder: string;
  ariaLabel?: string;
  activeDescendant?: string;
  closeLabel: string;
  resultsId?: string;
  hasSearchResults?: boolean;
  topActions?: ReactNode;
}

export function useSidebarSearchDrawerState({
  enabled = true,
  isOpen,
  query,
  onOpen,
  onClose,
  scopeRef,
}: UseSidebarSearchDrawerStateOptions) {
  const {
    inputRef,
    scrollRootRef,
    hideSearch,
    handleScroll,
  } = useSidebarSearchControls({
    enabled,
    isOpen,
    query,
    onOpen,
    onClose,
    interactionScopeRef: scopeRef,
  });

  useHeldPageScroll(scrollRootRef, {
    enabled,
    scopeRef,
    ignoreEditableTargets: true,
  });

  const shouldShowSearchResults = enabled && isOpen && query.trim().length > 0;

  return {
    inputRef,
    scrollRootRef,
    hideSearch,
    handleScroll,
    shouldShowSearchResults,
  };
}

export function SidebarSearchDrawer({
  isSearchOpen,
  shouldShowTopActions,
  searchQuery,
  setSearchQuery,
  inputRef,
  hideSearch,
  canSubmit,
  onSubmit,
  canSelectPrevious = false,
  canSelectNext = false,
  onSelectPrevious,
  onSelectNext,
  placeholder,
  ariaLabel,
  activeDescendant,
  closeLabel,
  resultsId,
  hasSearchResults = false,
  topActions,
}: SidebarSearchDrawerProps) {
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    const native = event.nativeEvent as globalThis.KeyboardEvent & { isComposing?: boolean; keyCode?: number };
    if (native.isComposing || native.keyCode === 229) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      hideSearch();
      return;
    }

    if (event.key === 'ArrowUp' && canSelectPrevious) {
      event.preventDefault();
      onSelectPrevious?.();
      return;
    }

    if (event.key === 'ArrowDown' && canSelectNext) {
      event.preventDefault();
      onSelectNext?.();
      return;
    }

    if (event.key === 'Enter' && canSubmit) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <>
      <div
        data-sidebar-search-drawer="true"
        data-state={isSearchOpen ? 'open' : 'closed'}
        aria-hidden={!isSearchOpen}
        inert={isSearchOpen ? undefined : true}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-[var(--vlaina-duration-200)] ease-out',
          isSearchOpen ? 'grid-rows-[1fr] opacity-[var(--vlaina-opacity-100)]' : 'grid-rows-[0fr] opacity-[var(--vlaina-opacity-0)]',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <SidebarSearchField
            ref={inputRef}
            type="text"
            role={resultsId ? 'combobox' : undefined}
            aria-autocomplete={resultsId ? 'list' : undefined}
            aria-expanded={resultsId ? hasSearchResults : undefined}
            aria-controls={resultsId && hasSearchResults ? resultsId : undefined}
            aria-activedescendant={hasSearchResults ? activeDescendant : undefined}
            disabled={!isSearchOpen}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-label={ariaLabel}
            placeholder={placeholder}
            onClose={hideSearch}
            closeLabel={closeLabel}
            className="pb-2"
          />
        </div>
      </div>

      {shouldShowTopActions ? topActions : null}
    </>
  );
}
