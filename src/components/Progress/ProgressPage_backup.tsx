import { useState, useEffect } from 'react';
import { ChevronLeft, Plus, Minus } from 'lucide-react';
import { useProgressStore, type ProgressItem, type CounterItem } from '@/stores/useProgressStore';

type ViewMode = 'list' | 'create-progress' | 'create-counter';

export function ProgressPage() {
  const { items, addProgress, addCounter, updateCurrent, deleteItem, loadItems } = useProgressStore();
  
  useEffect(() => {
    loadItems();
  }, [loadItems]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showFabMenu, setShowFabMenu] = useState(false);
  
  // Progress form state
  const [progressForm, setProgressForm] = useState({
    title: '',
    note: '',
    direction: 'increment' as 'increment' | 'decrement',
    total: 100,
    step: 1,
    unit: '次',
  });
  
  // Counter form state
  const [counterForm, setCounterForm] = useState({
    title: '',
    step: 1,
    unit: '次',
    frequency: 'daily' as 'daily' | 'weekly' | 'monthly',
  });

  const handleCreateProgress = () => {
    if (!progressForm.title.trim()) return;
    addProgress({
      title: progressForm.title.trim(),
      note: progressForm.note.trim() || undefined,
      direction: progressForm.direction,
      total: progressForm.total,
      step: progressForm.step,
      unit: progressForm.unit.trim() || '次',
    });
    setProgressForm({ title: '', note: '', direction: 'increment', total: 100, step: 1, unit: '次' });
    setViewMode('list');
  };

  const handleCreateCounter = () => {
    if (!counterForm.title.trim()) return;
    addCounter({
      title: counterForm.title.trim(),
      step: counterForm.step,
      unit: counterForm.unit.trim() || '次',
      frequency: counterForm.frequency,
    });
    setCounterForm({ title: '', step: 1, unit: '次', frequency: 'daily' });
    setViewMode('list');
  };

  // 创建进度页面
  if (viewMode === 'create-progress') {
    return (
      <div className="h-full bg-white dark:bg-zinc-900 flex flex-col">
        <div className="flex items-center gap-3 px-6 py-3">
          <button
            onClick={() => setViewMode('list')}
            className="p-1 -ml-1 rounded text-zinc-300 hover:text-zinc-500 transition-colors"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-sm text-zinc-400">创建进度</span>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <div>
            <label className="block text-xs text-zinc-400 mb-2">标题</label>
            <input
              type="text"
              value={progressForm.title}
              onChange={(e) => setProgressForm({ ...progressForm, title: e.target.value })}
              placeholder="输入标题..."
              className="w-full px-0 py-1 text-sm bg-transparent border-b border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-400 placeholder:text-zinc-300"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-2">备注</label>
            <input
              type="text"
              value={progressForm.note}
              onChange={(e) => setProgressForm({ ...progressForm, note: e.target.value })}
              placeholder="可选..."
              className="w-full px-0 py-1 text-sm bg-transparent border-b border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-400 placeholder:text-zinc-300"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-2">类型</label>
            <div className="flex gap-3">
              <button
                onClick={() => setProgressForm({ ...progressForm, direction: 'increment' })}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  progressForm.direction === 'increment'
                    ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-800'
                    : 'text-zinc-400 hover:text-zinc-600'
                }`}
              >
                递增
              </button>
              <button
                onClick={() => setProgressForm({ ...progressForm, direction: 'decrement' })}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  progressForm.direction === 'decrement'
                    ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-800'
                    : 'text-zinc-400 hover:text-zinc-600'
                }`}
              >
                递减
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-2">总量</label>
              <input
                type="number"
                value={progressForm.total}
                onChange={(e) => setProgressForm({ ...progressForm, total: Number(e.target.value) || 0 })}
                className="w-20 px-0 py-1 text-sm bg-transparent border-b border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-400"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-2">步长</label>
              <input
                type="number"
                value={progressForm.step}
                onChange={(e) => setProgressForm({ ...progressForm, step: Number(e.target.value) || 1 })}
                className="w-16 px-0 py-1 text-sm bg-transparent border-b border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-400"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-2">单位</label>
              <input
                type="text"
                value={progressForm.unit}
                onChange={(e) => setProgressForm({ ...progressForm, unit: e.target.value })}
                className="w-16 px-0 py-1 text-sm bg-transparent border-b border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-400"
              />
            </div>
          </div>
        </div>
        <div className="px-6 py-4">
          <button
            onClick={handleCreateProgress}
            disabled={!progressForm.title.trim()}
            className="w-full py-2 text-sm text-zinc-600 border border-zinc-200 rounded hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            创建
          </button>
        </div>
      </div>
    );
  }

  // 创建计数页面
  if (viewMode === 'create-counter') {
    return (
      <div className="h-full bg-white dark:bg-zinc-900 flex flex-col">
        <div className="flex items-center gap-3 px-6 py-3">
          <button
            onClick={() => setViewMode('list')}
            className="p-1 -ml-1 rounded text-zinc-300 hover:text-zinc-500 transition-colors"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-sm text-zinc-400">创建计数</span>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <div>
            <label className="block text-xs text-zinc-400 mb-2">标题</label>
            <input
              type="text"
              value={counterForm.title}
              onChange={(e) => setCounterForm({ ...counterForm, title: e.target.value })}
              placeholder="输入标题..."
              className="w-full px-0 py-1 text-sm bg-transparent border-b border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-400 placeholder:text-zinc-300"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-2">频率</label>
            <div className="flex gap-3">
              {(['daily', 'weekly', 'monthly'] as const).map((freq) => (
                <button
                  key={freq}
                  onClick={() => setCounterForm({ ...counterForm, frequency: freq })}
                  className={`px-3 py-1.5 text-xs rounded transition-colors ${
                    counterForm.frequency === freq
                      ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-800'
                      : 'text-zinc-400 hover:text-zinc-600'
                  }`}
                >
                  {freq === 'daily' ? '每日' : freq === 'weekly' ? '每周' : '每月'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-2">步长</label>
              <input
                type="number"
                value={counterForm.step}
                onChange={(e) => setCounterForm({ ...counterForm, step: Number(e.target.value) || 1 })}
                className="w-16 px-0 py-1 text-sm bg-transparent border-b border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-400"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-2">单位</label>
              <input
                type="text"
                value={counterForm.unit}
                onChange={(e) => setCounterForm({ ...counterForm, unit: e.target.value })}
                className="w-16 px-0 py-1 text-sm bg-transparent border-b border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-400"
              />
            </div>
          </div>
        </div>
        <div className="px-6 py-4">
          <button
            onClick={handleCreateCounter}
            disabled={!counterForm.title.trim()}
            className="w-full py-2 text-sm text-zinc-600 border border-zinc-200 rounded hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            创建
          </button>
        </div>
      </div>
    );
  }

  // 主列表页面
  return (
    <div className="h-full bg-white dark:bg-zinc-900 flex flex-col pt-2 relative">
      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {items.length === 0 && (
          <p className="text-sm text-zinc-300 text-center py-12">暂无进度</p>
        )}
        <div className="space-y-3">
          {items.map((item) => (
            item.type === 'progress' 
              ? <ProgressCard key={item.id} item={item} onUpdate={updateCurrent} onDelete={deleteItem} />
              : <CounterCard key={item.id} item={item} onUpdate={updateCurrent} onDelete={deleteItem} />
          ))}
        </div>
      </div>

      {/* FAB */}
      <div className="absolute bottom-6 right-6 flex flex-col items-end gap-2">
        {showFabMenu && (
          <>
            <button
              onClick={() => {
                setViewMode('create-counter');
                setShowFabMenu(false);
              }}
              className="px-4 py-2 bg-zinc-700 dark:bg-zinc-600 text-white text-sm rounded-full shadow-lg hover:bg-zinc-600 dark:hover:bg-zinc-500 transition-colors"
            >
              + 计数
            </button>
            <button
              onClick={() => {
                setViewMode('create-progress');
                setShowFabMenu(false);
              }}
              className="px-4 py-2 bg-zinc-700 dark:bg-zinc-600 text-white text-sm rounded-full shadow-lg hover:bg-zinc-600 dark:hover:bg-zinc-500 transition-colors"
            >
              + 进度
            </button>
          </>
        )}
        <button
          onClick={() => setShowFabMenu(!showFabMenu)}
          className={`w-14 h-14 rounded-full bg-zinc-700 dark:bg-zinc-600 text-white shadow-lg hover:bg-zinc-600 dark:hover:bg-zinc-500 transition-all flex items-center justify-center ${
            showFabMenu ? 'rotate-45' : ''
          }`}
        >
          <Plus className="size-6" />
        </button>
      </div>
    </div>
  );
}

function ProgressCard({ 
  item, 
  onUpdate, 
  onDelete 
}: { 
  item: ProgressItem; 
  onUpdate: (id: string, delta: number) => void;
  onDelete: (id: string) => void;
}) {
  const percentage = Math.round((item.current / item.total) * 100);
  const step = item.direction === 'increment' ? item.step : -item.step;

  return (
    <div className="group p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-medium text-zinc-800 dark:text-zinc-200 mb-2">{item.title}</h3>
          <div className="flex items-center gap-3 text-sm mb-2">
            <span className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 rounded text-xs">进度</span>
            <span className="text-zinc-500">{item.current}/{item.total}{item.unit}</span>
            <span className="text-zinc-400">今天{item.todayCount}{item.unit}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-zinc-400 transition-all duration-300"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="text-sm text-zinc-500">{percentage}%</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onUpdate(item.id, -step)}
            className="w-10 h-10 rounded-full bg-zinc-700 hover:bg-zinc-600 dark:bg-zinc-600 dark:hover:bg-zinc-500 text-white flex items-center justify-center transition-colors"
          >
            <Minus className="size-5" />
          </button>
          <button
            onClick={() => onUpdate(item.id, step)}
            className="w-10 h-10 rounded-full bg-zinc-700 hover:bg-zinc-600 dark:bg-zinc-600 dark:hover:bg-zinc-500 text-white flex items-center justify-center transition-colors"
          >
            <Plus className="size-5" />
          </button>
        </div>
      </div>
      <button
        onClick={() => onDelete(item.id)}
        className="mt-2 text-xs text-zinc-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
      >
        删除
      </button>
    </div>
  );
}

function CounterCard({ 
  item, 
  onUpdate, 
  onDelete 
}: { 
  item: CounterItem; 
  onUpdate: (id: string, delta: number) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="group p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-medium text-zinc-800 dark:text-zinc-200 mb-2">{item.title}</h3>
          <div className="flex items-center gap-3 text-sm">
            <span className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 rounded text-xs">计数</span>
            <span className="text-zinc-500">总计{item.current}{item.unit}</span>
            <span className="text-zinc-400">今天{item.todayCount}{item.unit}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onUpdate(item.id, -item.step)}
            className="w-10 h-10 rounded-full bg-zinc-700 hover:bg-zinc-600 dark:bg-zinc-600 dark:hover:bg-zinc-500 text-white flex items-center justify-center transition-colors"
          >
            <Minus className="size-5" />
          </button>
          <button
            onClick={() => onUpdate(item.id, item.step)}
            className="w-10 h-10 rounded-full bg-zinc-700 hover:bg-zinc-600 dark:bg-zinc-600 dark:hover:bg-zinc-500 text-white flex items-center justify-center transition-colors"
          >
            <Plus className="size-5" />
          </button>
        </div>
      </div>
      <button
        onClick={() => onDelete(item.id)}
        className="mt-2 text-xs text-zinc-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
      >
        删除
      </button>
    </div>
  );
}
