import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logDiagnosticMock = vi.hoisted(() => vi.fn());

vi.mock('./diagnosticsLog', () => ({
  logDiagnostic: logDiagnosticMock,
}));

import {
  beginSidebarResizeDiagnostic,
  finishSidebarResizeDiagnostic,
  recordSidebarResizeDeferredWork,
  recordSidebarResizeWidthUpdate,
  runSidebarResizeDiagnosticWork,
} from './sidebarResizeDiagnostics';

describe('sidebarResizeDiagnostics', () => {
  let now = 100;
  let nextFrameId = 1;
  let frameCallbacks = new Map<number, FrameRequestCallback>();

  const runNextFrame = (frameAt: number) => {
    now = frameAt;
    const entry = frameCallbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
    expect(entry).toBeDefined();
    frameCallbacks.delete(entry![0]);
    entry![1](frameAt);
  };

  beforeEach(() => {
    now = 100;
    nextFrameId = 1;
    frameCallbacks = new Map();
    logDiagnosticMock.mockClear();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('PerformanceObserver', undefined);
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      frameCallbacks.set(frameId, callback);
      return frameId;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((frameId: number) => {
      frameCallbacks.delete(frameId);
    }));
    document.body.innerHTML = [
      '<div class="ProseMirror"><p></p><p></p></div>',
      '<div data-file-tree-kind="file"></div>',
      '<div data-notes-split-pane="primary"></div>',
    ].join('');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('writes one aggregated resize summary after the release frames', () => {
    beginSidebarResizeDiagnostic({
      mainWidth: 640,
      setupDurationMs: 2.4,
      sidebarWidth: 300,
    });
    recordSidebarResizeDeferredWork('notes-file-tree');
    recordSidebarResizeDeferredWork('notes-file-tree');

    now = 106;
    runSidebarResizeDiagnosticWork('notes-file-tree', 'deferred-flush', () => {
      now = 109;
    });
    recordSidebarResizeWidthUpdate(340, 1.2);
    runNextFrame(116);
    runNextFrame(150);

    now = 160;
    finishSidebarResizeDiagnostic(155);
    expect(logDiagnosticMock).not.toHaveBeenCalled();

    runNextFrame(210);
    runNextFrame(226);
    runNextFrame(242);
    runNextFrame(258);
    runNextFrame(274);

    expect(logDiagnosticMock).toHaveBeenCalledTimes(1);
    expect(logDiagnosticMock).toHaveBeenCalledWith(
      'layout',
      'sidebar-resize-summary',
      expect.objectContaining({
        dragDurationMs: 55,
        startSidebarWidth: 300,
        endSidebarWidth: 340,
        dom: {
          editorBlockCount: 2,
          renderedFileTreeRowCount: 1,
          splitPaneCount: 1,
        },
        dragFrames: expect.objectContaining({ count: 2, maxMs: 34 }),
        releaseFrames: expect.objectContaining({ count: 5, maxMs: 55 }),
        widthUpdates: expect.objectContaining({ count: 1, maxMs: 1.2 }),
        longTasks: expect.objectContaining({ observerSupported: false }),
        work: {
          'notes-file-tree': expect.objectContaining({
            deferredRequests: 2,
            deferredFlushRuns: 1,
            releaseRuns: 0,
            totalDurationMs: 3,
          }),
        },
      }),
    );
  });
});
