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
import { resolveBlockSelectionPreviewMetrics } from './blockSelectionPreviewGeometry';
import { resolveBlockSelectionPreviewLayout } from './blockSelectionPreviewLayout';
import { isBlockSelectionPreviewSurfaceRange } from './blockSelectionDecorationClasses';

interface BlankAreaSelectionRectResolver {
  getSelectionBlockRects: () => readonly BlockRect[];
  getLiveSelectionBlockRects: (ranges: readonly BlockRange[]) => readonly BlockRect[];
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
  let selectedPreviewDocSpaceBlocks: BlockRect[] = [];
  let selectedPreviewDocSpaceRects: RectBounds[] = [];
  let selectedPreviewRanges: BlockRange[] = [];
  let selectedPreviewSurfaceRanges: BlockRange[] = [];
  let selectedPreviewSurfaceRangesKey = '';
  let resolvedSelectionBlocks: BlockRange[] = [...args.initialSelectedBlocks];
  let selectedPreviewPath = '';
  let previewLayoutDoc: EditorView['state']['doc'] | null = null;
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
    selectedPreviewDocSpaceBlocks = [];
    selectedPreviewDocSpaceRects = [];
    selectedPreviewRanges = [];
    selectedPreviewSurfaceRanges = [];
    selectedPreviewSurfaceRangesKey = '';
    selectedPreviewPath = '';
    previewLayoutDoc = null;
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

    const previewSourceBlocks = expandedBlocks
      .map((range) => cachedDocSpaceBlocksByRange?.get(`${range.from}:${range.to}`))
      .filter((block): block is BlockRect => Boolean(block));
    selectedPreviewRanges = previewSourceBlocks.map((block) => ({
      from: block.from,
      to: block.to,
    }));
    const selectionChanged = nextKey !== selectedBlocksKey;
    if (selectedPreviewSurfaceRangesKey !== nextKey) {
      selectedPreviewSurfaceRanges = selectedPreviewRanges.filter((range) =>
        isBlockSelectionPreviewSurfaceRange(args.view.state.doc, range));
      selectedPreviewSurfaceRangesKey = nextKey;
    }
    resolvedSelectionBlocks = expandedBlocks;
    if (!selectionChanged && previewLayoutDoc === args.view.state.doc) return;

    const previewLayout = resolveBlockSelectionPreviewLayout({
      doc: args.view.state.doc,
      selectedBlocks: expandedBlocks,
      sourceBlocks: previewSourceBlocks,
      allSourceBlocks: docSpaceBlockRects,
      metrics: previewMetrics,
    });
    selectedPreviewDocSpaceBlocks = previewLayout.blocks;
    selectedPreviewDocSpaceRects = previewLayout.rects;
    selectedPreviewPath = previewLayout.pathData;
    previewLayoutDoc = args.view.state.doc;
    if (!selectionChanged) return;

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
  const getSelectionPreviewSurfaceRanges = (): BlockRange[] => selectedPreviewSurfaceRanges;
  const getSelectionBlocks = (): readonly BlockRange[] => resolvedSelectionBlocks;
  const refreshSelectionPreviewGeometry = (
    changedRanges: readonly BlockRange[] = selectedPreviewRanges,
  ): boolean => {
    if (selectedPreviewRanges.length === 0 || !cachedDocSpaceBlockRects) return false;

    const currentScrollLeft = args.getScrollLeft();
    const currentScrollTop = args.getScrollTop();
    const liveDocSpaceBlocks = convertBlockRectsToDocumentSpace(
      args.rectResolver.getLiveSelectionBlockRects(changedRanges),
      currentScrollLeft,
      currentScrollTop,
    );
    if (liveDocSpaceBlocks.length !== changedRanges.length) return false;

    const nextCachedBlocks = [...cachedDocSpaceBlockRects];
    const blockIndexByRange = new Map(nextCachedBlocks.map((block, index) => [
      `${block.from}:${block.to}`,
      index,
    ]));
    const replacements = liveDocSpaceBlocks
      .map((block) => ({
        block,
        index: blockIndexByRange.get(`${block.from}:${block.to}`) ?? -1,
      }))
      .filter((replacement) => replacement.index >= 0)
      .sort((left, right) => left.index - right.index);
    if (replacements.length !== changedRanges.length) return false;
    const hasGeometryChange = replacements.some((replacement) => {
      const previousBlock = nextCachedBlocks[replacement.index];
      return !previousBlock
        || previousBlock.left !== replacement.block.left
        || previousBlock.top !== replacement.block.top
        || previousBlock.right !== replacement.block.right
        || previousBlock.bottom !== replacement.block.bottom;
    });
    if (!hasGeometryChange) return false;

    for (const replacement of replacements) {
      const previousBlock = nextCachedBlocks[replacement.index];
      if (!previousBlock) return false;
      const followingShift = replacement.block.bottom - previousBlock.bottom;
      nextCachedBlocks[replacement.index] = replacement.block;
      if (followingShift === 0) continue;
      for (let index = replacement.index + 1; index < nextCachedBlocks.length; index += 1) {
        const followingBlock = nextCachedBlocks[index];
        if (!followingBlock || followingBlock.top < previousBlock.bottom - 1) continue;
        nextCachedBlocks[index] = {
          ...followingBlock,
          top: followingBlock.top + followingShift,
          bottom: followingBlock.bottom + followingShift,
        };
      }
    }

    const nextBlocksByRange = new Map(nextCachedBlocks.map((block) => [
      `${block.from}:${block.to}`,
      block,
    ]));
    const nextPreviewSourceBlocks = selectedPreviewRanges
      .map((range) => nextBlocksByRange.get(`${range.from}:${range.to}`))
      .filter((block): block is BlockRect => Boolean(block));
    if (nextPreviewSourceBlocks.length !== selectedPreviewRanges.length) return false;
    const nextPreviewLayout = resolveBlockSelectionPreviewLayout({
      doc: args.view.state.doc,
      selectedBlocks: resolvedSelectionBlocks,
      sourceBlocks: nextPreviewSourceBlocks,
      allSourceBlocks: nextCachedBlocks,
      metrics: previewMetrics,
    });
    if (nextPreviewLayout.blocks.length !== selectedPreviewDocSpaceBlocks.length) return false;

    cachedDocSpaceBlockRects = nextCachedBlocks;
    cachedDocSpaceBlockIndex = createBlockRectYIndex(nextCachedBlocks);
    cachedDocSpaceBlocksByRange = nextBlocksByRange;
    selectedPreviewDocSpaceBlocks = nextPreviewLayout.blocks;
    selectedPreviewDocSpaceRects = nextPreviewLayout.rects;
    selectedPreviewPath = nextPreviewLayout.pathData;
    return true;
  };

  return {
    applyDragRectSelectionIfNeeded,
    getSelectionBlocks,
    getSelectionPreviewRanges,
    getSelectionPreviewSurfaceRanges,
    getSelectionPreviewDocumentRects,
    getSelectionPreviewPath,
    refreshSelectionPreviewGeometry,
    invalidateGeometryCache,
  };
}
