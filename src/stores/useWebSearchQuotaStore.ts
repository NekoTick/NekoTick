import { create } from 'zustand';

interface WebSearchQuotaState {
  exhausted: boolean;
  markExhausted: () => void;
  clearExhausted: () => void;
}

export const useWebSearchQuotaStore = create<WebSearchQuotaState>((set) => ({
  exhausted: false,
  markExhausted: () => set({ exhausted: true }),
  clearExhausted: () => set({ exhausted: false }),
}));

export function markWebSearchQuotaExhausted(): void {
  useWebSearchQuotaStore.getState().markExhausted();
}

export function clearWebSearchQuotaExhausted(): void {
  useWebSearchQuotaStore.getState().clearExhausted();
}
