/**
 * Task Reorder Utility Functions
 * 
 * Pure utility functions for task reordering operations.
 * Note: All persistence is handled by useUnifiedStore.
 */

import type { StoreTask } from './types';
import { collectTaskAndDescendants, calculateActualTime } from './taskUtils';

/**
 * Reorder tasks within the same group, potentially changing parent
 */
export function reorderTasksInGroup(
  activeId: string,
  overId: string,
  tasks: StoreTask[]
): { success: boolean; newTasks: StoreTask[] } {
  const activeTask = tasks.find(t => t.id === activeId);
  const overTask = tasks.find(t => t.id === overId);
  if (!activeTask || !overTask) {
    return { success: false, newTasks: tasks };
  }
  
  let newTasks = [...tasks];
  
  // Check if this is a cross-level drag (changing parent)
  if (activeTask.parentId !== overTask.parentId) {
    newTasks = newTasks.map(t => {
      if (t.id !== activeId) return t;
      return { ...t, parentId: overTask.parentId };
    });
  }
  
  const updatedActiveTask = newTasks.find(t => t.id === activeId)!;
  
  // Reorder within the target level
  const sameLevelTasks = newTasks
    .filter(t => t.groupId === updatedActiveTask.groupId && t.parentId === updatedActiveTask.parentId)
    .sort((a, b) => a.order - b.order);
  
  const oldIndex = sameLevelTasks.findIndex(t => t.id === activeId);
  const newIndex = sameLevelTasks.findIndex(t => t.id === overId);
  
  if (oldIndex === -1 || newIndex === -1) {
    return { success: false, newTasks: tasks };
  }
  
  const reordered = [...sameLevelTasks];
  const [removed] = reordered.splice(oldIndex, 1);
  reordered.splice(newIndex, 0, removed);
  
  reordered.forEach((t, i) => {
    const task = newTasks.find(nt => nt.id === t.id);
    if (task) task.order = i;
  });
  
  if (activeTask.parentId !== updatedActiveTask.parentId) {
    const oldLevelTasks = newTasks
      .filter(t => t.groupId === activeTask.groupId && t.parentId === activeTask.parentId && t.id !== activeId)
      .sort((a, b) => a.order - b.order);
    oldLevelTasks.forEach((t, i) => {
      const task = newTasks.find(nt => nt.id === t.id);
      if (task) task.order = i;
    });
  }
  
  const currentGroupTasks = newTasks.filter(t => t.groupId === updatedActiveTask.groupId);
  const otherGroupTasks = newTasks.filter(t => t.groupId !== updatedActiveTask.groupId);
  const finalTasks = [...otherGroupTasks, ...currentGroupTasks];
  
  return { success: true, newTasks: finalTasks };
}

/**
 * Reorder task across completion status (incomplete <-> completed)
 */
export function crossStatusReorderTask(
  activeId: string,
  overId: string,
  tasks: StoreTask[]
): { success: boolean; newTasks: StoreTask[] } {
  const activeTask = tasks.find(t => t.id === activeId);
  const overTask = tasks.find(t => t.id === overId);
  
  if (!activeTask || !overTask) {
    return { success: false, newTasks: tasks };
  }
  if (activeTask.parentId !== overTask.parentId) {
    return { success: false, newTasks: tasks };
  }
  
  const newCompleted = overTask.completed;
  const now = Date.now();
  
  const newTasks = tasks.map(t => {
    if (t.id === activeId) {
      const actualMinutes = calculateActualTime(t.createdAt, newCompleted);
      return {
        ...t,
        completed: newCompleted,
        completedAt: newCompleted ? now : undefined,
        actualMinutes,
      };
    }
    return t;
  });
  
  const sameLevelTasks = newTasks.filter(
    t => t.groupId === activeTask.groupId && t.parentId === activeTask.parentId
  );
  
  const incomplete = sameLevelTasks.filter(t => !t.completed);
  const completed = sameLevelTasks.filter(t => t.completed);
  
  const targetList = newCompleted ? completed : incomplete;
  const sortedTarget = targetList.sort((a, b) => a.order - b.order);
  
  const overIndexInFull = sortedTarget.findIndex(t => t.id === overId);
  const withoutActive = sortedTarget.filter(t => t.id !== activeId);
  
  let insertIndex = overIndexInFull;
  if (overIndexInFull === -1) {
    insertIndex = withoutActive.length;
  } else {
    const activeIndexInTarget = sortedTarget.findIndex(t => t.id === activeId);
    if (activeIndexInTarget !== -1 && activeIndexInTarget < overIndexInFull) {
      insertIndex = overIndexInFull - 1;
    } else {
      insertIndex = overIndexInFull;
    }
  }
  
  withoutActive.splice(insertIndex, 0, newTasks.find(t => t.id === activeId)!);
  
  withoutActive.forEach((t, i) => {
    const task = newTasks.find(nt => nt.id === t.id);
    if (task) task.order = i;
  });
  
  const otherList = newCompleted ? incomplete : completed;
  otherList.sort((a, b) => a.order - b.order).forEach((t, i) => {
    const task = newTasks.find(nt => nt.id === t.id);
    if (task) task.order = i;
  });
  
  return { success: true, newTasks };
}

/**
 * Move a task and its descendants to another group
 */
export function moveTaskBetweenGroups(
  taskId: string,
  targetGroupId: string,
  overTaskId: string | null | undefined,
  tasks: StoreTask[]
): { success: boolean; newTasks: StoreTask[] } {
  const task = tasks.find(t => t.id === taskId);
  if (!task || task.groupId === targetGroupId) {
    return { success: false, newTasks: tasks };
  }
  
  const oldGroupId = task.groupId;
  const tasksToMove = collectTaskAndDescendants(task, tasks);
  
  const movedTasks: StoreTask[] = tasksToMove.map(t => ({ ...t, groupId: targetGroupId }));
  
  const targetGroupTasks = tasks
    .filter(t => t.groupId === targetGroupId && !t.parentId && !tasksToMove.some(mt => mt.id === t.id))
    .sort((a, b) => a.order - b.order);
  
  let insertIndex: number;
  if (overTaskId) {
    const overIndex = targetGroupTasks.findIndex(t => t.id === overTaskId);
    insertIndex = overIndex !== -1 ? overIndex : targetGroupTasks.length;
  } else {
    insertIndex = targetGroupTasks.length;
  }
  
  targetGroupTasks.splice(insertIndex, 0, movedTasks[0]);
  targetGroupTasks.forEach((t, i) => t.order = i);
  
  const oldGroupTasks = tasks
    .filter(t => t.groupId === oldGroupId && !t.parentId && !tasksToMove.some(mt => mt.id === t.id))
    .sort((a, b) => a.order - b.order);
  oldGroupTasks.forEach((t, i) => t.order = i);
  
  const movedChildTasks = movedTasks.slice(1);
  
  const otherTasks = tasks.filter(
    t => t.groupId !== oldGroupId && t.groupId !== targetGroupId && !tasksToMove.some(mt => mt.id === t.id)
  );
  const newTasks = [...otherTasks, ...oldGroupTasks, ...targetGroupTasks, ...movedChildTasks];
  
  return { success: true, newTasks };
}
