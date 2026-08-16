import {
  createTextEditorOpenInteraction,
  type TextEditorOpenInteractionView,
} from '../shared/textEditorOpenInteraction';
import { resolveMermaidEditorOpenState } from './mermaidEditorOpenResolver';
import type { MermaidEditorState } from './types';

const MERMAID_NODE_SELECTOR = '[data-type="mermaid"]';
const MERMAID_SCROLLBAR_HIT_AREA_PX = 18;
const mermaidEditorOpenInteraction = createTextEditorOpenInteraction<MermaidEditorState>({
  nodeSelector: MERMAID_NODE_SELECTOR,
  resolveOpenState: resolveMermaidEditorOpenState,
});

export const findMermaidEditorTargetElement = mermaidEditorOpenInteraction.findTargetElement;
export const getMermaidAnchorViewportPosition = mermaidEditorOpenInteraction.getAnchorViewportPosition;
export const resolveMermaidAnchorElement = mermaidEditorOpenInteraction.resolveAnchorElement;
export const resolveMermaidEditorOpenMeta = mermaidEditorOpenInteraction.resolveOpenMeta;

export function isMermaidScrollbarPointerDown(args: {
  event: MouseEvent;
  mermaidElement: HTMLElement;
}) {
  const { event, mermaidElement } = args;
  if (typeof window === 'undefined') return false;

  const overflowX = window.getComputedStyle(mermaidElement).overflowX;
  const measuredScrollbarHeight = mermaidElement.offsetHeight - mermaidElement.clientHeight;
  const hasHorizontalScrollbar =
    (overflowX === 'auto' || overflowX === 'scroll') &&
    mermaidElement.scrollWidth > mermaidElement.clientWidth;
  if (!hasHorizontalScrollbar) return false;

  const rect = mermaidElement.getBoundingClientRect();
  const scrollbarHitArea = Math.max(measuredScrollbarHeight, MERMAID_SCROLLBAR_HIT_AREA_PX);
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.bottom - scrollbarHitArea &&
    event.clientY <= rect.bottom
  );
}

export function isSelectedScrollableMermaidElement(mermaidElement: HTMLElement) {
  return (
    mermaidElement.classList.contains('editor-block-selected') &&
    mermaidElement.scrollWidth > mermaidElement.clientWidth
  );
}

export function resolveMermaidEditorPointerOpen(args: {
  view: TextEditorOpenInteractionView;
  target: EventTarget | null;
}) {
  const resolved = mermaidEditorOpenInteraction.resolvePointerOpen(args);
  return resolved ? { mermaidElement: resolved.targetElement, meta: resolved.meta } : null;
}
