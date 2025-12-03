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
  updatedAt?: number;
  pinned?: boolean;
}

// Priority levels: red (highest) > yellow > purple > green > default (lowest)
export type Priority = 'red' | 'yellow' | 'purple' | 'green' | 'default';

// Parse time string to minutes (e.g., "2d", "2h", "30m", "2d3h5m2s", "45s")
export function parseTimeString(timeStr: string): number | undefined {
  // Match patterns like "2d3h5m2s", "1h2m34s", "2h30m", "45s"
  const pattern = /^(?:(\d+(?:\.\d+)?)d)?(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/i;
  const match = timeStr.trim().match(pattern);
  
  if (match && match[0].trim()) {
    const days = match[1] ? parseFloat(match[1]) : 0;
    const hours = match[2] ? parseFloat(match[2]) : 0;
    const minutes = match[3] ? parseFloat(match[3]) : 0;
    const seconds = match[4] ? parseFloat(match[4]) : 0;
    
    // Validate numbers are finite and positive
    if (!isFinite(days) || !isFinite(hours) || !isFinite(minutes) || !isFinite(seconds) || 
        days < 0 || hours < 0 || minutes < 0 || seconds < 0) {
      return undefined;
    }
    
    // Calculate total minutes (including fractional minutes from seconds)
    const totalMinutes = days * 1440 + hours * 60 + minutes + seconds / 60;
    
    // Validate result is reasonable (not too large, not zero)
    if (totalMinutes > 0 && totalMinutes < 144000) { // Max 100 days
      return totalMinutes;
    }
  }
  
  return undefined;
}

// Parse time estimation from task content (e.g., "2d", "2h", "30m", "2d3h5m2s", "45s")
function parseTimeEstimation(content: string): { cleanContent: string; estimatedMinutes?: number } {
  // Match complex patterns like "2d3h5m2s", "1h2m34s", "2h30m", "45s" at the end of content
  const complexPattern = /\s+(?:(\d+(?:\.\d+)?)d)?(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/i;
  const match = content.match(complexPattern);
  
  if (match && match[0].trim()) {
    const timeStr = match[0].trim();
    const estimatedMinutes = parseTimeString(timeStr);
    
    if (estimatedMinutes !== undefined) {
      const cleanContent = content.replace(match[0], '').trim();
      // Don't allow empty content after removing time
      if (cleanContent.length === 0) {
        return { cleanContent: content };
      }
      return { cleanContent, estimatedMinutes };
    }
  }
  
  return { cleanContent: content };
}

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
  
  // Time estimation and tracking
  estimatedMinutes?: number;  // Estimated time in minutes
  actualMinutes?: number;     // Actual time spent in minutes
  
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
  hideActualTime: boolean;
  searchQuery: string;
  loadedGroups: Set<string>; // 追踪哪些组已加载任务
  previousNonArchiveGroupId: string | null; // 记录切换到归档前的分组
  
  // Drag state for cross-group drag
  draggingTaskId: string | null;
  setDraggingTaskId: (id: string | null) => void;
  setHideCompleted: (hide: boolean) => void;
  setHideActualTime: (hide: boolean) => void;
  setSearchQuery: (query: string) => void;
  
  loadData: () => Promise<void>;
  loadGroupTasks: (groupId: string) => Promise<void>; // 懒加载单个组的任务
  setDrawerOpen: (open: boolean) => void;
  toggleDrawer: () => void;
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
        priority: t.priority,
        estimatedMinutes: t.estimatedMinutes,
        actualMinutes: t.actualMinutes,
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
      estimatedMinutes: t.estimatedMinutes,
      actualMinutes: t.actualMinutes,
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

export const useGroupStore = create<GroupStore>()((set, _get) => ({
  groups: [],
  tasks: [],
  activeGroupId: 'default',
  drawerOpen: false,
  loaded: false,
  hideCompleted: false,
  hideActualTime: false,
  searchQuery: '',
  loadedGroups: new Set<string>(),
  previousNonArchiveGroupId: null,
  
  draggingTaskId: null,
  setDraggingTaskId: (id) => set({ draggingTaskId: id }),
  setHideCompleted: (hide) => set({ hideCompleted: hide }),
  setHideActualTime: (hide) => set({ hideActualTime: hide }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  loadData: async () => {
    console.log('[LazyLoad] Loading group metadata only (not tasks)');
    const allGroups = await loadGroups();
    const groups: Group[] = [];
    
    // 只加载组的元数据，不加载任务
    for (const gd of allGroups) {
      groups.push({
        id: gd.id,
        name: gd.name,
        pinned: gd.pinned,
        createdAt: gd.createdAt,
        updatedAt: gd.updatedAt,
      });
    }
    
    // 按置顶排序
    groups.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    });
    
    console.log(`[LazyLoad] Loaded ${groups.length} groups without tasks`);
    
    // 获取当前的 activeGroupId，初始化 previousNonArchiveGroupId
    const currentActiveId = useGroupStore.getState().activeGroupId;
    const initialPreviousNonArchive = (currentActiveId && currentActiveId !== '__archive__') ? currentActiveId : null;
    
    set({ groups, tasks: [], loaded: true, loadedGroups: new Set(), previousNonArchiveGroupId: initialPreviousNonArchive });
    
    // 自动加载初始活跃组的任务
    const { activeGroupId, loadGroupTasks } = useGroupStore.getState();
    if (activeGroupId) {
      await loadGroupTasks(activeGroupId);
    }
  },

  loadGroupTasks: async (groupId) => {
    const state = useGroupStore.getState();
    
    // 如果已经加载过，跳过
    if (state.loadedGroups.has(groupId)) {
      console.log(`[LazyLoad] Group ${groupId} already loaded, skipping`);
      return;
    }
    
    // 立即标记为加载中，防止重复加载（竞态条件保护）
    set((state) => ({
      loadedGroups: new Set([...state.loadedGroups, groupId])
    }));
    
    console.log(`[LazyLoad] Loading tasks for group: ${groupId}`);
    
    try {
      // 特殊处理归档分组 - 加载所有分组的归档数据
      if (groupId === '__archive__') {
        const { loadArchiveData } = await import('@/lib/storage');
        const currentState = useGroupStore.getState();
        
        // 加载所有非归档分组的归档数据
        const archiveTasks: StoreTask[] = [];
        let taskOrder = 0;
        
        for (const group of currentState.groups) {
          if (group.id === '__archive__') continue;
          
          console.log(`[Archive] Loading archive for group: ${group.id} (${group.name})`);
          const archiveData = await loadArchiveData(group.id);
          console.log(`[Archive] Found ${archiveData.length} archive sections for ${group.name}`);
          
          // 将该分组的归档数据转换为任务格式
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
                // 使用自定义属性保存原始分组ID
                originalGroupId: group.id,
              } as StoreTask & { originalGroupId: string });
            });
          });
        }
        
        console.log(`[LazyLoad] Loaded ${archiveTasks.length} archived tasks from all groups`);
        
        set((state) => ({
          tasks: [...state.tasks, ...archiveTasks]
        }));
        
        return;
      }
      
      const { loadGroup } = await import('@/lib/storage');
      const groupData = await loadGroup(groupId);
      
      if (!groupData) {
        console.warn(`[LazyLoad] Group ${groupId} not found`);
        // 组不存在，移除加载标记（可能被删除或文件损坏）
        set((state) => {
          const newLoadedGroups = new Set(state.loadedGroups);
          newLoadedGroups.delete(groupId);
          return { loadedGroups: newLoadedGroups };
        });
        return;
      }
      
      // 去重并转换任务
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
      
      // 合并到现有任务列表
      set((state) => ({
        tasks: [...state.tasks, ...newTasks]
      }));
    } catch (error) {
      console.error(`[LazyLoad] Failed to load tasks for group ${groupId}:`, error);
      
      // 加载失败时移除标记，允许重试
      set((state) => {
        const newLoadedGroups = new Set(state.loadedGroups);
        newLoadedGroups.delete(groupId);
        return { loadedGroups: newLoadedGroups };
      });
    }
  },

  setDrawerOpen: (open) => set({ drawerOpen: open }),
  toggleDrawer: () => set((state) => ({ drawerOpen: !state.drawerOpen })),
  
  setActiveGroup: async (id) => {
    const state = useGroupStore.getState();
    const previousGroupId = state.activeGroupId;
    
    console.log(`[GroupStore] Switching from ${previousGroupId} to ${id}`);
    
    // 如果从归档切换到其他分组，清除归档任务
    if (previousGroupId === '__archive__' && id !== '__archive__') {
      set((state) => ({
        activeGroupId: id,
        previousNonArchiveGroupId: id, // 更新为新的活跃分组
        tasks: state.tasks.filter(t => t.groupId !== '__archive__'),
        loadedGroups: new Set([...state.loadedGroups].filter(g => g !== '__archive__'))
      }));
    } else if (id === '__archive__' && previousGroupId !== '__archive__') {
      // 切换到归档时，保存当前分组ID并清除归档标记以便重新加载
      console.log(`[GroupStore] Saving previousNonArchiveGroupId: ${previousGroupId}`);
      set((state) => ({
        activeGroupId: id,
        previousNonArchiveGroupId: previousGroupId,
        tasks: state.tasks.filter(t => t.groupId !== '__archive__'),
        loadedGroups: new Set([...state.loadedGroups].filter(g => g !== '__archive__'))
      }));
    } else if (id !== '__archive__') {
      // 切换到普通分组时，更新previousNonArchiveGroupId
      set({ activeGroupId: id, previousNonArchiveGroupId: id });
    } else {
      set({ activeGroupId: id });
    }
    
    // 懒加载：自动加载该组的任务（如果尚未加载）
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
      // 新组没有任务，标记为已加载
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
    
    // 清理loadedGroups
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
  
  // 任务操作
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
    
    // Update content
    task.content = cleanContent;
    
    // Only update estimatedMinutes if a new value was parsed
    // This preserves existing estimation when user just edits task content
    if (estimatedMinutes !== undefined) {
      task.estimatedMinutes = estimatedMinutes;
    }
    // Note: actualMinutes is preserved as it's historical data
    
    persistGroup(state.groups, state.tasks, task.groupId);
    return { tasks: [...state.tasks] };
  }),
  
  updateTaskEstimation: (id, estimatedMinutes) => set((state) => {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return state;
    
    // Directly update estimation (can be undefined to clear)
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
    
    // Calculate actual time spent from creation to completion
    // Always recalculate when completing, clear when uncompleting
    let actualMinutes: number | undefined = undefined;
    if (isCompleting) {
      const elapsedMs = now - task.createdAt;
      // Validate elapsed time is reasonable (positive and not too large)
      if (elapsedMs > 0 && elapsedMs < 8640000000) { // Max ~100 days in ms
        // Keep seconds precision: convert ms to minutes without rounding
        actualMinutes = elapsedMs / 60000;
        // Ensure at least 1 second precision (0.0166... minutes)
        if (actualMinutes < 1/60 && elapsedMs > 0) {
          actualMinutes = 1 / 60;
        }
      }
    }
    // When uncompleting, actualMinutes is cleared (remains undefined)
    
    // Update the task's completed status
    let newTasks = state.tasks.map(t =>
      t.id === id ? { 
        ...t, 
        completed: isCompleting,
        completedAt: isCompleting ? now : undefined,
        actualMinutes: actualMinutes, // Set when completing, undefined when uncompleting
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
  
  archiveCompletedTasks: async (groupId) => {
    const state = useGroupStore.getState();
    const { tasks, groups } = state;
    
    // 防止并发归档（使用简单的标记）
    const archivingKey = `archiving_${groupId}`;
    if ((window as any)[archivingKey]) {
      console.warn(`[Archive] Already archiving group ${groupId}, skipping`);
      return;
    }
    (window as any)[archivingKey] = true;
    
    // 找到该组的所有已完成的顶层任务
    const completedTopLevelTasks = tasks.filter(
      t => t.groupId === groupId && t.completed && !t.parentId
    );
    
    if (completedTopLevelTasks.length === 0) {
      delete (window as any)[archivingKey]; // 清理标记
      return;
    }
    
    // 递归收集任务及其所有子任务
    const allTasksToArchive: StoreTask[] = [];
    const collectTaskAndDescendants = (task: StoreTask) => {
      allTasksToArchive.push(task);
      const children = tasks.filter(t => t.parentId === task.id);
      children.forEach(child => collectTaskAndDescendants(child));
    };
    
    completedTopLevelTasks.forEach(task => collectTaskAndDescendants(task));
    
    // 转换为TaskData格式
    const tasksToArchive = allTasksToArchive.map(t => ({
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
      estimatedMinutes: t.estimatedMinutes,
      actualMinutes: t.actualMinutes,
    }));
    
    try {
      // === 原子性保证：三阶段提交 ===
      
      // 阶段1：写入归档文件（不修改原文件）
      const { archiveTasks, verifyArchive } = await import('@/lib/storage');
      await archiveTasks(groupId, tasksToArchive);
      
      // 阶段2：验证归档文件写入成功
      const verified = await verifyArchive(groupId, tasksToArchive.length);
      if (!verified) {
        throw new Error('Archive verification failed - data integrity check did not pass');
      }
      
      // 阶段3：验证通过后才删除原任务并保存
      const idsToDelete = new Set(allTasksToArchive.map(t => t.id));
      const newTasks = tasks.filter(t => !idsToDelete.has(t.id));
      
      // 先更新内存状态
      useGroupStore.setState({ tasks: newTasks });
      
      // 再持久化到文件
      await persistGroup(groups, newTasks, groupId);
      
      console.log(`[Archive] Successfully archived ${allTasksToArchive.length} tasks with atomic guarantee`);
    } catch (error) {
      console.error('[Archive] Failed - no data was deleted:', error);
      // 归档失败时不删除任务，确保数据安全
      throw error;
    } finally {
      // 清理归档标记
      delete (window as any)[`archiving_${groupId}`];
    }
  },
  
  archiveSingleTask: async (taskId) => {
    const state = useGroupStore.getState();
    const { tasks, groups } = state;
    
    // 找到任务
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.completed) {
      console.warn(`[Archive] Task ${taskId} not found or not completed`);
      return;
    }
    
    const groupId = task.groupId;
    
    // 不能归档已经在归档分组中的任务
    if (groupId === '__archive__') {
      console.warn(`[Archive] Cannot archive task from archive group`);
      return;
    }
    
    // 递归收集任务及其所有子任务
    const allTasksToArchive: StoreTask[] = [];
    const collectTaskAndDescendants = (task: StoreTask) => {
      allTasksToArchive.push(task);
      const children = tasks.filter(t => t.parentId === task.id);
      children.forEach(child => collectTaskAndDescendants(child));
    };
    
    collectTaskAndDescendants(task);
    
    // 转换为TaskData格式
    const tasksToArchive = allTasksToArchive.map(t => ({
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
      estimatedMinutes: t.estimatedMinutes,
      actualMinutes: t.actualMinutes,
    }));
    
    try {
      // 写入归档文件
      const { archiveTasks, verifyArchive } = await import('@/lib/storage');
      await archiveTasks(groupId, tasksToArchive);
      
      // 验证归档文件
      const verified = await verifyArchive(groupId, tasksToArchive.length);
      if (!verified) {
        throw new Error('Archive verification failed');
      }
      
      // 验证通过后删除任务
      const idsToDelete = new Set(allTasksToArchive.map(t => t.id));
      const newTasks = tasks.filter(t => !idsToDelete.has(t.id));
      
      useGroupStore.setState({ tasks: newTasks });
      await persistGroup(groups, newTasks, groupId);
      
      console.log(`[Archive] Successfully archived single task and ${allTasksToArchive.length - 1} descendants`);
    } catch (error) {
      console.error('[Archive] Failed to archive single task:', error);
      throw error;
    }
  },
  
  deleteCompletedTasks: (groupId) => set((state) => {
    // 找到该组的所有已完成的顶层任务
    const completedTopLevelTasks = state.tasks.filter(
      t => t.groupId === groupId && t.completed && !t.parentId
    );
    
    if (completedTopLevelTasks.length === 0) {
      return state;
    }
    
    // 递归收集任务及其所有子任务
    const allTasksToDelete: StoreTask[] = [];
    const collectTaskAndDescendants = (task: StoreTask) => {
      allTasksToDelete.push(task);
      const children = state.tasks.filter(t => t.parentId === task.id);
      children.forEach(child => collectTaskAndDescendants(child));
    };
    
    completedTopLevelTasks.forEach(task => collectTaskAndDescendants(task));
    
    // 删除这些任务
    const idsToDelete = new Set(allTasksToDelete.map(t => t.id));
    const newTasks = state.tasks.filter(t => !idsToDelete.has(t.id));
    
    console.log(`[Delete] Deleted ${allTasksToDelete.length} completed tasks`);
    
    // 持久化
    persistGroup(state.groups, newTasks, groupId);
    
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
    const now = Date.now();
    
    // Create new tasks array with updated status
    const newTasks = state.tasks.map(t => {
      if (t.id === activeId) {
        // Calculate actual time spent from creation to completion
        // Always recalculate when completing, clear when uncompleting
        let actualMinutes: number | undefined = undefined;
        if (newCompleted) {
          const elapsedMs = now - t.createdAt;
          // Validate elapsed time is reasonable (positive and not too large)
          if (elapsedMs > 0 && elapsedMs < 8640000000) { // Max ~100 days in ms
            // Keep seconds precision: convert ms to minutes without rounding
            actualMinutes = elapsedMs / 60000;
            // Ensure at least 1 second precision (0.0166... minutes)
            if (actualMinutes < 1/60 && elapsedMs > 0) {
              actualMinutes = 1 / 60;
            }
          }
        }
        // When uncompleting (dragging to incomplete), actualMinutes is cleared
        
        return {
          ...t,
          completed: newCompleted,
          completedAt: newCompleted ? now : undefined,
          actualMinutes: actualMinutes, // Set when completing, undefined when uncompleting
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
  
  moveTaskToGroup: async (taskId, targetGroupId, overTaskId) => {
    // 确保目标组已加载，防止order冲突
    const state = useGroupStore.getState();
    if (!state.loadedGroups.has(targetGroupId)) {
      console.log(`[MoveTask] Target group ${targetGroupId} not loaded, loading first...`);
      await useGroupStore.getState().loadGroupTasks(targetGroupId);
    }
    
    set((state) => {
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
    });
  },
}));
