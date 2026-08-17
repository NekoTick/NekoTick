import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatchNotesTabSplitDrag } from './features/Split/notesSplitDragEvents';
import {
  createInitialNotesSplitPaneTree,
  splitNotesPaneTree,
  type NotesSplitPaneTree,
} from './features/Split/notesSplitLayout';
import { useNotesSplitDrop } from './useNotesSplitDrop';
import { useNotesSplitPaneDrag } from './useNotesSplitPaneDrag';
import { useNotesSplitResize } from './useNotesSplitResize';

const mocks = vi.hoisted(() => ({
  requestNativeCaretOverlayRefresh: vi.fn(),
  setLayoutPanelDragging: vi.fn(),
}));

vi.mock('@/hooks/useNativeCaretOverlay', () => ({
  requestNativeCaretOverlayRefresh: mocks.requestNativeCaretOverlayRefresh,
}));

vi.mock('@/stores/uiSlice', () => ({
  useUIStore: (selector: (state: { setLayoutPanelDragging: typeof mocks.setLayoutPanelDragging }) => unknown) =>
    selector({ setLayoutPanelDragging: mocks.setLayoutPanelDragging }),
}));

function installAnimationFrameQueue() {
  const callbacks: FrameRequestCallback[] = [];
  const requestAnimationFrame = vi
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  return { callbacks, requestAnimationFrame };
}

function dispatchPointer(type: 'pointermove' | 'pointerup' | 'pointercancel', clientX: number, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { configurable: true, value: clientX },
    clientY: { configurable: true, value: clientY },
  });
  document.dispatchEvent(event);
}

