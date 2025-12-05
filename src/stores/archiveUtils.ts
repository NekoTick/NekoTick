// Archive utility functions

import { archiveTasks, verifyArchive, loadArchiveData } from '@/lib/storage';
import type { Group, Priority, StoreTask } from './types';
import { persistGroup, collectTaskAndDescendants, toTaskData } from './taskUtils';

// Track concurrent archiving operations
const archivingFlags = new Map<string, boolean>();

/**
 * Archive all completed top-level tasks in a group
 * Uses three-phase commit for atomic guarantee
 */
export async function archiveCompletedTasksForGroup(
  groupId: string,
  tasks: StoreTask[],
  groups: Group[]
): Promise<{ success: boolean; archivedCount: number; newTasks: StoreTask[] }> {
  // Prevent concurrent archiving
  if (archivingFlags.get(groupId)) {
    console.warn(`[Archive] Already archiving group ${groupId}, skipping`);
    return { success: false, archivedCount: 0, newTasks: tasks };
  }
  archivingFlags.set(groupId, true);
  
  try {
    // Find all completed top-level tasks in this group
    const completedTopLevelTasks = tasks.filter(
      t => t.groupId === groupId && t.completed && !t.parentId
    );
    
    if (completedTopLevelTasks.length === 0) {
      return { success: true, archivedCount: 0, newTasks: tasks };
    }
    
    // Collect all tasks and their descendants
    const allTasksToArchive = completedTopLevelTasks.flatMap(
      task => collectTaskAndDescendants(task, tasks)
    );
    
    // Convert to TaskData format
    const tasksToArchive = allTasksToArchive.map(toTaskData);
    
    // === Atomic guarantee: three-phase commit ===
    
    // Phase 1: Write to archive file (don't modify original)
    await archiveTasks(groupId, tasksToArchive);
    
    // Phase 2: Verify archive write succeeded
    const verified = await verifyArchive(groupId, tasksToArchive.length);
    if (!verified) {
      throw new Error('Archive verification failed - data integrity check did not pass');
    }
    
    // Phase 3: After verification, remove archived tasks
    const idsToDelete = new Set(allTasksToArchive.map(t => t.id));
    const newTasks = tasks.filter(t => !idsToDelete.has(t.id));
    
    // Persist to file
    await persistGroup(groups, newTasks, groupId);
    
    console.log(`[Archive] Successfully archived ${allTasksToArchive.length} tasks with atomic guarantee`);
    return { success: true, archivedCount: allTasksToArchive.length, newTasks };
  } catch (error) {
    console.error('[Archive] Failed - no data was deleted:', error);
    throw error;
  } finally {
    archivingFlags.delete(groupId);
  }
}

/**
 * Archive a single task and its descendants
 */
export async function archiveSingleTaskWithDescendants(
  taskId: string,
  tasks: StoreTask[],
  groups: Group[]
): Promise<{ success: boolean; archivedCount: number; newTasks: StoreTask[] }> {
  // Find the task
  const task = tasks.find(t => t.id === taskId);
  if (!task || !task.completed) {
    console.warn(`[Archive] Task ${taskId} not found or not completed`);
    return { success: false, archivedCount: 0, newTasks: tasks };
  }
  
  const groupId = task.groupId;
  
  // Cannot archive tasks already in archive group
  if (groupId === '__archive__') {
    console.warn(`[Archive] Cannot archive task from archive group`);
    return { success: false, archivedCount: 0, newTasks: tasks };
  }
  
  // Collect task and all its descendants
  const allTasksToArchive = collectTaskAndDescendants(task, tasks);
  
  // Convert to TaskData format
  const tasksToArchive = allTasksToArchive.map(toTaskData);
  
  try {
    // Write to archive file
    await archiveTasks(groupId, tasksToArchive);
    
    // Verify archive write
    const verified = await verifyArchive(groupId, tasksToArchive.length);
    if (!verified) {
      throw new Error('Archive verification failed');
    }
    
    // After verification, remove archived tasks
    const idsToDelete = new Set(allTasksToArchive.map(t => t.id));
    const newTasks = tasks.filter(t => !idsToDelete.has(t.id));
    
    // Persist to file
    await persistGroup(groups, newTasks, groupId);
    
    console.log(`[Archive] Successfully archived single task and ${allTasksToArchive.length - 1} descendants`);
    return { success: true, archivedCount: allTasksToArchive.length, newTasks };
  } catch (error) {
    console.error('[Archive] Failed to archive single task:', error);
    throw error;
  }
}

/**
 * Delete all completed tasks in a group (without archiving)
 */
export function deleteCompletedTasksInGroup(
  groupId: string,
  tasks: StoreTask[],
  groups: Group[]
): { deletedCount: number; newTasks: StoreTask[] } {
  // Find all completed top-level tasks in this group
  const completedTopLevelTasks = tasks.filter(
    t => t.groupId === groupId && t.completed && !t.parentId
  );
  
  if (completedTopLevelTasks.length === 0) {
    return { deletedCount: 0, newTasks: tasks };
  }
  
  // Collect all tasks and their descendants
  const allTasksToDelete = completedTopLevelTasks.flatMap(
    task => collectTaskAndDescendants(task, tasks)
  );
  
  // Delete these tasks
  const idsToDelete = new Set(allTasksToDelete.map(t => t.id));
  const newTasks = tasks.filter(t => !idsToDelete.has(t.id));
  
  console.log(`[Delete] Deleted ${allTasksToDelete.length} completed tasks`);
  
  // Persist to file
  persistGroup(groups, newTasks, groupId);
  
  return { deletedCount: allTasksToDelete.length, newTasks };
}

/**
 * Load archived tasks from all groups
 */
export async function loadArchivedTasks(
  groups: Group[],
  maxDays: number | null
): Promise<StoreTask[]> {
  const archiveTasks: StoreTask[] = [];
  let taskOrder = 0;
  
  for (const group of groups) {
    if (group.id === '__archive__') continue;
    
    console.log(`[Archive] Loading archive for group: ${group.id} (${group.name})`);
    const archiveData = await loadArchiveData(group.id, maxDays);
    console.log(`[Archive] Found ${archiveData.length} archive sections for ${group.name}`);
    
    // Convert archive data to task format
    archiveData.forEach(section => {
      section.tasks.forEach(task => {
        archiveTasks.push({
          id: `archive-${group.id}-${section.timestamp}-${taskOrder}`,
          content: task.content,
          completed: true,
          createdAt: task.createdAt || Date.now(),
          completedAt: task.completedAt ? new Date(task.completedAt).getTime() : undefined,
          order: taskOrder++,
          groupId: '__archive__',
          parentId: null,
          collapsed: false,
          priority: (task.priority as Priority) || 'default',
          estimatedMinutes: task.estimated ? parseFloat(task.estimated) : undefined,
          actualMinutes: task.actual ? parseFloat(task.actual) : undefined,
          originalGroupId: group.id,
        } as StoreTask & { originalGroupId: string });
      });
    });
  }
  
  console.log(`[LazyLoad] Loaded ${archiveTasks.length} archived tasks from all groups`);
  return archiveTasks;
}
