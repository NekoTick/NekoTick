import { useState, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Minus, Square, X, Menu, Pin, Settings, Keyboard, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useViewStore } from '@/stores/useViewStore';
import { ShortcutsDialog } from '@/components/features/ShortcutsDialog';

const appWindow = getCurrentWindow();

export function TitleBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPinned, setMenuPinned] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutPinned, setAboutPinned] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPinned, setSettingsPinned] = useState(false);
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const { currentView, setView } = useViewStore();
  const aboutRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const togglePin = async () => {
    const newPinned = !isPinned;
    await appWindow.setAlwaysOnTop(newPinned);
    setIsPinned(newPinned);
  };

  const startDrag = async () => {
    await appWindow.startDragging();
  };

  const openGitHub = async () => {
    await openUrl('https://github.com/vladelaina/NekoTick');
    setAboutOpen(false);
    setAboutPinned(false);
    if (menuPinned) {
      setMenuOpen(false);
      setMenuPinned(false);
    }
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
      // 当主菜单悬浮关闭时，重置子菜单的所有状态
      setSettingsPinned(false);
      setAboutPinned(false);
      setSettingsOpen(false);
      setAboutOpen(false);
    }
  };

  const handleMenuClick = () => {
    const newPinned = !menuPinned;
    setMenuPinned(newPinned);
    setMenuOpen(newPinned);
    
    // 当主菜单被点击关闭时，重置子菜单的固定状态
    if (!newPinned) {
      setSettingsPinned(false);
      setAboutPinned(false);
      setSettingsOpen(false);
      setAboutOpen(false);
    }
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
              {/* 待办 */}
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
                待办
              </button>

              {/* 进度 */}
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
                进度
              </button>

              {/* 日历 */}
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
                日历
              </button>

              {/* 时间管理 */}
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
                时间管理
              </button>

              {/* 设置 */}
              <div 
                ref={settingsRef} 
                className="relative h-full"
                onMouseEnter={() => {
                  if (!settingsPinned) {
                    setSettingsOpen(true);
                  }
                }}
                onMouseLeave={() => {
                  if (!settingsPinned) {
                    setSettingsOpen(false);
                    setSettingsPinned(false);
                  }
                }}
              >
                <button
                  onClick={() => {
                    const newPinned = !settingsPinned;
                    setSettingsPinned(newPinned);
                    setSettingsOpen(newPinned);
                  }}
                  className="h-full px-3 text-sm text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500 transition-colors whitespace-nowrap flex items-center gap-1"
                >
                  <Settings className="size-3.5" />
                  设置
                </button>
                
                {/* Settings Dropdown */}
                {settingsOpen && (
                  <div 
                    className="absolute top-full left-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md shadow-lg py-1 min-w-28 z-50"
                    onMouseLeave={(e) => {
                      // 防止鼠标在下拉框内移动时触发关闭
                      e.stopPropagation();
                    }}
                  >
                    <button
                      onClick={() => {
                        setShortcutsDialogOpen(true);
                        setSettingsOpen(false);
                        setSettingsPinned(false);
                        if (menuPinned) {
                          setMenuOpen(false);
                          setMenuPinned(false);
                        }
                      }}
                      className="w-full px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 text-left flex items-center gap-2"
                    >
                      <Keyboard className="size-4" />
                      快捷键
                    </button>
                  </div>
                )}
              </div>

              {/* 关于 */}
              <div 
                ref={aboutRef} 
                className="relative h-full"
                onMouseEnter={() => {
                  if (!aboutPinned) {
                    setAboutOpen(true);
                  }
                }}
                onMouseLeave={() => {
                  if (!aboutPinned) {
                    setAboutOpen(false);
                    setAboutPinned(false);
                  }
                }}
              >
                <button
                  onClick={() => {
                    const newPinned = !aboutPinned;
                    setAboutPinned(newPinned);
                    setAboutOpen(newPinned);
                  }}
                  className="h-full px-3 text-sm text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500 transition-colors whitespace-nowrap"
                >
                  关于
                </button>
                
                {/* Dropdown */}
                {aboutOpen && (
                  <div 
                    className="absolute top-full left-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md shadow-lg py-1 min-w-28 z-50"
                    onMouseLeave={(e) => {
                      // 防止鼠标在下拉框内移动时触发关闭
                      e.stopPropagation();
                    }}
                  >
                    <button
                      onClick={openGitHub}
                      className="w-full px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 text-left"
                    >
                      GitHub
                    </button>
                  </div>
                )}
              </div>
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
          title={isPinned ? '取消置顶' : '置顶窗口'}
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

      {/* Shortcuts Dialog */}
      <ShortcutsDialog 
        open={shortcutsDialogOpen} 
        onClose={() => setShortcutsDialogOpen(false)} 
      />
    </div>
  );
}
