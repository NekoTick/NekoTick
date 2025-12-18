import { useRef, useEffect, useState, useCallback } from 'react';
import { format, isSameDay, getHours, getMinutes, startOfDay, addMinutes, addDays } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useCalendarStore } from '@/stores/useCalendarStore';
import { useGroupStore } from '@/stores/useGroupStore';
import { useCalendarEvents } from '../../hooks/useCalendarEvents';
import { EventBlock } from '../Event/EventBlock';
import { calculateEventLayout } from '../../utils/eventLayout';

const GUTTER_WIDTH = 60;

// 根据缩放级别动态计算时间精度
function getSnapMinutes(hourHeight: number): number {
  if (hourHeight >= 400) return 1;      // 最大放大：1分钟精度
  if (hourHeight >= 256) return 5;      // 大放大：5分钟精度
  if (hourHeight >= 128) return 10;     // 中等放大：10分钟精度
  if (hourHeight >= 64) return 15;      // 默认：15分钟精度
  return 30;                            // 缩小：30分钟精度
}

export function DayGrid() {
  const { selectedDate, addEvent, dayCount, setEditingEventId, closeEditingEvent, timezone, setTimezone, hourHeight } = useCalendarStore();
  const { toggleTask } = useGroupStore();
  const displayItems = useCalendarEvents();
  
  // 使用 store 中的 hourHeight
  const HOUR_HEIGHT = hourHeight;

  const [now, setNow] = useState(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const timezoneInputRef = useRef<HTMLInputElement>(null);

  // Drag Creation State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ y: number; time: number; dayIndex: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ time: number } | null>(null);
  
  // Timezone editing state
  const [isEditingTimezone, setIsEditingTimezone] = useState(false);
  const [timezoneInput, setTimezoneInput] = useState('');

  // Generate days array based on dayCount
  const days = Array.from({ length: dayCount }, (_, i) => addDays(selectedDate, i));

  // Maintain current time
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Initial scroll to current hour
  useEffect(() => {
    if (scrollRef.current) {
      const currentHour = now.getHours();
      scrollRef.current.scrollTop = (currentHour - 2) * HOUR_HEIGHT;
    }
  }, []);

  const getDayAndTimestampFromY = (y: number, x: number) => {
    if (!canvasRef.current || !scrollRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const scrollRect = scrollRef.current.getBoundingClientRect();
    
    // Calculate Day Column
    const relativeX = x - rect.left;
    const dayWidth = rect.width / dayCount;
    const dayIndex = Math.floor(relativeX / dayWidth);

    // Calculate Time - 相对于滚动容器的位置 + 滚动偏移
    const relativeY = y - scrollRect.top + scrollRef.current.scrollTop;
    const totalMinutes = (relativeY / HOUR_HEIGHT) * 60;
    const snapMinutes = getSnapMinutes(HOUR_HEIGHT);
    const snappedMinutes = Math.round(totalMinutes / snapMinutes) * snapMinutes;
    
    return { dayIndex, minutes: snappedMinutes };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.event-block')) return;

    const result = getDayAndTimestampFromY(e.clientY, e.clientX);
    if (!result || result.dayIndex < 0 || result.dayIndex >= dayCount) return;

    // 如果当前正在编辑一个事件，先关闭它（会自动删除空标题事件）
    closeEditingEvent();

    setIsDragging(true);
    setDragStart({ y: e.clientY, time: result.minutes, dayIndex: result.dayIndex });
    // 初始结束时间就是点击位置，拖拽时再更新
    setDragEnd({ time: result.minutes });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !dragStart || !scrollRef.current) return;
      
      const scrollRect = scrollRef.current.getBoundingClientRect();
      const relativeY = e.clientY - scrollRect.top + scrollRef.current.scrollTop;
      const totalMinutes = (relativeY / HOUR_HEIGHT) * 60;
      const snapMinutes = getSnapMinutes(HOUR_HEIGHT);
      const snappedMinutes = Math.round(totalMinutes / snapMinutes) * snapMinutes;
      
      // 支持向上或向下拖拽
      setDragEnd({ time: snappedMinutes });
    },
    [isDragging, dragStart, HOUR_HEIGHT]
  );

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!isDragging || !dragStart || !dragEnd) return;

    setIsDragging(false);

    // 只有当拖拽了一定距离（时间差不为0）才创建事件
    // 单纯点击不创建
    if (dragStart.time === dragEnd.time) {
      setDragStart(null);
      setDragEnd(null);
      return;
    }

    const dayDate = days[dragStart.dayIndex];
    
    // 计算实际的开始和结束时间（支持向上拖拽）
    const actualStartTime = Math.min(dragStart.time, dragEnd.time);
    const actualEndTime = Math.max(dragStart.time, dragEnd.time);
    
    const startDate = addMinutes(startOfDay(dayDate), actualStartTime);
    const endDate = addMinutes(startOfDay(dayDate), actualEndTime);

    const newEventId = addEvent({
      title: '',
      startDate: startDate.getTime(),
      endDate: endDate.getTime(),
      isAllDay: false,
      color: 'blue',
    });

    // Open the edit form for the new event, with position for floating editor
    setEditingEventId(newEventId, { x: e.clientX, y: e.clientY });

    setDragStart(null);
    setDragEnd(null);
  }, [isDragging, dragStart, dragEnd, days, addEvent, setEditingEventId]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const nowTop = (getHours(now) * HOUR_HEIGHT) + (getMinutes(now) / 60) * HOUR_HEIGHT;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950 select-none">
      {/* TOP HEADER - GMT+8 和 星期日期 */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-zinc-100 dark:border-zinc-800/50">
        {/* 时区显示/编辑 */}
        {isEditingTimezone ? (
          <div className="flex items-center">
            <span className="text-zinc-500 text-sm">GMT</span>
            <input
              ref={timezoneInputRef}
              type="text"
              value={timezoneInput}
              onChange={(e) => setTimezoneInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const input = timezoneInput.trim();
                  const match = input.match(/^([+-])?(\d{1,2})$/);
                  if (match) {
                    const sign = match[1] === '-' ? -1 : 1;
                    const value = parseInt(match[2], 10);
                    if (value >= 0 && value <= 14) {
                      setTimezone(sign * value);
                    }
                  }
                  setIsEditingTimezone(false);
                } else if (e.key === 'Escape') {
                  setIsEditingTimezone(false);
                }
              }}
              onBlur={() => {
                const input = timezoneInput.trim();
                const match = input.match(/^([+-])?(\d{1,2})$/);
                if (match) {
                  const sign = match[1] === '-' ? -1 : 1;
                  const value = parseInt(match[2], 10);
                  if (value >= 0 && value <= 14) {
                    setTimezone(sign * value);
                  }
                }
                setIsEditingTimezone(false);
              }}
              className="w-8 text-sm text-zinc-500 bg-transparent border-b border-zinc-300 dark:border-zinc-600 outline-none text-center"
              autoFocus
            />
          </div>
        ) : (
          <button
            onClick={() => {
              setTimezoneInput(timezone >= 0 ? `+${timezone}` : `${timezone}`);
              setIsEditingTimezone(true);
              setTimeout(() => timezoneInputRef.current?.select(), 0);
            }}
            className="text-zinc-500 text-sm hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            GMT{timezone >= 0 ? `+${timezone}` : timezone}
          </button>
        )}
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-8">
            {days.map((day) => (
              <div key={day.toString()} className="flex items-center gap-1">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {format(day, 'EEEE', { locale: zhCN }).replace('星期', '周')}
                </span>
                <span className="text-sm text-zinc-800 dark:text-zinc-200">
                  {format(day, 'd')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BODY */}
      <div ref={scrollRef} id="time-grid-scroll" className="flex-1 overflow-y-auto relative scrollbar-hidden">
        <div className="flex relative" ref={containerRef} style={{ minHeight: HOUR_HEIGHT * 24 }}>
          {/* Gutter - 时间标签列 */}
          <div style={{ width: GUTTER_WIDTH }} className="flex-shrink-0 sticky left-0 z-10 bg-white dark:bg-zinc-950">
            {Array.from({ length: 24 }).map((_, hour) => (
              <div key={hour} style={{ height: HOUR_HEIGHT }} className="relative">
                {/* 整点标签 - 放在格子顶部，对齐横线，第一个格子不显示 */}
                {hour !== 0 && (
                  <span className="absolute -top-2 right-3 text-[11px] text-zinc-400 dark:text-zinc-500 font-medium tabular-nums">
                    {hour < 12 ? `${hour}AM` : hour === 12 ? '12PM' : `${hour - 12}PM`}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Canvas */}
          <div ref={canvasRef} className="flex-1 relative" onMouseDown={handleMouseDown}>
            {/* Grid Lines */}
            <div className="absolute inset-0 z-0 pointer-events-none">
              {Array.from({ length: 24 }).map((_, hour) => (
                <div key={hour} style={{ height: HOUR_HEIGHT }} className="relative w-full">
                  {/* 整点线 */}
                  <div className="absolute bottom-0 left-0 right-0 h-px bg-zinc-200/80 dark:bg-zinc-700/50" />
                  
                  {/* 半点线 - 放大较多时显示 */}
                  {HOUR_HEIGHT >= 200 && (
                    <div 
                      className="absolute left-0 right-0 h-px bg-zinc-100 dark:bg-zinc-800/40"
                      style={{ top: '50%' }}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className={`absolute inset-0 grid z-0 pointer-events-none`} style={{ gridTemplateColumns: `repeat(${dayCount}, 1fr)` }}>
              {days.map((day, i) => (
                <div key={i} className={`border-r border-zinc-100 dark:border-zinc-800/50 last:border-r-0 h-full ${isSameDay(day, now) ? 'bg-red-50/10 dark:bg-red-900/5' : ''}`} />
              ))}
            </div>

            {/* Now Line */}
            {days.some(day => isSameDay(day, now)) && (
              <div
                style={{ top: nowTop }}
                className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
              >
                {/* Time Label */}
                <div 
                  className="absolute flex items-center"
                  style={{ left: -GUTTER_WIDTH }}
                >
                  <span className="bg-red-500 text-white text-[11px] font-medium px-1.5 py-0.5 rounded">
                    {format(now, 'h:mma').toUpperCase()}
                  </span>
                </div>
                {/* The Line */}
                <div className="h-[2px] w-full bg-red-500" />
              </div>
            )}

            {/* Events Layer */}
            <div className={`absolute inset-0 z-10 grid pointer-events-none`} style={{ gridTemplateColumns: `repeat(${dayCount}, 1fr)` }}>
              {days.map((day, dayIdx) => {
                const dayEvents = displayItems.filter(
                  item => isSameDay(new Date(item.startDate), day) && !item.isAllDay
                );
                
                // 如果正在这一天拖拽创建，加入虚拟事件参与布局计算
                const isCreatingOnThisDay = isDragging && dragStart && dragEnd && 
                  dragStart.dayIndex === dayIdx && dragStart.time !== dragEnd.time;
                
                let layoutMap;
                let ghostLayout;
                
                if (isCreatingOnThisDay) {
                  const actualStartMin = Math.min(dragStart!.time, dragEnd!.time);
                  const actualEndMin = Math.max(dragStart!.time, dragEnd!.time);
                  const dayDate = days[dragStart!.dayIndex];
                  
                  // 创建虚拟事件
                  const ghostEvent = {
                    id: '__ghost__',
                    startDate: addMinutes(startOfDay(dayDate), actualStartMin).getTime(),
                    endDate: addMinutes(startOfDay(dayDate), actualEndMin).getTime(),
                  };
                  
                  // 将虚拟事件加入布局计算
                  const eventsWithGhost = [...dayEvents, ghostEvent];
                  layoutMap = calculateEventLayout(eventsWithGhost);
                  ghostLayout = layoutMap.get('__ghost__');
                } else {
                  layoutMap = calculateEventLayout(dayEvents);
                }
                
                return (
                  <div key={day.toString()} className="relative h-full">
                    {dayEvents.map(item => (
                      <div key={item.id} className="event-block pointer-events-auto">
                        <EventBlock
                          event={item}
                          layout={layoutMap.get(item.id)}
                          onToggle={toggleTask}
                        />
                      </div>
                    ))}
                    
                    {/* Ghost Event - 使用布局计算的位置 */}
                    {isCreatingOnThisDay && ghostLayout && (
                      <div
                        style={{
                          position: 'absolute',
                          top: `${(Math.min(dragStart!.time, dragEnd!.time) / 60) * HOUR_HEIGHT}px`,
                          height: `${(Math.abs(dragEnd!.time - dragStart!.time) / 60) * HOUR_HEIGHT}px`,
                          left: `${ghostLayout.leftPercent}%`,
                          width: `${ghostLayout.widthPercent}%`,
                        }}
                        className="z-30 bg-blue-500/20 border-2 border-blue-500 rounded-md pointer-events-none"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
