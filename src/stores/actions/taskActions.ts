/**
 * Task Actions - 任务相关操作
 */

import { nanoid } from 'nanoid';
import type { UnifiedData, UnifiedTask } from '@/lib/storage/unifiedStorage';
import type { ItemColor } from '../types';

type SetState = (fn: (state: { data: UnifiedData }) => Partial<{ data: UnifiedData }>) => void;
type GetState = () => { data: UnifiedData };
type Persist = (data: UnifiedData) => void;

export function createTaskActions(set: SetState, get: GetState, persist: Persist) {
  return {
    addTask: (content: string, groupId: string, color: ItemColor = 'default') => {
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

    addSubTask: (parentId: string, content: string) => {
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
        color: parent.color || 'default',
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

    updateTask: (id: string, content: string) => {
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

    updateTaskColor: (id: string, color: ItemColor) => {
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

    updateTaskEstimation: (id: string, estimatedMinutes?: number) => {
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

    updateTaskParent: (id: string, parentId: string | null, order: number) => {
      set((state) => {
        const task = state.data.tasks.find(t => t.id === id);
        if (!task) return state;
        
        const oldParentId = task.parentId;
        let newTasks = state.data.tasks.map(t =>
          t.id === id ? { ...t, parentId, order } : t
        );
        
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

    toggleTask: (id: string) => {
      set((state) => {
        const task = state.data.tasks.find(t => t.id === id);
        if (!task) return state;
        
        const isCompleting = !task.completed;
        const now = Date.now();
        
        // 如果是完成任务且正在计时，同时停止计时
        let actualMinutes = task.actualMinutes;
        if (isCompleting && (task.timerState === 'running' || task.timerState === 'paused')) {
          let totalMs = task.timerAccumulated || 0;
          if (task.timerState === 'running' && task.timerStartedAt) {
            totalMs += now - task.timerStartedAt;
          }
          actualMinutes = Math.round(totalMs / 60000);
        }
        
        const newData = {
          ...state.data,
          tasks: state.data.tasks.map(t =>
            t.id === id ? {
              ...t,
              completed: isCompleting,
              completedAt: isCompleting ? now : undefined,
              // 完成时停止计时
              timerState: isCompleting ? ('idle' as const) : t.timerState,
              timerStartedAt: isCompleting ? undefined : t.timerStartedAt,
              timerAccumulated: isCompleting ? undefined : t.timerAccumulated,
              actualMinutes: isCompleting ? actualMinutes : t.actualMinutes,
            } : t
          ),
        };
        persist(newData);
        return { data: newData };
      });
    },

    toggleTaskCollapse: (id: string) => {
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

    deleteTask: (id: string) => {
      set((state) => {
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

    deleteCompletedTasks: (groupId: string) => {
      set((state) => {
        const newData = {
          ...state.data,
          tasks: state.data.tasks.filter(t => t.groupId !== groupId || !t.completed),
        };
        persist(newData);
        return { data: newData };
      });
    },

    reorderTasks: (activeId: string, overId: string) => {
      set((state) => {
        const activeTask = state.data.tasks.find(t => t.id === activeId);
        const overTask = state.data.tasks.find(t => t.id === overId);
        if (!activeTask || !overTask) return state;
        if (activeTask.groupId !== overTask.groupId) return state;
        if (activeTask.parentId !== overTask.parentId) return state;
        
        const siblings = state.data.tasks
          .filter(t => t.groupId === activeTask.groupId && t.parentId === activeTask.parentId)
          .sort((a, b) => a.order - b.order);
        
        const oldIndex = siblings.findIndex(t => t.id === activeId);
        const newIndex = siblings.findIndex(t => t.id === overId);
        if (oldIndex === -1 || newIndex === -1) return state;
        
        const [removed] = siblings.splice(oldIndex, 1);
        siblings.splice(newIndex, 0, removed);
        
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

    moveTaskToGroup: (taskId: string, targetGroupId: string, overTaskId?: string | null) => {
      set((state) => {
        const task = state.data.tasks.find(t => t.id === taskId);
        if (!task) return state;
        
        const collectIds = (id: string): string[] => {
          const children = state.data.tasks.filter(t => t.parentId === id);
          return [id, ...children.flatMap(c => collectIds(c.id))];
        };
        const idsToMove = new Set(collectIds(taskId));
        
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

    archiveCompletedTasks: (groupId: string) => {
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
  };
}
