import type { EditorView } from '@milkdown/kit/prose/view';
import {
  resolveSelectableBlockRange,
  type SelectableBlockTarget,
} from '../plugins/cursor/blockUnitResolver';
import {
  findFirstBlockStartingAfter,
  getBlockRangeKey,
  resolveViewportRectFromDocumentPosition,
} from './editorBlockPositionGeometry';
import {
  getSnapshotScrollRootRect,
  isSnapshotForView,
  isSnapshotGeometryFresh,
  mapSnapshotBlockToTarget,
} from './editorBlockPositionSnapshotFreshness';
import type {
  EditorBlockPositionEntry,
  EditorBlockPositionSnapshot,
} from './editorBlockPositionTypes';

function resolveSnapshotLookup(
  snapshot: EditorBlockPositionSnapshot | null,
  view: EditorView,
  validateGeometry: boolean,
) {
  const snapshotView = snapshot ? isSnapshotForView(snapshot, view) : null;
  if (!snapshot || !snapshotView) return null;
  if (validateGeometry && !isSnapshotGeometryFresh(snapshot, snapshotView)) return null;
  if (!validateGeometry && !snapshot.editorRoot.isConnected) return null;

  let trustedScrollRootRect = snapshot.scrollRootRect ?? null;
  if (!validateGeometry && snapshot.scrollRoot && !trustedScrollRootRect) {
    const firstBlock = snapshot.blocks[0];
    if (!firstBlock) return null;
    const left = firstBlock.documentLeft === undefined
      ? firstBlock.rect.left
      : firstBlock.rect.left - firstBlock.documentLeft + snapshot.scrollLeft;
    const top = firstBlock.rect.top - firstBlock.documentTop + snapshot.scrollTop;
    trustedScrollRootRect = {
      left,
      top,
      right: left,
      bottom: top,
    } as DOMRect;
  }

  return {
    snapshot,
    snapshotView,
    scrollRootRect: validateGeometry
      ? getSnapshotScrollRootRect(snapshot)
      : trustedScrollRootRect,
  };
}

export function getCachedEditorBlockTargetsFromSnapshot(
  snapshot: EditorBlockPositionSnapshot | null,
  view: EditorView,
  ranges?: readonly { from: number; to: number }[],
  validateGeometry = true,
): SelectableBlockTarget[] | null {
  const lookup = resolveSnapshotLookup(snapshot, view, validateGeometry);
  if (!lookup) return null;
  const { snapshot: resolvedSnapshot, snapshotView, scrollRootRect } = lookup;

  const filteredBlocks = ranges
    ? ranges
        .map((range) => resolvedSnapshot.blockIndex.get(getBlockRangeKey(range.from, range.to)))
        .filter((block): block is EditorBlockPositionEntry => Boolean(block))
    : resolvedSnapshot.blocks;

  return filteredBlocks.map((block) => mapSnapshotBlockToTarget(
    block,
    scrollRootRect,
    snapshotView.scrollLeft,
    snapshotView.scrollTop,
  ));
}

export function getFreshCachedEditorBlockTargetsFromSnapshot(
  snapshot: EditorBlockPositionSnapshot | null,
  view: EditorView,
  scrollRoot: HTMLElement | null,
  validateGeometry = true,
): SelectableBlockTarget[] | null {
  const lookup = resolveSnapshotLookup(snapshot, view, validateGeometry);
  if (
    !lookup
    || lookup.snapshot.scrollRoot !== scrollRoot
  ) {
    return null;
  }
  const { snapshot: resolvedSnapshot, snapshotView, scrollRootRect } = lookup;

  return resolvedSnapshot.blocks.map((block) => mapSnapshotBlockToTarget(
    block,
    scrollRootRect,
    snapshotView.scrollLeft,
    snapshotView.scrollTop,
  ));
}

export function getCachedEditorBlockTargetByPosFromSnapshot(
  snapshot: EditorBlockPositionSnapshot | null,
  view: EditorView,
  blockPos: number,
  validateGeometry = true,
): SelectableBlockTarget | null {
  const lookup = resolveSnapshotLookup(snapshot, view, validateGeometry);
  if (!lookup) return null;
  const { snapshot: resolvedSnapshot, snapshotView, scrollRootRect } = lookup;

  const range = resolveSelectableBlockRange(view.state.doc, blockPos);
  if (!range) {
    return null;
  }

  const block = resolvedSnapshot.blockIndex.get(getBlockRangeKey(range.from, range.to));
  if (!block) {
    return null;
  }

  return {
    range,
    element: block.element,
    rect: resolveViewportRectFromDocumentPosition(
      block,
      scrollRootRect,
      snapshotView.scrollLeft,
      snapshotView.scrollTop,
    ),
  };
}

