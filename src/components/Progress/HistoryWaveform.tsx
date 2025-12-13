import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, subDays, startOfWeek, endOfWeek, subWeeks, startOfMonth, subMonths, isSameDay } from 'date-fns';
import type { ProgressOrCounter } from '../../stores/useProgressStore';
import { CaretDown } from '@phosphor-icons/react';

interface HistoryWaveformProps {
  item: ProgressOrCounter;
}

type TimeScope = '14D' | '12W' | '12M';

/**
 * "Chrono-Rhythm" Visualization
 * A liquid, interactive waveform representing the user's history with time-dilation capabilities.
 */
export function HistoryWaveform({ item }: HistoryWaveformProps) {
  const [scope, setScope] = useState<TimeScope>('14D');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // 1. Intelligent Data Aggregation (The Time Lens)
  const dataPoints = useMemo(() => {
    const points = [];
    const today = new Date();
    const history = item.history || {};

    // Define the window and granularity based on scope
    let iterations = 14;
    let labelFormat = 'EEE'; // "Mon"
    
    if (scope === '12W') {
      iterations = 12;
      labelFormat = 'MMM d'; // "Oct 24" (Week Start)
    } else if (scope === '12M') {
      iterations = 12;
      labelFormat = 'MMM'; // "Oct"
    }

    // Determine Max Value for normalization
    // For progress, max is fixed (total). For counters, it's relative.
    let maxValue = item.type === 'progress' ? (item.total || 100) : 1;

    // --- Aggregation Loop ---
    for (let i = iterations - 1; i >= 0; i--) {
      let value = 0;
      let dateLabel = '';
      let isCurrentPeriod = false;
      let dateForKey = new Date();

      if (scope === '14D') {
        const date = subDays(today, i);
        dateForKey = date;
        const dateKey = format(date, 'yyyy-MM-dd');
        value = history[dateKey] || 0;
        dateLabel = i === 0 ? 'Today' : format(date, labelFormat);
        isCurrentPeriod = i === 0;
      } 
      else if (scope === '12W') {
        // Aggregate by Week
        // For current week, we look back from today to start of week? 
        // Or just take the last 12 full weeks? 
        // Let's take current week as index 0.
        const weekStart = startOfWeek(subWeeks(today, i), { weekStartsOn: 1 });
        dateForKey = weekStart;
        dateLabel = format(weekStart, 'MMM d');
        isCurrentPeriod = i === 0;

        // Sum up 7 days
        for (let d = 0; d < 7; d++) {
          const day = subDays(endOfWeek(weekStart, { weekStartsOn: 1 }), d);
          const k = format(day, 'yyyy-MM-dd');
          value += (history[k] || 0);
        }
        // For progress types (e.g. daily water), weekly value might be sum or average?
        // Usually "Total water this week" makes sense.
      } 
      else if (scope === '12M') {
        // Aggregate by Month
        const monthStart = startOfMonth(subMonths(today, i));
        dateForKey = monthStart;
        dateLabel = format(monthStart, 'MMM');
        isCurrentPeriod = i === 0;

        // Sum up all days in month
        // This is expensive but accurate. Optimized: just iterate keys? No, keys are sparse.
        // Iterate days in month is safer.
        const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
           // Construct date: YYYY-MM-DD
           const dStr = `${format(monthStart, 'yyyy-MM')}-${String(d).padStart(2, '0')}`;
           value += (history[dStr] || 0);
        }
      }

      // Dynamic Max Value Adjustment for Counters/Aggregations
      if (item.type === 'counter' || scope !== '14D') {
         if (value > maxValue) maxValue = value;
      }
      
      points.push({
        id: `${scope}-${i}`, // Stable ID for layout animation
        date: dateForKey,
        label: dateLabel,
        value,
        isCurrentPeriod,
      });
    }

    // Normalize
    return points.map(p => {
      // Reserve 10% for "zero" dots
      const rawRatio = maxValue === 0 ? 0 : p.value / maxValue;
      const heightRatio = p.value === 0 ? 0.08 : Math.max(0.15, Math.min(1, rawRatio));
      return { ...p, heightRatio, isZero: p.value === 0 };
    });

  }, [item, scope]);

  return (
    <div className="w-full flex flex-col items-center justify-end h-full min-h-[160px] select-none relative group/container">
      
      {/* Scope Selector (The Time Lens Control) */}
      <div className="absolute top-0 right-0 z-20 opacity-0 group-hover/container:opacity-100 transition-opacity duration-300">
        <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-full p-0.5 shadow-sm border border-zinc-200 dark:border-zinc-700">
          {(['14D', '12W', '12M'] as TimeScope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`
                px-2 py-0.5 text-[10px] font-bold rounded-full transition-all duration-200
                ${scope === s 
                  ? 'bg-white dark:bg-zinc-600 text-zinc-900 dark:text-zinc-100 shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                }
              `}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Interaction Feedback (Floating Tooltip) */}
      <div className="h-8 mb-2 flex items-center justify-center relative z-10">
        <AnimatePresence mode="wait">
          {hoveredIndex !== null ? (
            <motion.div
              key="tooltip"
              initial={{ opacity: 0, y: 5, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 5, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/5 dark:bg-white/10 backdrop-blur-md shadow-sm border border-white/20"
            >
              <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                {dataPoints[hoveredIndex].label}
              </span>
              <div className="w-px h-3 bg-zinc-300 dark:bg-zinc-600" />
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                 {/* For aggregated views, always show raw value. Percentage only makes sense for daily progress limits. */}
                 {scope === '14D' && item.type === 'progress'
                    ? `${Math.round((dataPoints[hoveredIndex].value / (item.total || 1)) * 100)}%`
                    : `${Math.round(dataPoints[hoveredIndex].value * 10) / 10} ${item.unit}`
                 }
              </span>
            </motion.div>
          ) : (
             <motion.div
                key="label"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                exit={{ opacity: 0 }}
                className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-400 dark:text-zinc-500"
             >
                {scope === '14D' ? 'Recent Days' : scope === '12W' ? 'Weekly Trend' : 'Monthly Trend'}
             </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* The Waveform Container */}
      <div 
        className="flex items-end justify-between w-full px-4 gap-1.5 h-32 relative"
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <AnimatePresence mode="popLayout">
            {dataPoints.map((point, index) => (
            <WavePill
                key={point.id}
                point={point}
                index={index}
                totalPoints={dataPoints.length}
                onHover={() => setHoveredIndex(index)}
            />
            ))}
        </AnimatePresence>
        
        {/* Baseline (Subtle) */}
        <div className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-zinc-200 dark:via-zinc-800 to-transparent opacity-50 pointer-events-none" />
      </div>
    </div>
  );
}

interface WavePillProps {
  point: {
    heightRatio: number;
    isZero: boolean;
    isCurrentPeriod: boolean;
  };
  index: number;
  totalPoints: number;
  onHover: () => void;
}

function WavePill({ point, index, totalPoints, onHover }: WavePillProps) {
  return (
    <motion.div
      layout
      className="group relative flex-1 h-full flex items-end justify-center cursor-pointer"
      onMouseEnter={onHover}
      initial={{ opacity: 0, scaleY: 0 }}
      animate={{ opacity: 1, scaleY: 1 }}
      exit={{ opacity: 0, scaleY: 0 }}
      transition={{ 
        type: "spring", 
        stiffness: 400, 
        damping: 30,
        layout: { duration: 0.3 }
      }}
    >
        {/* Hit Area (Invisible) - Larger for easier interaction */}
        <div className="absolute inset-x-0 bottom-0 top-0 z-10" />

        {/* The Light Pillar */}
        <motion.div
            className={`
                w-full rounded-full
                transition-colors duration-300
                ${point.isZero 
                    ? 'bg-zinc-200 dark:bg-zinc-800' 
                    : point.isCurrentPeriod
                        ? 'bg-zinc-900 dark:bg-zinc-100' 
                        : 'bg-zinc-400 dark:bg-zinc-600'
                }
            `}
            // Dynamic Height & Width Animation
            initial={{ height: "8%" }}
            animate={{ 
                height: `${point.heightRatio * 100}%`,
                // Make pillars slightly wider when there are fewer of them (e.g. 12 months)
                maxWidth: totalPoints <= 12 ? 14 : 8,
                minWidth: 4,
                opacity: point.isZero ? 0.3 : (point.isCurrentPeriod ? 1 : 0.7)
            }}
            whileHover={{ 
                scaleY: 1.1,
                opacity: 1,
                backgroundColor: point.isZero 
                    ? 'var(--color-hover-zero)' 
                    : 'var(--color-hover-active)',
            }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            style={{
                // @ts-ignore
                '--color-hover-zero': '#a1a1aa', 
                '--color-hover-active': point.isCurrentPeriod ? '#000' : '#52525b', 
            }}
        >
            {/* Glow Effect for High Values */}
            {!point.isZero && point.heightRatio > 0.8 && (
                <div className="absolute top-0 inset-x-0 h-full bg-white/30 blur-[2px] rounded-full" />
            )}
        </motion.div>
    </motion.div>
  );
}