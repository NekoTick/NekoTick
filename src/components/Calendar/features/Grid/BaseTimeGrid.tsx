/**
 * BaseTimeGrid - Base time grid component
 * 
 * Unifies common logic for DayGrid and TimeGrid
 * Configures different behaviors via props
 */

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { format, getHours, getMinutes, startOfDay, endOfDay } from 'date-fns';

import { useCalendarStore } from '@/stores/useCalendarStore';
import { useGroupStore } from '@/stores/useGroupStore';
import { useCalendarEvents } from '../../hooks/useCalendarEvents';
import { EventBlock } from '../Event/EventBlock';
import { AllDayArea } from './AllDayArea';
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
  const allDayAreaRef = useRef<HTMLDivElement>(null);

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
    originalIsAllDay: boolean;
  } | null>(null);

  // All-day drop target state
  const [isAllDayDropTarget, setIsAllDayDropTarget] = useState(false);

  // Current drag time indicators (for gutter display)
  const [dragTimeIndicator, setDragTimeIndicator] = useState<{
    startMinutes: number;
    endMinutes: number;
  } | null>(null);

  const columnCount = days.length;
  const snapMinutes = getSnapMinutes(hourHeight);
  
  // Use configured day start time or default
  const dayStartMinutes = dayStartTime ?? DEFAULT_DAY_START_MINUTES;

  // Separate all-day and timed events
  const { allDayEvents, timedEvents } = useMemo(() => {
    const allDay: typeof displayItems = [];
    const timed: typeof displayItems = [];
    
    for (const item of displayItems) {
      if (item.isAllDay) {
        allDay.push(item);
      } else {
        timed.push(item);
      }
    }
    
    return { allDayEvents: allDay, timedEvents: timed };
  }, [displayItems]);

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
    let snappedMinutes = Math.round(totalMinutes / snapMinutes) * snapMinutes;
    // Ensure snapped minutes stays within valid range (0-1439)
    snappedMinutes = Math.max(0, Math.min(1439, snappedMinutes));

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
    // Initialize time indicator for drag-to-create
    setDragTimeIndicator({
      startMinutes: pos.minutes,
      endMinutes: pos.minutes,
    });
  }, [getPositionFromMouse, closeEditingEvent]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    // Check if mouse is in all-day area (for event drag conversion)
    if (eventDrag && allDayAreaRef.current) {
      const allDayRect = allDayAreaRef.current.getBoundingClientRect();
      const isInAllDayArea = e.clientY >= allDayRect.top && e.clientY <= allDayRect.bottom;
      setIsAllDayDropTarget(isInAllDayArea && eventDrag.edge === null && !eventDrag.originalIsAllDay);
    }

    // Handle create drag
    if (isDragging && dragStart && scrollRef.current) {
      const scrollRect = scrollRef.current.getBoundingClientRect();
      const relativeY = e.clientY - scrollRect.top + scrollRef.current.scrollTop;
      const totalMinutes = pixelsToMinutes(relativeY, hourHeight, dayStartMinutes);
      let snappedMinutes = Math.round(totalMinutes / snapMinutes) * snapMinutes;
      // Ensure snapped minutes stays within valid range (0-1439)
      snappedMinutes = Math.max(0, Math.min(1439, snappedMinutes));
      setDragEnd({ minutes: snappedMinutes });
      // Update time indicator for drag-to-create
      const startMin = Math.min(dragStart.minutes, snappedMinutes);
      const endMin = Math.max(dragStart.minutes, snappedMinutes);
      setDragTimeIndicator({
        startMinutes: startMin,
        endMinutes: endMin,
      });
    }

    // Handle event drag
    if (eventDrag && scrollRef.current) {
      // If dragging an all-day event, we need different handling
      if (eventDrag.originalIsAllDay) {
        // For all-day events being dragged out, calculate target time based on mouse position
        const scrollRect = scrollRef.current.getBoundingClientRect();
        const allDayRect = allDayAreaRef.current?.getBoundingClientRect();
        
        // Only update if mouse is in the time grid area (below all-day area)
        if (allDayRect && e.clientY > allDayRect.bottom && canvasRef.current) {
          const relativeY = e.clientY - scrollRect.top + scrollRef.current.scrollTop;
          const totalMinutes = pixelsToMinutes(relativeY, hourHeight, dayStartMinutes);
          let snappedMinutes = Math.round(totalMinutes / snapMinutes) * snapMinutes;
          snappedMinutes = Math.max(0, Math.min(1439, snappedMinutes));
          
          // Calculate which day column the mouse is over
          const canvasRect = canvasRef.current.getBoundingClientRect();
          const relativeX = e.clientX - canvasRect.left;
          const dayWidth = canvasRect.width / columnCount;
          const dayIndex = Math.max(0, Math.min(columnCount - 1, Math.floor(relativeX / dayWidth)));
          
          const event = displayItems.find(item => item.id === eventDrag.eventId);
          if (event) {
            const targetDay = days[dayIndex];
            if (targetDay) {
              // Create new start/end times (default 1 hour duration)
              const newStartDate = new Date(targetDay);
              newStartDate.setHours(Math.floor(snappedMinutes / 60), snappedMinutes % 60, 0, 0);
              const newEndDate = new Date(newStartDate.getTime() + 60 * 60 * 1000); // 1 hour later
              
              // Update event in real-time (convert to timed event)
              updateEvent(eventDrag.eventId, {
                isAllDay: false,
                startDate: newStartDate.getTime(),
                endDate: newEndDate.getTime(),
              });
              
              // Show time indicator
              setDragTimeIndicator({
                startMinutes: snappedMinutes,
                endMinutes: snappedMinutes + 60,
              });
            }
          }
        } else if (allDayRect && e.clientY <= allDayRect.bottom) {
          // Mouse is back in all-day area, revert to all-day event
          const event = displayItems.find(item => item.id === eventDrag.eventId);
          if (event && !event.isAllDay) {
            updateEvent(eventDrag.eventId, {
              isAllDay: true,
              startDate: eventDrag.originalStart,
              endDate: eventDrag.originalEnd,
            });
          }
          setDragTimeIndicator(null);
        }
        return;
      }
      
      const scrollDelta = scrollRef.current.scrollTop - eventDrag.startScrollTop;
      const deltaY = e.clientY - eventDrag.startY + scrollDelta;
      // Use pixelsDeltaToMinutes for relative movement (no day start offset)
      const deltaMinutes = Math.round(pixelsDeltaToMinutes(deltaY, hourHeight) / snapMinutes) * snapMinutes;
      const deltaMs = deltaMinutes * 60 * 1000;

      const event = displayItems.find(item => item.id === eventDrag.eventId);
      if (!event) return;

      // Get visual day boundaries for the event (use current event position to handle cross-day scenarios)
      const boundaries = getVisualDayBoundaries(event.startDate, dayStartMinutes);
      const minDuration = Math.max(snapMinutes, 5) * 60 * 1000;

      if (eventDrag.edge === 'top') {
        // Dragging from top edge - the bottom (originalEnd) is the anchor
        // Clamp anchor to boundaries in case event was moved
        const anchor = Math.max(boundaries.start, Math.min(boundaries.end, eventDrag.originalEnd));
        const draggedPosition = eventDrag.originalStart + deltaMs;
        
        // Clamp to visual day boundaries
        const clampedPosition = Math.max(boundaries.start, Math.min(boundaries.end, draggedPosition));
        
        // Calculate new start and end based on dragged position relative to anchor
        let newStart: number;
        let newEnd: number;
        
        if (clampedPosition <= anchor) {
          // Normal case: position is at or above anchor
          newStart = clampedPosition;
          newEnd = anchor;
        } else {
          // Flipped case: position is below anchor
          newStart = anchor;
          newEnd = clampedPosition;
        }
        
        // Ensure minimum duration while respecting boundaries
        if (newEnd - newStart < minDuration) {
          if (clampedPosition <= anchor) {
            // Try to extend start upward
            newStart = Math.max(boundaries.start, newEnd - minDuration);
            // If still not enough, extend end downward
            if (newEnd - newStart < minDuration) {
              newEnd = Math.min(boundaries.end, newStart + minDuration);
            }
          } else {
            // Try to extend end downward
            newEnd = Math.min(boundaries.end, newStart + minDuration);
            // If still not enough, extend start upward
            if (newEnd - newStart < minDuration) {
              newStart = Math.max(boundaries.start, newEnd - minDuration);
            }
          }
        }
        
        updateEvent(eventDrag.eventId, { startDate: newStart, endDate: newEnd });
        
        // Update time indicator
        setDragTimeIndicator({
          startMinutes: new Date(newStart).getHours() * 60 + new Date(newStart).getMinutes(),
          endMinutes: new Date(newEnd).getHours() * 60 + new Date(newEnd).getMinutes(),
        });
        
      } else if (eventDrag.edge === 'bottom') {
        // Dragging from bottom edge - the top (originalStart) is the anchor
        // Clamp anchor to boundaries in case event was moved
        const anchor = Math.max(boundaries.start, Math.min(boundaries.end, eventDrag.originalStart));
        const draggedPosition = eventDrag.originalEnd + deltaMs;
        
        // Clamp to visual day boundaries
        const clampedPosition = Math.max(boundaries.start, Math.min(boundaries.end, draggedPosition));
        
        // Calculate new start and end based on dragged position relative to anchor
        let newStart: number;
        let newEnd: number;
        
        if (clampedPosition >= anchor) {
          // Normal case: position is at or below anchor
          newStart = anchor;
          newEnd = clampedPosition;
        } else {
          // Flipped case: position is above anchor
          newStart = clampedPosition;
          newEnd = anchor;
        }
        
        // Ensure minimum duration while respecting boundaries
        if (newEnd - newStart < minDuration) {
          if (clampedPosition >= anchor) {
            // Try to extend end downward
            newEnd = Math.min(boundaries.end, newStart + minDuration);
            // If still not enough, extend start upward
            if (newEnd - newStart < minDuration) {
              newStart = Math.max(boundaries.start, newEnd - minDuration);
            }
          } else {
            // Try to extend start upward
            newStart = Math.max(boundaries.start, newEnd - minDuration);
            // If still not enough, extend end downward
            if (newEnd - newStart < minDuration) {
              newEnd = Math.min(boundaries.end, newStart + minDuration);
            }
          }
        }
        
        updateEvent(eventDrag.eventId, { startDate: newStart, endDate: newEnd });
        
        // Update time indicator
        setDragTimeIndicator({
          startMinutes: new Date(newStart).getHours() * 60 + new Date(newStart).getMinutes(),
          endMinutes: new Date(newEnd).getHours() * 60 + new Date(newEnd).getMinutes(),
        });
        
      } else {
        // Move entire event
        const newStart = eventDrag.originalStart + deltaMs;
        const newEnd = eventDrag.originalEnd + deltaMs;
        const eventDuration = eventDrag.originalEnd - eventDrag.originalStart;

        // Clamp to boundaries while preserving duration
        let clampedStart = newStart;
        let clampedEnd = newEnd;
        
        if (newStart < boundaries.start) {
          clampedStart = boundaries.start;
          clampedEnd = boundaries.start + eventDuration;
        } else if (newEnd > boundaries.end) {
          clampedEnd = boundaries.end;
          clampedStart = boundaries.end - eventDuration;
        }

        // Only update if within boundaries
        if (clampedStart >= boundaries.start && clampedEnd <= boundaries.end) {
          updateEvent(eventDrag.eventId, { 
            startDate: clampedStart, 
            endDate: clampedEnd 
          });
          // Update time indicator
          setDragTimeIndicator({
            startMinutes: new Date(clampedStart).getHours() * 60 + new Date(clampedStart).getMinutes(),
            endMinutes: new Date(clampedEnd).getHours() * 60 + new Date(clampedEnd).getMinutes(),
          });
        }
      }
    }
  }, [isDragging, dragStart, eventDrag, hourHeight, snapMinutes, displayItems, updateEvent, dayStartMinutes, columnCount, days]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    // Complete create drag
    if (isDragging && dragStart && dragEnd) {
      setIsDragging(false);

      if (dragStart.minutes !== dragEnd.minutes) {
        const dayDate = days[dragStart.dayIndex];
        
        // Safety check: ensure dayDate exists
        if (!dayDate) {
          setDragStart(null);
          setDragEnd(null);
          setDragTimeIndicator(null);
          return;
        }
        
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
          setDragTimeIndicator(null);
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
      setDragTimeIndicator(null);
    }

    // Complete event drag
    if (eventDrag) {
      // Check if dropped in all-day area - convert to all-day event
      if (isAllDayDropTarget && eventDrag.edge === null && !eventDrag.originalIsAllDay) {
        const event = displayItems.find(item => item.id === eventDrag.eventId);
        if (event) {
          // Convert to all-day event
          const eventDate = new Date(event.startDate);
          const dayStart = startOfDay(eventDate);
          const dayEnd = endOfDay(eventDate);
          
          updateEvent(eventDrag.eventId, {
            isAllDay: true,
            startDate: dayStart.getTime(),
            endDate: dayEnd.getTime(),
          });
        }
      }
      // Check if all-day event was dragged into time grid - already converted during drag
      // Just need to clean up state
      else if (eventDrag.originalIsAllDay) {
        // Event was already updated during drag, nothing more to do
      }
      
      setEventDrag(null);
      setDragTimeIndicator(null);
      setIsAllDayDropTarget(false);
    }
  }, [isDragging, dragStart, dragEnd, eventDrag, days, addEvent, setEditingEventId, dayStartMinutes, isAllDayDropTarget, displayItems, updateEvent]);

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
      originalIsAllDay: event.isAllDay,
    });
  }, [displayItems]);

  // Handle creating all-day event from AllDayArea
  const handleCreateAllDay = useCallback((startDay: Date, endDay: Date) => {
    const newEventId = addEvent({
      content: '',
      startDate: startOfDay(startDay).getTime(),
      endDate: endOfDay(endDay).getTime(),
      isAllDay: true,
    });
    
    // Open editor
    setEditingEventId(newEventId);
  }, [addEvent, setEditingEventId]);

  // Handle dragging all-day event out of AllDayArea
  const handleAllDayEventDragStart = useCallback((eventId: string, clientY: number) => {
    const event = displayItems.find(item => item.id === eventId);
    if (!event) return;

    setEventDrag({
      eventId,
      edge: null,
      startY: clientY,
      startScrollTop: scrollRef.current?.scrollTop || 0,
      originalStart: event.startDate,
      originalEnd: event.endDate,
      originalIsAllDay: true,
    });
  }, [displayItems]);

  // Handle escape key to cancel drag
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Cancel drag-to-create
      if (isDragging) {
        setIsDragging(false);
        setDragStart(null);
        setDragEnd(null);
        setDragTimeIndicator(null);
      }
      
      // Cancel event drag and restore original state
      if (eventDrag) {
        // Restore original event state
        updateEvent(eventDrag.eventId, {
          isAllDay: eventDrag.originalIsAllDay,
          startDate: eventDrag.originalStart,
          endDate: eventDrag.originalEnd,
        });
        
        setEventDrag(null);
        setDragTimeIndicator(null);
        setIsAllDayDropTarget(false);
      }
    }
  }, [isDragging, eventDrag, updateEvent]);

  // Global event listeners
  useEffect(() => {
    if (isDragging || eventDrag) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDragging, eventDrag, handleMouseMove, handleMouseUp, handleKeyDown]);

  // ============ Render ============

  const nowHour = getHours(now);
  const nowMinutes = getMinutes(now);
  const nowDisplayPosition = hourToDisplayPosition(nowHour, dayStartMinutes);
  const nowTop = nowDisplayPosition * hourHeight + (nowMinutes / 60) * hourHeight;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950 select-none relative">
      {/* All-day events area */}
      <div ref={allDayAreaRef}>
        <AllDayArea
          days={days}
          allDayEvents={allDayEvents}
          gutterWidth={GUTTER_WIDTH}
          isDropTarget={isAllDayDropTarget}
          onCreateAllDay={handleCreateAllDay}
          onEventDragStart={handleAllDayEventDragStart}
        />
      </div>

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
                const dayEvents = timedEvents.filter(
                  item => isEventInVisualDay(item.startDate, day, dayStartMinutes)
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

                    {/* Ghost event for drag-to-create */}
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
