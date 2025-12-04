import { useEffect, useState } from 'react';
import { X, Sun, Moon, Monitor, Keyboard, Info, ExternalLink } from 'lucide-react';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';
import { openUrl } from '@tauri-apps/plugin-opener';
import { getShortcuts, saveShortcuts, type ShortcutConfig } from '@/lib/shortcuts';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type SettingsTab = 'appearance' | 'shortcuts' | 'about';

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const { theme, setTheme } = useTheme();
  const [shortcuts, setShortcuts] = useState<ShortcutConfig[]>(() => getShortcuts());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recordingKeys, setRecordingKeys] = useState<string[]>([]);

  // 加载快捷键配置和清理编辑状态
  useEffect(() => {
    if (open) {
      setShortcuts(getShortcuts());
    } else {
      setEditingId(null);
      setRecordingKeys([]);
    }
  }, [open]);

  // 点击外部退出编辑状态
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

  // ESC 键关闭
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingId) {
          // Cancel editing
          setEditingId(null);
          setRecordingKeys([]);
        } else {
          // Close dialog
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, editingId]);

  // 打开时锁定背景滚动
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const tabs = [
    { id: 'appearance' as const, label: '外观', icon: Sun },
    { id: 'shortcuts' as const, label: '快捷键', icon: Keyboard },
    { id: 'about' as const, label: '关于', icon: Info },
  ];

  const openGitHub = async () => {
    await openUrl('https://github.com/vladelaina/NekoTick');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
        const updated = shortcuts.map(s => 
          s.id === editingId ? { ...s, keys } : s
        );
        setShortcuts(updated);
        saveShortcuts(updated);
        setEditingId(null);
        setRecordingKeys([]);
      }, 300);
    }
  };

  const startEditing = (id: string) => {
    setEditingId(id);
    setRecordingKeys([]);
  };

  const clearShortcut = (id: string) => {
    const updated = shortcuts.map(s => 
      s.id === id ? { ...s, keys: [] } : s
    );
    setShortcuts(updated);
    saveShortcuts(updated);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/20 dark:bg-black/40 z-[100]"
            onClick={onClose}
          />

          {/* 模态窗口 */}
          <div className="fixed inset-0 flex items-center justify-center z-[100] pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="rounded-lg shadow-xl w-[700px] max-w-[90vw] h-[500px] max-h-[85vh] flex overflow-hidden pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={handleKeyDown}
              tabIndex={-1}
            >
              {/* 左侧导航 */}
              <div className="w-48 border-r border-zinc-300 dark:border-zinc-700 flex flex-col bg-[#F6F6F6] dark:bg-zinc-900 rounded-l-lg">
                <div className="p-4 border-b border-zinc-300 dark:border-zinc-700">
                  <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    设置
                  </h2>
                </div>
                <nav className="flex-1 p-3 space-y-1">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                          activeTab === tab.id
                            ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                            : 'text-zinc-700 dark:text-zinc-300 hover:bg-white/50 dark:hover:bg-zinc-800/50'
                        }`}
                      >
                        <Icon className="size-4" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* 右侧内容 */}
              <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 rounded-r-lg">
                {/* 关闭按钮 */}
                <div className="absolute top-4 right-4">
                  <button
                    onClick={onClose}
                    className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* 内容区域 */}
                <div className="flex-1 overflow-y-auto p-6">
                  {activeTab === 'appearance' && (
                    <div className="max-w-xl">
                      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
                        外观设置
                      </h3>

                      {/* 主题选择 */}
                      <div className="space-y-3">
                        <div>
                          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 block">
                            主题模式
                          </label>
                          <div className="space-y-1.5">
                            <button
                              onClick={() => setTheme('light')}
                              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md border transition-all ${
                                theme === 'light'
                                  ? 'border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800'
                                  : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                              }`}
                            >
                              <Sun className="size-4 text-zinc-600 dark:text-zinc-400" />
                              <div className="flex-1 text-left">
                                <div className="text-sm text-zinc-700 dark:text-zinc-300">
                                  浅色模式
                                </div>
                              </div>
                              {theme === 'light' && (
                                <div className="size-1.5 rounded-full bg-zinc-500" />
                              )}
                            </button>

                            <button
                              onClick={() => setTheme('dark')}
                              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md border transition-all ${
                                theme === 'dark'
                                  ? 'border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800'
                                  : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                              }`}
                            >
                              <Moon className="size-4 text-zinc-600 dark:text-zinc-400" />
                              <div className="flex-1 text-left">
                                <div className="text-sm text-zinc-700 dark:text-zinc-300">
                                  深色模式
                                </div>
                              </div>
                              {theme === 'dark' && (
                                <div className="size-1.5 rounded-full bg-zinc-500" />
                              )}
                            </button>

                            <button
                              onClick={() => setTheme('system')}
                              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md border transition-all ${
                                theme === 'system'
                                  ? 'border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800'
                                  : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                              }`}
                            >
                              <Monitor className="size-4 text-zinc-600 dark:text-zinc-400" />
                              <div className="flex-1 text-left">
                                <div className="text-sm text-zinc-700 dark:text-zinc-300">
                                  跟随系统
                                </div>
                              </div>
                              {theme === 'system' && (
                                <div className="size-1.5 rounded-full bg-zinc-500" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'shortcuts' && (
                    <div className="max-w-xl">
                      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
                        快捷键
                      </h3>

                      <div className="space-y-2">
                        {shortcuts.map((shortcut) => (
                          <div
                            key={shortcut.id}
                            className="flex items-center justify-between py-2"
                          >
                            <span className="text-sm text-zinc-700 dark:text-zinc-300">
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
                                  className="w-full pl-3 pr-7 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded text-xs text-center text-zinc-600 dark:text-zinc-300 placeholder:text-zinc-300 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500 focus:border-transparent"
                                />
                                {(recordingKeys.length > 0 || shortcut.keys.length > 0) && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRecordingKeys([]);
                                      clearShortcut(shortcut.id);
                                    }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center bg-zinc-200 dark:bg-zinc-600 hover:bg-zinc-300 dark:hover:bg-zinc-500 rounded-full transition-colors"
                                    aria-label="清除"
                                  >
                                    <X className="w-2.5 h-2.5 text-zinc-500 dark:text-zinc-300" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="relative group w-28">
                                <button
                                  onClick={() => startEditing(shortcut.id)}
                                  className="w-full pl-3 pr-7 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded text-xs text-center text-zinc-400 dark:text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-500 transition-colors"
                                >
                                  {shortcut.keys.length > 0 ? shortcut.keys.join('+') : '设置快捷键'}
                                </button>
                                {shortcut.keys.length > 0 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      clearShortcut(shortcut.id);
                                    }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 flex items-center justify-center bg-zinc-200 dark:bg-zinc-600 hover:bg-zinc-300 dark:hover:bg-zinc-500 rounded-full"
                                    aria-label="清除快捷键"
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
                  )}

                  {activeTab === 'about' && (
                    <div className="max-w-xl">
                      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
                        关于 NekoTick
                      </h3>

                      <div className="space-y-4">
                        <div className="text-sm text-zinc-700 dark:text-zinc-300 space-y-2">
                          <p>
                            NekoTick 是一个简洁优雅的任务管理应用，帮助你高效组织和追踪任务进度。
                          </p>
                          <p className="text-zinc-500 dark:text-zinc-400">
                            Version 0.1.0
                          </p>
                        </div>

                        <div className="pt-2">
                          <button
                            onClick={openGitHub}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-md transition-colors"
                          >
                            <ExternalLink className="size-4" />
                            在 GitHub 上查看
                          </button>
                        </div>

                        <div className="pt-4 border-t border-zinc-200 dark:border-zinc-700">
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            © 2024 NekoTick. All rights reserved.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
