import type {
  WhiteboardElement,
  WhiteboardPaperStyle,
  WhiteboardStroke,
  WhiteboardViewport,
} from './whiteboardModel';

export const WHITEBOARD_DOCUMENT_FORMAT = 'vlaina.whiteboard';
export const WHITEBOARD_DOCUMENT_MIME_TYPE = 'application/vnd.vlaina.whiteboard+json';
export const WHITEBOARD_DOCUMENT_VERSION = 1;

export interface WhiteboardSnapshot {
  elements: WhiteboardElement[];
  strokes: WhiteboardStroke[];
  viewport: WhiteboardViewport;
  paper?: WhiteboardPaperStyle;
}

export type StoredStrokePoint = [
  number,
  number,
  number,
  (true | null)?,
  (number | null)?,
  (number | null)?,
  (number | null)?,
  number?,
];
export interface StoredStroke extends Omit<WhiteboardStroke, 'points'> { points: StoredStrokePoint[] }
export interface StoredContent extends Omit<WhiteboardSnapshot, 'strokes'> { strokes: StoredStroke[] }

export interface WhiteboardDocumentV1 {
  content: StoredContent;
  format: typeof WHITEBOARD_DOCUMENT_FORMAT;
  version: typeof WHITEBOARD_DOCUMENT_VERSION;
}
