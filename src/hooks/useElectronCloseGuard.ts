import { useCallback, useEffect, useRef, useState } from 'react';
import { desktopWindow } from '@/lib/desktop/window';
import { isElectronRuntime } from '@/lib/electron/bridge';
import { flushPendingWrites } from '@/lib/storage/flushPendingWrites';
import { isDraftNotePath } from '@/stores/notes/draftNote';
import { flushCurrentPendingEditorMarkdown } from '@/stores/notes/pendingEditorMarkdownFlusher';
import { useNotesStore } from '@/stores/useNotesStore';
import { useCloseDraftPersistence } from './useCloseDraftPersistence';

const CLOSE_FLUSH_TIMEOUT_MS = import.meta.env.MODE === 'test' ? 20 : 5000;

async function withCloseTimeout<T>(task: Promise<T>, fallbackValue: T, _failureLabel: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve(fallbackValue);
    }, CLOSE_FLUSH_TIMEOUT_MS);
  });

  try {
    return await Promise.race([task, timeout]);
  } catch (error) {
    return fallbackValue;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

async function withCloseFlushTimeout(flush: Promise<boolean>): Promise<boolean> {
  return withCloseTimeout(flush, false, 'Flushing pending writes');
}

export function useElectronCloseGuard() {
  const [isCloseDraftConfirmOpen, setIsCloseDraftConfirmOpen] = useState(false);
  const [isCloseFailureConfirmOpen, setIsCloseFailureConfirmOpen] = useState(false);
  const allowNextWindowCloseRef = useRef(false);
  const runFlushAllPendingWritesRef = useRef<() => Promise<boolean>>(async () => true);
  const {
    hasAutoSaveableDrafts,
    hasDiscardableDrafts,
    restorePathAfterCloseInterruption,
    saveAutoSaveableDraftsBeforeClose,
    saveDraftsBeforeClose,
  } = useCloseDraftPersistence();

  const forceWindowClose = useCallback(async () => {
    setIsCloseFailureConfirmOpen(false);
    try {
      allowNextWindowCloseRef.current = true;
      await desktopWindow.confirmClose();
    } catch {
      allowNextWindowCloseRef.current = false;
    }
  }, []);

  const interruptCloseForSaveFailure = useCallback((restorePath: string | null) => {
    setIsCloseFailureConfirmOpen(true);
    void restorePathAfterCloseInterruption(restorePath).catch((_error) => {
    });
  }, [restorePathAfterCloseInterruption]);

  const continueWindowClose = useCallback(async (options?: { skipDraftConfirm?: boolean; saveDrafts?: boolean }) => {
    const skipDraftConfirm = options?.skipDraftConfirm ?? false;
    const saveDrafts = options?.saveDrafts ?? false;
    const autoSaveResult = await withCloseTimeout(
      saveAutoSaveableDraftsBeforeClose(),
      { saved: false, restorePath: useNotesStore.getState().currentNote?.path ?? null },
      'Saving auto-saveable drafts'
    );
    let restorePath: string | null = autoSaveResult.restorePath;

    if (!autoSaveResult.saved) {
      interruptCloseForSaveFailure(restorePath);
      return;
    }

    const hasUnsavedDrafts = hasDiscardableDrafts();

    if (hasUnsavedDrafts && !skipDraftConfirm) {
      setIsCloseDraftConfirmOpen(true);
      return;
    }

    if (saveDrafts) {
      const saveResult = await withCloseTimeout(
        saveDraftsBeforeClose(),
        { saved: false, restorePath },
        'Saving drafts'
      );
      restorePath = saveResult.restorePath;
      if (!saveResult.saved) {
        interruptCloseForSaveFailure(restorePath);
        return;
      }
    }

    const flushed = await runFlushAllPendingWritesRef.current();
    if (!flushed) {
      interruptCloseForSaveFailure(restorePath);
      return;
    }

    try {
      allowNextWindowCloseRef.current = true;
      await desktopWindow.confirmClose();
    } catch {
      allowNextWindowCloseRef.current = false;
      await restorePathAfterCloseInterruption(restorePath);
    }
  }, [
    hasDiscardableDrafts,
    interruptCloseForSaveFailure,
    restorePathAfterCloseInterruption,
    saveAutoSaveableDraftsBeforeClose,
    saveDraftsBeforeClose,
  ]);

  useEffect(() => {
    if (!isElectronRuntime()) return;

    let activeFlush: Promise<boolean> | null = null;
    let unlistenCloseRequested: (() => void) | null = null;

    const runFlushAllPendingWrites = async (): Promise<boolean> => {
      if (!activeFlush) {
        activeFlush = flushPendingWrites().finally(() => {
          activeFlush = null;
        });
      }
      return withCloseFlushTimeout(activeFlush);
    };

    const flushAllPendingWrites = () => {
      void Promise.resolve(runFlushAllPendingWrites()).catch(() => undefined);
    };

    runFlushAllPendingWritesRef.current = runFlushAllPendingWrites;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushAllPendingWrites();
      }
    };

    unlistenCloseRequested = desktopWindow.onCloseRequested(() => {
      if (allowNextWindowCloseRef.current) {
        allowNextWindowCloseRef.current = false;
        return;
      }

      flushCurrentPendingEditorMarkdown();

      const notesState = useNotesStore.getState();
      const hasAutoSaveableUnsavedDrafts = hasAutoSaveableDrafts();
      const hasUnsavedDrafts = hasDiscardableDrafts();

      const hasDirtyRegularTabs = notesState.openTabs.some(
        (tab) => tab.isDirty && !isDraftNotePath(tab.path)
      );

      if (!notesState.isDirty && !hasDirtyRegularTabs && !hasUnsavedDrafts && !hasAutoSaveableUnsavedDrafts) {
        void (async () => {
          const flushed = await runFlushAllPendingWritesRef.current();
          if (!flushed) {
            setIsCloseFailureConfirmOpen(true);
            return;
          }
          try {
            allowNextWindowCloseRef.current = true;
            await desktopWindow.confirmClose();
          } catch {
            allowNextWindowCloseRef.current = false;
          }
        })().catch(() => undefined);
        return;
      }

      void continueWindowClose().catch(() => undefined);
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', flushAllPendingWrites);
    window.addEventListener('beforeunload', flushAllPendingWrites);

    return () => {
      unlistenCloseRequested?.();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', flushAllPendingWrites);
      window.removeEventListener('beforeunload', flushAllPendingWrites);
      runFlushAllPendingWritesRef.current = async () => true;
    };
  }, [continueWindowClose, hasAutoSaveableDrafts, hasDiscardableDrafts]);

  return {
    isCloseDraftConfirmOpen,
    isCloseFailureConfirmOpen,
    setIsCloseDraftConfirmOpen,
    setIsCloseFailureConfirmOpen,
    continueWindowClose,
    forceWindowClose,
  };
}
