import type { EditorState } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { BlockRect } from './blockSelectionUtils';
import { resolveContentHorizontalBounds } from './blockRectContentBounds';
import {
  getInteractionCachedEditorBlockTargetNearY,
  getInteractionCachedEditorBlockTargets,
  getInteractionCachedEditorBlockTargetsNearY,
  getInteractionCachedEditorGeometry,
  isTooLargeForBlockPositionSnapshot,
} from '../../utils/editorBlockPositionCache';
import {
  collectSelectableBlockTargets,
  resolveSelectableBlockElement,
  resolveSelectableBlockTargetByPos,
  type SelectableBlockTarget,
} from './blockUnitResolver';
import { resolveInlineCaretRange } from './blockUnitRangeCollection';

interface BlockRectResolverOptions {
  view: EditorView;
  scrollRootSelector: string;
  usePositionCache?: boolean;
}

export interface BlockRectResolver {
  getTopLevelBlockRects: () => BlockRect[];
  getPlainClickBlockRects: (clientX: number, clientY: number) => BlockRect[];
  getSelectionBlockRects: () => BlockRect[];
  getLiveSelectionBlockRects: (ranges: readonly { from: number; to: number }[]) => BlockRect[];
  getSelectionBlockElements: (ranges: readonly { from: number; to: number }[]) => HTMLElement[];
  invalidate: () => void;
}

export { collectSelectableBlockRanges } from './blockUnitResolver';
export {
  collectTextContentBounds,
  MAX_BLOCK_RECT_CONTENT_LINES,
  MAX_BLOCK_RECT_CONTENT_RECTS,
  MAX_BLOCK_RECT_CONTENT_TEXT_NODES,
  MAX_BLOCK_RECT_LIST_CONTENT_CHILDREN,
} from './blockRectContentBounds';
const PLAIN_CLICK_VERTICAL_OVERSCAN_PX = 48;
const MAX_PLAIN_CLICK_CANDIDATE_BLOCKS = 12;

function mapTargetsToPlainClickBlockRects(
  view: EditorView,
  targets: readonly SelectableBlockTarget[],
  editorRect: DOMRect,
): BlockRect[] {
  const useEditorHorizontalBounds = editorRect.width > 0;

  return targets.map(({ range, element, rect }) => {
    const contentBounds = resolveContentHorizontalBounds(element, rect);
    const caretRange = resolveInlineCaretRange(view.state.doc, range);
    return {
      from: range.from,
      to: range.to,
      ...(caretRange ? { caretRange } : {}),
      left: useEditorHorizontalBounds ? editorRect.left : rect.left,
      top: rect.top,
      right: useEditorHorizontalBounds ? editorRect.right : rect.right,
      bottom: rect.bottom,
      contentLeft: contentBounds.left,
      contentRight: contentBounds.right,
      ...(contentBounds.lineRects ? { contentLineRects: contentBounds.lineRects } : {}),
      ...(element.tagName === 'LI' || element.tagName === 'P'
        ? { allowInsideTrailingClick: true }
        : {}),
    };
  });
}

function collectSelectableBlockRects(view: EditorView, editorRect: DOMRect): BlockRect[] {
  if (isTooLargeForBlockPositionSnapshot(view.state.doc)) {
    return [];
  }

  const targets = collectSelectableBlockTargets(view);
  return mapTargetsToPlainClickBlockRects(view, targets, editorRect);
}

function mapTargetsToSelectionBlockRects(
  targets: readonly SelectableBlockTarget[],
  editorRect: DOMRect,
): BlockRect[] {
  const useEditorHorizontalBounds = editorRect.width > 0;

  return targets.map(({ range, element, rect }) => ({
    from: range.from,
    to: range.to,
    left: useEditorHorizontalBounds ? editorRect.left : rect.left,
    top: rect.top,
    right: useEditorHorizontalBounds ? editorRect.right : rect.right,
    bottom: rect.bottom,
    ...(element.tagName === 'LI' || element.tagName === 'P'
      ? { allowInsideTrailingClick: true }
      : {}),
  }));
}

function collectSelectionBlockTargets(
  view: EditorView,
  usePositionCache: boolean,
): SelectableBlockTarget[] {
  if (usePositionCache) {
    const cachedTargets = getInteractionCachedEditorBlockTargets(view);
    if (cachedTargets) {
      return cachedTargets;
    }
  }

  if (isTooLargeForBlockPositionSnapshot(view.state.doc)) {
    return [];
  }

  return collectSelectableBlockTargets(view);
}

function getScrollCoordinates(view: EditorView, scrollRootSelector: string): { left: number; top: number } {
  const scrollRoot = view.dom.closest(scrollRootSelector) as HTMLElement | null;
  if (!scrollRoot) return { left: 0, top: 0 };
  return {
    left: scrollRoot.scrollLeft,
    top: scrollRoot.scrollTop,
  };
}

