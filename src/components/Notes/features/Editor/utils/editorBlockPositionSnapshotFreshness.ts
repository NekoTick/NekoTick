import type { EditorView } from '@milkdown/kit/prose/view';
import type { SelectableBlockTarget } from '../plugins/cursor/blockUnitResolver';
import { resolveTargetRect } from '../plugins/cursor/blockUnitDomRects';
import { SNAPSHOT_GEOMETRY_TOLERANCE_PX } from './editorBlockPositionConstants';
import {
  resolveDocumentBottom,
  resolveDocumentLeft,
  resolveDocumentRight,
  resolveDocumentTop,
  resolveViewportRectFromDocumentPosition,
} from './editorBlockPositionGeometry';
import type {
  EditorBlockPositionEntry,
  EditorBlockPositionSnapshot,
} from './editorBlockPositionTypes';

export function isSnapshotForView(
  snapshot: EditorBlockPositionSnapshot,
  view: EditorView,
): { scrollRoot: HTMLElement | null; scrollLeft: number; scrollTop: number } | null {
  const scrollRoot = view.dom.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
  if (
    snapshot.view !== view
    || snapshot.doc !== view.state.doc
    || snapshot.editorRoot !== view.dom
    || snapshot.scrollRoot !== scrollRoot
  ) {
    return null;
  }

  return {
    scrollRoot,
    scrollLeft: scrollRoot?.scrollLeft ?? 0,
    scrollTop: scrollRoot?.scrollTop ?? 0,
  };
}

export function getSnapshotScrollRootRect(snapshot: EditorBlockPositionSnapshot): DOMRect | null {
  return snapshot.scrollRoot?.getBoundingClientRect() ?? null;
}

function isWithinSnapshotGeometryTolerance(left: number, right: number): boolean {
  return Math.abs(left - right) <= SNAPSHOT_GEOMETRY_TOLERANCE_PX;
}

function getSampledSnapshotBlocks(
  blocks: readonly EditorBlockPositionEntry[],
): EditorBlockPositionEntry[] {
  if (blocks.length <= 2) {
    return [...blocks];
  }

  const middleIndex = Math.floor(blocks.length / 2);
  return [
    blocks[0],
    blocks[middleIndex],
    blocks[blocks.length - 1],
  ].filter((block): block is EditorBlockPositionEntry => Boolean(block));
}

function isSnapshotBlockGeometryFresh(
  block: EditorBlockPositionEntry,
  view: EditorView,
  scrollRootRect: DOMRect | null,
  scrollLeft: number,
  scrollTop: number,
  validateRect: boolean,
): boolean {
  if (!block.element.isConnected) {
    return false;
  }
  if (!validateRect) {
    return true;
  }

  const rect = resolveTargetRect(block.element, {
    from: block.from,
    to: block.to,
  }, view);
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  const currentDocumentTop = resolveDocumentTop(rect, scrollRootRect?.top ?? null, scrollTop);
  const currentDocumentBottom = resolveDocumentBottom(rect, scrollRootRect?.top ?? null, scrollTop);
  if (!isWithinSnapshotGeometryTolerance(currentDocumentTop, block.documentTop)) {
    return false;
  }
  if (!isWithinSnapshotGeometryTolerance(currentDocumentBottom, block.documentBottom)) {
    return false;
  }

  if (block.documentLeft !== undefined) {
    const currentDocumentLeft = resolveDocumentLeft(rect, scrollRootRect?.left ?? null, scrollLeft);
    if (!isWithinSnapshotGeometryTolerance(currentDocumentLeft, block.documentLeft)) {
      return false;
    }
  }
  if (block.documentRight !== undefined) {
    const currentDocumentRight = resolveDocumentRight(rect, scrollRootRect?.left ?? null, scrollLeft);
    if (!isWithinSnapshotGeometryTolerance(currentDocumentRight, block.documentRight)) {
      return false;
    }
  }

  return true;
}

export function isSnapshotGeometryFresh(
  snapshot: EditorBlockPositionSnapshot,
  snapshotView: { scrollRoot: HTMLElement | null; scrollLeft: number; scrollTop: number },
): boolean {
  const hasGeometryValidation =
    snapshot.geometryValidationScrollLeft !== undefined &&
    snapshot.geometryValidationScrollTop !== undefined;
  if (!hasGeometryValidation) {
    return true;
  }
  if (!snapshot.editorRoot.isConnected || snapshot.scrollRoot !== snapshotView.scrollRoot) {
    return false;
  }
  if (snapshot.blocks.length === 0) {
    return true;
  }

  const scrollRootRect = getSnapshotScrollRootRect(snapshot);
  const validateBlockRects =
    snapshot.geometryValidationScrollLeft === snapshotView.scrollLeft &&
    snapshot.geometryValidationScrollTop === snapshotView.scrollTop;

  try {
    return getSampledSnapshotBlocks(snapshot.blocks).every((block) => (
      isSnapshotBlockGeometryFresh(
        block,
        snapshot.view,
        scrollRootRect,
        snapshotView.scrollLeft,
        snapshotView.scrollTop,
        validateBlockRects,
      )
    ));
  } catch {
    return false;
  }
}

export function mapSnapshotBlockToTarget(
  block: EditorBlockPositionEntry,
  scrollRootRect: DOMRect | null,
  scrollLeft: number,
  scrollTop: number,
): SelectableBlockTarget {
  return {
    range: {
      from: block.from,
      to: block.to,
    },
    element: block.element,
    rect: resolveViewportRectFromDocumentPosition(
      block,
      scrollRootRect,
      scrollLeft,
      scrollTop,
    ),
  };
}
