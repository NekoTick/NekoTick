import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotesStore } from '@/stores/useNotesStore';
import { NOTES_DRAG_RETURN_ANIMATION } from '../../common/NotesDragOverlay';
import {
  FILE_TREE_CHAT_DROP_EVENT,
  requestFileTreePointerDragDropTargetUpdate,
  useFileTreePointerDragState,
} from './fileTreePointerDragState';
import { useTreeItemDragSource } from './useTreeItemDragSource';
import { NOTES_TAB_SPLIT_DRAG_EVENT } from '../../Split/notesSplitDragEvents';
import {
  showImageFileHoverPreview,
  useImageFileHoverPreviewTarget,
} from '../imageFileHoverPreviewState';

function setRect(
  element: Element,
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  },
) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({
        x: rect.left,
        y: rect.top,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        toJSON: () => rect,
      }) as DOMRect,
  });
}

function setScrollMetrics(
  element: HTMLDivElement,
  metrics: {
    clientHeight: number;
    scrollHeight: number;
    scrollTop?: number;
  },
) {
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => metrics.clientHeight,
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => metrics.scrollHeight,
  });

  let currentScrollTop = metrics.scrollTop ?? 0;

  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => currentScrollTop,
    set: (value: number) => {
      currentScrollTop = value;
    },
  });
}

function dispatchDocumentPointerEvent(
  type: 'pointermove' | 'pointerup' | 'pointercancel',
  init: {
    clientX: number;
    clientY: number;
    buttons?: number;
    button?: number;
    pointerId?: number;
    pointerType?: string;
  },
) {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  });

  Object.defineProperties(event, {
    buttons: {
      configurable: true,
      value: init.buttons ?? (type === 'pointerup' ? 0 : 1),
    },
    button: {
      configurable: true,
      value: init.button ?? 0,
    },
    pointerId: {
      configurable: true,
      value: init.pointerId ?? 1,
    },
    pointerType: {
      configurable: true,
      value: init.pointerType ?? 'mouse',
    },
    clientX: {
      configurable: true,
      value: init.clientX,
    },
    clientY: {
      configurable: true,
      value: init.clientY,
    },
  });

  act(() => {
    document.dispatchEvent(event);
  });
}

interface DragHarnessProps {
  path?: string;
  kind?: 'note' | 'folder' | 'image';
  disabled?: boolean;
  folderTargetPath?: string;
  showRootTarget?: boolean;
  showStarredTarget?: boolean;
  showEditableChild?: boolean;
}

function DragHarness({
  path = 'Source.md',
  kind = 'note',
  disabled = false,
  folderTargetPath,
  showRootTarget = false,
  showStarredTarget = false,
  showEditableChild = false,
}: DragHarnessProps) {
  const dragHandlers = useTreeItemDragSource(path, disabled, kind);
  const activeSourcePath = useFileTreePointerDragState((state) => state.activeSourcePath);
  const dropTargetPath = useFileTreePointerDragState((state) => state.dropTargetPath);
  const dropTargetKind = useFileTreePointerDragState((state) => state.dropTargetKind);

  return (
    <div>
      <div data-notes-sidebar-scroll-root="true" data-testid="scroll-root">
        {showStarredTarget ? (
          <div data-file-tree-starred-drop-target="true" data-testid="starred-target">
            Starred
          </div>
        ) : null}
        {showRootTarget ? (
          <div data-file-tree-root-drop-target="true" data-testid="root-target">
            Root
          </div>
        ) : null}
        {folderTargetPath ? (
          <div
            data-file-tree-kind="folder"
            data-file-tree-path={folderTargetPath}
            data-testid="folder-target"
          >
            Folder
          </div>
        ) : null}
        <div
          data-testid="source"
          data-dragging={dragHandlers.isDragging ? 'true' : 'false'}
          onPointerDown={dragHandlers.onPointerDown}
        >
          Source
          {showEditableChild ? (
            <span contentEditable="plaintext-only" data-testid="editable-child" suppressContentEditableWarning>
              edit
            </span>
          ) : null}
        </div>
      </div>
      <div data-testid="active-source">{activeSourcePath ?? ''}</div>
      <div data-testid="drop-target">{dropTargetPath ?? ''}</div>
      <div data-testid="drop-target-kind">{dropTargetKind ?? ''}</div>
    </div>
  );
}