export function getCachedEditorBlockTargetNearYFromSnapshot(
  snapshot: EditorBlockPositionSnapshot | null,
  view: EditorView,
  clientY: number,
  predicate?: (block: EditorBlockPositionEntry) => boolean,
  validateGeometry = true,
): SelectableBlockTarget | null {
  const lookup = resolveSnapshotLookup(snapshot, view, validateGeometry);
  if (
    !lookup
    || lookup.snapshot.blocks.length === 0
  ) {
    return null;
  }
  const { snapshot: resolvedSnapshot, snapshotView, scrollRootRect } = lookup;

  const documentY = scrollRootRect
    ? clientY - scrollRootRect.top + snapshotView.scrollTop
    : clientY;
  const firstAfterIndex = findFirstBlockStartingAfter(resolvedSnapshot.blocks, documentY);
  let directStartIndex = Math.max(0, firstAfterIndex - 1);
  while (
    directStartIndex > 0
    && resolvedSnapshot.blocks[directStartIndex - 1]?.documentBottom >= documentY
  ) {
    directStartIndex -= 1;
  }

  for (let index = directStartIndex; index < resolvedSnapshot.blocks.length; index += 1) {
    const block = resolvedSnapshot.blocks[index];
    if (block.documentTop > documentY) break;
    if (block.documentBottom < documentY) continue;
    if (predicate && !predicate(block)) continue;
    return mapSnapshotBlockToTarget(
      block,
      scrollRootRect,
      snapshotView.scrollLeft,
      snapshotView.scrollTop,
    );
  }

  let previous: EditorBlockPositionEntry | null = null;
  for (let index = firstAfterIndex - 1; index >= 0; index -= 1) {
    const block = resolvedSnapshot.blocks[index];
    if (predicate && !predicate(block)) continue;
    previous = block;
    break;
  }

  let next: EditorBlockPositionEntry | null = null;
  for (let index = firstAfterIndex; index < resolvedSnapshot.blocks.length; index += 1) {
    const block = resolvedSnapshot.blocks[index];
    if (predicate && !predicate(block)) continue;
    next = block;
    break;
  }

  const previousDistance = previous
    ? Math.abs(documentY - (previous.documentTop + (previous.documentBottom - previous.documentTop) / 2))
    : Number.POSITIVE_INFINITY;
  const nextDistance = next
    ? Math.abs(documentY - (next.documentTop + (next.documentBottom - next.documentTop) / 2))
    : Number.POSITIVE_INFINITY;
  const nearest = previousDistance <= nextDistance ? previous : next;
  return nearest ? mapSnapshotBlockToTarget(
    nearest,
    scrollRootRect,
    snapshotView.scrollLeft,
    snapshotView.scrollTop,
  ) : null;
}

export function getCachedEditorBlockTargetsNearYFromSnapshot(
  snapshot: EditorBlockPositionSnapshot | null,
  view: EditorView,
  clientY: number,
  isNearRect: (rect: Pick<DOMRect, 'top' | 'bottom' | 'height'>, clientY: number) => boolean,
  predicate?: (block: EditorBlockPositionEntry) => boolean,
  validateGeometry = true,
): SelectableBlockTarget[] | null {
  const lookup = resolveSnapshotLookup(snapshot, view, validateGeometry);
  if (
    !lookup
    || lookup.snapshot.blocks.length === 0
  ) {
    return null;
  }
  const { snapshot: resolvedSnapshot, snapshotView, scrollRootRect } = lookup;

  const documentY = scrollRootRect
    ? clientY - scrollRootRect.top + snapshotView.scrollTop
    : clientY;
  const firstAfterIndex = findFirstBlockStartingAfter(resolvedSnapshot.blocks, documentY);
  let startIndex = Math.max(0, firstAfterIndex - 1);
  while (startIndex > 0) {
    const previousBlock = resolvedSnapshot.blocks[startIndex - 1];
    const rect = resolveViewportRectFromDocumentPosition(
      previousBlock,
      scrollRootRect,
      snapshotView.scrollLeft,
      snapshotView.scrollTop,
    );
    if (!isNearRect(rect, clientY)) break;
    startIndex -= 1;
  }

  const targets: SelectableBlockTarget[] = [];
  for (let index = startIndex; index < resolvedSnapshot.blocks.length; index += 1) {
    const block = resolvedSnapshot.blocks[index];
    const rect = resolveViewportRectFromDocumentPosition(
      block,
      scrollRootRect,
      snapshotView.scrollLeft,
      snapshotView.scrollTop,
    );
    if (!isNearRect(rect, clientY)) {
      if (block.documentTop > documentY) break;
      continue;
    }
    if (predicate && !predicate(block)) continue;
    targets.push({
      range: {
        from: block.from,
        to: block.to,
      },
      element: block.element,
      rect,
    });
  }
  return targets;
}
