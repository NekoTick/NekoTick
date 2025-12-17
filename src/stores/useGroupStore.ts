/**
 * Group Store - Compatibility wrapper for UnifiedStore
 * 
 * Provides the same API as the old store for backward compatibility.
 * All data operations delegate to useUnifiedStore.
 */

import { useUnifiedStore } from './useUnifiedStore';
import type { Priority } from './types';
import { PRIORITY_COLORS } from './types';
import { parseTimeString } from './timeParser';
import { useUIStore } from './uiSlice';

// Re-export for backward compatibility
export type { Priority };
export type { ArchiveTimeView } from './types';
export { parseTimeString, PRIORITY_COLORS, useUIStore };

// Group type (matches old API)
export interface Group {
  id: string;
  name: string;
  pinned?: boolean;
  createdAt: number;
  updatedAt?: number;
}

// Task type (matches old API)
export interface StoreTask {
  id: string;
  content: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  scheduledTime?: string;
  order: number;
  groupId: string;
  parentId: string | null;
  collapsed: boolean;
  priority?: Priority;
  estimatedMinutes?: number;
  actualMinutes?: number;
}

// Hook that provides the old API
export function useGroupStore() {
  const store = useUnifiedStore();
  
  return {
    // Data
    groups: store.data.groups as Group[],
    tasks: store.data.tasks as StoreTask[],
    loaded: store.loaded,
    activeGroupId: store.activeGroupId,
    loadedGroups: new Set(['default']),
    previousNonArchiveGroupId: null,
    
    // Group Actions
    setActiveGroup: async (id: string | null) => {
      store.setActiveGroup(id || 'default');
    },
    addGroup: store.addGroup,
    updateGroup: store.updateGroup,
    deleteGroup: store.deleteGroup,
    togglePin: store.toggleGroupPin,
    reorderGroups: store.reorderGroups,
    
    // Task Actions
    addTask: store.addTask,
    addSubTask: store.addSubTask,
    updateTask: store.updateTask,
    updateTaskSchedule: store.updateTaskSchedule,
    updateTaskEstimation: store.updateTaskEstimation,
    updateTaskPriority: store.updateTaskPriority,
    updateTaskParent: store.updateTaskParent,
    toggleTask: store.toggleTask,
    toggleCollapse: store.toggleTaskCollapse,
    deleteTask: store.deleteTask,
    deleteCompletedTasks: store.deleteCompletedTasks,
    reorderTasks: store.reorderTasks,
    moveTaskToGroup: async (taskId: string, targetGroupId: string, overTaskId?: string | null) => {
      store.moveTaskToGroup(taskId, targetGroupId, overTaskId);
    },
    crossStatusReorder: store.reorderTasks, // Same logic for now
    
    // Persistence Actions
    loadData: store.load,
    loadGroupTasks: async () => {}, // No-op, all data loaded at once
    archiveCompletedTasks: async (groupId: string) => {
      store.archiveCompletedTasks(groupId);
    },
    archiveSingleTask: async () => {}, // Not needed
    
    // Undo (simplified - not implemented)
    undoLastAction: () => {},
  };
}

// For direct state access (used by useDragLogic and other components)
useGroupStore.getState = () => {
  const store = useUnifiedStore.getState();
  return {
    groups: store.data.groups as Group[],
    tasks: store.data.tasks as StoreTask[],
    loaded: store.loaded,
    activeGroupId: store.activeGroupId,
    updateTaskParent: store.updateTaskParent,
    updateTaskPriority: store.updateTaskPriority,
    updateTaskEstimation: store.updateTaskEstimation,
    archiveSingleTask: () => {}, // No-op for now
  };
};

// For setState - no-op, use actions instead
useGroupStore.setState = (_updater: any) => {
  // No-op - direct setState is not supported
};

// Type exports
export type { StoreTask as Task };
export type GroupStore = ReturnType<typeof useGroupStore>;
export type StoreState = GroupStore;
