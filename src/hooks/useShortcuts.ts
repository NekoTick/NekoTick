import { useEffect } from 'react';
import { useGroupStore } from '@/stores/useGroupStore';
import { invoke } from '@tauri-apps/api/core';

export function useShortcuts() {
  const { toggleDrawer } = useGroupStore();

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Ctrl + B: Toggle Drawer
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        toggleDrawer();
      }
      
      // F11: Toggle Fullscreen
      if (e.key === 'F11') {
        e.preventDefault();
        try {
          await invoke('toggle_fullscreen');
        } catch (error) {
          console.error('Failed to toggle fullscreen:', error);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleDrawer]);
}
