import { sanitizeMermaidMarkup } from '@/components/common/markdown/mermaidSanitizer';
import { getMermaidDiagramType } from '@/components/common/markdown/mermaidDiagramType';
import { waitForMermaidInteractionIdle } from '@/components/common/markdown/mermaidRenderScheduler';
import { normalizeMermaidEditorCodeInput } from './mermaidFenceCode';
import { themeLazyLoadTokens } from '@/styles/themeTokens';
import {
  clearMermaidRenderCaches,
  getActiveMermaidRenderCount,
  getMermaidRenderCode,
  getPendingMermaidRenderCount,
  isLikelyIncompleteMermaidRenderCode,
  isMermaidRenderCodeTooLarge,
  mermaidEmptyMarkup,
  mermaidRenderErrorMarkup,
  mermaidRenderTooLargeMarkup,
  readCachedMermaidMarkup,
  releaseMermaidRenderConsumer,
  resolveMermaidMarkup,
  type MermaidRender,
  type MermaidRenderPriority,
  MAX_CONCURRENT_MERMAID_RENDERS,
} from './mermaidMarkup';

const mermaidElementCode = new WeakMap<HTMLElement, string>();
let mermaidRenderKeyCounter = 0;
const mermaidLazyObservers = new WeakMap<HTMLElement, IntersectionObserver>();
const disposedMermaidElements = new WeakSet<HTMLElement>();
type MermaidBackgroundPreload = {
  anchor: HTMLElement;
  cancelled: boolean;
  codeSnapshot: string;
  renderKey: string | undefined;
  started: boolean;
};
const MAX_PENDING_MERMAID_BACKGROUND_PRELOADS = 40;
const mermaidBackgroundPreloadQueue: MermaidBackgroundPreload[] = [];
const mermaidBackgroundPreloads = new WeakMap<HTMLElement, MermaidBackgroundPreload>();
let pendingMermaidBackgroundPreloadCount = 0;
export const MAX_LEGACY_MERMAID_DATA_CODE_CHARS = 100_000;
export {
  clearMermaidRenderCaches,
  getActiveMermaidRenderCount,
  getPendingMermaidRenderCount,
  resolveMermaidMarkup,
  MAX_CONCURRENT_MERMAID_RENDERS,
};

function setMermaidElementCode(element: HTMLElement, code: string) {
  disposedMermaidElements.delete(element);
  mermaidElementCode.set(element, code);
  element.dataset.renderKey = `mermaid-render-${mermaidRenderKeyCounter++}`;
  const diagramType = getMermaidDiagramType(code);
  if (diagramType) {
    element.dataset.mermaidDiagram = diagramType;
  } else {
    delete element.dataset.mermaidDiagram;
  }
  delete element.dataset.code;
  return element.dataset.renderKey;
}

export function updateMermaidElementCode(element: HTMLElement, code: string) {
  return setMermaidElementCode(element, normalizeMermaidEditorCodeInput(code));
}

export function getMermaidElementCode(element: HTMLElement) {
  const code = mermaidElementCode.get(element);
  if (code != null) return code;

  const legacyCode = element.dataset.code ?? '';
  return legacyCode.length > MAX_LEGACY_MERMAID_DATA_CODE_CHARS
    ? legacyCode.slice(0, MAX_LEGACY_MERMAID_DATA_CODE_CHARS)
    : legacyCode;
}

