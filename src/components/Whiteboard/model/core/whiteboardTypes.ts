import type { WhiteboardAutoDrawIcon } from '@/components/Whiteboard/model/autodraw/whiteboardAutoDrawTypes';

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
  | 'autoshape'
  | 'line'
  | 'arrow'
  | 'text'
  | 'eraser';
export type WhiteboardElementType = 'icon' | 'image' | 'text';
export type WhiteboardPaperStyle = 'blank' | 'dots' | 'grid' | 'ruled';
export type WhiteboardDrawingTool = Extract<WhiteboardTool, 'pen' | 'pencil' | 'marker' | 'colored-pencil' | 'fountain' | 'watercolor' | 'crayon'>;
export type WhiteboardBrushPanelTool = WhiteboardDrawingTool;
export type WhiteboardLinearTool = Extract<WhiteboardTool, 'line' | 'arrow'>;
export type WhiteboardStrokeTool = WhiteboardDrawingTool | WhiteboardLinearTool;
export type WhiteboardBrushTool = WhiteboardDrawingTool;
export type WhiteboardAutoShape =
  | 'triangle'
  | 'rectangle'
  | 'diamond'
  | 'parallelogram'
  | 'trapezoid'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'ellipse'
  | 'star'
  | 'cross';
export type WhiteboardBrushColors = Record<WhiteboardStrokeTool, string>;
export type WhiteboardBrushSizes = Record<WhiteboardStrokeTool, number>;

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
  autoDrawIcon?: WhiteboardAutoDrawIcon;
  color?: string;
  flipX?: boolean;
  flipY?: boolean;
  fontSize?: number;
  id: string;
  type: WhiteboardElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  imageAssetPath?: string;
  imageSrc?: string;
  rotation?: number;
  lineHeight?: number;
  text: string;
}

export interface WhiteboardStroke {
  autoShape?: WhiteboardAutoShape;
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
  tool: WhiteboardStrokeTool;
}
