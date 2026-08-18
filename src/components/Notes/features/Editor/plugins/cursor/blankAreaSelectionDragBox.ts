import { themeDomStyleTokens, themeRenderingTokens, themeStyleResetTokens } from '@/styles/themeTokens';
import type { RectBounds } from './blockSelectionUtils';

const DRAG_SELECTION_POINTER_EDGE_HIT_SLOP_PX = 8;
const GEOMETRY_RESIZE_TOLERANCE_PX = 1;

export const DRAG_SELECTION_PREVIEW_ACTIVE_CLASS = 'editor-block-selection-drag-preview-active';

export function createDragBox(
  doc: Document,
  dragBoxColor: string,
): HTMLDivElement {
  const box = doc.createElement('div');
  box.setAttribute('data-editor-drag-box', 'true');
  box.style.position = themeDomStyleTokens.positionFixed;
  box.style.pointerEvents = themeStyleResetTokens.pointerEventsNone;
  box.style.zIndex = themeDomStyleTokens.zIndexBase;
  box.style.border = themeDomStyleTokens.borderNone;
  box.style.background = dragBoxColor;
  box.style.borderRadius = themeStyleResetTokens.borderRadiusNone;
  box.style.left = themeDomStyleTokens.sizeZeroPx;
  box.style.top = themeDomStyleTokens.sizeZeroPx;
  box.style.transform = themeRenderingTokens.translate3dZeroPx;
  box.style.transformOrigin = `${themeDomStyleTokens.sizeZero} ${themeDomStyleTokens.sizeZero}`;
  box.style.willChange = themeRenderingTokens.transformSizeWillChange;
  box.style.contain = themeRenderingTokens.containLayoutPaintStyle;
  box.style.width = themeDomStyleTokens.sizeZeroPx;
  box.style.height = themeDomStyleTokens.sizeZeroPx;
  return box;
}

export function updateDragBox(box: HTMLDivElement, rect: RectBounds): void {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;

  box.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
  box.style.width = `${width}px`;
  box.style.height = `${height}px`;
}

export function createBlockSelectionPreviewLayer(
  doc: Document,
  color: string,
): SVGSVGElement {
  const layer = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  layer.setAttribute('data-editor-block-selection-preview', 'true');
  layer.style.position = themeDomStyleTokens.positionAbsolute;
  layer.style.pointerEvents = themeStyleResetTokens.pointerEventsNone;
  layer.style.zIndex = themeDomStyleTokens.zIndexBase;
  layer.style.left = themeDomStyleTokens.sizeZeroPx;
  layer.style.top = themeDomStyleTokens.sizeZeroPx;
  layer.style.right = themeDomStyleTokens.sizeZeroPx;
  layer.style.bottom = themeDomStyleTokens.sizeZeroPx;
  layer.style.width = themeDomStyleTokens.sizeFull;
  layer.style.height = themeDomStyleTokens.sizeFull;
  layer.style.contain = themeRenderingTokens.containLayoutPaintStyle;
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.style.fill = color;
  path.style.transformOrigin = `${themeDomStyleTokens.sizeZero} ${themeDomStyleTokens.sizeZero}`;
  path.style.willChange = themeRenderingTokens.transformWillChange;
  layer.appendChild(path);
  return layer;
}

