/**
 * Unified Store - 统一数据源
 * 
 * 核心理念：世界上只有一种"事项"（UnifiedTask）
 * - 有 startDate 的事项 → 在日历视图中显示
 * - 没有 startDate 的事项 → 只在待办列表中显示
 * - 给待办安排时间 = 添加 startDate 属性
 * - 删除日历事件的时间 = 移除 startDate 属性
 * 
 * 数据流：
 * - useUnifiedStore: 唯一数据源
 * - useCalendarStore: 日历视图的数据访问层（筛选有时间的事项）
 * - useGroupStore: 待办视图的数据访问层（兼容旧 API）
 */

import { create } from 'zustand';
import { nanoid } from 'nanoid';
import {
  loadUnifiedData,
  saveUnifiedData,
  type UnifiedData,
  type UnifiedTask,
  type UnifiedGroup,
  type UnifiedProgress,
  type UnifiedArchiveSection,
} from '@/lib/storage/unifiedStorage';

// Re-export types
export type {
  UnifiedTask,
  UnifiedGroup,
  UnifiedProgress,
  UnifiedArchiveSection,
};

// 统一颜色类型
export type ItemColor = 'red' | 'yellow' | 'purple' | 'green' | 'blue' | 'default';

// View mode type
export type ViewMode = 'day' | 'week' | 'month';

// 撤销操作类型
type UndoAction = {
  type: 'deleteTask';
  task: UnifiedTask;
};

interface UnifiedStore {
  // Data
  data: UnifiedData;
  loaded: boolean;
  
  // UI State (not persisted)
  activeGroupId: string;
  editingEventId: string | null;
  editingEventPosition: { x: number; y: number } | null;
  selectedEventId: string | null;
  showSidebar: boolean;
  showContextPanel: boolean;
  selectedDate: Date;
  
  // Undo stack
  undoStack: UndoAction[];
  
  // Core Actions
  load: () => Promise<void>;
  
  // Group Actions
  addGroup: (name: string) => void;
  updateGroup: (id: string, name: string) => void;
  deleteGroup: (id: string) => void;
  toggleGroupPin: (id: string) => void;
  setActiveGroup: (id: string) => void;
  reorderGroups: (activeId: string, overId: string) => void;
  
  // Task Actions（统一事项操作）
  addTask: (content: string, groupId: string, color?: ItemColor) => void;
  addSubTask: (parentId: string, content: string) => void;
  updateTask: (id: string, content: string) => void;
  updateTaskColor: (id: string, color: ItemColor) => void;
  updateTaskEstimation: (id: string, estimatedMinutes?: number) => void;
  updateTaskParent: (id: string, parentId: string | null, order: number) => void;
  toggleTask: (id: string) => void;
  toggleTaskCollapse: (id: string) => void;
  deleteTask: (id: string) => void;
  deleteCompletedTasks: (groupId: string) => void;
  reorderTasks: (activeId: string, overId: string) => void;
  moveTaskToGroup: (taskId: string, targetGroupId: string, overTaskId?: string | null) => void;
  archiveCompletedTasks: (groupId: string) => void;
  
  // 日历事项操作（本质上是带时间属性的 task）
  addCalendarTask: (task: { content: string; startDate: number; endDate: number; isAllDay?: boolean; color?: ItemColor; groupId?: string }) => string;
  updateTaskTime: (id: string, startDate?: number, endDate?: number, isAllDay?: boolean) => void;
  setEditingEventId: (id: string | null, position?: { x: number; y: number }) => void;
  setSelectedEventId: (id: string | null) => void;
  closeEditingEvent: () => void;
  
  // 日历事件操作（使用 title 作为参数名，内部映射到 content）
  addEvent: (event: { title: string; startDate: number; endDate: number; isAllDay: boolean; color?: string }) => string;
  updateEvent: (id: string, updates: Partial<UnifiedTask>) => void;
  deleteEvent: (id: string) => void;
  
  // Undo Actions
  undo: () => void;
  
