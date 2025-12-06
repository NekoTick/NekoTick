import { useSortable, defaultAnimateLayoutChanges, type AnimateLayoutChanges } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Minus, GripVertical } from 'lucide-react';
import type { ProgressItem, CounterItem, ProgressOrCounter } from '@/stores/useProgressStore';
import { getIconByName } from './IconPicker';
import { motion } from 'framer-motion';

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
 * Unified card component with "Organic" design philosophy
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

  // Calculate activity level for icon opacity (0-10 range mostly)
  const activityOpacity = Math.min(1, 0.3 + (item.todayCount * 0.1));

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative"
    >
      <motion.div
        layout
        initial={false}
        animate={isDragging ? { scale: 1.02, boxShadow: "0 8px 20px rgba(0,0,0,0.1)" } : { scale: 1, boxShadow: "0 1px 2px rgba(0,0,0,0.0)" }}
        whileHover={{ scale: 1.01, backgroundColor: "var(--card-hover-bg)" }}
        className={`
          group relative overflow-hidden rounded-xl 
          bg-white dark:bg-zinc-900/50 
          border border-zinc-100 dark:border-zinc-800/50
          transition-colors duration-300
          ${isDragging ? 'z-50 opacity-90' : ''}
        `}
        style={{ '--card-hover-bg': 'rgba(var(--zinc-50), 0.5)' } as any}
      >
        {/* Progress Background (Water Level) */}
        {item.type === 'progress' && (
          <div 
            className="absolute bottom-0 left-0 h-[2px] bg-zinc-900/5 dark:bg-zinc-100/10 transition-all duration-500 group-hover:h-[3px] group-hover:bg-zinc-900/10 dark:group-hover:bg-zinc-100/20"
            style={{ width: `${Math.min(100, (item.current / item.total) * 100)}%` }}
          />
        )}

        <div className="flex items-center p-4">
          {/* Drag Handle - Left Side Hover Area */}
          <div 
            {...attributes} 
            {...listeners}
            className="absolute left-0 top-0 bottom-0 w-6 cursor-grab active:cursor-grabbing flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity touch-none z-10"
          >
            <GripVertical className="w-3 h-3 text-zinc-300 dark:text-zinc-600" />
          </div>

          {/* Icon */}
          <div 
            className="pl-2 mr-4 transition-all duration-300 group-hover:translate-x-1"
          >
             {displayIcon && (() => {
              const Icon = getIconByName(displayIcon);
              return Icon ? (
                <div 
                  className="p-2 rounded-full bg-zinc-50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 transition-colors"
                  style={{ opacity: activityOpacity }}
                >
                  <Icon className="size-5" />
                </div>
              ) : null;
            })()}
          </div>

          {/* Main Content */}
          <div 
            className="flex-1 min-w-0 cursor-pointer py-1" 
            onClick={onClick}
          >
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-base font-medium text-zinc-900 dark:text-zinc-100 truncate">
                {displayTitle}
              </span>
              <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400 ml-auto mr-2">
                {item.type === 'progress' 
                  ? `${Math.round((item.current / item.total) * 100)}%` 
                  : <>
                      {item.current}
                      <span className="text-xs ml-0.5 font-normal opacity-70">{item.unit}</span>
                    </>
                }
              </span>
            </div>
            
            {/* Subtitle / Stats */}
            <div className="flex items-center gap-3 text-[10px] text-zinc-400 dark:text-zinc-600 uppercase tracking-wider font-medium">
              <span>Today: {item.todayCount}</span>
              {item.type === 'progress' && (
                <span>Goal: {item.total} {item.unit}</span>
              )}
            </div>
          </div>

          {/* Actions - Right Side (Appear on Hover) */}
          <div className="flex items-center gap-1 pl-4 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={(e) => { e.stopPropagation(); onUpdate(item.id, -step); }}
              className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
            >
              <Minus className="size-4" />
            </motion.button>
            
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={(e) => { e.stopPropagation(); onUpdate(item.id, step); }}
              className="p-2 rounded-full bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors shadow-sm"
            >
              <Plus className="size-4" />
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

