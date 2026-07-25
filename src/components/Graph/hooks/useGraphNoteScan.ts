import { useCallback, useEffect, useRef, useState } from 'react';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import { useNotesRootStore } from '@/stores/useNotesRootStore';
import { collectNoteGraphPaths } from '../model/noteGraph';

export type GraphNoteScanStatus = 'loading' | 'provisional' | 'complete' | 'error';

interface GraphNoteScanState {
  currentNotesRootPath: string | null;
  hasSnapshot: boolean;
  notesPath: string;
  rootFolder: ReturnType<typeof useNotesStore.getState>['rootFolder'];
  rootFolderPath: string | null;
  status: GraphNoteScanStatus;
}

type GraphNoteScanIdentity = Omit<GraphNoteScanState, 'hasSnapshot' | 'status'>;

interface ActiveGraphNoteScan {
  markSnapshotAvailable: () => void;
}

function matchesScanIdentity(
  state: GraphNoteScanState,
  identity: GraphNoteScanIdentity,
) {
  return state.currentNotesRootPath === identity.currentNotesRootPath
    && state.notesPath === identity.notesPath
    && state.rootFolderPath === identity.rootFolderPath;
}

function isAbortError(error: unknown) {
  return !!error
    && typeof error === 'object'
    && (error as { name?: unknown }).name === 'AbortError';
}

export function useGraphNoteScan(args: {
  active?: boolean;
  onPrimaryContentReady?: () => void;
  onStartupReady?: () => void;
  priorityPath?: string | null;
}) {
  const active = args.active ?? true;
  const rootFolder = useNotesStore((state) => active ? state.rootFolder : null);
  const rootFolderPath = useNotesStore((state) => active ? state.rootFolderPath : null);
  const notesPath = useNotesStore((state) => active ? state.notesPath : '');
  const scanAllNotes = useNotesStore((state) => state.scanAllNotes);
  const currentNotesRootPath = useNotesRootStore((state) => (
    active ? state.currentNotesRoot?.path ?? null : null
  ));
  const [retryRevision, setRetryRevision] = useState(0);
  const [scanState, setScanState] = useState<GraphNoteScanState>({
    currentNotesRootPath: null,
    hasSnapshot: false,
    notesPath: '',
    rootFolder: null,
    rootFolderPath: null,
    status: 'complete',
  });
  const scanStateRef = useRef(scanState);
  scanStateRef.current = scanState;
  const activeScanRef = useRef<ActiveGraphNoteScan | null>(null);
  const priorityPathRef = useRef(args.priorityPath ?? null);
  priorityPathRef.current = args.priorityPath ?? null;
  const readyReportedRef = useRef(false);
  const primaryContentReadyRef = useRef(args.onPrimaryContentReady);
  primaryContentReadyRef.current = args.onPrimaryContentReady;

  useEffect(() => {
    if (readyReportedRef.current) return;
    readyReportedRef.current = true;
    args.onStartupReady?.();
  }, [args.onStartupReady]);

  useEffect(() => {
    if (!active) return;

    const identity = { currentNotesRootPath, notesPath, rootFolder, rootFolderPath };
    if (!rootFolder || !notesPath || rootFolderPath !== notesPath) {
      const next = { ...identity, hasSnapshot: false, status: 'complete' as const };
      scanStateRef.current = next;
      setScanState(next);
      primaryContentReadyRef.current?.();
      return;
    }

    const abortController = new AbortController();
    let primaryContentReported = false;
    let snapshotAvailable = matchesScanIdentity(scanStateRef.current, identity)
      && scanStateRef.current.hasSnapshot;
    const reportPrimaryContentReady = () => {
      if (abortController.signal.aborted || primaryContentReported) return;
      primaryContentReported = true;
      primaryContentReadyRef.current?.();
    };
    const updateStatus = (status: GraphNoteScanStatus, hasSnapshot = snapshotAvailable) => {
      if (abortController.signal.aborted) return;
      const next = { ...identity, hasSnapshot, status };
      scanStateRef.current = next;
      setScanState(next);
    };
    const markSnapshotAvailable = () => {
      snapshotAvailable = true;
      updateStatus('provisional', true);
      reportPrimaryContentReady();
    };
    const activeScan = { markSnapshotAvailable };
    activeScanRef.current = activeScan;

    updateStatus(snapshotAvailable ? 'provisional' : 'loading');
    const handleScanFailure = (error: unknown) => {
      if (abortController.signal.aborted) return;
      if (isAbortError(error)) {
        startScan();
        return;
      }
      updateStatus('error');
      reportPrimaryContentReady();
    };
    const startScan = () => {
      let scanPromise: Promise<void>;
      try {
        const priorityPaths = collectNoteGraphPaths(rootFolder.children);
        const priorityPath = priorityPathRef.current;
        if (priorityPath && !priorityPaths.includes(priorityPath)) {
          priorityPaths.push(priorityPath);
        }
        scanPromise = scanAllNotes({
          background: true,
          rejectOnCancel: true,
          signal: abortController.signal,
          priorityPaths,
          onPriorityPathsScanned: markSnapshotAvailable,
        });
      } catch (error) {
        handleScanFailure(error);
        return;
      }
      void scanPromise.then(
        () => {
          snapshotAvailable = true;
          updateStatus('complete', true);
          reportPrimaryContentReady();
        },
        handleScanFailure,
      );
    };
    startScan();

    return () => {
      if (activeScanRef.current === activeScan) activeScanRef.current = null;
      abortController.abort();
    };
  }, [
    active,
    currentNotesRootPath,
    notesPath,
    retryRevision,
    rootFolder,
    rootFolderPath,
    scanAllNotes,
  ]);

  useEffect(() => {
    const priorityPath = args.priorityPath;
    if (!active || !priorityPath || !rootFolder || !notesPath || rootFolderPath !== notesPath) {
      return;
    }
    const activeScan = activeScanRef.current;
    const currentIdentity = { currentNotesRootPath, notesPath, rootFolder, rootFolderPath };
    const currentStatus = scanStateRef.current.status;
    if (
      !activeScan
      || !matchesScanIdentity(scanStateRef.current, currentIdentity)
      || (currentStatus !== 'loading' && currentStatus !== 'provisional')
    ) {
      return;
    }

    const abortController = new AbortController();
    try {
      void scanAllNotes({
        background: true,
        signal: abortController.signal,
        priorityPaths: [priorityPath],
        onPriorityPathsScanned: activeScan.markSnapshotAvailable,
      }).catch(() => undefined);
    } catch {
      return;
    }
    return () => abortController.abort();
  }, [
    active,
    args.priorityPath,
    currentNotesRootPath,
    notesPath,
    rootFolder,
    rootFolderPath,
    scanAllNotes,
  ]);

  const currentIdentity = { currentNotesRootPath, notesPath, rootFolder, rootFolderPath };
  const matchesCurrentScan = matchesScanIdentity(scanState, currentIdentity);
  const status = active && rootFolder && notesPath && rootFolderPath === notesPath && !matchesCurrentScan
    ? 'loading'
    : scanState.status;
  const retry = useCallback(() => {
    setScanState((current) => ({
      ...currentIdentity,
      hasSnapshot: matchesScanIdentity(current, currentIdentity) && current.hasSnapshot,
      status: matchesScanIdentity(current, currentIdentity) && current.hasSnapshot
        ? 'provisional'
        : 'loading',
    }));
    setRetryRevision((current) => current + 1);
  }, [currentNotesRootPath, notesPath, rootFolder, rootFolderPath]);

  return { retry, status };
}