function ImageHoverPreviewProbe() {
  const target = useImageFileHoverPreviewTarget();
  return <div data-testid="image-hover-preview-target">{target?.imagePath ?? ''}</div>;
}

function setupHarness(options: DragHarnessProps = {}) {
  render(<DragHarness {...options} />);

  const source = screen.getByTestId('source');
  const scrollRoot = screen.getByTestId('scroll-root') as HTMLDivElement;
  const folderTarget = screen.queryByTestId('folder-target');
  const rootTarget = screen.queryByTestId('root-target');
  const starredTarget = screen.queryByTestId('starred-target');
  const editableChild = screen.queryByTestId('editable-child');

  setRect(scrollRoot, {
    left: 0,
    top: 0,
    width: 280,
    height: 320,
  });
  setScrollMetrics(scrollRoot, {
    clientHeight: 320,
    scrollHeight: 960,
    scrollTop: 0,
  });
  setRect(source, {
    left: 24,
    top: 24,
    width: 160,
    height: 32,
  });

  if (folderTarget) {
    setRect(folderTarget, {
      left: 24,
      top: 80,
      width: 160,
      height: 32,
    });
  }

  if (rootTarget) {
    setRect(rootTarget, {
      left: 24,
      top: 120,
      width: 160,
      height: 32,
    });
  }

  if (starredTarget) {
    setRect(starredTarget, {
      left: 24,
      top: 120,
      width: 160,
      height: 32,
    });
  }

  return {
    source,
    folderTarget,
    rootTarget,
    starredTarget,
    editableChild,
    activeSource: screen.getByTestId('active-source'),
    dropTarget: screen.getByTestId('drop-target'),
    dropTargetKind: screen.getByTestId('drop-target-kind'),
  };
}

