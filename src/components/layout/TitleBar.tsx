import { useState, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, Menu, Pin, Settings, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useViewStore } from '@/stores/useViewStore';

const appWindow = getCurrentWindow();

interface TitleBarProps {
  onOpenSettings?: () => void;
}

export function TitleBar({ onOpenSettings }: TitleBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPinned, setMenuPinned] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const { currentView, setView } = useViewStore();
  const menuRef = useRef<HTMLDivElement>(null);

  const togglePin = async () => {
    const newPinned = !isPinned;
    await appWindow.setAlwaysOnTop(newPinned);
    setIsPinned(newPinned);
  };

  const startDrag = async () => {
    await appWindow.startDragging();
  };

  // No longer need click outside handler since we use hover

  // Handle menu hover and click
  const handleMenuMouseEnter = () => {
    if (!menuPinned) {
      setMenuOpen(true);
    }
  };

  const handleMenuMouseLeave = () => {
    if (!menuPinned) {
      setMenuOpen(false);
    }
  };

  const handleMenuClick = () => {
    const newPinned = !menuPinned;
    setMenuPinned(newPinned);
    setMenuOpen(newPinned);
  };

  return (
    <div className="h-9 bg-white dark:bg-zinc-900 flex items-center justify-between select-none">
      {/* Left: Menu Button + Expandable Menu */}
      <div 
        ref={menuRef}
        className="h-full flex items-center"
        onMouseEnter={handleMenuMouseEnter}
        onMouseLeave={handleMenuMouseLeave}
      >
        {/* Menu Toggle Button */}
        <button
          onClick={handleMenuClick}
          className="h-full px-3 flex items-center justify-center hover:bg-zinc-100 transition-colors"
        >
          <Menu className="size-4 text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500" />
        </button>

        {/* Menu Items */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="h-full flex items-center"
            >
              {/* Tasks */}
              <button
                onClick={() => {
                  setView('tasks');
                  if (menuPinned) {
                    setMenuOpen(false);
                    setMenuPinned(false);
                  }
                }}
                className={`h-full px-3 text-sm transition-colors whitespace-nowrap ${
                  currentView === 'tasks'
                    ? 'text-zinc-400 dark:text-zinc-500'
                    : 'text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500'
                }`}
              >
                Tasks
              </button>

              {/* Progress */}
              <button
                onClick={() => {
                  setView('progress');
                  if (menuPinned) {
                    setMenuOpen(false);
                    setMenuPinned(false);
                  }
                }}
                className={`h-full px-3 text-sm transition-colors whitespace-nowrap ${
                  currentView === 'progress'
                    ? 'text-zinc-400 dark:text-zinc-500'
                    : 'text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500'
                }`}
              >
                Progress
              </button>

              {/* Calendar */}
              <button
                onClick={() => {
                  setView('calendar');
                  if (menuPinned) {
                    setMenuOpen(false);
                    setMenuPinned(false);
                  }
                }}
                className={`h-full px-3 text-sm transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  currentView === 'calendar'
                    ? 'text-zinc-400 dark:text-zinc-500'
                    : 'text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500'
                }`}
              >
                <Calendar className="size-3.5" />
                Calendar
              </button>

              {/* Time Tracker */}
              <button
                onClick={() => {
                  setView('time-tracker');
                  if (menuPinned) {
                    setMenuOpen(false);
                    setMenuPinned(false);
                  }
                }}
                className={`h-full px-3 text-sm transition-colors whitespace-nowrap ${
                  currentView === 'time-tracker'
                    ? 'text-zinc-400 dark:text-zinc-500'
                    : 'text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500'
                }`}
              >
                Time Tracker
              </button>

              {/* Settings */}
              <button
                onClick={() => {
                  onOpenSettings?.();
                  if (menuPinned) {
                    setMenuOpen(false);
                    setMenuPinned(false);
                  }
                }}
                className="h-full px-3 text-sm text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500 transition-colors whitespace-nowrap flex items-center gap-1"
              >
                <Settings className="size-3.5" />
                Settings
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Draggable Area */}
      <div 
        onMouseDown={startDrag}
        className="flex-1 h-full cursor-default"
      />

      {/* Window Controls */}
      <div className="flex h-full shrink-0">
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
