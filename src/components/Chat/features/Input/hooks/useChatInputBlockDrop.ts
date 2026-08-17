import { useEffect, useState, type RefObject } from 'react';
import {
  getBlockDragComposerPayload,
  subscribeBlockDragVisualState,
} from '@/components/Notes/features/Editor/plugins/cursor/blockDragVisualState';
import { insertTextIntoComposer } from '@/lib/ui/composerFocusRegistry';

interface UseChatInputBlockDropOptions {
  acceptNotesBlockDrop: boolean;
  active: boolean;
  clearHistoryNavigationOnInput: () => void;
  composerRootRef: RefObject<HTMLDivElement | null>;
  resetHistoryNavigation: () => void;
}

export function useChatInputBlockDrop({
  acceptNotesBlockDrop,
  active,
  clearHistoryNavigationOnInput,
  composerRootRef,
  resetHistoryNavigation,
}: UseChatInputBlockDropOptions) {
  const [isBlockDropActive, setIsBlockDropActive] = useState(false);

  useEffect(() => {
    if (!acceptNotesBlockDrop || !active) {
      setIsBlockDropActive(false);
      return;
    }

    let hasBlockDragPayload = Boolean(getBlockDragComposerPayload());
    let pointerFrameId = 0;
    let pointerFrameScheduled = false;
    let pendingPointer: { x: number; y: number } | null = null;

    const isInsideDropTarget = (point: { x: number; y: number }) => {
      const root = composerRootRef.current?.closest('[data-notes-block-drop-target="true"]') as HTMLElement | null;
      if (!root) {
        return false;
      }
      const rect = root.getBoundingClientRect();
      return (
        point.x >= rect.left
        && point.x <= rect.right
        && point.y >= rect.top
        && point.y <= rect.bottom
      );
    };

    const cancelPointerFrame = () => {
      if (pointerFrameId !== 0) {
        window.cancelAnimationFrame(pointerFrameId);
      }
      pointerFrameId = 0;
      pointerFrameScheduled = false;
      pendingPointer = null;
    };

    const syncDropActive = () => {
      hasBlockDragPayload = Boolean(getBlockDragComposerPayload());
      if (!hasBlockDragPayload) {
        cancelPointerFrame();
        setIsBlockDropActive(false);
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!hasBlockDragPayload) return;

      pendingPointer = { x: event.clientX, y: event.clientY };
      if (pointerFrameScheduled) return;

      pointerFrameScheduled = true;
      const frameId = window.requestAnimationFrame(() => {
        pointerFrameId = 0;
        pointerFrameScheduled = false;
        const point = pendingPointer;
        pendingPointer = null;
        if (point && hasBlockDragPayload) {
          setIsBlockDropActive(isInsideDropTarget(point));
        }
      });
      if (pointerFrameScheduled) {
        pointerFrameId = frameId;
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      cancelPointerFrame();
      const payload = getBlockDragComposerPayload();
      const shouldInsert = Boolean(payload?.text) && isInsideDropTarget({
        x: event.clientX,
        y: event.clientY,
      });
      setIsBlockDropActive(false);
      if (!shouldInsert || !payload) {
        return;
      }

      event.preventDefault();
      insertTextIntoComposer(payload.text);
      resetHistoryNavigation();
      clearHistoryNavigationOnInput();
    };

    const unsubscribe = subscribeBlockDragVisualState(syncDropActive);
    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('mouseup', handleMouseUp, true);

    return () => {
      cancelPointerFrame();
      unsubscribe();
      window.removeEventListener('mousemove', handleMouseMove, true);
      window.removeEventListener('mouseup', handleMouseUp, true);
      setIsBlockDropActive(false);
    };
  }, [
    acceptNotesBlockDrop,
    active,
    clearHistoryNavigationOnInput,
    composerRootRef,
    resetHistoryNavigation,
  ]);

  return isBlockDropActive;
}
