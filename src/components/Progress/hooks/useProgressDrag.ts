import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { DragStartEvent, DragMoveEvent, DragEndEvent } from '@dnd-kit/core';
import type { ProgressOrCounter } from '../../../stores/useProgressStore';

// Update position without awaiting result for smoother animation
const updatePositionFast = (x: number, y: number) => {
  invoke('update_drag_window_position', { x, y }).catch(() => {});
};

interface UseProgressDragOptions {
  items: ProgressOrCounter[];
  onReorder: (activeId: string, overId: string) => void;
}

/**
 * Hook for managing drag and drop with Tauri native window preview
 */
export function useProgressDrag({ items, onReorder }: UseProgressDragOptions) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const handleDragStart = useCallback(async (event: DragStartEvent) => {
    const id = event.active.id as string;
    setActiveId(id);

    const item = items.find(i => i.id === id);
    if (item) {
      const itemElement = document.querySelector(`[data-item-id="${id}"]`);
      const rect = itemElement?.getBoundingClientRect();
      const width = rect?.width || 350;
      const height = rect?.height || 80;

      const pointer = event.activatorEvent as PointerEvent;
      const isDarkMode = document.documentElement.classList.contains('dark');

      // Build display content
      let displayContent = item.title;
      if (item.type === 'progress') {
        const percentage = Math.round((item.current / item.total) * 100);
        displayContent += `\n${item.current}/${item.total}${item.unit} (${percentage}%) • Today ${item.todayCount}${item.unit}`;
      } else {
        displayContent += `\nTotal ${item.current}${item.unit} • Today ${item.todayCount}${item.unit}`;
      }

      try {
        await invoke('create_drag_window', {
          content: displayContent,
          x: pointer.screenX,
          y: pointer.screenY,
          width,
          height,
          isDone: false,
          isDark: isDarkMode,
          priority: 'default',
        });
      } catch (e) {
        console.error('Failed to create drag window:', e);
      }
    }
  }, [items]);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    if (!event.activatorEvent) return;
    const rect = event.activatorEvent as PointerEvent;
    const x = rect.screenX + (event.delta?.x || 0);
    const y = rect.screenY + (event.delta?.y || 0);
    updatePositionFast(x, y);
  }, []);

  const handleDragOver = useCallback((event: DragMoveEvent) => {
    setOverId(event.over?.id as string | null);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveId(null);
    setOverId(null);

    try {
      await invoke('destroy_drag_window');
    } catch {
      // ignore
    }

    if (over && active.id !== over.id) {
      onReorder(active.id as string, over.id as string);
    }
  }, [onReorder]);

  // Cleanup drag window on unmount
  useEffect(() => {
    return () => {
      invoke('destroy_drag_window').catch(() => {});
    };
  }, []);

  return {
    activeId,
    overId,
    handleDragStart,
    handleDragMove,
    handleDragOver,
    handleDragEnd,
  };
}
