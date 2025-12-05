import { useState, useEffect, useCallback } from 'react';
import { getShortcuts, saveShortcuts, type ShortcutConfig } from '@/lib/shortcuts';

interface UseShortcutEditorReturn {
  shortcuts: ShortcutConfig[];
  editingId: string | null;
  recordingKeys: string[];
  startEditing: (id: string) => void;
  clearShortcut: (id: string) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  resetState: () => void;
}

/**
 * Hook for managing shortcut editing
 */
export function useShortcutEditor(): UseShortcutEditorReturn {
  const [shortcuts, setShortcuts] = useState<ShortcutConfig[]>(() => getShortcuts());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recordingKeys, setRecordingKeys] = useState<string[]>([]);

  // Click outside to cancel editing
  useEffect(() => {
    if (!editingId) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.shortcut-input-container')) {
        setEditingId(null);
        setRecordingKeys([]);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editingId]);

  const startEditing = useCallback((id: string) => {
    setEditingId(id);
    setRecordingKeys([]);
  }, []);

  const clearShortcut = useCallback((id: string) => {
    const updated = shortcuts.map(s => 
      s.id === id ? { ...s, keys: [] } : s
    );
    setShortcuts(updated);
    saveShortcuts(updated);
  }, [shortcuts]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!editingId) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const keys: string[] = [];
    if (e.ctrlKey) keys.push('Ctrl');
    if (e.altKey) keys.push('Alt');
    if (e.shiftKey) keys.push('Shift');
    if (e.metaKey) keys.push('Meta');
    
    if (!['Control', 'Alt', 'Shift', 'Meta', 'Escape'].includes(e.key)) {
      keys.push(e.key.toUpperCase());
    }
    
    if (keys.length > 1) {
      setRecordingKeys(keys);
      
      setTimeout(() => {
        setShortcuts(prev => {
          const updated = prev.map(s => 
            s.id === editingId ? { ...s, keys } : s
          );
          saveShortcuts(updated);
          return updated;
        });
        setEditingId(null);
        setRecordingKeys([]);
      }, 300);
    }
  }, [editingId]);

  const resetState = useCallback(() => {
    setShortcuts(getShortcuts());
    setEditingId(null);
    setRecordingKeys([]);
  }, []);

  return {
    shortcuts,
    editingId,
    recordingKeys,
    startEditing,
    clearShortcut,
    handleKeyDown,
    resetState,
  };
}
