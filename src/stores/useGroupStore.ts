import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { loadGroups, saveGroup, deleteGroup as deleteGroupFile, type GroupData } from '@/lib/storage';

export interface Group {
  id: string;
  name: string;
  color?: string;
  createdAt: number;
  pinned?: boolean;
}

export interface Task {
  id: string;
  content: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  scheduledTime?: string;
  order: number;
  groupId: string;
}

interface GroupStore {
  groups: Group[];
  tasks: Task[];
  activeGroupId: string | null;
  drawerOpen: boolean;
  loaded: boolean;
  
  // Drag state for cross-group drag
  draggingTaskId: string | null;
  setDraggingTaskId: (id: string | null) => void;
  
  loadData: () => Promise<void>;
  setDrawerOpen: (open: boolean) => void;
  toggleDrawer: () => void;
  setActiveGroup: (id: string | null) => void;
  addGroup: (name: string) => void;
  updateGroup: (id: string, name: string) => void;
  deleteGroup: (id: string) => void;
  togglePin: (id: string) => void;
  reorderGroups: (activeId: string, overId: string) => void;
  
  // Task operations
  addTask: (content: string, groupId: string) => void;
  updateTask: (id: string, content: string) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  reorderTasks: (activeId: string, overId: string) => void;
  moveTaskToGroup: (taskId: string, targetGroupId: string) => void;
}

// 保存分组到文件
async function persistGroup(groups: Group[], tasks: Task[], groupId: string) {
  const group = groups.find(g => g.id === groupId);
  if (!group) return;
  
  const groupTasks = tasks.filter(t => t.groupId === groupId);
  const groupData: GroupData = {
    id: group.id,
    name: group.name,
    pinned: group.pinned || false,
    tasks: groupTasks.map(t => ({
      id: t.id,
      content: t.content,
      completed: t.completed,
      createdAt: t.createdAt,
      completedAt: t.completedAt,
      scheduledTime: t.scheduledTime,
      order: t.order,
    })),
    createdAt: group.createdAt,
    updatedAt: Date.now(),
  };
  
  await saveGroup(groupData);
}

