// Task reorder utility functions

import type { Group, StoreTask } from './types';
import { persistGroup, collectTaskAndDescendants, calculateActualTime } from './taskUtils';

/**
 * Reorder tasks within the same group, potentially changing parent
 */
export function reorderTasksInGroup(
  activeId: string,
  overId: string,
  tasks: StoreTask[],
  groups: Group[]
): { success: boolean; newTasks: StoreTask[] } {
  const activeTask = tasks.find(t => t.id === activeId);
  const overTask = tasks.find(t => t.id === overId);
  if (!activeTask || !overTask) {
    return { success: false, newTasks: tasks };
  }
  
  console.log('[reorderTasks] Start:', {
    active: activeTask.content,
    activeParent: activeTask.parentId,
    over: overTask.content,
    overParent: overTask.parentId
  });
  
  let newTasks = [...tasks];
  
  // Check if this is a cross-level drag (changing parent)
  if (activeTask.parentId !== overTask.parentId) {
    // Update the active task's parent to match the over task's parent
    newTasks = newTasks.map(t => {
      if (t.id !== activeId) return t;
      return { ...t, parentId: overTask.parentId };
    });
    
    // Also update all descendants to follow the parent
    const updateDescendants = (parentId: string, newGroupParentId: string | null) => {
      const children = newTasks.filter(t => t.parentId === parentId);
      children.forEach(child => {
        newTasks = newTasks.map(t => {
          if (t.id !== child.id) return t;
          return { ...t, parentId: newGroupParentId };
        });
        updateDescendants(child.id, child.id);
      });
    };
    updateDescendants(activeId, activeId);
  }
  
  // Get updated activeTask after potential parent change
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
  
  // Update order for this level
  reordered.forEach((t, i) => {
    const task = newTasks.find(nt => nt.id === t.id);
    if (task) task.order = i;
  });
  
  // Reorder old level if it changed
  if (activeTask.parentId !== updatedActiveTask.parentId) {
    const oldLevelTasks = newTasks
      .filter(t => t.groupId === activeTask.groupId && t.parentId === activeTask.parentId && t.id !== activeId)
      .sort((a, b) => a.order - b.order);
    oldLevelTasks.forEach((t, i) => {
      const task = newTasks.find(nt => nt.id === t.id);
      if (task) task.order = i;
    });
  }
  
  // Combine all tasks: other groups + current group (all levels)
  const currentGroupTasks = newTasks.filter(t => t.groupId === updatedActiveTask.groupId);
  const otherGroupTasks = newTasks.filter(t => t.groupId !== updatedActiveTask.groupId);
  const finalTasks = [...otherGroupTasks, ...currentGroupTasks];
  
  persistGroup(groups, finalTasks, activeTask.groupId);
  return { success: true, newTasks: finalTasks };
}

/**
 * Reorder task across completion status (incomplete <-> completed)
 */
export function crossStatusReorderTask(
  activeId: string,
  overId: string,
  tasks: StoreTask[],
  groups: Group[]
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
  
  // Create new tasks array with updated status
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
  
  // Get same-level tasks
  const sameLevelTasks = newTasks.filter(
    t => t.groupId === activeTask.groupId && t.parentId === activeTask.parentId
  );
  
  // Separate by status
  const incomplete = sameLevelTasks.filter(t => !t.completed);
  const completed = sameLevelTasks.filter(t => t.completed);
  
  // Reorder the target list
  const targetList = newCompleted ? completed : incomplete;
  const sortedTarget = targetList.sort((a, b) => a.order - b.order);
  
  // Find over task position BEFORE removing active
  const overIndexInFull = sortedTarget.findIndex(t => t.id === overId);
  
  // Remove active from target list
  const withoutActive = sortedTarget.filter(t => t.id !== activeId);
  
  // Calculate insert position
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
  
  // Insert active task at calculated position
  withoutActive.splice(insertIndex, 0, newTasks.find(t => t.id === activeId)!);
  
  // Update order values
  withoutActive.forEach((t, i) => {
    const task = newTasks.find(nt => nt.id === t.id);
    if (task) task.order = i;
  });
  
  // Update other list order
  const otherList = newCompleted ? incomplete : completed;
  otherList.sort((a, b) => a.order - b.order).forEach((t, i) => {
    const task = newTasks.find(nt => nt.id === t.id);
    if (task) task.order = i;
  });
  
  persistGroup(groups, newTasks, activeTask.groupId);
  return { success: true, newTasks };
}

/**
 * Move a task and its descendants to another group
 */
export function moveTaskBetweenGroups(
  taskId: string,
  targetGroupId: string,
  overTaskId: string | null | undefined,
  tasks: StoreTask[],
  groups: Group[]
): { success: boolean; newTasks: StoreTask[] } {
  const task = tasks.find(t => t.id === taskId);
  if (!task || task.groupId === targetGroupId) {
    return { success: false, newTasks: tasks };
  }
  
  const oldGroupId = task.groupId;
  
  // Collect task and all its descendants
  const tasksToMove = collectTaskAndDescendants(task, tasks);
  
  // Update groupId for all collected tasks
  const movedTasks: StoreTask[] = tasksToMove.map(t => ({ ...t, groupId: targetGroupId }));
  
  // Get target group TOP-LEVEL tasks only (excluding tasks being moved)
  const targetGroupTasks = tasks
    .filter(t => t.groupId === targetGroupId && !t.parentId && !tasksToMove.some(mt => mt.id === t.id))
    .sort((a, b) => a.order - b.order);
  
  // Determine the insert index
  let insertIndex: number;
  if (overTaskId) {
    const overIndex = targetGroupTasks.findIndex(t => t.id === overTaskId);
    insertIndex = overIndex !== -1 ? overIndex : targetGroupTasks.length;
  } else {
    insertIndex = targetGroupTasks.length;
  }
  
  // Insert only the parent task at the target position
  targetGroupTasks.splice(insertIndex, 0, movedTasks[0]);
  
  // Reassign order for target group TOP-LEVEL tasks
  targetGroupTasks.forEach((t, i) => t.order = i);
  
  // Get old group TOP-LEVEL tasks (excluding moved tasks) and reassign order
  const oldGroupTasks = tasks
    .filter(t => t.groupId === oldGroupId && !t.parentId && !tasksToMove.some(mt => mt.id === t.id))
    .sort((a, b) => a.order - b.order);
  oldGroupTasks.forEach((t, i) => t.order = i);
  
  // Get child tasks from the moved tasks
  const movedChildTasks = movedTasks.slice(1);
  
  // Combine: other groups + old group + target group + moved children
  const otherTasks = tasks.filter(
    t => t.groupId !== oldGroupId && t.groupId !== targetGroupId && !tasksToMove.some(mt => mt.id === t.id)
  );
  const newTasks = [...otherTasks, ...oldGroupTasks, ...targetGroupTasks, ...movedChildTasks];
  
  // Persist both groups
  persistGroup(groups, newTasks, oldGroupId);
  persistGroup(groups, newTasks, targetGroupId);
  
  return { success: true, newTasks };
}
