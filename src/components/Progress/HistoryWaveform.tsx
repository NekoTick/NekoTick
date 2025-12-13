import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, subDays, startOfWeek, endOfWeek, subWeeks, startOfMonth, subMonths, isSameDay } from 'date-fns';
import type { ProgressOrCounter } from '../../stores/useProgressStore';

interface HistoryWaveformProps {
  item: ProgressOrCounter;
}

type TimeScope = '7D' | '14D' | '30D' | '12W' | '12M';

const SCOPE_CONFIG: Record<TimeScope, { full: string, tiny: string }> = {
  '7D':  { full: 'Week',    tiny: '7D' },
  '14D': { full: '2 Weeks', tiny: '14' },
  '30D': { full: 'Month',   tiny: '30' },
  '12W': { full: 'Quarter', tiny: '3M' },
  '12M': { full: 'Year',    tiny: '1Y' },
};

/**
 * "Chrono-Rhythm" Visualization
 * A liquid, interactive waveform with a "Phantom Handle" control mechanism.
 */
export function HistoryWaveform({ item }: HistoryWaveformProps) {
  const [scope, setScope] = useState<TimeScope>('14D');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isControlActive, setIsControlActive] = useState(false);

  // 1. Intelligent Data Aggregation
  const dataPoints = useMemo(() => {
    const points = [];
    const today = new Date();
    const history = item.history || {};

    let iterations = 14;
    let labelFormat = 'EEE'; 
    let aggregationType: 'day' | 'week' | 'month' = 'day';

    switch (scope) {
      case '7D':
        iterations = 7;
        labelFormat = 'EEE';
        aggregationType = 'day';
        break;
      case '14D':
        iterations = 14;
        labelFormat = 'EEE';
        aggregationType = 'day';
        break;
      case '30D':
        iterations = 30;
        labelFormat = 'd';
        aggregationType = 'day';
        break;
      case '12W':
        iterations = 12;
        labelFormat = 'MMM d';
        aggregationType = 'week';
        break;
      case '12M':
        iterations = 12;
        labelFormat = 'MMM';
        aggregationType = 'month';
        break;
    }

    let maxValue = item.type === 'progress' ? (item.total || 100) : 1;

    for (let i = iterations - 1; i >= 0; i--) {
      let value = 0;
      let dateLabel = '';
      let isCurrentPeriod = false;
      let dateForKey = new Date();

      if (aggregationType === 'day') {
        const date = subDays(today, i);
        dateForKey = date;
        const dateKey = format(date, 'yyyy-MM-dd');
        value = history[dateKey] || 0;
        if (i === 0) dateLabel = 'Today';
        else dateLabel = format(date, labelFormat);
        isCurrentPeriod = i === 0;
      } 
      else if (aggregationType === 'week') {
        const weekStart = startOfWeek(subWeeks(today, i), { weekStartsOn: 1 });
        dateForKey = weekStart;
        dateLabel = format(weekStart, 'MMM d');
        isCurrentPeriod = i === 0;
        for (let d = 0; d < 7; d++) {
          const day = subDays(endOfWeek(weekStart, { weekStartsOn: 1 }), d);
          const k = format(day, 'yyyy-MM-dd');
          value += (history[k] || 0);
        }
      } 
      else if (aggregationType === 'month') {
        const monthStart = startOfMonth(subMonths(today, i));
        dateForKey = monthStart;
        dateLabel = format(monthStart, 'MMM');
        isCurrentPeriod = i === 0;
        const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
           const dStr = `${format(monthStart, 'yyyy-MM')}-${String(d).padStart(2, '0')}`;
           value += (history[dStr] || 0);
        }
      }

      if (item.type === 'counter' || aggregationType !== 'day') {
         if (value > maxValue) maxValue = value;
      }
      
      points.push({
        id: `${scope}-${i}`,
        date: dateForKey,
        label: dateLabel,
        value,
        isCurrentPeriod,
      });
    }

    return points.map(p => {
      const rawRatio = maxValue === 0 ? 0 : p.value / maxValue;
      const heightRatio = p.value === 0 ? 0.08 : Math.max(0.15, Math.min(1, rawRatio));
      return { ...p, heightRatio, isZero: p.value === 0 };
    });

  }, [item, scope]);

  return (
    <div 
        className="w-full flex flex-col items-center justify-end h-full min-h-[160px] select-none relative pb-2 overflow-hidden" // Reduced min-height slightly
        onMouseLeave={() => setHoveredIndex(null)}
    >
      
      {/* Top Tooltip (Data Context) */}
      <div className="absolute top-0 inset-x-0 h-8 flex items-center justify-center pointer-events-none z-10">
        <AnimatePresence mode="wait">
          {hoveredIndex !== null && dataPoints[hoveredIndex] ? (
            <motion.div
              key="tooltip"
              initial={{ opacity: 0, y: 5, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 5, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/90 dark:bg-white/90 backdrop-blur-md shadow-lg border border-white/10 dark:border-zinc-800"
            >
              <span className="text-xs font-semibold text-zinc-300 dark:text-zinc-600 uppercase tracking-wider">
                {dataPoints[hoveredIndex].label}
              </span>
              <div className="w-px h-3 bg-zinc-600 dark:bg-zinc-400" />
              <span className="text-sm font-bold text-white dark:text-zinc-900 tabular-nums">
                 {scope === '7D' || scope === '14D' || scope === '30D'
                    ? (item.type === 'progress' 
                        ? `${Math.round((dataPoints[hoveredIndex].value / (item.total || 1)) * 100)}%`
                        : `${dataPoints[hoveredIndex].value} ${item.unit}`)
                    : `${Math.round(dataPoints[hoveredIndex].value * 10) / 10} ${item.unit}`
                 }
              </span>
            </motion.div>
          ) : (
            !isControlActive && (
             <motion.div
                key="label"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-300/50 dark:text-zinc-500/50"
             >
                {SCOPE_CONFIG[scope].full}
             </motion.div>
            )
          )}
        </AnimatePresence>
      </div>

      {/* Waveform Container */}
      <div className="flex items-end justify-between w-full px-4 gap-1.5 h-32 relative z-0 mb-4"> {/* Added mb-4 for safety space */}
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
        
        {/* Baseline */}
        <div className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-zinc-200 dark:via-zinc-800 to-transparent opacity-50 pointer-events-none" />
      </div>

      {/* The Phantom Handle / Time Capsule */}
      {/* Moved position to bottom-2 (8px from bottom) to avoid edge clipping */}
      <div 
        className="absolute bottom-0 left-0 right-0 flex justify-center z-20 h-12 items-end pointer-events-auto cursor-pointer"
        onMouseEnter={() => setIsControlActive(true)}
        onMouseLeave={() => setIsControlActive(false)}
      >
        <motion.div 
            layout
            className={`
                relative flex items-center justify-center pointer-events-auto mb-2
                bg-white/90 dark:bg-zinc-800/90 backdrop-blur-md 
                shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)] 
                border border-zinc-200/50 dark:border-zinc-700/50
                overflow-hidden
            `}
            initial={false}
            animate={{
                width: isControlActive ? 'auto' : 40,
                height: isControlActive ? 28 : 4,
                borderRadius: isControlActive ? 9999 : 2,
                opacity: isControlActive ? 1 : 0.4,
                y: isControlActive ? -4 : 0, // Levitate UP when active
            }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
        >
            <AnimatePresence>
                {isControlActive && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.1 } }}
                        className="flex items-center px-1"
                    >
                        {(Object.keys(SCOPE_CONFIG) as TimeScope[]).map((s) => {
                            const isActive = scope === s;
                            return (
                                <button
                                    key={s}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setScope(s);
                                    }}
                                    className={`
                                        relative flex items-center justify-center
                                        rounded-full text-[9px] font-medium 
                                        transition-all duration-300 outline-none
                                        ${isActive ? 'px-3 py-1' : 'px-2 py-1'}
                                    `}
                                    style={{
                                        color: isActive 
                                            ? 'var(--text-active)' 
                                            : 'var(--text-inactive)'
                                    }}
                                >
                                    {isActive && (
                                        <motion.div
                                            layoutId="scopeHighlight"
                                            className="absolute inset-0 bg-zinc-900 dark:bg-zinc-100 rounded-full shadow-sm"
                                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                        />
                                    )}
                                    <span className="relative z-10 mix-blend-exclusion dark:mix-blend-normal dark:text-zinc-900 whitespace-nowrap">
                                        {isActive ? SCOPE_CONFIG[s].full : SCOPE_CONFIG[s].tiny}
                                    </span>
                                </button>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
      </div>

      <style>{`
        :root {
            --text-active: #fff;
            --text-inactive: #71717a;
        }
        .dark {
            --text-active: #000;
            --text-inactive: #a1a1aa;
        }
      `}</style>
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
  // Calculate target widths explicitly to avoid animating from "auto"
  const targetMaxWidth = totalPoints > 20 ? 6 : (totalPoints <= 7 ? 16 : 10);
  const targetMinWidth = totalPoints > 20 ? 3 : 4;

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
        {/* Hit Area */}
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
            initial={{ 
                height: "8%",
                maxWidth: targetMaxWidth,
                minWidth: targetMinWidth 
            }}
            animate={{ 
                height: `${point.heightRatio * 100}%`,
                maxWidth: targetMaxWidth,
                minWidth: targetMinWidth,
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
            {!point.isZero && point.heightRatio > 0.8 && (
                <div className="absolute top-0 inset-x-0 h-full bg-white/30 blur-[2px] rounded-full" />
            )}
        </motion.div>
    </motion.div>
  );
}