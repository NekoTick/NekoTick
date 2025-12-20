import { motion, AnimatePresence } from 'framer-motion';
import { useTimeTracker } from './hooks/useTimeTracker';
import { TimeHeader } from './features/TimeHeader';
import { TimeChart } from './features/TimeChart';
import { AppDetailStats, AppUsageList } from './features/AppUsage';

export function TimeTrackerPage() {
  const {
    appUsages,
    todayTotal,
    timeRange,
    setTimeRange,
    sourceType,
    setSourceType,
    selectedApp,
    setSelectedApp,
    maxDuration
  } = useTimeTracker();

  return (
    <div className="h-full bg-white dark:bg-zinc-900 flex flex-col">
      {/* Header */}
      <TimeHeader 
        selectedApp={selectedApp}
        setSelectedApp={setSelectedApp}
        timeRange={timeRange}
        setTimeRange={setTimeRange}
        sourceType={sourceType}
        setSourceType={setSourceType}
        todayTotal={todayTotal}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Time Distribution Chart */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`chart-${selectedApp?.name || sourceType}-${timeRange}`}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
          >
            <TimeChart 
              selectedApp={selectedApp}
              timeRange={timeRange}
              sourceType={sourceType}
              todayTotal={todayTotal}
            />
          </motion.div>
        </AnimatePresence>

        {/* Content Area: Detail or List */}
        <AnimatePresence mode="wait">
          {selectedApp ? (
            <motion.div
              key={`detail-${selectedApp.name}-${timeRange}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <AppDetailStats 
                selectedApp={selectedApp}
                timeRange={timeRange}
                todayTotal={todayTotal}
              />
            </motion.div>
          ) : (
            <motion.div
              key={`${sourceType}-${timeRange}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <AppUsageList 
                appUsages={appUsages}
                maxDuration={maxDuration}
                onSelect={setSelectedApp}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
