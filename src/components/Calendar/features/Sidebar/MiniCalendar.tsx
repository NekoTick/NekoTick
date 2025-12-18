import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useCalendarStore } from '@/stores/useCalendarStore';
import { useState } from 'react';

export function MiniCalendar() {
  const { selectedDate, setSelectedDate } = useCalendarStore();
  const [currentMonth, setCurrentMonth] = useState(selectedDate);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  // Start from Sunday
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
    if (!isSameMonth(day, currentMonth)) {
      setCurrentMonth(day);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Calendar Widget */}
      <div className="select-none">
        {/* Navigation Arrows - Top Right */}
        <div className="flex justify-end gap-0 mb-2">
          <button 
            onClick={prevMonth}
            className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            <ChevronUp className="size-4" strokeWidth={2.5} />
          </button>
          <button 
            onClick={nextMonth}
            className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            <ChevronDown className="size-4" strokeWidth={2.5} />
          </button>
        </div>

        {/* Days Header - Weekday names */}
        <div className="grid grid-cols-7 text-center mb-3">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-xs font-medium text-zinc-400">
              {d}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-y-2">
          {days.map((day) => {
            const isToday = isSameDay(day, new Date());
            const isSelected = isSameDay(day, selectedDate);
            const isCurrentMonth = isSameMonth(day, currentMonth);

            return (
              <div 
                key={day.toString()} 
                onClick={() => handleDayClick(day)}
                className={`
                  h-9 flex items-center justify-center text-sm cursor-pointer relative
                  ${!isCurrentMonth ? 'text-zinc-300 dark:text-zinc-600' : 'text-zinc-600 dark:text-zinc-300'}
                  ${isSelected && !isToday ? 'font-semibold' : ''}
                  ${!isSelected && !isToday ? 'hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded' : ''}
                `}
              >
                {isToday ? (
                  <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center shadow-sm">
                    <span className="text-white font-semibold">{format(day, 'd')}</span>
                  </div>
                ) : (
                  <span>{format(day, 'd')}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Calendars List */}
      <div className="space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
         <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider pl-1">
           Calendars
         </div>
         <div className="space-y-1">
           <CalendarToggle color="blue" label="Work" checked />
           <CalendarToggle color="emerald" label="Personal" checked />
           <CalendarToggle color="purple" label="Habits" checked />
         </div>
      </div>
    </div>
  );
}

function CalendarToggle({ color, label, checked }: { color: string, label: string, checked: boolean }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500 ring-blue-500',
    emerald: 'bg-emerald-500 ring-emerald-500',
    purple: 'bg-purple-500 ring-purple-500',
    red: 'bg-red-500 ring-red-500',
  };

  return (
    <div className="flex items-center gap-2 px-1 py-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/50 cursor-pointer group transition-colors">
      <div className={`w-3.5 h-3.5 rounded-[4px] border transition-all flex items-center justify-center
        ${checked ? `${colorMap[color]} border-transparent` : 'border-zinc-300 dark:border-zinc-600 bg-transparent'}
      `}>
        {checked && (
          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
            <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      <span className="text-sm text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">
        {label}
      </span>
    </div>
  );
}
