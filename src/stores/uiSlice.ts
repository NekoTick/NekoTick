// UI state store
// Handles: drawer, search, filters, drag state, archive view settings

import { create } from 'zustand';
import type { Priority } from './types';

const PRIORITY_FILTER_KEY = 'nekotick-priority-filter';
const ALL_PRIORITIES: Priority[] = ['red', 'yellow', 'purple', 'green', 'default'];

interface UIStore {
  // Drawer state
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  toggleDrawer: () => void;
  
  // Display settings
  hideCompleted: boolean;
  hideActualTime: boolean;
  setHideCompleted: (hide: boolean) => void;
  setHideActualTime: (hide: boolean) => void;
  
  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  
  // Priority filter
  selectedPriorities: Priority[];
  setSelectedPriorities: (priorities: Priority[]) => void;
  togglePriority: (priority: Priority) => void;
  toggleAllPriorities: () => void;
  
  // Archive time view settings
  archiveTimeView: 'day' | 'week' | 'month';
  archiveDayRange: number | 'all';
  archiveWeekRange: number | 'all';
  archiveMonthRange: number | 'all';
  setArchiveTimeView: (view: 'day' | 'week' | 'month') => void;
  setArchiveRange: (view: 'day' | 'week' | 'month', range: number | 'all') => void;
  getArchiveMaxDays: () => number | null;
  
  // Drag state
  draggingTaskId: string | null;
  setDraggingTaskId: (id: string | null) => void;
}

/**
 * Load priority filter from localStorage or return default
 */
function loadPriorityFilter(): Priority[] {
  try {
    const saved = localStorage.getItem(PRIORITY_FILTER_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Ignore parse errors
  }
  return ALL_PRIORITIES;
}

/**
 * Save priority filter to localStorage
 */
function savePriorityFilter(priorities: Priority[]): void {
  localStorage.setItem(PRIORITY_FILTER_KEY, JSON.stringify(priorities));
}

export const useUIStore = create<UIStore>()((set, get) => ({
  // Drawer state
  drawerOpen: false,
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  toggleDrawer: () => set((state) => ({ drawerOpen: !state.drawerOpen })),
  
  // Display settings
  hideCompleted: false,
  hideActualTime: false,
  setHideCompleted: (hide) => set({ hideCompleted: hide }),
  setHideActualTime: (hide) => set({ hideActualTime: hide }),
  
  // Search
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  
  // Priority filter (initialized from localStorage)
  selectedPriorities: loadPriorityFilter(),
  
  setSelectedPriorities: (priorities) => {
    set({ selectedPriorities: priorities });
    savePriorityFilter(priorities);
  },
  
  togglePriority: (priority) => {
    set((state) => {
      const newPriorities = state.selectedPriorities.includes(priority)
        ? state.selectedPriorities.filter(p => p !== priority)
        : [...state.selectedPriorities, priority];
      
      savePriorityFilter(newPriorities);
      return { selectedPriorities: newPriorities };
    });
  },
  
  toggleAllPriorities: () => {
    set((state) => {
      // Toggle between all selected and none selected
      const newPriorities = state.selectedPriorities.length === ALL_PRIORITIES.length
        ? []
        : ALL_PRIORITIES;
      savePriorityFilter(newPriorities);
      return { selectedPriorities: newPriorities };
    });
  },
  
  // Archive time view settings
  archiveTimeView: 'day',
  archiveDayRange: 7,
  archiveWeekRange: 4,
  archiveMonthRange: 3,
  
  setArchiveTimeView: (view) => set({ archiveTimeView: view }),
  
  setArchiveRange: (view, range) => {
    if (view === 'day') set({ archiveDayRange: range });
    else if (view === 'week') set({ archiveWeekRange: range });
    else set({ archiveMonthRange: range });
  },
  
  getArchiveMaxDays: (): number | null => {
    const state = get();
    const { archiveTimeView, archiveDayRange, archiveWeekRange, archiveMonthRange } = state;
    
    if (archiveTimeView === 'day') {
      return archiveDayRange === 'all' ? null : archiveDayRange as number;
    } else if (archiveTimeView === 'week') {
      return archiveWeekRange === 'all' ? null : (archiveWeekRange as number) * 7;
    } else {
      return archiveMonthRange === 'all' ? null : (archiveMonthRange as number) * 30;
    }
  },
  
  // Drag state
  draggingTaskId: null,
  setDraggingTaskId: (id) => set({ draggingTaskId: id }),
}));
