import { useEffect, useState, useRef } from 'react';
import { MoreHorizontal, Check } from 'lucide-react';
import { TaskList } from '@/components/features/TaskList';
import { TaskInput } from '@/components/features/TaskInput';
import { CommandMenu } from '@/components/features/CommandMenu';
import { GroupSidebar } from '@/components/features/GroupDrawer';
import { TimeTrackerPage } from '@/components/TimeTracker';
import { ProgressPage } from '@/components/Progress';
import { CalendarPage } from '@/components/Calendar/CalendarPage';
import { Layout } from '@/components/layout';
import { ThemeProvider } from '@/components/theme-provider';
import { ToastContainer } from '@/components/ui/Toast';
import { useViewStore } from '@/stores/useViewStore';
import { useGroupStore } from '@/stores/useGroupStore';
import { useVimShortcuts } from '@/hooks/useVimShortcuts';
import { useShortcuts } from '@/hooks/useShortcuts';

function AppContent() {
  // Enable shortcuts
  useShortcuts();
  const { currentView } = useViewStore();
  const { activeGroupId, deleteGroup, groups, tasks, loadData, loaded, hideCompleted, setHideCompleted } = useGroupStore();
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // 获取当前分组信息
  const activeGroup = groups.find(g => g.id === activeGroupId);
  const groupTasks = tasks.filter(t => t.groupId === activeGroupId);
  const now = new Date();
  const formatDate = (date: Date | number) => {
    const d = new Date(date);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // 关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
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

  const handleFocusInput = () => {
    // Focus the task input (now using textarea)
    const input = document.querySelector<HTMLTextAreaElement>(
      'textarea[placeholder*="task"]'
    );
    input?.focus();
  };

  // 时间管理页面
  if (currentView === 'time-tracker') {
    return (
      <Layout>
        <TimeTrackerPage />
      </Layout>
    );
  }

  // 进度页面
  if (currentView === 'progress') {
    return (
      <Layout>
        <ProgressPage />
      </Layout>
    );
  }

  // 日历页面
  if (currentView === 'calendar') {
    return (
      <Layout>
        <CalendarPage />
      </Layout>
    );
  }

  // 任务列表页面（默认）
  return (
    <>
      {/* Command Palette (⌘K) */}
      <CommandMenu onFocusInput={handleFocusInput} />

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
                <span className="text-zinc-700">{groupTasks.length}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <Layout>
        <div className="flex h-full">
          {/* Group Sidebar */}
          <GroupSidebar />
          
          {/* Main Content */}
          <div className="flex-1 overflow-y-auto relative">
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
                <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1" style={{ zIndex: 9999 }}>
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
