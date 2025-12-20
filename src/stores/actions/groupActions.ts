/**
 * Group Actions - 分组相关操作
 */

import { nanoid } from 'nanoid';
import type { UnifiedData, UnifiedGroup } from '@/lib/storage/unifiedStorage';

type SetState = (fn: (state: { data: UnifiedData }) => Partial<{ data: UnifiedData; activeGroupId: string }>) => void;
type GetState = () => { data: UnifiedData; activeGroupId: string };
type Persist = (data: UnifiedData) => void;

export function createGroupActions(set: SetState, get: GetState, persist: Persist) {
  return {
    addGroup: (name: string) => {
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

    updateGroup: (id: string, name: string) => {
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

    deleteGroup: (id: string) => {
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
          activeGroupId: get().activeGroupId === id ? 'default' : get().activeGroupId,
        };
      });
    },

    toggleGroupPin: (id: string) => {
      set((state) => {
        const newGroups = state.data.groups.map(g =>
          g.id === id ? { ...g, pinned: !g.pinned } : g
        );
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

    reorderGroups: (activeId: string, overId: string) => {
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
  };
}
