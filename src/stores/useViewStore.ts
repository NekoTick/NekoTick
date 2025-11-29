import { create } from 'zustand';

type ViewType = 'tasks' | 'time-tracker';

interface ViewStore {
  currentView: ViewType;
  setView: (view: ViewType) => void;
}

export const useViewStore = create<ViewStore>((set) => ({
  currentView: 'tasks',
  setView: (view) => set({ currentView: view }),
}));
