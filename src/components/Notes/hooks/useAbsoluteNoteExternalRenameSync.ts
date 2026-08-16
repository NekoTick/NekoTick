import { useEffect, useRef } from 'react';
import { watchDesktopPath } from '@/lib/desktop/watch';
import { normalizeContainedAssetPath } from '@/lib/assets/core/pathContainment';
import { getParentPath, isAbsolutePath } from '@/lib/storage/adapter';
import {
  readNotesExternalPathEvents,
  subscribeNotesExternalPathRename,
} from '@/stores/notes/document/externalPathBroadcast';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import { hasInternalNotePathSegment } from '@/stores/notes/utils/fs/internalNotePaths';
import {
  getAbsoluteRenameWatchPaths,
  getFsPathComparisonKey,
  hasUnsafeFsPathSegment,
  isMarkdownPath,
  isRemoveWatchEvent,
  normalizeFsPath,
} from './notesExternalSyncUtils';
import { rememberProcessedRenameEventNonce } from './notesExternalRenameQueue';

const BROAD_ABSOLUTE_NOTE_SYNC_POLL_MS = 5000;
export const MAX_ABSOLUTE_NOTE_WATCH_EVENT_PATHS = 4096;

function isAbsoluteRenamePathInsideParent(parentPath: string, path: string) {
  return isAbsolutePath(path) && normalizeContainedAssetPath(path, parentPath) !== null;
}

function isSameFsPath(path: string, otherPath: string) {
  return getFsPathComparisonKey(path) === getFsPathComparisonKey(otherPath);
}

function isAbsoluteRenamePathRelevant(watchedNotePath: string, oldPath: string, newPath: string) {
  if (!isAbsolutePath(oldPath) || !isAbsolutePath(newPath)) {
    return false;
  }

  return isSameFsPath(oldPath, watchedNotePath) || isPathWithin(watchedNotePath, oldPath);
}

