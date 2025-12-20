/**
 * Settings Actions - 设置相关操作
 */

import type { UnifiedData } from '@/lib/storage/unifiedStorage';
import type { ViewMode } from '../types';

type SetState = (fn: (state: { 
  data: UnifiedData; 
  showSidebar: boolean;
  showContextPanel: boolean;
  selectedDate: Date;
}) => Partial<{ 
  data: UnifiedData; 
  showSidebar: boolean;
  showContextPanel: boolean;
  selectedDate: Date;
}>) => void;

type Persist = (data: UnifiedData) => void;

export function createSettingsActions(set: SetState, persist: Persist) {
  return {
    setTimezone: (tz: number) => {
      set((state) => {
        const newData = {
          ...state.data,
          settings: { ...state.data.settings, timezone: Math.max(-12, Math.min(14, tz)) },
        };
        persist(newData);
        return { data: newData };
      });
    },

    setViewMode: (mode: ViewMode) => {
      set((state) => {
        const newData = {
          ...state.data,
          settings: { ...state.data.settings, viewMode: mode },
        };
        persist(newData);
        return { data: newData };
      });
    },

    setDayCount: (count: number) => {
      set((state) => {
        const newData = {
          ...state.data,
          settings: { ...state.data.settings, dayCount: Math.max(1, Math.min(14, count)) },
        };
        persist(newData);
        return { data: newData };
      });
    },

    setHourHeight: (height: number) => {
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

    toggleSidebar: () => {
      set((state) => ({ showSidebar: !state.showSidebar }));
    },

    toggleContextPanel: () => {
      set((state) => ({ showContextPanel: !state.showContextPanel }));
    },

    setSelectedDate: (date: Date) => {
      set(() => ({ selectedDate: date }));
    },
    
    toggle24Hour: () => {
      set((state) => {
        const newData = {
          ...state.data,
          settings: { ...state.data.settings, use24Hour: !state.data.settings.use24Hour },
        };
        persist(newData);
        return { data: newData };
      });
    },
  };
}
