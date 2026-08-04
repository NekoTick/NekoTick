import { SIDEBAR_SCROLL_ROOT_SELECTOR } from '../../Sidebar/context-menu/shared';
import { useNotesStore } from '@/stores/useNotesStore';
import { isInvalidMoveTarget } from '@/stores/notes/utils/fs/moveValidation';
import { dispatchNotesTabSplitDrag } from '../../Split/notesSplitDragEvents';
import {
  themeDomStyleTokens,
  themeRenderingTokens,
} from '@/styles/themeTokens';
import {
  animatePreviewBackToSource,
  createPreviewElement,
  setPreviewStarred,
  updatePreviewPosition,
} from './fileTreePointerDragPreview';
import {
  FILE_TREE_CHAT_DROP_EVENT,
  FILE_TREE_CHAT_DROP_TARGET_SELECTOR,
  type FileTreeChatDropDetail,
  type FileTreePointerDragSession,
  type FileTreePointerDragSourceKind,
} from './fileTreePointerDragTypes';
import {
  getFileTreePointerDragSnapshot,
  setFileTreePointerDragSnapshot,
  useFileTreePointerDragState,
  useIsFileTreePointerDragActive,
  useIsFileTreePointerDragSource,
  useIsFileTreePointerFolderDropTarget,
  useIsFileTreePointerStarredDropTarget,
} from './fileTreePointerDragStore';
import { ensureStarredPath } from './fileTreePointerDragStarred';
import {
  queueFileTreePointerAutoScroll,
  stopFileTreePointerAutoScroll,
} from './fileTreePointerDragAutoScroll';
import { suppressNextFileTreePointerClick } from './fileTreePointerDragClickSuppression';
import { resolveFileTreePointerDragDropTarget } from './fileTreePointerDragDropTarget';
import { hideImageFileHoverPreview } from '../imageFileHoverPreviewState';

export {
  FILE_TREE_CHAT_DROP_EVENT,
  FILE_TREE_CHAT_DROP_TARGET_SELECTOR,
  useFileTreePointerDragState,
  useIsFileTreePointerDragActive,
  useIsFileTreePointerDragSource,
  useIsFileTreePointerFolderDropTarget,
  useIsFileTreePointerStarredDropTarget,
  type FileTreeChatDropDetail,
  type FileTreePointerDragSourceKind,
};

const DRAG_THRESHOLD_PX = 4;

let activeSession: FileTreePointerDragSession | null = null;

function getScrollRoot() {
  return document.querySelector<HTMLElement>(SIDEBAR_SCROLL_ROOT_SELECTOR);
}

function updateDropTarget() {
  if (!activeSession?.activated) {
    return;
  }

  const dropTarget = resolveFileTreePointerDragDropTarget(activeSession);
  const starredDropChanged = activeSession.pendingStarredDrop !== dropTarget.pendingStarredDrop;
  activeSession.pendingStarredDrop = dropTarget.pendingStarredDrop;
  if (starredDropChanged) {
    setPreviewStarred(activeSession, dropTarget.pendingStarredDrop);
  }
  setFileTreePointerDragSnapshot({
    activeSourcePath: activeSession.sourcePath,
    dropTargetPath: dropTarget.dropTargetPath,
    dropTargetKind: dropTarget.dropTargetKind,
  });
}

function dispatchActiveNoteSplitDrag(phase: 'start' | 'move' | 'end' | 'cancel'): boolean {
  if (!activeSession || activeSession.sourceKind !== 'note') {
    return false;
  }

  return dispatchNotesTabSplitDrag({
    phase,
    path: activeSession.sourcePath,
    source: 'sidebar',
    clientX: activeSession.lastClientX,
    clientY: activeSession.lastClientY,
  });
}

function queueAutoScroll() {
  queueFileTreePointerAutoScroll(activeSession, updateDropTarget);
}

function handlePointerMove(event: PointerEvent) {
  if (!activeSession) {
    return;
  }

  if ((event.buttons & 1) === 0) {
    finishPointerDrag(false);
    return;
  }

  activeSession.lastClientX = event.clientX;
  activeSession.lastClientY = event.clientY;

  if (!activeSession.activated) {
    const distance = Math.hypot(
      event.clientX - activeSession.startX,
      event.clientY - activeSession.startY,
    );
    if (distance < DRAG_THRESHOLD_PX) {
      return;
    }

    activeSession.activated = true;
    activeSession.scrollRoot = getScrollRoot();
    document.body.style.cursor = themeDomStyleTokens.cursorGrabbing;
    document.body.style.userSelect = themeRenderingTokens.userSelectNone;
    const { previewElement, rect } = createPreviewElement(activeSession.sourceElement);
    activeSession.previewElement = previewElement;
    activeSession.previewOffsetX = Math.min(Math.max(activeSession.startX - rect.left, 16), rect.width - 16);
    activeSession.previewOffsetY = Math.min(Math.max(activeSession.startY - rect.top, 12), rect.height - 12);
    dispatchActiveNoteSplitDrag('start');
    dispatchActiveNoteSplitDrag('move');
    updateDropTarget();

    activeSession.scrollRoot?.addEventListener('scroll', handleScrollRootScroll, true);
  } else {
    dispatchActiveNoteSplitDrag('move');
    updateDropTarget();
  }

  event.preventDefault();
  updatePreviewPosition(activeSession);
  queueAutoScroll();
}

