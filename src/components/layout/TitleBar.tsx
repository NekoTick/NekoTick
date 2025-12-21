import { useState, ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, Pin, Settings } from 'lucide-react';

const appWindow = getCurrentWindow();

interface TitleBarProps {
  onOpenSettings?: () => void;
  toolbar?: ReactNode;
  content?: ReactNode;
  /** When true, toolbar is aligned to right edge (for calendar with right panel) */
  toolbarAlignRight?: boolean;
}

export function TitleBar({ onOpenSettings, toolbar, content, toolbarAlignRight }: TitleBarProps) {
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
    <div 
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) startDrag();
      }}
      className="h-10 bg-white dark:bg-zinc-900 flex items-center select-none relative z-50 border-b border-zinc-200 dark:border-zinc-800"
    >
      {/* Left: Settings Button */}
      <button
        onClick={onOpenSettings}
        className="h-full px-3 flex items-center justify-center hover:bg-zinc-100 transition-colors z-20"
        title="Settings"
      >
        <Settings className="size-4 text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500" />
      </button>

      {/* Center Content Area - Absolutely positioned for true centering */}
      <div 
        onMouseDown={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).hasAttribute('data-tauri-drag-region')) {
            startDrag();
          }
        }}
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        data-tauri-drag-region
      >
        <div className="pointer-events-auto">
          {content}
        </div>
      </div>

      {/* Spacer to push toolbar and controls to the right */}
      <div className="flex-1" />

      {/* Custom Toolbar (e.g., Calendar controls) */}
      {toolbar && (
        <div className={`flex items-center h-full z-20 ${toolbarAlignRight ? 'pr-3' : 'pr-3'}`}>
          {toolbar}
        </div>
      )}

      {/* Window Controls */}
      <div className={`flex shrink-0 z-50 ${toolbarAlignRight ? 'relative' : 'h-full'}`}>
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
