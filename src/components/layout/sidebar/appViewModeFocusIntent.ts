import type { AppViewMode } from '@/stores/uiSlice';

export type SwitchableAppViewMode = Extract<AppViewMode, 'notes' | 'chat' | 'whiteboard' | 'graph'>;

interface PendingAppViewModeFocusIntent {
  expiresAt: number;
  viewMode: SwitchableAppViewMode;
}

const APP_VIEW_MODE_FOCUS_INTENT_TTL_MS = 3_000;
const listeners = new Set<(viewMode: SwitchableAppViewMode) => void>();
let pendingIntent: PendingAppViewModeFocusIntent | null = null;

export function requestAppViewModeFocus(viewMode: SwitchableAppViewMode): void {
  pendingIntent = {
    expiresAt: Date.now() + APP_VIEW_MODE_FOCUS_INTENT_TTL_MS,
    viewMode,
  };
  listeners.forEach((listener) => listener(viewMode));
}

export function fulfillAppViewModeFocus(
  viewMode: SwitchableAppViewMode,
  focus: () => boolean,
): boolean {
  if (!pendingIntent || pendingIntent.viewMode !== viewMode) return false;
  if (pendingIntent.expiresAt <= Date.now()) {
    pendingIntent = null;
    return false;
  }
  if (!focus()) return false;
  pendingIntent = null;
  return true;
}

export function subscribeAppViewModeFocusIntent(
  listener: (viewMode: SwitchableAppViewMode) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearAppViewModeFocusIntent(): void {
  pendingIntent = null;
}
