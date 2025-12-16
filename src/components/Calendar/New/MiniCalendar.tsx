import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useCalendarStore } from '@/stores/useCalendarStore';
import { useState } from 'react';

export function MiniCalendar() {
  const { selectedDate, setSelectedDate } = useCalendarStore();
  // Internal state for mini calendar navigation (independent of main view until clicked)
  const [currentMonth, setCurrentMonth] = useState(selectedDate);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
    // If clicked day is in another month, switch to that month
    if (!isSameMonth(day, currentMonth)) {
      setCurrentMonth(day);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Calendar Widget */}
      <div className="select-none">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pl-1">
          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <div className="flex gap-1">
            <button 
              onClick={prevMonth}
              className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
            >
              <CaretLeft className="size-3" />
            </button>
            <button 
              onClick={nextMonth}
              className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
            >
              <CaretRight className="size-3" />
            </button>
          </div>
        </div>

        {/* Days Header */}
        <div className="grid grid-cols-7 gap-1 text-center mb-2">
          {['M','T','W','T','F','S','S'].map(d => (
            <div key={d} className="text-[10px] font-medium text-zinc-400">
              {d}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-y-1 gap-x-0">
          {days.map((day, idx) => {
            const isToday = isSameDay(day, new Date());
            const isSelected = isSameDay(day, selectedDate);
            const isCurrentMonth = isSameMonth(day, currentMonth);

            return (
              <div 
                key={day.toString()} 
                onClick={() => handleDayClick(day)}
                className={`
                  aspect-square flex items-center justify-center text-xs cursor-pointer rounded-full relative group
                  ${!isCurrentMonth ? 'text-zinc-300 dark:text-zinc-700' : 'text-zinc-700 dark:text-zinc-300'}
                  ${isSelected && !isToday ? 'bg-zinc-200 dark:bg-zinc-800 font-semibold' : ''}
                  ${!isSelected && !isToday ? 'hover:bg-zinc-100 dark:hover:bg-zinc-800/50' : ''}
                `}
              >
                {isToday && (
                  <div className="absolute inset-0 bg-red-500 rounded-full z-0 shadow-sm" />
                )}
                <span className={`relative z-10 ${isToday ? 'text-white font-bold' : ''}`}>
                  {format(day, 'd')}
                </span>
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
