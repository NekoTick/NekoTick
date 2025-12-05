import { useState, useMemo, useCallback } from 'react';
import type { Group, StoreTask } from '@/stores/types';
import type { SortOption } from './GroupToolbar';

interface UseGroupFilterOptions {
  groups: Group[];
  tasks: StoreTask[];
  onGlobalSearchChange?: (query: string) => void;
}

interface UseGroupFilterReturn {
  // Search state
  isSearching: boolean;
  setIsSearching: (value: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchGroupName: boolean;
  setSearchGroupName: (value: boolean) => void;
  searchTaskContent: boolean;
  setSearchTaskContent: (value: boolean) => void;
  
  // Sort state
  sortBy: SortOption;
  setSortBy: (option: SortOption) => void;
  
  // Filtered results
  filteredGroups: Group[];
  groupIds: string[];
  
  // Actions
  clearSearch: () => void;
}

/**
 * Hook for managing group filtering and sorting
 */
export function useGroupFilter({
  groups,
  tasks,
  onGlobalSearchChange,
}: UseGroupFilterOptions): UseGroupFilterReturn {
  // Search state
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchGroupName, setSearchGroupName] = useState(true);
  const [searchTaskContent, setSearchTaskContent] = useState(true);
  
  // Sort state
  const [sortBy, setSortBy] = useState<SortOption>('none');

  // Handle search query change with optional global sync
  const handleSetSearchQuery = useCallback((query: string) => {
    setSearchQuery(query);
    onGlobalSearchChange?.(query);
  }, [onGlobalSearchChange]);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setIsSearching(false);
    onGlobalSearchChange?.('');
  }, [onGlobalSearchChange]);

  // Filtered and sorted groups
  const filteredGroups = useMemo(() => {
    let result = groups;
    
    // Apply search filter
    if (searchQuery.trim() && (searchGroupName || searchTaskContent)) {
      const query = searchQuery.toLowerCase();
      result = groups.filter(group => {
        // Search in group name
        if (searchGroupName && group.name.toLowerCase().includes(query)) {
          return true;
        }
        // Search in task content
        if (searchTaskContent) {
          const groupTasks = tasks.filter(t => t.groupId === group.id);
          if (groupTasks.some(task => task.content.toLowerCase().includes(query))) {
            return true;
          }
        }
        return false;
      });
    }
    
    // Apply sorting
    return [...result].sort((a, b) => {
      // Pinned groups always first
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      
      if (sortBy === 'none') return 0;
      
      switch (sortBy) {
        case 'name-asc':
          return a.name.localeCompare(b.name, 'zh-CN');
        case 'name-desc':
          return b.name.localeCompare(a.name, 'zh-CN');
        case 'edited-desc':
          return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
        case 'edited-asc':
          return (a.updatedAt || a.createdAt) - (b.updatedAt || b.createdAt);
        case 'created-desc':
          return b.createdAt - a.createdAt;
        case 'created-asc':
          return a.createdAt - b.createdAt;
        default:
          return 0;
      }
    });
  }, [groups, tasks, searchQuery, searchGroupName, searchTaskContent, sortBy]);

  // Extract group IDs for drag-drop context
  const groupIds = useMemo(() => filteredGroups.map(g => g.id), [filteredGroups]);

  return {
    // Search state
    isSearching,
    setIsSearching,
    searchQuery,
    setSearchQuery: handleSetSearchQuery,
    searchGroupName,
    setSearchGroupName,
    searchTaskContent,
    setSearchTaskContent,
    
    // Sort state
    sortBy,
    setSortBy,
    
    // Results
    filteredGroups,
    groupIds,
    
    // Actions
    clearSearch,
  };
}