function shouldAvoidNativeAbsoluteNoteWatch(parentPath: string) {
  const normalized = parentPath.replace(/\\/g, '/').replace(/\/+$/, '');
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

function isPathWithin(path: string, basePath: string) {
  const pathKey = getFsPathComparisonKey(path);
  const basePathKey = getFsPathComparisonKey(basePath);
  return pathKey === basePathKey || pathKey.startsWith(`${basePathKey}/`);
}

export function useAbsoluteNoteExternalRenameSync(currentNotePath: string | undefined) {
  const applyExternalPathRename = useNotesStore((state) => state.applyExternalPathRename);
  const syncCurrentNoteFromDisk = useNotesStore((state) => state.syncCurrentNoteFromDisk);
  const processedRenameEventNoncesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentNotePath || !isAbsolutePath(currentNotePath)) {
      return;
    }

    if (hasInternalNotePathSegment(currentNotePath)) {
      return;
    }

    const parentPath = getParentPath(currentNotePath);
    if (!parentPath) {
      return;
    }
    const watchedParentPath = parentPath;
    const watchedNotePath = normalizeFsPath(currentNotePath);

    let disposed = false;
    let unwatch: (() => Promise<void>) | null = null;
    let pollingTimer: number | null = null;
    const eventFileStartedAt = Date.now();

    async function applyRenameEvent(event: { nonce?: string; oldPath: string; newPath: string }) {
      if (disposed) {
        return;
      }

      if (event.nonce) {
        if (!rememberProcessedRenameEventNonce(processedRenameEventNoncesRef.current, event.nonce)) {
          return;
        }
      }

      const oldPath = normalizeFsPath(event.oldPath);
      const newPath = normalizeFsPath(event.newPath);
      if (
        hasUnsafeFsPathSegment(oldPath) ||
        hasUnsafeFsPathSegment(newPath) ||
        hasInternalNotePathSegment(oldPath) ||
        hasInternalNotePathSegment(newPath)
      ) {
        return;
      }

      if (
        !isAbsoluteRenamePathInsideParent(watchedParentPath, oldPath) &&
        !isAbsoluteRenamePathRelevant(watchedNotePath, oldPath, newPath)
      ) {
        return;
      }

      const isCurrentFileRename = isSameFsPath(oldPath, watchedNotePath);
      const isCurrentFolderRename = !isCurrentFileRename && isPathWithin(watchedNotePath, oldPath);

      if (isCurrentFileRename && !isMarkdownPath(newPath)) {
        await syncCurrentNoteFromDisk({ force: true });
        return;
      }

      if (!isCurrentFolderRename && (!isMarkdownPath(oldPath) || !isMarkdownPath(newPath))) {
        return;
      }

      await applyExternalPathRename(oldPath, newPath);
    }

    const unsubscribeRenameBroadcast = subscribeNotesExternalPathRename(
      watchedParentPath,
      (event) => {
        void applyRenameEvent(event).catch(() => undefined);
      }
    );

    const reconcileExternalPathEventFile = async () => {
      let events: Array<{ nonce?: string; oldPath: string; newPath: string }>;
      try {
        events = await readNotesExternalPathEvents(watchedParentPath, {
          afterStamp: eventFileStartedAt,
        });
      } catch {
        return;
      }
      if (disposed) {
        return;
      }

      for (const event of events) {
        await applyRenameEvent(event).catch(() => undefined);
        if (disposed) {
          return;
        }
      }
    };

    const isCurrentNoteWatchEvent = (paths: string[]) => (
      paths.some((path) => isSameFsPath(normalizeFsPath(path), watchedNotePath))
    );

    const syncCurrentAbsoluteNote = () => {
      if (disposed || document.visibilityState !== 'visible') {
        return;
      }

      void reconcileExternalPathEventFile();
      void syncCurrentNoteFromDisk({ force: true }).catch(() => undefined);
    };

    const startPollingSync = () => {
      const ensurePollingTimer = () => {
        if (pollingTimer !== null || document.visibilityState !== 'visible') {
          return;
        }
        pollingTimer = window.setInterval(syncCurrentAbsoluteNote, BROAD_ABSOLUTE_NOTE_SYNC_POLL_MS);
      };
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          ensurePollingTimer();
          syncCurrentAbsoluteNote();
        } else if (pollingTimer !== null) {
          window.clearInterval(pollingTimer);
          pollingTimer = null;
        }
      };

      ensurePollingTimer();
      window.addEventListener('focus', syncCurrentAbsoluteNote);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    };

    let stopPollingSync: (() => void) | null = null;

    const run = async () => {
      void reconcileExternalPathEventFile();

      if (shouldAvoidNativeAbsoluteNoteWatch(watchedParentPath)) {
        stopPollingSync = startPollingSync();
        return;
      }

      try {
        const stopWatching = await watchDesktopPath(
          watchedParentPath,
          async (event) => {
            if (disposed) {
              return;
            }

            if (event.paths.length > MAX_ABSOLUTE_NOTE_WATCH_EVENT_PATHS) {
              await syncCurrentNoteFromDisk({ force: true });
              return;
            }

            const renamePaths = getAbsoluteRenameWatchPaths({
              ...event,
              paths: event.paths.map((path) => normalizeFsPath(path)),
            });
            if (renamePaths) {
              if (renamePaths.oldPath && renamePaths.newPath) {
                await applyRenameEvent({
                  oldPath: renamePaths.oldPath,
                  newPath: renamePaths.newPath,
                });
              }
              return;
            }

            if (isCurrentNoteWatchEvent(event.paths)) {
              await syncCurrentNoteFromDisk({ force: true });
              if (isRemoveWatchEvent(event)) {
                return;
              }
            }
          },
          { recursive: true }
        );

        if (disposed) {
          void stopWatching().catch(() => undefined);
          return;
        }

        unwatch = stopWatching;
      } catch {
        if (!disposed) {
          stopPollingSync = startPollingSync();
        }
      }
    };

    void run().catch(() => undefined);

    return () => {
      disposed = true;
      if (pollingTimer !== null) {
        window.clearInterval(pollingTimer);
        pollingTimer = null;
      }
      window.removeEventListener('focus', syncCurrentAbsoluteNote);
      stopPollingSync?.();
      unsubscribeRenameBroadcast();
      void unwatch?.().catch(() => undefined);
    };
  }, [applyExternalPathRename, currentNotePath, syncCurrentNoteFromDisk]);
}
