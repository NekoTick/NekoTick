/**
 * BaseTimeGrid - Base time grid component
 * 
 * Unifies common logic for DayGrid and TimeGrid
 * Configures different behaviors via props
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { format, isSameDay, getHours, getMinutes, startOfDay, addMinutes } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useCalendarStore } from '@/stores/useCalendarStore';
import { useGroupStore } from '@/stores/useGroupStore';
import { useCalendarEvents } from '../../hooks/useCalendarEvents';
import { EventBlock } from '../Event/EventBlock';
import { calculateEventLayout } from '../../utils/eventLayout';
import { getSnapMinutes, pixelsToMinutes, CALENDAR_CONSTANTS } from '../../utils/timeUtils';

const GUTTER_WIDTH = CALENDAR_CONSTANTS.GUTTER_WIDTH as number;

// ============ Types ============

interface BaseTimeGridProps {
  days: Date[];
}

// ============ Component ============

export function BaseTimeGrid({ days }: BaseTimeGridProps) {
  const { 
    addEvent, setEditingEventId, closeEditingEvent, 
    timezone, setTimezone, hourHeight, updateEvent 
  } = useCalendarStore();
  const { toggleTask } = useGroupStore();
  const displayItems = useCalendarEvents();

  const [now, setNow] = useState(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const timezoneInputRef = useRef<HTMLInputElement>(null);

  // Drag-to-create state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ dayIndex: number; minutes: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ minutes: number } | null>(null);

  // Event drag state
  const [eventDrag, setEventDrag] = useState<{
    eventId: string;
    edge: 'top' | 'bottom' | null;
    startY: number;
    startScrollTop: number;
    originalStart: number;
    originalEnd: number;
  } | null>(null);

  // Timezone editing state
  const [isEditingTimezone, setIsEditingTimezone] = useState(false);
  const [timezoneInput, setTimezoneInput] = useState('');

  const columnCount = days.length;
  const snapMinutes = getSnapMinutes(hourHeight);

  // Update current time
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Initial scroll to current time
  useEffect(() => {
    if (scrollRef.current) {
      const currentHour = now.getHours();
      scrollRef.current.scrollTop = (currentHour - 2) * hourHeight;
    }
  }, []);

  // ============ Coordinate Calculation ============

  const getPositionFromMouse = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current || !scrollRef.current) return null;

    const rect = canvasRef.current.getBoundingClientRect();
    const scrollRect = scrollRef.current.getBoundingClientRect();

    const relativeX = clientX - rect.left;
    const dayWidth = rect.width / columnCount;
    const dayIndex = Math.floor(relativeX / dayWidth);

    if (dayIndex < 0 || dayIndex >= columnCount) return null;

    const relativeY = clientY - scrollRect.top + scrollRef.current.scrollTop;
    const totalMinutes = pixelsToMinutes(relativeY, hourHeight);
    const snappedMinutes = Math.round(totalMinutes / snapMinutes) * snapMinutes;

    return { dayIndex, minutes: snappedMinutes };
  }, [columnCount, hourHeight, snapMinutes]);

  // ============ Drag to Create Event ============

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.event-block')) return;

    const pos = getPositionFromMouse(e.clientX, e.clientY);
    if (!pos) return;

    closeEditingEvent();
    setIsDragging(true);
    setDragStart(pos);
    setDragEnd({ minutes: pos.minutes });
  }, [getPositionFromMouse, closeEditingEvent]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    // Handle create drag
    if (isDragging && dragStart && scrollRef.current) {
      const scrollRect = scrollRef.current.getBoundingClientRect();
      const relativeY = e.clientY - scrollRect.top + scrollRef.current.scrollTop;
      const totalMinutes = pixelsToMinutes(relativeY, hourHeight);
      const snappedMinutes = Math.round(totalMinutes / snapMinutes) * snapMinutes;
      setDragEnd({ minutes: snappedMinutes });
    }

    // Handle event drag
    if (eventDrag && scrollRef.current) {
      const scrollDelta = scrollRef.current.scrollTop - eventDrag.startScrollTop;
      const deltaY = e.clientY - eventDrag.startY + scrollDelta;
      const deltaMinutes = Math.round(pixelsToMinutes(deltaY, hourHeight) / snapMinutes) * snapMinutes;
      const deltaMs = deltaMinutes * 60 * 1000;

      const event = displayItems.find(item => item.id === eventDrag.eventId);
      if (!event) return;

      if (eventDrag.edge === 'top') {
        // Adjust start time
        const newStart = eventDrag.originalStart + deltaMs;
        const minDuration = Math.max(snapMinutes, 5) * 60 * 1000;
        if (newStart < eventDrag.originalEnd - minDuration) {
          updateEvent(eventDrag.eventId, { startDate: newStart });
        }
      } else if (eventDrag.edge === 'bottom') {
        // Adjust end time
        const newEnd = eventDrag.originalEnd + deltaMs;
        const minDuration = Math.max(snapMinutes, 5) * 60 * 1000;
        if (newEnd > eventDrag.originalStart + minDuration) {
          updateEvent(eventDrag.eventId, { endDate: newEnd });
        }
      } else {
        // Move entire event
        const newStart = eventDrag.originalStart + deltaMs;
        const newEnd = eventDrag.originalEnd + deltaMs;

        const startOfDayMs = new Date(eventDrag.originalStart).setHours(0, 0, 0, 0);
        const endOfDayMs = startOfDayMs + 24 * 60 * 60 * 1000;

        if (newStart >= startOfDayMs && newEnd <= endOfDayMs) {
          updateEvent(eventDrag.eventId, { 
            startDate: newStart, 
            endDate: newEnd 
          });
        }
      }
    }
  }, [isDragging, dragStart, eventDrag, hourHeight, snapMinutes, displayItems, updateEvent]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    // Complete create drag
    if (isDragging && dragStart && dragEnd) {
      setIsDragging(false);

      if (dragStart.minutes !== dragEnd.minutes) {
        const dayDate = days[dragStart.dayIndex];
        const actualStart = Math.min(dragStart.minutes, dragEnd.minutes);
        const actualEnd = Math.max(dragStart.minutes, dragEnd.minutes);

        const startDate = addMinutes(startOfDay(dayDate), actualStart);
        const endDate = addMinutes(startOfDay(dayDate), actualEnd);

        const newEventId = addEvent({
          title: '',
          startDate: startDate.getTime(),
          endDate: endDate.getTime(),
          isAllDay: false,
          color: 'blue',
        });

        setEditingEventId(newEventId, { x: e.clientX, y: e.clientY });
      }

      setDragStart(null);
      setDragEnd(null);
    }

    // Complete event drag
    if (eventDrag) {
      setEventDrag(null);
    }
  }, [isDragging, dragStart, dragEnd, eventDrag, days, addEvent, setEditingEventId]);

  // Event drag start
  const handleEventDragStart = useCallback((eventId: string, edge: 'top' | 'bottom' | null, clientY: number) => {
    const event = displayItems.find(item => item.id === eventId);
    if (!event) return;

    setEventDrag({
      eventId,
      edge,
      startY: clientY,
      startScrollTop: scrollRef.current?.scrollTop || 0,
      originalStart: event.startDate,
      originalEnd: event.endDate,
    });
  }, [displayItems]);

  // Global event listeners
  useEffect(() => {
    if (isDragging || eventDrag) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, eventDrag, handleMouseMove, handleMouseUp]);

  // ============ Timezone Editing ============

  const handleTimezoneSubmit = useCallback(() => {
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
  }, [timezoneInput, setTimezone]);

  // ============ Render ============

  const nowTop = getHours(now) * hourHeight + (getMinutes(now) / 60) * hourHeight;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950 select-none relative">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-zinc-100 dark:border-zinc-800/50">
        {/* Timezone */}
        {isEditingTimezone ? (
          <div className="flex items-center">
            <span className="text-zinc-500 text-sm">GMT</span>
            <input
              ref={timezoneInputRef}
              type="text"
              value={timezoneInput}
              onChange={(e) => setTimezoneInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTimezoneSubmit();
                else if (e.key === 'Escape') setIsEditingTimezone(false);
              }}
              onBlur={handleTimezoneSubmit}
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

        {/* Date header */}
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

      {/* Main body */}
      <div ref={scrollRef} id="time-grid-scroll" className="flex-1 overflow-y-auto relative scrollbar-hidden">
        <div className="flex relative" style={{ minHeight: hourHeight * 24 }}>
          {/* Time labels column */}
          <div style={{ width: GUTTER_WIDTH }} className="flex-shrink-0 sticky left-0 z-10 bg-white dark:bg-zinc-950">
            {Array.from({ length: 24 }).map((_, hour) => (
              <div key={hour} style={{ height: hourHeight }} className="relative">
                {hour !== 0 && (
                  <span className="absolute -top-2 right-3 text-[11px] text-zinc-400 dark:text-zinc-500 font-medium tabular-nums">
                    {hour < 12 ? `${hour}AM` : hour === 12 ? '12PM' : `${hour - 12}PM`}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Canvas */}
          <div ref={canvasRef} className="flex-1 relative" onMouseDown={handleCanvasMouseDown}>
            {/* Grid lines */}
            <div className="absolute inset-0 z-0 pointer-events-none">
              {Array.from({ length: 24 }).map((_, hour) => (
                <div key={hour} style={{ height: hourHeight }} className="relative w-full">
                  <div className="absolute bottom-0 left-0 right-0 h-px bg-zinc-200/80 dark:bg-zinc-700/50" />
                  {hourHeight >= 200 && (
                    <div className="absolute left-0 right-0 h-px bg-zinc-100 dark:bg-zinc-800/40" style={{ top: '50%' }} />
                  )}
                </div>
              ))}
            </div>

            {/* Column dividers */}
            <div 
              className="absolute inset-0 grid z-0 pointer-events-none" 
              style={{ gridTemplateColumns: `repeat(${columnCount}, 1fr)` }}
            >
              {days.map((day, i) => (
                <div 
                  key={i} 
                  className={`border-r border-zinc-100 dark:border-zinc-800/50 last:border-r-0 h-full ${
                    isSameDay(day, now) ? 'bg-red-50/10 dark:bg-red-900/5' : ''
                  }`} 
                />
              ))}
            </div>

            {/* Current time line */}
            {days.some(day => isSameDay(day, now)) && (
              <div style={{ top: nowTop }} className="absolute left-0 right-0 z-20 flex items-center pointer-events-none">
                <div className="absolute flex items-center" style={{ left: -GUTTER_WIDTH }}>
                  <span className="bg-red-500 text-white text-[11px] font-medium px-1.5 py-0.5 rounded">
                    {format(now, 'h:mma').toUpperCase()}
                  </span>
                </div>
                <div className="h-[2px] w-full bg-red-500" />
              </div>
            )}

            {/* Events layer */}
            <div 
              className="absolute inset-0 z-10 grid pointer-events-none" 
              style={{ gridTemplateColumns: `repeat(${columnCount}, 1fr)` }}
            >
              {days.map((day, dayIdx) => {
                const dayEvents = displayItems.filter(
                  item => isSameDay(new Date(item.startDate), day) && !item.isAllDay
                );

                // Ghost event handling
                const isCreatingOnThisDay = isDragging && dragStart && dragEnd && 
                  dragStart.dayIndex === dayIdx && dragStart.minutes !== dragEnd.minutes;

                let layoutMap;
                let ghostLayout;

                if (isCreatingOnThisDay) {
                  const actualStartMin = Math.min(dragStart!.minutes, dragEnd!.minutes);
                  const actualEndMin = Math.max(dragStart!.minutes, dragEnd!.minutes);
                  const ghostStartTime = addMinutes(startOfDay(day), actualStartMin).getTime();
                  const ghostEndTime = addMinutes(startOfDay(day), actualEndMin).getTime();

                  const hasOverlap = dayEvents.some(event =>
                    event.startDate < ghostEndTime && event.endDate > ghostStartTime
                  );

                  if (hasOverlap) {
                    const ghostEvent = {
                      id: '__ghost__',
                      startDate: ghostStartTime,
                      endDate: ghostEndTime,
                      color: 'blue' as const,
                      completed: false,
                    };
                    layoutMap = calculateEventLayout([...dayEvents, ghostEvent]);
                    ghostLayout = layoutMap.get('__ghost__');
                  } else {
                    layoutMap = calculateEventLayout(dayEvents);
                    ghostLayout = { id: '__ghost__', column: 0, totalColumns: 1, leftPercent: 0, widthPercent: 100 };
                  }
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
                          hourHeight={hourHeight}
                          onToggle={toggleTask}
                          onDragStart={handleEventDragStart}
                        />
                      </div>
                    ))}

                    {/* Ghost event */}
                    {isCreatingOnThisDay && ghostLayout && (
                      <div
                        style={{
                          position: 'absolute',
                          top: `${(Math.min(dragStart!.minutes, dragEnd!.minutes) / 60) * hourHeight}px`,
                          height: `${(Math.abs(dragEnd!.minutes - dragStart!.minutes) / 60) * hourHeight}px`,
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
