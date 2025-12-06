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
 * Premium Apple-style Card
 * Concept: The entire card is the progress bar.
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

  // Calculate percentage for progress items
  const percentage = item.type === 'progress' 
    ? Math.min(100, Math.max(0, (item.current / item.total) * 100))
    : 0;
  
  // For counter, we simulate a subtle "fill" based on daily activity goal (e.g., assume 10 is a "full" day)
  // This gives visual weight to counters too
  const counterFill = item.type === 'counter'
    ? Math.min(100, (item.todayCount / 10) * 100)
    : 0;

  const fillWidth = item.type === 'progress' ? `${percentage}%` : `${counterFill}%`;
  
  // Hover state for interaction zones
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
        animate={isDragging ? { scale: 1.02, boxShadow: "0 12px 24px rgba(0,0,0,0.15)" } : { scale: 1, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
        whileHover={{ scale: 1.005, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
        className={`
          group relative overflow-hidden rounded-2xl
          bg-white dark:bg-zinc-900 
          border border-zinc-100 dark:border-zinc-800
          h-20 select-none
          ${isDragging ? 'z-50 opacity-90' : ''}
        `}
      >
        {/* Full Height Progress Background */}
        <div className="absolute inset-0 bg-zinc-50 dark:bg-zinc-900/50" />
        
        <motion.div 
          className="absolute inset-y-0 left-0 bg-zinc-100 dark:bg-zinc-800"
          initial={false}
          animate={{ width: fillWidth }}
          transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
        />

        {/* Content Layer */}
        <div className="absolute inset-0 flex items-center justify-between px-6 pointer-events-none">
          {/* Left: Icon & Info */}
          <div className="flex items-center gap-4 min-w-0 flex-1">
             {/* Icon with glass morphism effect */}
            {displayIcon && (() => {
              const Icon = getIconByName(displayIcon);
              return Icon ? (
                <div className="relative">
                  <div className="absolute inset-0 bg-zinc-200/50 dark:bg-zinc-700/50 blur-md rounded-full transform scale-110" />
                  <div className="relative bg-white/80 dark:bg-zinc-800/80 backdrop-blur-sm p-2.5 rounded-xl shadow-sm text-zinc-700 dark:text-zinc-300">
                    <Icon className="size-5" strokeWidth={2} />
                  </div>
                </div>
              ) : null;
            })()}

            <div className="flex flex-col justify-center min-w-0">
              <span className="text-base font-semibold text-zinc-800 dark:text-zinc-100 tracking-tight truncate">
                {displayTitle}
              </span>
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                <span>Today: {item.todayCount}</span>
                {item.type === 'progress' && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                    <span>{item.total} {item.unit}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right: Big Number */}
          <div className="flex flex-col items-end justify-center pl-4">
             <div className="flex items-baseline gap-1">
                <span className="text-3xl font-light tracking-tighter text-zinc-900 dark:text-zinc-50 font-mono">
                  {item.type === 'progress' 
                    ? Math.round((item.current / item.total) * 100)
                    : item.current
                  }
                </span>
                <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 mb-1">
                  {item.type === 'progress' ? '%' : item.unit}
                </span>
             </div>
          </div>
        </div>

        {/* Interaction Layer (Overlay) */}
        <div className="absolute inset-0 flex cursor-pointer">
          {/* Minus Zone */}
          <div 
            className="flex-1 flex items-center justify-start pl-6 opacity-0 hover:opacity-100 hover:bg-zinc-500/5 transition-all duration-200"
            onClick={(e) => {
              e.stopPropagation();
              onUpdate(item.id, -step);
            }}
            onMouseEnter={() => setHoverZone('left')}
            onMouseLeave={() => setHoverZone(null)}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={hoverZone === 'left' ? { scale: 1, opacity: 1 } : { scale: 0.5, opacity: 0 }}
              className="p-2 rounded-full bg-white dark:bg-zinc-800 shadow-sm text-zinc-500"
            >
              <Minus className="size-5" />
            </motion.div>
          </div>

          {/* Middle Zone (Drag & Detail) - Narrow strip in middle if needed, or just allow drag anywhere? 
              DndKit drag handle needs to be specific if we want text selection, but here we disable text selection.
              Let's make the center drag, and right plus.
          */}
          
          {/* Plus Zone */}
          <div 
            className="flex-1 flex items-center justify-end pr-6 opacity-0 hover:opacity-100 hover:bg-zinc-500/5 transition-all duration-200"
            onClick={(e) => {
              e.stopPropagation();
              onUpdate(item.id, step);
            }}
            onMouseEnter={() => setHoverZone('right')}
            onMouseLeave={() => setHoverZone(null)}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={hoverZone === 'right' ? { scale: 1, opacity: 1 } : { scale: 0.5, opacity: 0 }}
              className="p-2 rounded-full bg-white dark:bg-zinc-800 shadow-sm text-zinc-500"
            >
              <Plus className="size-5" />
            </motion.div>
          </div>
        </div>
        
        {/* Hidden Drag Handle (Active everywhere except buttons technically, but let's make a specific handle on far left edge?) 
            Actually, the user can click details via title? 
            Let's put the drag handle strictly on the far left edge or handle it via a small grip overlay.
        */}
        <div 
            {...attributes} 
            {...listeners}
            className="absolute left-0 top-0 bottom-0 w-4 cursor-grab active:cursor-grabbing hover:bg-black/5 dark:hover:bg-white/5 transition-colors z-20"
        />
        
        {/* Detail Click Area - Center */}
        <div 
           className="absolute inset-x-16 inset-y-0 cursor-pointer z-10"
           onClick={onClick}
        />

      </motion.div>
    </div>
  );
}


