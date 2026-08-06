import { OVERLAY_SCROLL_IDLE_EVENT } from '@/components/ui/overlayScrollAreaEvents';
import { MAX_CONCURRENT_MERMAID_RENDERS } from './mermaidRenderCapacity';

export type MermaidRenderPriority = 'background' | 'interactive';
export type MermaidRenderTask<T> = {
  cancel: () => boolean;
  promise: Promise<T>;
  promote: () => void;
};

type MermaidRenderQueueEntry = {
  group: string;
  priority: MermaidRenderPriority;
  run: () => Promise<void>;
  state: 'active' | 'queued' | 'settled';
};

export const MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS =
  Math.min(3, MAX_CONCURRENT_MERMAID_RENDERS - 1);

const queue: MermaidRenderQueueEntry[] = [];
const activeByGroup = new Map<string, number>();
let activeCount = 0;
let activeBackgroundCount = 0;
let drainTimer: ReturnType<typeof setTimeout> | null = null;
let waitingForInteractionEnd = false;
let interactionIdlePromise: Promise<void> | null = null;

function isInteractionActive() {
  return typeof document !== 'undefined' && Boolean(document.querySelector([
    '[data-overlay-scrollbar-interacting="true"]',
    '[data-editor-pointer-selecting="true"]',
    '[data-layout-panel-dragging="true"]',
  ].join(', ')));
}

function stopWaitingForInteractionEnd() {
  if (!waitingForInteractionEnd || typeof window === 'undefined') return;
  window.removeEventListener(OVERLAY_SCROLL_IDLE_EVENT, handleInteractionEnd);
  window.removeEventListener('mouseup', handleInteractionEnd);
  window.removeEventListener('pointerup', handleInteractionEnd);
  window.removeEventListener('blur', handleInteractionEnd);
  waitingForInteractionEnd = false;
}

function handleInteractionEnd() {
  setTimeout(() => {
    if (isInteractionActive()) return;
    stopWaitingForInteractionEnd();
    drain();
  }, 0);
}

function waitForInteractionEnd() {
  if (waitingForInteractionEnd || typeof window === 'undefined') return;
  window.addEventListener(OVERLAY_SCROLL_IDLE_EVENT, handleInteractionEnd);
  window.addEventListener('mouseup', handleInteractionEnd);
  window.addEventListener('pointerup', handleInteractionEnd);
  window.addEventListener('blur', handleInteractionEnd);
  waitingForInteractionEnd = true;
}

export function waitForMermaidInteractionIdle() {
  if (!isInteractionActive()) return Promise.resolve();
  if (interactionIdlePromise) return interactionIdlePromise;

  interactionIdlePromise = new Promise<void>((resolve) => {
    const finish = () => {
      setTimeout(() => {
        if (isInteractionActive()) return;
        window.removeEventListener(OVERLAY_SCROLL_IDLE_EVENT, finish);
        window.removeEventListener('mouseup', finish);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('blur', finish);
        interactionIdlePromise = null;
        resolve();
      }, 0);
    };
    window.addEventListener(OVERLAY_SCROLL_IDLE_EVENT, finish);
    window.addEventListener('mouseup', finish);
    window.addEventListener('pointerup', finish);
    window.addEventListener('blur', finish);
  });
  return interactionIdlePromise;
}

function canStart(entry: MermaidRenderQueueEntry | undefined) {
  if (!entry || activeCount >= MAX_CONCURRENT_MERMAID_RENDERS) return false;
  return entry.priority === 'interactive'
    || activeBackgroundCount < MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS;
}

function insertByPriority(entry: MermaidRenderQueueEntry) {
  if (entry.priority === 'background') {
    queue.push(entry);
    return;
  }
  const firstBackgroundIndex = queue.findIndex((queued) => queued.priority === 'background');
  queue.splice(firstBackgroundIndex < 0 ? queue.length : firstBackgroundIndex, 0, entry);
}

function drain() {
  if (queue.length === 0) {
    stopWaitingForInteractionEnd();
    return;
  }
  if (drainTimer !== null || !canStart(queue[0]) || waitingForInteractionEnd) return;

  drainTimer = setTimeout(() => {
    drainTimer = null;
    if (isInteractionActive()) {
      waitForInteractionEnd();
      return;
    }

    const entry = queue[0];
    if (!canStart(entry)) return;
    queue.shift();
    entry.state = 'active';
    activeCount += 1;
    activeByGroup.set(entry.group, (activeByGroup.get(entry.group) ?? 0) + 1);
    if (entry.priority === 'background') activeBackgroundCount += 1;

    void entry.run().finally(() => {
      entry.state = 'settled';
      activeCount -= 1;
      activeByGroup.set(entry.group, Math.max(0, (activeByGroup.get(entry.group) ?? 1) - 1));
      if (entry.priority === 'background') activeBackgroundCount -= 1;
      drain();
    });
    drain();
  }, 0);
}

export function scheduleMermaidRenderTask<T>(args: {
  cancelledValue: T;
  group: string;
  priority: MermaidRenderPriority;
  render: () => Promise<T>;
}): MermaidRenderTask<T> {
  let resolvePromise = (_value: T) => {};
  let rejectPromise = (_error: unknown) => {};
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const entry: MermaidRenderQueueEntry = {
    group: args.group,
    priority: args.priority,
    state: 'queued',
    run: async () => {
      try {
        resolvePromise(await args.render());
      } catch (error) {
        rejectPromise(error);
      }
    },
  };
  insertByPriority(entry);
  drain();

  return {
    promise,
    cancel: () => {
      if (entry.state !== 'queued') return false;
      const index = queue.indexOf(entry);
      if (index < 0) return false;
      queue.splice(index, 1);
      entry.state = 'settled';
      resolvePromise(args.cancelledValue);
      drain();
      return true;
    },
    promote: () => {
      if (entry.state !== 'queued' || entry.priority === 'interactive') return;
      const index = queue.indexOf(entry);
      if (index < 0) return;
      queue.splice(index, 1);
      entry.priority = 'interactive';
      insertByPriority(entry);
      drain();
    },
  };
}

export function getActiveMermaidRenderCount(group?: string) {
  return group ? activeByGroup.get(group) ?? 0 : activeCount;
}