export async function renderMermaidEditorLivePreview(args: {
  anchor: HTMLElement | null;
  code: string;
  render?: MermaidRender;
  onRendered?: () => void;
}) {
  const { anchor, code, render, onRendered } = args;
  if (!anchor) {
    return false;
  }
  cancelMermaidBackgroundPreload(anchor);
  disconnectLazyMermaidRender(anchor);
  releaseMermaidRenderConsumer(anchor);

  const normalizedCode = normalizeMermaidEditorCodeInput(code);
  const renderCode = getMermaidRenderCode(normalizedCode);

  if (!normalizedCode.trim()) {
    setMermaidElementCode(anchor, normalizedCode);
    anchor.innerHTML = mermaidEmptyMarkup();
    onRendered?.();
    return true;
  }

  const codeSnapshot = normalizedCode;
  const renderCodeSnapshot = renderCode;
  const renderKey = setMermaidElementCode(anchor, codeSnapshot);

  if (isMermaidRenderCodeTooLarge(renderCodeSnapshot)) {
    anchor.innerHTML = sanitizeMermaidMarkup(mermaidRenderTooLargeMarkup());
    onRendered?.();
    return true;
  }
  if (isLikelyIncompleteMermaidRenderCode(renderCodeSnapshot)) {
    anchor.innerHTML = sanitizeMermaidMarkup(mermaidRenderErrorMarkup());
    onRendered?.();
    return true;
  }

  const cachedMarkup = render ? null : readCachedMermaidMarkup(renderCodeSnapshot);
  if (cachedMarkup != null) {
    anchor.innerHTML = cachedMarkup;
    onRendered?.();
    return true;
  }

  const markup = await resolveMermaidMarkup(renderCodeSnapshot, render, 'interactive', anchor);
  if (
    disposedMermaidElements.has(anchor) ||
    !anchor.isConnected ||
    getMermaidElementCode(anchor) !== codeSnapshot ||
    anchor.dataset.renderKey !== renderKey
  ) {
    return false;
  }

  anchor.innerHTML = markup;
  onRendered?.();
  return true;
}

function shouldLazyRenderMermaidElement() {
  return typeof window !== 'undefined' && typeof IntersectionObserver !== 'undefined';
}

function disconnectLazyMermaidRender(anchor: HTMLElement) {
  mermaidLazyObservers.get(anchor)?.disconnect();
  mermaidLazyObservers.delete(anchor);
  delete anchor.dataset.mermaidLazy;
}

export function cancelMermaidElementRender(anchor: HTMLElement) {
  cancelMermaidBackgroundPreload(anchor);
  disconnectLazyMermaidRender(anchor);
  releaseMermaidRenderConsumer(anchor);
}

export function disposeMermaidElement(anchor: HTMLElement) {
  disposedMermaidElements.add(anchor);
  cancelMermaidBackgroundPreload(anchor);
  disconnectLazyMermaidRender(anchor);
  releaseMermaidRenderConsumer(anchor);
}

function setMermaidPendingMarkup(anchor: HTMLElement) {
  anchor.innerHTML = '<div class="mermaid-placeholder" aria-hidden="true"></div>';
}

function renderMermaidElementAsync(
  anchor: HTMLElement,
  codeSnapshot: string,
  renderKey: string | undefined,
  priority: MermaidRenderPriority = 'background',
  releaseExisting = true,
) {
  const renderCodeSnapshot = getMermaidRenderCode(codeSnapshot);
  if (releaseExisting) {
    releaseMermaidRenderConsumer(anchor);
  }
  return resolveMermaidMarkup(renderCodeSnapshot, undefined, priority, anchor).then(async (markup) => {
    await waitForMermaidInteractionIdle();
    if (
      disposedMermaidElements.has(anchor) ||
      getMermaidElementCode(anchor) !== codeSnapshot ||
      anchor.dataset.renderKey !== renderKey
    ) {
      return;
    }
    disconnectLazyMermaidRender(anchor);
    anchor.innerHTML = markup;
  });
}

function drainMermaidBackgroundPreloads() {
  while (
    pendingMermaidBackgroundPreloadCount < MAX_PENDING_MERMAID_BACKGROUND_PRELOADS &&
    mermaidBackgroundPreloadQueue.length > 0
  ) {
    const preload = mermaidBackgroundPreloadQueue.shift();
    if (!preload || preload.cancelled) continue;
    preload.started = true;
    pendingMermaidBackgroundPreloadCount += 1;
    const finish = () => {
      pendingMermaidBackgroundPreloadCount -= 1;
      if (mermaidBackgroundPreloads.get(preload.anchor) === preload) {
        mermaidBackgroundPreloads.delete(preload.anchor);
      }
      drainMermaidBackgroundPreloads();
    };
    void renderMermaidElementAsync(
      preload.anchor,
      preload.codeSnapshot,
      preload.renderKey,
    ).then(finish, finish);
  }
}

function cancelMermaidBackgroundPreload(anchor: HTMLElement) {
  const preload = mermaidBackgroundPreloads.get(anchor);
  if (!preload) return;
  preload.cancelled = true;
  mermaidBackgroundPreloads.delete(anchor);
  drainMermaidBackgroundPreloads();
}

