import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useCalendarStore } from '@/stores/useCalendarStore';
import { useUIStore } from '@/stores/uiSlice';
import { useState } from 'react';
import type { ItemColor } from '@/stores/types';

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
        {/* Month/Year and Navigation */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {format(currentMonth, 'MMM yyyy')}
          </span>
          <div className="flex gap-0">
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

      {/* Color Filter */}
      <ColorFilter />
    </div>
  );
}

const ALL_COLORS: ItemColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'brown', 'default'];

function ColorFilter() {
  const { selectedColors, toggleColor, toggleAllColors } = useUIStore();
  
  // Apple 风格颜色
  const colorHexMap: Record<string, string> = {
    red: '#FE002D',
    orange: '#FF8500',
    yellow: '#FEC900',
    green: '#63DA38',
    blue: '#008BFE',
    purple: '#DD11E8',
    brown: '#B47D58',
    default: '#9F9FA9',
  };
  
  return (
    <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
      <div className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">Color Filter</div>
      <div className="flex items-center justify-between gap-1.5">
        {/* Color options - 按新顺序 */}
        {ALL_COLORS.map(color => (
          <button
            key={color}
            onClick={() => toggleColor(color)}
            className={`w-5 h-5 rounded-sm border-2 transition-all hover:scale-110 ${
              selectedColors.includes(color)
                ? 'ring-2 ring-zinc-400 dark:ring-zinc-500 ring-offset-1'
                : ''
            }`}
            style={{
              borderColor: colorHexMap[color],
              backgroundColor: color === 'default' ? 'transparent' : undefined
            }}
          />
        ))}
        {/* Select all button */}
        <button
          onClick={() => toggleAllColors()}
          className={`w-6 h-6 rounded-sm transition-all hover:scale-110 relative overflow-hidden p-[2px] ${
            selectedColors.length === ALL_COLORS.length
              ? 'ring-2 ring-zinc-400 dark:ring-zinc-500 ring-offset-1'
              : ''
          }`}
          style={{
            background: 'linear-gradient(135deg, #FE002D, #FF8500, #FEC900, #63DA38, #008BFE, #DD11E8)'
          }}
        >
          <span className="block w-full h-full bg-white dark:bg-zinc-900 rounded-sm" />
        </button>
      </div>
    </div>
  );
}
