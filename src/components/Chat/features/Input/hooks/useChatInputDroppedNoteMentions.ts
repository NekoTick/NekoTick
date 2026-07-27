import { useCallback, useEffect, type DragEvent } from 'react';
import type { NoteMentionReference } from '@/lib/ai/noteMentions';
import { getCurrentNotesRootPath, useNotesStore } from '@/stores/notes/useNotesStore';
import { useNotesRootStore } from '@/stores/useNotesRootStore';
import { buildDroppedNoteMentions, isInsideChatDropRegion } from '../chatInputDropMentions';

interface UseChatInputDroppedNoteMentionsOptions {
  active: boolean;
  appendNoteMentions: (mentions: NoteMentionReference[]) => void;
  clearDragState: () => void;
  clearHistoryNavigationOnInput: () => void;
  getDisplayName: (path: string) => string;
  handleAttachmentDrop: (event: DragEvent<HTMLDivElement>) => Promise<void>;
  resetHistoryNavigation: () => void;
}

export function useChatInputDroppedNoteMentions({
  active,
  appendNoteMentions,
  clearDragState,
  clearHistoryNavigationOnInput,
  getDisplayName,
  handleAttachmentDrop,
  resetHistoryNavigation,
}: UseChatInputDroppedNoteMentionsOptions) {
  const notesPath = useNotesStore((state) => state.notesPath);
  const activeNotesRootPath = useNotesRootStore((state) => state.currentNotesRoot?.path ?? null);

  const applyDroppedNoteMentions = useCallback((dataTransfer: DataTransfer | null | undefined) => {
    const effectiveNotesRootPath = notesPath || activeNotesRootPath || getCurrentNotesRootPath() || '';
    const droppedNoteMentions = buildDroppedNoteMentions(
      dataTransfer,
      effectiveNotesRootPath,
      getDisplayName,
    );
    if (droppedNoteMentions.length === 0) {
      return false;
    }

    clearDragState();
    appendNoteMentions(droppedNoteMentions);
    resetHistoryNavigation();
    clearHistoryNavigationOnInput();
    return true;
  }, [
    activeNotesRootPath,
    appendNoteMentions,
    clearDragState,
    clearHistoryNavigationOnInput,
    getDisplayName,
    notesPath,
    resetHistoryNavigation,
  ]);

  const handleComposerDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      if (applyDroppedNoteMentions(event.dataTransfer)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      await handleAttachmentDrop(event);
    },
    [
      applyDroppedNoteMentions,
      handleAttachmentDrop,
    ]
  );

  const handleComposerDropCapture = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!applyDroppedNoteMentions(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    },
    [applyDroppedNoteMentions]
  );

  useEffect(() => {
    if (!active) {
      return;
    }

    const handleWindowDropCapture = (event: globalThis.DragEvent) => {
      if (event.defaultPrevented || !isInsideChatDropRegion(event)) {
        return;
      }
      if (!applyDroppedNoteMentions(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('drop', handleWindowDropCapture, true);
    return () => window.removeEventListener('drop', handleWindowDropCapture, true);
  }, [active, applyDroppedNoteMentions]);

  return {
    handleComposerDrop,
    handleComposerDropCapture,
  };
}