  // Progress Actions
  addProgress: (item: Omit<UnifiedProgress, 'id' | 'createdAt' | 'current' | 'todayCount'>) => void;
  updateProgress: (id: string, delta: number) => void;
  updateProgressItem: (id: string, updates: Partial<UnifiedProgress>) => void;
  deleteProgress: (id: string) => void;
  toggleProgressArchive: (id: string) => void;
  reorderProgress: (activeId: string, overId: string) => void;
  
  // Settings Actions
  setTimezone: (tz: number) => void;
  setViewMode: (mode: ViewMode) => void;
  setDayCount: (count: number) => void;
  setHourHeight: (height: number) => void;
  toggleSidebar: () => void;
  toggleContextPanel: () => void;
  setSelectedDate: (date: Date) => void;
}

// Helper: Get today's date key
function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Helper: Persist data
function persist(data: UnifiedData) {
  saveUnifiedData(data);
}

export const useUnifiedStore = create<UnifiedStore>((set, get) => ({
  data: {
    groups: [{ id: 'default', name: 'Inbox', pinned: false, createdAt: Date.now() }],
    tasks: [],
    progress: [],
    archive: [],
    settings: { timezone: 8, viewMode: 'week', dayCount: 1, hourHeight: 64 },
  },
  loaded: false,
  activeGroupId: 'default',
  editingEventId: null,
  editingEventPosition: null,
  selectedEventId: null,
  showSidebar: true,
  showContextPanel: true,
  selectedDate: new Date(),
  undoStack: [],

  load: async () => {
    if (get().loaded) return;
    const data = await loadUnifiedData();
    set({ data, loaded: true });
  },

  // ========== Group Actions ==========
  
  addGroup: (name) => {
    const newGroup: UnifiedGroup = {
      id: nanoid(),
      name,
      pinned: false,
      createdAt: Date.now(),
    };
    set((state) => {
      const newData = {
        ...state.data,
        groups: [...state.data.groups, newGroup],
      };
      persist(newData);
      return { data: newData };
    });
  },

  updateGroup: (id, name) => {
    set((state) => {
      const newData = {
        ...state.data,
        groups: state.data.groups.map(g => 
          g.id === id ? { ...g, name, updatedAt: Date.now() } : g
        ),
      };
      persist(newData);
      return { data: newData };
    });
  },

  deleteGroup: (id) => {
    if (id === 'default') return;
    set((state) => {
      const newData = {
        ...state.data,
        groups: state.data.groups.filter(g => g.id !== id),
        tasks: state.data.tasks.filter(t => t.groupId !== id),
      };
      persist(newData);
      return { 
        data: newData,
        activeGroupId: state.activeGroupId === id ? 'default' : state.activeGroupId,
      };
    });
  },

  toggleGroupPin: (id) => {
    set((state) => {
      const newGroups = state.data.groups.map(g =>
        g.id === id ? { ...g, pinned: !g.pinned } : g
      );
      // Sort: pinned first
      newGroups.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return 0;
      });
      const newData = { ...state.data, groups: newGroups };
      persist(newData);
      return { data: newData };
    });
  },

  setActiveGroup: (id) => set({ activeGroupId: id }),

  reorderGroups: (activeId, overId) => {
    set((state) => {
      const oldIndex = state.data.groups.findIndex(g => g.id === activeId);
      const newIndex = state.data.groups.findIndex(g => g.id === overId);
      if (oldIndex === -1 || newIndex === -1) return state;
      
      const newGroups = [...state.data.groups];
      const [removed] = newGroups.splice(oldIndex, 1);
      newGroups.splice(newIndex, 0, removed);
      
      const newData = { ...state.data, groups: newGroups };
      persist(newData);
      return { data: newData };
    });
  },

  // ========== Task Actions ==========

  addTask: (content, groupId, color = 'default') => {
    const groupTasks = get().data.tasks.filter(t => t.groupId === groupId && !t.parentId && !t.startDate);
    const newTask: UnifiedTask = {
      id: nanoid(),
      content,
      completed: false,
      createdAt: Date.now(),
      order: groupTasks.length,
      groupId,
      parentId: null,
      collapsed: false,
      color,
    };
    set((state) => {
      const newData = {
        ...state.data,
        tasks: [...state.data.tasks, newTask],
      };
      persist(newData);
      return { data: newData };
    });
  },

  addSubTask: (parentId, content) => {
    const parent = get().data.tasks.find(t => t.id === parentId);
    if (!parent) return;
    
    const siblings = get().data.tasks.filter(t => t.parentId === parentId);
    const newTask: UnifiedTask = {
      id: nanoid(),
      content,
      completed: false,
      createdAt: Date.now(),
      order: siblings.length,
      groupId: parent.groupId,
      parentId,
      collapsed: false,
      color: parent.color || 'default', // 继承父任务的颜色
    };
    set((state) => {
      const newData = {
        ...state.data,
        tasks: [...state.data.tasks, newTask],
      };
      persist(newData);
      return { data: newData };
    });
  },

  updateTask: (id, content) => {
    set((state) => {
      const newData = {
        ...state.data,
        tasks: state.data.tasks.map(t =>
          t.id === id ? { ...t, content } : t
        ),
      };
      persist(newData);
      return { data: newData };
    });
  },

  updateTaskColor: (id, color) => {
    set((state) => {
      const newData = {
        ...state.data,
        tasks: state.data.tasks.map(t =>
          t.id === id ? { ...t, color } : t
        ),
      };
      persist(newData);
      return { data: newData };
    });
  },

  updateTaskEstimation: (id, estimatedMinutes) => {
    set((state) => {
      const newData = {
        ...state.data,
        tasks: state.data.tasks.map(t =>
          t.id === id ? { ...t, estimatedMinutes } : t
        ),
      };
      persist(newData);
      return { data: newData };
    });
  },

  updateTaskParent: (id, parentId, order) => {
    set((state) => {
      const task = state.data.tasks.find(t => t.id === id);
      if (!task) return state;
      
      const oldParentId = task.parentId;
      let newTasks = state.data.tasks.map(t =>
        t.id === id ? { ...t, parentId, order } : t
      );
      
      // Reorder old siblings
      if (oldParentId !== parentId) {
        const oldSiblings = newTasks
          .filter(t => t.parentId === oldParentId && t.id !== id)
          .sort((a, b) => a.order - b.order);
        oldSiblings.forEach((t, i) => {
          const taskToUpdate = newTasks.find(nt => nt.id === t.id);
          if (taskToUpdate) taskToUpdate.order = i;
        });
      }
      
      const newData = { ...state.data, tasks: newTasks };
      persist(newData);
      return { data: newData };
    });
  },

  toggleTask: (id) => {
    set((state) => {
      const task = state.data.tasks.find(t => t.id === id);
      if (!task) return state;
      
      const isCompleting = !task.completed;
      const newData = {
        ...state.data,
        tasks: state.data.tasks.map(t =>
          t.id === id ? {
            ...t,
            completed: isCompleting,
            completedAt: isCompleting ? Date.now() : undefined,
          } : t
        ),
      };
      persist(newData);
      return { data: newData };
    });
  },

  toggleTaskCollapse: (id) => {
    set((state) => {
      const newData = {
        ...state.data,
        tasks: state.data.tasks.map(t =>
          t.id === id ? { ...t, collapsed: !t.collapsed } : t
        ),
      };
      persist(newData);
      return { data: newData };
    });
  },

  deleteTask: (id) => {
    set((state) => {
      // Collect task and all descendants
      const collectIds = (taskId: string): string[] => {
        const children = state.data.tasks.filter(t => t.parentId === taskId);
        return [taskId, ...children.flatMap(c => collectIds(c.id))];
      };
      const idsToDelete = new Set(collectIds(id));
      
      const newData = {
        ...state.data,
        tasks: state.data.tasks.filter(t => !idsToDelete.has(t.id)),
      };
      persist(newData);
      return { data: newData };
    });
  },

  deleteCompletedTasks: (groupId) => {
    set((state) => {
      const newData = {
        ...state.data,
        tasks: state.data.tasks.filter(t => t.groupId !== groupId || !t.completed),
      };
      persist(newData);
      return { data: newData };
    });
  },

  reorderTasks: (activeId, overId) => {
    set((state) => {
      const activeTask = state.data.tasks.find(t => t.id === activeId);
      const overTask = state.data.tasks.find(t => t.id === overId);
      if (!activeTask || !overTask) return state;
      if (activeTask.groupId !== overTask.groupId) return state;
      if (activeTask.parentId !== overTask.parentId) return state;
      
      // Get siblings at same level
      const siblings = state.data.tasks
        .filter(t => t.groupId === activeTask.groupId && t.parentId === activeTask.parentId)
        .sort((a, b) => a.order - b.order);
      
      const oldIndex = siblings.findIndex(t => t.id === activeId);
      const newIndex = siblings.findIndex(t => t.id === overId);
      if (oldIndex === -1 || newIndex === -1) return state;
      
      // Reorder
      const [removed] = siblings.splice(oldIndex, 1);
      siblings.splice(newIndex, 0, removed);
      
      // Update orders
      const orderMap = new Map(siblings.map((t, i) => [t.id, i]));
      const newTasks = state.data.tasks.map(t => {
        const newOrder = orderMap.get(t.id);
        return newOrder !== undefined ? { ...t, order: newOrder } : t;
      });
      
      const newData = { ...state.data, tasks: newTasks };
      persist(newData);
      return { data: newData };
    });
  },

  moveTaskToGroup: (taskId, targetGroupId, overTaskId) => {
    set((state) => {
      const task = state.data.tasks.find(t => t.id === taskId);
      if (!task) return state;
      
      // Collect task and all descendants
      const collectIds = (id: string): string[] => {
        const children = state.data.tasks.filter(t => t.parentId === id);
        return [id, ...children.flatMap(c => collectIds(c.id))];
      };
      const idsToMove = new Set(collectIds(taskId));
      
      // Calculate new order
      const targetTasks = state.data.tasks.filter(t => t.groupId === targetGroupId && !t.parentId);
      let newOrder = targetTasks.length;
      
      if (overTaskId) {
        const overTask = state.data.tasks.find(t => t.id === overTaskId);
        if (overTask && overTask.groupId === targetGroupId) {
          newOrder = overTask.order;
        }
      }
      
      const newTasks = state.data.tasks.map(t => {
        if (t.id === taskId) {
          return { ...t, groupId: targetGroupId, order: newOrder, parentId: null };
        }
        if (idsToMove.has(t.id)) {
          return { ...t, groupId: targetGroupId };
        }
        return t;
      });
      
      const newData = { ...state.data, tasks: newTasks };
      persist(newData);
      return { data: newData };
    });
  },

  archiveCompletedTasks: (groupId) => {
    set((state) => {
      const completedTasks = state.data.tasks.filter(t => t.groupId === groupId && t.completed);
      if (completedTasks.length === 0) return state;
      
      const archiveEntry = {
        timestamp: Date.now(),
        tasks: completedTasks.map(t => ({
          content: t.content,
          completedAt: t.completedAt,
          createdAt: t.createdAt,
          color: t.color,
          estimatedMinutes: t.estimatedMinutes,
          actualMinutes: t.actualMinutes,
          groupId: t.groupId,
        })),
      };
      
      const newData = {
        ...state.data,
        tasks: state.data.tasks.filter(t => t.groupId !== groupId || !t.completed),
        archive: [archiveEntry, ...state.data.archive],
      };
      persist(newData);
      return { data: newData };
    });
  },

  // ========== 日历事项操作（带时间属性的 task）==========

  addCalendarTask: (taskData) => {
    const newTask: UnifiedTask = {
      id: nanoid(),
      content: taskData.content,
      completed: false,
      createdAt: Date.now(),
      order: 0,
      groupId: taskData.groupId || 'default',
      parentId: null,
      collapsed: false,
      color: taskData.color || 'blue',
      startDate: taskData.startDate,
      endDate: taskData.endDate,
      isAllDay: taskData.isAllDay,
    };
    set((state) => {
      const newData = {
        ...state.data,
        tasks: [...state.data.tasks, newTask],
      };
      persist(newData);
      return { data: newData };
    });
    return newTask.id;
  },

  updateTaskTime: (id, startDate, endDate, isAllDay) => {
    set((state) => {
      const newData = {
        ...state.data,
        tasks: state.data.tasks.map(t =>
          t.id === id ? { 
            ...t, 
            startDate: startDate ?? t.startDate, 
            endDate: endDate ?? t.endDate,
            isAllDay: isAllDay ?? t.isAllDay,
          } : t
        ),
      };
      persist(newData);
      return { data: newData };
    });
  },

  setEditingEventId: (id, position) => set({ editingEventId: id, editingEventPosition: position || null }),
  
  setSelectedEventId: (id) => set({ selectedEventId: id }),

  closeEditingEvent: () => {
    const { editingEventId, data } = get();
    if (editingEventId) {
      const task = data.tasks.find(t => t.id === editingEventId);
      if (task && !task.content.trim()) {
        // Delete empty task
        const newData = {
          ...data,
          tasks: data.tasks.filter(t => t.id !== editingEventId),
        };
        persist(newData);
        set({ data: newData, editingEventId: null, editingEventPosition: null });
      } else {
        set({ editingEventId: null, editingEventPosition: null });
      }
    }
  },

  // ========== 日历事件操作 ==========

  addEvent: (eventData) => {
    return get().addCalendarTask({
      content: eventData.title,
      startDate: eventData.startDate,
      endDate: eventData.endDate,
      isAllDay: eventData.isAllDay,
      color: (eventData.color as ItemColor) || 'blue',
    });
  },

  updateEvent: (id, updates) => {
    set((state) => {
      const newData = {
        ...state.data,
        tasks: state.data.tasks.map(t => {
          if (t.id !== id) return t;
          const newTask = { ...t };
          if ('title' in updates) newTask.content = updates.title as string;
          if ('content' in updates) newTask.content = updates.content as string;
          if ('startDate' in updates) newTask.startDate = updates.startDate;
          if ('endDate' in updates) newTask.endDate = updates.endDate;
          if ('isAllDay' in updates) newTask.isAllDay = updates.isAllDay;
          if ('color' in updates) newTask.color = (updates.color as ItemColor) || t.color;
          if ('description' in updates) newTask.description = updates.description;
          if ('location' in updates) newTask.location = updates.location;
          if ('groupId' in updates) newTask.groupId = updates.groupId as string;
          return newTask;
        }),
      };
      persist(newData);
      return { data: newData };
    });
  },

  deleteEvent: (id) => {
    set((state) => {
      const taskToDelete = state.data.tasks.find(t => t.id === id);
      const newData = {
        ...state.data,
        tasks: state.data.tasks.filter(t => t.id !== id),
      };
      persist(newData);
      
      const newUndoStack = taskToDelete
        ? [...state.undoStack, { type: 'deleteTask' as const, task: taskToDelete }].slice(-20)
        : state.undoStack;
      
      return {
        data: newData,
        editingEventId: state.editingEventId === id ? null : state.editingEventId,
        selectedEventId: state.selectedEventId === id ? null : state.selectedEventId,
        undoStack: newUndoStack,
      };
    });
  },

  // ========== Progress Actions ==========

  addProgress: (item) => {
    const todayKey = getTodayKey();
    const newItem: UnifiedProgress = {
      id: nanoid(),
      createdAt: Date.now(),
      current: item.type === 'progress' && item.direction === 'decrement' ? (item.total || 0) : 0,
      todayCount: 0,
      lastUpdateDate: todayKey,
      history: {},
      ...item,
    };
    set((state) => {
      const newData = {
        ...state.data,
        progress: [newItem, ...state.data.progress],
      };
      persist(newData);
      return { data: newData };
    });
  },

  updateProgress: (id, delta) => {
    const todayKey = getTodayKey();
    set((state) => {
      const newData = {
        ...state.data,
        progress: state.data.progress.map(item => {
          if (item.id !== id) return item;
          
          const isNewDay = item.lastUpdateDate !== todayKey;
          const baseTodayCount = isNewDay ? 0 : item.todayCount;
          const newTodayCount = Math.max(0, baseTodayCount + delta);
          
          let newCurrent = item.current;
          if (item.type === 'progress' && item.total) {
            newCurrent = Math.max(0, Math.min(item.total, item.current + delta));
          } else {
            newCurrent = item.current + delta;
          }
          
          const history = { ...item.history, [todayKey]: newTodayCount };
          
          return {
            ...item,
            current: newCurrent,
            todayCount: newTodayCount,
            lastUpdateDate: todayKey,
            history,
          };
        }),
      };
      persist(newData);
      return { data: newData };
    });
  },

  updateProgressItem: (id, updates) => {
    set((state) => {
      const newData = {
        ...state.data,
        progress: state.data.progress.map(item =>
          item.id === id ? { ...item, ...updates } : item
        ),
      };
      persist(newData);
      return { data: newData };
    });
  },

  deleteProgress: (id) => {
    set((state) => {
      const newData = {
        ...state.data,
        progress: state.data.progress.filter(p => p.id !== id),
      };
      persist(newData);
      return { data: newData };
    });
  },

  toggleProgressArchive: (id) => {
    set((state) => {
      const newData = {
        ...state.data,
        progress: state.data.progress.map(p =>
          p.id === id ? { ...p, archived: !p.archived } : p
        ),
      };
      persist(newData);
      return { data: newData };
    });
  },

  reorderProgress: (activeId, overId) => {
    set((state) => {
      const oldIndex = state.data.progress.findIndex(p => p.id === activeId);
      const newIndex = state.data.progress.findIndex(p => p.id === overId);
      if (oldIndex === -1 || newIndex === -1) return state;
      
      const newProgress = [...state.data.progress];
      const [removed] = newProgress.splice(oldIndex, 1);
      newProgress.splice(newIndex, 0, removed);
      
      const newData = { ...state.data, progress: newProgress };
      persist(newData);
      return { data: newData };
    });
  },

  // ========== Settings Actions ==========

  setTimezone: (tz) => {
    set((state) => {
      const newData = {
        ...state.data,
        settings: { ...state.data.settings, timezone: Math.max(-12, Math.min(14, tz)) },
      };
      persist(newData);
      return { data: newData };
    });
  },

  setViewMode: (mode) => {
    set((state) => {
      const newData = {
        ...state.data,
        settings: { ...state.data.settings, viewMode: mode },
      };
      persist(newData);
      return { data: newData };
    });
  },

  setDayCount: (count) => {
    set((state) => {
      const newData = {
        ...state.data,
        settings: { ...state.data.settings, dayCount: Math.max(1, Math.min(14, count)) },
      };
      persist(newData);
      return { data: newData };
    });
  },

  setHourHeight: (height) => {
    // 限制范围：32px - 800px（最大可以让一个小时占满屏幕）
    const clampedHeight = Math.max(32, Math.min(800, height));
    set((state) => {
      const newData = {
        ...state.data,
        settings: { ...state.data.settings, hourHeight: clampedHeight },
      };
      persist(newData);
      return { data: newData };
    });
  },

  toggleSidebar: () => set((state) => ({ showSidebar: !state.showSidebar })),
  toggleContextPanel: () => set((state) => ({ showContextPanel: !state.showContextPanel })),
  setSelectedDate: (date) => set({ selectedDate: date }),
  
  // Undo last action
  undo: () => {
    set((state) => {
      if (state.undoStack.length === 0) return state;
      
      const lastAction = state.undoStack[state.undoStack.length - 1];
      const newUndoStack = state.undoStack.slice(0, -1);
      
      if (lastAction.type === 'deleteTask') {
        // 恢复删除的事项
        const newData = {
          ...state.data,
          tasks: [...state.data.tasks, lastAction.task],
        };
        persist(newData);
        return { data: newData, undoStack: newUndoStack };
      }
      
      return { undoStack: newUndoStack };
    });
  },
}));

// Re-export for convenience
export { useUnifiedStore as useStore };
