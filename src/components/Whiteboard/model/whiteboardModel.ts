import type { MessageKey } from '@/lib/i18n';
import type { IconName } from '@/components/ui/icons';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import coloredPencilImage from '../assets/brushes/colored-pencil.png';
import crayonImage from '../assets/brushes/crayon.png';
import eraserImage from '../assets/brushes/eraser.png';
import markerImage from '../assets/brushes/marker.png';
import penImage from '../assets/brushes/pen.png';
import pencilImage from '../assets/brushes/pencil.png';
import selectImage from '../assets/brushes/select.png';
import watercolorImage from '../assets/brushes/watercolor.png';

export type WhiteboardTool =
  | 'select'
  | 'hand'
  | 'pen'
  | 'pencil'
  | 'marker'
  | 'colored-pencil'
  | 'fountain'
  | 'watercolor'
  | 'crayon'
  | 'eraser'
  | 'stroke-eraser';
export type WhiteboardElementType = 'image';
export type WhiteboardPaperStyle = 'blank' | 'dots' | 'grid' | 'ruled';
export type WhiteboardDrawingTool = Extract<WhiteboardTool, 'pen' | 'pencil' | 'marker' | 'colored-pencil' | 'fountain' | 'watercolor' | 'crayon'>;
export type WhiteboardBrushTool = WhiteboardDrawingTool | 'stroke-eraser';
export type WhiteboardBrushColors = Record<WhiteboardDrawingTool, string>;
export type WhiteboardBrushSizes = Record<WhiteboardBrushTool, number>;

export interface WhiteboardPoint {
  x: number;
  y: number;
}

export interface WhiteboardStrokePoint extends WhiteboardPoint {
  azimuth?: number;
  breakBefore?: boolean;
  pressure: number;
  rotation?: number;
  tilt?: number;
  velocity?: number;
}

export interface WhiteboardViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface WhiteboardElement {
  id: string;
  type: WhiteboardElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  imageAssetPath?: string;
  imageSrc?: string;
  text: string;
}

export interface WhiteboardStroke {
  color: string;
  id: string;
  points: WhiteboardStrokePoint[];
  renderPathOffset?: number;
  renderPointOffset?: number;
  renderSeed?: string;
  renderTaperEnd?: boolean;
  renderTaperStart?: boolean;
  renderTextureScale?: number;
  size: number;
  tool: WhiteboardDrawingTool;
}

interface WhiteboardToolConfig {
  id: WhiteboardTool;
  labelKey: MessageKey;
  icon: IconName;
  imageSrc: string;
}

export interface WhiteboardBrush {
  color: string;
  baseWidth: number;
  opacity: number;
  pressureWidth: number;
}

export const WHITEBOARD_INITIAL_VIEWPORT: WhiteboardViewport = {
  x: themeWhiteboardTokens.initialPanX,
  y: themeWhiteboardTokens.initialPanY,
  zoom: themeWhiteboardTokens.defaultZoom,
};

export const WHITEBOARD_DRAWING_TOOLS: WhiteboardToolConfig[] = [
  { id: 'pen', labelKey: 'whiteboard.tool.pen', icon: 'whiteboard.pen', imageSrc: penImage },
  { id: 'pencil', labelKey: 'whiteboard.tool.pencil', icon: 'whiteboard.pencil', imageSrc: pencilImage },
  { id: 'marker', labelKey: 'whiteboard.tool.marker', icon: 'whiteboard.marker', imageSrc: markerImage },
  { id: 'colored-pencil', labelKey: 'whiteboard.tool.coloredPencil', icon: 'whiteboard.coloredPencil', imageSrc: coloredPencilImage },
  { id: 'watercolor', labelKey: 'whiteboard.tool.watercolor', icon: 'whiteboard.watercolor', imageSrc: watercolorImage },
  { id: 'crayon', labelKey: 'whiteboard.tool.crayon', icon: 'whiteboard.crayon', imageSrc: crayonImage },
];

