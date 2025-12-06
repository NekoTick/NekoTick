import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { loadProgress, saveProgress, type ProgressData } from '@/lib/storage';

export interface ProgressItem {
  id: string;
  type: 'progress';
  title: string;
  icon?: string;
  direction: 'increment' | 'decrement';
  total: number;
  step: number;
  unit: string;
  current: number;
  todayCount: number;
  lastUpdateDate?: string;
  history?: Record<string, number>; // { "2025-12-05": 3, ... } 每天操作次数
  startDate?: number;
  endDate?: number;
  createdAt: number;
}

export interface CounterItem {
  id: string;
  type: 'counter';
  title: string;
  icon?: string;
  step: number;
  unit: string;
  current: number;
  todayCount: number;
  lastUpdateDate?: string;
  history?: Record<string, number>; // { "2025-12-05": 3, ... } 每天操作次数
  frequency: 'daily' | 'weekly' | 'monthly';
  createdAt: number;
}

export type ProgressOrCounter = ProgressItem | CounterItem;

interface ProgressStore {
  items: ProgressOrCounter[];
  loaded: boolean;
  
  loadItems: () => Promise<void>;
  addProgress: (data: Omit<ProgressItem, 'id' | 'type' | 'current' | 'todayCount' | 'createdAt'>) => void;
  addCounter: (data: { title: string; icon?: string; step: number; unit: string; frequency: 'daily' | 'weekly' | 'monthly' }) => void;
  updateCurrent: (id: string, delta: number) => void;
  deleteItem: (id: string) => void;
  updateItem: (id: string, data: Partial<ProgressOrCounter>) => void;
  reorderItems: (activeId: string, overId: string) => void;
}

// 转换存储格式到 store 格式
function fromStorageFormat(data: ProgressData): ProgressOrCounter {
  if (data.type === 'progress') {
    return {
      id: data.id,
      type: 'progress',
      title: data.title,
      icon: data.icon,
      direction: data.direction || 'increment',
      total: data.total || 100,
      step: data.step,
      unit: data.unit,
      current: data.current,
      todayCount: data.todayCount,
      lastUpdateDate: data.lastUpdateDate,
      history: data.history,
      startDate: data.startDate,
      endDate: data.endDate,
      createdAt: data.createdAt,
    };
  } else {
    return {
      id: data.id,
      type: 'counter',
      title: data.title,
      icon: data.icon,
      step: data.step,
      unit: data.unit,
      current: data.current,
      todayCount: data.todayCount,
      lastUpdateDate: data.lastUpdateDate,
      history: data.history,
      frequency: data.frequency || 'daily',
      createdAt: data.createdAt,
    };
  }
}

// 转换 store 格式到存储格式
function toStorageFormat(item: ProgressOrCounter): ProgressData {
  if (item.type === 'progress') {
    return {
      id: item.id,
      type: 'progress',
      title: item.title,
      icon: item.icon,
      direction: item.direction,
      total: item.total,
      step: item.step,
      unit: item.unit,
      current: item.current,
      todayCount: item.todayCount,
      lastUpdateDate: item.lastUpdateDate,
      history: item.history,
      startDate: item.startDate,
      endDate: item.endDate,
      createdAt: item.createdAt,
    };
  } else {
    return {
      id: item.id,
      type: 'counter',
      title: item.title,
      icon: item.icon,
      step: item.step,
      unit: item.unit,
      current: item.current,
      todayCount: item.todayCount,
      lastUpdateDate: item.lastUpdateDate,
      history: item.history,
      frequency: item.frequency,
      createdAt: item.createdAt,
    };
  }
}

// 保存到文件
async function persistItems(items: ProgressOrCounter[]) {
  await saveProgress(items.map(toStorageFormat));
}

export const useProgressStore = create<ProgressStore>((set, get) => ({
  items: [],
  loaded: false,
  
  loadItems: async () => {
    if (get().loaded) return;
    const data = await loadProgress();
    set({ items: data.map(fromStorageFormat), loaded: true });
  },
  
  addProgress: (data) => set((state) => {
    const newItem: ProgressItem = {
      id: nanoid(),
      type: 'progress',
      title: data.title,
      icon: data.icon,
      direction: data.direction,
      total: data.total,
      step: data.step,
      unit: data.unit,
      current: data.direction === 'increment' ? 0 : data.total,
      todayCount: 0,
      lastUpdateDate: undefined,
      startDate: data.startDate,
      endDate: data.endDate,
      createdAt: Date.now(),
    };
    const newItems = [...state.items, newItem];
    persistItems(newItems);
    return { items: newItems };
  }),
  
  addCounter: (data) => set((state) => {
    const newItem: CounterItem = {
      id: nanoid(),
      type: 'counter',
      title: data.title,
      icon: data.icon,
      step: data.step,
      unit: data.unit,
      current: 0,
      todayCount: 0,
      lastUpdateDate: undefined,
      frequency: data.frequency,
      createdAt: Date.now(),
    };
    const newItems = [...state.items, newItem];
    persistItems(newItems);
    return { items: newItems };
  }),
  
  updateCurrent: (id, delta) => set((state) => {
    const today = new Date().toDateString();
    const todayKey = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 格式
    const newItems = state.items.map((item): ProgressOrCounter => {
      if (item.id !== id) return item;
      
      const isNewDay = item.lastUpdateDate !== today;
      // Allow decreasing todayCount if delta is negative, but clamp at 0
      const newTodayCount = isNewDay 
        ? Math.max(0, delta) 
        : Math.max(0, item.todayCount + delta); // Use delta directly, not Math.abs(delta) // 记录操作次数，不是变化量
      
      // 更新历史记录（操作次数）
      const history = { ...item.history };
      history[todayKey] = (history[todayKey] || 0) + 1;
      
      if (item.type === 'progress') {
        const newCurrent = Math.max(0, Math.min(item.total, item.current + delta));
        return { ...item, current: newCurrent, todayCount: newTodayCount, lastUpdateDate: today, history };
      } else {
        return { ...item, current: item.current + delta, todayCount: newTodayCount, lastUpdateDate: today, history };
      }
    });
    persistItems(newItems);
    return { items: newItems };
  }),
  
  deleteItem: (id) => set((state) => {
    const newItems = state.items.filter((item) => item.id !== id);
    persistItems(newItems);
    return { items: newItems };
  }),
  
  updateItem: (id, data) => set((state) => {
    const newItems = state.items.map((item): ProgressOrCounter => {
      if (item.id !== id) return item;
      return { ...item, ...data } as ProgressOrCounter;
    });
    persistItems(newItems);
    return { items: newItems };
  }),
  
  reorderItems: (activeId, overId) => set((state) => {
    const oldIndex = state.items.findIndex((item) => item.id === activeId);
    const newIndex = state.items.findIndex((item) => item.id === overId);
    
    if (oldIndex === -1 || newIndex === -1) return state;
    
    const newItems = [...state.items];
    const [removed] = newItems.splice(oldIndex, 1);
    newItems.splice(newIndex, 0, removed);
    
    persistItems(newItems);
    return { items: newItems };
  }),
}));
