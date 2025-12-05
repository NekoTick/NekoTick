import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { loadGroups, deleteGroup as deleteGroupFile } from '@/lib/storage';
import { parseTimeEstimation, parseTimeString } from './timeParser';
import type { Group, Priority, StoreTask, ArchiveTimeView } from './types';
import { PRIORITY_COLORS } from './types';
import { persistGroup, collectTaskAndDescendants, calculateActualTime } from './taskUtils';
import { archiveCompletedTasksForGroup, archiveSingleTaskWithDescendants, deleteCompletedTasksInGroup, loadArchivedTasks } from './archiveUtils';
import { reorderTasksInGroup, crossStatusReorderTask, moveTaskBetweenGroups } from './reorderUtils';
import { useUIStore } from './uiSlice';

// Re-export types and functions for backward compatibility
export type { Group, Priority, StoreTask, ArchiveTimeView };
export { parseTimeString, PRIORITY_COLORS };
export { useUIStore };

interface GroupStore {
  // Core state
  groups: Group[];
  tasks: StoreTask[];
  activeGroupId: string | null;
  loaded: boolean;
  loadedGroups: Set<string>; // Track which groups have loaded tasks
  previousNonArchiveGroupId: string | null; // Remember group before switching to archive
  
  // Data operations
  loadData: () => Promise<void>;
  loadGroupTasks: (groupId: string) => Promise<void>;
  setActiveGroup: (id: string | null) => Promise<void>;
  addGroup: (name: string) => void;
  updateGroup: (id: string, name: string) => void;
  deleteGroup: (id: string) => void;
  togglePin: (id: string) => void;
  reorderGroups: (activeId: string, overId: string) => void;
  
  // Task operations
  addTask: (content: string, groupId: string, priority?: Priority) => void;
  addSubTask: (parentId: string, content: string) => void;
  updateTask: (id: string, content: string) => void;
  updateTaskEstimation: (id: string, estimatedMinutes?: number) => void;
  updateTaskPriority: (id: string, priority: Priority) => void;
  toggleTask: (id: string, skipReorder?: boolean) => void;
  toggleCollapse: (id: string) => void;
  deleteTask: (id: string) => void;
  archiveCompletedTasks: (groupId: string) => Promise<void>;
  archiveSingleTask: (taskId: string) => Promise<void>;
  deleteCompletedTasks: (groupId: string) => void;
  reorderTasks: (activeId: string, overId: string) => void;
  crossStatusReorder: (activeId: string, overId: string) => void;
  moveTaskToGroup: (taskId: string, targetGroupId: string, overTaskId?: string | null) => Promise<void>;
}

