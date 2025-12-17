/**
 * Unified Store - Single source of truth for all app data
 * 
 * Manages: Tasks, Groups, Calendar Events, Progress items
 * Persists to: nekotick.md + .nekotick/data.json
 */

import { create } from 'zustand';
import { nanoid } from 'nanoid';
import {
  loadUnifiedData,
  saveUnifiedData,
  type UnifiedData,
  type UnifiedTask,
  type UnifiedGroup,
  type UnifiedEvent,
  type UnifiedProgress,
  type UnifiedArchiveSection,
} from '@/lib/storage/unifiedStorage';

// Re-export types
export type {
  UnifiedTask,
  UnifiedGroup,
  UnifiedEvent,
  UnifiedProgress,
  UnifiedArchiveSection,
};

// Priority type
export type Priority = 'red' | 'yellow' | 'purple' | 'green' | 'default';

// View mode type
export type ViewMode = 'day' | 'week' | 'month';

interface UnifiedStore {
  // Data
  data: UnifiedData;
  loaded: boolean;
  
  // UI State (not persisted)
  activeGroupId: string;
  editingEventId: string | null;
  showSidebar: boolean;
  showContextPanel: boolean;
  selectedDate: Date;
  
  // Core Actions
  load: () => Promise<void>;
  
  // Group Actions
  addGroup: (name: string) => void;
  updateGroup: (id: string, name: string) => void;
  deleteGroup: (id: string) => void;
  toggleGroupPin: (id: string) => void;
  setActiveGroup: (id: string) => void;
  reorderGroups: (activeId: string, overId: string) => void;
  
  // Task Actions
  addTask: (content: string, groupId: string, priority?: Priority) => void;
  addSubTask: (parentId: string, content: string) => void;
  updateTask: (id: string, content: string) => void;
  updateTaskSchedule: (id: string, scheduledTime?: string) => void;
  updateTaskPriority: (id: string, priority: Priority) => void;
  updateTaskEstimation: (id: string, estimatedMinutes?: number) => void;
  updateTaskParent: (id: string, parentId: string | null, order: number) => void;
  toggleTask: (id: string) => void;
  toggleTaskCollapse: (id: string) => void;
  deleteTask: (id: string) => void;
  deleteCompletedTasks: (groupId: string) => void;
  reorderTasks: (activeId: string, overId: string) => void;
  moveTaskToGroup: (taskId: string, targetGroupId: string, overTaskId?: string | null) => void;
  archiveCompletedTasks: (groupId: string) => void;
  
  // Event Actions
  addEvent: (event: Omit<UnifiedEvent, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateEvent: (id: string, updates: Partial<UnifiedEvent>) => void;
  deleteEvent: (id: string) => void;
  setEditingEventId: (id: string | null) => void;
  closeEditingEvent: () => void;
  
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
    events: [],
    progress: [],
    archive: [],
    settings: { timezone: 8, viewMode: 'week', dayCount: 1 },
  },
  loaded: false,
  activeGroupId: 'default',
  editingEventId: null,
  showSidebar: true,
  showContextPanel: true,
  selectedDate: new Date(),

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

  addTask: (content, groupId, priority = 'default') => {
    const groupTasks = get().data.tasks.filter(t => t.groupId === groupId && !t.parentId);
    const newTask: UnifiedTask = {
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

  updateTaskSchedule: (id, scheduledTime) => {
    set((state) => {
      const newData = {
        ...state.data,
        tasks: state.data.tasks.map(t =>
          t.id === id ? { ...t, scheduledTime } : t
        ),
      };
      persist(newData);
      return { data: newData };
    });
  },

  updateTaskPriority: (id, priority) => {
    set((state) => {
      const newData = {
        ...state.data,
        tasks: state.data.tasks.map(t =>
          t.id === id ? { ...t, priority } : t
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
          priority: t.priority,
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

  // ========== Event Actions ==========

  addEvent: (eventData) => {
    const newEvent: UnifiedEvent = {
      id: nanoid(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...eventData,
    };
    set((state) => {
      const newData = {
        ...state.data,
        events: [...state.data.events, newEvent],
      };
      persist(newData);
      return { data: newData };
    });
    return newEvent.id;
  },

  updateEvent: (id, updates) => {
    set((state) => {
      const newData = {
        ...state.data,
        events: state.data.events.map(e =>
          e.id === id ? { ...e, ...updates, updatedAt: Date.now() } : e
        ),
      };
      persist(newData);
      return { data: newData };
    });
  },

  deleteEvent: (id) => {
    set((state) => {
      const newData = {
        ...state.data,
        events: state.data.events.filter(e => e.id !== id),
      };
      persist(newData);
      return { 
        data: newData,
        editingEventId: state.editingEventId === id ? null : state.editingEventId,
      };
    });
  },

  setEditingEventId: (id) => set({ editingEventId: id }),

  closeEditingEvent: () => {
    const { editingEventId, data } = get();
    if (editingEventId) {
      const event = data.events.find(e => e.id === editingEventId);
      if (event && !event.title.trim()) {
        // Delete empty event
        const newData = {
          ...data,
          events: data.events.filter(e => e.id !== editingEventId),
        };
        persist(newData);
        set({ data: newData, editingEventId: null });
      } else {
        set({ editingEventId: null });
      }
    }
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

  toggleSidebar: () => set((state) => ({ showSidebar: !state.showSidebar })),
  toggleContextPanel: () => set((state) => ({ showContextPanel: !state.showContextPanel })),
  setSelectedDate: (date) => set({ selectedDate: date }),
}));

// Re-export for convenience
export { useUnifiedStore as useStore };
