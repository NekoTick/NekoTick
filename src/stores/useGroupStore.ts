import { create } from 'zustand';
import { nanoid } from 'nanoid';

export interface Group {
  id: string;
  name: string;
  color?: string;
  createdAt: number;
  pinned?: boolean;
}

interface GroupStore {
  groups: Group[];
  activeGroupId: string | null;
  drawerOpen: boolean;
  
  setDrawerOpen: (open: boolean) => void;
  toggleDrawer: () => void;
  setActiveGroup: (id: string | null) => void;
  addGroup: (name: string) => void;
  updateGroup: (id: string, name: string) => void;
  deleteGroup: (id: string) => void;
  togglePin: (id: string) => void;
  reorderGroups: (activeId: string, overId: string) => void;
}

// 默认分组
const defaultGroups: Group[] = [
  { id: 'default', name: '默认', createdAt: 0 },
];

export const useGroupStore = create<GroupStore>((set) => ({
  groups: defaultGroups,
  activeGroupId: 'default',
  drawerOpen: false,

  setDrawerOpen: (open) => set({ drawerOpen: open }),
  toggleDrawer: () => set((state) => ({ drawerOpen: !state.drawerOpen })),
  
  setActiveGroup: (id) => set({ activeGroupId: id }),
  
  addGroup: (name) => set((state) => ({
    groups: [
      ...state.groups,
      {
        id: nanoid(),
        name,
        createdAt: Date.now(),
      },
    ],
  })),
  
  updateGroup: (id, name) => set((state) => ({
    groups: state.groups.map((g) =>
      g.id === id ? { ...g, name } : g
    ),
  })),
  
  deleteGroup: (id) => set((state) => {
    if (id === 'default') return state; // 不能删除默认分组
    return {
      groups: state.groups.filter((g) => g.id !== id),
      activeGroupId: state.activeGroupId === id ? 'default' : state.activeGroupId,
    };
  }),
  
  togglePin: (id) => set((state) => {
    const group = state.groups.find(g => g.id === id);
    if (!group) return state;
    
    const newPinned = !group.pinned;
    const updatedGroup = { ...group, pinned: newPinned };
    const otherGroups = state.groups.filter(g => g.id !== id);
    
    // 置顶时移到最前面，取消置顶时移到已置顶分组后面
    if (newPinned) {
      return { groups: [updatedGroup, ...otherGroups] };
    } else {
      const pinnedGroups = otherGroups.filter(g => g.pinned);
      const unpinnedGroups = otherGroups.filter(g => !g.pinned);
      return { groups: [...pinnedGroups, updatedGroup, ...unpinnedGroups] };
    }
  }),
  
  reorderGroups: (activeId, overId) => set((state) => {
    const oldIndex = state.groups.findIndex((g) => g.id === activeId);
    const newIndex = state.groups.findIndex((g) => g.id === overId);
    
    if (oldIndex === -1 || newIndex === -1) return state;
    
    const newGroups = [...state.groups];
    const [removed] = newGroups.splice(oldIndex, 1);
    newGroups.splice(newIndex, 0, removed);
    
    return { groups: newGroups };
  }),
}));
