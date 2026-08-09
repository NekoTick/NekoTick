import { AllSelection, Selection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  LARGE_SELECTION_MIN_RANGE_SIZE,
  isLargeEditorAllSelection,
  isLargeEditorSelectionRange,
  isStructurallyLargeEditorSelectionRange,
  isLargeEditorTextSelection,
} from './textSelectionOverlayState';
import {
  createVisibleLargeSelectionRanges,
  setLargeSelectionHighlightRanges,
  type LargeSelectionHighlightSpec,
} from './largeSelectionHighlightRanges';

interface ProseMirrorDocView {
  setSelection: (
    anchor: number,
    head: number,
    view: EditorView,
    force?: boolean,
  ) => void;
}

function getLargeSelectionBoundary(event: KeyboardEvent): 'end' | 'start' | null {
  if (event.isComposing || !event.shiftKey || event.altKey) return null;
  if (event.ctrlKey && event.key === 'End') return 'end';
  if (event.ctrlKey && event.key === 'Home') return 'start';
  if (event.metaKey && (event.key === 'ArrowDown' || event.key === 'End')) return 'end';
  if (event.metaKey && (event.key === 'ArrowUp' || event.key === 'Home')) return 'start';
  return null;
}

function getCollapseBoundary(event: KeyboardEvent): 'end' | 'start' | null {
  if (event.isComposing || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
    return null;
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') return 'start';
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') return 'end';
  return null;
}

function createBoundaryHighlightSpec(
  view: EditorView,
  boundary: 'end' | 'start',
): Extract<LargeSelectionHighlightSpec, { type: 'boundary' }> | null {
  const nativeSelection = view.root.getSelection();
  const anchorNode = nativeSelection?.anchorNode;
  if (!nativeSelection || !anchorNode || !(anchorNode === view.dom || view.dom.contains(anchorNode))) {
    return null;
  }

  return {
    anchorNode,
    anchorOffset: nativeSelection.anchorOffset,
    boundary,
    type: 'boundary',
  };
}

function scheduleBoundaryScroll(view: EditorView, boundary: 'end' | 'start'): void {
  const scrollRoot = view.dom.closest<HTMLElement>('[data-note-scroll-root="true"]');
  view.dom.ownerDocument.defaultView?.requestAnimationFrame(() => {
    if (scrollRoot) {
      scrollRoot.scrollTop = boundary === 'end' ? scrollRoot.scrollHeight : 0;
    }
  });
}

function createTextSelectionToBoundary(
  doc: EditorView['state']['doc'],
  selection: TextSelection,
  boundary: 'end' | 'start',
): TextSelection | null {
  const candidate = boundary === 'end'
    ? Math.max(1, doc.content.size - 1)
    : 1;

  try {
    const resolved = doc.resolve(candidate);
    if (resolved.parent.inlineContent) {
      return new TextSelection(selection.$anchor, resolved);
    }
  } catch {
    // Fall back to ProseMirror's structural search below.
  }

  const fallback = boundary === 'end' ? Selection.atEnd(doc) : Selection.atStart(doc);
  return fallback instanceof TextSelection
    ? new TextSelection(selection.$anchor, fallback.$head)
    : null;
}

export function installLargeSelectionHighlight(view: EditorView): {
  destroy: () => void;
  handleKeyDown: (event: KeyboardEvent) => boolean;
  update: () => void;
} {
  let docView: ProseMirrorDocView | null = null;
  let originalSetSelection: ProseMirrorDocView['setSelection'] | null = null;
  let fastSetSelection: ProseMirrorDocView['setSelection'] | null = null;
  let highlightSpec: LargeSelectionHighlightSpec | null = null;
  let refreshFrame: number | null = null;
  const allSelectionSpec: LargeSelectionHighlightSpec = { type: 'all' };
  const scrollRoot = view.dom.closest('[data-note-scroll-root="true"]');

  const renderHighlight = () => {
    if (!highlightSpec) {
      setLargeSelectionHighlightRanges(view, null);
      return;
    }
    const visibleHighlight = createVisibleLargeSelectionRanges(view, highlightSpec);
    const useVisibleElementFallback = (
      view.state.selection.to - view.state.selection.from < LARGE_SELECTION_MIN_RANGE_SIZE
      && isStructurallyLargeEditorSelectionRange(view.state.doc, view.state.selection)
    );
    setLargeSelectionHighlightRanges(
      view,
      visibleHighlight.ranges,
      useVisibleElementFallback ? visibleHighlight.elements : [],
    );
  };

  const scheduleHighlightRefresh = () => {
    if (!highlightSpec || refreshFrame !== null) return;
    refreshFrame = view.dom.ownerDocument.defaultView?.requestAnimationFrame(() => {
      refreshFrame = null;
      renderHighlight();
    }) ?? null;
  };

  const syncHighlight = () => {
    if (isLargeEditorAllSelection(view.state)) {
      if (highlightSpec !== allSelectionSpec) {
        highlightSpec = allSelectionSpec;
        renderHighlight();
      }
      return;
    }
    if (isLargeEditorTextSelection(view.state) && highlightSpec?.type === 'boundary') {
      return;
    }
    if (highlightSpec) {
      highlightSpec = null;
      renderHighlight();
    }
  };

  const restore = () => {
    if (refreshFrame !== null) {
      view.dom.ownerDocument.defaultView?.cancelAnimationFrame(refreshFrame);
      refreshFrame = null;
    }
    highlightSpec = null;
    setLargeSelectionHighlightRanges(view, null);
    if (docView && originalSetSelection && docView.setSelection === fastSetSelection) {
      docView.setSelection = originalSetSelection;
    }
    docView = null;
    originalSetSelection = null;
    fastSetSelection = null;
  };

  const update = () => {
    // ProseMirror's full native DOM range is replaced by the bounded highlight for large selections.
    const nextDocView = (view as unknown as { docView?: ProseMirrorDocView }).docView ?? null;
    if (nextDocView === docView) {
      syncHighlight();
      return;
    }
    restore();
    if (!nextDocView) return;

    docView = nextDocView;
    originalSetSelection = nextDocView.setSelection;
    fastSetSelection = function (this: ProseMirrorDocView, anchor, head, targetView, force) {
      if (
        isLargeEditorAllSelection(targetView.state)
        || (isLargeEditorTextSelection(targetView.state) && highlightSpec?.type === 'boundary')
      ) {
        syncHighlight();
        const nativeAnchor = targetView.state.selection instanceof AllSelection
          ? 0
          : targetView.state.selection.anchor;
        originalSetSelection!.call(this, nativeAnchor, nativeAnchor, targetView, force);
        return;
      }

      highlightSpec = null;
      setLargeSelectionHighlightRanges(targetView, null);
      originalSetSelection!.call(this, anchor, head, targetView, force);
    };
    nextDocView.setSelection = fastSetSelection;
    syncHighlight();
  };

  const handleKeyDown = (event: KeyboardEvent): boolean => {
    const collapseBoundary = getCollapseBoundary(event);
    const { selection, doc } = view.state;
    if (
      collapseBoundary
      && (
        isLargeEditorAllSelection(view.state)
        || (isLargeEditorTextSelection(view.state) && highlightSpec?.type === 'boundary')
      )
    ) {
      const nextSelection = selection instanceof AllSelection
        ? collapseBoundary === 'end' ? Selection.atEnd(doc) : Selection.atStart(doc)
        : TextSelection.create(
            doc,
            collapseBoundary === 'end' ? selection.to : selection.from,
          );
      event.preventDefault();
      event.stopPropagation();
      view.dispatch(view.state.tr.setSelection(nextSelection));
      scheduleBoundaryScroll(view, collapseBoundary);
      return true;
    }

    const selectionBoundary = getLargeSelectionBoundary(event);
    if (!selectionBoundary || !(selection instanceof TextSelection)) return false;
    const nextSelection = createTextSelectionToBoundary(doc, selection, selectionBoundary);
    if (!nextSelection) return false;
    if (!isLargeEditorSelectionRange(doc, nextSelection)) {
      return false;
    }

    const nextSpec = createBoundaryHighlightSpec(view, selectionBoundary);
    if (!nextSpec) return false;

    highlightSpec = nextSpec;
    renderHighlight();
    event.preventDefault();
    event.stopPropagation();
    view.dispatch(
      view.state.tr.setSelection(nextSelection),
    );
    scheduleBoundaryScroll(view, selectionBoundary);
    return true;
  };

  scrollRoot?.addEventListener('scroll', scheduleHighlightRefresh, { passive: true });
  update();
  return {
    destroy: () => {
      restore();
      scrollRoot?.removeEventListener('scroll', scheduleHighlightRefresh);
    },
    handleKeyDown,
    update,
  };
}
