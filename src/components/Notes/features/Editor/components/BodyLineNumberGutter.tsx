import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  resolveBodyLineNumberLabelLayoutFromLineNumbers,
  syncBodyLineNumberLabelSelection,
  type BodyLineNumberLabel,
  type BodyLineNumberLabelLayout,
} from '../utils/bodyLineNumberLayout';
import {
  resolveBodyLineNumberWindow,
  type BodyLineNumberWindow,
} from '../utils/bodyLineNumberWindow';
import { observeBodyLineNumberGutterLayout } from '../utils/bodyLineNumberGutterObservers';
import { createBodyLineNumberRefreshScheduler } from '../utils/bodyLineNumberRefreshScheduler';
import { getMarkdownBodyLineNumbers } from '../utils/bodyLineNumbers';
import {
  BLOCK_SELECTION_PREVIEW_CHANGE_EVENT,
  getBlockSelectionPreviewElements,
  isBlockSelectionInteractionPending,
} from '../plugins/cursor/blockSelectionInteractionState';

const BLOCK_SELECTION_PENDING_CLASS = 'editor-block-selection-pending';
const BLOCK_DRAG_ACTIVE_CLASS = 'editor-block-drag-active';
const DEFERRED_BLOCK_INTERACTION_REFRESH_RETRY_MS = 80;
const POINTER_INTERACTION_REFRESH_FALLBACK_MS = 10_000;
const MAX_INCREMENTAL_SELECTION_SYNC_MUTATION_RECORDS = 512;
const EMPTY_BODY_LINE_NUMBER_LABEL_LAYOUT: BodyLineNumberLabelLayout = {
  labels: [],
  targets: [],
};
type RenderedBodyLineNumber = { index: number; label: BodyLineNumberLabel };

interface BodyLineNumberGutterProps {
  markdown: string;
  revision: number;
  shellRef: RefObject<HTMLDivElement | null>;
}

function syncRenderedLabelSelectionClasses(
  gutter: HTMLDivElement | null,
  layout: BodyLineNumberLabelLayout,
) {
  if (!gutter) return;
  for (const child of gutter.children) {
    if (!(child instanceof HTMLElement)) continue;
    const index = Number.parseInt(child.dataset.bodyLineNumberIndex ?? '', 10);
    if (!Number.isFinite(index)) continue;
    child.classList.toggle(
      'body-line-number-selected',
      layout.labels[index]?.selected === true,
    );
  }
}

