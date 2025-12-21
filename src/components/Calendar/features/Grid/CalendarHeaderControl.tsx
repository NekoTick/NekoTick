import { useMemo, useState } from 'react';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { CaretDown } from '@phosphor-icons/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MiniCalendar } from '../DateSelector/MiniCalendar';
import { useCalendarStore } from '@/stores/useCalendarStore';

export function CalendarHeaderControl() {
  const { selectedDate, setSelectedDate, viewMode, dayCount } = useCalendarStore();
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const days = useMemo(() => {
    if (viewMode === 'week') {
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
      return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    }
    if (viewMode === 'day') {
      return Array.from({ length: dayCount || 1 }, (_, i) => addDays(selectedDate, i));
    }
    return [];
  }, [viewMode, selectedDate, dayCount]);

  if (viewMode === 'month') {
    // For month view, just show Month/Year selector centered
    return (
      <div className="flex items-center">
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-2 px-3 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group outline-none">
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {format(selectedDate, 'MMMM yyyy')}
              </span>
              <CaretDown weight="bold" className={`size-3 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-transform duration-200 ${datePickerOpen ? 'rotate-180' : ''}`} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="center" sideOffset={8}>
            <MiniCalendar selectedDate={selectedDate} onSelect={(date) => { setSelectedDate(date); setDatePickerOpen(false); }} />
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <div className="flex items-center h-full relative">
      {/* Date Container */}
      <div className="flex items-center h-full relative group/container">
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <button className="h-full flex items-center gap-4 px-4 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group outline-none">
              <div className="flex items-center gap-8">
                {days.map((day) => (
                  <div key={day.toString()} className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                      {format(day, 'EEE')}
                    </span>
                    <span className={`text-sm font-semibold ${isSameDay(day, new Date()) ? 'text-red-500 dark:text-red-400' : 'text-zinc-700 dark:text-zinc-200'}`}>
                      {format(day, 'd')}
                    </span>
                  </div>
                ))}
              </div>
              <CaretDown weight="bold" className={`size-3 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-transform duration-200 ${datePickerOpen ? 'rotate-180' : ''}`} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="center" sideOffset={8}>
            <MiniCalendar selectedDate={selectedDate} onSelect={(date) => { setSelectedDate(date); setDatePickerOpen(false); }} />
          </PopoverContent>
        </Popover>

        {/* Today Button - Appears next to the date group */}
        {!days.some(day => isSameDay(day, new Date())) && (
          <div className="ml-4">
            <button
              onClick={() => setSelectedDate(new Date())}
              className="whitespace-nowrap px-2 py-0.5 text-xs font-medium text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 bg-zinc-100 dark:bg-zinc-800/50 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-md transition-all animate-in fade-in slide-in-from-left-2 duration-200"
            >
              Today
            </button>
          </div>
        )}
      </div>
    </div>
  );
}