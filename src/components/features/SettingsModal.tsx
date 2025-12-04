import { useEffect, useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<SettingsTab>('about');
  const { theme, setTheme } = useTheme();
  const [shortcuts, setShortcuts] = useState<ShortcutConfig[]>(() => getShortcuts());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recordingKeys, setRecordingKeys] = useState<string[]>([]);
  const [autoUpdate, setAutoUpdate] = useState<boolean>(() => {
    const saved = localStorage.getItem('autoUpdate');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // 加载快捷键配置和清理编辑状态
  useEffect(() => {
    if (open) {
      setShortcuts(getShortcuts());
      setActiveTab('about'); // 打开时总是显示"关于"页面
    } else {
      setEditingId(null);
      setRecordingKeys([]);
    }
  }, [open]);

  // 保存自动更新设置
  const toggleAutoUpdate = () => {
    const newValue = !autoUpdate;
    setAutoUpdate(newValue);
    localStorage.setItem('autoUpdate', JSON.stringify(newValue));
  };

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
    { id: 'about' as const, label: '关于' },
    { id: 'appearance' as const, label: '外观' },
    { id: 'shortcuts' as const, label: '快捷键' },
  ];

  const openGitHub = async () => {
    await openUrl('https://github.com/NekoTick/NekoTick');
  };

  const openSignup = async () => {
    await openUrl('https://nekotick.com/auth#signup');
  };

  const openForgotPassword = async () => {
    await openUrl('https://nekotick.com/auth#forgotpass');
  };

  const handleLogin = () => {
    // TODO: 实现登录逻辑
    console.log('Login with:', email, password);
    setShowLoginDialog(false);
    setEmail('');
    setPassword('');
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
          {/* 标题栏遮罩层 - 半透明但不阻止拖动 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed top-0 left-0 right-0 h-9 bg-black/5 dark:bg-black/30 z-[100] pointer-events-none"
          />
          
          {/* 背景遮罩 - 从标题栏下方开始 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed top-9 left-0 right-0 bottom-0 bg-black/5 dark:bg-black/30 z-[100]"
            onClick={onClose}
          />

          {/* 模态窗口 */}
          <div className="fixed top-9 left-0 right-0 bottom-0 flex items-center justify-center z-[100] pointer-events-none">
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
                <nav className="flex-1 p-3 pt-4 space-y-1">
                  {tabs.map((tab) => {
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`w-full flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
                          activeTab === tab.id
                            ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                            : 'text-zinc-700 dark:text-zinc-300 hover:bg-white/50 dark:hover:bg-zinc-800/50'
                        }`}
                      >
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* 右侧内容 */}
              <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 rounded-r-lg relative">
                {/* 关闭按钮 */}
                <div className="absolute top-2 right-2 z-10">
                  <button
                    onClick={onClose}
                    className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* 内容区域 */}
                <div className="flex-1 overflow-y-auto p-4">
                  {activeTab === 'appearance' && (
                    <div className="max-w-3xl">
                      <div className="space-y-0">
                        {/* 基础颜色/主题模式 */}
                        <div className="py-3 border-b border-zinc-200 dark:border-zinc-700">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-0.5">
                                基础颜色
                              </div>
                              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                                设置 NekoTick 的基础颜色。
                              </div>
                            </div>
                            <select
                              value={theme}
                              onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
                              className="px-2 py-1 pr-6 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400 min-w-[100px] cursor-pointer appearance-none bg-[length:7px_12px] bg-[right_5px_center] bg-no-repeat"
                              style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='7' height='12' viewBox='0 0 7 12'%3E%3Cpolyline points='0.5,3.5 3.5,0.5 6.5,3.5' fill='none' stroke='%23333' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpolyline points='0.5,8.5 3.5,11.5 6.5,8.5' fill='none' stroke='%23333' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`
                              }}
                            >
                              <option value="system">跟随系统</option>
                              <option value="light">浅色模式</option>
                              <option value="dark">深色模式</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'shortcuts' && (
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
                                  className="w-full pl-2 pr-6 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded text-xs text-center text-zinc-600 dark:text-zinc-300 placeholder:text-zinc-300 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500 focus:border-transparent"
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
                                  className="w-full pl-2 pr-6 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded text-xs text-center text-zinc-400 dark:text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-500 transition-colors"
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
                    <div className="max-w-3xl">
                      {/* 账户部分 */}
                      <div className="mb-6">
                        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-3">账户</h2>
                        <div className="py-3 border-b border-zinc-200 dark:border-zinc-700">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1">
                                你的账户
                              </div>
                              <div className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                                登录以同步你的任务数据，在多设备间无缝切换。
                              </div>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                              <button
                                onClick={() => setShowLoginDialog(true)}
                                className="px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-md transition-colors"
                              >
                                登录
                              </button>
                              <button
                                onClick={openSignup}
                                className="px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-md transition-colors"
                              >
                                注册
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 应用部分 */}
                      <div className="mb-4">
                        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">应用</h2>
                      </div>

                      <div className="space-y-0">
                        {/* 版本信息 */}
                        <div className="py-3 border-b border-zinc-200 dark:border-zinc-700">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-0.5">
                                Version 0.1.0
                              </div>
                              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                                你使用的是最新版本！
                              </div>
                            </div>
                            <button
                              onClick={() => {/* TODO: 检查更新逻辑 */}}
                              className="px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-md transition-colors"
                            >
                              检查更新
                            </button>
                          </div>
                        </div>

                        {/* 自动更新 */}
                        <div className="py-3 border-b border-zinc-200 dark:border-zinc-700">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-0.5">
                                自动更新
                              </div>
                              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                                关闭后 NekoTick 将不会自动更新。
                              </div>
                            </div>
                            <button
                              onClick={toggleAutoUpdate}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                                autoUpdate ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-zinc-300 dark:bg-zinc-600'
                              }`}
                            >
                              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                autoUpdate ? 'translate-x-5' : 'translate-x-0.5'
                              }`} />
                            </button>
                          </div>
                        </div>

                        {/* 语言选择 */}
                        <div className="py-3 border-b border-zinc-200 dark:border-zinc-700">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-0.5">
                                语言
                              </div>
                              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                                更改界面语言。
                              </div>
                            </div>
                            <select
                              className="px-2 py-1 pr-6 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400 min-w-[100px] cursor-pointer appearance-none bg-[length:7px_12px] bg-[right_5px_center] bg-no-repeat"
                              style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='7' height='12' viewBox='0 0 7 12'%3E%3Cpolyline points='0.5,3.5 3.5,0.5 6.5,3.5' fill='none' stroke='%23333' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpolyline points='0.5,8.5 3.5,11.5 6.5,8.5' fill='none' stroke='%23333' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`
                              }}
                            >
                              <option value="zh-CN">简体中文</option>
                              <option value="en-US">English</option>
                            </select>
                          </div>
                        </div>

                        {/* GitHub 链接 */}
                        <div className="py-3 border-b border-zinc-200 dark:border-zinc-700">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-0.5">
                                GitHub 仓库
                              </div>
                              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                                在 GitHub 上查看源代码、报告问题或参与贡献。
                              </div>
                            </div>
                            <button
                              onClick={openGitHub}
                              className="px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-md transition-colors flex items-center gap-1.5"
                            >
                              <ExternalLink className="size-3.5" />
                              打开
                            </button>
                          </div>
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

      {/* 登录对话框 */}
      {showLoginDialog && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/20 dark:bg-black/40 z-[150]"
            onClick={() => setShowLoginDialog(false)}
          />

          {/* 登录对话框 */}
          <div className="fixed inset-0 flex items-center justify-center z-[150] pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-[400px] max-w-[90vw] pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 标题栏 */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-700">
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">登录</h3>
                <button
                  onClick={() => setShowLoginDialog(false)}
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* 表单内容 */}
              <div className="p-5 space-y-4">
                {/* 邮箱 */}
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    邮箱
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="你的邮箱......"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-md text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-colors"
                  />
                </div>

                {/* 密码 */}
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    密码
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="你的密码......"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-md text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-colors"
                  />
                </div>

                {/* 忘记密码 */}
                <div>
                  <button
                    onClick={openForgotPassword}
                    className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-500 transition-colors"
                  >
                    忘记密码？
                  </button>
                </div>
              </div>

              {/* 底部按钮 */}
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-200 dark:border-zinc-700">
                <button
                  onClick={() => setShowLoginDialog(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-md transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleLogin}
                  className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-md transition-colors"
                >
                  登录
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