describe('fileTreePointerDragState', () => {
  const moveItemMock = vi.fn<(...args: [string, string]) => Promise<void>>();
  const setStateMock = vi.fn();
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const originalElementsFromPoint = document.elementsFromPoint;

  beforeEach(() => {
    moveItemMock.mockReset();
    moveItemMock.mockResolvedValue(undefined);
    setStateMock.mockReset();

    vi.spyOn(useNotesStore, 'getState').mockReturnValue({
      moveItem: moveItemMock,
      notesPath: '/notesRoot',
      starredEntries: [],
    } as unknown as ReturnType<typeof useNotesStore.getState>);
    vi.spyOn(useNotesStore, 'setState').mockImplementation(setStateMock);

    globalThis.requestAnimationFrame = vi.fn(() => 1) as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = vi.fn() as unknown as typeof cancelAnimationFrame;
    document.elementsFromPoint = vi.fn(() => []);
  });

  afterEach(() => {
    dispatchDocumentPointerEvent('pointercancel', {
      clientX: 0,
      clientY: 0,
      buttons: 0,
    });
    cleanup();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    document.elementsFromPoint = originalElementsFromPoint;
  });

  it('requires movement beyond the threshold before activating drag', async () => {
    const { source, activeSource, dropTarget } = setupHarness({
      folderTargetPath: 'Archive',
    });

    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerType: 'mouse',
    });

    dispatchDocumentPointerEvent('pointermove', {
      clientX: 42,
      clientY: 42,
      buttons: 1,
    });
    dispatchDocumentPointerEvent('pointerup', {
      clientX: 42,
      clientY: 42,
      buttons: 0,
    });

    await waitFor(() => {
      expect(activeSource.textContent).toBe('');
      expect(dropTarget.textContent).toBe('');
      expect(moveItemMock).not.toHaveBeenCalled();
      expect(screen.getAllByTestId('source')).toHaveLength(1);
    });
  });

  it('shows a drag preview and moves into a folder target', async () => {
    const { source, folderTarget, activeSource, dropTarget } = setupHarness({
      path: 'Source.md',
      folderTargetPath: 'Archive',
    });

    document.elementsFromPoint = vi.fn(() => [folderTarget as Element]);

    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerType: 'mouse',
    });

    dispatchDocumentPointerEvent('pointermove', {
      clientX: 40,
      clientY: 52,
      buttons: 1,
    });

    await waitFor(() => {
      expect(activeSource.textContent).toBe('Source.md');
      expect(dropTarget.textContent).toBe('Archive');
      expect(screen.getAllByTestId('source')).toHaveLength(2);
      const preview = screen.getAllByTestId('source')[1] as HTMLElement;
      expect(preview.style.backgroundColor).toBe('var(--vlaina-sidebar-notes-surface)');
      expect(preview.style.boxShadow).toBe('none');
    });

    dispatchDocumentPointerEvent('pointerup', {
      clientX: 40,
      clientY: 52,
      buttons: 0,
    });

    await waitFor(() => {
      expect(moveItemMock).toHaveBeenCalledWith('Source.md', 'Archive');
      expect(activeSource.textContent).toBe('');
      expect(dropTarget.textContent).toBe('');
      expect(screen.getAllByTestId('source')).toHaveLength(1);
    });
  });

  it('moves an image into a folder target', async () => {
    const { source, folderTarget } = setupHarness({
      path: 'cover.png',
      kind: 'image',
      folderTargetPath: 'Archive',
    });

    const elementsFromPointMock = vi.fn(() => [folderTarget as Element]);
    document.elementsFromPoint = elementsFromPointMock;

    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerType: 'mouse',
    });
    dispatchDocumentPointerEvent('pointermove', {
      clientX: 40,
      clientY: 52,
      buttons: 1,
    });
    dispatchDocumentPointerEvent('pointerup', {
      clientX: 40,
      clientY: 52,
      buttons: 0,
    });

    await waitFor(() => {
      expect(moveItemMock).toHaveBeenCalledWith('cover.png', 'Archive');
    });
    expect(elementsFromPointMock).toHaveBeenCalledTimes(1);
  });

  it('closes the image hover preview when an image pointer drag starts', () => {
    showImageFileHoverPreview({
      imagePath: 'cover.png',
      notesPath: '/notesRoot',
    });
    const { source } = setupHarness({
      path: 'cover.png',
      kind: 'image',
    });
    render(<ImageHoverPreviewProbe />);

    expect(screen.getByTestId('image-hover-preview-target')).toHaveTextContent('cover.png');

    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerType: 'mouse',
    });

    expect(screen.getByTestId('image-hover-preview-target')).toBeEmptyDOMElement();
  });

  it('does not start image hover previews while a pointer drag is active', () => {
    const { source, folderTarget } = setupHarness({
      path: 'cover.png',
      kind: 'image',
      folderTargetPath: 'Archive',
    });
    render(<ImageHoverPreviewProbe />);
    document.elementsFromPoint = vi.fn(() => [folderTarget as Element]);

    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerType: 'mouse',
    });
    dispatchDocumentPointerEvent('pointermove', {
      clientX: 40,
      clientY: 52,
      buttons: 1,
    });

    act(() => {
      showImageFileHoverPreview({
        imagePath: 'other.png',
        notesPath: '/notesRoot',
      });
    });

    expect(screen.getByTestId('image-hover-preview-target')).toBeEmptyDOMElement();
  });

  it('drops a dragged file tree item onto the chat target without moving it', async () => {
    const { source } = setupHarness({
      path: 'docs/Source.md',
      folderTargetPath: 'Archive',
    });
    const chatTarget = document.createElement('div');
    chatTarget.dataset.fileTreeChatDropTarget = 'true';
    document.body.append(chatTarget);
    const chatDropListener = vi.fn();
    window.addEventListener(FILE_TREE_CHAT_DROP_EVENT, chatDropListener);
    document.elementsFromPoint = vi.fn(() => [chatTarget]);

    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerType: 'mouse',
    });

    dispatchDocumentPointerEvent('pointermove', {
      clientX: 40,
      clientY: 52,
      buttons: 1,
    });
    dispatchDocumentPointerEvent('pointerup', {
      clientX: 40,
      clientY: 52,
      buttons: 0,
    });

    await waitFor(() => {
      expect(chatDropListener).toHaveBeenCalledTimes(1);
      expect((chatDropListener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
        path: 'docs/Source.md',
        kind: 'note',
      });
      expect(moveItemMock).not.toHaveBeenCalled();
    });

    window.removeEventListener(FILE_TREE_CHAT_DROP_EVENT, chatDropListener);
  });

  it('does not turn an image drag into a chat note drop', async () => {
    const { source, activeSource } = setupHarness({
      path: 'cover.png',
      kind: 'image',
    });
    const chatTarget = document.createElement('div');
    chatTarget.dataset.fileTreeChatDropTarget = 'true';
    document.body.append(chatTarget);
    const chatDropListener = vi.fn();
    window.addEventListener(FILE_TREE_CHAT_DROP_EVENT, chatDropListener);
    document.elementsFromPoint = vi.fn(() => [chatTarget]);

    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerType: 'mouse',
    });
    dispatchDocumentPointerEvent('pointermove', {
      clientX: 40,
      clientY: 52,
      buttons: 1,
    });
    dispatchDocumentPointerEvent('pointerup', {
      clientX: 40,
      clientY: 52,
      buttons: 0,
    });

    await waitFor(() => {
      expect(activeSource.textContent).toBe('');
      expect(chatDropListener).not.toHaveBeenCalled();
      expect(moveItemMock).not.toHaveBeenCalled();
    });

    window.removeEventListener(FILE_TREE_CHAT_DROP_EVENT, chatDropListener);
  });

  it('suppresses file tree drop actions when a note split drop is accepted', async () => {
    const { source, folderTarget } = setupHarness({
      path: 'docs/Source.md',
      folderTargetPath: 'Archive',
    });
    const splitDragListener = vi.fn((event: Event) => {
      const detail = (event as CustomEvent).detail as { phase: string; source?: string };
      if (detail.phase === 'end') {
        event.preventDefault();
      }
    });
    window.addEventListener(NOTES_TAB_SPLIT_DRAG_EVENT, splitDragListener);
    document.elementsFromPoint = vi.fn(() => [folderTarget as Element]);

    try {
      fireEvent.pointerDown(source, {
        button: 0,
        clientX: 40,
        clientY: 40,
        pointerType: 'mouse',
      });

      dispatchDocumentPointerEvent('pointermove', {
        clientX: 40,
        clientY: 52,
        buttons: 1,
      });
      dispatchDocumentPointerEvent('pointerup', {
        clientX: 40,
        clientY: 52,
        buttons: 0,
      });

      await waitFor(() => {
        expect(splitDragListener).toHaveBeenCalledWith(expect.objectContaining({
          type: NOTES_TAB_SPLIT_DRAG_EVENT,
        }));
      });
      const details = splitDragListener.mock.calls.map((call) => (call[0] as CustomEvent).detail);
      expect(details).toEqual(expect.arrayContaining([
        expect.objectContaining({ phase: 'start', source: 'sidebar', path: 'docs/Source.md' }),
        expect.objectContaining({ phase: 'move', source: 'sidebar', path: 'docs/Source.md' }),
        expect.objectContaining({ phase: 'end', source: 'sidebar', path: 'docs/Source.md' }),
      ]));
      expect(moveItemMock).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(NOTES_TAB_SPLIT_DRAG_EVENT, splitDragListener);
    }
  });

  it('uses the shared drag overlay timing when returning the preview', async () => {
    const animateMock = vi.fn(() => ({
      finished: Promise.resolve(),
    }));
    const animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animateMock,
    });

    try {
      const { source, folderTarget } = setupHarness({
        path: 'Source.md',
        folderTargetPath: 'Archive',
      });

      document.elementsFromPoint = vi.fn(() => [folderTarget as Element]);

      fireEvent.pointerDown(source, {
        button: 0,
        clientX: 40,
        clientY: 40,
        pointerType: 'mouse',
      });
      dispatchDocumentPointerEvent('pointermove', {
        clientX: 40,
        clientY: 52,
        buttons: 1,
      });
      dispatchDocumentPointerEvent('pointerup', {
        clientX: 40,
        clientY: 52,
        buttons: 0,
      });

      expect(animateMock).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          duration: NOTES_DRAG_RETURN_ANIMATION.duration,
          easing: NOTES_DRAG_RETURN_ANIMATION.easing,
        }),
      );
    } finally {
      if (animateDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'animate', animateDescriptor);
      } else {
        delete (HTMLElement.prototype as { animate?: unknown }).animate;
      }
    }
  });

  it('moves to the explicit root drop target', async () => {
    const { source, rootTarget } = setupHarness({
      path: 'Folder/Source.md',
      showRootTarget: true,
    });

    document.elementsFromPoint = vi.fn(() => [rootTarget as Element]);

    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerType: 'mouse',
    });

    dispatchDocumentPointerEvent('pointermove', {
      clientX: 40,
      clientY: 52,
      buttons: 1,
    });
    dispatchDocumentPointerEvent('pointerup', {
      clientX: 40,
      clientY: 52,
      buttons: 0,
    });

    await waitFor(() => {
      expect(moveItemMock).toHaveBeenCalledWith('Folder/Source.md', '');
    });
  });

  it('stars a note when dropped on the starred target without moving it', async () => {
    const { source, starredTarget, dropTargetKind } = setupHarness({
      path: 'Source.md',
      showStarredTarget: true,
    });

    document.elementsFromPoint = vi.fn(() => [starredTarget as Element]);

    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerType: 'mouse',
    });

    dispatchDocumentPointerEvent('pointermove', {
      clientX: 40,
      clientY: 52,
      buttons: 1,
    });

    await waitFor(() => {
      expect(dropTargetKind.textContent).toBe('starred');
      expect(document.querySelector('[data-file-tree-drag-star-badge="true"]')).not.toBeNull();
    });

    dispatchDocumentPointerEvent('pointerup', {
      clientX: 40,
      clientY: 52,
      buttons: 0,
    });

    await waitFor(() => {
      expect(setStateMock).toHaveBeenCalledWith(expect.objectContaining({
        starredNotes: ['Source.md'],
        starredFolders: [],
      }));
      expect(moveItemMock).not.toHaveBeenCalled();
    });
  });

  it('removes the preview without a return animation after starring', async () => {
    const animateMock = vi.fn(() => ({
      finished: Promise.resolve(),
    }));
    const animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animateMock,
    });

    try {
      const { source, starredTarget } = setupHarness({
        path: 'Source.md',
        showStarredTarget: true,
      });

      document.elementsFromPoint = vi.fn(() => [starredTarget as Element]);

      fireEvent.pointerDown(source, {
        button: 0,
        clientX: 40,
        clientY: 40,
        pointerType: 'mouse',
      });
      dispatchDocumentPointerEvent('pointermove', {
        clientX: 40,
        clientY: 52,
        buttons: 1,
      });
      dispatchDocumentPointerEvent('pointerup', {
        clientX: 40,
        clientY: 52,
        buttons: 0,
      });

      await waitFor(() => {
        expect(setStateMock).toHaveBeenCalledWith(expect.objectContaining({
          starredNotes: ['Source.md'],
        }));
        expect(animateMock).not.toHaveBeenCalled();
        expect(document.querySelector('[data-file-tree-drag-star-badge="true"]')).toBeNull();
      });
    } finally {
      if (animateDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'animate', animateDescriptor);
      } else {
        delete (HTMLElement.prototype as { animate?: unknown }).animate;
      }
    }
  });

  it('does not mark a non-markdown note as a valid starred drop target', async () => {
    const { source, starredTarget, dropTargetKind } = setupHarness({
      path: 'image.png',
      showStarredTarget: true,
    });

    document.elementsFromPoint = vi.fn(() => [starredTarget as Element]);

    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerType: 'mouse',
    });
    dispatchDocumentPointerEvent('pointermove', {
      clientX: 40,
      clientY: 52,
      buttons: 1,
    });

    await waitFor(() => {
      expect(dropTargetKind.textContent).toBe('');
      expect(document.querySelector('[data-file-tree-drag-star-badge="true"]')).toBeNull();
    });

    dispatchDocumentPointerEvent('pointerup', {
      clientX: 40,
      clientY: 52,
      buttons: 0,
    });

    await waitFor(() => {
      expect(setStateMock).not.toHaveBeenCalled();
      expect(moveItemMock).not.toHaveBeenCalled();
    });
  });

  it('stars a folder when dropped on the starred target', async () => {
    const { source, starredTarget } = setupHarness({
      path: 'Projects',
      kind: 'folder',
      showStarredTarget: true,
    });

    document.elementsFromPoint = vi.fn(() => [starredTarget as Element]);

    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerType: 'mouse',
    });
    dispatchDocumentPointerEvent('pointermove', {
      clientX: 40,
      clientY: 52,
      buttons: 1,
    });
    dispatchDocumentPointerEvent('pointerup', {
      clientX: 40,
      clientY: 52,
      buttons: 0,
    });

    await waitFor(() => {
      expect(setStateMock).toHaveBeenCalledWith(expect.objectContaining({
        starredNotes: [],
        starredFolders: ['Projects'],
      }));
      expect(moveItemMock).not.toHaveBeenCalled();
    });
  });

  it('does not duplicate an already starred note when dropped on the starred target', async () => {
    vi.spyOn(useNotesStore, 'getState').mockReturnValue({
      moveItem: moveItemMock,
      notesPath: '/notesRoot',
      starredEntries: [{
        id: 'starred-existing',
        kind: 'note',
        notesRootPath: '/notesRoot',
        relativePath: 'Source.md',
        addedAt: 1,
      }],
    } as unknown as ReturnType<typeof useNotesStore.getState>);

    const { source, starredTarget } = setupHarness({
      path: 'Source.md',
      showStarredTarget: true,
    });

    document.elementsFromPoint = vi.fn(() => [starredTarget as Element]);

    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerType: 'mouse',
    });
    dispatchDocumentPointerEvent('pointermove', {
      clientX: 40,
      clientY: 52,
      buttons: 1,
    });
    dispatchDocumentPointerEvent('pointerup', {
      clientX: 40,
      clientY: 52,
      buttons: 0,
    });

    await waitFor(() => {
      expect(setStateMock).not.toHaveBeenCalled();
      expect(moveItemMock).not.toHaveBeenCalled();
    });
  });

  it('keeps the starred drop intent when the pointerup hit test misses the target', async () => {
    const { source, starredTarget, dropTargetKind } = setupHarness({
      path: 'Source.md',
      showStarredTarget: true,
    });

    document.elementsFromPoint = vi.fn(() => [starredTarget as Element]);

    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerType: 'mouse',
    });
    dispatchDocumentPointerEvent('pointermove', {
      clientX: 40,
      clientY: 52,
      buttons: 1,
    });

    await waitFor(() => {
      expect(dropTargetKind.textContent).toBe('starred');
    });

    document.elementsFromPoint = vi.fn(() => []);

    dispatchDocumentPointerEvent('pointerup', {
      clientX: 40,
      clientY: 52,
      buttons: 0,
    });

    await waitFor(() => {
      expect(setStateMock).toHaveBeenCalledWith(expect.objectContaining({
        starredNotes: ['Source.md'],
      }));
      expect(moveItemMock).not.toHaveBeenCalled();
    });
  });

  it('can refresh the starred drop target after it appears during an active drag', async () => {
    const { source, starredTarget, dropTargetKind } = setupHarness({
      path: 'Source.md',
      showStarredTarget: true,
    });

    document.elementsFromPoint = vi.fn(() => []);

    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerType: 'mouse',
    });
    dispatchDocumentPointerEvent('pointermove', {
      clientX: 40,
      clientY: 52,
      buttons: 1,
    });

    await waitFor(() => {
      expect(dropTargetKind.textContent).toBe('');
    });

    document.elementsFromPoint = vi.fn(() => [starredTarget as Element]);

    act(() => {
      requestFileTreePointerDragDropTargetUpdate();
    });

    await waitFor(() => {
      expect(dropTargetKind.textContent).toBe('starred');
    });

    dispatchDocumentPointerEvent('pointerup', {
      clientX: 40,
      clientY: 52,
      buttons: 0,
    });

    await waitFor(() => {
      expect(setStateMock).toHaveBeenCalledWith(expect.objectContaining({
        starredNotes: ['Source.md'],
      }));
      expect(moveItemMock).not.toHaveBeenCalled();
    });
  });

  it('cancels an active drag on Escape without moving', async () => {
    const { source, folderTarget, activeSource, dropTarget } = setupHarness({
      path: 'Source.md',
      folderTargetPath: 'Archive',
    });

    document.elementsFromPoint = vi.fn(() => [folderTarget as Element]);

    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerType: 'mouse',
    });
    dispatchDocumentPointerEvent('pointermove', {
      clientX: 40,
      clientY: 52,
      buttons: 1,
    });

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(moveItemMock).not.toHaveBeenCalled();
      expect(activeSource.textContent).toBe('');
      expect(dropTarget.textContent).toBe('');
      expect(screen.getAllByTestId('source')).toHaveLength(1);
    });
  });

  it('keeps dragging when the previously focused editor element blurs', async () => {
    const { source, folderTarget } = setupHarness({
      path: 'Source.md',
      folderTargetPath: 'Archive',
    });
    const editor = document.createElement('div');
    editor.tabIndex = 0;
    document.body.appendChild(editor);
    editor.focus();
    document.elementsFromPoint = vi.fn(() => [folderTarget as Element]);

    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerType: 'mouse',
    });
    act(() => editor.blur());
    dispatchDocumentPointerEvent('pointermove', {
      clientX: 40,
      clientY: 52,
      buttons: 1,
    });
    dispatchDocumentPointerEvent('pointerup', {
      clientX: 40,
      clientY: 52,
      buttons: 0,
    });

    await waitFor(() => {
      expect(moveItemMock).toHaveBeenCalledWith('Source.md', 'Archive');
    });
  });

  it('cancels an active drag when the application window blurs', async () => {
    const { source, folderTarget, activeSource } = setupHarness({
      path: 'Source.md',
      folderTargetPath: 'Archive',
    });
    document.elementsFromPoint = vi.fn(() => [folderTarget as Element]);

    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerType: 'mouse',
    });
    dispatchDocumentPointerEvent('pointermove', {
      clientX: 40,
      clientY: 52,
      buttons: 1,
    });
    act(() => window.dispatchEvent(new FocusEvent('blur')));
    dispatchDocumentPointerEvent('pointerup', {
      clientX: 40,
      clientY: 52,
      buttons: 0,
    });

    await waitFor(() => {
      expect(activeSource.textContent).toBe('');
      expect(moveItemMock).not.toHaveBeenCalled();
    });
  });

  it('shows current parent feedback without moving the item', async () => {
    const { source, folderTarget, dropTarget } = setupHarness({
      path: 'Archive/Source.md',
      folderTargetPath: 'Archive',
    });

    document.elementsFromPoint = vi.fn(() => [folderTarget as Element]);

    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerType: 'mouse',
    });
    dispatchDocumentPointerEvent('pointermove', {
      clientX: 40,
      clientY: 52,
      buttons: 1,
    });

    expect(dropTarget.textContent).toBe('Archive');

    dispatchDocumentPointerEvent('pointerup', {
      clientX: 40,
      clientY: 52,
      buttons: 0,
    });

    await waitFor(() => {
      expect(dropTarget.textContent).toBe('');
      expect(moveItemMock).not.toHaveBeenCalled();
    });
  });

  it('does not start drag when the source is disabled', async () => {
    const { source, folderTarget, activeSource } = setupHarness({
      path: 'Source.md',
      disabled: true,
      folderTargetPath: 'Archive',
    });

    document.elementsFromPoint = vi.fn(() => [folderTarget as Element]);

    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerType: 'mouse',
    });
    dispatchDocumentPointerEvent('pointermove', {
      clientX: 40,
      clientY: 52,
      buttons: 1,
    });
    dispatchDocumentPointerEvent('pointerup', {
      clientX: 40,
      clientY: 52,
      buttons: 0,
    });

    await waitFor(() => {
      expect(activeSource.textContent).toBe('');
      expect(moveItemMock).not.toHaveBeenCalled();
      expect(screen.getAllByTestId('source')).toHaveLength(1);
    });
  });

  it('does not start drag for touch pointers', async () => {
    const { source, folderTarget, activeSource } = setupHarness({
      path: 'Source.md',
      folderTargetPath: 'Archive',
    });

    document.elementsFromPoint = vi.fn(() => [folderTarget as Element]);

    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerType: 'touch',
    });
    dispatchDocumentPointerEvent('pointermove', {
      clientX: 40,
      clientY: 52,
      buttons: 1,
      pointerType: 'touch',
    });
    dispatchDocumentPointerEvent('pointerup', {
      clientX: 40,
      clientY: 52,
      buttons: 0,
      pointerType: 'touch',
    });

    await waitFor(() => {
      expect(activeSource.textContent).toBe('');
      expect(moveItemMock).not.toHaveBeenCalled();
      expect(screen.getAllByTestId('source')).toHaveLength(1);
    });
  });

  it('does not start drag from plaintext-only editable children', async () => {
    const { editableChild, folderTarget, activeSource } = setupHarness({
      path: 'Source.md',
      folderTargetPath: 'Archive',
      showEditableChild: true,
    });

    document.elementsFromPoint = vi.fn(() => [folderTarget as Element]);

    fireEvent.pointerDown(editableChild as HTMLElement, {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerType: 'mouse',
    });
    dispatchDocumentPointerEvent('pointermove', {
      clientX: 40,
      clientY: 52,
      buttons: 1,
    });
    dispatchDocumentPointerEvent('pointerup', {
      clientX: 40,
      clientY: 52,
      buttons: 0,
    });

    await waitFor(() => {
      expect(activeSource.textContent).toBe('');
      expect(moveItemMock).not.toHaveBeenCalled();
      expect(screen.getAllByTestId('source')).toHaveLength(1);
    });
  });
});
