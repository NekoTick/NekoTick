import { motion } from 'framer-motion';
import { AppUsage, TimeRange } from './types';
import { formatDuration } from './utils';

interface AppDetailStatsProps {
  selectedApp: AppUsage;
  timeRange: TimeRange;
  todayTotal: number;
}

export function AppDetailStats({ selectedApp, timeRange, todayTotal }: AppDetailStatsProps) {
  return (
    <div className="max-w-xl mx-auto">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-zinc-50 rounded-xl p-4">
          <p className="text-xs text-zinc-400 mb-1">Daily Average</p>
          <p className="text-lg font-medium text-zinc-900">
            {formatDuration(Math.floor(selectedApp.duration / (timeRange === 'day' ? 1 : timeRange === 'month' ? 30 : 365)))}
          </p>
        </div>
        <div className="bg-zinc-50 rounded-xl p-4">
          <p className="text-xs text-zinc-400 mb-1">Peak Usage</p>
          <p className="text-lg font-medium text-zinc-900">
            {timeRange === 'day' ? '14:00-16:00' : timeRange === 'month' ? 'Wed' : 'Mar'}
          </p>
        </div>
        <div className="bg-zinc-50 rounded-xl p-4">
          <p className="text-xs text-zinc-400 mb-1">Days Used</p>
          <p className="text-lg font-medium text-zinc-900">
            {timeRange === 'day' ? '1 day' : timeRange === 'month' ? '18 days' : '156 days'}
          </p>
        </div>
      </div>

      {/* Usage Percentage */}
      <div className="bg-zinc-50 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-zinc-700">Usage Percentage</p>
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
          Percentage of {timeRange === 'day' ? "today's" : timeRange === 'month' ? "this month's" : "this year's"} total usage time
        </p>
      </div>

      {/* Recent Sessions */}
      <div className="bg-zinc-50 rounded-xl p-4">
        <p className="text-sm font-medium text-zinc-700 mb-3">Recent Sessions</p>
        <div className="space-y-2">
          {[
            { time: 'Today 14:30', duration: 7200 },
            { time: 'Today 09:15', duration: 3600 },
            { time: 'Yesterday 16:45', duration: 5400 },
          ].map((session, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">{session.time}</span>
              <span className="text-zinc-700">{formatDuration(session.duration)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
