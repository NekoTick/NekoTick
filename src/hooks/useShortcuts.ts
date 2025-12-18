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

      // Check if each shortcut matches
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
      
      // F11: Toggle Fullscreen (fixed shortcut, not customizable)
      if (e.key === 'F11') {
        e.preventDefault();
        try {
          await invoke('toggle_fullscreen');
        } catch (error) {
          console.error('Failed to toggle fullscreen:', error);
        }
      }
      
      // Ctrl+Z: Undo (fixed shortcut, not customizable)
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey && !e.altKey) {
        // If focus is in an input field, don't intercept (let browser handle text undo)
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
