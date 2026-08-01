import { useRef, useCallback, useEffect } from 'react';
import { getErrorDiagnosticDetails } from '@/lib/diagnostics/errorDetails';
import { logDiagnostic } from '@/lib/diagnostics/diagnosticsLog';
import { createPersistenceQueue, type PersistenceQueue } from '@/lib/storage/persistenceEngine';
import { registerCurrentEditorSaveFlusher } from '../utils/editorSaveRegistry';
import { getElectronBridge } from '@/lib/electron/bridge';

const SAVE_DEBOUNCE_MS = 800;
const SAVE_MAX_WAIT_MS = 2500;

function reportSaveFailure(error: unknown, message: string): void {
  const name = error instanceof Error ? error.name : 'Error';
  void getElectronBridge()?.app?.reportRendererError?.({
    source: 'note-save',
    type: 'persistence',
    name,
    message,
  }).catch(() => undefined);
}

export function useEditorSave(saveNote: (options?: {
  explicit?: boolean;
  throwOnError?: boolean;
}) => Promise<void>) {
  const saveNoteRef = useRef(saveNote);
  const saveQueueRef = useRef<PersistenceQueue<number> | null>(null);
  const saveSequenceRef = useRef(0);

  saveNoteRef.current = saveNote;

  if (!saveQueueRef.current) {
    saveQueueRef.current = createPersistenceQueue<number>({
      debounceMs: SAVE_DEBOUNCE_MS,
      maxWaitMs: SAVE_MAX_WAIT_MS,
      write: async () => {
        await saveNoteRef.current({ explicit: false, throwOnError: true });
      },
      onError: (error) => {
        logDiagnostic('note-save', 'autosave-write-failed', {
          willRetry: true,
          ...getErrorDiagnosticDetails(error),
        });
        reportSaveFailure(error, 'Autosave could not persist note changes.');
      },
    });
  }

  const flushSave = useCallback(async (explicit = false) => {
    try {
      if (explicit) {
        await saveNoteRef.current({ explicit: true });
        return;
      }

      const saveQueue = saveQueueRef.current;
      if (!saveQueue) return;
      if (saveQueue.hasPending()) {
        await saveQueue.flush();
        return;
      }

      saveSequenceRef.current += 1;
      await saveQueue.saveNow(saveSequenceRef.current);
    } catch (error) {
      logDiagnostic('note-save', 'flush-failed', {
        explicit,
        ...getErrorDiagnosticDetails(error),
      });
      reportSaveFailure(error, 'Editor save flush could not persist note changes.');
      // The queue retains failed autosaves and retries them with backoff.
    }
  }, []);

  const debouncedSave = useCallback(() => {
    saveSequenceRef.current += 1;
    saveQueueRef.current?.schedule(saveSequenceRef.current);
  }, []);

  useEffect(() => registerCurrentEditorSaveFlusher(flushSave), [flushSave]);

  useEffect(() => {
    return () => {
      saveQueueRef.current?.cancel();
    };
  }, []);

  return { debouncedSave, flushSave };
}
