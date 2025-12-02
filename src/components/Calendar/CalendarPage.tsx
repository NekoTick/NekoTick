import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // 获取当前月份的第一天和最后一天
  const firstDayOfMonth = useMemo(() => {
    return new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  }, [currentDate]);

  const lastDayOfMonth = useMemo(() => {
    return new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  }, [currentDate]);

  // 获取月份的天数
  const daysInMonth = lastDayOfMonth.getDate();

  // 获取第一天是星期几（0 = 周日）
  const startingDayOfWeek = firstDayOfMonth.getDay();

  // 生成日历网格数据
  const calendarDays = useMemo(() => {
    const days: (Date | null)[] = [];

    // 填充前面的空白天
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // 填充实际的天数
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
    }

    // 填充后面的空白天到完整周
    const remainingDays = 7 - (days.length % 7);
    if (remainingDays < 7) {
      for (let i = 0; i < remainingDays; i++) {
        days.push(null);
      }
    }

    return days;
  }, [currentDate, daysInMonth, startingDayOfWeek]);

  // 导航到上个月
  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  // 导航到下个月
  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  // 导航到今天
  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // 检查是否是今天
  const isToday = (date: Date | null) => {
    if (!date) return false;
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  // 检查是否是选中的日期
  const isSelected = (date: Date | null) => {
    if (!date || !selectedDate) return false;
    return (
      date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear()
    );
  };

  // 格式化月份显示
  const monthYear = `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`;

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          {monthYear}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-700 transition-colors"
          >
            今天
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={previousMonth}
              className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
              aria-label="上个月"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              onClick={nextMonth}
              className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
              aria-label="下个月"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md overflow-hidden">
        {/* Week Days Header */}
        <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-700">
          {weekDays.map((day) => (
            <div
              key={day}
              className="py-3 text-center text-sm font-medium text-zinc-500 dark:text-zinc-400"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7" style={{ gridAutoRows: 'minmax(100px, 1fr)' }}>
          {calendarDays.map((date, index) => (
            <div
              key={index}
              className={`border-b border-r border-zinc-200 dark:border-zinc-700 p-2 ${
                index % 7 === 6 ? 'border-r-0' : ''
              } ${
                index >= calendarDays.length - 7 ? 'border-b-0' : ''
              }`}
            >
              {date && (
                <button
                  onClick={() => setSelectedDate(date)}
                  className={`w-full h-full min-h-[80px] flex flex-col items-start p-2 rounded-md transition-colors ${
                    isToday(date)
                      ? 'bg-zinc-100 dark:bg-zinc-800'
                      : isSelected(date)
                      ? 'bg-zinc-100 dark:bg-zinc-800'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  <span
                    className={`flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium ${
                      isToday(date)
                        ? 'bg-zinc-400 dark:bg-zinc-500 text-white'
                        : isSelected(date)
                        ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  {/* Future: Add tasks or events here */}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer Info */}
      {selectedDate && (
        <div className="mt-4 p-4 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-md">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            选中日期：{selectedDate.getFullYear()}年{selectedDate.getMonth() + 1}月{selectedDate.getDate()}日
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
            未来可以在这里显示当天的任务和事件
          </p>
        </div>
      )}
    </div>
  );
}
