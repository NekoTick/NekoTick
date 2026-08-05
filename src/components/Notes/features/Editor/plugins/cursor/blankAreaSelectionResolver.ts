import type { EditorView } from '@milkdown/kit/prose/view';
import { expandKnownSelectableListItemHeaderRanges } from './blockUnitResolver';
import {
  createBlockRectYIndex,
  convertBlockRectsToDocumentSpace,
  createDragSelectionRect,
  getBlockRangesKey,
  preferNestedBlockRanges,
  preferNestedBlockRangesUnlessHeaderIntersects,
  resolveIntersectedBlockRangesFromYIndex,
  type BlockRect,
  type BlockRectYIndex,
  type BlockRange,
  type RectBounds,
} from './blockSelectionUtils';
import { expandDragRectPointerEdgeY, areRectBoundsEqual } from './blankAreaSelectionDragBox';
import { filterExternalBlankAreaSelectionEdgeGrazes } from './blankAreaSelectionGeometry';
import {
  createRoundedBlockSelectionPreviewPath,
  resolveBlockSelectionPreviewMetrics,
  resolveBlockSelectionPreviewRects,
} from './blockSelectionPreviewGeometry';

interface BlankAreaSelectionRectResolver {
  getSelectionBlockRects: () => readonly BlockRect[];
  invalidate: () => void;
}

