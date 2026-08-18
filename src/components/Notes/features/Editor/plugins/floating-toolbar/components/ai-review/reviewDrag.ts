import type { EditorView } from '@milkdown/kit/prose/view';
import { floatingToolbarKey } from '../../floatingToolbarKey';
import { TOOLBAR_ACTIONS } from '../../types';

interface BindAiReviewDragParams {
  container: HTMLElement;
  dragHandle: HTMLElement;
  view: EditorView;
}

interface AiReviewDragPosition {
  x: number;
  y: number;
}

export function bindAiReviewDrag({
  container,
  dragHandle,
  view,
}: BindAiReviewDragParams) {
  let activeDragCleanup: (() => void) | null = null;

  const handleMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) {
      return;
    }

    activeDragCleanup?.();
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const initialLeft = Number.parseFloat(container.style.left || '0');
    const initialTop = Number.parseFloat(container.style.top || '0');
    const panelWidth = container.offsetWidth;
    const panelHeight = container.offsetHeight;
    let pendingPosition: AiReviewDragPosition | null = null;
    let dragFrame: number | null = null;
    let stopped = false;

    const getDragPosition = (clientX: number, clientY: number): AiReviewDragPosition => {
      const nextLeft = initialLeft + (clientX - startX);
      const nextTop = initialTop + (clientY - startY);
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const maxLeft = Math.max(12, viewportWidth - panelWidth - 12);
      const maxTop = Math.max(12, viewportHeight - panelHeight - 12);

      return {
        x: Math.min(Math.max(12, nextLeft), maxLeft),
        y: Math.min(Math.max(12, nextTop), maxTop),
      };
    };

    const applyDragPosition = (position: AiReviewDragPosition) => {
      container.style.left = `${position.x}px`;
      container.style.top = `${position.y}px`;
    };

    const dispatchDragPosition = (position: AiReviewDragPosition) => {
      view.dispatch(
        view.state.tr.setMeta(floatingToolbarKey, {
          type: TOOLBAR_ACTIONS.UPDATE_POSITION,
          payload: {
            dragPosition: position,
          },
        })
      );
    };

    const flushPendingDrag = () => {
      dragFrame = null;
      if (!pendingPosition) return;
      const position = pendingPosition;
      pendingPosition = null;
      dispatchDragPosition(position);
    };

    const cancelPendingDrag = () => {
      if (dragFrame !== null) {
        window.cancelAnimationFrame(dragFrame);
        dragFrame = null;
      }
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if ((moveEvent.buttons & 1) === 0) {
        finishDrag();
        return;
      }
      const position = getDragPosition(moveEvent.clientX, moveEvent.clientY);
      applyDragPosition(position);
      pendingPosition = position;

      if (dragFrame !== null) return;
      dragFrame = window.requestAnimationFrame(flushPendingDrag);
    };

    const removeDragListeners = () => {
      window.removeEventListener('mousemove', handleMouseMove, true);
      window.removeEventListener('mouseup', handleMouseUp, true);
      window.removeEventListener('blur', handleWindowBlur);
    };

    const finishDrag = () => {
      if (stopped) return;
      stopped = true;
      removeDragListeners();
      cancelPendingDrag();
      flushPendingDrag();
      if (activeDragCleanup === cancelDrag) {
        activeDragCleanup = null;
      }
    };

    const cancelDrag = () => {
      if (stopped) return;
      stopped = true;
      removeDragListeners();
      cancelPendingDrag();
      pendingPosition = null;
      if (activeDragCleanup === cancelDrag) {
        activeDragCleanup = null;
      }
    };

    const handleMouseUp = () => finishDrag();
    const handleWindowBlur = () => finishDrag();

    activeDragCleanup = cancelDrag;
    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('mouseup', handleMouseUp, true);
    window.addEventListener('blur', handleWindowBlur);
  };

  dragHandle.addEventListener('mousedown', handleMouseDown);
  return () => {
    dragHandle.removeEventListener('mousedown', handleMouseDown);
    activeDragCleanup?.();
  };
}
