import { useEffect, useRef, useSyncExternalStore } from 'react';
import { watchDesktopPath } from '@/lib/desktop/watch';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import {
  isExternalSyncPaused,
  registerExternalSyncWatcher,
  subscribeExternalSyncPause,
} from '@/stores/notes/document/externalSyncControl';
import {
  readNotesExternalPathEvents,
  subscribeNotesExternalPathRename,
} from '@/stores/notes/document/externalPathBroadcast';
import { normalizeNotesRootRelativePath } from '@/stores/notes/utils/fs/notesRootPathContainment';
import {
  rememberProcessedRenameEventNonce,
  type PendingRenameEntry,
} from './notesExternalRenameQueue';
import { createNotesExternalSyncActions, type PendingCreateEntry } from './notesExternalSyncActions';

const NOTES_RECONCILE_POLL_MS = 1500;
const BROAD_PATH_RECONCILE_POLL_MS = 5000;

function shouldAvoidRecursiveNativeWatch(path: string) {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) {
    return true;
  }

  if (normalized === '/' || /^[a-z]:$/i.test(normalized)) {
    return true;
  }

  return (
    /^\/home\/[^/]+$/i.test(normalized) ||
    /^\/users\/[^/]+$/i.test(normalized) ||
    /^[a-z]:\/users\/[^/]+$/i.test(normalized)
  );
}