export function createBlankAreaSelectionResolver(args: {
  view: EditorView;
  rectResolver: BlankAreaSelectionRectResolver;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
  getScrollLeft: () => number;
  getScrollTop: () => number;
  getPointerClientX: () => number;
  getPointerClientY: () => number;
  initialSelectedBlocks: readonly BlockRange[];
  shouldFilterExternalEdgeGrazes: boolean;
  onSelectionChange: (blocks: BlockRange[]) => void;
}) {
  let selectedBlocksKey = getBlockRangesKey(args.initialSelectedBlocks);
  let lastAppliedViewportDragRect: RectBounds | null = null;
  let lastAppliedScrollLeft = Number.NaN;
  let lastAppliedScrollTop = Number.NaN;
  let preserveContainingBlocksForSession = false;
  let didResolveFirstNonEmptySelection = false;
  let cachedSelectionResolutionKey = '';
  let cachedSelectionResolutionBlocks: BlockRange[] = [];
  let cachedSelectionResolutionExpandedKey = '';
  let cachedDocSpaceBlockRects: readonly BlockRect[] | null = null;
  let cachedDocSpaceBlockIndex: BlockRectYIndex | null = null;
  let cachedDocSpaceBlocksByRange: Map<string, BlockRect> | null = null;
  let selectedPreviewDocSpaceRects: RectBounds[] = [];
  let selectedPreviewRanges: BlockRange[] = [];
  let selectedPreviewPath = '';
  const previewMetrics = resolveBlockSelectionPreviewMetrics(args.view.dom);

  const getDocSpaceBlockRectIndex = (
    currentScrollLeft: number,
    currentScrollTop: number,
  ): { blockRects: readonly BlockRect[]; index: BlockRectYIndex } => {
    if (cachedDocSpaceBlockRects && cachedDocSpaceBlockIndex) {
      return {
        blockRects: cachedDocSpaceBlockRects,
        index: cachedDocSpaceBlockIndex,
      };
    }

    const sourceRects = args.rectResolver.getSelectionBlockRects();
    if (sourceRects.length === 0) {
      return {
        blockRects: [],
        index: createBlockRectYIndex([]),
      };
    }

    const docSpaceBlockRects = convertBlockRectsToDocumentSpace(sourceRects, currentScrollLeft, currentScrollTop);
    const docSpaceBlockIndex = createBlockRectYIndex(docSpaceBlockRects);
    cachedDocSpaceBlockRects = docSpaceBlockRects;
    cachedDocSpaceBlockIndex = docSpaceBlockIndex;
    cachedDocSpaceBlocksByRange = new Map(docSpaceBlockRects.map((block) => [
      `${block.from}:${block.to}`,
      block,
    ]));
    return {
      blockRects: docSpaceBlockRects,
      index: docSpaceBlockIndex,
    };
  };

  const invalidateGeometryCache = () => {
    args.rectResolver.invalidate();
    cachedDocSpaceBlockRects = null;
    cachedDocSpaceBlockIndex = null;
    cachedDocSpaceBlocksByRange = null;
    selectedPreviewDocSpaceRects = [];
    selectedPreviewRanges = [];
    selectedPreviewPath = '';
    cachedSelectionResolutionKey = '';
    cachedSelectionResolutionBlocks = [];
    cachedSelectionResolutionExpandedKey = '';
    lastAppliedViewportDragRect = null;
    lastAppliedScrollLeft = Number.NaN;
    lastAppliedScrollTop = Number.NaN;
  };

  const applyDragRectSelection = (viewportDragRect: RectBounds) => {
    const currentScrollLeft = args.getScrollLeft();
    const currentScrollTop = args.getScrollTop();
    lastAppliedViewportDragRect = viewportDragRect;
    lastAppliedScrollLeft = currentScrollLeft;
    lastAppliedScrollTop = currentScrollTop;
    const docSpaceDragRect = createDragSelectionRect(
      args.startClientX + args.startScrollLeft,
      args.startClientY + args.startScrollTop,
      args.getPointerClientX() + currentScrollLeft,
      args.getPointerClientY() + currentScrollTop,
    );
    const hitTestDragRect = expandDragRectPointerEdgeY(docSpaceDragRect, args.startClientY + args.startScrollTop);
    const { blockRects: docSpaceBlockRects, index: docSpaceBlockIndex } = getDocSpaceBlockRectIndex(
      currentScrollLeft,
      currentScrollTop,
    );
    const selectedBlocks = args.shouldFilterExternalEdgeGrazes
      ? filterExternalBlankAreaSelectionEdgeGrazes(
        docSpaceBlockRects,
        resolveIntersectedBlockRangesFromYIndex(docSpaceBlockIndex, hitTestDragRect),
        hitTestDragRect,
      )
      : resolveIntersectedBlockRangesFromYIndex(docSpaceBlockIndex, hitTestDragRect);
    const selectedIntersectionKey = getBlockRangesKey(selectedBlocks);
    if (!didResolveFirstNonEmptySelection && selectedBlocks.length > 0) {
      didResolveFirstNonEmptySelection = true;
      preserveContainingBlocksForSession = preferNestedBlockRanges(selectedBlocks).length === selectedBlocks.length;
    }
    const selectionResolutionKey = `${selectedIntersectionKey}|${preserveContainingBlocksForSession ? 'preserve' : 'nested'}|${Math.round(hitTestDragRect.top * 100) / 100}|${currentScrollLeft}|${currentScrollTop}`;
    let expandedBlocks = cachedSelectionResolutionBlocks;
    let nextKey = cachedSelectionResolutionExpandedKey;

    if (selectionResolutionKey !== cachedSelectionResolutionKey) {
      const nestedPreferredBlocks = preserveContainingBlocksForSession
        ? selectedBlocks
        : preferNestedBlockRangesUnlessHeaderIntersects(selectedBlocks, docSpaceBlockRects, hitTestDragRect);
      expandedBlocks = expandKnownSelectableListItemHeaderRanges(
        args.view.state.doc,
        nestedPreferredBlocks,
        docSpaceBlockRects,
      );
      nextKey = getBlockRangesKey(expandedBlocks);
      cachedSelectionResolutionKey = selectionResolutionKey;
      cachedSelectionResolutionBlocks = expandedBlocks;
      cachedSelectionResolutionExpandedKey = nextKey;
    }

    const previewBlocks = expandedBlocks
      .map((range) => cachedDocSpaceBlocksByRange?.get(`${range.from}:${range.to}`))
      .filter((block): block is BlockRect => Boolean(block));
    selectedPreviewRanges = previewBlocks.map((block) => ({
      from: block.from,
      to: block.to,
    }));
    selectedPreviewDocSpaceRects = resolveBlockSelectionPreviewRects(
      args.view.state.doc,
      previewBlocks,
      previewMetrics,
    );
    selectedPreviewPath = createRoundedBlockSelectionPreviewPath(
      selectedPreviewDocSpaceRects,
      previewMetrics.radiusPx,
    );
    if (nextKey === selectedBlocksKey) return;

    selectedBlocksKey = nextKey;
    args.onSelectionChange(expandedBlocks);
  };

  const applyDragRectSelectionIfNeeded = (viewportDragRect: RectBounds): void => {
    const currentScrollLeft = args.getScrollLeft();
    const currentScrollTop = args.getScrollTop();
    if (
      areRectBoundsEqual(lastAppliedViewportDragRect, viewportDragRect)
      && lastAppliedScrollLeft === currentScrollLeft
      && lastAppliedScrollTop === currentScrollTop
    ) {
      return;
    }

    applyDragRectSelection(viewportDragRect);
  };

  const getSelectionPreviewDocumentRects = (): readonly RectBounds[] => selectedPreviewDocSpaceRects;
  const getSelectionPreviewPath = (): string => selectedPreviewPath;
  const getSelectionPreviewRanges = (): BlockRange[] => selectedPreviewRanges;

  return {
    applyDragRectSelectionIfNeeded,
    getSelectionPreviewRanges,
    getSelectionPreviewDocumentRects,
    getSelectionPreviewPath,
    invalidateGeometryCache,
  };
}
