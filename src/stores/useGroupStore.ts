/**
 * Group Store - Compatibility wrapper for UnifiedStore
 * 
 * Provides the same API as the old store for backward compatibility.
 * All data operations delegate to useUnifiedStore.
 */

import { useUnifiedStore, type ItemColor } from './useUnifiedStore';
import { parseTimeString } from './timeParser';
import { useUIStore } from './uiSlice';

// 统一颜色类型
export type Priority = ItemColor;

// 统一颜色配置
export const PRIORITY_COLORS = {
  red: { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', text: '#dc2626' },
  yellow: { border: '#eab308', bg: 'rgba(234, 179, 8, 0.1)', text: '#ca8a04' },
  purple: { border: '#a855f7', bg: 'rgba(168, 85, 247, 0.1)', text: '#9333ea' },
  green: { border: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)', text: '#16a34a' },
  blue: { border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', text: '#2563eb' },
  default: { border: '#d4d4d8', bg: 'transparent', text: '#71717a' },
};

// Re-export for backward compatibility
export type { ArchiveTimeView } from './types';
export { parseTimeString, useUIStore };

// Group type (matches old API)
export interface Group {
  id: string;
  name: string;
  pinned?: boolean;
  createdAt: number;
  updatedAt?: number;
}

// Task type（统一事项模型）
export interface StoreTask {
  id: string;
  content: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  order: number;
  groupId: string;
  parentId: string | null;
  collapsed: boolean;
  color: Priority;
  // priority 是 color 的别名，保持向后兼容
  priority: Priority;
  estimatedMinutes?: number;
  actualMinutes?: number;
  // 时间属性（有时间 = 日历事件）
  startDate?: number;
  endDate?: number;
  isAllDay?: boolean;
}

// Hook that provides the old API
export function useGroupStore() {
  const store = useUnifiedStore();
  
  // 将 tasks 映射为包含 priority 别名的格式
  const tasksWithPriority = store.data.tasks.map(t => ({
    ...t,
    priority: t.color || 'default',
  })) as StoreTask[];
  
  return {
    // Data
    groups: store.data.groups as Group[],
    tasks: tasksWithPriority,
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
    updateTaskPriority: store.updateTaskColor,
    updateTaskColor: store.updateTaskColor,
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
  const tasksWithPriority = store.data.tasks.map(t => ({
    ...t,
    priority: t.color || 'default',
  })) as StoreTask[];
  
  return {
    groups: store.data.groups as Group[],
    tasks: tasksWithPriority,
    loaded: store.loaded,
    activeGroupId: store.activeGroupId,
    updateTaskParent: store.updateTaskParent,
    updateTaskPriority: store.updateTaskColor,
    updateTaskColor: store.updateTaskColor,
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