export const WHITEBOARD_ERASER_TOOLS: WhiteboardToolConfig[] = [
  { id: 'select', labelKey: 'whiteboard.tool.select', icon: 'whiteboard.select', imageSrc: selectImage },
  { id: 'stroke-eraser', labelKey: 'whiteboard.tool.strokeEraser', icon: 'whiteboard.eraser', imageSrc: eraserImage },
  { id: 'eraser', labelKey: 'whiteboard.tool.eraser', icon: 'whiteboard.areaEraser', imageSrc: eraserImage },
];

export const WHITEBOARD_BRUSHES: Record<WhiteboardDrawingTool, WhiteboardBrush> = {
  pen: {
    color: 'var(--vlaina-color-whiteboard-pen)',
    baseWidth: themeWhiteboardTokens.penBaseWidthPx,
    opacity: 1,
    pressureWidth: themeWhiteboardTokens.penPressureWidthPx,
  },
  pencil: {
    color: 'var(--vlaina-color-whiteboard-pencil)',
    baseWidth: themeWhiteboardTokens.pencilBaseWidthPx,
    opacity: themeWhiteboardTokens.pencilOpacity,
    pressureWidth: themeWhiteboardTokens.pencilPressureWidthPx,
  },
  marker: {
    color: 'var(--vlaina-color-whiteboard-marker)',
    baseWidth: themeWhiteboardTokens.markerBaseWidthPx,
    opacity: themeWhiteboardTokens.markerOpacity,
    pressureWidth: themeWhiteboardTokens.markerPressureWidthPx,
  },
  'colored-pencil': {
    color: 'var(--vlaina-color-whiteboard-colored-pencil)',
    baseWidth: themeWhiteboardTokens.coloredPencilBaseWidthPx,
    opacity: themeWhiteboardTokens.coloredPencilOpacity,
    pressureWidth: themeWhiteboardTokens.coloredPencilPressureWidthPx,
  },
  fountain: {
    color: 'var(--vlaina-color-whiteboard-pen)',
    baseWidth: themeWhiteboardTokens.fountainBaseWidthPx,
    opacity: 1,
    pressureWidth: themeWhiteboardTokens.fountainPressureWidthPx,
  },
  watercolor: {
    color: 'var(--vlaina-color-whiteboard-watercolor)',
    baseWidth: themeWhiteboardTokens.watercolorBaseWidthPx,
    opacity: themeWhiteboardTokens.watercolorOpacity,
    pressureWidth: themeWhiteboardTokens.watercolorPressureWidthPx,
  },
  crayon: {
    color: 'var(--vlaina-color-whiteboard-crayon)',
    baseWidth: themeWhiteboardTokens.crayonBaseWidthPx,
    opacity: themeWhiteboardTokens.crayonOpacity,
    pressureWidth: themeWhiteboardTokens.crayonPressureWidthPx,
  },
};

export const WHITEBOARD_SEED_ELEMENTS: WhiteboardElement[] = [];
export const WHITEBOARD_SEED_STROKES: WhiteboardStroke[] = [];
export const WHITEBOARD_DEFAULT_BRUSH_SIZES: WhiteboardBrushSizes = {
  pen: 1,
  pencil: 1,
  marker: 1,
  'colored-pencil': 1,
  fountain: 1,
  watercolor: 1,
  crayon: 1,
  'stroke-eraser': 1,
};
export const WHITEBOARD_DEFAULT_BRUSH_COLORS: WhiteboardBrushColors = {
  pen: themeWhiteboardTokens.brushColorSwatches[6],
  pencil: themeWhiteboardTokens.brushColorSwatches[6],
  marker: themeWhiteboardTokens.brushColorSwatches[6],
  'colored-pencil': themeWhiteboardTokens.brushColorSwatches[6],
  fountain: themeWhiteboardTokens.brushColorSwatches[6],
  watercolor: themeWhiteboardTokens.brushColorSwatches[6],
  crayon: themeWhiteboardTokens.brushColorSwatches[6],
};

export const WHITEBOARD_DEFAULT_PAPER_STYLE: WhiteboardPaperStyle = 'dots';

export function clampWhiteboardZoom(zoom: number): number {
  return Math.max(themeWhiteboardTokens.minZoom, Math.round(zoom * 100) / 100);
}

