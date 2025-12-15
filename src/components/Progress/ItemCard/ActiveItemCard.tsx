import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion'; // 移除 AnimatePresence
import { Plus, Minus, ArrowsClockwise } from '@phosphor-icons/react';
import { getIconByName } from '../IconPicker';
import { ItemCardProps } from './types';
import { ProgressBar, CounterEffects, Ripple, DebrisField } from './VisualEffects';
import { KineticAction } from './KineticAction';

export function ActiveItemCard({ item, onUpdate, onClick, onAutoArchive, isDragging, previewIcon, previewTitle }: ItemCardProps) {
  // Safe total access for TS - Moved to top
  const safeTotal = (item as any).total || 0;

  const displayIcon = previewIcon !== undefined ? previewIcon : item.icon;
  const displayTitle = previewTitle !== undefined ? previewTitle : item.title;

  const step = item.type === 'progress'
    ? (item.direction === 'increment' ? item.step : -item.step)
    : item.step; 

  const isDone = item.type === 'progress' && item.current >= safeTotal;

  const percentage = item.type === 'progress' 
    ? Math.min(100, Math.max(0, (item.current / safeTotal) * 100))
    : 0;
  
  const fillWidth = item.type === 'progress' ? `${percentage}%` : '0%';
  
  const [hoverZone, setHoverZone] = useState<'left' | 'right' | null>(null);
  const [isShattering, setIsShattering] = useState(false);
  const prevCurrent = useRef(item.current);
  const pendingArchiveRef = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

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

  const triggerCenterEffect = (type: 'ripple' | 'implosion') => {
      if (!cardRef.current) return;
      const centerX = cardRef.current.offsetWidth / 2;
      const centerY = cardRef.current.offsetHeight / 2;
      if (type === 'ripple') triggerRipple(centerX, centerY);
      else triggerImplosion(centerX, centerY);
  };

  // Immediate Shatter Sequence
  useEffect(() => {
    if (item.type !== 'progress' || item.archived) return; 
    
    const justFinished = item.current >= safeTotal && prevCurrent.current < safeTotal;
    
    if (justFinished) {
      setIsShattering(true);
      pendingArchiveRef.current = true;
      
      const archiveTimer = setTimeout(() => {
        if (onAutoArchive) {
          onAutoArchive(item.id);
          pendingArchiveRef.current = false;
        }
      }, 400); 
      
      return () => clearTimeout(archiveTimer);

    } else if (item.current < safeTotal) {
      setIsShattering(false);
      pendingArchiveRef.current = false;
    }
    
    prevCurrent.current = item.current;
  }, [item.current, safeTotal, item.type, item.archived, onAutoArchive, item.id]);

  return (
    <motion.div
      ref={cardRef}
      initial={false}
      animate={isDragging 
        ? { scale: 1.08, y: -5, zIndex: 50 } 
        : { scale: 1, y: 0, zIndex: 0 }
      }
      whileHover={{ scale: 1.01, y: -2 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      style={{ 
        transition: isDragging ? 'none' : undefined,
        willChange: 'transform' 
      }}
      className={`
        group relative overflow-visible rounded-[2.5rem]
        h-32 select-none cursor-grab active:cursor-grabbing
        ${isShattering ? '' : isDragging 
            ? 'bg-white dark:bg-zinc-900 border border-white/50 dark:border-white/5 shadow-2xl' 
            : 'bg-white dark:bg-zinc-900 border border-white/50 dark:border-white/5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.05)] dark:shadow-none hover:shadow-[0_20px_60px_-10px_rgba(0,0,0,0.1)] dark:hover:shadow-black/50 transition-shadow duration-500'
        }
      `}
    >
      {isShattering && <DebrisField />}

      <motion.div
        className="absolute inset-0 overflow-hidden rounded-[2.5rem]"
        style={{ opacity: isShattering ? 0 : 1 }}
        transition={{ duration: 0 }} 
      >
          {item.type === 'progress' && !isDone && (
             <ProgressBar fillWidth={fillWidth} />
          )}
          
          {item.type === 'counter' && (
             <CounterEffects ripples={ripples} implosions={implosions} />
          )}
          
          <div className="absolute inset-0 rounded-[2.5rem] ring-1 ring-inset pointer-events-none ring-black/5 dark:ring-white/5" />

          <div className="absolute inset-0 flex items-center justify-between px-10 pointer-events-none z-20 overflow-hidden">
            
            <motion.div 
              className="relative flex items-center h-full min-w-0 flex-1 pl-0"
              animate={{ 
                x: hoverZone === 'left' ? 48 : 0, 
                opacity: hoverZone === 'left' ? 0.6 : 1 
              }}
            >
              <motion.div className="relative flex items-center w-full h-full gap-5">
                  {(() => {
                    const Icon = displayIcon ? getIconByName(displayIcon) : null;
                    return (
                      <motion.div className="flex-shrink-0 flex items-center justify-center w-16">
                          {Icon ? (
                              <div className="text-zinc-900 dark:text-zinc-100 opacity-[0.06] dark:opacity-[0.08] scale-[2.5] -rotate-12 mix-blend-multiply dark:mix-blend-overlay origin-center">
                                  <Icon className="size-10" weight="duotone" />
                              </div>
                          ) : (
                              <div className="w-16" /> 
                          )}
                      </motion.div>
                    );
                  })()}

                  <div className="flex flex-col justify-center min-w-0 gap-1 relative z-10 w-full">
                    <span className="text-2xl font-light tracking-wide truncate leading-none text-zinc-900 dark:text-zinc-100">
                      {displayTitle}
                    </span>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] overflow-hidden text-zinc-400 dark:text-zinc-500">
                      {item.resetFrequency === 'daily' && (
                          <ArrowsClockwise weight="bold" className="size-3 opacity-70" />
                      )}
                      <span>
                        {item.todayCount > 0 ? `Today ${item.todayCount}` : "Tap to Start"}
                      </span>
                    </div>
                  </div>
              </motion.div>
            </motion.div>

            <motion.div 
              className="flex flex-col items-end justify-center pl-6 h-full absolute right-10"
              animate={{ 
                  x: hoverZone === 'right' ? -48 : 0, 
                  opacity: hoverZone === 'right' ? 0.6 : 1
              }}
            >
               <motion.div 
                 key="progress-number"
                 className="flex items-baseline gap-2 relative transition-transform duration-300 origin-right"
                 animate={{ 
                    scale: item.type === 'counter' && item.current !== prevCurrent.current 
                      ? (item.current > prevCurrent.current ? [1, 1.1, 1] : [1, 0.9, 1])
                      : 1 
                 }}
               >
                  <span className="text-5xl font-extralight tracking-tighter text-zinc-900 dark:text-zinc-50 font-sans tabular-nums">
                    {item.type === 'progress' 
                      ? Math.round((item.current / item.total) * 100)
                      : item.current
                    }
                  </span>
                  <span className="text-sm font-bold tracking-widest text-zinc-300 dark:text-zinc-600 mb-2 uppercase">
                    {item.type === 'progress' ? '%' : item.unit}
                  </span>
               </motion.div>
            </motion.div>
          </div>

          <KineticAction 
            icon={Minus}
            step={Math.abs(item.step)}
            direction="left"
            isActive={hoverZone === 'left'}
            itemType={item.type}
            total={safeTotal}
            current={item.current}
            onHoverStart={() => setHoverZone('left')}
            onHoverEnd={() => setHoverZone(null)}
            onTrigger={() => {
                onUpdate(item.id, -step);
                if (item.type === 'counter') triggerCenterEffect('implosion');
            }}
            onCommit={(delta) => {
                const finalDelta = -delta;
                const dir = item.type === 'progress' ? item.direction : 'increment';
                const scaledDelta = dir === 'increment' ? finalDelta : -finalDelta;
                onUpdate(item.id, scaledDelta);
                if (item.type === 'counter') triggerCenterEffect('implosion');
            }}
          />
          
          <div 
               className="absolute inset-y-0 left-[30%] right-[30%] cursor-pointer z-30"
               onClick={(e) => {
                   e.stopPropagation();
                   onClick && onClick();
               }}
          />

          <KineticAction 
            icon={Plus}
            step={Math.abs(item.step)}
            direction="right"
            isActive={hoverZone === 'right'}
            itemType={item.type}
            total={safeTotal}
            current={item.current}
            onHoverStart={() => setHoverZone('right')}
            onHoverEnd={() => setHoverZone(null)}
            onTrigger={() => {
                onUpdate(item.id, step);
                if (item.type === 'counter') triggerCenterEffect('ripple');
            }}
            onCommit={(delta) => {
                const finalDelta = delta;
                const dir = item.type === 'progress' ? item.direction : 'increment';
                const scaledDelta = dir === 'increment' ? finalDelta : -finalDelta;
                onUpdate(item.id, scaledDelta);
                if (item.type === 'counter') triggerCenterEffect('ripple');
            }}
          />
      </motion.div>

    </motion.div>
  );
}