import type { EditorView } from '@milkdown/kit/prose/view';
import type { VerticalEdgeAutoScrollHandle } from '../cursor/edgeAutoScroll';

export interface PointerCaretTarget {
  doc?: EditorView['state']['doc'];
  node?: Node;
  offset?: number;
  pos: number;
}

export interface TextSelectionOverlayViewSession {
  clearNativeSelectionFrame: number | null;
  keyClearFrame: number | null;
  keyboardSelectionPendingCleanupTimeout: number | null;
  lastClassSignature: string;
  lastPointerSelectionY: number | null;
  pendingPointerClickCollapseTarget: PointerCaretTarget | null;
  pointerClickCollapseFrame: number | null;
  pointerClickCollapseTarget: PointerCaretTarget | null;
  pointerClickCollapseTimeout: number | null;
  pointerDownPoint: { x: number; y: number } | null;
  pointerMovedSinceDown: boolean;
  pointerNativeReleaseFrame: number | null;
  pointerSelectionAutoScroll: VerticalEdgeAutoScrollHandle;
  preserveNativeSelectionForKeyboard: boolean;
  isPointerSelectionActive: boolean;
  setPointerNativeSelection: (nextValue: boolean) => void;
  syncActiveClass: () => void;
}

export interface TextSelectionOverlayViewContext {
  ownerWindow: Window;
  session: TextSelectionOverlayViewSession;
  view: EditorView;
}
