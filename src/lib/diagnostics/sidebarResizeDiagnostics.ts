import { logDiagnostic } from './diagnosticsLog';

type SidebarResizeWorkPhase = 'deferred-flush' | 'immediate' | 'release' | 'render';

interface SidebarResizeWorkStats {
  deferredRequests: number;
  deferredFlushRuns: number;
  immediateRuns: number;
  maxDurationMs: number;
  releaseRuns: number;
  renderRuns: number;
  totalDurationMs: number;
}

interface SidebarResizeSession {
  id: number;
  startedAt: number;
  releasedAt: number | null;
  startSidebarWidth: number;
  lastSidebarWidth: number;
  mainWidth: number | null;
  setupDurationMs: number;
  frameId: number | null;
  lastFrameAt: number;
  dragFrameDeltas: number[];
  releaseFrameDeltas: number[];
  widthUpdateDurations: number[];
  widthUpdateIntervals: number[];
  lastWidthUpdateAt: number | null;
  longTaskDurations: number[];
  longTaskObserver: PerformanceObserver | null;
  longTaskObserverSupported: boolean;
  workBySource: Map<string, SidebarResizeWorkStats>;
  dom: {
    editorBlockCount: number;
    renderedFileTreeRowCount: number;
    splitPaneCount: number;
  };
}

const diagnosticsEnabled = import.meta.env.DEV;
const RELEASE_FRAME_SAMPLE_COUNT = 5;
let activeSession: SidebarResizeSession | null = null;
let nextSessionId = 1;

function roundMetric(value: number): number {
  return Math.round(value * 10) / 10;
}

function summarizeDurations(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    averageMs: roundMetric(total / Math.max(1, values.length)),
    p95Ms: roundMetric(sorted[p95Index] ?? 0),
    maxMs: roundMetric(sorted.at(-1) ?? 0),
    over25Ms: values.filter((value) => value > 25).length,
    over50Ms: values.filter((value) => value > 50).length,
    over100Ms: values.filter((value) => value > 100).length,
  };
}

function collectLongTasks(session: SidebarResizeSession, entries: PerformanceEntry[]) {
  for (const entry of entries) {
    session.longTaskDurations.push(entry.duration);
  }
}

function disposeSession(session: SidebarResizeSession) {
  if (session.frameId !== null) {
    window.cancelAnimationFrame(session.frameId);
    session.frameId = null;
  }
  collectLongTasks(session, session.longTaskObserver?.takeRecords() ?? []);
  session.longTaskObserver?.disconnect();
  session.longTaskObserver = null;
}

function finalizeSession(session: SidebarResizeSession) {
  if (activeSession !== session || session.releasedAt === null) return;
  disposeSession(session);
  activeSession = null;

  const work = Object.fromEntries(
    [...session.workBySource.entries()].map(([source, stats]) => [source, {
      ...stats,
      maxDurationMs: roundMetric(stats.maxDurationMs),
      totalDurationMs: roundMetric(stats.totalDurationMs),
    }]),
  );
  const sortedLongTasks = [...session.longTaskDurations].sort((left, right) => right - left);

  logDiagnostic('layout', 'sidebar-resize-summary', {
    sessionId: session.id,
    dragDurationMs: roundMetric(session.releasedAt - session.startedAt),
    setupDurationMs: roundMetric(session.setupDurationMs),
    startSidebarWidth: roundMetric(session.startSidebarWidth),
    endSidebarWidth: roundMetric(session.lastSidebarWidth),
    mainWidth: session.mainWidth === null ? null : roundMetric(session.mainWidth),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    dom: session.dom,
    dragFrames: summarizeDurations(session.dragFrameDeltas),
    releaseFrames: summarizeDurations(session.releaseFrameDeltas),
    widthUpdates: summarizeDurations(session.widthUpdateDurations),
    widthUpdateIntervals: summarizeDurations(session.widthUpdateIntervals),
    longTasks: {
      ...summarizeDurations(session.longTaskDurations),
      observerSupported: session.longTaskObserverSupported,
      topDurationsMs: sortedLongTasks.slice(0, 5).map(roundMetric),
    },
    work,
  });
}

