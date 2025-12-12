import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, subDays } from 'date-fns';
import type { ProgressOrCounter } from '../../stores/useProgressStore';

interface HistoryWaveformProps {
  item: ProgressOrCounter;
  days?: number; // Default to 14 days for a balanced look
}

/**
 * "Chrono-Rhythm" Visualization
 * A liquid, interactive waveform representing the user's history.
 */
export function HistoryWaveform({ item, days = 10 }: HistoryWaveformProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // 1. Compute Data Points (The Timeline)
  const dataPoints = useMemo(() => {
    const points = [];
    const today = new Date();
    const history = item.history || {};

    // Find the max value in this window to normalize heights
    let maxValue = 1; // Avoid divide by zero, min 1
    if (item.type === 'progress') {
      maxValue = item.total || 100;
    } else {
      // For counters, find the local max in the visible range
      for (let i = 0; i < days; i++) {
        const date = subDays(today, i);
        const dateKey = format(date, 'yyyy-MM-dd');
        const val = history[dateKey] || 0;
        if (val > maxValue) maxValue = val;
      }
    }

    // Generate points in reverse (past -> today) so index 0 is oldest? 
    // No, let's render Left->Right as Oldest->Newest.
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(today, i);
      const dateKey = format(date, 'yyyy-MM-dd');
      const value = history[dateKey] || 0;
      
      // Normalize height (0.1 to 1.0)
      // We reserve 10% height for the "zero" state dots
      const rawRatio = value / maxValue;
      const heightRatio = value === 0 ? 0.08 : Math.max(0.15, Math.min(1, rawRatio));
      
      points.push({
        date,
        dateLabel: format(date, 'MMM d'), // e.g. "Oct 24"
        dayLabel: i === 0 ? 'Today' : format(date, 'EEE'), // "Today" or "Mon"
        value,
        heightRatio,
        isZero: value === 0,
        isToday: i === 0,
        isFuture: false, // For now we only show up to today
      });
    }
    return points;
  }, [item, days]);

  return (
    <div className="w-full flex flex-col items-center justify-end h-full min-h-[140px] select-none">
      
      {/* Interaction Feedback (Floating Tooltip) */}
      <div className="h-8 mb-4 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {hoveredIndex !== null ? (
            <motion.div
              key="tooltip"
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/5 dark:bg-white/10 backdrop-blur-md"
            >
              <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                {dataPoints[hoveredIndex].dayLabel}
              </span>
              <div className="w-px h-3 bg-zinc-300 dark:bg-zinc-600" />
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                {item.type === 'progress' 
                    ? `${Math.round((dataPoints[hoveredIndex].value / (item.total || 1)) * 100)}%`
                    : `${dataPoints[hoveredIndex].value} ${item.unit}`
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
                Last {days} Days
             </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* The Waveform Container */}
      <div 
        className="flex items-end justify-between w-full px-4 gap-2 h-32 relative"
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {dataPoints.map((point, index) => (
          <WavePill
            key={point.date.toISOString()}
            point={point}
            index={index}
            onHover={() => setHoveredIndex(index)}
          />
        ))}
        
        {/* Baseline (Subtle) */}
        <div className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-zinc-200 dark:via-zinc-800 to-transparent opacity-50" />
      </div>
    </div>
  );
}

interface WavePillProps {
  point: {
    date: Date;
    heightRatio: number;
    isZero: boolean;
    isToday: boolean;
  };
  index: number;
  onHover: () => void;
}

function WavePill({ point, index, onHover }: WavePillProps) {
  return (
    <motion.div
      className="group relative flex-1 h-full flex items-end justify-center cursor-pointer"
      onMouseEnter={onHover}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        type: "spring", 
        stiffness: 400, 
        damping: 40, 
        delay: index * 0.03 // Stagger effect
      }}
    >
        {/* Hit Area (Invisible) - Larger for easier interaction */}
        <div className="absolute inset-x-0 bottom-0 top-0 z-10" />

        {/* The Light Pillar */}
        <motion.div
            className={`
                w-full max-w-[12px] min-w-[4px] rounded-full
                transition-colors duration-300
                ${point.isZero 
                    ? 'bg-zinc-200 dark:bg-zinc-800' // Dormant state
                    : point.isToday
                        ? 'bg-zinc-900 dark:bg-zinc-100' // Today (Active)
                        : 'bg-zinc-400 dark:bg-zinc-600' // Past (History)
                }
            `}
            // Dynamic Height Animation
            initial={{ height: "8%" }}
            animate={{ 
                height: `${point.heightRatio * 100}%`,
                opacity: point.isZero ? 0.3 : (point.isToday ? 1 : 0.7)
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
                // CSS Variables for cleaner hover logic
                // @ts-ignore
                '--color-hover-zero': '#a1a1aa', // zinc-400
                '--color-hover-active': point.isToday ? '#000' : '#52525b', // darker in light mode
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
