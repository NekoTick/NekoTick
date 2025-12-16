import { format } from 'date-fns';
import { type CalendarEvent } from '@/lib/storage/calendarStorage';
import { Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const HOUR_HEIGHT = 64; 

interface EventBlockProps {
  event: CalendarEvent & { type?: 'event' | 'task'; originalTask?: any };
  onToggle?: (id: string) => void;
}

export function EventBlock({ event, onToggle }: EventBlockProps) {
  const durationInMinutes = (event.endDate - event.startDate) / (1000 * 60);
  const startHour = new Date(event.startDate).getHours();
  const startMinute = new Date(event.startDate).getMinutes();

  const top = (startHour * HOUR_HEIGHT) + (startMinute / 60 * HOUR_HEIGHT);
  const height = (durationInMinutes / 60) * HOUR_HEIGHT;

  const isTask = event.type === 'task';
  const isCompleted = isTask && event.originalTask?.completed;
  
  // Premium Color Palette
  const colorMap: Record<string, string> = {
    // Style: [Background, Text, CheckboxBorder, CheckboxActive]
    blue:    'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-100 ring-blue-200 dark:ring-blue-700/50',
    red:     'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-100 ring-red-200 dark:ring-red-700/50',
    green:   'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-100 ring-emerald-200 dark:ring-emerald-700/50',
    yellow:  'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-100 ring-amber-200 dark:ring-amber-700/50',
    purple:  'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-100 ring-purple-200 dark:ring-purple-700/50',
    orange:  'bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-100 ring-orange-200 dark:ring-orange-700/50',
  };

  const colorKey = event.color || 'blue';
  const styleStr = colorMap[colorKey] || colorMap['blue'];
  
  // Base classes
  const baseClasses = `
    absolute left-0.5 right-1 rounded-[6px] overflow-hidden cursor-pointer 
    group
  `;

  let innerContent;
  
  if (isTask) {
    // --- TASK STYLE ---
    const priorityColor = event.originalTask?.priority || 'default';
    const isShort = height < 32;

    // Determine Accent Color based on Priority
    let bgClass = 'bg-white dark:bg-zinc-800';
    let borderLeftClass = 'border-l-[3px] border-blue-500';

    if (priorityColor === 'red') {
       borderLeftClass = 'border-l-[3px] border-red-500';
       bgClass = 'bg-red-50/50 dark:bg-red-900/10';
    } else if (priorityColor === 'green') {
       borderLeftClass = 'border-l-[3px] border-emerald-500';
       bgClass = 'bg-emerald-50/50 dark:bg-emerald-900/10';
    } else if (priorityColor === 'yellow') {
       borderLeftClass = 'border-l-[3px] border-amber-400';
       bgClass = 'bg-amber-50/50 dark:bg-amber-900/10';
    } else {
       borderLeftClass = 'border-l-[3px] border-blue-500';
       bgClass = 'bg-white dark:bg-zinc-800';
    }

    innerContent = (
      <motion.div 
        initial={false}
        animate={{
          opacity: isCompleted ? 0.6 : 1,
          filter: isCompleted ? 'grayscale(0.5)' : 'grayscale(0)',
          scale: 1,
        }}
        whileHover={{ scale: 1.02, zIndex: 50, shadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.2 }}
        className={`
          w-full h-full flex flex-col
          ${bgClass}
          ${borderLeftClass}
          ring-1 ring-inset ring-black/5 dark:ring-white/10
          shadow-sm
        `}
      >
        <div className={`flex items-start gap-2 p-1.5 ${isShort ? 'items-center' : ''}`}>
          
          {/* Animated Checkbox */}
          <motion.div 
            onClick={(e) => {
              e.stopPropagation();
              onToggle && onToggle(event.id);
            }}
            whileTap={{ scale: 0.8 }}
            className={`
              flex-shrink-0 w-4 h-4 rounded-[4px] border transition-colors duration-200 flex items-center justify-center
              z-20 cursor-pointer shadow-sm relative overflow-hidden
              ${isCompleted 
                ? 'bg-zinc-500 border-zinc-500' 
                : 'border-zinc-300 dark:border-zinc-500 bg-white dark:bg-zinc-900 group-hover:border-blue-400'}
            `}
          >
            <AnimatePresence initial={false}>
              {isCompleted && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                >
                  <Check className="w-3 h-3 text-white" strokeWidth={3.5} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Text Content */}
          <div className="flex-1 min-w-0 flex flex-col justify-center">
             <span 
               className={`
                 text-[11px] leading-tight font-semibold tracking-tight truncate transition-all duration-300
                 ${isCompleted ? 'line-through text-zinc-400' : 'text-zinc-700 dark:text-zinc-200'}
               `}
             >
               {event.title}
             </span>
             {!isShort && (
               <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-medium tracking-wide mt-0.5 tabular-nums">
                 {format(event.startDate, 'HH:mm')} · {format(event.endDate, 'HH:mm')}
               </span>
             )}
          </div>
        </div>
      </motion.div>
    );
  } else {
    // --- EVENT STYLE ---
    // Pure, flat, colorful block
    innerContent = (
      <motion.div 
        whileHover={{ scale: 1.02, zIndex: 50 }}
        whileTap={{ scale: 0.98 }}
        className={`
          w-full h-full px-2 py-1 flex flex-col justify-center
          ${styleStr}
          ring-1 ring-inset border-l-0
          rounded-[4px]
        `}
      >
        <div className="flex flex-col">
           <span className="text-[11px] font-semibold tracking-tight truncate leading-tight">
             {event.title}
           </span>
           {height > 30 && (
             <span className="opacity-80 text-[9px] tracking-wide font-medium tabular-nums mt-0.5">
               {format(event.startDate, 'HH:mm')}
             </span>
           )}
        </div>
      </motion.div>
    );
  }

  return (
    <div
      style={{
        top: `${top}px`,
        height: `${Math.max(height, 24)}px`, // Minimum height enforced
      }}
      className={baseClasses}
    >
      {innerContent}
    </div>
  );
}
