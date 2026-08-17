import { useCallback, useEffect, useState, type RefObject } from 'react';
import type { NoteMentionReference } from '@/lib/ai/noteMentions';
import {
  FILE_TREE_CHAT_DROP_EVENT,
  FILE_TREE_CHAT_DROP_TARGET_SELECTOR,
  type FileTreeChatDropDetail,
} from '@/components/Notes/features/FileTree/hooks/fileTreePointerDragState';

interface UseChatInputFileTreeDropOptions {
  active: boolean;
  appendNoteMentions: (mentions: NoteMentionReference[]) => void;
  clearHistoryNavigationOnInput: () => void;
  composerRootRef: RefObject<HTMLDivElement | null>;
  getDisplayName: (path: string) => string;
  isFileTreeDragActive: boolean;
  resetHistoryNavigation: () => void;
}

export function useChatInputFileTreeDrop({
  active,
  appendNoteMentions,
  clearHistoryNavigationOnInput,
  composerRootRef,
  getDisplayName,
  isFileTreeDragActive,
  resetHistoryNavigation,
}: UseChatInputFileTreeDropOptions) {
  const [isFileTreeDropActive, setIsFileTreeDropActive] = useState(false);

  const buildDroppedFileTreeMentions = useCallback(
    (detail: FileTreeChatDropDetail): NoteMentionReference[] => {
      const title = detail.kind === 'folder'
        ? `${detail.path.split('/').filter(Boolean).pop() ?? detail.path}/`
        : getDisplayName(detail.path);
      return [{
        path: detail.path,
        title,
        kind: detail.kind === 'folder' ? 'folder' : 'note',
      }];
    },
    [getDisplayName],
  );

  useEffect(() => {
    if (!active) {
      setIsFileTreeDropActive(false);
      return;
    }

    let pointerFrameId = 0;
    let pointerFrameScheduled = false;
    let pendingPointer: { x: number; y: number } | null = null;

    const isInsideDropTarget = (point: { x: number; y: number }) => {
      const root = composerRootRef.current?.closest(FILE_TREE_CHAT_DROP_TARGET_SELECTOR) as HTMLElement | null;
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

    const handlePointerMove = (event: PointerEvent) => {
      pendingPointer = { x: event.clientX, y: event.clientY };
      if (pointerFrameScheduled) return;

      pointerFrameScheduled = true;
      const frameId = window.requestAnimationFrame(() => {
        pointerFrameId = 0;
        pointerFrameScheduled = false;
        const point = pendingPointer;
        pendingPointer = null;
        if (point) {
          setIsFileTreeDropActive(isInsideDropTarget(point));
        }
      });
      if (pointerFrameScheduled) {
        pointerFrameId = frameId;
      }
    };

    const handlePointerUp = () => {
      cancelPointerFrame();
      setIsFileTreeDropActive(false);
    };

    const handleFileTreeChatDrop = (event: Event) => {
      const detail = (event as CustomEvent<FileTreeChatDropDetail>).detail;
      if (!detail?.path) {
        return;
      }
      appendNoteMentions(buildDroppedFileTreeMentions(detail));
      resetHistoryNavigation();
      clearHistoryNavigationOnInput();
      cancelPointerFrame();
      setIsFileTreeDropActive(false);
    };

    if (isFileTreeDragActive) {
      window.addEventListener('pointermove', handlePointerMove, true);
      window.addEventListener('pointerup', handlePointerUp, true);
    }
    window.addEventListener(FILE_TREE_CHAT_DROP_EVENT, handleFileTreeChatDrop);

    return () => {
      cancelPointerFrame();
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener(FILE_TREE_CHAT_DROP_EVENT, handleFileTreeChatDrop);
      setIsFileTreeDropActive(false);
    };
  }, [
    active,
    appendNoteMentions,
    buildDroppedFileTreeMentions,
    clearHistoryNavigationOnInput,
    composerRootRef,
    isFileTreeDragActive,
    resetHistoryNavigation,
  ]);

  return isFileTreeDropActive;
}