afterEach(() => {
  delete (document as Document & { elementsFromPoint?: typeof document.elementsFromPoint }).elementsFromPoint;
  document.body.replaceChildren();
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('Notes split interactions', () => {
  it('coalesces split resize measurements into one animation frame', () => {
    const frames = installAnimationFrameQueue();
    const container = document.createElement('div');
    const handle = document.createElement('div');
    container.appendChild(handle);
    document.body.appendChild(container);
    const getBoundingClientRect = vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      bottom: 400,
      height: 400,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const setSplitPaneTree = vi.fn();
    const { result, unmount } = renderHook(() => useNotesSplitResize({ setSplitPaneTree }));
    act(() => {
      result.current.beginSplitResize('split-1', 'horizontal', {
        clientX: 200,
        clientY: 0,
        currentTarget: handle,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as never);
    });
    getBoundingClientRect.mockClear();
    setSplitPaneTree.mockClear();
    frames.requestAnimationFrame.mockClear();

    dispatchPointer('pointermove', 250, 0);
    dispatchPointer('pointermove', 300, 0);
    dispatchPointer('pointermove', 350, 0);

    expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(getBoundingClientRect).not.toHaveBeenCalled();
    act(() => {
      frames.callbacks[0]?.(0);
    });
    expect(getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(setSplitPaneTree).toHaveBeenCalledTimes(1);
    dispatchPointer('pointerup', 350, 0);
    unmount();
  });

  it.each(['pointerup', 'pointercancel'] as const)(
    'preserves the latest scheduled resize point on %s',
    (endType) => {
      installAnimationFrameQueue();
      const container = document.createElement('div');
      const handle = document.createElement('div');
      container.appendChild(handle);
      document.body.appendChild(container);
      vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
        bottom: 400,
        height: 400,
        left: 0,
        right: 800,
        top: 0,
        width: 800,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      const setSplitPaneTree = vi.fn();
      const { result, unmount } = renderHook(() => useNotesSplitResize({ setSplitPaneTree }));
      act(() => {
        result.current.beginSplitResize('split-1', 'horizontal', {
          clientX: 200,
          clientY: 0,
          currentTarget: handle,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        } as never);
      });
      setSplitPaneTree.mockClear();

      dispatchPointer('pointermove', 360, 0);
      dispatchPointer(endType, 400, 0);

      expect(setSplitPaneTree).toHaveBeenCalledTimes(1);
      const update = setSplitPaneTree.mock.calls[0]?.[0] as ((tree: NotesSplitPaneTree) => NotesSplitPaneTree);
      const initialTree = splitNotesPaneTree(
        createInitialNotesSplitPaneTree(),
        'primary',
        { type: 'preview', id: 'preview-1', path: 'A.md', requiresOpenTab: true },
        'right',
        'split-1',
      );
      const nextTree = update(initialTree);
      expect(nextTree.type).toBe('split');
      if (nextTree.type === 'split') {
        expect(nextTree.ratio).toBe(endType === 'pointerup' ? 0.5 : 0.45);
      }
      unmount();
    },
  );

  it('coalesces split-pane drop target resolution into one animation frame', () => {
    const frames = installAnimationFrameQueue();
    const resolveSplitDropTarget = vi.fn(() => ({ leafId: 'leaf-2', direction: 'right' as const }));
    const setSplitDropTarget = vi.fn();
    const setSplitPaneTree = vi.fn();
    const activeSplitResizeRef = { current: null };
    const stopSplitResize = vi.fn();
    const { result, unmount } = renderHook(() => useNotesSplitPaneDrag({
      active: true,
      activeSplitResizeRef,
      hasSplitPanes: true,
      nextSplitPaneId: () => 'split-next',
      resolveSplitDropTarget,
      setSplitDropTarget,
      setSplitPaneTree,
      stopSplitResize,
    }));
    act(() => {
      result.current.beginSplitPaneDrag({
        clientX: 10,
        clientY: 10,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as never, 'leaf-1');
    });

    dispatchPointer('pointermove', 30, 20);
    dispatchPointer('pointermove', 40, 20);
    dispatchPointer('pointermove', 50, 20);

    expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(resolveSplitDropTarget).not.toHaveBeenCalled();
    act(() => {
      frames.callbacks[0]?.(0);
    });
    expect(resolveSplitDropTarget).toHaveBeenCalledTimes(1);
    expect(setSplitDropTarget).toHaveBeenCalledTimes(1);
    dispatchPointer('pointerup', 50, 20);
    unmount();
  });

  it('does not add a second frame after split drag producers coalesce pointer moves', () => {
    const frames = installAnimationFrameQueue();
    const root = document.createElement('div');
    const leaf = document.createElement('div');
    leaf.dataset.notesSplitLeafId = 'leaf-1';
    root.appendChild(leaf);
    document.body.appendChild(root);
    const elementsFromPoint = vi.fn(() => [leaf]);
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: elementsFromPoint,
    });
    vi.spyOn(leaf, 'getBoundingClientRect').mockReturnValue({
      bottom: 400,
      height: 400,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const setSplitDropTarget = vi.fn();
    const setSplitPaneTree = vi.fn();
    const stableArgs = {
      active: true,
      currentNotePathRef: { current: 'Current.md' },
      nextSplitPaneId: () => 'next-id',
      openNote: vi.fn(),
      openNoteByAbsolutePath: vi.fn(),
      openTabs: [],
      prefetchNote: vi.fn(async () => undefined),
      setSplitDropTarget,
      setSplitPaneTree,
      splitDropRootRef: { current: root },
    };
    const { unmount } = renderHook(() => useNotesSplitDrop(stableArgs));
    frames.requestAnimationFrame.mockClear();

    act(() => {
      dispatchNotesTabSplitDrag({ phase: 'move', path: 'A.md', clientX: 100, clientY: 200 });
    });

    expect(frames.requestAnimationFrame).not.toHaveBeenCalled();
    expect(elementsFromPoint).toHaveBeenCalledTimes(1);
    expect(setSplitDropTarget).toHaveBeenCalledWith({ leafId: 'leaf-1', direction: 'left' });
    unmount();
  });
});
