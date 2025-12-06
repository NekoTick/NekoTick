import { useSortable, defaultAnimateLayoutChanges, type AnimateLayoutChanges } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Minus } from 'lucide-react';
import type { ProgressOrCounter } from '@/stores/useProgressStore';
import { getIconByName } from './IconPicker';
import { motion } from 'framer-motion';
import { useState } from 'react';

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
  isDragging?: boolean;
  previewIcon?: string;
  previewTitle?: string;
}

/**
 * "Liquid Light" Design - High End, Minimalist, Fluid
 */
export function ItemCard({ item, onUpdate, onClick, isDragging, previewIcon, previewTitle }: ItemCardProps) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative"
    >
      <motion.div
        layout
        initial={false}
        animate={isDragging ? { scale: 1.02, boxShadow: "0 20px 40px rgba(0,0,0,0.12)" } : { scale: 1, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}
        whileHover={{ scale: 1.002, boxShadow: "0 8px 24px rgba(0,0,0,0.06)" }}
        className={`
          group relative overflow-hidden rounded-3xl
          bg-white dark:bg-zinc-900 
          h-22 select-none
          ${isDragging ? 'z-50 opacity-95' : ''}
        `}
      >
        {/* Base Layer: Pure White/Black */}
        <div className="absolute inset-0 bg-white dark:bg-zinc-900" />

        {/* Progress Layer: "Light Beam" */}
        {/* Using a very subtle dark overlay for progress on light mode, and light on dark mode */}
        <motion.div 
          className="absolute inset-y-0 left-0 bg-zinc-100/80 dark:bg-zinc-800/60 mix-blend-multiply dark:mix-blend-screen"
          initial={false}
          animate={{ width: fillWidth }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} // Apple-like exponential ease
        />
        
        {/* Delicate Border (Ring) to define shape without harsh lines */}
        <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-black/5 dark:ring-white/5 pointer-events-none" />

        {/* Content Layer - Fades out when interacting */}
        <div className="absolute inset-0 flex items-center justify-between px-7 pointer-events-none">
          {/* Left: Typography & Icon */}
          <div className="flex items-center gap-5 min-w-0 flex-1">
            <motion.div 
              className="flex items-center gap-5 min-w-0 flex-1"
              animate={{ 
                x: hoverZone === 'left' ? 48 : 0, // Move further right
                opacity: hoverZone === 'left' ? 0.6 : 1 // Fade a bit more
              }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              {/* Icon - Pure, no background, just the symbol */}
              {displayIcon && (() => {
                const Icon = getIconByName(displayIcon);
                return Icon ? (
                  <div className="text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 transition-colors duration-500">
                    <Icon className="size-6" strokeWidth={2} fill="currentColor" fillOpacity={0.1} />
                  </div>
                ) : null;
              })()}

              <div className="flex flex-col justify-center min-w-0 gap-0.5">
                <span className="text-lg font-medium text-zinc-900 dark:text-zinc-50 tracking-tight truncate leading-none">
                  {displayTitle}
                </span>
                {/* Super Minimal Stats */}
                <div className="flex items-center gap-3 text-[11px] font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">
                  <span className={item.todayCount > 0 ? "text-zinc-500 dark:text-zinc-400" : ""}>
                    Today {item.todayCount}
                  </span>
                  {item.type === 'progress' && (
                    <>
                      <span className="text-zinc-300 dark:text-zinc-700">•</span>
                      <span>{item.total} {item.unit}</span>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </div>

          {/* Right: Super Number */}
          {/* Dynamic Safe Zone: Calculated to clear the floating button (40px) + breathing room (24px) */}
          <div 
            className="flex flex-col items-end justify-center pl-6"
            style={{ paddingRight: 'calc(40px + 24px)' }}
          >
             <motion.div 
               className="flex items-baseline gap-1.5"
               animate={{ 
                  x: hoverZone === 'right' ? -48 : 0, // Move further left to clear the button space
                  opacity: hoverZone === 'right' ? 0.6 : 1 
               }}
               transition={{ type: "spring", stiffness: 400, damping: 30 }}
             >
                <span className="text-4xl font-light tracking-tighter text-zinc-900 dark:text-zinc-50 font-sans tabular-nums">
                  {item.type === 'progress' 
                    ? Math.round((item.current / item.total) * 100)
                    : item.current
                  }
                </span>
                <span className="text-sm font-medium text-zinc-400 dark:text-zinc-600 mb-1.5">
                  {item.type === 'progress' ? '%' : item.unit}
                </span>
             </motion.div>
          </div>
        </div>

        {/* Interaction Layer - Invisible but responsive */}
        <div className="absolute inset-0 flex cursor-pointer">
          {/* Minus Zone - Left 40% */}
          <div 
            className="w-[40%] flex items-center justify-start pl-6 opacity-0 hover:opacity-100 transition-opacity duration-200"
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
              className="text-zinc-400 dark:text-zinc-500"
            >
              <Minus className="size-10" strokeWidth={1.5} />
            </motion.div>
          </div>

          {/* Center Detail Zone - Middle 20% */}
          <div 
             className="flex-1"
             onClick={onClick}
          />
          
          {/* Plus Zone - Right 40% */}
          <div 
            className="w-[40%] flex items-center justify-end pr-6 opacity-0 hover:opacity-100 transition-opacity duration-200"
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
              className="text-zinc-900 dark:text-zinc-100"
            >
              <Plus className="size-10" strokeWidth={1.5} />
            </motion.div>
          </div>
        </div>

        {/* Drag Handle - Hidden on far left edge */}
        <div 
            {...attributes} 
            {...listeners}
            className="absolute left-0 top-0 bottom-0 w-6 cursor-grab active:cursor-grabbing z-20"
        />

      </motion.div>
    </div>
  );
}



