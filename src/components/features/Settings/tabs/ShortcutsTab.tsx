import { X } from 'lucide-react';
import type { ShortcutConfig } from '@/lib/shortcuts';

interface ShortcutsTabProps {
  shortcuts: ShortcutConfig[];
  editingId: string | null;
  recordingKeys: string[];
  onStartEditing: (id: string) => void;
  onClearShortcut: (id: string) => void;
  onClearRecording: () => void;
}

/**
 * Shortcuts tab content - keyboard shortcut configuration
 */
export function ShortcutsTab({
  shortcuts,
  editingId,
  recordingKeys,
  onStartEditing,
  onClearShortcut,
  onClearRecording,
}: ShortcutsTabProps) {
  return (
    <div className="max-w-xl">
      <div className="space-y-1">
        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.id}
            className="flex items-center justify-between py-1.5"
          >
            <span className="text-xs text-zinc-700 dark:text-zinc-300">
              {shortcut.name}
            </span>
            
            {editingId === shortcut.id ? (
              <div className="relative w-28 shortcut-input-container">
                <input
                  type="text"
                  value={recordingKeys.length > 0 ? recordingKeys.join('+') : ''}
                  placeholder={shortcut.keys.length > 0 ? shortcut.keys.join('+') : ''}
                  readOnly
                  autoFocus
                  className="w-full pl-2 pr-6 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded text-xs text-center text-zinc-600 dark:text-zinc-300 placeholder:text-zinc-300 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500 focus:border-transparent"
                />
                {(recordingKeys.length > 0 || shortcut.keys.length > 0) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onClearRecording();
                      onClearShortcut(shortcut.id);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center bg-zinc-200 dark:bg-zinc-600 hover:bg-zinc-300 dark:hover:bg-zinc-500 rounded-full transition-colors"
                    aria-label="Clear"
                  >
                    <X className="w-2.5 h-2.5 text-zinc-500 dark:text-zinc-300" />
                  </button>
                )}
              </div>
            ) : (
              <div className="relative group w-28">
                <button
                  onClick={() => onStartEditing(shortcut.id)}
                  className="w-full pl-2 pr-6 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded text-xs text-center text-zinc-400 dark:text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-500 transition-colors"
                >
                  {shortcut.keys.length > 0 ? shortcut.keys.join('+') : '设置快捷键'}
                </button>
                {shortcut.keys.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onClearShortcut(shortcut.id);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 flex items-center justify-center bg-zinc-200 dark:bg-zinc-600 hover:bg-zinc-300 dark:hover:bg-zinc-500 rounded-full"
                    aria-label="Clear shortcut"
                  >
                    <X className="w-2.5 h-2.5 text-zinc-500 dark:text-zinc-300" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
