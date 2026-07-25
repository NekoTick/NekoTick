interface PendingEditorFocusIntent {
  expiresAt: number;
  path: string;
}

const EDITOR_FOCUS_INTENT_TTL_MS = 3_000;
const listeners = new Set<(path: string) => void>();
let pendingIntent: PendingEditorFocusIntent | null = null;

export function requestEditorFocus(path: string): void {
  pendingIntent = {
    expiresAt: Date.now() + EDITOR_FOCUS_INTENT_TTL_MS,
    path,
  };
  listeners.forEach((listener) => listener(path));
}

export function fulfillEditorFocusIntent(path: string, focus: () => boolean): boolean {
  if (!pendingIntent || pendingIntent.path !== path) return false;
  if (pendingIntent.expiresAt <= Date.now()) {
    pendingIntent = null;
    return false;
  }
  if (!focus()) return false;
  pendingIntent = null;
  return true;
}

export function subscribeEditorFocusIntent(listener: (path: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearEditorFocusIntent(): void {
  pendingIntent = null;
}
