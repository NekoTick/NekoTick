export {
  LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD,
  type BlockRange,
  type BlockRect,
  type BlockRectYIndex,
  type RectBounds,
} from './blockSelectionTypes';
export {
  clampViewportRectTop,
  convertBlockRectsToDocumentSpace,
  convertDocumentRectToViewportRect,
  convertViewportDragRectToDocumentRect,
  createBlockRectYIndex,
  createDragSelectionRect,
  isRectIntersecting,
  resolveDisplayedDragViewportRect,
  resolveIntersectedBlockRanges,
  resolveIntersectedBlockRangesFromYIndex,
} from './blockSelectionGeometry';
export {
  getBlockRangeKey,
  getBlockRangesKey,
  mapBlockRangesThroughTransaction,
  normalizeBlockRanges,
  preferNestedBlockRanges,
  preferNestedBlockRangesUnlessHeaderIntersects,
  pruneContainedBlockRanges,
  resolveBlockSelectionDisplayRanges,
  resolveStandaloneImageBlockRange,
} from './blockSelectionRanges';
export {
  areBlockSelectionDisplayRangesVisuallyAdjacent,
  createBlockSelectionDecorations,
  createBlockSelectionPreviewSurfaceDecorations,
  getBlockSelectionDecorationClass,
} from './blockSelectionDecorations';
