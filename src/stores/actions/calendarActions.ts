/**
 * Calendar Actions - 日历事件相关操作
 * 
 * 注意：日历事件就是带有 startDate 的 UnifiedTask
 * 这里的操作本质上是对 tasks 数组中带时间属性的任务进行操作
 */

import { nanoid } from 'nanoid';
import type { UnifiedData, UnifiedTask } from '@/lib/storage/unifiedStorage';
import type { ItemColor } from '../types';

type UndoAction = {
  type: 'deleteTask';
  task: UnifiedTask;
};

type SetState = (fn: (state: { 
  data: UnifiedData; 
  editingEventId: string | null;
  selectedEventId: string | null;
  undoStack: UndoAction[];
}) => Partial<{ 
  data: UnifiedData; 
  editingEventId: string | null;
  editingEventPosition: { x: number; y: number } | null;
  selectedEventId: string | null;
  undoStack: UndoAction[];
}>) => void;

type GetState = () => { 
  data: UnifiedData; 
  editingEventId: string | null;
  undoStack: UndoAction[];
};

type Persist = (data: UnifiedData) => void;

export function createCalendarActions(set: SetState, get: GetState, persist: Persist) {
  return {
    updateTaskTime: (id: string, startDate?: number | null, endDate?: number | null, isAllDay?: boolean) => {
      set((state) => {
        const newData = {
          ...state.data,
          tasks: state.data.tasks.map(t => {
            if (t.id !== id) return t;
            
            // 使用 null 表示清除时间，undefined 表示保持不变
            const newStartDate = startDate === null ? undefined : (startDate !== undefined ? startDate : t.startDate);
            const newEndDate = endDate === null ? undefined : (endDate !== undefined ? endDate : t.endDate);
            
            return { 
              ...t, 
              startDate: newStartDate, 
              endDate: newEndDate,
              isAllDay: isAllDay ?? t.isAllDay,
            };
          }),
        };
        persist(newData);
        return { data: newData };
      });
    },

    setEditingEventId: (id: string | null, position?: { x: number; y: number }) => {
      set(() => ({ editingEventId: id, editingEventPosition: position || null }));
    },
    
    setSelectedEventId: (id: string | null) => {
      set(() => ({ selectedEventId: id }));
    },

    closeEditingEvent: () => {
      const { editingEventId, data } = get();
      if (editingEventId) {
        const task = data.tasks.find(t => t.id === editingEventId);
        if (task && !(task.content || '').trim()) {
          const newData = {
            ...data,
            tasks: data.tasks.filter(t => t.id !== editingEventId),
          };
          persist(newData);
          set(() => ({ data: newData, editingEventId: null, editingEventPosition: null }));
        } else {
          set(() => ({ editingEventId: null, editingEventPosition: null }));
        }
      }
    },

    // 添加带时间的任务（日历事件）
    addEvent: (eventData: { 
      content: string; 
      startDate: number; 
      endDate: number; 
      isAllDay: boolean; 
      color?: string;
      groupId?: string;
    }) => {
      const newTask: UnifiedTask = {
        id: nanoid(),
        content: eventData.content,
        completed: false,
        createdAt: Date.now(),
        order: 0,
        groupId: eventData.groupId || 'default',
        parentId: null,
        collapsed: false,
        color: (eventData.color as ItemColor) || 'default',
        startDate: eventData.startDate,
        endDate: eventData.endDate,
        isAllDay: eventData.isAllDay,
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

    // 更新任务（包括日历事件）
    updateEvent: (id: string, updates: Partial<UnifiedTask>) => {
      set((state) => {
        const newData = {
          ...state.data,
          tasks: state.data.tasks.map(t => {
            if (t.id !== id) return t;
            const newTask = { ...t };
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

    // 删除任务（包括日历事件）
    deleteEvent: (id: string) => {
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

    undo: () => {
      set((state) => {
        if (state.undoStack.length === 0) return state;
        
        const lastAction = state.undoStack[state.undoStack.length - 1];
        const newUndoStack = state.undoStack.slice(0, -1);
        
        if (lastAction.type === 'deleteTask') {
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
  };
}
