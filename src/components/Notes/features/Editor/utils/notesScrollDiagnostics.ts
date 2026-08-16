import { logDiagnostic } from '@/lib/diagnostics/diagnosticsLog';

const NOTE_SCROLL_ROOT_SELECTOR = '[data-note-scroll-root="true"]';
const NOTE_TOOLBAR_ROOT_SELECTOR = '[data-note-toolbar-root="true"]';

function describeElement(element: Element | null): string | undefined {
  if (!element) return undefined;
  if (element instanceof HTMLElement) {
    return element.dataset.noteSourceEditor === 'true'
      ? 'note-source-editor'
      : element.getAttribute('role') ?? element.tagName.toLowerCase();
  }
  return element.tagName.toLowerCase();
}

export function findNoteScrollRoot(anchor?: Element | null): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  const toolbarRoot = anchor?.closest<HTMLElement>(NOTE_TOOLBAR_ROOT_SELECTOR);
  return toolbarRoot?.querySelector<HTMLElement>(NOTE_SCROLL_ROOT_SELECTOR)
    ?? anchor?.closest<HTMLElement>(NOTE_SCROLL_ROOT_SELECTOR)
    ?? document.querySelector<HTMLElement>(NOTE_SCROLL_ROOT_SELECTOR);
}

export function readNoteScrollSnapshot(scrollRoot: HTMLElement | null): Record<string, unknown> {
  const activeElement = typeof document === 'undefined' ? null : document.activeElement;
  return {
    activeElement: describeElement(activeElement),
    clientHeight: scrollRoot?.clientHeight ?? null,
    scrollHeight: scrollRoot?.scrollHeight ?? null,
    scrollRootConnected: Boolean(scrollRoot?.isConnected),
    scrollTop: scrollRoot?.scrollTop ?? null,
    windowScrollY: typeof window === 'undefined' ? null : window.scrollY,
  };
}

export function logNoteScrollDiagnostic(
  event: string,
  scrollRoot: HTMLElement | null,
  details: Record<string, unknown> = {},
  options?: {
    includeSnapshot?: boolean;
    throttleKey?: string;
    throttleMs?: number;
  },
): void {
  // Scroll diagnostics are development-only; avoid layout reads in production.
  if (!import.meta.env.DEV) return;

  const { includeSnapshot = true, ...logOptions } = options ?? {};
  logDiagnostic('notes-scroll', event, {
    ...(includeSnapshot ? readNoteScrollSnapshot(scrollRoot) : {}),
    ...details,
  }, logOptions);
}
