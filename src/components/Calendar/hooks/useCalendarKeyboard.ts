/**
 * 日历键盘快捷键 Hook
 */

import { useEffect } from 'react';
import { useCalendarStore } from '@/stores/useCalendarStore';

export function useCalendarKeyboard() {
  const { selectedEventId, setSelectedEventId, deleteEvent, undo, editingEventId } = useCalendarStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 如果正在编辑（输入框聚焦），不处理快捷键
      const activeElement = document.activeElement;
      if (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      // Ctrl+Z / Cmd+Z 撤销
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Backspace 或 Delete 删除选中的事件
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedEventId) {
        e.preventDefault();
        deleteEvent(selectedEventId);
        setSelectedEventId(null);
        return;
      }

      // Escape 取消选中
      if (e.key === 'Escape' && selectedEventId) {
        setSelectedEventId(null);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEventId, editingEventId, deleteEvent, setSelectedEventId, undo]);
}
