import { useCallback, useEffect, useRef, useState } from 'react';
import { isEventInsideDialog } from '@/lib/shortcuts/dialogGuards';
import { blurComposerInput, focusComposerInput } from '@/lib/ui/composerFocusRegistry';

export function useChatEmbeddedSidebar(args: {
  active: boolean;
  isEmbedded: boolean;
  isSessionActive: boolean;
  stop: () => void;
}) {
  const { active, isEmbedded, isSessionActive, stop } = args;
  const [isEmbeddedSidebarOpen, setIsEmbeddedSidebarOpen] = useState(false);
  const embeddedSidebarFocusFrameRef = useRef<number | null>(null);
  const focusComposerAfterEmbeddedSidebarExitRef = useRef(false);

  useEffect(() => {
    if (!isEmbedded || !isSessionActive) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) {
        return;
      }

      if (
        event.key !== 'Escape' ||
        event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      if (isEventInsideDialog(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      stop();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEmbedded, isSessionActive, stop]);

  useEffect(() => {
    if (!active || !isEmbedded || !isEmbeddedSidebarOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) {
        return;
      }

      if (
        event.key !== 'Escape' ||
        event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      if (isEventInsideDialog(event.target)) {
        return;
      }

      event.preventDefault();
      setIsEmbeddedSidebarOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, isEmbedded, isEmbeddedSidebarOpen]);

  const openEmbeddedSidebar = useCallback(() => {
    focusComposerAfterEmbeddedSidebarExitRef.current = false;
    if (embeddedSidebarFocusFrameRef.current !== null) {
      cancelAnimationFrame(embeddedSidebarFocusFrameRef.current);
      embeddedSidebarFocusFrameRef.current = null;
    }
    blurComposerInput();
    setIsEmbeddedSidebarOpen(true);
  }, []);

  const closeEmbeddedSidebar = useCallback(() => {
    focusComposerAfterEmbeddedSidebarExitRef.current = true;
    setIsEmbeddedSidebarOpen(false);
  }, []);

  const handleEmbeddedSidebarExitComplete = useCallback(() => {
    if (!focusComposerAfterEmbeddedSidebarExitRef.current) {
      return;
    }
    focusComposerAfterEmbeddedSidebarExitRef.current = false;
    if (embeddedSidebarFocusFrameRef.current !== null) {
      cancelAnimationFrame(embeddedSidebarFocusFrameRef.current);
    }
    embeddedSidebarFocusFrameRef.current = requestAnimationFrame(() => {
      embeddedSidebarFocusFrameRef.current = null;
      focusComposerInput();
    });
  }, []);

  useEffect(() => {
    return () => {
      focusComposerAfterEmbeddedSidebarExitRef.current = false;
      if (embeddedSidebarFocusFrameRef.current !== null) {
        cancelAnimationFrame(embeddedSidebarFocusFrameRef.current);
        embeddedSidebarFocusFrameRef.current = null;
      }
    };
  }, []);

  return {
    closeEmbeddedSidebar,
    handleEmbeddedSidebarExitComplete,
    isEmbeddedSidebarOpen: active && isEmbeddedSidebarOpen,
    openEmbeddedSidebar,
  };
}
