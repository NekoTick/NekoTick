import { create } from 'zustand';
import type { StoreTask } from './types';

// 撤销操作类型
type UndoAction = {
  type: 'delete-task';
  tasks: StoreTask[]; // 被删除的任务及其子任务
  groupId: string;
};

interface UndoStore {
  // 撤销栈，最多保存 20 个操作
  history: UndoAction[];
  
  // 添加一个可撤销的操作
  pushUndo: (action: UndoAction) => void;
  
  // 弹出最近的操作（用于撤销）
  popUndo: () => UndoAction | null;
  
  // 清空历史
  clearHistory: () => void;
}

const MAX_HISTORY = 20;

export const useUndoStore = create<UndoStore>()((set, get) => ({
  history: [],
  
  pushUndo: (action) => set((state) => ({
    history: [...state.history.slice(-(MAX_HISTORY - 1)), action],
  })),
  
  popUndo: () => {
    const { history } = get();
    if (history.length === 0) return null;
    
    const action = history[history.length - 1];
    set({ history: history.slice(0, -1) });
    return action;
  },
  
  clearHistory: () => set({ history: [] }),
}));
