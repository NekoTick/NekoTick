import { OVERLAY_SCROLL_IDLE_EVENT } from '@/components/ui/overlayScrollAreaEvents';
import { POINTER_SELECTION_ACTIVE_ATTRIBUTE } from '../selection/textSelectionOverlayState';

export type MermaidRenderPriority = 'background' | 'interactive';

type MermaidRenderQueueEntry = {
  cacheKey: string;
  cancel: () => void;
  priority: MermaidRenderPriority;
  run: () => Promise<void>;
};

export const MAX_CONCURRENT_MERMAID_RENDERS = 2;
const mermaidRenderQueue: MermaidRenderQueueEntry[] = [];
let activeMermaidRenderCount = 0;
let mermaidRenderDrainTimer: ReturnType<typeof setTimeout> | null = null;
let isWaitingForOverlayScrollIdle = false;

function isMermaidRenderInteractionActive(): boolean {
  return typeof document !== 'undefined' && Boolean(document.querySelector(
    [
      '[data-note-scroll-root="true"][data-overlay-scrollbar-interacting="true"]',
      `[${POINTER_SELECTION_ACTIVE_ATTRIBUTE}="true"]`,
    ].join(', ')
  ));
}

function stopWaitingForOverlayScrollIdle() {
  if (!isWaitingForOverlayScrollIdle || typeof window === 'undefined') return;
  window.removeEventListener(OVERLAY_SCROLL_IDLE_EVENT, handleOverlayScrollIdle);
  window.removeEventListener('mouseup', handleOverlayScrollIdle);
  window.removeEventListener('blur', handleOverlayScrollIdle);
  isWaitingForOverlayScrollIdle = false;
}

function handleOverlayScrollIdle() {
  if (isMermaidRenderInteractionActive()) return;
  stopWaitingForOverlayScrollIdle();
  scheduleMermaidRenderDrain();
}

function waitForOverlayScrollIdle() {
  if (isWaitingForOverlayScrollIdle || typeof window === 'undefined') return;
  window.addEventListener(OVERLAY_SCROLL_IDLE_EVENT, handleOverlayScrollIdle);
  window.addEventListener('mouseup', handleOverlayScrollIdle);
  window.addEventListener('blur', handleOverlayScrollIdle);
  isWaitingForOverlayScrollIdle = true;
}

function scheduleMermaidRenderDrain() {
  if (mermaidRenderQueue.length === 0) {
    stopWaitingForOverlayScrollIdle();
    return;
  }
  if (
    mermaidRenderDrainTimer !== null ||
    activeMermaidRenderCount >= MAX_CONCURRENT_MERMAID_RENDERS ||
    isWaitingForOverlayScrollIdle
  ) {
    return;
  }

  stopWaitingForOverlayScrollIdle();
  mermaidRenderDrainTimer = setTimeout(() => {
    mermaidRenderDrainTimer = null;
    if (isMermaidRenderInteractionActive()) {
      waitForOverlayScrollIdle();
      return;
    }

    const next = mermaidRenderQueue.shift();
    if (!next) return;
    activeMermaidRenderCount += 1;
    void next.run().finally(() => {
      activeMermaidRenderCount -= 1;
      scheduleMermaidRenderDrain();
    });
    scheduleMermaidRenderDrain();
  }, 0);
}

function promoteQueuedMermaidRender(cacheKey: string) {
  const queuedIndex = mermaidRenderQueue.findIndex((entry) => entry.cacheKey === cacheKey);
  if (queuedIndex < 0 || mermaidRenderQueue[queuedIndex]?.priority === 'interactive') return;

  const [entry] = mermaidRenderQueue.splice(queuedIndex, 1);
  if (!entry) return;
  entry.priority = 'interactive';
  const firstBackgroundIndex = mermaidRenderQueue.findIndex(
    (queued) => queued.priority === 'background'
  );
  mermaidRenderQueue.splice(
    firstBackgroundIndex < 0 ? mermaidRenderQueue.length : firstBackgroundIndex,
    0,
    entry,
  );
}

export function scheduleMermaidRender<T>(
  cacheKey: string,
  priority: MermaidRenderPriority,
  render: () => Promise<T>,
  cancelledValue: T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const entry: MermaidRenderQueueEntry = {
      cacheKey,
      cancel: () => {
        if (settled) return;
        settled = true;
        resolve(cancelledValue);
      },
      priority,
      run: async () => {
        try {
          const result = await render();
          if (settled) return;
          settled = true;
          resolve(result);
        } catch (error) {
          if (settled) return;
          settled = true;
          reject(error);
        }
      },
    };
    const firstBackgroundIndex = mermaidRenderQueue.findIndex(
      (queued) => queued.priority === 'background'
    );
    if (priority === 'interactive' && firstBackgroundIndex >= 0) {
      mermaidRenderQueue.splice(firstBackgroundIndex, 0, entry);
    } else {
      mermaidRenderQueue.push(entry);
    }
    scheduleMermaidRenderDrain();
  });
}

export function promoteMermaidRender(cacheKey: string) {
  promoteQueuedMermaidRender(cacheKey);
}

export function cancelQueuedMermaidRender(cacheKey: string): boolean {
  const queuedIndex = mermaidRenderQueue.findIndex((entry) => entry.cacheKey === cacheKey);
  if (queuedIndex < 0) return false;

  const [entry] = mermaidRenderQueue.splice(queuedIndex, 1);
  if (!entry) return false;
  entry.cancel();
  if (mermaidRenderQueue.length === 0) {
    stopWaitingForOverlayScrollIdle();
  }
  return true;
}

export function getActiveMermaidRenderCount(): number {
  return activeMermaidRenderCount;
}