export function BodyLineNumberGutter({ markdown, revision, shellRef }: BodyLineNumberGutterProps) {
  const [renderedLabels, setRenderedLabels] = useState<RenderedBodyLineNumber[]>([]);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef<BodyLineNumberLabelLayout>(EMPTY_BODY_LINE_NUMBER_LABEL_LAYOUT);
  const parsedMarkdownRef = useRef<{ markdown: string; lineNumbers: number[] } | null>(null);
  const renderedWindowRef = useRef<BodyLineNumberWindow | null>(null);
  const markdownRef = useRef(markdown);
  const refreshRef = useRef<(() => void) | null>(null);
  markdownRef.current = markdown;

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      layoutRef.current = EMPTY_BODY_LINE_NUMBER_LABEL_LAYOUT;
      renderedWindowRef.current = null;
      setRenderedLabels([]);
      return;
    }

    const resolvedShell: HTMLDivElement = shell;
    let frameId: number | null = null;
    let renderedWindowFrameId: number | null = null;
    let deferredBlockInteractionRefreshTimerId: number | null = null;
    let pointerInteractionFallbackTimerId: number | null = null;
    let needsRefreshAfterDeferredBlockInteraction = false;
    let pointerInteractionActive = false;
    let pendingDeferredSelectionSyncElements: Element[] | null = [];
    const editorRoot = resolvedShell.querySelector<HTMLElement>('.ProseMirror');
    const scrollRoot = resolvedShell.closest<HTMLElement>('[data-note-scroll-root="true"]');
    const layoutRefreshScheduler = createBodyLineNumberRefreshScheduler(scheduleLayoutRefreshFrame);

    function syncRenderedLabels(nextLayout: BodyLineNumberLabelLayout, force = false) {
      const shellRect = resolvedShell.getBoundingClientRect();
      const viewportRect = scrollRoot?.getBoundingClientRect() ?? shellRect;
      const nextWindow = resolveBodyLineNumberWindow(
        nextLayout.labels,
        viewportRect.top - shellRect.top,
        viewportRect.bottom - shellRect.top,
        renderedWindowRef.current,
      );
      if (
        !force &&
        nextWindow.start === renderedWindowRef.current?.start &&
        nextWindow.end === renderedWindowRef.current?.end
      ) {
        return;
      }
      renderedWindowRef.current = nextWindow;
      setRenderedLabels(nextLayout.labels.slice(nextWindow.start, nextWindow.end).map((label, offset) => ({
        index: nextWindow.start + offset,
        label,
      })));
    }

    function scheduleRenderedLabelWindowSync() {
      if (renderedWindowFrameId !== null) return;
      renderedWindowFrameId = requestAnimationFrame(() => {
        renderedWindowFrameId = null;
        syncRenderedLabels(layoutRef.current);
      });
    }

    function shouldDeferRefreshForBlockInteraction() {
      return editorRoot?.classList.contains(BLOCK_SELECTION_PENDING_CLASS) === true
        || (editorRoot ? isBlockSelectionInteractionPending(editorRoot) : false)
        || resolvedShell.ownerDocument.body.classList.contains(BLOCK_DRAG_ACTIVE_CLASS)
        || pointerInteractionActive;
    }

    function syncDeferredBlockSelectionState(
      changedElements?: readonly Element[],
      previewSelectedElements?: readonly HTMLElement[],
    ) {
      const currentLayout = layoutRef.current;
      const nextLayout = syncBodyLineNumberLabelSelection(editorRoot, currentLayout, {
        changedElements,
        previewSelectedElements,
      });
      if (nextLayout === currentLayout) return;

      layoutRef.current = nextLayout;
      syncRenderedLabelSelectionClasses(gutterRef.current, nextLayout);
    }

    function queueDeferredSelectionSyncElements(changedElements?: readonly Element[]) {
      if (!changedElements) {
        pendingDeferredSelectionSyncElements = null;
        return;
      }
      if (pendingDeferredSelectionSyncElements === null) {
        return;
      }
      if (
        pendingDeferredSelectionSyncElements.length + changedElements.length
        > MAX_INCREMENTAL_SELECTION_SYNC_MUTATION_RECORDS
      ) {
        pendingDeferredSelectionSyncElements = null;
        return;
      }
      pendingDeferredSelectionSyncElements.push(...changedElements);
    }

    function consumeDeferredSelectionSyncElements() {
      const changedElements = pendingDeferredSelectionSyncElements;
      pendingDeferredSelectionSyncElements = [];
      return changedElements ?? undefined;
    }

    function clearDeferredBlockInteractionRefresh() {
      if (deferredBlockInteractionRefreshTimerId === null) {
        return;
      }
      window.clearTimeout(deferredBlockInteractionRefreshTimerId);
      deferredBlockInteractionRefreshTimerId = null;
    }

    function clearPointerInteractionFallback() {
      if (pointerInteractionFallbackTimerId === null) {
        return;
      }
      window.clearTimeout(pointerInteractionFallbackTimerId);
      pointerInteractionFallbackTimerId = null;
    }

    function scheduleRefreshAfterDeferredBlockInteraction() {
      needsRefreshAfterDeferredBlockInteraction = true;
      if (deferredBlockInteractionRefreshTimerId !== null) {
        return;
      }

      deferredBlockInteractionRefreshTimerId = window.setTimeout(() => {
        deferredBlockInteractionRefreshTimerId = null;
        if (shouldDeferRefreshForBlockInteraction()) {
          scheduleRefreshAfterDeferredBlockInteraction();
          return;
        }
        if (!needsRefreshAfterDeferredBlockInteraction) {
          return;
        }
        needsRefreshAfterDeferredBlockInteraction = false;
        refresh();
      }, DEFERRED_BLOCK_INTERACTION_REFRESH_RETRY_MS);
    }

    function handlePointerInteractionStart() {
      pointerInteractionActive = true;
      clearPointerInteractionFallback();
      pointerInteractionFallbackTimerId = window.setTimeout(() => {
        pointerInteractionFallbackTimerId = null;
        handlePointerInteractionEnd();
      }, POINTER_INTERACTION_REFRESH_FALLBACK_MS);
    }

    function handlePointerInteractionEnd() {
      if (!pointerInteractionActive) {
        clearPointerInteractionFallback();
        return;
      }
      pointerInteractionActive = false;
      clearPointerInteractionFallback();
      if (needsRefreshAfterDeferredBlockInteraction) {
        syncDeferredBlockSelectionState();
        scheduleRefreshAfterDeferredBlockInteraction();
      }
    }

    function handleBlockSelectionPreviewChange() {
      if (!editorRoot) return;
      const previewSelectedElements = getBlockSelectionPreviewElements(editorRoot);
      syncDeferredBlockSelectionState(
        undefined,
        previewSelectedElements ?? undefined,
      );
    }

    function scheduleLayoutRefreshFrame() {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      frameId = requestAnimationFrame(() => {
        frameId = null;
        if (shouldDeferRefreshForBlockInteraction()) {
          const previewSelectedElements = editorRoot
            ? getBlockSelectionPreviewElements(editorRoot)
            : null;
          syncDeferredBlockSelectionState(
            consumeDeferredSelectionSyncElements(),
            previewSelectedElements ?? undefined,
          );
          scheduleRefreshAfterDeferredBlockInteraction();
          return;
        }
        pendingDeferredSelectionSyncElements = [];
        needsRefreshAfterDeferredBlockInteraction = false;
        clearDeferredBlockInteractionRefresh();
        const currentMarkdown = markdownRef.current;
        if (parsedMarkdownRef.current?.markdown !== currentMarkdown) {
          parsedMarkdownRef.current = {
            markdown: currentMarkdown,
            lineNumbers: getMarkdownBodyLineNumbers(currentMarkdown),
          };
        }
        const nextLayout = resolveBodyLineNumberLabelLayoutFromLineNumbers(
          resolvedShell,
          parsedMarkdownRef.current.lineNumbers,
        );
        layoutRefreshScheduler.markCompleted();
        layoutRef.current = nextLayout;
        syncRenderedLabels(nextLayout, true);
      });
    }

    function refresh(selectionSyncElements?: readonly Element[]) {
      queueDeferredSelectionSyncElements(selectionSyncElements);
      layoutRefreshScheduler.request(layoutRef.current.targets.length);
    }

    refreshRef.current = refresh;

    function handleWindowResize() {
      refresh();
    }

    const disconnectLayoutObservers = observeBodyLineNumberGutterLayout({
      shell: resolvedShell,
      editorRoot,
      onRefresh: refresh,
    });

    window.addEventListener('resize', handleWindowResize);
    scrollRoot?.addEventListener('scroll', scheduleRenderedLabelWindowSync, { passive: true });
    window.addEventListener('pointerdown', handlePointerInteractionStart, true);
    window.addEventListener('pointerup', handlePointerInteractionEnd, true);
    window.addEventListener('pointercancel', handlePointerInteractionEnd, true);
    window.addEventListener('mousedown', handlePointerInteractionStart, true);
    window.addEventListener('mouseup', handlePointerInteractionEnd, true);
    window.addEventListener('blur', handlePointerInteractionEnd);
    editorRoot?.addEventListener(BLOCK_SELECTION_PREVIEW_CHANGE_EVENT, handleBlockSelectionPreviewChange);

    return () => {
      if (refreshRef.current === refresh) {
        refreshRef.current = null;
      }
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      if (renderedWindowFrameId !== null) {
        cancelAnimationFrame(renderedWindowFrameId);
      }
      layoutRefreshScheduler.cancel();
      clearDeferredBlockInteractionRefresh();
      clearPointerInteractionFallback();
      disconnectLayoutObservers();
      window.removeEventListener('resize', handleWindowResize);
      scrollRoot?.removeEventListener('scroll', scheduleRenderedLabelWindowSync);
      window.removeEventListener('pointerdown', handlePointerInteractionStart, true);
      window.removeEventListener('pointerup', handlePointerInteractionEnd, true);
      window.removeEventListener('pointercancel', handlePointerInteractionEnd, true);
      window.removeEventListener('mousedown', handlePointerInteractionStart, true);
      window.removeEventListener('mouseup', handlePointerInteractionEnd, true);
      window.removeEventListener('blur', handlePointerInteractionEnd);
      editorRoot?.removeEventListener(BLOCK_SELECTION_PREVIEW_CHANGE_EVENT, handleBlockSelectionPreviewChange);
    };
  }, [revision, shellRef]);

  useEffect(() => {
    refreshRef.current?.();
  }, [markdown]);

  useLayoutEffect(() => {
    syncRenderedLabelSelectionClasses(gutterRef.current, layoutRef.current);
  });

  return (
    <div ref={gutterRef} className="body-line-number-gutter" aria-hidden="true">
      {renderedLabels.map(({ index, label }) => (
        <span
          key={`${label.lineNumber}-${index}`}
          data-body-line-number-index={index}
          className={
            label.selected
              ? 'body-line-number body-line-number-selected'
              : 'body-line-number'
          }
          style={{
            left: label.left,
            top: label.top,
          }}
        >
          {label.lineNumber}
        </span>
      ))}
    </div>
  );
}