export function updateBlockSelectionPreviewLayer(
  layer: SVGSVGElement,
  rects: readonly RectBounds[],
  pathData: string,
  viewportBounds: RectBounds | null,
  scrollLeft = 0,
  scrollTop = 0,
): void {
  const win = layer.ownerDocument.defaultView;
  const visibleBounds = viewportBounds ?? {
    left: 0,
    top: 0,
    right: win?.innerWidth ?? 0,
    bottom: win?.innerHeight ?? 0,
  };
  const viewportWidth = win?.innerWidth ?? visibleBounds.right;
  const viewportHeight = win?.innerHeight ?? visibleBounds.bottom;
  const hostRect = layer.parentElement?.getBoundingClientRect();
  const layerTransform = `translate3d(${-(hostRect?.left ?? 0)}px, ${-(hostRect?.top ?? 0)}px, 0)`;
  if (layer.style.transform !== layerTransform) {
    layer.style.transform = layerTransform;
  }
  const layerWidth = `${viewportWidth}px`;
  if (layer.style.width !== layerWidth) {
    layer.style.width = layerWidth;
  }
  const layerHeight = `${viewportHeight}px`;
  if (layer.style.height !== layerHeight) {
    layer.style.height = layerHeight;
  }
  const clipPath = viewportBounds
    ? `inset(${Math.max(0, viewportBounds.top)}px ${Math.max(0, viewportWidth - viewportBounds.right)}px ${Math.max(0, viewportHeight - viewportBounds.bottom)}px ${Math.max(0, viewportBounds.left)}px)`
    : themeStyleResetTokens.clipPathNone;
  if (layer.style.clipPath !== clipPath) {
    layer.style.clipPath = clipPath;
  }
  let visibleRectCount = 0;

  for (const rect of rects) {
    const viewportLeft = rect.left - scrollLeft;
    const viewportRight = rect.right - scrollLeft;
    const viewportTop = rect.top - scrollTop;
    const viewportBottom = rect.bottom - scrollTop;
    if (
      viewportRight > visibleBounds.left
      && viewportLeft < visibleBounds.right
      && viewportBottom > visibleBounds.top
      && viewportTop < visibleBounds.bottom
    ) {
      visibleRectCount += 1;
    }
  }

  layer.dataset.selectionCount = String(visibleRectCount);
  const path = layer.firstElementChild as SVGPathElement | null;
  if (!path) return;
  if (path.getAttribute('d') !== pathData) {
    path.setAttribute('d', pathData);
  }
  const transform = `translate3d(${-scrollLeft}px, ${-scrollTop}px, 0)`;
  if (path.style.transform !== transform) {
    path.style.transform = transform;
  }
}

export function areRectBoundsEqual(left: RectBounds | null, right: RectBounds | null): boolean {
  return left !== null
    && right !== null
    && left.left === right.left
    && left.top === right.top
    && left.right === right.right
    && left.bottom === right.bottom;
}

export function getDragBoxTopBoundary(scrollRoot: HTMLElement | null): number {
  return scrollRoot?.getBoundingClientRect().top ?? 0;
}

export function resolveDragPointerY(startY: number, rect: RectBounds): number {
  return startY === rect.top ? rect.bottom : rect.top;
}

export function expandDragRectPointerEdgeY(
  rect: RectBounds,
  startY: number,
  slopPx = DRAG_SELECTION_POINTER_EDGE_HIT_SLOP_PX,
): RectBounds {
  if (slopPx <= 0) return rect;
  if (startY === rect.top) {
    return {
      ...rect,
      bottom: rect.bottom + slopPx,
    };
  }
  if (startY === rect.bottom) {
    return {
      ...rect,
      top: rect.top - slopPx,
    };
  }
  return rect;
}

export function hasMeaningfulResizeDelta(
  previous: { width: number; height: number } | undefined,
  next: { width: number; height: number },
): boolean {
  if (!previous) return true;
  return (
    Math.abs(previous.width - next.width) > GEOMETRY_RESIZE_TOLERANCE_PX ||
    Math.abs(previous.height - next.height) > GEOMETRY_RESIZE_TOLERANCE_PX
  );
}

export function hasMeaningfulWidthResizeDelta(
  previous: { width: number; height: number } | undefined,
  next: { width: number; height: number },
): boolean {
  if (!previous) return false;
  return Math.abs(previous.width - next.width) > GEOMETRY_RESIZE_TOLERANCE_PX;
}

export function blurActiveEditableElement(doc: Document): void {
  const activeElement = doc.activeElement;
  if (!(activeElement instanceof HTMLElement) || activeElement === doc.body) return;
  if (!activeElement.matches([
    'input',
    'textarea',
    'select',
    'button',
    '[contenteditable]:not([contenteditable="false"])',
  ].join(', '))) return;

  activeElement.blur();
}