export function screenPointToBoardPoint(
  point: WhiteboardPoint,
  viewport: WhiteboardViewport,
): WhiteboardPoint {
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom,
  };
}

export function zoomViewportAtPoint(
  viewport: WhiteboardViewport,
  screenPoint: WhiteboardPoint,
  nextZoom: number,
): WhiteboardViewport {
  const zoom = clampWhiteboardZoom(nextZoom);
  const boardPoint = screenPointToBoardPoint(screenPoint, viewport);
  return {
    x: Math.round((screenPoint.x - boardPoint.x * zoom) * 100) / 100,
    y: Math.round((screenPoint.y - boardPoint.y * zoom) * 100) / 100,
    zoom,
  };
}

export function getWhiteboardElementCenter(element: WhiteboardElement): WhiteboardPoint {
  return {
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
  };
}

export function resizeWhiteboardElement(
  element: WhiteboardElement,
  width: number,
  height: number,
): WhiteboardElement {
  return {
    ...element,
    width: Math.max(themeWhiteboardTokens.minElementWidthPx, Math.round(width)),
    height: Math.max(themeWhiteboardTokens.minElementHeightPx, Math.round(height)),
  };
}

export function isDrawingTool(tool: WhiteboardTool): tool is WhiteboardDrawingTool {
  return tool === 'pen' || tool === 'pencil' || tool === 'marker' || tool === 'colored-pencil' || tool === 'fountain' || tool === 'watercolor' || tool === 'crayon';
}

export function isBrushTool(tool: WhiteboardTool): tool is WhiteboardBrushTool {
  return isDrawingTool(tool) || tool === 'stroke-eraser';
}

export function getStrokeWidth(tool: WhiteboardDrawingTool, pressure: number, size = 1): number {
  const brush = WHITEBOARD_BRUSHES[tool];
  return (brush.baseWidth + brush.pressureWidth * normalizePressure(pressure)) * size;
}

export function getBrushPreviewRadius(tool: WhiteboardBrushTool, size: number): number {
  if (tool === 'stroke-eraser') return getStrokeEraserRadius(size);
  return getStrokeWidth(tool, 1, size) / 2;
}

export function getEraserRadius(size: number): number {
  return themeWhiteboardTokens.eraserRadiusPx * size;
}

export function getStrokeEraserRadius(size: number): number {
  return themeWhiteboardTokens.strokeEraserRadiusPx * size;
}

export function resizeBrushSize(size: number, deltaY: number): number {
  const direction = deltaY > 0 ? -1 : 1;
  const nextSize = size + direction * themeWhiteboardTokens.brushWheelStep;
  return Math.max(themeWhiteboardTokens.minBrushSize, Math.round(nextSize * 100) / 100);
}

export function createStrokePoint(point: WhiteboardPoint, pressure: number, dynamics: Pick<WhiteboardStrokePoint, 'azimuth' | 'rotation' | 'tilt' | 'velocity'> = {}): WhiteboardStrokePoint {
  const azimuth = normalizeAngle(dynamics.azimuth);
  const rotation = normalizeAngle(dynamics.rotation);
  const tilt = normalizeUnitValue(dynamics.tilt);
  const velocity = normalizeVelocity(dynamics.velocity);
  return {
    ...point,
    ...(azimuth !== null ? { azimuth } : {}),
    pressure: normalizePressure(pressure),
    ...(rotation !== null ? { rotation } : {}),
    ...(tilt !== null && tilt > 0 ? { tilt } : {}),
    ...(velocity !== null ? { velocity } : {}),
  };
}

function normalizePressure(pressure: number): number {
  if (!Number.isFinite(pressure)) return themeWhiteboardTokens.defaultPointerPressure;
  return Math.min(1, Math.max(themeWhiteboardTokens.minPointerPressure, pressure));
}

function normalizeAngle(angle: number | undefined): number | null {
  if (angle === undefined || !Number.isFinite(angle)) return null;
  const fullTurn = Math.PI * 2;
  return (angle % fullTurn + fullTurn) % fullTurn;
}

function normalizeUnitValue(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

function normalizeVelocity(velocity: number | undefined): number | null {
  return velocity === undefined || !Number.isFinite(velocity) ? null : Math.max(0, velocity);
}
