import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { Task, TaskInput } from '@/types';
import { localStorageRepo } from '@/services/storage';
import { useGroupStore } from './useGroupStore';

interface TaskState {
  tasks: Task[];
  isLoading: boolean;
  isInitialized: boolean;
  selectedTaskId: string | null;
  
  // Actions
  loadTasks: () => Promise<void>;
  addTask: (input: TaskInput) => void;
  toggleTask: (id: string) => void;
  updateTaskContent: (id: string, content: string) => void;
  updateTaskTime: (id: string, estimatedMinutes?: number, actualMinutes?: number) => void;
  deleteTask: (id: string) => void;
  reorderTasks: (activeId: string, overId: string) => void;
  
  // VIM Navigation
  selectTask: (id: string | null) => void;
  selectNextTask: () => void;
  selectPrevTask: () => void;
  toggleSelectedTask: () => void;
}

export const useTaskStore = create<TaskState>()(
  subscribeWithSelector((set, get) => ({
    tasks: [],
    isLoading: false,
    isInitialized: false,
    selectedTaskId: null,

    loadTasks: async () => {
      if (get().isInitialized) return;
      
      set({ isLoading: true });
      try {
        const tasks = await localStorageRepo.getTasks();
        set({ tasks, isInitialized: true });
      } catch (error) {
        console.error('Failed to load tasks:', error);
      } finally {
        set({ isLoading: false });
      }
    },

    addTask: (input) => {
      const activeGroupId = useGroupStore.getState().activeGroupId || 'inbox';
      const newTask: Task = {
        id: nanoid(),
        content: input.content,
        isDone: false,
        createdAt: Date.now(),
        tags: input.tags,
        groupId: activeGroupId,
      };
      set((state) => ({ 
        tasks: [...state.tasks, newTask] 
      }));
    },

    toggleTask: (id) => {
      set((state) => ({
        tasks: state.tasks.map((task) => {
          if (task.id !== id) return task;
          
          const newIsDone = !task.isDone;
          return {
            ...task,
            isDone: newIsDone,
            // Auto-set completedAt when marking done
            completedAt: newIsDone 
              ? new Date().toISOString().split('T')[0] // YYYY-MM-DD
              : undefined,
          };
        }),
      }));
    },

    updateTaskContent: (id, content) => {
      set((state) => ({
        tasks: state.tasks.map((task) =>
          task.id === id ? { ...task, content } : task
        ),
      }));
    },

    updateTaskTime: (id, estimatedMinutes, actualMinutes) => {
      set((state) => ({
        tasks: state.tasks.map((task) =>
          task.id === id 
            ? { 
                ...task, 
                estimatedMinutes: estimatedMinutes ?? task.estimatedMinutes,
                actualMinutes: actualMinutes ?? task.actualMinutes,
              } 
            : task
        ),
      }));
    },

    deleteTask: (id) => {
      set((state) => ({
        tasks: state.tasks.filter((task) => task.id !== id),
      }));
    },

    reorderTasks: (activeId, overId) => {
      set((state) => {
        const oldIndex = state.tasks.findIndex((t) => t.id === activeId);
        const newIndex = state.tasks.findIndex((t) => t.id === overId);
        
        if (oldIndex === -1 || newIndex === -1) return state;
        
        const newTasks = [...state.tasks];
        const [removed] = newTasks.splice(oldIndex, 1);
        newTasks.splice(newIndex, 0, removed);
        
        return { tasks: newTasks };
      });
    },

    // VIM Navigation Actions
    selectTask: (id) => {
      set({ selectedTaskId: id });
    },

    selectNextTask: () => {
      const { tasks, selectedTaskId } = get();
      if (tasks.length === 0) return;

      if (!selectedTaskId) {
        // Select first task
        set({ selectedTaskId: tasks[0].id });
        return;
      }

      const currentIndex = tasks.findIndex((t) => t.id === selectedTaskId);
      const nextIndex = Math.min(currentIndex + 1, tasks.length - 1);
      set({ selectedTaskId: tasks[nextIndex].id });
    },

    selectPrevTask: () => {
      const { tasks, selectedTaskId } = get();
      if (tasks.length === 0) return;

      if (!selectedTaskId) {
        // Select last task
        set({ selectedTaskId: tasks[tasks.length - 1].id });
        return;
      }

      const currentIndex = tasks.findIndex((t) => t.id === selectedTaskId);
      const prevIndex = Math.max(currentIndex - 1, 0);
      set({ selectedTaskId: tasks[prevIndex].id });
    },

    toggleSelectedTask: () => {
      const { selectedTaskId, toggleTask } = get();
      if (selectedTaskId) {
        toggleTask(selectedTaskId);
      }
    },
  }))
);

// Auto-save: Subscribe to task changes and persist
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

useTaskStore.subscribe(
  (state) => state.tasks,
  (tasks, prevTasks) => {
    // Skip if not initialized or no changes
    if (!useTaskStore.getState().isInitialized) return;
    if (tasks === prevTasks) return;

    // Debounce saves (300ms)
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      try {
        await localStorageRepo.saveTasks(tasks);
        console.log('Tasks saved to disk');
      } catch (error) {
        console.error('Failed to save tasks:', error);
      }
    }, 300);
  }
);
