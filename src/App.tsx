import { useEffect, useState, useRef, useMemo } from 'react';
import { MoreHorizontal, Check } from 'lucide-react';
import { TaskList } from '@/components/features/TaskList';
import { TaskInput } from '@/components/features/TaskInput';
import { SettingsModal } from '@/components/features/Settings';
import { GroupSidebar } from '@/components/features/GroupDrawer';
import { TimeTrackerPage } from '@/components/TimeTracker';
import { ProgressPage } from '@/components/Progress';
import { CalendarPage } from '@/components/Calendar';
import { Layout } from '@/components/layout';
import { ThemeProvider } from '@/components/theme-provider';
import { ToastContainer } from '@/components/ui/Toast';
import { useViewStore } from '@/stores/useViewStore';
import { useGroupStore, useUIStore, type Priority } from '@/stores/useGroupStore';
import { useVimShortcuts } from '@/hooks/useVimShortcuts';
import { useShortcuts } from '@/hooks/useShortcuts';
import { getShortcutKeys } from '@/lib/shortcuts';

function AppContent() {
  // Enable shortcuts
  useShortcuts();
  const { currentView } = useViewStore();
  const { activeGroupId, deleteGroup, groups, tasks, loadData, loaded } = useGroupStore();
  const { hideCompleted, setHideCompleted, hideActualTime, setHideActualTime, selectedPriorities, togglePriority, toggleAllPriorities } = useUIStore();
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  
  // 所有优先级选项
  const allPriorities: Priority[] = ['red', 'yellow', 'purple', 'green', 'default'];

  // 获取当前分组信息
  const activeGroup = activeGroupId === '__archive__' 
    ? { id: '__archive__', name: '归档', createdAt: Date.now() }
    : groups.find(g => g.id === activeGroupId);
  
  // 使用 useMemo 缓存任务数量计算，避免每次渲染都重新过滤
  const groupTaskCount = useMemo(() => {
    return tasks.filter(t => t.groupId === activeGroupId).length;
  }, [tasks, activeGroupId]);
  const now = new Date();
  const formatDate = (date: Date | number) => {
    const d = new Date(date);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // 关闭菜单（不在点击颜色选项时关闭）
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 如果点击的是颜色筛选选项，不关闭菜单
      if (target.closest('[data-priority-option]')) {
        return;
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoreMenu]);

  // Enable VIM-style keyboard navigation
  useVimShortcuts();

  // Load data on app startup
  useEffect(() => {
    loadData();
  }, [loadData]);

  // 打开/关闭设置快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const keys = getShortcutKeys('open-settings');
      if (!keys || keys.length === 0) return;

      const matchesShortcut = keys.every((key: string) => {
        if (key === 'Ctrl') return e.ctrlKey;
        if (key === 'Shift') return e.shiftKey;
        if (key === 'Alt') return e.altKey;
        if (key === 'Meta') return e.metaKey;
        return e.key.toUpperCase() === key.toUpperCase();
      });

      if (matchesShortcut) {
        e.preventDefault();
        setSettingsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      {/* Settings Modal - Global */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* 时间管理页面 */}
      {currentView === 'time-tracker' && (
        <Layout onOpenSettings={() => setSettingsOpen(true)}>
          <TimeTrackerPage />
        </Layout>
      )}

      {/* 进度页面 */}
      {currentView === 'progress' && (
        <Layout onOpenSettings={() => setSettingsOpen(true)}>
          <ProgressPage />
        </Layout>
      )}

      {/* 日历页面 */}
      {currentView === 'calendar' && (
        <Layout onOpenSettings={() => setSettingsOpen(true)}>
          <CalendarPage />
        </Layout>
      )}

      {/* 任务列表页面（默认） */}
      {currentView === 'tasks' && (
        <>
          {/* Info Modal */}
          {showInfoModal && (
            <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-80 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
                  <h3 className="text-sm font-medium text-zinc-900">
                    {activeGroup?.name || '默认'}
                  </h3>
                  <button
                    onClick={() => setShowInfoModal(false)}
                    className="text-zinc-400 hover:text-zinc-600"
                  >
                    ×
                  </button>
                </div>
                <div className="px-4 py-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Last synced</span>
                    <span className="text-blue-500">{formatDate(now)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Modified</span>
                    <span className="text-blue-500">{formatDate(now)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Created</span>
                    <span className="text-blue-500">{formatDate(activeGroup?.createdAt || now)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Tasks</span>
                    <span className="text-zinc-700">{groupTaskCount}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <Layout onOpenSettings={() => setSettingsOpen(true)}>
        <div className="flex h-full">
          {/* Group Sidebar */}
          <GroupSidebar />
          
          {/* Main Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden relative">
            {/* More Menu - Top Right */}
            <div className="absolute top-4 right-6" ref={moreMenuRef}>
                <button
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                  className={`p-1.5 rounded-md transition-colors ${
                    showMoreMenu 
                      ? 'text-zinc-400 bg-zinc-100 dark:text-zinc-500 dark:bg-zinc-800' 
                      : 'text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500'
                  }`}
                >
                  <MoreHorizontal className="size-4" />
                </button>
                {showMoreMenu && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1" style={{ zIndex: 9999 }}>
                    {/* 颜色筛选 */}
                    <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-700">
                      <div className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">颜色筛选</div>
                      <div className="flex items-center justify-between gap-1.5">
                        {/* 默认颜色按钮 */}
                        <button
                          data-priority-option
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePriority('default');
                          }}
                          className={`w-6 h-6 rounded-sm border-2 transition-all hover:scale-110 ${
                            selectedPriorities.includes('default')
                              ? 'ring-2 ring-zinc-400 dark:ring-zinc-500 ring-offset-1'
                              : ''
                          }`}
                          style={{
                            borderColor: '#d4d4d8',
                            backgroundColor: 'transparent'
                          }}
                        />
                        {/* 各颜色选项 */}
                        {(['green', 'purple', 'yellow', 'red'] as const).map(priority => (
                          <button
                            key={priority}
                            data-priority-option
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePriority(priority);
                            }}
                            className={`w-6 h-6 rounded-sm border-2 transition-all hover:scale-110 ${
                              selectedPriorities.includes(priority)
                                ? 'ring-2 ring-zinc-400 dark:ring-zinc-500 ring-offset-1'
                                : ''
                            }`}
                            style={{
                              borderColor: priority === 'red' ? '#ef4444' :
                                           priority === 'yellow' ? '#eab308' :
                                           priority === 'purple' ? '#a855f7' :
                                           '#22c55e'
                            }}
                          />
                        ))}
                        {/* 全选按钮 - 柔和彩虹渐变 */}
                        <button
                          data-priority-option
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleAllPriorities();
                          }}
                          className={`w-6 h-6 rounded-sm transition-all hover:scale-110 relative overflow-hidden p-[2px] ${
                            selectedPriorities.length === allPriorities.length
                              ? 'ring-2 ring-zinc-400 dark:ring-zinc-500 ring-offset-1'
                              : ''
                          }`}
                          style={{
                            background: 'linear-gradient(135deg, #22c55e, #a855f7, #eab308, #ef4444)'
                          }}
                        >
                          <span className="block w-full h-full bg-white dark:bg-zinc-900 rounded-sm" />
                        </button>
                      </div>
                    </div>
                    
                    {/* 非归档视图显示其他菜单项 */}
                    {activeGroupId !== '__archive__' && (
                      <>
                        <button
                          onClick={() => {
                            setHideCompleted(!hideCompleted);
                            setShowMoreMenu(false);
                          }}
                          className="w-full px-3 py-1.5 text-left text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center justify-between"
                        >
                          <span>Hide Completed</span>
                          {hideCompleted && <Check className="size-4 text-blue-500" />}
                        </button>
                        <button
                          onClick={() => {
                            setHideActualTime(!hideActualTime);
                            setShowMoreMenu(false);
                          }}
                          className="w-full px-3 py-1.5 text-left text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center justify-between"
                        >
                          <span>Hide Time Info</span>
                          {hideActualTime && <Check className="size-4 text-blue-500" />}
                        </button>
                        <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
                        <button
                          onClick={() => {
                            setShowInfoModal(true);
                            setShowMoreMenu(false);
                          }}
                          className="w-full px-3 py-1.5 text-left text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        >
                          Info
                        </button>
                        <button
                          onClick={() => setShowMoreMenu(false)}
                          className="w-full px-3 py-1.5 text-left text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        >
                          History...
                        </button>
                        <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
                        <button
                          onClick={() => {
                            if (activeGroupId && activeGroupId !== 'default') {
                              deleteGroup(activeGroupId);
                            }
                            setShowMoreMenu(false);
                          }}
                          className="w-full px-3 py-1.5 text-left text-sm text-red-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        >
                          Move to Trash
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

            <div className="max-w-3xl mx-auto px-6 py-8">
              {/* Loading State */}
              {!loaded && (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  Loading tasks...
                </div>
              )}

              {/* Main Content */}
              {loaded && (
                <>
                  {/* Task Input */}
                  <div className="mb-4">
                    <TaskInput />
                  </div>

                  {/* Task List */}
                  <TaskList />
                </>
              )}
            </div>
          </div>
        </div>
          </Layout>
        </>
      )}
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
      <ToastContainer />
    </ThemeProvider>
  );
}

export default App;