export function useNotesExternalSync(notesRootPath: string | null, notesPath: string) {
  const isPaused = useSyncExternalStore(
    subscribeExternalSyncPause,
    isExternalSyncPaused,
    () => false
  );
  const loadFileTree = useNotesStore((state) => state.loadFileTree);
  const invalidateNoteCache = useNotesStore((state) => state.invalidateNoteCache);
  const syncCurrentNoteFromDisk = useNotesStore((state) => state.syncCurrentNoteFromDisk);
  const applyExternalPathRename = useNotesStore((state) => state.applyExternalPathRename);
  const applyExternalPathDeletion = useNotesStore((state) => state.applyExternalPathDeletion);

  const reloadTimerRef = useRef<number | null>(null);
  const pendingRenameTimerRef = useRef<number | null>(null);
  const pendingRenamesRef = useRef<PendingRenameEntry[]>([]);
  const pendingCreatesRef = useRef<PendingCreateEntry[]>([]);
  const processedRenameEventNoncesRef = useRef<Set<string>>(new Set());
  const reconcileInFlightRef = useRef(false);

  useEffect(() => {
    if (!notesRootPath || !notesPath || isPaused) {
      return;
    }

    let disposed = false;
    let unwatch: (() => Promise<void>) | null = null;
    let releaseWatcher: (() => void) | null = null;
    let reconcilePollTimer: number | null = null;
    let reconcilePollConfig: { intervalMs: number; skipTreeSnapshot: boolean } | null = null;
    const eventFileStartedAt = Date.now();
    const unsubscribeRenameBroadcast = subscribeNotesExternalPathRename(
      notesPath,
      (event) => {
        void applyRenameEvent(event).catch(() => undefined);
      }
    );

    const syncActions = createNotesExternalSyncActions({
      notesPath,
      loadFileTree,
      invalidateNoteCache,
      syncCurrentNoteFromDisk,
      applyExternalPathRename,
      applyExternalPathDeletion,
      reloadTimerRef,
      pendingRenameTimerRef,
      pendingRenamesRef,
      pendingCreatesRef,
      reconcileInFlightRef,
    });

    async function applyRenameEvent(event: { nonce?: string; oldPath: string; newPath: string }) {
      if (disposed || useNotesStore.getState().notesPath !== notesPath) {
        return;
      }

      if (event.nonce) {
        if (!rememberProcessedRenameEventNonce(processedRenameEventNoncesRef.current, event.nonce)) {
          return;
        }
      }

      const oldPath = normalizeNotesRootRelativePath(event.oldPath);
      const newPath = normalizeNotesRootRelativePath(event.newPath);
      if (!oldPath || !newPath) {
        return;
      }

      await syncActions.handleExternalPathRename(oldPath, newPath, { reload: 'immediate' });
      if (disposed || useNotesStore.getState().notesPath !== notesPath) {
        return;
      }
    }

    const reconcileExternalPathEventFile = async () => {
      let events: Array<{ nonce?: string; oldPath: string; newPath: string }>;
      try {
        events = await readNotesExternalPathEvents(notesPath, {
          afterStamp: eventFileStartedAt,
        });
      } catch {
        return;
      }
      if (disposed || useNotesStore.getState().notesPath !== notesPath) {
        return;
      }
      for (const event of events) {
        await applyRenameEvent(event).catch(() => undefined);
        if (disposed || useNotesStore.getState().notesPath !== notesPath) {
          return;
        }
      }
    };

    const stopReconcilePolling = () => {
      if (reconcilePollTimer !== null) {
        window.clearInterval(reconcilePollTimer);
        reconcilePollTimer = null;
      }
    };

    const ensureReconcilePolling = () => {
      if (
        reconcilePollTimer !== null
        || !reconcilePollConfig
        || document.visibilityState !== 'visible'
      ) {
        return;
      }

      const { intervalMs, skipTreeSnapshot } = reconcilePollConfig;
      reconcilePollTimer = window.setInterval(() => {
        if (document.visibilityState !== 'visible') {
          stopReconcilePolling();
          return;
        }
        void reconcileExternalPathEventFile();
        void syncActions.runPollingReconcile({ skipTreeSnapshot });
      }, intervalMs);
    };

    const startReconcilePolling = (options?: {
      intervalMs?: number;
      skipTreeSnapshot?: boolean;
      immediate?: boolean;
    }) => {
      if (reconcilePollConfig !== null) {
        return;
      }

      const broadNotesPath = shouldAvoidRecursiveNativeWatch(notesPath);
      const skipTreeSnapshot = options?.skipTreeSnapshot ?? broadNotesPath;
      const reconcilePollMs = options?.intervalMs ?? (
        broadNotesPath
          ? BROAD_PATH_RECONCILE_POLL_MS
          : NOTES_RECONCILE_POLL_MS
      );
      reconcilePollConfig = { intervalMs: reconcilePollMs, skipTreeSnapshot };
      ensureReconcilePolling();
      if (options?.immediate !== false && document.visibilityState === 'visible') {
        void reconcileExternalPathEventFile();
        void syncActions.runPollingReconcile({ skipTreeSnapshot });
      }
    };

    const reconcileOnFocus = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      ensureReconcilePolling();
      void reconcileExternalPathEventFile();
      void syncActions.runPollingReconcile({
        skipTreeSnapshot: shouldAvoidRecursiveNativeWatch(notesPath),
      });
    };

    const reconcileOnVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        ensureReconcilePolling();
        void reconcileExternalPathEventFile();
        void syncActions.runPollingReconcile({
          skipTreeSnapshot: shouldAvoidRecursiveNativeWatch(notesPath),
        });
      } else {
        stopReconcilePolling();
      }
    };

    const run = async () => {
      void reconcileExternalPathEventFile();

      if (shouldAvoidRecursiveNativeWatch(notesPath)) {
        startReconcilePolling();
        return;
      }

      try {
        const stopWatching = await watchDesktopPath(
          notesPath,
          async (event) => {
            if (disposed) {
              return;
            }

            await syncActions.handleWatchEvent(notesPath, {
              ...event,
            });
          },
          { recursive: true }
        );
        if (disposed) {
          void stopWatching().catch(() => undefined);
          return;
        }

        unwatch = stopWatching;
        releaseWatcher = registerExternalSyncWatcher();
      } catch {
        if (disposed) {
          return;
        }

        startReconcilePolling({ immediate: false });
        return;
      }
    };

    void run().catch(() => undefined);
    window.addEventListener('focus', reconcileOnFocus);
    document.addEventListener('visibilitychange', reconcileOnVisibilityChange);

    return () => {
      disposed = true;
      window.removeEventListener('focus', reconcileOnFocus);
      document.removeEventListener('visibilitychange', reconcileOnVisibilityChange);
      stopReconcilePolling();
      reconcilePollConfig = null;
      unsubscribeRenameBroadcast();
      syncActions.clearTimers();
      void unwatch?.().catch(() => undefined);
      releaseWatcher?.();
    };
  }, [
    applyExternalPathDeletion,
    applyExternalPathRename,
    invalidateNoteCache,
    isPaused,
    loadFileTree,
    notesPath,
    syncCurrentNoteFromDisk,
    notesRootPath,
  ]);
}
