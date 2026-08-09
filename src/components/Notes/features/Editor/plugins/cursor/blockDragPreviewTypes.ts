import type { EditorView } from '@milkdown/kit/prose/view';
import type { BlockRange } from './blockSelectionUtils';

export const SOURCE_CLASS = 'editor-block-drag-source';
export const SOURCE_TEXTLIKE_CLASS = 'editor-block-drag-source-textlike';
export const SOURCE_HAS_NEXT_CLASS = 'editor-block-drag-source-has-next';
export const SOURCE_HAS_PREVIOUS_CLASS = 'editor-block-drag-source-has-previous';
export const SOURCE_PARENT_MARKER_CLASS = 'editor-block-drag-source-parent-marker';
export const PREVIEW_CLASS = 'editor-block-drag-preview';
export const PREVIEW_LAYER_CLASS = 'editor-block-drag-preview-layer';
export const MIN_PREVIEW_WIDTH = 80;
export const MAX_PREVIEW_POINTER_OFFSET_Y = 96;
export const MAX_ORDERED_LIST_VALUE_CHARS = 16;
export const ORDERED_LIST_VALUE_PATTERN = /^-?\d+$/;
export const DRAG_SOURCE_TEXTLIKE_SELECTOR = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'hr',
  '.md-hr',
  'li',
  'dl',
  'dt',
  'dd',
  '.definition-list',
  '.definition-term',
  '.definition-desc',
  '.footnote-def',
  '.toc-block',
  '.callout',
  "[data-type='html-block']",
].join(',');
export const DRAG_SOURCE_DIRECT_RICH_CHILD_SELECTOR = [
  '.code-block-container',
  '.image-block-container',
  '.video-block',
  "[data-type='math-block']",
  '.mermaid-block',
  '.milkdown-table-block',
].join(',');

export const MAX_BLOCK_DRAG_PREVIEW_DOM_SCAN_ELEMENTS = 20_000;
export const MAX_BLOCK_DRAG_PREVIEW_MATCHED_ELEMENTS = 5_000;
export const MAX_BLOCK_DRAG_PREVIEW_CAPTURE_CONCURRENCY = 2;

export interface BlockDragPreviewOptions {
  view: EditorView;
  ranges: readonly BlockRange[];
  clientX: number;
  clientY: number;
}

export interface BlockDragSourceMarkerOptions {
  view: EditorView;
  ranges: readonly BlockRange[];
}

export interface BlockDragPreviewHandle {
  element: HTMLElement;
  offsetX: number;
  offsetY: number;
  move: (clientX: number, clientY: number) => void;
  destroy: () => void;
}

export interface BlockDragSourceMarkerHandle {
  destroy: () => void;
}

export interface CaptureJob {
  source: HTMLElement;
  target: HTMLElement;
  imageClassName: string;
}

export interface PreviewItem {
  source: HTMLElement;
  sourceClassElement: HTMLElement | null;
  rect: DOMRect;
  content: HTMLElement;
}

export type BlockDragPreviewElementCollection = {
  elements: HTMLElement[];
  complete: boolean;
};