function handlePointerUp(event: PointerEvent) {
  if (!activeSession) {
    return;
  }

  if (activeSession.activated) {
    event.preventDefault();
    finishPointerDrag(true);
    return;
  }

  finishPointerDrag(false);
}

function handlePointerCancel() {
  finishPointerDrag(false);
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Escape' || !activeSession) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  finishPointerDrag(false);
}

function handleScrollRootScroll() {
  updateDropTarget();
  queueAutoScroll();
}

function teardownPointerDrag() {
  stopFileTreePointerAutoScroll(activeSession);
  document.removeEventListener('pointermove', handlePointerMove, true);
  document.removeEventListener('pointerup', handlePointerUp, true);
  document.removeEventListener('pointercancel', handlePointerCancel, true);
  document.removeEventListener('keydown', handleKeyDown, true);
  window.removeEventListener('blur', handlePointerCancel);

  if (activeSession?.scrollRoot) {
    activeSession.scrollRoot.removeEventListener('scroll', handleScrollRootScroll, true);
  }

  if (activeSession?.previewElement) {
    activeSession.previewElement.remove();
  }

  if (activeSession?.suppressClickTimeout != null) {
    window.clearTimeout(activeSession.suppressClickTimeout);
  }

  if (activeSession) {
    document.body.style.cursor = activeSession.previousBodyCursor;
    document.body.style.userSelect = activeSession.previousBodyUserSelect;
  }

  activeSession = null;
  setFileTreePointerDragSnapshot({
    activeSourcePath: null,
    dropTargetPath: null,
    dropTargetKind: null,
  });
}

function finishPointerDrag(shouldCommit: boolean) {
  if (!activeSession) {
    return;
  }

  const sourcePath = activeSession.sourcePath;
  const sourceKind = activeSession.sourceKind;
  const sourceElement = activeSession.sourceElement;
  const previewElement = activeSession.previewElement;
  const hasVisibleStarBadge = Boolean(
    previewElement?.querySelector('[data-file-tree-drag-star-badge="true"]'),
  );
  const snapshot = getFileTreePointerDragSnapshot();
  const shouldStar = shouldCommit && activeSession.activated && (
    activeSession.pendingStarredDrop || hasVisibleStarBadge || snapshot.dropTargetKind === 'starred'
  );
  const dropTargetPath = snapshot.dropTargetPath;
  const dropTargetKind = snapshot.dropTargetKind;
  const shouldMove = !shouldStar
    && shouldCommit
    && activeSession.activated
    && dropTargetKind === 'folder'
    && dropTargetPath != null
    && !isInvalidMoveTarget(sourcePath, dropTargetPath);
  const shouldDropToChat = sourceKind !== 'image'
    && shouldCommit
    && activeSession.activated
    && document
      .elementsFromPoint(activeSession.lastClientX, activeSession.lastClientY)
      .some((element) => element.closest(FILE_TREE_CHAT_DROP_TARGET_SELECTOR));
  const shouldSplit = shouldCommit && activeSession.activated && dispatchActiveNoteSplitDrag('end');
  const shouldSuppressClick = shouldCommit && activeSession.activated;

  activeSession.previewElement = null;
  if (!shouldCommit && activeSession.activated) {
    dispatchActiveNoteSplitDrag('cancel');
  }

  teardownPointerDrag();
  if (shouldSplit || shouldDropToChat || shouldStar) {
    previewElement?.remove();
  }

  if (!shouldSplit && shouldDropToChat) {
    window.dispatchEvent(new CustomEvent<FileTreeChatDropDetail>(FILE_TREE_CHAT_DROP_EVENT, {
      detail: {
        path: sourcePath,
        kind: sourceKind,
      },
    }));
  } else if (!shouldSplit && !shouldStar) {
    animatePreviewBackToSource(previewElement, sourceElement);
  }

  if (shouldSuppressClick) {
    suppressNextFileTreePointerClick(activeSession);
  }

  if (!shouldSplit && !shouldDropToChat && shouldStar && sourceKind !== 'image') {
    ensureStarredPath(sourceKind === 'folder' ? 'folder' : 'note', sourcePath);
  }

  if (!shouldSplit && !shouldDropToChat && shouldMove && dropTargetPath !== null) {
    void useNotesStore.getState().moveItem(sourcePath, dropTargetPath);
  }
}

export function startFileTreePointerDrag(
  sourcePath: string,
  sourceKind: FileTreePointerDragSourceKind,
  sourceElement: HTMLElement,
  event: PointerEvent,
) {
  if (activeSession) {
    finishPointerDrag(false);
  }
  if (sourceKind === 'image') {
    hideImageFileHoverPreview(sourcePath);
  }

  activeSession = {
    sourcePath,
    sourceKind,
    sourceElement,
    startX: event.clientX,
    startY: event.clientY,
    lastClientX: event.clientX,
    lastClientY: event.clientY,
    activated: false,
    autoScrollFrame: null,
    scrollRoot: null,
    previewElement: null,
    previewOffsetX: 20,
    previewOffsetY: 14,
    pendingStarredDrop: false,
    previousBodyCursor: document.body.style.cursor,
    previousBodyUserSelect: document.body.style.userSelect,
    suppressClickTimeout: null,
  };

  document.addEventListener('pointermove', handlePointerMove, true);
  document.addEventListener('pointerup', handlePointerUp, true);
  document.addEventListener('pointercancel', handlePointerCancel, true);
  document.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('blur', handlePointerCancel);
}

export function requestFileTreePointerDragDropTargetUpdate() {
  updateDropTarget();
}
