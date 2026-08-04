import type { EditorView } from '@milkdown/kit/prose/view';
import { createDragSelectionRect, type RectBounds } from './blockSelectionUtils';
import { setBlockSelectionInteractionPending } from './blockSelectionInteractionState';

export type BlockDragStartZone = 'outside-editor' | 'below-last-block' | 'external-sidebar-blank';

const BLOCK_SELECTION_PENDING_CLASS = 'editor-block-selection-pending';
const BLOCK_SELECTION_LARGE_CLASS = 'editor-block-selection-large';

interface StartBlockDragSessionOptions {
  view: EditorView;
  event: MouseEvent;
  startZone: BlockDragStartZone;
  dragThreshold: number;
  cursor: string;
  cursorRoot?: HTMLElement | null;
  onActivate: () => void;
  onPointerMove?: (pointer: BlockDragPointer) => void;
  onDragMove: (selectionRect: RectBounds, pointer: BlockDragPointer) => void;
  onPlainClick: (startZone: BlockDragStartZone) => void;
  onTeardown?: () => void;
}

export interface BlockDragPointer {
  clientX: number;
  clientY: number;
}

export interface BlockDragSessionHandle {
  stop: () => void;
}

export function startBlockDragSession(options: StartBlockDragSessionOptions): BlockDragSessionHandle {
  const {
    view,
    event,
    startZone,
    dragThreshold,
    cursor,
    cursorRoot: providedCursorRoot,
    onActivate,
    onDragMove,
    onPlainClick,
    onTeardown,
  } = options;

  const startX = event.clientX;
  const startY = event.clientY;
  let activated = false;
  let stopped = false;
  let visualStateApplied = false;
  let interactionShield: HTMLDivElement | null = null;
  let dragMoveRafId = 0;
  let pendingDragMove: { rect: RectBounds; pointer: BlockDragPointer } | null = null;
  let hasDispatchedDragMove = false;
  const shouldApplyPendingDomClass = !view.dom.classList.contains(BLOCK_SELECTION_LARGE_CLASS);

  const editorRoot = view.dom.closest('.milkdown-editor') as HTMLElement | null;
  const cursorRoot = providedCursorRoot ?? editorRoot ?? view.dom;
  const ownerDocument = view.dom.ownerDocument;
  const previousCursorRootCursor = cursorRoot.style.cursor;
  const previousViewCursor = view.dom.style.cursor;
  const previousEditorRootCursor = editorRoot?.style.cursor ?? '';
  const ownerWindow = ownerDocument.defaultView ?? window;

  const suppressFollowUpClick = () => {
    let timeoutId: number | null = null;
    const cleanup = () => {
      ownerWindow.removeEventListener('click', handleClick, true);
      if (timeoutId !== null) ownerWindow.clearTimeout(timeoutId);
    };
    const handleClick = (clickEvent: MouseEvent) => {
      cleanup();
      clickEvent.preventDefault();
      clickEvent.stopPropagation();
      clickEvent.stopImmediatePropagation();
    };
    ownerWindow.addEventListener('click', handleClick, true);
    timeoutId = ownerWindow.setTimeout(cleanup, 0);
  };

  const applyVisualState = (nextCursor: string) => {
    if (!visualStateApplied) {
      if (shouldApplyPendingDomClass) {
        view.dom.classList.add(BLOCK_SELECTION_PENDING_CLASS);
      }
      interactionShield = ownerDocument.createElement('div');
      interactionShield.className = 'editor-block-selection-interaction-shield';
      interactionShield.style.cursor = nextCursor;
      ownerDocument.body.appendChild(interactionShield);
      visualStateApplied = true;
    }
    if (shouldApplyPendingDomClass) {
      cursorRoot.style.cursor = nextCursor;
      view.dom.style.cursor = nextCursor;
      if (editorRoot && editorRoot !== cursorRoot) editorRoot.style.cursor = nextCursor;
    }
  };

  const flushPendingDragMove = () => {
    if (dragMoveRafId !== 0) {
      ownerWindow.cancelAnimationFrame(dragMoveRafId);
      dragMoveRafId = 0;
    }
    const nextMove = pendingDragMove;
    pendingDragMove = null;
    if (!nextMove || stopped) return;
    onDragMove(nextMove.rect, nextMove.pointer);
  };

  const scheduleDragMove = (selectionRect: RectBounds, pointer: BlockDragPointer) => {
    pendingDragMove = { rect: selectionRect, pointer };
    if (dragMoveRafId !== 0) return;
    dragMoveRafId = ownerWindow.requestAnimationFrame(() => {
      dragMoveRafId = 0;
      const nextMove = pendingDragMove;
      pendingDragMove = null;
      if (!nextMove || stopped) return;
      onDragMove(nextMove.rect, nextMove.pointer);
    });
  };

  const teardown = () => {
    if (stopped) return;
    stopped = true;
    if (dragMoveRafId !== 0) {
      ownerWindow.cancelAnimationFrame(dragMoveRafId);
      dragMoveRafId = 0;
    }
    pendingDragMove = null;
    if (shouldApplyPendingDomClass) {
      cursorRoot.style.cursor = previousCursorRootCursor;
    }
    if (visualStateApplied && shouldApplyPendingDomClass) {
      view.dom.classList.remove(BLOCK_SELECTION_PENDING_CLASS);
    }
    interactionShield?.remove();
    interactionShield = null;
    setBlockSelectionInteractionPending(view.dom, false);
    if (shouldApplyPendingDomClass) {
      view.dom.style.cursor = previousViewCursor;
      if (editorRoot && editorRoot !== cursorRoot) editorRoot.style.cursor = previousEditorRootCursor;
    }
    ownerDocument.removeEventListener('mousemove', handleMouseMove, true);
    ownerDocument.removeEventListener('mouseup', handleMouseUp, true);
    ownerWindow.removeEventListener('blur', handleWindowBlur);
    onTeardown?.();
  };

  const handleMouseMove = (moveEvent: MouseEvent) => {
    if ((moveEvent.buttons & 1) === 0) {
      teardown();
      return;
    }

    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;
    if (!activated && Math.hypot(dx, dy) < dragThreshold) {
      return;
    }

    if (!activated) {
      activated = true;
      applyVisualState(cursor);
      onActivate();
    }

    moveEvent.preventDefault();
    const pointer = {
      clientX: moveEvent.clientX,
      clientY: moveEvent.clientY,
    };
    options.onPointerMove?.(pointer);
    const selectionRect = createDragSelectionRect(startX, startY, moveEvent.clientX, moveEvent.clientY);
    if (!hasDispatchedDragMove) {
      hasDispatchedDragMove = true;
      onDragMove(selectionRect, pointer);
      return;
    }
    scheduleDragMove(selectionRect, pointer);
  };

  const handleMouseUp = (upEvent: MouseEvent) => {
    if (!activated) {
      onPlainClick(startZone);
      suppressFollowUpClick();
    } else {
      upEvent.preventDefault();
      flushPendingDragMove();
      suppressFollowUpClick();
    }
    teardown();
  };

  const handleWindowBlur = (blurEvent: Event) => {
    if (blurEvent.target !== ownerWindow) {
      return;
    }
    teardown();
  };

  setBlockSelectionInteractionPending(view.dom, true);
  ownerDocument.addEventListener('mousemove', handleMouseMove, true);
  ownerDocument.addEventListener('mouseup', handleMouseUp, true);
  ownerWindow.addEventListener('blur', handleWindowBlur);
  event.preventDefault();

  return {
    stop: teardown,
  };
}
