import type { EditorState } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

export type SelectionColorPreviewSignature = {
  empty: boolean;
  from: number;
  to: number;
} | null;

export type PreviewScrollSnapshot = {
  element: HTMLElement;
  releaseGuard: () => void;
  scrollLeft: number;
  scrollTop: number;
};

export type PreviewScrollGuard = {
  count: number;
  originalOverflowAnchor: string;
  originalOverflowAnchorPriority: string;
};

export const previewStyleState: {
  previewOverlay: {
    key: string;
    node: HTMLElement;
    originalDoc: EditorState['doc'];
    originalViewDisplay: string;
    previewState: EditorState;
    viewDom: HTMLElement;
  } | null;
  previewScrollGuards: WeakMap<HTMLElement, PreviewScrollGuard>;
  selectionColorPreview: {
    key: string;
    originalDoc: EditorState['doc'];
    selection: SelectionColorPreviewSignature;
    styleMutations: Array<{
      cssText: string;
      node: HTMLElement;
    }>;
    viewDom: HTMLElement;
  } | null;
  selectionFormatPreview: {
    key: string;
    originalDoc: EditorState['doc'];
    selection: SelectionColorPreviewSignature;
    viewDom: HTMLElement;
  } | null;
  selectionAlignmentPreview: {
    key: string;
    originalDoc: EditorState['doc'];
    selection: SelectionColorPreviewSignature;
    styleMutations: Array<{
      block: HTMLElement;
      blockDataTextAlign: string | null;
      blockStyle: string | null;
      listItem: HTMLElement | null;
      listItemClassName: string | null;
    }>;
    view: EditorView;
    viewDom: HTMLElement;
  } | null;
  selectionBlockPreview: {
    key: string;
    originalDoc: EditorState['doc'];
    previewNodes: HTMLElement[];
    previewRoot: HTMLElement | null;
    previewState: EditorState;
    restoreBefore: ChildNode | null;
    selection: SelectionColorPreviewSignature;
    sourceNodes: HTMLElement[];
    view: EditorView;
    viewDom: HTMLElement;
  } | null;
} = {
  previewOverlay: null,
  previewScrollGuards: new WeakMap<HTMLElement, PreviewScrollGuard>(),
  selectionColorPreview: null,
  selectionFormatPreview: null,
  selectionAlignmentPreview: null,
  selectionBlockPreview: null,
};
