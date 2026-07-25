import type { ScanAllNotesOptions } from '../types';

export type NoteContentScanOutcome = 'cancelled' | 'complete';

interface PriorityRequest {
  onReady: () => void;
  pendingPaths: Set<string>;
}

interface ActiveScan {
  controller: AbortController;
  defaultPromise: Promise<void> | null;
  onPriorityPathsScanned?: () => void;
  outcomePromise: Promise<NoteContentScanOutcome> | null;
  priorityPaths: Set<string>;
  priorityRequests: Set<PriorityRequest>;
  publishPriorityCache: (() => boolean) | null;
  remainingPaths: Set<string> | null;
}

export interface NoteContentScanRunContext {
  finishPriorityPaths: (paths: readonly string[]) => void;
  initializePriorityRequests: (
    paths: readonly string[],
    publishPriorityCache: () => boolean,
  ) => void;
  isActive: () => boolean;
  priorityPaths: Set<string>;
}

type RunNoteContentScan = (
  context: NoteContentScanRunContext,
) => Promise<NoteContentScanOutcome>;

function createNoteContentScanAbortError() {
  return new DOMException('Note content scan was cancelled', 'AbortError');
}

export function createNoteContentScanCoordinator(runScan: RunNoteContentScan) {
  let activeScan: ActiveScan | null = null;

  const isActive = (scan: ActiveScan) => (
    activeScan === scan && !scan.controller.signal.aborted
  );

  const clearPriorityRequests = (scan: ActiveScan) => {
    scan.priorityRequests.clear();
    scan.publishPriorityCache = null;
    scan.remainingPaths = null;
  };

  const publishReadyPriorityRequests = (scan: ActiveScan) => {
    const readyRequests = Array.from(scan.priorityRequests).filter(
      (request) => request.pendingPaths.size === 0,
    );
    if (
      readyRequests.length === 0
      || !isActive(scan)
      || !scan.publishPriorityCache?.()
    ) {
      return;
    }
    for (const request of readyRequests) {
      if (!isActive(scan)) return;
      if (!scan.priorityRequests.delete(request)) continue;
      request.onReady();
    }
  };

  const registerPriorityRequest = (
    scan: ActiveScan,
    paths: readonly string[],
    onReady: () => void,
  ) => {
    if (!scan.remainingPaths) return undefined;
    const request = {
      onReady,
      pendingPaths: new Set(paths.filter((path) => scan.remainingPaths?.has(path))),
    };
    scan.priorityRequests.add(request);
    publishReadyPriorityRequests(scan);
    return () => scan.priorityRequests.delete(request);
  };

  const abortScan = (scan: ActiveScan) => {
    clearPriorityRequests(scan);
    scan.priorityPaths.clear();
    scan.controller.abort();
  };

  const cancelNoteContentScan = () => {
    const scan = activeScan;
    if (!scan) return;
    activeScan = null;
    abortScan(scan);
  };

  const createRunContext = (scan: ActiveScan): NoteContentScanRunContext => ({
    finishPriorityPaths: (paths) => {
      if (!scan.remainingPaths) return;
      paths.forEach((path) => {
        scan.remainingPaths?.delete(path);
        scan.priorityRequests.forEach((request) => request.pendingPaths.delete(path));
      });
      publishReadyPriorityRequests(scan);
    },
    initializePriorityRequests: (paths, publishPriorityCache) => {
      if (!isActive(scan)) return;
      scan.remainingPaths = new Set(paths);
      scan.publishPriorityCache = publishPriorityCache;
      if (scan.onPriorityPathsScanned) {
        registerPriorityRequest(
          scan,
          Array.from(scan.priorityPaths),
          scan.onPriorityPathsScanned,
        );
      }
    },
    isActive: () => isActive(scan),
    priorityPaths: scan.priorityPaths,
  });

  const getDefaultPromise = (
    scan: ActiveScan,
    outcomePromise: Promise<NoteContentScanOutcome>,
  ) => {
    if (scan.defaultPromise) return scan.defaultPromise;
    scan.defaultPromise = outcomePromise.then(() => undefined);
    return scan.defaultPromise;
  };

  const createCallerPromise = (
    scan: ActiveScan,
    outcomePromise: Promise<NoteContentScanOutcome>,
    options: ScanAllNotesOptions | undefined,
    sharedSignal?: AbortSignal,
    removePriorityRequest?: () => void,
  ): Promise<void> => {
    if (
      !options?.rejectOnCancel
      && !removePriorityRequest
      && !(sharedSignal && options?.signal)
    ) {
      return getDefaultPromise(scan, outcomePromise);
    }
    const rejectOnCancel = Boolean(options?.rejectOnCancel);
    const callerSignal = sharedSignal ? options?.signal : undefined;
    let cleanupPriorityRequest = removePriorityRequest;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (settle: () => void) => {
        if (settled) return;
        settled = true;
        callerSignal?.removeEventListener('abort', handleAbort);
        sharedSignal?.removeEventListener('abort', handleAbort);
        const cleanup = cleanupPriorityRequest;
        cleanupPriorityRequest = undefined;
        cleanup?.();
        settle();
      };
      const finishCancelled = () => finish(() => {
        if (rejectOnCancel) reject(createNoteContentScanAbortError());
        else resolve();
      });
      const handleAbort = () => finishCancelled();

      if (callerSignal?.aborted || sharedSignal?.aborted) {
        finishCancelled();
        return;
      }
      callerSignal?.addEventListener('abort', handleAbort, { once: true });
      sharedSignal?.addEventListener('abort', handleAbort, { once: true });
      void outcomePromise.then(
        (outcome) => {
          if (
            outcome === 'cancelled'
            || callerSignal?.aborted
            || sharedSignal?.aborted
          ) {
            finishCancelled();
            return;
          }
          finish(resolve);
        },
        (error) => finish(() => reject(error)),
      );
    });
  };

  const startScan = (options?: ScanAllNotesOptions) => {
    cancelNoteContentScan();
    const scan: ActiveScan = {
      controller: new AbortController(),
      defaultPromise: null,
      onPriorityPathsScanned: options?.onPriorityPathsScanned,
      outcomePromise: null,
      priorityPaths: new Set(options?.priorityPaths),
      priorityRequests: new Set(),
      publishPriorityCache: null,
      remainingPaths: null,
    };
    activeScan = scan;
    const externalSignal = options?.signal;
    const abortFromExternalSignal = () => abortScan(scan);
    if (externalSignal?.aborted) abortFromExternalSignal();
    else externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true });

    const outcomePromise = runScan(createRunContext(scan));
    scan.outcomePromise = outcomePromise;
    const finishScan = () => {
      externalSignal?.removeEventListener('abort', abortFromExternalSignal);
      clearPriorityRequests(scan);
      scan.defaultPromise = null;
      scan.outcomePromise = null;
      scan.priorityPaths.clear();
      if (activeScan === scan) activeScan = null;
    };
    void outcomePromise.then(finishScan, finishScan);
    return createCallerPromise(scan, outcomePromise, options);
  };

  const scanAllNotes = (options?: ScanAllNotesOptions): Promise<void> => {
    const scan = activeScan;
    if (
      options?.background
      && scan?.outcomePromise
      && !scan.controller.signal.aborted
    ) {
      let removePriorityRequest: (() => void) | undefined;
      if (!options.signal?.aborted) {
        options.priorityPaths?.forEach((path) => scan.priorityPaths.add(path));
        if (options.onPriorityPathsScanned) {
          removePriorityRequest = registerPriorityRequest(
            scan,
            options.priorityPaths ?? [],
            options.onPriorityPathsScanned,
          );
        }
      }
      return createCallerPromise(
        scan,
        scan.outcomePromise,
        options,
        scan.controller.signal,
        removePriorityRequest,
      );
    }
    return startScan(options);
  };

  return { cancelNoteContentScan, scanAllNotes };
}
