import {
  createTextEditorOpenInteraction,
  type TextEditorOpenInteractionView,
} from '../shared/textEditorOpenInteraction';
import { resolveMathEditorOpenState } from './mathEditorOpenResolver';
import type { MathEditorState } from './types';

const MATH_NODE_SELECTOR = '[data-type="math-block"], [data-type="math-inline"]';
const mathEditorOpenInteraction = createTextEditorOpenInteraction<MathEditorState>({
  nodeSelector: MATH_NODE_SELECTOR,
  resolveOpenState: resolveMathEditorOpenState,
});

export const findMathEditorTargetElement = mathEditorOpenInteraction.findTargetElement;
export const getMathAnchorViewportPosition = mathEditorOpenInteraction.getAnchorViewportPosition;
export const resolveMathAnchorElement = mathEditorOpenInteraction.resolveAnchorElement;
export const resolveMathEditorOpenMeta = mathEditorOpenInteraction.resolveOpenMeta;

export function isHorizontalScrollbarPointerDown(args: {
  event: MouseEvent;
  mathElement: HTMLElement;
}) {
  const { event, mathElement } = args;
  if (typeof window === 'undefined' || mathElement.dataset.type !== 'math-block') {
    return false;
  }

  const target = event.target instanceof HTMLElement ? event.target : null;
  let current: HTMLElement | null = target;

  while (current) {
    const overflowX = window.getComputedStyle(current).overflowX;
    const scrollbarHeight = current.offsetHeight - current.clientHeight;
    const hasHorizontalScrollbar =
      (overflowX === 'auto' || overflowX === 'scroll') &&
      current.scrollWidth > current.clientWidth &&
      scrollbarHeight > 0;

    if (hasHorizontalScrollbar) {
      const rect = current.getBoundingClientRect();
      const hitHorizontalScrollbar =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.bottom - scrollbarHeight &&
        event.clientY <= rect.bottom;
      if (hitHorizontalScrollbar) return true;
    }

    if (current === mathElement) break;
    current = current.parentElement;
  }

  return false;
}

export function resolveMathEditorPointerOpen(args: {
  view: TextEditorOpenInteractionView;
  target: EventTarget | null;
}) {
  const resolved = mathEditorOpenInteraction.resolvePointerOpen(args);
  return resolved ? { mathElement: resolved.targetElement, meta: resolved.meta } : null;
}
