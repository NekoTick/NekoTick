import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, Check, ArrowsClockwise } from '@phosphor-icons/react';
import { getIconByName } from '../IconPicker';
import { ItemCardProps } from './types';
import { ProgressBar, CounterEffects, Ripple } from './VisualEffects';

export function ActiveItemCard({ item, onUpdate, onClick, onAutoArchive, isDragging, previewIcon, previewTitle }: ItemCardProps) {
  const displayIcon = previewIcon !== undefined ? previewIcon : item.icon;
  const displayTitle = previewTitle !== undefined ? previewTitle : item.title;

  const step = item.type === 'progress'
    ? (item.direction === 'increment' ? item.step : -item.step)
    : item.step;

  const percentage = item.type === 'progress' 
    ? Math.min(100, Math.max(0, (item.current / item.total) * 100))
    : 0;
  
  const fillWidth = item.type === 'progress' ? `${percentage}%` : '0%';
  
  const [hoverZone, setHoverZone] = useState<'left' | 'right' | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const prevCurrent = useRef(item.current);

  // Counter Specific State
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [implosions, setImplosions] = useState<Ripple[]>([]);
  const rippleCount = useRef(0);

  const triggerRipple = (x: number, y: number) => {
    const id = rippleCount.current++;
    setRipples(prev => [...prev, { id, x, y }]);
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id));
    }, 1500);
  };

  const triggerImplosion = (x: number, y: number) => {
    const id = rippleCount.current++;
    setImplosions(prev => [...prev, { id, x, y }]);
    setTimeout(() => {
      setImplosions(prev => prev.filter(r => r.id !== id));
    }, 1000);
  };

  const getEnergyCorePosition = (element: HTMLElement) => {
    const card = element.closest('.group') as HTMLElement | null;
    if (card) {
      return { x: card.offsetWidth * 0.5, y: card.offsetHeight * 0.5 };
    }
    return { x: 250, y: 64 };
  };

  // Auto-archive logic (Only for Progress)
  useEffect(() => {
    if (item.type !== 'progress' || item.archived) return;
    
    // Check completion
    const isDone = item.current >= item.total;
    const wasDone = prevCurrent.current >= item.total;
    
    if (isDone && !wasDone) {
      setIsCompleting(true);
      const timer = setTimeout(() => {
        if (onAutoArchive) {
          onAutoArchive(item.id);
        }
      }, 1200);
      return () => clearTimeout(timer);
    } else {
      setIsCompleting(false);
    }
    
    prevCurrent.current = item.current;
  }, [item.current, item.type === 'progress' ? item.total : 0, item.type, item.archived, onAutoArchive, item.id]);

  return (
    <motion.div
      layout
      initial={false}
      animate={isDragging ? { scale: 1.05, y: -5, zIndex: 50 } : { scale: 1, y: 0, zIndex: 0 }}
      whileHover={{ scale: 1.01, y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 850, damping: 35, mass: 0.5 }}
      className={`
        group relative overflow-hidden rounded-[2.5rem]
        bg-white dark:bg-zinc-900 
        h-32 select-none
        shadow-[0_10px_40px_-10px_rgba(0,0,0,0.05)] dark:shadow-none
        border border-white/50 dark:border-white/5
        hover:shadow-[0_20px_60px_-10px_rgba(0,0,0,0.1)] dark:hover:shadow-black/50
      `}
    >
      {/* Shimmer Effect (Progress Only) */}
      <AnimatePresence>
        {isCompleting && item.type === 'progress' && (
          <motion.div
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: '200%', opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="absolute inset-0 z-10 pointer-events-none bg-gradient-to-r from-transparent via-white/60 dark:via-white/20 to-transparent -skew-x-12"
          />
        )}
      </AnimatePresence>

      {/* Base Layer */}
      <motion.div 
        className="absolute inset-0 bg-white dark:bg-zinc-900"
        animate={{ 
          backgroundColor: isCompleting ? 'var(--card-complete-bg)' : 'var(--card-bg)'
        }}
        style={{
          // @ts-ignore
          '--card-bg': '#ffffff',
          '--card-complete-bg': '#18181b',
        }}
      />
      
      {/* VISUALS: PROGRESS VS COUNTER */}
      {item.type === 'progress' ? (
         <ProgressBar fillWidth={fillWidth} isCompleting={isCompleting} />
      ) : (
         <CounterEffects ripples={ripples} implosions={implosions} />
      )}
      
      {/* Delicate Border (Ring) */}
      <div className={`absolute inset-0 rounded-[2.5rem] ring-1 ring-inset pointer-events-none transition-colors duration-300 ${isCompleting ? 'ring-transparent' : 'ring-black/5 dark:ring-white/5'}`} />

      {/* Content Layer */}
      <div className="absolute inset-0 flex items-center justify-between px-10 pointer-events-none z-20 overflow-hidden">
        
        {/* Left Group: Title & Icon */}
        <motion.div 
          className="relative flex items-center h-full min-w-0 flex-1 pl-0"
          animate={{ 
            x: isCompleting ? '50%' : (hoverZone === 'left' ? 48 : 0), 
            opacity: hoverZone === 'left' ? 0.6 : 1 
          }}
          transition={{ type: "spring", stiffness: 850, damping: 35, mass: 0.5 }}
        >
          <motion.div 
            className="relative flex items-center w-full h-full gap-4"
            animate={{ x: isCompleting ? '-50%' : '0%' }}
          >
              {/* Layer 0: Icon (Flex Item) */}
              {(() => {
                const Icon = displayIcon ? getIconByName(displayIcon) : null;
                return (
                  <motion.div 
                      className="flex-shrink-0 flex items-center justify-center w-16"
                      animate={{
                          x: isCompleting ? 0 : 0,
                      }}
                  >
                      {Icon ? (
                          <div className={`
                              transition-all duration-700 ease-out
                              ${isCompleting 
                                  ? 'text-zinc-500 dark:text-zinc-400 opacity-100 scale-100' 
                                  : 'text-zinc-900 dark:text-zinc-100 opacity-[0.06] dark:opacity-[0.08] scale-[2.5] -rotate-12 mix-blend-multiply dark:mix-blend-overlay origin-center'
                              }
                              ${item.type === 'counter' ? 'opacity-[0.04] dark:opacity-[0.06]' : ''}
                          `}>
                              <Icon className="size-10" weight="duotone" />
                          </div>
                      ) : (
                          <div className="w-16" /> 
                      )}
                  </motion.div>
                );
              })()}

              {/* Layer 1: Text (Flex Item) */}
              <motion.div 
                  className="flex flex-col justify-center min-w-0 gap-1.5 relative z-10"
                  animate={{
                      alignItems: isCompleting ? 'center' : 'flex-start',
                      width: '100%'
                  }}
              >
                <span className={`text-2xl font-light tracking-wide truncate leading-none transition-colors duration-300 ${isCompleting ? 'text-white dark:text-zinc-900 mt-16' : 'text-zinc-900 dark:text-zinc-100'}`}>
                  {displayTitle}
                </span>
                
                {/* Stats */}
                <motion.div 
                  animate={{ opacity: isCompleting ? 0 : 1, height: isCompleting ? 0 : 'auto' }}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] overflow-hidden"
                >
                  {/* Reset Indicator (The Loop) */}
                  {item.resetFrequency === 'daily' && (
                      <ArrowsClockwise weight="bold" className="size-3 text-zinc-300 dark:text-zinc-600" />
                  )}
                  
                  <span className={item.todayCount > 0 ? "text-zinc-600 dark:text-zinc-300" : ""}>
                    {item.type === 'counter' ? (
                        item.todayCount > 0 ? `Today ${item.todayCount}` : "Tap to Count"
                    ) : (
                        `Today ${item.todayCount}`
                    )}
                  </span>
                </motion.div>
              </motion.div>
          </motion.div>
        </motion.div>

        {/* Right Group: Number */}
        <motion.div 
          className="flex flex-col items-end justify-center pl-6 h-full absolute right-10"
          animate={{ 
              right: isCompleting ? '50%' : '40px',
              x: isCompleting ? '50%' : 0 
          }}
          transition={{ type: "spring", stiffness: 850, damping: 35, mass: 0.5 }}
        >
           <AnimatePresence mode="wait">
             {isCompleting ? (
               <motion.div 
                 key="completed-check"
                 initial={{ scale: 0, rotate: -180 }}
                 animate={{ scale: 1, rotate: 0 }}
                 exit={{ scale: 0 }}
                 transition={{ type: "spring", stiffness: 850, damping: 35, mass: 0.5 }}
                 className="flex items-center justify-center"
               >
                  <div className="p-4 rounded-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-[0_0_40px_rgba(255,255,255,0.6)] dark:shadow-[0_0_40px_rgba(255,255,255,0.1)]">
                    <Check className="size-8" weight="bold" />
                  </div>
               </motion.div>
             ) : (
               <motion.div 
                 key="progress-number"
                 className="flex items-baseline gap-2 relative"
                 animate={{ 
                    x: hoverZone === 'right' ? -48 : 0,
                    opacity: hoverZone === 'right' ? 0.6 : 1,
                    scale: item.type === 'counter' && item.current !== prevCurrent.current 
                      ? (item.current > prevCurrent.current ? [1, 1.15, 1] : [1, 0.85, 1])
                      : 1 
                 }}
                 transition={{ 
                    type: "spring", stiffness: 850, damping: 35, mass: 0.5,
                    scale: { duration: 0.15 } 
                 }}
                 exit={{ opacity: 0, scale: 0.8 }}
               >
                  <span className="text-5xl font-extralight tracking-tighter text-zinc-900 dark:text-zinc-50 font-sans tabular-nums relative z-10">
                    {item.type === 'progress' 
                      ? Math.round((item.current / item.total) * 100)
                      : item.current
                    }
                  </span>

                  <span className="text-sm font-bold tracking-widest text-zinc-300 dark:text-zinc-600 mb-2 uppercase">
                    {item.type === 'progress' ? '%' : item.unit}
                  </span>
               </motion.div>
             )}
           </AnimatePresence>
        </motion.div>
      </div>

      {/* Interaction Layer */}
      <div className="absolute inset-0 flex cursor-pointer">
        {/* Minus Zone */}
        <div 
          className="w-[30%] flex items-center justify-start pl-8 opacity-0 hover:opacity-100 transition-opacity duration-300"
          onClick={(e) => {
            e.stopPropagation();
            onUpdate(item.id, -step);
            if (item.type === 'counter') {
               const { x, y } = getEnergyCorePosition(e.currentTarget);
               triggerImplosion(x, y); 
            }
          }}
          onMouseEnter={() => setHoverZone('left')}
          onMouseLeave={() => setHoverZone(null)}
        >
          <motion.div
            initial={{ x: -20, opacity: 0, scale: 0.8 }}
            animate={hoverZone === 'left' ? { x: 0, opacity: 1, scale: 1 } : { x: -20, opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 850, damping: 35, mass: 0.5 }}
            className="text-zinc-300 dark:text-zinc-600"
          >
            <Minus className="size-8" weight="light" />
          </motion.div>
        </div>

        {/* Center Detail Zone */}
        <div 
           className="flex-1"
           onClick={() => {
               onClick && onClick();
           }}
        />
        
        {/* Plus Zone */}
        <div 
          className="w-[30%] flex items-center justify-end pr-8 opacity-0 hover:opacity-100 transition-opacity duration-300"
          onClick={(e) => {
            e.stopPropagation();
            onUpdate(item.id, step);
            if (item.type === 'counter') {
               const { x, y } = getEnergyCorePosition(e.currentTarget);
               triggerRipple(x, y); 
            }
          }}
          onMouseEnter={() => setHoverZone('right')}
          onMouseLeave={() => setHoverZone(null)}
        >
          <motion.div
            initial={{ x: 20, opacity: 0, scale: 0.8 }}
            animate={hoverZone === 'right' ? { x: 0, opacity: 1, scale: 1 } : { x: 20, opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 850, damping: 35, mass: 0.5 }}
            className="text-zinc-300 dark:text-zinc-600"
          >
            <Plus className="size-8" weight="light" />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
