import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AppUsage {
  name: string;
  icon?: string;
  duration: number; // 秒
}

interface TimeTrackerPageProps {
  onBack: () => void;
}

// 格式化时长
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}小时${minutes}分`;
  } else if (minutes > 0) {
    return `${minutes}分钟${secs}秒`;
  } else {
    return `${secs}秒`;
  }
}

// 计算进度条百分比
function getProgressWidth(duration: number, maxDuration: number): number {
  return Math.min((duration / maxDuration) * 100, 100);
}

type TimeRange = 'day' | 'month' | 'year';
type SourceType = 'app' | 'web';

const timeRangeLabels: Record<TimeRange, string> = {
  day: '按天',
  month: '按月',
  year: '按年',
};

export function TimeTrackerPage({ onBack }: TimeTrackerPageProps) {
  const [appUsages, setAppUsages] = useState<AppUsage[]>([]);
  const [todayTotal, setTodayTotal] = useState(0);
  const [timeRange, setTimeRange] = useState<TimeRange>('day');
  const [sourceType, setSourceType] = useState<SourceType>('app');
  const [selectedApp, setSelectedApp] = useState<AppUsage | null>(null);

  useEffect(() => {
    // TODO: 从后端获取实际数据
    // 目前使用模拟数据
    const appMockData: AppUsage[] = [
      { name: 'Windsurf', duration: 16200 },
      { name: 'Google Chrome', duration: 8760 },
      { name: 'Catime', duration: 7140 },
      { name: 'Visual Studio Code', duration: 5400 },
      { name: 'Notion', duration: 3600 },
      { name: 'Discord', duration: 2880 },
      { name: 'Spotify', duration: 2400 },
      { name: 'Terminal', duration: 1800 },
      { name: 'Notepad.exe', duration: 1397 },
      { name: 'File Explorer', duration: 1200 },
      { name: 'Microsoft Edge', duration: 900 },
      { name: 'Slack', duration: 720 },
      { name: 'Figma', duration: 600 },
      { name: 'OBS Studio', duration: 480 },
      { name: 'Steam', duration: 360 },
      { name: 'WeChat', duration: 300 },
      { name: 'QQ Music', duration: 240 },
      { name: 'Postman', duration: 180 },
      { name: 'Docker Desktop', duration: 120 },
      { name: 'Calculator', duration: 60 },
    ];

    const webMockData: AppUsage[] = [
      { name: 'github.com', duration: 12600 },
      { name: 'youtube.com', duration: 9000 },
      { name: 'bilibili.com', duration: 7200 },
      { name: 'google.com', duration: 5400 },
      { name: 'stackoverflow.com', duration: 4800 },
      { name: 'twitter.com', duration: 3600 },
      { name: 'reddit.com', duration: 2700 },
      { name: 'zhihu.com', duration: 2400 },
      { name: 'notion.so', duration: 1800 },
      { name: 'figma.com', duration: 1500 },
      { name: 'vercel.com', duration: 1200 },
      { name: 'tauri.app', duration: 900 },
      { name: 'tailwindcss.com', duration: 720 },
      { name: 'react.dev', duration: 600 },
      { name: 'npmjs.com', duration: 480 },
      { name: 'v2ex.com', duration: 360 },
      { name: 'juejin.cn', duration: 300 },
      { name: 'medium.com', duration: 240 },
    ];

    const mockData = sourceType === 'app' ? appMockData : webMockData;
    setAppUsages(mockData);
    setTodayTotal(mockData.reduce((sum, app) => sum + app.duration, 0));
  }, [sourceType]);

  const maxDuration = appUsages.length > 0 ? appUsages[0].duration : 1;

  return (
    <div className="h-full bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-100">
        <button
          onClick={() => selectedApp ? setSelectedApp(null) : onBack()}
          className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
        >
          <ArrowLeft className="size-5 text-zinc-500" />
        </button>
        
        <AnimatePresence mode="wait">
          {selectedApp ? (
            /* Selected App Header */
            <motion.div
              key="selected"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex items-center gap-3 flex-1"
            >
              <div className="size-8 rounded-lg bg-zinc-100 flex items-center justify-center text-sm font-medium text-zinc-500">
                {selectedApp.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-medium text-zinc-900">{selectedApp.name}</h2>
                <p className="text-xs text-zinc-500">
                  {timeRange === 'day' ? '今日' : timeRange === 'month' ? '本月' : '今年'}: {formatDuration(selectedApp.duration)}
                </p>
              </div>
            </motion.div>
          ) : (
            /* Normal Header */
            <motion.div
              key="normal"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex items-center gap-3 flex-1"
            >
              {/* Source Type Toggle */}
              <div className="relative flex items-center bg-zinc-100 rounded-full p-0.5">
                <motion.div
                  className="absolute h-[calc(100%-4px)] bg-white rounded-full shadow-sm"
                  initial={false}
                  animate={{
                    x: sourceType === 'app' ? 2 : '100%',
                    width: sourceType === 'app' ? 52 : 52,
                  }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
                <button
                  onClick={() => setSourceType('app')}
                  className={`relative z-10 px-3 py-1 text-sm font-medium rounded-full transition-colors ${
                    sourceType === 'app' ? 'text-zinc-900' : 'text-zinc-400'
                  }`}
                >
                  应用
                </button>
                <button
                  onClick={() => setSourceType('web')}
                  className={`relative z-10 px-3 py-1 text-sm font-medium rounded-full transition-colors ${
                    sourceType === 'web' ? 'text-zinc-900' : 'text-zinc-400'
                  }`}
                >
                  网站
                </button>
              </div>

              <div className="flex-1">
                <p className="text-sm text-zinc-500">
                  {timeRange === 'day' ? '今日' : timeRange === 'month' ? '本月' : '今年'}总计: {formatDuration(todayTotal)}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Time Range Tabs */}
        <div className="flex items-center gap-1">
          {(['day', 'month', 'year'] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                timeRange === range
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:bg-zinc-100'
              }`}
            >
              {timeRangeLabels[range]}
            </button>
          ))}
        </div>
      </div>

      {/* App List */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Time Distribution Chart */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`chart-${selectedApp?.name || sourceType}-${timeRange}`}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="max-w-xl mx-auto mb-6"
          >
            <div className="flex justify-between h-16 gap-1 mt-10">
              {(() => {
                // 为选中的应用生成随机但稳定的数据
                const generateAppData = (name: string, range: TimeRange): number[] => {
                  const seed = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
                  const counts = { day: 24, month: 30, year: 12 };
                  return Array.from({ length: counts[range] }, (_, i) => {
                    const val = Math.sin(seed + i * 0.5) * 0.5 + 0.5;
                    return Math.max(0.05, Math.min(1, val * (0.7 + Math.sin(i) * 0.3)));
                  });
                };

                // 不同条件下的柱状图数据
                const chartData: Record<string, Record<string, number[]>> = {
                  app: {
                    day: [0, 0, 0, 0, 0, 0.1, 0.2, 0.4, 0.7, 0.9, 0.95, 0.8, 0.5, 0.6, 0.85, 0.9, 0.75, 0.6, 0.7, 0.8, 0.6, 0.4, 0.2, 0.05],
                    month: [0.6, 0.7, 0.5, 0.8, 0.9, 0.4, 0.3, 0.85, 0.75, 0.6, 0.7, 0.8, 0.55, 0.65, 0.9, 0.7, 0.5, 0.6, 0.8, 0.7, 0.6, 0.5, 0.7, 0.8, 0.6, 0.5, 0.7, 0.85, 0.6, 0.4],
                    year: [0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.85, 0.75, 0.6],
                  },
                  web: {
                    day: [0, 0, 0, 0, 0, 0.05, 0.1, 0.3, 0.5, 0.7, 0.8, 0.9, 0.85, 0.7, 0.6, 0.5, 0.4, 0.5, 0.6, 0.75, 0.85, 0.7, 0.5, 0.2],
                    month: [0.5, 0.6, 0.4, 0.7, 0.8, 0.5, 0.4, 0.75, 0.65, 0.5, 0.6, 0.7, 0.45, 0.55, 0.8, 0.6, 0.4, 0.5, 0.7, 0.6, 0.5, 0.4, 0.6, 0.7, 0.5, 0.4, 0.6, 0.75, 0.5, 0.3],
                    year: [0.2, 0.3, 0.4, 0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 0.75, 0.65, 0.5],
                  },
                };
                
                const data = selectedApp 
                  ? generateAppData(selectedApp.name, timeRange)
                  : chartData[sourceType][timeRange];
                  
                const labels = timeRange === 'day' 
                  ? { count: 24, format: (i: number) => `${i}:00 - ${i + 1}:00` }
                  : timeRange === 'month'
                    ? { count: 30, format: (i: number) => `${i + 1}日` }
                    : { count: 12, format: (i: number) => `${i + 1}月` };
                
                // 计算显示的时长（基于usage比例和总时长）
                const totalDuration = selectedApp?.duration || todayTotal;
                
                return Array.from({ length: labels.count }, (_, i) => {
                  const usage = data[i] || 0;
                  const duration = Math.floor(totalDuration * usage / data.reduce((a, b) => a + b, 0));
                  const isCurrent = timeRange === 'day' 
                    ? new Date().getHours() === i
                    : timeRange === 'month'
                      ? new Date().getDate() - 1 === i
                      : new Date().getMonth() === i;
                  
                  const barHeight = Math.max(usage * 100, 4);
                  
                  return (
                    <div key={i} className="flex-1 h-full flex flex-col justify-end relative group">
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-800 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        <div className="font-medium">{labels.format(i)}</div>
                        <div className="text-zinc-300">{formatDuration(duration)}</div>
                        {/* Arrow */}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-800" />
                      </div>
                      
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${barHeight}%` }}
                        transition={{ duration: 0.4, delay: i * 0.015 }}
                        style={{ height: `${barHeight}%` }}
                        className={`w-full rounded-sm cursor-pointer hover:opacity-80 ${
                          isCurrent 
                            ? 'bg-zinc-700' 
                            : usage > 0.7 
                              ? 'bg-zinc-400' 
                              : usage > 0.3 
                                ? 'bg-zinc-300' 
                                : 'bg-zinc-200'
                        }`}
                      />
                    </div>
                  );
                });
              })()}
            </div>
            {/* Time Labels */}
            <div className="flex justify-between mt-1 text-xs text-zinc-400">
              {timeRange === 'day' ? (
                <>
                  <span>0时</span>
                  <span>6时</span>
                  <span>12时</span>
                  <span>18时</span>
                  <span>24时</span>
                </>
              ) : timeRange === 'month' ? (
                <>
                  <span>1日</span>
                  <span>8日</span>
                  <span>15日</span>
                  <span>22日</span>
                  <span>30日</span>
                </>
              ) : (
                <>
                  <span>1月</span>
                  <span>4月</span>
                  <span>7月</span>
                  <span>10月</span>
                  <span>12月</span>
                </>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* App Detail Stats - show when app is selected */}
        <AnimatePresence mode="wait">
          {selectedApp && (
            <motion.div
              key={`detail-${selectedApp.name}-${timeRange}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="max-w-xl mx-auto"
            >
            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-zinc-50 rounded-xl p-4">
                <p className="text-xs text-zinc-400 mb-1">平均每日</p>
                <p className="text-lg font-medium text-zinc-900">
                  {formatDuration(Math.floor(selectedApp.duration / (timeRange === 'day' ? 1 : timeRange === 'month' ? 30 : 365)))}
                </p>
              </div>
              <div className="bg-zinc-50 rounded-xl p-4">
                <p className="text-xs text-zinc-400 mb-1">使用高峰</p>
                <p className="text-lg font-medium text-zinc-900">
                  {timeRange === 'day' ? '14:00-16:00' : timeRange === 'month' ? '周三' : '3月'}
                </p>
              </div>
              <div className="bg-zinc-50 rounded-xl p-4">
                <p className="text-xs text-zinc-400 mb-1">使用天数</p>
                <p className="text-lg font-medium text-zinc-900">
                  {timeRange === 'day' ? '1天' : timeRange === 'month' ? '18天' : '156天'}
                </p>
              </div>
            </div>

            {/* Usage Percentage */}
            <div className="bg-zinc-50 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-zinc-700">使用占比</p>
                <motion.span 
                  className="text-sm font-medium text-zinc-900"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  {Math.round((selectedApp.duration / todayTotal) * 100)}%
                </motion.span>
              </div>
              <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-zinc-600 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round((selectedApp.duration / todayTotal) * 100)}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
                />
              </div>
              <p className="text-xs text-zinc-400 mt-2">
                占{timeRange === 'day' ? '今日' : timeRange === 'month' ? '本月' : '今年'}总使用时长的比例
              </p>
            </div>

            {/* Recent Sessions */}
            <div className="bg-zinc-50 rounded-xl p-4">
              <p className="text-sm font-medium text-zinc-700 mb-3">最近使用</p>
              <div className="space-y-2">
                {[
                  { time: '今天 14:30', duration: 7200 },
                  { time: '今天 09:15', duration: 3600 },
                  { time: '昨天 16:45', duration: 5400 },
                ].map((session, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-500">{session.time}</span>
                    <span className="text-zinc-700">{formatDuration(session.duration)}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
        </AnimatePresence>

        {/* App List - only show when no app is selected */}
        {!selectedApp && (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${sourceType}-${timeRange}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="max-w-xl mx-auto space-y-4"
            >
              {appUsages.length === 0 ? (
                <div className="text-center py-12 text-zinc-400">
                  暂无使用记录
                </div>
              ) : (
                appUsages.map((app, index) => (
                  <motion.div 
                    key={index} 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={() => setSelectedApp(app)}
                    className="space-y-2 cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 p-2 -m-2 rounded-xl transition-colors group-hover:bg-zinc-50">
                      {/* App Icon Placeholder */}
                      <div className="size-10 rounded-xl bg-zinc-100 flex items-center justify-center text-sm font-medium text-zinc-500 group-hover:bg-zinc-200 transition-colors">
                        {app.name.charAt(0).toUpperCase()}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-zinc-700 truncate group-hover:text-zinc-900">
                            {app.name}
                          </span>
                          <span className="text-sm text-zinc-400 ml-2 shrink-0">
                            {formatDuration(app.duration)}
                          </span>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="mt-2 h-2 bg-zinc-100 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${getProgressWidth(app.duration, maxDuration)}%` }}
                            transition={{ duration: 0.4, delay: index * 0.05 }}
                            className="h-full bg-zinc-300 rounded-full"
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

    </div>
  );
}