function scheduleFrame(session: SidebarResizeSession) {
  session.frameId = window.requestAnimationFrame((now) => {
    session.frameId = null;
    if (activeSession !== session) return;

    if (session.releasedAt === null) {
      session.dragFrameDeltas.push(now - session.lastFrameAt);
      session.lastFrameAt = now;
      scheduleFrame(session);
      return;
    }

    const previousFrameAt = session.releaseFrameDeltas.length === 0
      ? session.releasedAt
      : session.lastFrameAt;
    session.releaseFrameDeltas.push(now - previousFrameAt);
    session.lastFrameAt = now;
    if (session.releaseFrameDeltas.length >= RELEASE_FRAME_SAMPLE_COUNT) {
      finalizeSession(session);
      return;
    }
    scheduleFrame(session);
  });
}

function getWorkStats(session: SidebarResizeSession, source: string): SidebarResizeWorkStats {
  const existing = session.workBySource.get(source);
  if (existing) return existing;

  const stats: SidebarResizeWorkStats = {
    deferredRequests: 0,
    deferredFlushRuns: 0,
    immediateRuns: 0,
    maxDurationMs: 0,
    releaseRuns: 0,
    renderRuns: 0,
    totalDurationMs: 0,
  };
  session.workBySource.set(source, stats);
  return stats;
}

export function beginSidebarResizeDiagnostic(input: {
  mainWidth: number | null;
  setupDurationMs: number;
  sidebarWidth: number;
}): void {
  if (!diagnosticsEnabled || typeof window === 'undefined') return;
  if (activeSession) disposeSession(activeSession);

  const startedAt = performance.now();
  const session: SidebarResizeSession = {
    id: nextSessionId,
    startedAt,
    releasedAt: null,
    startSidebarWidth: input.sidebarWidth,
    lastSidebarWidth: input.sidebarWidth,
    mainWidth: input.mainWidth,
    setupDurationMs: input.setupDurationMs,
    frameId: null,
    lastFrameAt: startedAt,
    dragFrameDeltas: [],
    releaseFrameDeltas: [],
    widthUpdateDurations: [],
    widthUpdateIntervals: [],
    lastWidthUpdateAt: null,
    longTaskDurations: [],
    longTaskObserver: null,
    longTaskObserverSupported: false,
    workBySource: new Map(),
    dom: {
      editorBlockCount: document.querySelector('.ProseMirror')?.childElementCount ?? 0,
      renderedFileTreeRowCount: document.querySelectorAll('[data-file-tree-kind]').length,
      splitPaneCount: document.querySelectorAll('[data-notes-split-pane]').length,
    },
  };
  nextSessionId += 1;
  activeSession = session;

  if (typeof PerformanceObserver !== 'undefined') {
    try {
      session.longTaskObserver = new PerformanceObserver((list) => {
        collectLongTasks(session, list.getEntries());
      });
      session.longTaskObserver.observe({ entryTypes: ['longtask'] });
      session.longTaskObserverSupported = true;
    } catch {
      session.longTaskObserver = null;
    }
  }

  scheduleFrame(session);
}

export function isSidebarResizeDiagnosticActive(): boolean {
  return activeSession !== null;
}

export function recordSidebarResizeWidthUpdate(width: number, durationMs: number): void {
  const session = activeSession;
  if (!session || session.releasedAt !== null) return;

  const now = performance.now();
  if (session.lastWidthUpdateAt !== null) {
    session.widthUpdateIntervals.push(now - session.lastWidthUpdateAt);
  }
  session.lastWidthUpdateAt = now;
  session.lastSidebarWidth = width;
  session.widthUpdateDurations.push(durationMs);
}

export function recordSidebarResizeDeferredWork(source: string): void {
  const session = activeSession;
  if (!session) return;
  getWorkStats(session, source).deferredRequests += 1;
}

export function runSidebarResizeDiagnosticWork<T>(
  source: string,
  phase: SidebarResizeWorkPhase,
  work: () => T,
): T {
  const session = activeSession;
  if (!session) return work();

  const startedAt = performance.now();
  try {
    return work();
  } finally {
    const durationMs = performance.now() - startedAt;
    const stats = getWorkStats(session, source);
    stats.totalDurationMs += durationMs;
    stats.maxDurationMs = Math.max(stats.maxDurationMs, durationMs);
    if (phase === 'deferred-flush') stats.deferredFlushRuns += 1;
    if (phase === 'immediate') stats.immediateRuns += 1;
    if (phase === 'release') stats.releaseRuns += 1;
    if (phase === 'render') stats.renderRuns += 1;
  }
}

export function finishSidebarResizeDiagnostic(releasedAt = performance.now()): void {
  const session = activeSession;
  if (!session || session.releasedAt !== null) return;
  session.releasedAt = releasedAt;
}
