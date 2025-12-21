// UI state store
// Handles: drawer, search, filters, drag state, archive view settings

import { create } from 'zustand';
import type { ItemColor } from './types';

const COLOR_FILTER_KEY = 'nekotick-color-filter';
const STATUS_FILTER_KEY = 'nekotick-status-filter';
const ALL_COLORS: ItemColor[] = ['red', 'yellow', 'purple', 'green', 'blue', 'default'];

export type TaskStatus = 'todo' | 'scheduled' | 'completed';
const ALL_STATUSES: TaskStatus[] = ['todo', 'scheduled', 'completed'];

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

  // Color filter
  selectedColors: ItemColor[];
  setSelectedColors: (colors: ItemColor[]) => void;
  toggleColor: (color: ItemColor) => void;
  toggleAllColors: () => void;

  // Status filter
  selectedStatuses: TaskStatus[];
  setSelectedStatuses: (statuses: TaskStatus[]) => void;
  toggleStatus: (status: TaskStatus) => void;
  toggleAllStatuses: () => void;
  
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

function loadColorFilter(): ItemColor[] {
  try {
    const saved = localStorage.getItem(COLOR_FILTER_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Ignore parse errors
  }
  return ALL_COLORS;
}

function saveColorFilter(colors: ItemColor[]): void {
  localStorage.setItem(COLOR_FILTER_KEY, JSON.stringify(colors));
}

function loadStatusFilter(): TaskStatus[] {
  try {
    const saved = localStorage.getItem(STATUS_FILTER_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Ignore parse errors
  }
  return ALL_STATUSES;
}

function saveStatusFilter(statuses: TaskStatus[]): void {
  localStorage.setItem(STATUS_FILTER_KEY, JSON.stringify(statuses));
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
  
  // Color filter (initialized from localStorage)
  selectedColors: loadColorFilter(),

  setSelectedColors: (colors) => {
    set({ selectedColors: colors });
    saveColorFilter(colors);
  },

  toggleColor: (color) => {
    set((state) => {
      const newColors = state.selectedColors.includes(color)
        ? state.selectedColors.filter(c => c !== color)
        : [...state.selectedColors, color];

      saveColorFilter(newColors);
      return { selectedColors: newColors };
    });
  },

  toggleAllColors: () => {
    set((state) => {
      const newColors = state.selectedColors.length === ALL_COLORS.length ? [] : ALL_COLORS;
      saveColorFilter(newColors);
      return { selectedColors: newColors };
    });
  },

  // Status filter (initialized from localStorage)
  selectedStatuses: loadStatusFilter(),

  setSelectedStatuses: (statuses) => {
    set({ selectedStatuses: statuses });
    saveStatusFilter(statuses);
  },

  toggleStatus: (status) => {
    set((state) => {
      const newStatuses = state.selectedStatuses.includes(status)
        ? state.selectedStatuses.filter(s => s !== status)
        : [...state.selectedStatuses, status];

      saveStatusFilter(newStatuses);
      return { selectedStatuses: newStatuses };
    });
  },

  toggleAllStatuses: () => {
    set((state) => {
      const newStatuses = state.selectedStatuses.length === ALL_STATUSES.length ? [] : ALL_STATUSES;
      saveStatusFilter(newStatuses);
      return { selectedStatuses: newStatuses };
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
