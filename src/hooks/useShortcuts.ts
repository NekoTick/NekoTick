import { useEffect } from 'react';
import { useGroupStore, useUIStore } from '@/stores/useGroupStore';
import { useUnifiedStore } from '@/stores/useUnifiedStore';
import { invoke } from '@tauri-apps/api/core';
import { getShortcutKeys, type ShortcutId } from '@/lib/shortcuts';

export function useShortcuts() {
  const { activeGroupId, archiveCompletedTasks, setActiveGroup } = useGroupStore();
  const undoLastAction = useUnifiedStore(state => state.undo);
  const { toggleDrawer } = useUIStore();

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const shortcuts = {
        'toggle-drawer': () => toggleDrawer(),
        'archive-completed': async () => {
          if (activeGroupId && activeGroupId !== '__archive__') {
            try {
              await archiveCompletedTasks(activeGroupId);
            } catch (error) {
              console.error('Failed to archive completed tasks:', error);
            }
          }
        },
        'open-archive': () => setActiveGroup('__archive__'),
      };

      // 检查每个快捷键是否匹配
      for (const [id, handler] of Object.entries(shortcuts)) {
        const keys = getShortcutKeys(id as ShortcutId);
        if (!keys || keys.length === 0) continue;

        const matchesShortcut = keys.every((key: string) => {
          if (key === 'Ctrl') return e.ctrlKey;
          if (key === 'Shift') return e.shiftKey;
          if (key === 'Alt') return e.altKey;
          if (key === 'Meta') return e.metaKey;
          return e.key.toUpperCase() === key.toUpperCase();
        });

        if (matchesShortcut) {
          e.preventDefault();
          await handler();
          return;
        }
      }
      
      // F11: Toggle Fullscreen (固定快捷键，不可自定义)
      if (e.key === 'F11') {
        e.preventDefault();
        try {
          await invoke('toggle_fullscreen');
        } catch (error) {
          console.error('Failed to toggle fullscreen:', error);
        }
      }
      
      // Ctrl+Z: 撤销 (固定快捷键，不可自定义)
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey && !e.altKey) {
        // 如果当前焦点在输入框中，不拦截（让浏览器处理文本撤销）
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        undoLastAction();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleDrawer, activeGroupId, archiveCompletedTasks, setActiveGroup, undoLastAction]);
}
