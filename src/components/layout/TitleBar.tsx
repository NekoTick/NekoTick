import { useState, ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, Pin, Settings } from 'lucide-react';

const appWindow = getCurrentWindow();

interface TitleBarProps {
  onOpenSettings?: () => void;
  toolbar?: ReactNode;
  /** When true, toolbar is aligned to right edge (for calendar with right panel) */
  toolbarAlignRight?: boolean;
}

export function TitleBar({ onOpenSettings, toolbar, toolbarAlignRight }: TitleBarProps) {
  const [isPinned, setIsPinned] = useState(false);

  const togglePin = async () => {
    const newPinned = !isPinned;
    await appWindow.setAlwaysOnTop(newPinned);
    setIsPinned(newPinned);
  };

  const startDrag = async () => {
    await appWindow.startDragging();
  };

  return (
    <div className="h-9 bg-white dark:bg-zinc-900 flex items-center justify-between select-none">
      {/* Left: Settings Button */}
      <button
        onClick={onOpenSettings}
        className="h-full px-3 flex items-center justify-center hover:bg-zinc-100 transition-colors"
        title="Settings"
      >
        <Settings className="size-4 text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500" />
      </button>

      {/* Draggable Area */}
      <div 
        onMouseDown={startDrag}
        className="flex-1 h-full cursor-default"
      />

      {/* Custom Toolbar (e.g., Calendar controls) - aligned to right edge when toolbarAlignRight */}
      {toolbar && (
        <div className={`flex items-center h-full ${toolbarAlignRight ? 'pr-3 ml-auto' : 'pr-3'}`}>
          {toolbar}
        </div>
      )}

      {/* Window Controls - fixed position at window right edge */}
      <div className={`flex shrink-0 ${toolbarAlignRight ? 'fixed right-0 top-0 h-9 z-50 bg-white dark:bg-zinc-900' : 'h-full'}`}>
        <button
          onClick={togglePin}
          className="h-full w-12 flex items-center justify-center hover:bg-zinc-100 transition-colors"
          title={isPinned ? 'Unpin window' : 'Pin window'}
        >
          <Pin className={`size-4 transition-all duration-200 ${isPinned ? 'text-zinc-500 rotate-0' : 'text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500 rotate-45'}`} />
        </button>

        <button
          onClick={() => appWindow.minimize()}
          className="h-full w-12 flex items-center justify-center hover:bg-zinc-100 transition-colors"
        >
          <Minus className="size-4 text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500" />
        </button>

        <button
          onClick={() => appWindow.toggleMaximize()}
          className="h-full w-12 flex items-center justify-center hover:bg-zinc-100 transition-colors"
        >
          <Square className="size-3.5 text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500" />
        </button>

        <button
          onClick={() => appWindow.close()}
          className="h-full w-12 flex items-center justify-center hover:bg-red-500 transition-colors group"
        >
          <X className="size-4 text-zinc-200 hover:text-zinc-400 group-hover:text-white dark:text-zinc-700 dark:hover:text-zinc-500" />
        </button>
      </div>
    </div>
  );
}