export const useGroupStore = create<GroupStore>()((set, get) => ({
  // Core state
  groups: [],
  tasks: [],
  activeGroupId: 'default',
  loaded: false,
  loadedGroups: new Set<string>(),
  previousNonArchiveGroupId: null,

  loadData: async () => {
    console.log('[LazyLoad] Loading group metadata only (not tasks)');
    const allGroups = await loadGroups();
    const groups: Group[] = [];
    
    // Only load group metadata, not tasks
    for (const gd of allGroups) {
      groups.push({
        id: gd.id,
        name: gd.name,
        pinned: gd.pinned,
        createdAt: gd.createdAt,
        updatedAt: gd.updatedAt,
      });
    }
    
    // Sort by pinned status
    groups.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    });
    
    console.log(`[LazyLoad] Loaded ${groups.length} groups without tasks`);
    
    // Get current activeGroupId, initialize previousNonArchiveGroupId
    const currentActiveId = useGroupStore.getState().activeGroupId;
    const initialPreviousNonArchive = (currentActiveId && currentActiveId !== '__archive__') ? currentActiveId : null;
    
    set({ groups, tasks: [], loaded: true, loadedGroups: new Set(), previousNonArchiveGroupId: initialPreviousNonArchive });
    
    // Auto-load tasks for initial active group
    const { activeGroupId, loadGroupTasks } = useGroupStore.getState();
    if (activeGroupId) {
      await loadGroupTasks(activeGroupId);
    }
  },

  loadGroupTasks: async (groupId) => {
    const state = useGroupStore.getState();
    
    // Skip if already loaded
    if (state.loadedGroups.has(groupId)) {
      console.log(`[LazyLoad] Group ${groupId} already loaded, skipping`);
      return;
    }
    
    // Mark as loading immediately to prevent duplicate loads (race condition protection)
    set((state) => ({
      loadedGroups: new Set([...state.loadedGroups, groupId])
    }));
    
    console.log(`[LazyLoad] Loading tasks for group: ${groupId}`);
    
    try {
      // Special handling for archive group - load archive data from all groups
      if (groupId === '__archive__') {
        const currentState = get();
        const maxDays = useUIStore.getState().getArchiveMaxDays();
        const archiveTasks = await loadArchivedTasks(currentState.groups, maxDays);
        
        set((state) => {
          const existingIds = new Set(state.tasks.map(t => t.id));
          const tasksToAdd = archiveTasks.filter(t => !existingIds.has(t.id));
          if (tasksToAdd.length < archiveTasks.length) {
            console.warn(`[LazyLoad] Skipped ${archiveTasks.length - tasksToAdd.length} duplicate archived tasks`);
          }
          return { tasks: [...state.tasks, ...tasksToAdd] };
        });
        return;
      }
      
      const { loadGroup } = await import('@/lib/storage');
      const groupData = await loadGroup(groupId);
      
      if (!groupData) {
        console.warn(`[LazyLoad] Group ${groupId} not found`);
        // Group not found, remove loading flag (may be deleted or corrupted)
        set((state) => {
          const newLoadedGroups = new Set(state.loadedGroups);
          newLoadedGroups.delete(groupId);
          return { loadedGroups: newLoadedGroups };
        });
        return;
      }
      
      // Deduplicate and convert tasks
      const seenIds = new Set<string>();
      const newTasks: StoreTask[] = [];
      
      for (const td of groupData.tasks) {
        if (seenIds.has(td.id)) {
          continue; // Skip duplicate
        }
        seenIds.add(td.id);
        
        newTasks.push({
          id: td.id,
          content: td.content,
          completed: td.completed,
          createdAt: td.createdAt,
          completedAt: td.completedAt,
          scheduledTime: td.scheduledTime,
          order: td.order,
          groupId: groupId,
          parentId: td.parentId,
          collapsed: td.collapsed,
          priority: td.priority,
          estimatedMinutes: td.estimatedMinutes,
          actualMinutes: td.actualMinutes,
        });
      }
      
      console.log(`[LazyLoad] Loaded ${newTasks.length} tasks for group ${groupId}`);
      
      // Merge into existing task list (deduplicate: exclude existing tasks)
      set((state) => {
        const existingIds = new Set(state.tasks.map(t => t.id));
        const tasksToAdd = newTasks.filter(t => !existingIds.has(t.id));
        if (tasksToAdd.length < newTasks.length) {
          console.warn(`[LazyLoad] Skipped ${newTasks.length - tasksToAdd.length} duplicate tasks`);
        }
        return {
          tasks: [...state.tasks, ...tasksToAdd]
        };
      });
    } catch (error) {
      console.error(`[LazyLoad] Failed to load tasks for group ${groupId}:`, error);
      
      // Remove loading flag on failure to allow retry
      set((state) => {
        const newLoadedGroups = new Set(state.loadedGroups);
        newLoadedGroups.delete(groupId);
        return { loadedGroups: newLoadedGroups };
      });
    }
  },

  setActiveGroup: async (id) => {
    const state = useGroupStore.getState();
    const previousGroupId = state.activeGroupId;
    
    console.log(`[GroupStore] Switching from ${previousGroupId} to ${id}`);
    
    // If switching from archive to another group, clear archive tasks
    if (previousGroupId === '__archive__' && id !== '__archive__') {
      set((state) => ({
        activeGroupId: id,
        previousNonArchiveGroupId: id, // Update to new active group
        tasks: state.tasks.filter(t => t.groupId !== '__archive__'),
        loadedGroups: new Set([...state.loadedGroups].filter(g => g !== '__archive__'))
      }));
    } else if (id === '__archive__' && previousGroupId !== '__archive__') {
      // When switching to archive, save current group ID and clear archive flag for reload
      console.log(`[GroupStore] Saving previousNonArchiveGroupId: ${previousGroupId}`);
      set((state) => ({
        activeGroupId: id,
        previousNonArchiveGroupId: previousGroupId,
        tasks: state.tasks.filter(t => t.groupId !== '__archive__'),
        loadedGroups: new Set([...state.loadedGroups].filter(g => g !== '__archive__'))
      }));
    } else if (id !== '__archive__') {
      // When switching to regular group, update previousNonArchiveGroupId
      set({ activeGroupId: id, previousNonArchiveGroupId: id });
    } else {
      set({ activeGroupId: id });
    }
    
    // Lazy load: auto-load group tasks if not yet loaded
    if (id) {
      const { loadGroupTasks } = useGroupStore.getState();
      await loadGroupTasks(id);
    }
  },
  
  addGroup: (name) => {
    const newGroup: Group = {
      id: nanoid(),
      name,
      createdAt: Date.now(),
    };
    
    set((state) => {
      const newGroups = [...state.groups, newGroup];
      persistGroup(newGroups, state.tasks, newGroup.id);
      // New group has no tasks, mark as loaded
      return { 
        groups: newGroups,
        loadedGroups: new Set([...state.loadedGroups, newGroup.id])
      };
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
    
    // Clean up loadedGroups
    const newLoadedGroups = new Set(state.loadedGroups);
    newLoadedGroups.delete(id);
    
    return {
      groups: state.groups.filter((g) => g.id !== id),
      tasks: state.tasks.filter((t) => t.groupId !== id),
      activeGroupId: state.activeGroupId === id ? 'default' : state.activeGroupId,
      loadedGroups: newLoadedGroups,
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
  
  // Task operations
  addTask: (content, groupId, priority = 'default') => set((state) => {
    const groupTasks = state.tasks.filter(t => t.groupId === groupId && !t.parentId);
    const { cleanContent, estimatedMinutes } = parseTimeEstimation(content);
    
    const newTask: StoreTask = {
      id: nanoid(),
      content: cleanContent,
      completed: false,
      createdAt: Date.now(),
      order: groupTasks.length,
      groupId,
      parentId: null,
      collapsed: false,
      priority,
      estimatedMinutes,
    };
    
    const newTasks = [...state.tasks, newTask];
    persistGroup(state.groups, newTasks, groupId);
    return { tasks: newTasks };
  }),
  
  addSubTask: (parentId, content) => set((state) => {
    const parentTask = state.tasks.find(t => t.id === parentId);
    if (!parentTask) return state;
    
    const siblings = state.tasks.filter(t => t.parentId === parentId);
    const { cleanContent, estimatedMinutes } = parseTimeEstimation(content);
    
    const newTask: StoreTask = {
      id: nanoid(),
      content: cleanContent,
      completed: false,
      createdAt: Date.now(),
      order: siblings.length,
      groupId: parentTask.groupId,
      parentId: parentId,
      collapsed: false,
      estimatedMinutes,
    };
    
    const newTasks = [...state.tasks, newTask];
    persistGroup(state.groups, newTasks, parentTask.groupId);
    return { tasks: newTasks };
  }),
  
  updateTask: (id, content) => set((state) => {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return state;
    
    // Parse time estimation from updated content
    const { cleanContent, estimatedMinutes } = parseTimeEstimation(content);
    
    // Update content (originalGroupId is preserved automatically)
    task.content = cleanContent;
    
    // Only update estimatedMinutes if a new value was parsed
    if (estimatedMinutes !== undefined) {
      task.estimatedMinutes = estimatedMinutes;
    }
    
    persistGroup(state.groups, state.tasks, task.groupId);
    return { tasks: [...state.tasks] };
  }),
  
  updateTaskEstimation: (id, estimatedMinutes) => set((state) => {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return state;
    
    task.estimatedMinutes = estimatedMinutes;
    
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
    const now = Date.now();
    const actualMinutes = calculateActualTime(task.createdAt, isCompleting);
    
    // Update the task's completed status (spread preserves originalGroupId)
    let newTasks = state.tasks.map(t => {
      if (t.id !== id) return t;
      return { 
        ...t, 
        completed: isCompleting,
        completedAt: isCompleting ? now : undefined,
        actualMinutes,
      };
    });
    
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
    
    const newTasks = state.tasks.map(t => {
      if (t.id !== id) return t;
      return { ...t, collapsed: !t.collapsed };
    });
    persistGroup(state.groups, newTasks, task.groupId);
    return { tasks: newTasks };
  }),
  
  deleteTask: (id) => set((state) => {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return state;
    
    // Collect task and all its descendants
    const tasksToDelete = collectTaskAndDescendants(task, state.tasks);
    const idsToDelete = new Set(tasksToDelete.map(t => t.id));
    
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
  
  archiveCompletedTasks: async (groupId) => {
    try {
      const { tasks, groups } = useGroupStore.getState();
      const result = await archiveCompletedTasksForGroup(groupId, tasks, groups);
      if (result.success && result.archivedCount > 0) {
        useGroupStore.setState({ tasks: result.newTasks });
      }
    } catch (error) {
      console.error('[Store] Archive completed tasks failed:', error);
    }
  },
  
  archiveSingleTask: async (taskId) => {
    try {
      const { tasks, groups } = useGroupStore.getState();
      const result = await archiveSingleTaskWithDescendants(taskId, tasks, groups);
      if (result.success) {
        useGroupStore.setState({ tasks: result.newTasks });
      }
    } catch (error) {
      console.error('[Store] Archive single task failed:', error);
    }
  },
  
  deleteCompletedTasks: (groupId) => set((state) => {
    const result = deleteCompletedTasksInGroup(groupId, state.tasks, state.groups);
    return { tasks: result.newTasks };
  }),
  
  reorderTasks: (activeId, overId) => set((state) => {
    const result = reorderTasksInGroup(activeId, overId, state.tasks, state.groups);
    return result.success ? { tasks: result.newTasks } : state;
  }),
  
  crossStatusReorder: (activeId, overId) => set((state) => {
    const result = crossStatusReorderTask(activeId, overId, state.tasks, state.groups);
    return result.success ? { tasks: result.newTasks } : state;
  }),
  
  moveTaskToGroup: async (taskId, targetGroupId, overTaskId) => {
    // Ensure target group is loaded to prevent order conflicts
    const state = useGroupStore.getState();
    if (!state.loadedGroups.has(targetGroupId)) {
      console.log(`[MoveTask] Target group ${targetGroupId} not loaded, loading first...`);
      await useGroupStore.getState().loadGroupTasks(targetGroupId);
    }
    
    set((state) => {
      const result = moveTaskBetweenGroups(taskId, targetGroupId, overTaskId, state.tasks, state.groups);
      return result.success ? { tasks: result.newTasks, activeGroupId: targetGroupId } : state;
    });
  },
}));
