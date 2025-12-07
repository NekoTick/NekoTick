import { useSortable, defaultAnimateLayoutChanges, type AnimateLayoutChanges } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Minus, Check } from 'lucide-react';
import type { ProgressOrCounter } from '@/stores/useProgressStore';
import { getIconByName } from './IconPicker';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';

// Disable drop animation to prevent "snap back" effect
const animateLayoutChanges: AnimateLayoutChanges = (args) => {
  const { isSorting, wasDragging } = args;
  if (isSorting || wasDragging) {
    return false;
  }
  return defaultAnimateLayoutChanges(args);
};

interface ItemCardProps {
  item: ProgressOrCounter;
  onUpdate: (id: string, delta: number) => void;
  onClick?: () => void;
  onAutoArchive?: (id: string) => void;
  isDragging?: boolean;
  previewIcon?: string;
  previewTitle?: string;
}

/**
 * "Liquid Light" Design - High End, Minimalist, Fluid
 */
export function ItemCard({ item, onUpdate, onClick, onAutoArchive, isDragging, previewIcon, previewTitle }: ItemCardProps) {
  const displayIcon = previewIcon !== undefined ? previewIcon : item.icon;
  const displayTitle = previewTitle !== undefined ? previewTitle : item.title;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: item.id,
    animateLayoutChanges,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const step = item.type === 'progress'
    ? (item.direction === 'increment' ? item.step : -item.step)
    : item.step;

  const percentage = item.type === 'progress' 
    ? Math.min(100, Math.max(0, (item.current / item.total) * 100))
    : 0;
  
  // Counter fill based on activity (subtle feedback)
  const counterFill = item.type === 'counter'
    ? Math.min(100, (item.todayCount / 8) * 100) // Assuming 8 is a loose "daily goal" for visualization
    : 0;

  const fillWidth = item.type === 'progress' ? `${percentage}%` : `${counterFill}%`;
  const [hoverZone, setHoverZone] = useState<'left' | 'right' | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const prevCurrent = useRef(item.current); // Track previous value to prevent "mount animation"

  // If archived, render the "Timeline Ticket" view
  if (item.archived) {
    const startDate = new Date(item.createdAt);
    const endDate = item.lastUpdateDate ? new Date(item.lastUpdateDate) : new Date();
    const durationMs = endDate.getTime() - startDate.getTime();
    const durationDays = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60 * 24)));
    
    const formatDate = (date: Date) => date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });

    return (
      <div ref={setNodeRef} style={style} className="relative group mb-4">
        <motion.div
          layout
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={onClick}
          className="
            relative overflow-hidden rounded-[2rem]
            bg-white dark:bg-zinc-900/80
            shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none
            backdrop-blur-xl
            h-28 select-none cursor-pointer
            grid grid-cols-[1.5fr_2.5fr] gap-8 items-center px-10
            transition-all duration-500
            hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] 
            hover:bg-white/80 dark:hover:bg-zinc-900
            group-hover:-translate-y-1
          "
        >
           {/* Zone 1: Identity & Result */}
           <div className="flex items-center gap-6 min-w-0 pr-6 border-r border-zinc-100/50 dark:border-zinc-800/50">
              {displayIcon ? (() => {
                const Icon = getIconByName(displayIcon);
                return Icon ? (
                  <div className="text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors duration-500">
                    <Icon className="size-10" strokeWidth={1} />
                  </div>
                ) : null;
              })() : (
                 <div className="size-10 rounded-full border border-zinc-200 dark:border-zinc-800 group-hover:border-zinc-400 transition-colors" />
              )}
              
              <div className="flex flex-col justify-center min-w-0 gap-1">
                <span className="text-xl font-medium text-zinc-900 dark:text-zinc-100 truncate tracking-wide group-hover:text-black transition-colors">
                  {displayTitle}
                </span>
                <div className="flex items-center gap-3 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-300 dark:text-zinc-600">
                  <span>Final</span>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {item.type === 'progress' ? `${item.current}/${(item as any).total}` : item.current}
                  </span>
                </div>
              </div>
           </div>

           {/* Zone 2: The Timeline Journey */}
           <div className="flex flex-col justify-center gap-3 w-full max-w-md justify-self-end">
              {/* Labels */}
              <div className="flex justify-between text-[9px] font-bold tracking-[0.2em] text-zinc-300 dark:text-zinc-700 uppercase px-1 opacity-60">
                 <span>Started</span>
                 <span>Ended</span>
              </div>

              {/* Visual Timeline */}
              <div className="flex items-center gap-6 text-zinc-400 dark:text-zinc-500">
                 <span className="text-xs font-medium tabular-nums tracking-wider opacity-80">
                    {formatDate(startDate)}
                 </span>
                 
                 {/* The Path */}
                 <div className="flex-1 h-[2px] bg-zinc-100 dark:bg-zinc-800 relative rounded-full overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-zinc-200 via-zinc-400 to-zinc-200 dark:from-zinc-800 dark:via-zinc-600 dark:to-zinc-800 opacity-50" />
                 </div>

                 <span className="text-xs font-medium tabular-nums tracking-wider text-zinc-900 dark:text-zinc-100">
                    {formatDate(endDate)}
                 </span>
              </div>
              
              <div className="text-center">
                 <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-300 dark:text-zinc-700">
                    {durationDays} Days Journey
                 </span>
              </div>
           </div>
        </motion.div>
      </div>
    );
  }

  // Auto-archive logic
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (item.type !== 'progress' || item.archived) return;
    
    // Check completion
    const isDone = item.current >= item.total;
    const wasDone = prevCurrent.current >= item.total;
    
    if (isDone && !wasDone) {
      // Just completed -> Play Animation & Schedule Archive
      setIsCompleting(true);
      const timer = setTimeout(() => {
        if (onAutoArchive) {
          onAutoArchive(item.id);
        }
      }, 1200); // 1.2s moment of satisfaction
      return () => clearTimeout(timer);
    } else {
      setIsCompleting(false);
    }
    
    // Update ref for next render
    prevCurrent.current = item.current;
  }, [item.current, (item as any).total, item.type, item.archived, onAutoArchive, item.id]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative mb-5" // Spacing
    >
      <motion.div
        layout
        initial={false}
        animate={isDragging ? { scale: 1.05, y: -5, zIndex: 50 } : { scale: 1, y: 0, zIndex: 0 }}
        whileHover={{ scale: 1.01, y: -2 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className={`
          group relative overflow-hidden rounded-[2.5rem]
          bg-white dark:bg-zinc-900 
          h-32 select-none
          shadow-[0_10px_40px_-10px_rgba(0,0,0,0.05)] dark:shadow-none
          border border-white/50 dark:border-white/5
          hover:shadow-[0_20px_60px_-10px_rgba(0,0,0,0.1)] dark:hover:shadow-black/50
        `}
      >
        {/* Shimmer Effect (The "Wow" Factor) */}
        <AnimatePresence>
          {isCompleting && (
            <motion.div
              initial={{ x: '-100%', opacity: 0 }}
              animate={{ x: '200%', opacity: 1 }}
              transition={{ duration: 0.8, ease: "easeInOut" }}
              className="absolute inset-0 z-10 pointer-events-none bg-gradient-to-r from-transparent via-white/60 dark:via-white/20 to-transparent -skew-x-12"
            />
          )}
        </AnimatePresence>

        {/* Base Layer: Pure White/Black -> Morphs to Premium Solid on Completion */}
        <motion.div 
          className="absolute inset-0 bg-white dark:bg-zinc-900"
          animate={{ 
            backgroundColor: isCompleting ? 'var(--card-complete-bg)' : 'var(--card-bg)'
          }}
          style={{
            // @ts-ignore
            '--card-bg': '#ffffff',
            '--card-complete-bg': '#18181b', // zinc-900
          }}
        />
        
        {/* Progress Layer: "Liquid Light" - Soft, Diffused, Beautiful */}
        <motion.div 
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-zinc-50 to-zinc-100 dark:from-zinc-800 dark:to-zinc-800/50"
          initial={false}
          animate={{ width: fillWidth, opacity: isCompleting ? 0 : 1 }}
          transition={{ duration: 0.8, ease: "circOut" }}
        >
            {/* The Leading Edge Glow */}
            <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-zinc-300 dark:via-zinc-600 to-transparent opacity-50" />
        </motion.div>
        
        {/* Delicate Border (Ring) */}
        <div className={`absolute inset-0 rounded-[2.5rem] ring-1 ring-inset pointer-events-none transition-colors duration-500 ${isCompleting ? 'ring-transparent' : 'ring-black/5 dark:ring-white/5'}`} />

        {/* Content Layer - The Grand Transformation */}
        <div className="absolute inset-0 flex items-center justify-between px-10 pointer-events-none z-20">
          
          {/* Left Group: Title & Icon */}
          <motion.div 
            className="flex items-center gap-8 min-w-0 flex-1"
            animate={{ 
              x: isCompleting ? '50%' : (hoverZone === 'left' ? 48 : 0), // Center on complete
              opacity: hoverZone === 'left' ? 0.6 : 1 
            }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            {/* Wrapper to center content relative to itself when moving */}
            <motion.div 
              className="flex items-center gap-8"
              animate={{ x: isCompleting ? '-50%' : '0%' }} // Counter-offset for true centering
            >
                {/* Icon - Larger, Thinner, More Elegant */}
                {displayIcon && (() => {
                  const Icon = getIconByName(displayIcon);
                  return Icon ? (
                    <div className={`transition-colors duration-500 ${isCompleting ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-800 dark:text-zinc-200'}`}>
                      <Icon className="size-8" strokeWidth={1} fill="currentColor" fillOpacity={0.05} />
                    </div>
                  ) : null;
                })()}

                <div className="flex flex-col justify-center min-w-0 gap-1.5">
                  <span className={`text-2xl font-light tracking-wide truncate leading-none transition-colors duration-500 ${isCompleting ? 'text-white dark:text-zinc-900' : 'text-zinc-900 dark:text-zinc-100'}`}>
                    {displayTitle}
                  </span>
                  
                  {/* Stats - Fade out on completion */}
                  <motion.div 
                    animate={{ opacity: isCompleting ? 0 : 1, height: isCompleting ? 0 : 'auto' }}
                    className="flex items-center gap-3 text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] overflow-hidden"
                  >
                    <span className={item.todayCount > 0 ? "text-zinc-600 dark:text-zinc-300" : ""}>
                      Today {item.todayCount}
                    </span>
                  </motion.div>
                </div>
            </motion.div>
          </motion.div>

          {/* Right Group: Number / Checkmark */}
          <motion.div 
            className="flex flex-col items-end justify-center pl-6 h-full absolute right-10"
            animate={{ 
                right: isCompleting ? '50%' : '40px', // Move to center
                x: isCompleting ? '50%' : 0 
            }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
             <AnimatePresence mode="wait">
               {isCompleting ? (
                 <motion.div 
                   key="completed-check"
                   initial={{ scale: 0, rotate: -180 }}
                   animate={{ scale: 1, rotate: 0 }}
                   exit={{ scale: 0 }}
                   transition={{ type: "spring", stiffness: 300, damping: 20 }}
                   className="flex items-center justify-center"
                 >
                    {/* The Jewel: A glowing checkmark */}
                    <div className="p-4 rounded-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-[0_0_40px_rgba(255,255,255,0.6)] dark:shadow-[0_0_40px_rgba(255,255,255,0.1)]">
                      <Check className="size-8" strokeWidth={3} />
                    </div>
                 </motion.div>
               ) : (
                 <motion.div 
                   key="progress-number"
                   className="flex items-baseline gap-2"
                   animate={{ 
                      x: hoverZone === 'right' ? -48 : 0,
                      opacity: hoverZone === 'right' ? 0.6 : 1 
                   }}
                   exit={{ opacity: 0, scale: 0.8 }}
                   transition={{ type: "spring", stiffness: 400, damping: 30 }}
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
               )}
             </AnimatePresence>
          </motion.div>
        </div>

        {/* Interaction Layer - Invisible but responsive */}
        <div className="absolute inset-0 flex cursor-pointer">
          {/* Minus Zone - Left 30% */}
          <div 
            className="w-[30%] flex items-center justify-start pl-8 opacity-0 hover:opacity-100 transition-opacity duration-300"
            onClick={(e) => {
              e.stopPropagation();
              onUpdate(item.id, -step);
            }}
            onMouseEnter={() => setHoverZone('left')}
            onMouseLeave={() => setHoverZone(null)}
          >
            <motion.div
              initial={{ x: -20, opacity: 0, scale: 0.8 }}
              animate={hoverZone === 'left' ? { x: 0, opacity: 1, scale: 1 } : { x: -20, opacity: 0, scale: 0.8 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="text-zinc-300 dark:text-zinc-600"
            >
              <Minus className="size-8" strokeWidth={1} />
            </motion.div>
          </div>

          {/* Center Detail Zone - Middle 40% */}
          <div 
             className="flex-1"
             onClick={onClick}
          />
          
          {/* Plus Zone - Right 30% */}
          <div 
            className="w-[30%] flex items-center justify-end pr-8 opacity-0 hover:opacity-100 transition-opacity duration-300"
            onClick={(e) => {
              e.stopPropagation();
              onUpdate(item.id, step);
            }}
            onMouseEnter={() => setHoverZone('right')}
            onMouseLeave={() => setHoverZone(null)}
          >
            <motion.div
              initial={{ x: 20, opacity: 0, scale: 0.8 }}
              animate={hoverZone === 'right' ? { x: 0, opacity: 1, scale: 1 } : { x: 20, opacity: 0, scale: 0.8 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="text-zinc-300 dark:text-zinc-600"
            >
              <Plus className="size-8" strokeWidth={1} />
            </motion.div>
          </div>
        </div>

        {/* Drag Handle - Hidden on far left edge */}
        <div 
            {...attributes} 
            {...listeners}
            className="absolute left-0 top-0 bottom-0 w-8 cursor-grab active:cursor-grabbing z-20"
        />

      </motion.div>
    </div>
  );
}



