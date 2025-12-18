/**
 * Group Store - Todo view data access layer
 * 
 * Core concept: This is just a view of UnifiedStore
 * All data operations are delegated to useUnifiedStore
 */

import { useUnifiedStore, type ItemColor } from './useUnifiedStore';
import { useUIStore } from './uiSlice';

export type { ItemColor };
export { useUIStore };

// Group type
export interface Group {
  id: string;
  name: string;
  pinned?: boolean;
  createdAt: number;
  updatedAt?: number;
}

// Task type (unified item model)
export interface Task {
  id: string;
  content: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  order: number;
  groupId: string;
  parentId: string | null;
  collapsed: boolean;
  color: ItemColor;
  estimatedMinutes?: number;
  actualMinutes?: number;
  startDate?: number;
  endDate?: number;
  isAllDay?: boolean;
}

export function useGroupStore() {
  const store = useUnifiedStore();

  return {
    // Data
    groups: store.data.groups as Group[],
    tasks: store.data.tasks as Task[],
    loaded: store.loaded,
    activeGroupId: store.activeGroupId,

    // Group Actions
    setActiveGroup: (id: string | null) => store.setActiveGroup(id || 'default'),
    addGroup: store.addGroup,
    updateGroup: store.updateGroup,
    deleteGroup: store.deleteGroup,
    togglePin: store.toggleGroupPin,
    reorderGroups: store.reorderGroups,

    // Task Actions
    addTask: store.addTask,
    addSubTask: store.addSubTask,
    updateTask: store.updateTask,
    updateTaskEstimation: store.updateTaskEstimation,
    updateTaskColor: store.updateTaskColor,
    updateTaskParent: store.updateTaskParent,
    updateTaskTime: store.updateTaskTime,
    toggleTask: store.toggleTask,
    toggleCollapse: store.toggleTaskCollapse,
    deleteTask: store.deleteTask,
    deleteCompletedTasks: store.deleteCompletedTasks,
    reorderTasks: store.reorderTasks,
    moveTaskToGroup: store.moveTaskToGroup,
    archiveCompletedTasks: store.archiveCompletedTasks,

    // Load
    loadData: store.load,
  };
}

// For direct state access
useGroupStore.getState = () => {
  const store = useUnifiedStore.getState();
  return {
    groups: store.data.groups as Group[],
    tasks: store.data.tasks as Task[],
    loaded: store.loaded,
    activeGroupId: store.activeGroupId,
    updateTaskParent: store.updateTaskParent,
    updateTaskColor: store.updateTaskColor,
    updateTaskEstimation: store.updateTaskEstimation,
  };
};

export type GroupStore = ReturnType<typeof useGroupStore>;
