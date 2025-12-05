// Task utility functions for store operations

import { saveGroup, type GroupData } from '@/lib/storage';
import { useToastStore } from './useToastStore';
import type { Group, StoreTask } from './types';

/**
 * Convert StoreTask to TaskData format for persistence
 */
export function toTaskData(task: StoreTask) {
  return {
    id: task.id,
    content: task.content,
    completed: task.completed,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
    scheduledTime: task.scheduledTime,
    order: task.order,
    parentId: task.parentId,
    collapsed: task.collapsed,
    priority: task.priority,
    estimatedMinutes: task.estimatedMinutes,
    actualMinutes: task.actualMinutes,
  };
}

/**
 * Recursively collect a task and all its descendants
 */
export function collectTaskAndDescendants(
  task: StoreTask,
  allTasks: StoreTask[]
): StoreTask[] {
  const result: StoreTask[] = [task];
  const children = allTasks.filter(t => t.parentId === task.id);
  children.forEach(child => {
    result.push(...collectTaskAndDescendants(child, allTasks));
  });
  return result;
}

/**
 * Calculate actual time spent from creation to completion
 * Returns undefined if task is being uncompleted
 */
export function calculateActualTime(
  createdAt: number,
  isCompleting: boolean
): number | undefined {
  if (!isCompleting) {
    return undefined;
  }
  
  const now = Date.now();
  const elapsedMs = now - createdAt;
  
  // Validate elapsed time is reasonable (positive and not too large)
  if (elapsedMs <= 0 || elapsedMs >= 8640000000) { // Max ~100 days in ms
    return undefined;
  }
  
  // Keep seconds precision: convert ms to minutes without rounding
  let actualMinutes = elapsedMs / 60000;
  
  // Ensure at least 1 second precision (0.0166... minutes)
  if (actualMinutes < 1 / 60 && elapsedMs > 0) {
    actualMinutes = 1 / 60;
  }
  
  return actualMinutes;
}

/**
 * Persist a group and its tasks to file
 * Skips archive group as archived tasks are managed separately
 */
export async function persistGroup(
  groups: Group[],
  tasks: StoreTask[],
  groupId: string
): Promise<void> {
  // Skip archive group (archived tasks are managed in archive files)
  if (groupId === '__archive__') {
    console.log('[PersistGroup] Skipping persist for __archive__ group');
    return;
  }
  
  const group = groups.find(g => g.id === groupId);
  if (!group) return;
  
  const groupTasks = tasks.filter(t => t.groupId === groupId);
  
  // Safety check: remove duplicates before saving
  const taskIds = groupTasks.map(t => t.id);
  const hasDuplicates = taskIds.length !== new Set(taskIds).size;
  
  let tasksToSave = groupTasks;
  if (hasDuplicates) {
    const seen = new Set<string>();
    tasksToSave = groupTasks.filter(t => {
      if (seen.has(t.id)) {
        return false;
      }
      seen.add(t.id);
      return true;
    });
  }
  
  const groupData: GroupData = {
    id: group.id,
    name: group.name,
    pinned: group.pinned || false,
    tasks: tasksToSave.map(toTaskData),
    createdAt: group.createdAt,
    updatedAt: Date.now(),
  };
  
  try {
    await saveGroup(groupData);
  } catch (error) {
    useToastStore.getState().addToast(
      error instanceof Error ? error.message : 'Failed to save tasks',
      'error',
      4000
    );
  }
}
