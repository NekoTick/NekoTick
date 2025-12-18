import { useMemo } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  isToday,
} from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useCalendarStore } from '@/stores/useCalendarStore';
import { useCalendarEvents, type CalendarDisplayItem } from '../../hooks/useCalendarEvents';
import type { ItemColor } from '@/stores/types';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 颜色优先级映射：与 eventLayout.ts 保持一致
const COLOR_PRIORITY: Record<ItemColor, number> = {
  red: 0,
  yellow: 1,
  purple: 2,
  green: 3,
  blue: 4,
  default: 5,
};

/**
 * 按完成状态和颜色优先级排序事件
 * 未完成的排在前面，已完成的排在后面
 */
function sortEventsByPriority(events: CalendarDisplayItem[]): CalendarDisplayItem[] {
  return [...events].sort((a, b) => {
    // 首先按完成状态排序：未完成的排在前面
    const completedA = a.completed ? 1 : 0;
    const completedB = b.completed ? 1 : 0;
    if (completedA !== completedB) return completedA - completedB;

    // 然后按颜色优先级排序
    const colorPriorityA = COLOR_PRIORITY[a.color || 'default'] ?? COLOR_PRIORITY.default;
    const colorPriorityB = COLOR_PRIORITY[b.color || 'default'] ?? COLOR_PRIORITY.default;
    if (colorPriorityA !== colorPriorityB) return colorPriorityA - colorPriorityB;

    return a.startDate - b.startDate;
  });
}

export function MonthGrid() {
  const { selectedDate, setSelectedDate } = useCalendarStore();
  const displayItems = useCalendarEvents();
  // No need for now state in month view

  // Calculate calendar grid
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday start
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  // Generate all days in the calendar view
  const days: Date[] = [];
  let day = calendarStart;
  while (day <= calendarEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  // Group days into weeks
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  // Get events for a specific day, sorted by completion status and color priority
  const getEventsForDay = useMemo(() => {
    return (date: Date) => {
      const dayEvents = displayItems.filter((item) => isSameDay(new Date(item.startDate), date));
      return sortEventsByPriority(dayEvents);
    };
  }, [displayItems]);

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950">
      {/* Weekday Headers */}
      <div className="flex-shrink-0 grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="py-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 border-r border-zinc-100 dark:border-zinc-800/50 last:border-r-0"
          >
            {weekday}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 grid grid-rows-6 overflow-hidden">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 border-b border-zinc-100 dark:border-zinc-800/50 last:border-b-0">
            {week.map((date) => {
              const isCurrentMonth = isSameMonth(date, selectedDate);
              const isTodayDate = isToday(date);
              const isSelected = isSameDay(date, selectedDate);
              const dayEvents = getEventsForDay(date);

              return (
                <div
                  key={date.toString()}
                  onClick={() => handleDayClick(date)}
                  className={`
                    relative min-h-[100px] p-1 border-r border-zinc-100 dark:border-zinc-800/50 last:border-r-0
                    cursor-pointer transition-colors
                    ${isCurrentMonth ? 'bg-white dark:bg-zinc-950' : 'bg-zinc-50 dark:bg-zinc-900/50'}
                    ${isSelected ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}
                    hover:bg-zinc-50 dark:hover:bg-zinc-900
                  `}
                >
                  {/* Day Number */}
                  <div className="flex items-start justify-end p-1">
                    {/* Show month name on first day of month */}
                    {date.getDate() === 1 && (
                      <span className={`text-xs mr-auto ${isCurrentMonth ? 'text-zinc-600 dark:text-zinc-400' : 'text-zinc-400 dark:text-zinc-600'}`}>
                        {format(date, 'M月', { locale: zhCN })}
                      </span>
                    )}
                    <span
                      className={`
                        w-6 h-6 flex items-center justify-center text-sm rounded-full
                        ${isTodayDate ? 'bg-red-500 text-white font-medium' : ''}
                        ${!isTodayDate && isCurrentMonth ? 'text-zinc-800 dark:text-zinc-200' : ''}
                        ${!isTodayDate && !isCurrentMonth ? 'text-zinc-400 dark:text-zinc-600' : ''}
                      `}
                    >
                      {format(date, 'd')}
                    </span>
                  </div>

                  {/* Events */}
                  <div className="space-y-0.5 px-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <div
                        key={event.id}
                        className={`
                          text-xs px-1.5 py-0.5 rounded truncate
                          ${event.completed
                            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 line-through'
                            : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          }
                        `}
                        style={{
                          borderLeft: `3px solid ${
                            event.color === 'red' ? '#ef4444' :
                            event.color === 'yellow' ? '#eab308' :
                            event.color === 'purple' ? '#a855f7' :
                            event.color === 'green' ? '#22c55e' :
                            event.color === 'blue' ? '#3b82f6' :
                            '#d4d4d8'
                          }`,
                        }}
                      >
                        {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-xs text-zinc-400 dark:text-zinc-500 px-1">
                        +{dayEvents.length - 3} 更多
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