export const useGroupStore = create<GroupStore>((set, get) => ({
  groups: [],
  tasks: [],
  activeGroupId: 'default',
  drawerOpen: false,
  loaded: false,
  draggingTaskId: null,
  
  setDraggingTaskId: (id) => set({ draggingTaskId: id }),

  loadData: async () => {
    if (get().loaded) return;
    
    const groupsData = await loadGroups();
    const groups: Group[] = [];
    const tasks: Task[] = [];
    
    for (const gd of groupsData) {
      groups.push({
        id: gd.id,
        name: gd.name,
        pinned: gd.pinned,
        createdAt: gd.createdAt,
      });
      
      for (const td of gd.tasks) {
        tasks.push({
          id: td.id,
          content: td.content,
          completed: td.completed,
          createdAt: td.createdAt,
          completedAt: td.completedAt,
          scheduledTime: td.scheduledTime,
          order: td.order,
          groupId: gd.id,
        });
      }
    }
    
    // 按置顶排序
    groups.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    });
    
    set({ groups, tasks, loaded: true });
  },

  setDrawerOpen: (open) => set({ drawerOpen: open }),
  toggleDrawer: () => set((state) => ({ drawerOpen: !state.drawerOpen })),
  
  setActiveGroup: (id) => set({ activeGroupId: id }),
  
  addGroup: (name) => {
    const newGroup: Group = {
      id: nanoid(),
      name,
      createdAt: Date.now(),
    };
    
    set((state) => {
      const newGroups = [...state.groups, newGroup];
      persistGroup(newGroups, state.tasks, newGroup.id);
      return { groups: newGroups };
    });
  },
  
  updateGroup: (id, name) => set((state) => {
    const newGroups = state.groups.map((g) =>
      g.id === id ? { ...g, name } : g
    );
    persistGroup(newGroups, state.tasks, id);
    return { groups: newGroups };
  }),
  
  deleteGroup: (id) => set((state) => {
    if (id === 'default') return state;
    deleteGroupFile(id);
    return {
      groups: state.groups.filter((g) => g.id !== id),
      tasks: state.tasks.filter((t) => t.groupId !== id),
      activeGroupId: state.activeGroupId === id ? 'default' : state.activeGroupId,
    };
  }),
  
  togglePin: (id) => set((state) => {
    const group = state.groups.find(g => g.id === id);
    if (!group) return state;
    
    const newPinned = !group.pinned;
    const updatedGroup = { ...group, pinned: newPinned };
    const otherGroups = state.groups.filter(g => g.id !== id);
    
    let newGroups: Group[];
    if (newPinned) {
      newGroups = [updatedGroup, ...otherGroups];
    } else {
      const pinnedGroups = otherGroups.filter(g => g.pinned);
      const unpinnedGroups = otherGroups.filter(g => !g.pinned);
      newGroups = [...pinnedGroups, updatedGroup, ...unpinnedGroups];
    }
    
    persistGroup(newGroups, state.tasks, id);
    return { groups: newGroups };
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
  
  // 任务操作
  addTask: (content, groupId) => set((state) => {
    const groupTasks = state.tasks.filter(t => t.groupId === groupId);
    const newTask: Task = {
      id: nanoid(),
      content,
      completed: false,
      createdAt: Date.now(),
      order: groupTasks.length,
      groupId,
    };
    
    const newTasks = [...state.tasks, newTask];
    persistGroup(state.groups, newTasks, groupId);
    return { tasks: newTasks };
  }),
  
  updateTask: (id, content) => set((state) => {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return state;
    
    const newTasks = state.tasks.map(t =>
      t.id === id ? { ...t, content } : t
    );
    persistGroup(state.groups, newTasks, task.groupId);
    return { tasks: newTasks };
  }),
  
  toggleTask: (id) => set((state) => {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return state;
    
    const newTasks = state.tasks.map(t =>
      t.id === id ? { 
        ...t, 
        completed: !t.completed,
        completedAt: !t.completed ? Date.now() : undefined,
      } : t
    );
    persistGroup(state.groups, newTasks, task.groupId);
    return { tasks: newTasks };
  }),
  
  deleteTask: (id) => set((state) => {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return state;
    
    const newTasks = state.tasks.filter(t => t.id !== id);
    persistGroup(state.groups, newTasks, task.groupId);
    return { tasks: newTasks };
  }),
  
  reorderTasks: (activeId, overId) => set((state) => {
    const activeTask = state.tasks.find(t => t.id === activeId);
    if (!activeTask) return state;
    
    const groupTasks = state.tasks.filter(t => t.groupId === activeTask.groupId);
    const oldIndex = groupTasks.findIndex(t => t.id === activeId);
    const newIndex = groupTasks.findIndex(t => t.id === overId);
    
    if (oldIndex === -1 || newIndex === -1) return state;
    
    const reordered = [...groupTasks];
    const [removed] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, removed);
    
    // Update order
    reordered.forEach((t, i) => t.order = i);
    
    const otherTasks = state.tasks.filter(t => t.groupId !== activeTask.groupId);
    const newTasks = [...otherTasks, ...reordered];
    
    persistGroup(state.groups, newTasks, activeTask.groupId);
    return { tasks: newTasks };
  }),
  
  moveTaskToGroup: (taskId, targetGroupId) => set((state) => {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task || task.groupId === targetGroupId) return state;
    
    const oldGroupId = task.groupId;
    const targetGroupTasks = state.tasks.filter(t => t.groupId === targetGroupId);
    
    // Move task to new group at the end
    const newTasks = state.tasks.map(t => 
      t.id === taskId 
        ? { ...t, groupId: targetGroupId, order: targetGroupTasks.length }
        : t
    );
    
    // Persist both groups
    persistGroup(state.groups, newTasks, oldGroupId);
    persistGroup(state.groups, newTasks, targetGroupId);
    
    return { tasks: newTasks, activeGroupId: targetGroupId };
  }),
}));
