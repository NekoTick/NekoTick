/**
 * BaseTimeGrid - Base time grid component
 * 
 * Unifies common logic for DayGrid and TimeGrid
 * Configures different behaviors via props
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { format, getHours, getMinutes } from 'date-fns';

import { useCalendarStore } from '@/stores/useCalendarStore';
import { useGroupStore } from '@/stores/useGroupStore';
import { useCalendarEvents } from '../../hooks/useCalendarEvents';
import { EventBlock } from '../Event/EventBlock';
import { calculateEventLayout } from '../../utils/eventLayout';
import { 
  getSnapMinutes, 
  pixelsToMinutes, 
  pixelsDeltaToMinutes, 
  CALENDAR_CONSTANTS, 
  displayPositionToHour, 
  hourToDisplayPosition, 
  minutesToPixels,
  DEFAULT_DAY_START_MINUTES,
  isEventInVisualDay,
  getVisualDayBoundaries
} from '../../utils/timeUtils';

const GUTTER_WIDTH = CALENDAR_CONSTANTS.GUTTER_WIDTH as number;

// ============ Types ============

interface BaseTimeGridProps {
  days: Date[];
}

// ============ Component ============

export function BaseTimeGrid({ days }: BaseTimeGridProps) {
  const { 
    addEvent, setEditingEventId, closeEditingEvent, 
    hourHeight, updateEvent, use24Hour, dayStartTime
  } = useCalendarStore();
  const { toggleTask } = useGroupStore();
  const displayItems = useCalendarEvents();

  const [now, setNow] = useState(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

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

  // Current drag time indicators (for gutter display)
  const [dragTimeIndicator, setDragTimeIndicator] = useState<{
    startMinutes: number;
    endMinutes: number;
  } | null>(null);

  const columnCount = days.length;
  const snapMinutes = getSnapMinutes(hourHeight);
  
  // Use configured day start time or default
  const dayStartMinutes = dayStartTime ?? DEFAULT_DAY_START_MINUTES;

  // Update current time
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Initial scroll to current time
  useEffect(() => {
    if (scrollRef.current) {
      const currentHour = now.getHours();
      const displayPosition = hourToDisplayPosition(currentHour, dayStartMinutes);
      // Scroll to show current time near the top, with some padding
      scrollRef.current.scrollTop = Math.max(0, (displayPosition - 1) * hourHeight);
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
    const totalMinutes = pixelsToMinutes(relativeY, hourHeight, dayStartMinutes);
    const snappedMinutes = Math.round(totalMinutes / snapMinutes) * snapMinutes;

    return { dayIndex, minutes: snappedMinutes };
  }, [columnCount, hourHeight, snapMinutes, dayStartMinutes]);

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
      const totalMinutes = pixelsToMinutes(relativeY, hourHeight, dayStartMinutes);
      const snappedMinutes = Math.round(totalMinutes / snapMinutes) * snapMinutes;
      setDragEnd({ minutes: snappedMinutes });
    }

    // Handle event drag
    if (eventDrag && scrollRef.current) {
      const scrollDelta = scrollRef.current.scrollTop - eventDrag.startScrollTop;
      const deltaY = e.clientY - eventDrag.startY + scrollDelta;
      // Use pixelsDeltaToMinutes for relative movement (no day start offset)
      const deltaMinutes = Math.round(pixelsDeltaToMinutes(deltaY, hourHeight) / snapMinutes) * snapMinutes;
      const deltaMs = deltaMinutes * 60 * 1000;

      const event = displayItems.find(item => item.id === eventDrag.eventId);
      if (!event) return;

      if (eventDrag.edge === 'top') {
        // Adjust start time
        const newStart = eventDrag.originalStart + deltaMs;
        const minDuration = Math.max(snapMinutes, 5) * 60 * 1000;
        
        // Get visual day boundaries for the event
        const boundaries = getVisualDayBoundaries(eventDrag.originalStart, dayStartMinutes);
        
        // Check boundaries: new start must be within visual day and maintain minimum duration
        if (newStart >= boundaries.start && newStart < eventDrag.originalEnd - minDuration) {
          updateEvent(eventDrag.eventId, { startDate: newStart });
          // Update time indicator
          const startDate = new Date(newStart);
          const endDate = new Date(event.endDate);
          setDragTimeIndicator({
            startMinutes: startDate.getHours() * 60 + startDate.getMinutes(),
            endMinutes: endDate.getHours() * 60 + endDate.getMinutes(),
          });
        }
      } else if (eventDrag.edge === 'bottom') {
        // Adjust end time
        const newEnd = eventDrag.originalEnd + deltaMs;
        const minDuration = Math.max(snapMinutes, 5) * 60 * 1000;
        
        // Get visual day boundaries for the event
        const boundaries = getVisualDayBoundaries(eventDrag.originalStart, dayStartMinutes);
        
        // Check boundaries: new end must be within visual day and maintain minimum duration
        if (newEnd <= boundaries.end && newEnd > eventDrag.originalStart + minDuration) {
          updateEvent(eventDrag.eventId, { endDate: newEnd });
          // Update time indicator
          const startDate = new Date(event.startDate);
          const endDate = new Date(newEnd);
          setDragTimeIndicator({
            startMinutes: startDate.getHours() * 60 + startDate.getMinutes(),
            endMinutes: endDate.getHours() * 60 + endDate.getMinutes(),
          });
        }
      } else {
        // Move entire event
        const newStart = eventDrag.originalStart + deltaMs;
        const newEnd = eventDrag.originalEnd + deltaMs;

        // Get visual day boundaries using the helper function
        const boundaries = getVisualDayBoundaries(eventDrag.originalStart, dayStartMinutes);

        if (newStart >= boundaries.start && newEnd <= boundaries.end) {
          updateEvent(eventDrag.eventId, { 
            startDate: newStart, 
            endDate: newEnd 
          });
          // Update time indicator
          const startDate = new Date(newStart);
          const endDate = new Date(newEnd);
          setDragTimeIndicator({
            startMinutes: startDate.getHours() * 60 + startDate.getMinutes(),
            endMinutes: endDate.getHours() * 60 + endDate.getMinutes(),
          });
        }
      }
    }
  }, [isDragging, dragStart, eventDrag, hourHeight, snapMinutes, displayItems, updateEvent, dayStartMinutes]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    // Complete create drag
    if (isDragging && dragStart && dragEnd) {
      setIsDragging(false);

      if (dragStart.minutes !== dragEnd.minutes) {
        const dayDate = days[dragStart.dayIndex];
        const actualStartMinutes = Math.min(dragStart.minutes, dragEnd.minutes);
        const actualEndMinutes = Math.max(dragStart.minutes, dragEnd.minutes);

        // Calculate the correct date based on visual day
        // The visual day starts at dayStartMinutes, so we need to handle the case
        // where the time is before dayStartMinutes (belongs to next calendar day)
        let startDate: Date;
        let endDate: Date;
        
        // Check if the drag spans across the dayStartMinutes boundary
        // This happens when one time is before dayStartMinutes and the other is after
        const startBeforeDayStart = actualStartMinutes < dayStartMinutes;
        const endBeforeDayStart = actualEndMinutes < dayStartMinutes;
        
        if (startBeforeDayStart && !endBeforeDayStart) {
          // Edge case: drag spans across the day boundary (e.g., 2:00 AM to 6:00 AM when dayStart is 5:00 AM)
          // This is an invalid selection in our visual day model, so we should not create the event
          // Instead, just reset the drag state
          setDragStart(null);
          setDragEnd(null);
          return;
        }
        
        if (startBeforeDayStart) {
          // Time is in the "late night" portion, belongs to next calendar day
          startDate = new Date(dayDate);
          startDate.setDate(startDate.getDate() + 1);
          startDate.setHours(Math.floor(actualStartMinutes / 60), actualStartMinutes % 60, 0, 0);
        } else {
          startDate = new Date(dayDate);
          startDate.setHours(Math.floor(actualStartMinutes / 60), actualStartMinutes % 60, 0, 0);
        }
        
        if (endBeforeDayStart) {
          // Time is in the "late night" portion, belongs to next calendar day
          endDate = new Date(dayDate);
          endDate.setDate(endDate.getDate() + 1);
          endDate.setHours(Math.floor(actualEndMinutes / 60), actualEndMinutes % 60, 0, 0);
        } else {
          endDate = new Date(dayDate);
          endDate.setHours(Math.floor(actualEndMinutes / 60), actualEndMinutes % 60, 0, 0);
        }

        const newEventId = addEvent({
          content: '',
          startDate: startDate.getTime(),
          endDate: endDate.getTime(),
          isAllDay: false,
        });

        setEditingEventId(newEventId, { x: e.clientX, y: e.clientY });
      }

      setDragStart(null);
      setDragEnd(null);
    }

    // Complete event drag
    if (eventDrag) {
      setEventDrag(null);
      setDragTimeIndicator(null);
    }
  }, [isDragging, dragStart, dragEnd, eventDrag, days, addEvent, setEditingEventId, dayStartMinutes]);

  // Event drag start
  const handleEventDragStart = useCallback((eventId: string, edge: 'top' | 'bottom' | null, clientY: number) => {
    const event = displayItems.find(item => item.id === eventId);
    if (!event) return;

    // Initialize time indicator with current event times
    const startDate = new Date(event.startDate);
    const endDate = new Date(event.endDate);
    setDragTimeIndicator({
      startMinutes: startDate.getHours() * 60 + startDate.getMinutes(),
      endMinutes: endDate.getHours() * 60 + endDate.getMinutes(),
    });

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

  // ============ Render ============

  const nowHour = getHours(now);
  const nowMinutes = getMinutes(now);
  const nowDisplayPosition = hourToDisplayPosition(nowHour, dayStartMinutes);
  const nowTop = nowDisplayPosition * hourHeight + (nowMinutes / 60) * hourHeight;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950 select-none relative">
      {/* Main body */}
      <div ref={scrollRef} id="time-grid-scroll" className="flex-1 overflow-y-auto relative scrollbar-hidden">
        <div className="flex relative" style={{ minHeight: hourHeight * 24 }}>
          {/* Time labels column */}
          <div style={{ width: GUTTER_WIDTH }} className="flex-shrink-0 sticky left-0 z-10 bg-white dark:bg-zinc-950">
            {Array.from({ length: 24 }).map((_, displayPos) => {
              const actualHour = displayPositionToHour(displayPos, dayStartMinutes);
              return (
                <div key={displayPos} style={{ height: hourHeight }} className="relative">
                  {displayPos !== 0 && (
                    <span className="absolute -top-2 right-3 text-[11px] text-zinc-400 dark:text-zinc-500 font-medium tabular-nums">
                      {use24Hour 
                        ? `${actualHour}:00`
                        : actualHour === 0 ? '12AM' 
                        : actualHour < 12 ? `${actualHour}AM` 
                        : actualHour === 12 ? '12PM' 
                        : `${actualHour - 12}PM`
                      }
                    </span>
                  )}
                </div>
              );
            })}
            
            {/* Drag time indicators */}
            {dragTimeIndicator && (
              <>
                {/* Start time indicator - only show if not on the hour */}
                {dragTimeIndicator.startMinutes % 60 !== 0 && (
                  <div 
                    className="absolute z-20 pointer-events-none"
                    style={{ 
                      top: `${minutesToPixels(dragTimeIndicator.startMinutes, hourHeight, dayStartMinutes)}px`,
                      right: 12,
                      transform: 'translateY(-50%)',
                    }}
                  >
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium tabular-nums">
                      :{String(dragTimeIndicator.startMinutes % 60).padStart(2, '0')}
                    </span>
                  </div>
                )}
                {/* End time indicator - only show if not on the hour */}
                {dragTimeIndicator.endMinutes % 60 !== 0 && (
                  <div 
                    className="absolute z-20 pointer-events-none"
                    style={{ 
                      top: `${minutesToPixels(dragTimeIndicator.endMinutes, hourHeight, dayStartMinutes)}px`,
                      right: 12,
                      transform: 'translateY(-50%)',
                    }}
                  >
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium tabular-nums">
                      :{String(dragTimeIndicator.endMinutes % 60).padStart(2, '0')}
                    </span>
                  </div>
                )}
              </>
            )}
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
                    isEventInVisualDay(now.getTime(), day, dayStartMinutes) ? 'bg-red-50/10 dark:bg-red-900/5' : ''
                  }`} 
                />
              ))}
            </div>

            {/* Current time line */}
            {days.some(day => isEventInVisualDay(now.getTime(), day, dayStartMinutes)) && (
              <div style={{ top: nowTop }} className="absolute left-0 right-0 z-20 flex items-center pointer-events-none">
                <div className="absolute flex items-center" style={{ left: -GUTTER_WIDTH }}>
                  <span className="bg-red-500 text-white text-[11px] font-medium px-1.5 py-0.5 rounded">
                    {use24Hour ? format(now, 'H:mm') : format(now, 'h:mma').toUpperCase()}
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
                  item => isEventInVisualDay(item.startDate, day, dayStartMinutes) && !item.isAllDay
                );

                // Ghost event handling
                const isCreatingOnThisDay = isDragging && dragStart && dragEnd && 
                  dragStart.dayIndex === dayIdx && dragStart.minutes !== dragEnd.minutes;

                let layoutMap;
                let ghostLayout;

                if (isCreatingOnThisDay) {
                  const actualStartMin = Math.min(dragStart!.minutes, dragEnd!.minutes);
                  const actualEndMin = Math.max(dragStart!.minutes, dragEnd!.minutes);
                  
                  // Check if the drag spans across the dayStartMinutes boundary
                  const startBeforeDayStart = actualStartMin < dayStartMinutes;
                  const endBeforeDayStart = actualEndMin < dayStartMinutes;
                  
                  // If drag spans across day boundary, don't show ghost (invalid selection)
                  if (startBeforeDayStart && !endBeforeDayStart) {
                    layoutMap = calculateEventLayout(dayEvents);
                  } else {
                    // Calculate ghost event times considering visual day
                    let ghostStartDate: Date;
                    let ghostEndDate: Date;
                    
                    if (startBeforeDayStart) {
                      ghostStartDate = new Date(day);
                      ghostStartDate.setDate(ghostStartDate.getDate() + 1);
                      ghostStartDate.setHours(Math.floor(actualStartMin / 60), actualStartMin % 60, 0, 0);
                    } else {
                      ghostStartDate = new Date(day);
                      ghostStartDate.setHours(Math.floor(actualStartMin / 60), actualStartMin % 60, 0, 0);
                    }
                    
                    if (endBeforeDayStart) {
                      ghostEndDate = new Date(day);
                      ghostEndDate.setDate(ghostEndDate.getDate() + 1);
                      ghostEndDate.setHours(Math.floor(actualEndMin / 60), actualEndMin % 60, 0, 0);
                    } else {
                      ghostEndDate = new Date(day);
                      ghostEndDate.setHours(Math.floor(actualEndMin / 60), actualEndMin % 60, 0, 0);
                    }
                    
                    const ghostStartTime = ghostStartDate.getTime();
                    const ghostEndTime = ghostEndDate.getTime();

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
                          dayStartMinutes={dayStartMinutes}
                        />
                      </div>
                    ))}

                    {/* Ghost event */}
                    {isCreatingOnThisDay && ghostLayout && (
                      <div
                        style={{
                          position: 'absolute',
                          top: `${minutesToPixels(Math.min(dragStart!.minutes, dragEnd!.minutes), hourHeight, dayStartMinutes)}px`,
                          height: `${(Math.abs(dragEnd!.minutes - dragStart!.minutes) / 60) * hourHeight}px`,
                          left: `${ghostLayout.leftPercent}%`,
                          width: `${ghostLayout.widthPercent}%`,
                        }}
                        className="z-30 bg-zinc-400/20 border-2 border-zinc-400 rounded-md pointer-events-none"
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
