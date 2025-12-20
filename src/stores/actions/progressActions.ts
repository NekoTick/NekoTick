/**
 * Progress Actions - 进度相关操作
 */

import { nanoid } from 'nanoid';
import type { UnifiedData, UnifiedProgress } from '@/lib/storage/unifiedStorage';

type SetState = (fn: (state: { data: UnifiedData }) => Partial<{ data: UnifiedData }>) => void;
type Persist = (data: UnifiedData) => void;

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function createProgressActions(set: SetState, persist: Persist) {
  return {
    addProgress: (item: Omit<UnifiedProgress, 'id' | 'createdAt' | 'current' | 'todayCount'>) => {
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

    updateProgress: (id: string, delta: number) => {
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

    updateProgressItem: (id: string, updates: Partial<UnifiedProgress>) => {
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

    deleteProgress: (id: string) => {
      set((state) => {
        const newData = {
          ...state.data,
          progress: state.data.progress.filter(p => p.id !== id),
        };
        persist(newData);
        return { data: newData };
      });
    },

    toggleProgressArchive: (id: string) => {
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

    reorderProgress: (activeId: string, overId: string) => {
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
  };
}
