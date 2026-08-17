import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resetBlockDragVisualState,
  setBlockDraggingVisualState,
} from '@/components/Notes/features/Editor/plugins/cursor/blockDragVisualState';
import { useChatInputBlockDrop } from './useChatInputBlockDrop';
import { useChatInputFileTreeDrop } from './useChatInputFileTreeDrop';

function createDropTarget(attribute: string) {
  const root = document.createElement('div');
  root.setAttribute(attribute, 'true');
  const composer = document.createElement('div');
  root.appendChild(composer);
  document.body.appendChild(root);
  const getBoundingClientRect = vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
    bottom: 200,
    height: 200,
    left: 0,
    right: 300,
    top: 0,
    width: 300,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return { composer, getBoundingClientRect };
}

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

afterEach(() => {
  resetBlockDragVisualState();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('chat input drop tracking', () => {
  it('coalesces file-tree drag hit testing into one animation frame', () => {
    const frames = installAnimationFrameQueue();
    const target = createDropTarget('data-file-tree-chat-drop-target');
    const composerRootRef = { current: target.composer };
    const appendNoteMentions = vi.fn();
    const clearHistoryNavigationOnInput = vi.fn();
    const getDisplayName = (path: string) => path;
    const resetHistoryNavigation = vi.fn();
    const { result, unmount } = renderHook(() => useChatInputFileTreeDrop({
      active: true,
      appendNoteMentions,
      clearHistoryNavigationOnInput,
      composerRootRef,
      getDisplayName,
      isFileTreeDragActive: true,
      resetHistoryNavigation,
    }));

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 20, clientY: 20 }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 30, clientY: 30 }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 40, clientY: 40 }));

    expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(target.getBoundingClientRect).not.toHaveBeenCalled();
    act(() => {
      frames.callbacks[0]?.(0);
    });
    expect(target.getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(true);
    unmount();
  });

  it('coalesces Notes block drag hit testing into one animation frame', () => {
    const frames = installAnimationFrameQueue();
    const target = createDropTarget('data-notes-block-drop-target');
    const composerRootRef = { current: target.composer };
    const clearHistoryNavigationOnInput = vi.fn();
    const resetHistoryNavigation = vi.fn();
    setBlockDraggingVisualState(true, { text: 'Dragged note blocks' });
    const { result, unmount } = renderHook(() => useChatInputBlockDrop({
      acceptNotesBlockDrop: true,
      active: true,
      clearHistoryNavigationOnInput,
      composerRootRef,
      resetHistoryNavigation,
    }));

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 20 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 30 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 40 }));

    expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(target.getBoundingClientRect).not.toHaveBeenCalled();
    act(() => {
      frames.callbacks[0]?.(0);
    });
    expect(target.getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(true);
    unmount();
  });
});
