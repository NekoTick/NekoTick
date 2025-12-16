import { format } from 'date-fns';
import { type CalendarEvent } from '@/lib/storage/calendarStorage';
import { Check } from 'lucide-react';

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
  
  // Dynamic color mapping
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500 border-blue-600 text-blue-700',
    red: 'bg-red-500 border-red-600 text-red-700',
    green: 'bg-emerald-500 border-emerald-600 text-emerald-700',
    yellow: 'bg-amber-400 border-amber-500 text-amber-800',
    purple: 'bg-purple-500 border-purple-600 text-purple-700',
    orange: 'bg-orange-500 border-orange-600 text-orange-800',
  };
  
  // Base classes
  const baseClasses = `
    absolute left-0.5 right-1 rounded-[3px] overflow-hidden cursor-pointer 
    transition-all duration-200 group
    hover:z-20 hover:shadow-lg hover:brightness-[0.98]
    ${isCompleted ? 'opacity-60 grayscale-[0.5]' : 'opacity-100'}
  `;

  // Specific styles
  let innerContent;
  
  if (isTask) {
    // --- TASK STYLE ---
    // A clean card with a checkbox
    const priorityColor = event.originalTask?.priority || 'default';
    const isShort = height < 30;

    innerContent = (
      <div 
        className={`
          w-full h-full flex flex-col
          bg-white dark:bg-zinc-800 
          border-l-[3px]
          ${priorityColor === 'red' ? 'border-red-500' : 
            priorityColor === 'yellow' ? 'border-yellow-400' :
            priorityColor === 'green' ? 'border-emerald-500' : 
            'border-blue-500'}
          text-xs shadow-sm
        `}
      >
        <div className={`flex items-start gap-1.5 p-1 ${isShort ? 'items-center' : ''}`}>
          {/* Checkbox Area */}
          <div 
            onClick={(e) => {
              e.stopPropagation();
              onToggle && onToggle(event.id);
            }}
            className={`
              flex-shrink-0 w-3.5 h-3.5 mt-[1px] rounded-[3px] border transition-colors flex items-center justify-center
              hover:scale-110 active:scale-95 z-20
              ${isCompleted 
                ? 'bg-zinc-500 border-zinc-500 text-white' 
                : 'border-zinc-300 dark:border-zinc-500 hover:border-zinc-400 bg-transparent'}
            `}
          >
            {isCompleted && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
          </div>

          {/* Text Content */}
          <div className="flex-1 min-w-0 leading-tight">
             <span className={`font-medium text-zinc-700 dark:text-zinc-200 truncate block ${isCompleted ? 'line-through text-zinc-400' : ''}`}>
               {event.title}
             </span>
             {!isShort && (
               <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                 {format(event.startDate, 'HH:mm')} - {format(event.endDate, 'HH:mm')}
               </span>
             )}
          </div>
        </div>
      </div>
    );
  } else {
    // --- EVENT STYLE ---
    // A translucent block of color, like Notion Calendar
    const colorKey = event.color || 'blue';
    const bgStyle = colorMap[colorKey].split(' ')[0].replace('bg-', ''); // primitive parsing
    
    innerContent = (
      <div className={`
        w-full h-full px-1.5 py-0.5 text-xs font-medium border-l-[3px]
        bg-${bgStyle}-100/80 dark:bg-${bgStyle}-900/30
        border-${bgStyle}-500
        text-${bgStyle}-900 dark:text-${bgStyle}-100
      `}>
        <div className="flex items-baseline gap-1">
           <span className="truncate">{event.title}</span>
           {height > 20 && (
             <span className="opacity-70 text-[10px] whitespace-nowrap">
               {format(event.startDate, 'HH:mm')}
             </span>
           )}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        top: `${top}px`,
        height: `${Math.max(height, 20)}px`, // Minimum height for visibility
      }}
      className={baseClasses}
    >
      {innerContent}
    </div>
  );
}
