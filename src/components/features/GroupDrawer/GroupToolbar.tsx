import { useState, useRef, useEffect } from 'react';
import { X, Search, SquarePen, ArrowUpDown, SlidersHorizontal } from 'lucide-react';
import { IconButton } from './IconButton';

export type SortOption = 'none' | 'name-asc' | 'name-desc' | 'edited-desc' | 'edited-asc' | 'created-desc' | 'created-asc';

interface GroupToolbarProps {
  isSearching: boolean;
  setIsSearching: (v: boolean) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  onGlobalSearchChange: (v: string) => void;
  isAdding: boolean;
  setIsAdding: (v: boolean) => void;
  newGroupName: string;
  sortBy: SortOption;
  setSortBy: (v: SortOption) => void;
  searchGroupName: boolean;
  setSearchGroupName: (v: boolean) => void;
  searchTaskContent: boolean;
  setSearchTaskContent: (v: boolean) => void;
}

function SortMenuItem({ 
  label, 
  value, 
  current, 
  onSelect, 
  onClose 
}: { 
  label: string; 
  value: SortOption; 
  current: SortOption; 
  onSelect: (v: SortOption) => void; 
  onClose: () => void;
}) {
  return (
    <button
      onClick={() => {
        onSelect(value);
        onClose();
      }}
      className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
        current === value 
          ? 'text-zinc-900 bg-zinc-100' 
          : 'text-zinc-600 hover:bg-zinc-50'
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Toolbar with search, add, and sort functionality
 */
export function GroupToolbar({
  isSearching,
  setIsSearching,
  searchQuery,
  setSearchQuery,
  onGlobalSearchChange,
  isAdding,
  setIsAdding,
  newGroupName,
  sortBy,
  setSortBy,
  searchGroupName,
  setSearchGroupName,
  searchTaskContent,
  setSearchTaskContent,
}: GroupToolbarProps) {
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showSearchOptions, setShowSearchOptions] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const searchOptionsRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
      if (searchOptionsRef.current && !searchOptionsRef.current.contains(e.target as Node)) {
        setShowSearchOptions(false);
      }
    };
    if (showSortMenu || showSearchOptions) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSortMenu, showSearchOptions]);

  return (
    <>
      {/* Toolbar buttons */}
      <div className="flex items-center gap-1 px-3 pt-2 pb-1 shrink-0 relative z-50 overflow-visible">
        <IconButton onClick={() => setIsSearching(!isSearching)} active={isSearching} tooltip="Search">
          <Search className="size-4" />
        </IconButton>
        <IconButton onClick={() => {
          if (isAdding && !newGroupName.trim()) {
            setIsAdding(false);
          } else {
            setIsAdding(true);
          }
        }} active={isAdding} tooltip="New Group">
          <SquarePen className="size-4" />
        </IconButton>
        <div className="relative z-[100]" ref={sortMenuRef}>
          <IconButton onClick={() => setShowSortMenu(!showSortMenu)} active={showSortMenu} tooltip="Sort">
            <ArrowUpDown className="size-4" />
          </IconButton>
          {showSortMenu && (
            <div className="fixed w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1" style={{ 
              zIndex: 9999,
              left: sortMenuRef.current?.getBoundingClientRect().left + 'px',
              top: (sortMenuRef.current?.getBoundingClientRect().bottom ?? 0) + 4 + 'px'
            }}>
              <SortMenuItem label="No Sort" value="none" current={sortBy} onSelect={setSortBy} onClose={() => setShowSortMenu(false)} />
              <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
              <SortMenuItem label="Name (A-Z)" value="name-asc" current={sortBy} onSelect={setSortBy} onClose={() => setShowSortMenu(false)} />
              <SortMenuItem label="Name (Z-A)" value="name-desc" current={sortBy} onSelect={setSortBy} onClose={() => setShowSortMenu(false)} />
              <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
              <SortMenuItem label="Edited (Newest)" value="edited-desc" current={sortBy} onSelect={setSortBy} onClose={() => setShowSortMenu(false)} />
              <SortMenuItem label="Edited (Oldest)" value="edited-asc" current={sortBy} onSelect={setSortBy} onClose={() => setShowSortMenu(false)} />
              <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
              <SortMenuItem label="Created (Newest)" value="created-desc" current={sortBy} onSelect={setSortBy} onClose={() => setShowSortMenu(false)} />
              <SortMenuItem label="Created (Oldest)" value="created-asc" current={sortBy} onSelect={setSortBy} onClose={() => setShowSortMenu(false)} />
            </div>
          )}
        </div>
      </div>

      {/* Search input */}
      {isSearching && (
        <div className="px-2 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-md">
              <Search className="size-4 text-zinc-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  onGlobalSearchChange(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsSearching(false);
                    setSearchQuery('');
                    onGlobalSearchChange('');
                  }
                }}
                placeholder="Search..."
                autoFocus
                className="flex-1 min-w-0 text-sm bg-transparent outline-none placeholder:text-zinc-400"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    onGlobalSearchChange('');
                    searchInputRef.current?.focus();
                  }}
                  className="p-0.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X className="size-4 text-zinc-400" />
                </button>
              )}
            </div>
            <div className="relative shrink-0" ref={searchOptionsRef}>
              <button
                onClick={() => setShowSearchOptions(!showSearchOptions)}
                className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <SlidersHorizontal className="size-4 text-zinc-400" />
              </button>
              {showSearchOptions && (
                <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-2 px-3 z-50">
                  <div className="space-y-2">
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">Group Name</span>
                      <input
                        type="checkbox"
                        checked={searchGroupName}
                        onChange={(e) => setSearchGroupName(e.target.checked)}
                        className="w-9 h-5 appearance-none bg-zinc-200 dark:bg-zinc-700 rounded-full relative cursor-pointer transition-colors checked:bg-zinc-400 dark:checked:bg-zinc-500 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-transform checked:after:translate-x-4"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">Task Content</span>
                      <input
                        type="checkbox"
                        checked={searchTaskContent}
                        onChange={(e) => setSearchTaskContent(e.target.checked)}
                        className="w-9 h-5 appearance-none bg-zinc-200 dark:bg-zinc-700 rounded-full relative cursor-pointer transition-colors checked:bg-zinc-400 dark:checked:bg-zinc-500 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-transform checked:after:translate-x-4"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
