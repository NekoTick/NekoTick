import { useState, useCallback } from 'react';
import type { DragStartEvent, DragMoveEvent, DragEndEvent } from '@dnd-kit/core';
// Removed ProgressOrCounter import since items parameter was removed
// import type { ProgressOrCounter } from '../../../stores/useProgressStore';

interface UseProgressDragOptions {
  // Removed items: ProgressOrCounter[];
  onReorder: (activeId: string, overId: string) => void;
}

/**
 * Hook for managing drag and drop state
 */
export function useProgressDrag({ onReorder }: UseProgressDragOptions) { // Removed items parameter
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragMove = useCallback(() => { // Removed event parameter
    // No-op for now, purely state driven
  }, []);

  const handleDragOver = useCallback((event: DragMoveEvent) => {
    setOverId(event.over?.id as string | null);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    setActiveId(null);
    setOverId(null);

    if (over && active.id !== over.id) {
      onReorder(active.id as string, over.id as string);
    }
  }, [onReorder]);

  return {
    activeId,
    overId,
    handleDragStart,
    handleDragMove,
    handleDragOver,
    handleDragEnd,
  };
}
