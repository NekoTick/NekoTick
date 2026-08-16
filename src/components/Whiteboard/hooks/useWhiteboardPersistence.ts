import { useEffect, useState } from 'react';
import type { WhiteboardSnapshot } from '@/components/Whiteboard/model/document/whiteboardDocument';
import { useWhiteboardStore, type WhiteboardSaveResult } from '../stores/useWhiteboardStore';

const WHITEBOARD_PERSISTENCE_DELAY_MS = 250;
const WHITEBOARD_RETRY_DELAYS_MS = [1000, 2000, 4000];

type IdleWindow = Window & {
  cancelIdleCallback?: (id: number) => void;
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
};

export function useWhiteboardPersistence(snapshot: WhiteboardSnapshot, paused = false): WhiteboardSaveResult | null {
  const [status, setStatus] = useState<WhiteboardSaveResult | null>(null);
  const saveActiveSnapshot = useWhiteboardStore((state) => state.saveActiveSnapshot);
  const setActiveSnapshotDraft = useWhiteboardStore((state) => state.setActiveSnapshotDraft);

  useEffect(() => {
    let idleId: number | null = null;
    let cancelled = false;
    const { activeBoardId: boardId, loadedNotesRootPath } = useWhiteboardStore.getState();
    setActiveSnapshotDraft(snapshot);
    if (paused) return undefined;
    let retryTimeoutId: number | null = null;
    const persist = (attempt = 0) => {
      void saveActiveSnapshot(snapshot, boardId, loadedNotesRootPath).then((result) => {
        if (cancelled) return;
        const nextStatus = result ?? { byteLength: 0, ok: false as const, reason: 'storage-unavailable' as const };
        setStatus(nextStatus);
        if (!nextStatus.ok && attempt < WHITEBOARD_RETRY_DELAYS_MS.length) {
          retryTimeoutId = window.setTimeout(() => persist(attempt + 1), WHITEBOARD_RETRY_DELAYS_MS[attempt]);
        }
      });
    };
    const timeoutId = window.setTimeout(() => {
      const idleWindow = window as IdleWindow;
      if (!idleWindow.requestIdleCallback) {
        persist();
        return;
      }
      idleId = idleWindow.requestIdleCallback(persist, { timeout: WHITEBOARD_PERSISTENCE_DELAY_MS });
    }, WHITEBOARD_PERSISTENCE_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      if (retryTimeoutId !== null) window.clearTimeout(retryTimeoutId);
      if (idleId !== null) (window as IdleWindow).cancelIdleCallback?.(idleId);
    };
  }, [paused, saveActiveSnapshot, setActiveSnapshotDraft, snapshot.elements, snapshot.paper, snapshot.strokes, snapshot.viewport]);

  return status;
}
