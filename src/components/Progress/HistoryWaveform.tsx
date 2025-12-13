import { useMemo, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';
import { format, subDays, startOfWeek, endOfWeek, subWeeks, startOfMonth, subMonths } from 'date-fns';
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
 * "Chrono-Rhythm" Visualization - The Masterpiece Edition
 * 
 * Design Philosophy:
 * - Liquid Physics: Pillars react organically to interaction.
 * - Optical Materials: Controls feel like crafted glass/crystal.
 * - Ambient Intelligence: Light and shadow guide the eye.
 */
export function HistoryWaveform({ item }: HistoryWaveformProps) {
  const [scope, setScope] = useState<TimeScope>('14D');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isControlActive, setIsControlActive] = useState(false);
  
  // Mouse position for ambient glow effect
  const mouseX = useMotionValue(0);
  const glowX = useSpring(mouseX, { stiffness: 150, damping: 25 });

  // 1. Data Processing
  const dataPoints = useMemo(() => {
    const points = [];
    const today = new Date();
    const history = item.history || {};

    let iterations = 14;
    let labelFormat = 'EEE'; 
    let aggregationType: 'day' | 'week' | 'month' = 'day';

    switch (scope) {
      case '7D':  iterations = 7;  labelFormat = 'EEE';   aggregationType = 'day'; break;
      case '14D': iterations = 14; labelFormat = 'EEE';   aggregationType = 'day'; break;
      case '30D': iterations = 30; labelFormat = 'd';     aggregationType = 'day'; break;
      case '12W': iterations = 12; labelFormat = 'MMM d'; aggregationType = 'week'; break;
      case '12M': iterations = 12; labelFormat = 'MMM';   aggregationType = 'month'; break;
    }

    let maxValue = item.type === 'progress' ? (item.total || 100) : 1;

    for (let i = iterations - 1; i >= 0; i--) {
      let value = 0;
      let dateLabel = '';
      let isCurrentPeriod = false;
      let dateForKey = new Date();
      let pointId = ''; // Ensure ID is defined for all scopes

      if (aggregationType === 'day') {
        const date = subDays(today, i);
        dateForKey = date;
        const dateKey = format(date, 'yyyy-MM-dd');
        pointId = dateKey; // Use date as ID
        value = history[dateKey] || 0;
        dateLabel = i === 0 ? 'Today' : format(date, labelFormat);
        isCurrentPeriod = i === 0;
      } 
      else if (aggregationType === 'week') {
        const weekStart = startOfWeek(subWeeks(today, i), { weekStartsOn: 1 });
        dateForKey = weekStart;
        pointId = format(weekStart, 'yyyy-MM-dd'); // Use week start date as ID
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
        pointId = format(monthStart, 'yyyy-MM'); // Use month as ID
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
        id: pointId, // Stable ID
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
        className="w-full flex flex-col items-center justify-end h-full min-h-[160px] select-none relative pb-2 overflow-hidden group/chart"
        onMouseLeave={() => setHoveredIndex(null)}
        onMouseMove={(e) => {
            // Normalize mouse X relative to container width for the glow effect
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            mouseX.set(x);
        }}
    >
      
      {/* Ambient Glow (The Soul) */}
      <motion.div 
        className="absolute bottom-0 w-32 h-32 bg-gradient-to-t from-zinc-500/10 to-transparent rounded-full blur-3xl pointer-events-none opacity-0 group-hover/chart:opacity-100 transition-opacity duration-500"
        style={{ x: glowX, translateX: '-50%' }}
      />

      {/* Top Tooltip (Data Context) */}
      <div className="absolute top-0 inset-x-0 h-8 flex items-center justify-center pointer-events-none z-10">
        <AnimatePresence mode="wait">
          {hoveredIndex !== null && dataPoints[hoveredIndex] ? (
            <motion.div
              key="tooltip"
              initial={{ opacity: 0, y: 8, scale: 0.9, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: 8, scale: 0.9, filter: 'blur(4px)' }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="
                flex items-center gap-2.5 px-3 py-1.5 
                rounded-full 
                bg-white/80 dark:bg-zinc-900/80 
                backdrop-blur-xl 
                shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1),0_0_0_1px_rgba(0,0,0,0.05)] 
                dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.1)]
              "
            >
              <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
                {dataPoints[hoveredIndex].label}
              </span>
              <div className="w-px h-2.5 bg-zinc-200 dark:bg-zinc-700" />
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                 {scope.endsWith('D') && item.type === 'progress'
                    ? `${Math.round((dataPoints[hoveredIndex].value / (item.total || 1)) * 100)}%`
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
                className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-300/60 dark:text-zinc-600/60 mix-blend-plus-lighter"
             >
                {SCOPE_CONFIG[scope].full}
             </motion.div>
            )
          )}
        </AnimatePresence>
      </div>

      {/* Waveform Container */}
      <div className="flex items-end justify-between w-full px-4 gap-1.5 h-32 relative z-0 mb-4 perspective-1000">
        <AnimatePresence mode="popLayout">
            {dataPoints.map((point, index) => (
            <WavePill
                key={point.id}
                point={point}
                index={index}
                totalPoints={dataPoints.length}
                hoveredIndex={hoveredIndex}
                onHover={() => setHoveredIndex(index)}
            />
            ))}
        </AnimatePresence>
        
        {/* Baseline (Subtle Glass Edge) */}
        <div className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-zinc-200/50 dark:via-zinc-700/50 to-transparent pointer-events-none" />
      </div>

      {/* The Crystal Control (Bottom Handle) */}
      <div 
        className="absolute bottom-0 left-0 right-0 flex justify-center z-30 h-6 items-end pointer-events-auto cursor-pointer"
        onMouseEnter={() => setIsControlActive(true)}
        onMouseLeave={() => setIsControlActive(false)}
      >
        <motion.div 
            layout
            className={`
                relative flex items-center justify-center mb-2 overflow-hidden
                backdrop-blur-2xl rounded-full 
                ${isControlActive 
                    ? 'bg-white/90 dark:bg-zinc-900/90 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.1)]' 
                    : 'bg-zinc-400/20 dark:bg-white/10'
                }
            `}
            initial={false}
            animate={{
                y: isControlActive ? -4 : 0,
            }}
            style={{
                width: isControlActive ? 'auto' : 32,
                height: isControlActive ? 32 : 4,
                clipPath: 'inset(0 round 9999px)' 
            }}
            transition={{ 
                type: "spring", 
                stiffness: 300, 
                damping: 35, 
                mass: 0.5 
            }}
        >
            <motion.div 
                // Always render content to ensure stable layout calculation for 'width: auto'
                initial={{ opacity: 0, filter: 'blur(4px)' }}
                animate={{ 
                    opacity: isControlActive ? 1 : 0, 
                    filter: isControlActive ? 'blur(0px)' : 'blur(4px)',
                    pointerEvents: isControlActive ? 'auto' : 'none'
                }}
                transition={{ duration: 0.2, delay: isControlActive ? 0.05 : 0 }} 
                className="flex items-center px-1.5 gap-0.5"
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
                                                        rounded-full text-[10px] font-bold tracking-tight
                                                        transition-all duration-300 outline-none
                                                        ${isActive ? 'px-3 py-1.5' : 'px-2 py-1.5'}
                                                    `}
                                                    // Prevent tab focus when hidden
                                                    tabIndex={isControlActive ? 0 : -1} 
                                                >
                                                    {isActive && (
                                                        <motion.div
                                                            layoutId="scopeHighlight"
                                                            className="absolute inset-0 bg-black dark:bg-white rounded-full shadow-sm"
                                                            initial={{ opacity: 0 }}
                                                            animate={{ opacity: 1 }}
                                                            transition={{ 
                                                                type: "spring", 
                                                                bounce: 0,
                                                                duration: 0.2
                                                            }}
                                                        />
                                                    )}
                                                    <span 
                                                        className={`
                                                            relative z-10 transition-colors duration-300
                                                            ${isActive 
                                                                ? 'text-white dark:text-black' 
                                                                : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'
                                                            }
                                                        `}
                                                    >
                                                        {isActive ? SCOPE_CONFIG[s].full : SCOPE_CONFIG[s].tiny}
                                                    </span>
                                                </button>                    );
                })}
            </motion.div>
        </motion.div>
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
  hoveredIndex: number | null;
  onHover: () => void;
}

function WavePill({ point, index, totalPoints, hoveredIndex, onHover }: WavePillProps) {
  // Explicit width calculation for Framer Motion
  const targetMaxWidth = totalPoints > 20 ? 6 : (totalPoints <= 7 ? 16 : 10);
  const targetMinWidth = totalPoints > 20 ? 3 : 4;

  const isHovered = hoveredIndex === index;
  const isAnyHovered = hoveredIndex !== null;
  
  return (
    <motion.div
      layout
      className="group relative flex-1 h-full flex items-end justify-center cursor-pointer"
      onMouseEnter={onHover}
      // Clean, Hydraulic Entry
      initial={{ opacity: 0, scaleY: 0, y: 20 }} 
      animate={{ opacity: 1, scaleY: 1, y: 0 }}
      exit={{ 
          opacity: 0, 
          scaleY: 0, 
          y: 10,
          transition: { duration: 0.15 } 
      }}
      transition={{ 
        // "Liquid Mercury" Physics: Heavy but fluid
        type: "spring", 
        stiffness: 450, 
        damping: 25,     
        mass: 1,
        delay: index * 0.02 // Faster, tighter wave
      }}
    >
        {/* Hit Area */}
        <div className="absolute inset-x-0 bottom-0 top-0 z-10" />

        {/* The Light Pillar */}
        <motion.div
            className={`
                w-full rounded-full backdrop-blur-sm
                transition-colors duration-300
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
                // Complex Opacity Logic for "Focus"
                opacity: isHovered 
                    ? 1 
                    : (isAnyHovered ? 0.3 : (point.isZero ? 0.3 : (point.isCurrentPeriod ? 1 : 0.6))),
                // Color Logic
                backgroundColor: isHovered
                    ? (point.isZero ? '#a1a1aa' : (document.documentElement.classList.contains('dark') ? '#fff' : '#000'))
                    : (point.isZero 
                        ? (document.documentElement.classList.contains('dark') ? '#27272a' : '#e4e4e7') // zinc-800 / zinc-200
                        : (point.isCurrentPeriod 
                            ? (document.documentElement.classList.contains('dark') ? '#fff' : '#000') 
                            : (document.documentElement.classList.contains('dark') ? '#52525b' : '#a1a1aa'))) // zinc-600 / zinc-400
            }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
        >
            {/* Inner Light (Glow) for active pillars */}
            {!point.isZero && point.heightRatio > 0.5 && (
                <div 
                    className={`
                        absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-white/40 to-transparent 
                        rounded-t-full transition-opacity duration-300
                        ${isHovered ? 'opacity-80' : 'opacity-30'}
                    `} 
                />
            )}
        </motion.div>
    </motion.div>
  );
}