export function createBlockRectResolver({
  view,
  scrollRootSelector,
  usePositionCache = true,
}: BlockRectResolverOptions): BlockRectResolver {
  let cachedDoc: EditorState['doc'] | null = null;
  let cachedScrollLeft = Number.NaN;
  let cachedScrollTop = Number.NaN;
  let cachedRects: BlockRect[] = [];
  let cachedSelectionDoc: EditorState['doc'] | null = null;
  let cachedSelectionScrollLeft = Number.NaN;
  let cachedSelectionScrollTop = Number.NaN;
  let cachedSelectionRects: BlockRect[] = [];
  let cachedSelectionElementsByRange = new Map<string, HTMLElement>();
  let cachedEditorRect: DOMRect | null = null;
  let trustPositionCache = usePositionCache;

  const getEditorRect = (): DOMRect => {
    if (cachedEditorRect) return cachedEditorRect;
    cachedEditorRect = trustPositionCache
      ? getInteractionCachedEditorGeometry(view)?.editorRect ?? view.dom.getBoundingClientRect()
      : view.dom.getBoundingClientRect();
    return cachedEditorRect;
  };

  const getPlainClickCandidateTargets = (
    clientX: number,
    clientY: number,
    editorRect: DOMRect,
  ): SelectableBlockTarget[] | null => {
    const cachedTargets = trustPositionCache ? getInteractionCachedEditorBlockTargetsNearY(
      view,
      clientY,
      (rect, pointerY) => {
        const slack = Math.max(
          12,
          Math.min(PLAIN_CLICK_VERTICAL_OVERSCAN_PX, rect.height * 0.5),
        );
        return pointerY >= rect.top - slack && pointerY <= rect.bottom + slack;
      },
    ) : null;
    if (cachedTargets && cachedTargets.length > 0) {
      return cachedTargets.slice(-MAX_PLAIN_CLICK_CANDIDATE_BLOCKS);
    }

    const cachedNearestTarget = trustPositionCache
      ? getInteractionCachedEditorBlockTargetNearY(view, clientY)
      : null;
    if (cachedNearestTarget) return [cachedNearestTarget];

    try {
      const safeX = Math.max(editorRect.left + 1, Math.min(editorRect.right - 1, clientX));
      const resolved = view.posAtCoords({ left: safeX, top: clientY });
      if (resolved) {
        const target = resolveSelectableBlockTargetByPos(view, resolved.pos);
        if (target) return [target];
      }
    } catch {
    }

    return null;
  };

  return {
    getTopLevelBlockRects() {
      const { left, top } = getScrollCoordinates(view, scrollRootSelector);
      if (
        cachedDoc === view.state.doc
        && cachedScrollLeft === left
        && cachedScrollTop === top
      ) {
        return cachedRects;
      }

      cachedDoc = view.state.doc;
      cachedScrollLeft = left;
      cachedScrollTop = top;
      cachedRects = collectSelectableBlockRects(view, getEditorRect());
      return cachedRects;
    },
    getPlainClickBlockRects(clientX, clientY) {
      const editorRect = getEditorRect();
      const candidateTargets = getPlainClickCandidateTargets(clientX, clientY, editorRect);
      if (candidateTargets) {
        return mapTargetsToPlainClickBlockRects(view, candidateTargets, editorRect);
      }
      return collectSelectableBlockRects(view, editorRect);
    },
    getSelectionBlockRects() {
      const { left, top } = getScrollCoordinates(view, scrollRootSelector);
      if (
        cachedSelectionDoc === view.state.doc
        && cachedSelectionScrollLeft === left
        && cachedSelectionScrollTop === top
      ) {
        return cachedSelectionRects;
      }

      cachedSelectionDoc = view.state.doc;
      cachedSelectionScrollLeft = left;
      cachedSelectionScrollTop = top;
      const targets = collectSelectionBlockTargets(
        view,
        trustPositionCache,
      );
      cachedSelectionElementsByRange = new Map(targets.map((target) => [
        `${target.range.from}:${target.range.to}`,
        target.element,
      ]));
      cachedSelectionRects = mapTargetsToSelectionBlockRects(targets, getEditorRect());
      return cachedSelectionRects;
    },
    getLiveSelectionBlockRects(ranges) {
      return mapTargetsToSelectionBlockRects(
        collectSelectableBlockTargets(view, ranges),
        view.dom.getBoundingClientRect(),
      );
    },
    getSelectionBlockElements(ranges) {
      return ranges
        .map((range) => {
          const cached = cachedSelectionElementsByRange.get(`${range.from}:${range.to}`);
          return cached && view.dom.contains(cached)
            ? cached
            : resolveSelectableBlockElement(view, range);
        })
        .filter((element): element is HTMLElement => Boolean(element));
    },
    invalidate() {
      cachedDoc = null;
      cachedScrollLeft = Number.NaN;
      cachedScrollTop = Number.NaN;
      cachedRects = [];
      cachedSelectionDoc = null;
      cachedSelectionScrollLeft = Number.NaN;
      cachedSelectionScrollTop = Number.NaN;
      cachedSelectionRects = [];
      cachedSelectionElementsByRange = new Map();
      cachedEditorRect = null;
      trustPositionCache = false;
    },
  };
}
