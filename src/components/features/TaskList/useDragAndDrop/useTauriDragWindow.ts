import { invoke } from '@tauri-apps/api/core';
import type { StoreTask } from '@/stores/types';

export function useTauriDragWindow() {
  const createDragWindow = async (task: StoreTask, pointerEvent: PointerEvent, allTasks: StoreTask[]) => {
    // Count descendants
    const countDescendants = (taskId: string): number => {
      const children = allTasks.filter(t => t.parentId === taskId);
      if (children.length === 0) return 0;
      return children.length + children.reduce((sum, child) => sum + countDescendants(child.id), 0);
    };
    const childCount = countDescendants(task.id);
    
    // Get dimensions
    const taskElement = document.querySelector(`[data-task-id="${task.id}"]`);
    const rect = taskElement?.getBoundingClientRect();
    const width = rect?.width || 350;
    const height = rect?.height || 36;
    
    const isDarkMode = document.documentElement.classList.contains('dark');
    const displayContent = childCount > 0 
      ? `${task.content} (+${childCount})` 
      : task.content;
    
    try {
      await invoke('create_drag_window', {
        content: displayContent,
        x: pointerEvent.screenX,
        y: pointerEvent.screenY,
        width: width,
        height: height,
        isDone: task.completed,
        isDark: isDarkMode,
        priority: task.color || 'default',
      });
    } catch (e) {
      console.error('Failed to create drag window:', e);
    }
  };

  const updateDragWindowPosition = (x: number, y: number) => {
    invoke('update_drag_window_position', { x, y }).catch(() => {});
  };

  const destroyDragWindow = async () => {
    try {
      await invoke('destroy_drag_window');
    } catch (e) {
      // ignore
    }
  };

  return { createDragWindow, updateDragWindowPosition, destroyDragWindow };
}
