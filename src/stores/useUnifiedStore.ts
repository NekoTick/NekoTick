/**
 * Unified Store - Single Source of Truth
 * 
 * Core concept: There is only one type of "item" (UnifiedTask)
 * - Items with startDate → displayed in calendar view
 * - Items without startDate → only displayed in todo list
 * - Scheduling a todo = adding startDate property
 * - Removing calendar event time = removing startDate property
 * 
 * Data flow:
 * - useUnifiedStore: Single source of truth
 * - useCalendarStore: Calendar view data access layer (filters items with time)
 * - useGroupStore: Todo view data access layer
 * - useProgressStore: Progress view data access layer
 */

import { create } from 'zustand';
import {
  loadUnifiedData,
  saveUnifiedData,
  type UnifiedData,
  type UnifiedTask,
  type UnifiedGroup,
  type UnifiedProgress,
  type UnifiedArchiveSection,
} from '@/lib/storage/unifiedStorage';

import { createGroupActions } from './actions/groupActions';
import { createTaskActions } from './actions/taskActions';
import { createCalendarActions } from './actions/calendarActions';
import { createProgressActions } from './actions/progressActions';
import { createSettingsActions } from './actions/settingsActions';
import type { ItemColor, ViewMode } from './types';

// Re-export types
export type {
  UnifiedTask,
  UnifiedGroup,
  UnifiedProgress,
  UnifiedArchiveSection,
};

export type { ItemColor, ViewMode };

// Undo action type
type UndoAction = {
  type: 'deleteTask';
  task: UnifiedTask;
};

// Store state interface
interface UnifiedStoreState {
  // Data
  data: UnifiedData;
  loaded: boolean;
  
  // UI State (not persisted)
  activeGroupId: string;
  editingEventId: string | null;
  editingEventPosition: { x: number; y: number } | null;
  selectedEventId: string | null;
  showSidebar: boolean;
  showContextPanel: boolean;
  selectedDate: Date;
  
  // Undo stack
  undoStack: UndoAction[];
}

// Store actions interface
interface UnifiedStoreActions {
  // Core
  load: () => Promise<void>;
  setActiveGroup: (id: string) => void;
  
  // Group Actions
  addGroup: (name: string) => void;
  updateGroup: (id: string, name: string) => void;
  deleteGroup: (id: string) => void;
  toggleGroupPin: (id: string) => void;
  reorderGroups: (activeId: string, overId: string) => void;
  
  // Task Actions
  addTask: (content: string, groupId: string, color?: ItemColor) => void;
  addSubTask: (parentId: string, content: string) => void;
  updateTask: (id: string, content: string) => void;
  updateTaskColor: (id: string, color: ItemColor) => void;
  updateTaskEstimation: (id: string, estimatedMinutes?: number) => void;
  updateTaskParent: (id: string, parentId: string | null, order: number) => void;
  toggleTask: (id: string) => void;
  toggleTaskCollapse: (id: string) => void;
  deleteTask: (id: string) => void;
  deleteCompletedTasks: (groupId: string) => void;
  reorderTasks: (activeId: string, overId: string) => void;
  moveTaskToGroup: (taskId: string, targetGroupId: string, overTaskId?: string | null) => void;
  archiveCompletedTasks: (groupId: string) => void;
  
  // Calendar Actions
  updateTaskTime: (id: string, startDate?: number | null, endDate?: number | null, isAllDay?: boolean) => void;
  setEditingEventId: (id: string | null, position?: { x: number; y: number }) => void;
  setSelectedEventId: (id: string | null) => void;
  closeEditingEvent: () => void;
  addEvent: (event: { content: string; startDate: number; endDate: number; isAllDay: boolean; color?: string; groupId?: string }) => string;
  updateEvent: (id: string, updates: Partial<UnifiedTask>) => void;
  deleteEvent: (id: string) => void;
  undo: () => void;
  
  // Progress Actions
  addProgress: (item: Omit<UnifiedProgress, 'id' | 'createdAt' | 'current' | 'todayCount'>) => void;
  updateProgress: (id: string, delta: number) => void;
  updateProgressItem: (id: string, updates: Partial<UnifiedProgress>) => void;
  deleteProgress: (id: string) => void;
  toggleProgressArchive: (id: string) => void;
  reorderProgress: (activeId: string, overId: string) => void;
  
  // Settings Actions
  setTimezone: (tz: number) => void;
  setViewMode: (mode: ViewMode) => void;
  setDayCount: (count: number) => void;
  setHourHeight: (height: number) => void;
  toggleSidebar: () => void;
  toggleContextPanel: () => void;
  setSelectedDate: (date: Date) => void;
  toggle24Hour: () => void;
}

type UnifiedStore = UnifiedStoreState & UnifiedStoreActions;

// Helper: Persist data
function persist(data: UnifiedData) {
  saveUnifiedData(data);
}

// Default initial state
const initialState: UnifiedStoreState = {
  data: {
    groups: [{ id: 'default', name: 'Inbox', pinned: false, createdAt: Date.now() }],
    tasks: [],
    progress: [],
    archive: [],
    settings: { timezone: 8, viewMode: 'week', dayCount: 1, hourHeight: 64, use24Hour: false },
  },
  loaded: false,
  activeGroupId: 'default',
  editingEventId: null,
  editingEventPosition: null,
  selectedEventId: null,
  showSidebar: true,
  showContextPanel: true,
  selectedDate: new Date(),
  undoStack: [],
};

export const useUnifiedStore = create<UnifiedStore>((set, get) => {
  // Create action creators
  const groupActions = createGroupActions(set as any, get as any, persist);
  const taskActions = createTaskActions(set as any, get as any, persist);
  const calendarActions = createCalendarActions(set as any, get as any, persist);
  const progressActions = createProgressActions(set as any, persist);
  const settingsActions = createSettingsActions(set as any, persist);

  return {
    // Initial state
    ...initialState,

    // Core actions
    load: async () => {
      if (get().loaded) return;
      const data = await loadUnifiedData();
      set({ data, loaded: true });
    },

    setActiveGroup: (id: string) => set({ activeGroupId: id }),

    // Spread all domain actions
    ...groupActions,
    ...taskActions,
    ...calendarActions,
    ...progressActions,
    ...settingsActions,
  };
});

// Re-export for convenience
export { useUnifiedStore as useStore };
