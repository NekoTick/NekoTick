/**
 * Task Utility Functions
 * 
 * Pure utility functions for task operations.
 * Note: All persistence is handled by useUnifiedStore.
 */

import type { StoreTask } from './types';

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
