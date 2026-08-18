import type { EditorView } from '@milkdown/kit/prose/view';

export interface EditorBlockPositionEntry {
  from: number;
  to: number;
  element: HTMLElement;
  rect: DOMRect;
  documentLeft?: number;
  documentRight?: number;
  documentTop: number;
  documentBottom: number;
  tagName: string;
  headingLevel: number | null;
  headingId: string | null;
  headingText: string | null;
}

export interface EditorHeadingPositionEntry {
  id: string;
  level: number;
  text: string;
  from: number;
  to: number;
  element: HTMLElement | null;
  hasExactGeometry?: boolean;
  top: number;
  bottom: number;
}

export interface EditorBlockPositionSnapshot {
  version: number;
  view: EditorView;
  doc: EditorView['state']['doc'];
  editorRoot: HTMLElement;
  editorRect?: DOMRect;
  scrollRoot: HTMLElement | null;
  scrollRootRect?: DOMRect | null;
  scrollLeft: number;
  scrollTop: number;
  geometryValidationScrollLeft?: number;
  geometryValidationScrollTop?: number;
  blocks: EditorBlockPositionEntry[];
  blockIndex: Map<string, EditorBlockPositionEntry>;
  headings: EditorHeadingPositionEntry[];
}

export interface EditorBlockPositionController {
  refresh: () => void;
  destroy: () => void;
}
