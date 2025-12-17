/**
 * Progress Store - Compatibility wrapper for UnifiedStore
 */

import { useUnifiedStore } from './useUnifiedStore';
import type { UnifiedProgress } from '@/lib/storage/unifiedStorage';

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
  history?: Record<string, number>;
  startDate?: number;
  endDate?: number;
  resetFrequency?: 'daily' | 'weekly' | 'monthly' | 'none';
  createdAt: number;
  archived?: boolean;
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
  history?: Record<string, number>;
  frequency: 'daily' | 'weekly' | 'monthly';
  resetFrequency?: 'daily' | 'weekly' | 'monthly' | 'none';
  createdAt: number;
  archived?: boolean;
}

export type ProgressOrCounter = ProgressItem | CounterItem;

// Convert UnifiedProgress to ProgressOrCounter
function toProgressOrCounter(item: UnifiedProgress): ProgressOrCounter {
  if (item.type === 'progress') {
    return {
      id: item.id,
      type: 'progress',
      title: item.title,
      icon: item.icon,
      direction: item.direction || 'increment',
      total: item.total || 100,
      step: item.step,
      unit: item.unit,
      current: item.current,
      todayCount: item.todayCount,
      lastUpdateDate: item.lastUpdateDate,
      history: item.history,
      resetFrequency: item.resetFrequency || 'none',
      createdAt: item.createdAt,
      archived: item.archived || false,
    };
  }
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
    frequency: item.frequency || 'daily',
    resetFrequency: item.resetFrequency || 'none',
    createdAt: item.createdAt,
    archived: item.archived || false,
  };
}

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useProgressStore() {
  const store = useUnifiedStore();
  
  return {
    items: store.data.progress.map(toProgressOrCounter),
    loaded: store.loaded,
    
    loadItems: store.load,
    
    addProgress: (data: Omit<ProgressItem, 'id' | 'type' | 'current' | 'todayCount' | 'createdAt'>) => {
      store.addProgress({
        type: 'progress',
        title: data.title,
        icon: data.icon,
        direction: data.direction,
        total: data.total,
        step: data.step,
        unit: data.unit,
        resetFrequency: data.resetFrequency || 'none',
      });
    },
    
    addCounter: (data: { title: string; icon?: string; step: number; unit: string; frequency: 'daily' | 'weekly' | 'monthly'; resetFrequency?: 'daily' | 'weekly' | 'monthly' | 'none' }) => {
      store.addProgress({
        type: 'counter',
        title: data.title,
        icon: data.icon,
        step: data.step,
        unit: data.unit,
        frequency: data.frequency,
        resetFrequency: data.resetFrequency || 'none',
      });
    },
    
    updateCurrent: store.updateProgress,
    deleteItem: store.deleteProgress,
    toggleArchive: store.toggleProgressArchive,
    updateItem: store.updateProgressItem,
    reorderItems: store.reorderProgress,
    
    validateDailyState: () => {
      const todayKey = getTodayKey();
      const items = store.data.progress;
      
      items.forEach(item => {
        if (item.resetFrequency === 'daily' && item.lastUpdateDate !== todayKey) {
          store.updateProgressItem(item.id, {
            current: 0,
            todayCount: 0,
            lastUpdateDate: todayKey,
          });
        }
      });
    },
  };
}

// For selector pattern compatibility
useProgressStore.getState = () => {
  const store = useUnifiedStore.getState();
  return {
    items: store.data.progress.map(toProgressOrCounter),
    loaded: store.loaded,
    validateDailyState: () => {
      const todayKey = getTodayKey();
      store.data.progress.forEach(item => {
        if (item.resetFrequency === 'daily' && item.lastUpdateDate !== todayKey) {
          store.updateProgressItem(item.id, {
            current: 0,
            todayCount: 0,
            lastUpdateDate: todayKey,
          });
        }
      });
    },
  };
};
