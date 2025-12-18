import { create } from 'zustand';
import type { StoreTask } from './types';

// Undo action type
type UndoAction = {
  type: 'delete-task';
  tasks: StoreTask[]; // Deleted tasks and their subtasks
  groupId: string;
};

interface UndoStore {
  // Undo stack, stores up to 20 operations
  history: UndoAction[];
  
  // Add an undoable operation
  pushUndo: (action: UndoAction) => void;
  
  // Pop the most recent operation (for undo)
  popUndo: () => UndoAction | null;
  
  // Clear history
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
