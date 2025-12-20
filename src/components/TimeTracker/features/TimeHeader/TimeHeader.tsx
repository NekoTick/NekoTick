import { ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppUsage, TimeRange, SourceType, timeRangeLabels } from '../../types';
import { formatDuration } from '../../utils';

interface TimeHeaderProps {
  selectedApp: AppUsage | null;
  setSelectedApp: (app: AppUsage | null) => void;
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
  sourceType: SourceType;
  setSourceType: (type: SourceType) => void;
  todayTotal: number;
}

export function TimeHeader({
  selectedApp,
  setSelectedApp,
  timeRange,
  setTimeRange,
  sourceType,
  setSourceType,
  todayTotal
}: TimeHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-100">
      {selectedApp && (
        <button
          onClick={() => setSelectedApp(null)}
          className="p-1 rounded text-zinc-300 hover:text-zinc-500 transition-colors"
        >
          <ChevronLeft className="size-4" />
        </button>
      )}
      
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
                {timeRange === 'day' ? 'Today' : timeRange === 'month' ? 'This Month' : 'This Year'}: {formatDuration(selectedApp.duration)}
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
                Apps
              </button>
              <button
                onClick={() => setSourceType('web')}
                className={`relative z-10 px-3 py-1 text-sm font-medium rounded-full transition-colors ${
                  sourceType === 'web' ? 'text-zinc-900' : 'text-zinc-400'
                }`}
              >
                Websites
              </button>
            </div>

            <div className="flex-1">
              <p className="text-sm text-zinc-500">
                {timeRange === 'day' ? 'Today' : timeRange === 'month' ? 'This Month' : 'This Year'} Total: {formatDuration(todayTotal)}
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
  );
}
