import { themeUiFeedbackTokens } from '@/styles/themeTokens';

export const DEFAULT_THEME_COMPATIBILITY_DECORATION_DEBOUNCE_MS =
  themeUiFeedbackTokens.editorThemeCompatibilityDecorationDebounceMs;

export function createThemeCompatibilityDecorationRebuildController({
  delayMs = DEFAULT_THEME_COMPATIBILITY_DECORATION_DEBOUNCE_MS,
  dispatchRebuild,
}: {
  delayMs?: number;
  dispatchRebuild: () => void;
}) {
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  const clearPendingTimer = () => {
    if (pendingTimer === null) {
      return;
    }
    clearTimeout(pendingTimer);
    pendingTimer = null;
  };

  const flush = () => {
    clearPendingTimer();
    if (destroyed) {
      return;
    }
    dispatchRebuild();
  };

  const flushIfPending = () => {
    if (pendingTimer === null) {
      return;
    }
    flush();
  };

  const schedule = () => {
    if (destroyed) {
      return;
    }
    clearPendingTimer();
    pendingTimer = setTimeout(flush, Math.max(0, delayMs));
  };

  const deferIfPending = () => {
    if (pendingTimer === null) {
      return;
    }
    schedule();
  };

  const destroy = () => {
    destroyed = true;
    clearPendingTimer();
  };

  return {
    deferIfPending,
    destroy,
    flush,
    flushIfPending,
    schedule,
  };
}
