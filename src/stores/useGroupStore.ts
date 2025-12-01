import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { loadGroups, saveGroup, deleteGroup as deleteGroupFile, type GroupData } from '@/lib/storage';
import { useToastStore } from './useToastStore';

// Note: This store uses 'StoreTask' with 'completed' field for persistence.
// Components using types/index.ts 'Task' interface should map 'completed' <-> 'isDone'

export interface Group {
  id: string;
  name: string;
  color?: string;
  createdAt: number;
  pinned?: boolean;
}

// Priority levels: red (highest) > yellow > purple > green > default (lowest)
export type Priority = 'red' | 'yellow' | 'purple' | 'green' | 'default';

// Internal Task type for persistence (uses 'completed')
export interface StoreTask {
  id: string;
  content: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  scheduledTime?: string;
  order: number;
  groupId: string;
  priority?: Priority;  // Task priority
  
  // Hierarchical structure (nested tasks)
  parentId: string | null;  // Parent task ID, null for top-level
  collapsed: boolean;       // Whether children are hidden
}

interface GroupStore {
  groups: Group[];
  tasks: StoreTask[];
  activeGroupId: string | null;
  drawerOpen: boolean;
  loaded: boolean;
  hideCompleted: boolean;
  searchQuery: string;
  
  // Drag state for cross-group drag
  draggingTaskId: string | null;
  setDraggingTaskId: (id: string | null) => void;
  setHideCompleted: (hide: boolean) => void;
  setSearchQuery: (query: string) => void;
  
  loadData: () => Promise<void>;
  setDrawerOpen: (open: boolean) => void;
  toggleDrawer: () => void;
  setActiveGroup: (id: string | null) => void;
  addGroup: (name: string) => void;
  updateGroup: (id: string, name: string) => void;
  deleteGroup: (id: string) => void;
  togglePin: (id: string) => void;
  reorderGroups: (activeId: string, overId: string) => void;
  
  // Task operations
  addTask: (content: string, groupId: string, priority?: Priority) => void;
  addSubTask: (parentId: string, content: string) => void;
  updateTask: (id: string, content: string) => void;
  updateTaskPriority: (id: string, priority: Priority) => void;
  toggleTask: (id: string, skipReorder?: boolean) => void;
  toggleCollapse: (id: string) => void;
  deleteTask: (id: string) => void;
  reorderTasks: (activeId: string, overId: string) => void;
  crossStatusReorder: (activeId: string, overId: string) => void;
  moveTaskToGroup: (taskId: string, targetGroupId: string, overTaskId?: string | null) => void;
}

// 保存分组到文件
async function persistGroup(groups: Group[], tasks: StoreTask[], groupId: string) {
  const group = groups.find(g => g.id === groupId);
  if (!group) return;
  
  const groupTasks = tasks.filter(t => t.groupId === groupId);
  
  // Safety check: remove duplicates before saving
  const taskIds = groupTasks.map(t => t.id);
  const hasDuplicates = taskIds.length !== new Set(taskIds).size;
  if (hasDuplicates) {
    const seen = new Set<string>();
    const deduplicated = groupTasks.filter(t => {
      if (seen.has(t.id)) {
        return false;
      }
      seen.add(t.id);
      return true;
    });
    
    const groupData: GroupData = {
      id: group.id,
      name: group.name,
      pinned: group.pinned || false,
      tasks: deduplicated.map(t => ({
        id: t.id,
        content: t.content,
        completed: t.completed,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
        scheduledTime: t.scheduledTime,
        order: t.order,
        parentId: t.parentId,
        collapsed: t.collapsed,
      })),
      createdAt: group.createdAt,
      updatedAt: Date.now(),
    };
    
    try {
      await saveGroup(groupData);
    } catch (error) {
      useToastStore.getState().addToast(
        error instanceof Error ? error.message : '保存任务失败', 
        'error', 
        4000
      );
    }
    return;
  }
  
  const groupData: GroupData = {
    id: group.id,
    name: group.name,
    pinned: group.pinned || false,
    tasks: groupTasks.map(t => ({
      id: t.id,
      content: t.content,
      completed: t.completed,
      createdAt: t.createdAt,
      completedAt: t.completedAt,
      scheduledTime: t.scheduledTime,
      order: t.order,
      parentId: t.parentId,
      collapsed: t.collapsed,
      priority: t.priority,
    })),
    createdAt: group.createdAt,
    updatedAt: Date.now(),
  };
  
  try {
    await saveGroup(groupData);
  } catch (error) {
    useToastStore.getState().addToast(
      error instanceof Error ? error.message : '保存任务失败', 
      'error', 
      4000
    );
  }
}