function queueMermaidBackgroundPreload(
  anchor: HTMLElement,
  codeSnapshot: string,
  renderKey: string | undefined,
) {
  const preload = { anchor, cancelled: false, codeSnapshot, renderKey, started: false };
  mermaidBackgroundPreloads.set(anchor, preload);
  mermaidBackgroundPreloadQueue.push(preload);
  drainMermaidBackgroundPreloads();
}

function isMermaidElementVisible(anchor: HTMLElement) {
  const rect = anchor.getBoundingClientRect();
  return rect.bottom > 0
    && rect.right > 0
    && rect.top < window.innerHeight
    && rect.left < window.innerWidth;
}

function installLazyMermaidRender(
  anchor: HTMLElement,
  codeSnapshot: string,
  renderKey: string | undefined,
  priority?: MermaidRenderPriority,
) {
  anchor.dataset.mermaidLazy = 'true';
  setMermaidPendingMarkup(anchor);

  let isIntersecting = false;
  let waitingForIdle = false;

  const renderIfStillIntersecting = async () => {
    if (!isIntersecting || waitingForIdle) return;
    waitingForIdle = true;
    await waitForMermaidInteractionIdle();
    waitingForIdle = false;
    if (!isIntersecting || disposedMermaidElements.has(anchor)) return;

    disconnectLazyMermaidRender(anchor);
    const preload = mermaidBackgroundPreloads.get(anchor);
    const renderPriority = priority
      ?? (isMermaidElementVisible(anchor) ? 'interactive' : 'background');
    if (preload?.started) {
      void renderMermaidElementAsync(anchor, codeSnapshot, renderKey, renderPriority, false);
      return;
    }
    cancelMermaidBackgroundPreload(anchor);
    renderMermaidElementAsync(
      anchor,
      codeSnapshot,
      renderKey,
      renderPriority,
    );
  };

  const observer = new IntersectionObserver((entries) => {
    const entry = entries.find((candidate) => candidate.target === anchor) ?? entries.at(-1);
    isIntersecting = entry?.isIntersecting ?? false;
    void renderIfStillIntersecting();
  }, {
    scrollMargin: themeLazyLoadTokens.mermaidPreloadMargin,
  });
  mermaidLazyObservers.set(anchor, observer);
  observer.observe(anchor);
}

export function createMermaidElement(
  code: string,
  options: {
    preloadBackground?: boolean;
    priority?: MermaidRenderPriority;
    render?: boolean;
  } = {},
) {
  const normalizedCode = normalizeMermaidEditorCodeInput(code);
  const renderCode = getMermaidRenderCode(normalizedCode);
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-type', 'mermaid');
  setMermaidElementCode(wrapper, normalizedCode);
  wrapper.className = 'mermaid-block theme-mermaid md-fences md-diagram md-fences-advanced md-diagram-panel md-diagram-panel-preview';

  if (normalizedCode.trim()) {
    if (isMermaidRenderCodeTooLarge(renderCode)) {
      wrapper.innerHTML = sanitizeMermaidMarkup(mermaidRenderTooLargeMarkup());
      return wrapper;
    }

    if (options.render === false) {
      setMermaidPendingMarkup(wrapper);
      return wrapper;
    }

    const cachedMarkup = readCachedMermaidMarkup(renderCode);
    if (cachedMarkup != null) {
      wrapper.innerHTML = cachedMarkup;
      return wrapper;
    }

    const codeSnapshot = normalizedCode;
    const renderKey = wrapper.dataset.renderKey;
    if (shouldLazyRenderMermaidElement()) {
      installLazyMermaidRender(wrapper, codeSnapshot, renderKey, options.priority);
      if (options.preloadBackground === true) {
        queueMermaidBackgroundPreload(wrapper, codeSnapshot, renderKey);
      }
    } else {
      renderMermaidElementAsync(
        wrapper,
        codeSnapshot,
        renderKey,
        options.priority ?? 'background',
      );
    }
  } else {
    wrapper.innerHTML = mermaidEmptyMarkup();
  }

  return wrapper;
}

export function createCachedMermaidElement(code: string) {
  const normalizedCode = normalizeMermaidEditorCodeInput(code);
  if (!normalizedCode.trim()) return null;
  const cachedMarkup = readCachedMermaidMarkup(getMermaidRenderCode(normalizedCode));
  if (cachedMarkup == null) return null;

  const wrapper = createMermaidElement(normalizedCode, { render: false });
  wrapper.innerHTML = cachedMarkup;
  return wrapper;
}
