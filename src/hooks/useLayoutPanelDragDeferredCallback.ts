import { useCallback, useLayoutEffect, useRef } from 'react';
import {
  recordSidebarResizeDeferredWork,
  runSidebarResizeDiagnosticWork,
} from '@/lib/diagnostics/sidebarResizeDiagnostics';
import { useUIStore } from '@/stores/uiSlice';

export function useLayoutPanelDragDeferredCallback(
  callback: () => void,
  diagnosticSource: string,
): () => void {
  const callbackRef = useRef(callback);
  const pendingRef = useRef(false);
  callbackRef.current = callback;

  useLayoutEffect(() => useUIStore.subscribe((state, previousState) => {
    if (
      previousState.layoutPanelDragging
      && !state.layoutPanelDragging
      && pendingRef.current
    ) {
      pendingRef.current = false;
      runSidebarResizeDiagnosticWork(
        diagnosticSource,
        'deferred-flush',
        callbackRef.current,
      );
    }
  }), [diagnosticSource]);

  return useCallback(() => {
    if (useUIStore.getState().layoutPanelDragging) {
      pendingRef.current = true;
      recordSidebarResizeDeferredWork(diagnosticSource);
      return;
    }

    runSidebarResizeDiagnosticWork(diagnosticSource, 'immediate', callbackRef.current);
  }, [diagnosticSource]);
}
