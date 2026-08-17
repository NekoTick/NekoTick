export interface DiagnosticEntry {
  id: number;
  at: string;
  channel: string;
  event: string;
  details?: Record<string, unknown>;
}

type DiagnosticListener = () => void;
type DiagnosticDetails = Record<string, unknown> | (() => Record<string, unknown>);

declare global {
  interface Window {
    __vlainaDiagnosticsLog?: DiagnosticEntry[];
    __vlainaDiagnosticsNextId?: number;
  }
}

const MAX_DIAGNOSTIC_ENTRIES = 160;

const listeners = new Set<DiagnosticListener>();
const lastEntryAtByKey = new Map<string, number>();

function getLog(): DiagnosticEntry[] {
  if (typeof window === 'undefined') return [];
  return window.__vlainaDiagnosticsLog ?? [];
}

function setLog(entries: DiagnosticEntry[]): void {
  if (typeof window === 'undefined') return;
  window.__vlainaDiagnosticsLog = entries.slice(-MAX_DIAGNOSTIC_ENTRIES);
  listeners.forEach((listener) => listener());
}

function getNextId(): number {
  if (typeof window === 'undefined') return 0;
  const nextId = window.__vlainaDiagnosticsNextId ?? 1;
  window.__vlainaDiagnosticsNextId = nextId + 1;
  return nextId;
}

function isDiagnosticsEnabled(): boolean {
  return Boolean(import.meta.env.DEV);
}

export function logDiagnostic(
  channel: string,
  event: string,
  details?: DiagnosticDetails,
  options?: { throttleKey?: string; throttleMs?: number },
): void {
  if (!isDiagnosticsEnabled() || typeof window === 'undefined') return;

  if (options?.throttleKey && options.throttleMs && options.throttleMs > 0) {
    const now = performance.now();
    const throttleKey = `${channel}:${options.throttleKey}`;
    const previous = lastEntryAtByKey.get(throttleKey) ?? 0;
    if (now - previous < options.throttleMs) return;
    lastEntryAtByKey.set(throttleKey, now);
  }

  const resolvedDetails = typeof details === 'function' ? details() : details;

  setLog([
    ...getLog(),
    {
      id: getNextId(),
      at: new Date().toISOString(),
      channel,
      event,
      details: resolvedDetails,
    },
  ]);
}

export function clearDiagnosticsLog(): void {
  lastEntryAtByKey.clear();
  setLog([]);
}

export function getDiagnosticsLogText(): string {
  return JSON.stringify({
    diagnostic: 'vlaina',
    generatedAt: new Date().toISOString(),
    href: typeof window === 'undefined' ? null : window.location.href,
    userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
    platform: typeof navigator === 'undefined' ? null : navigator.platform,
    viewport: typeof window === 'undefined'
      ? null
      : {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        },
    entries: getLog(),
  }, null, 2);
}

export function getDiagnosticsEntryCount(): number {
  return getLog().length;
}

export function subscribeDiagnostics(listener: DiagnosticListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