export const useGroupStore = create<GroupStore>()((set, get) => ({
  groups: [],
  tasks: [],
  activeGroupId: 'default',
  drawerOpen: false,
  loaded: false,
  hideCompleted: false,
  searchQuery: '',
  
  draggingTaskId: null,
  setDraggingTaskId: (id) => set({ draggingTaskId: id }),
  setHideCompleted: (hide) => set({ hideCompleted: hide }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  loadData: async () => {
    const allGroups = await loadGroups();
    const groups: Group[] = [];
    const tasks: StoreTask[] = [];
    
    for (const gd of allGroups) {
      
      groups.push({
        id: gd.id,
        name: gd.name,
        pinned: gd.pinned,
        createdAt: gd.createdAt,
      });
      
      // Auto-fix: remove duplicate task IDs (keep only first occurrence)
      const seenIds = new Set<string>();
      for (const td of gd.tasks) {
        if (seenIds.has(td.id)) {
          continue; // Skip duplicate
        }
        seenIds.add(td.id);
        
        tasks.push({
          id: td.id,
          content: td.content,
          completed: td.completed,
          createdAt: td.createdAt,
          completedAt: td.completedAt,
          scheduledTime: td.scheduledTime,
          order: td.order,
          groupId: gd.id,
          parentId: td.parentId,
          collapsed: td.collapsed,
          priority: td.priority,
        });
      }
    }
    
    // All duplicates have been removed during loading
    
    // 按置顶排序
    groups.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    });
    
    set({ groups, tasks, loaded: true });
  },

  setDrawerOpen: (open) => set({ drawerOpen: open }),
  toggleDrawer: () => set((state) => ({ drawerOpen: !state.drawerOpen })),
  
  setActiveGroup: (id) => set({ activeGroupId: id }),
  
  addGroup: (name) => {
    const newGroup: Group = {
      id: nanoid(),
      name,
      createdAt: Date.now(),
    };
    
    set((state) => {
      const newGroups = [...state.groups, newGroup];
      persistGroup(newGroups, state.tasks, newGroup.id);
      return { groups: newGroups };
    });
  },
  
  updateGroup: (id, name) => set((state) => {
    const newGroups = state.groups.map((g) =>
      g.id === id ? { ...g, name } : g
    );
    persistGroup(newGroups, state.tasks, id);
    return { groups: newGroups };
  }),
  
  deleteGroup: (id) => set((state) => {
    if (id === 'default') return state;
    deleteGroupFile(id);
    return {
      groups: state.groups.filter((g) => g.id !== id),
      tasks: state.tasks.filter((t) => t.groupId !== id),
      activeGroupId: state.activeGroupId === id ? 'default' : state.activeGroupId,
    };
  }),
  
  togglePin: (id) => set((state) => {
    const group = state.groups.find(g => g.id === id);
    if (!group) return state;
    
    const newPinned = !group.pinned;
    const updatedGroup = { ...group, pinned: newPinned };
    const otherGroups = state.groups.filter(g => g.id !== id);
    
    let newGroups: Group[];
    if (newPinned) {
      newGroups = [updatedGroup, ...otherGroups];
    } else {
      const pinnedGroups = otherGroups.filter(g => g.pinned);
      const unpinnedGroups = otherGroups.filter(g => !g.pinned);
      newGroups = [...pinnedGroups, updatedGroup, ...unpinnedGroups];
    }
    
    persistGroup(newGroups, state.tasks, id);
    return { groups: newGroups };
  }),
  
  reorderGroups: (activeId, overId) => set((state) => {
    const oldIndex = state.groups.findIndex((g) => g.id === activeId);
    const newIndex = state.groups.findIndex((g) => g.id === overId);
    
    if (oldIndex === -1 || newIndex === -1) return state;
    
    const newGroups = [...state.groups];
    const [removed] = newGroups.splice(oldIndex, 1);
    newGroups.splice(newIndex, 0, removed);
    
    return { groups: newGroups };
  }),
  
  // 任务操作
  addTask: (content, groupId, priority = 'default') => set((state) => {
    const groupTasks = state.tasks.filter(t => t.groupId === groupId && !t.parentId);
    const newTask: StoreTask = {
      id: nanoid(),
      content,
      completed: false,
      createdAt: Date.now(),
      order: groupTasks.length,
      groupId,
      parentId: null,
      collapsed: false,
      priority,
    };
    
    const newTasks = [...state.tasks, newTask];
    persistGroup(state.groups, newTasks, groupId);
    return { tasks: newTasks };
  }),
  
  addSubTask: (parentId, content) => set((state) => {
    const parentTask = state.tasks.find(t => t.id === parentId);
    if (!parentTask) return state;
    
    const siblings = state.tasks.filter(t => t.parentId === parentId);
    const newTask: StoreTask = {
      id: nanoid(),
      content,
      completed: false,
      createdAt: Date.now(),
      order: siblings.length,
      groupId: parentTask.groupId,
      parentId: parentId,
      collapsed: false,
    };
    
    const newTasks = [...state.tasks, newTask];
    persistGroup(state.groups, newTasks, parentTask.groupId);
    return { tasks: newTasks };
  }),
  
  updateTask: (id, content) => set((state) => {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return state;
    
    task.content = content;
    persistGroup(state.groups, state.tasks, task.groupId);
    return { tasks: [...state.tasks] };
  }),
  
  updateTaskPriority: (id, priority) => set((state) => {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return state;
    
    task.priority = priority;
    persistGroup(state.groups, state.tasks, task.groupId);
    return { tasks: [...state.tasks] };
  }),
  
  toggleTask: (id, skipReorder = false) => set((state) => {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return state;
    
    const isCompleting = !task.completed;
    
    // Update the task's completed status
    let newTasks = state.tasks.map(t =>
      t.id === id ? { 
        ...t, 
        completed: isCompleting,
        completedAt: isCompleting ? Date.now() : undefined,
      } : t
    );
    
    // Skip reorder if requested (e.g., during drag and drop)
    if (!skipReorder) {
      // Only reorder top-level tasks by completion status (preserve hierarchy)
      const groupTopLevelTasks = newTasks
        .filter(t => t.groupId === task.groupId && !t.parentId)
        .sort((a, b) => a.order - b.order);
      
      const incompleteTopLevel = groupTopLevelTasks.filter(t => !t.completed);
      const completedTopLevel = groupTopLevelTasks.filter(t => t.completed);
      
      // Reorder top-level: incomplete first, then completed
      const reorderedTopLevel = [...incompleteTopLevel, ...completedTopLevel];
      reorderedTopLevel.forEach((t, i) => t.order = i);
      
      // Update newTasks: replace top-level tasks with reordered version
      const childTasks = newTasks.filter(t => t.groupId === task.groupId && t.parentId);
      const otherTasks = newTasks.filter(t => t.groupId !== task.groupId);
      newTasks = [...otherTasks, ...reorderedTopLevel, ...childTasks];
    }
    
    persistGroup(state.groups, newTasks, task.groupId);
    return { tasks: newTasks };
  }),
  
  toggleCollapse: (id) => set((state) => {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return state;
    
    const newTasks = state.tasks.map(t =>
      t.id === id ? { ...t, collapsed: !t.collapsed } : t
    );
    persistGroup(state.groups, newTasks, task.groupId);
    return { tasks: newTasks };
  }),
  
  deleteTask: (id) => set((state) => {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return state;
    
    // Recursively collect all task IDs to delete (task + all descendants)
    const idsToDelete = new Set<string>([id]);
    const collectDescendants = (parentId: string) => {
      const children = state.tasks.filter(t => t.parentId === parentId);
      children.forEach(child => {
        idsToDelete.add(child.id);
        collectDescendants(child.id);
      });
    };
    collectDescendants(id);
    
    // Remove the task and all its descendants
    const tasksWithoutDeleted = state.tasks.filter(t => !idsToDelete.has(t.id));
    
    // Reorder tasks within each level separately
    const groupTasks = tasksWithoutDeleted.filter(t => t.groupId === task.groupId);
    
    // Group by parentId and reorder each level
    const tasksByParent = new Map<string | null, StoreTask[]>();
    groupTasks.forEach(t => {
      const key = t.parentId || null;
      if (!tasksByParent.has(key)) {
        tasksByParent.set(key, []);
      }
      tasksByParent.get(key)!.push(t);
    });
    
    // Reorder each level
    tasksByParent.forEach((levelTasks) => {
      levelTasks.sort((a, b) => a.order - b.order);
      levelTasks.forEach((t, i) => t.order = i);
    });
    
    // Combine with other groups
    const otherTasks = tasksWithoutDeleted.filter(t => t.groupId !== task.groupId);
    const newTasks = [...otherTasks, ...groupTasks];
    
    persistGroup(state.groups, newTasks, task.groupId);
    return { tasks: newTasks };
  }),
  
  reorderTasks: (activeId, overId) => set((state) => {
    const activeTask = state.tasks.find(t => t.id === activeId);
    const overTask = state.tasks.find(t => t.id === overId);
    if (!activeTask || !overTask) return state;
    
    let newTasks = [...state.tasks];
    
    // Check if this is a cross-level drag (changing parent)
    if (activeTask.parentId !== overTask.parentId) {
      // Update the active task's parent to match the over task's parent
      newTasks = newTasks.map(t => 
        t.id === activeId ? { ...t, parentId: overTask.parentId } : t
      );
      
      // Also update all descendants to follow the parent
      const updateDescendants = (parentId: string, newGroupParentId: string | null) => {
        const children = newTasks.filter(t => t.parentId === parentId);
        children.forEach(child => {
          newTasks = newTasks.map(t => 
            t.id === child.id ? { ...t, parentId: newGroupParentId } : t
          );
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
    
    if (oldIndex === -1 || newIndex === -1) return state;
    
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
    
    persistGroup(state.groups, finalTasks, activeTask.groupId);
    return { tasks: finalTasks };
  }),
  
  crossStatusReorder: (activeId, overId) => set((state) => {
    const activeTask = state.tasks.find(t => t.id === activeId);
    const overTask = state.tasks.find(t => t.id === overId);
    if (!activeTask || !overTask) {
      return state;
    }
    if (activeTask.parentId !== overTask.parentId) {
      return state;
    }
    
    const newCompleted = overTask.completed;
    
    // Create new tasks array with updated status
    const newTasks = state.tasks.map(t => {
      if (t.id === activeId) {
        return {
          ...t,
          completed: newCompleted,
          completedAt: newCompleted ? Date.now() : undefined,
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
      // Over task not found, append to end
      insertIndex = withoutActive.length;
    } else {
      const activeIndexInTarget = sortedTarget.findIndex(t => t.id === activeId);
      if (activeIndexInTarget !== -1 && activeIndexInTarget < overIndexInFull) {
        // Active was in target list and before over, so index shifts down by 1 after removal
        insertIndex = overIndexInFull - 1;
      } else {
        // Active was after over, or not in target list, index stays same
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
    
    persistGroup(state.groups, newTasks, activeTask.groupId);
    return { tasks: newTasks };
  }),
  
  moveTaskToGroup: (taskId, targetGroupId, overTaskId) => set((state) => {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task || task.groupId === targetGroupId) return state;
    
    const oldGroupId = task.groupId;
    
    // Collect task and all its descendants
    const tasksToMove: StoreTask[] = [];
    const collectTaskAndDescendants = (parentTask: StoreTask) => {
      tasksToMove.push(parentTask);
      const children = state.tasks.filter(t => t.parentId === parentTask.id);
      children.forEach(child => collectTaskAndDescendants(child));
    };
    collectTaskAndDescendants(task);
    
    // Update groupId for all collected tasks
    const movedTasks = tasksToMove.map(t => ({ ...t, groupId: targetGroupId }));
    
    // Get target group TOP-LEVEL tasks only (excluding tasks being moved)
    const targetGroupTasks = state.tasks
      .filter(t => t.groupId === targetGroupId && !t.parentId && !tasksToMove.some(mt => mt.id === t.id))
      .sort((a, b) => a.order - b.order);
    
    // Determine the insert index (only insert the parent task)
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
    const oldGroupTasks = state.tasks
      .filter(t => t.groupId === oldGroupId && !t.parentId && !tasksToMove.some(mt => mt.id === t.id))
      .sort((a, b) => a.order - b.order);
    oldGroupTasks.forEach((t, i) => t.order = i);
    
    // Get child tasks from the moved tasks and preserve their order relative to parent
    const movedChildTasks = movedTasks.slice(1);
    
    // Combine: other groups + old group + target group + moved children
    const otherTasks = state.tasks.filter(
      t => t.groupId !== oldGroupId && t.groupId !== targetGroupId && !tasksToMove.some(mt => mt.id === t.id)
    );
    const newTasks = [...otherTasks, ...oldGroupTasks, ...targetGroupTasks, ...movedChildTasks];
    
    // Persist both groups
    persistGroup(state.groups, newTasks, oldGroupId);
    persistGroup(state.groups, newTasks, targetGroupId);
    
    return { tasks: newTasks, activeGroupId: targetGroupId };
  }),
}));
