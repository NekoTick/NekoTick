/**
 * AllDayArea - All-day events display area
 * 
 * Displays all-day events at the top of the calendar grid.
 * Supports drag-to-create and drag-to-convert interactions.
 */

import { useMemo, useCallback, useState, useRef } from 'react';
import { startOfDay, differenceInDays } from 'date-fns';
import { Check } from 'lucide-react';

import { useCalendarStore } from '@/stores/useCalendarStore';
import { useGroupStore } from '@/stores/useGroupStore';
import type { CalendarDisplayItem } from '../../hooks/useCalendarEvents';

// ============ Constants ============

const MAX_VISIBLE_ROWS = 3;
const EVENT_HEIGHT = 22;
const EVENT_GAP = 2;
const MIN_AREA_HEIGHT = 28;

// ============ Color Styles ============

const COLOR_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  blue: {
    bg: 'bg-blue-100/80 dark:bg-blue-900/40',
    text: 'text-blue-700 dark:text-blue-200',
    border: 'border-blue-300 dark:border-blue-600',
  },
  red: {
    bg: 'bg-rose-100/80 dark:bg-rose-900/40',
    text: 'text-rose-700 dark:text-rose-200',
    border: 'border-rose-300 dark:border-rose-600',
  },
  green: {
    bg: 'bg-emerald-100/80 dark:bg-emerald-900/40',
    text: 'text-emerald-700 dark:text-emerald-200',
    border: 'border-emerald-300 dark:border-emerald-600',
  },
  yellow: {
    bg: 'bg-amber-100/80 dark:bg-amber-900/40',
    text: 'text-amber-700 dark:text-amber-200',
    border: 'border-amber-300 dark:border-amber-600',
  },
  purple: {
    bg: 'bg-violet-100/80 dark:bg-violet-900/40',
    text: 'text-violet-700 dark:text-violet-200',
    border: 'border-violet-300 dark:border-violet-600',
  },
  default: {
    bg: 'bg-zinc-100/80 dark:bg-zinc-800/40',
    text: 'text-zinc-700 dark:text-zinc-200',
    border: 'border-zinc-300 dark:border-zinc-600',
  },
};

// ============ Types ============

interface AllDayAreaProps {
  days: Date[];
  allDayEvents: CalendarDisplayItem[];
  gutterWidth: number;
  isDropTarget?: boolean;
  onCreateAllDay?: (startDay: Date, endDay: Date) => void;
  onEventDragStart?: (eventId: string, clientY: number) => void;
}

interface LayoutedEvent {
  event: CalendarDisplayItem;
  row: number;
  startCol: number;
  endCol: number;
}

// ============ Layout Algorithm ============

function calculateAllDayLayout(
  events: CalendarDisplayItem[],
  days: Date[]
): { layoutedEvents: LayoutedEvent[]; totalRows: number; overflowByDay: Map<number, number> } {
  if (events.length === 0 || days.length === 0) {
    return { layoutedEvents: [], totalRows: 0, overflowByDay: new Map() };
  }

  const firstDay = startOfDay(days[0]);

  // Sort events: longer events first, then by start date
  const sortedEvents = [...events].sort((a, b) => {
    const durationA = a.endDate - a.startDate;
    const durationB = b.endDate - b.startDate;
    if (durationA !== durationB) return durationB - durationA;
    return a.startDate - b.startDate;
  });

  const layoutedEvents: LayoutedEvent[] = [];
  const rowOccupancy: boolean[][] = []; // rowOccupancy[row][col] = occupied

  for (const event of sortedEvents) {
    const eventStart = startOfDay(new Date(event.startDate));
    const eventEnd = startOfDay(new Date(event.endDate));

    // Calculate column range (clipped to visible days)
    let startCol = Math.max(0, differenceInDays(eventStart, firstDay));
    let endCol = Math.min(days.length - 1, differenceInDays(eventEnd, firstDay));

    // Skip if completely outside visible range
    if (startCol > days.length - 1 || endCol < 0) continue;

    // Find first available row
    let row = 0;
    while (true) {
      if (!rowOccupancy[row]) {
        rowOccupancy[row] = new Array(days.length).fill(false);
      }

      let canFit = true;
      for (let col = startCol; col <= endCol; col++) {
        if (rowOccupancy[row][col]) {
          canFit = false;
          break;
        }
      }

      if (canFit) break;
      row++;
    }

    // Mark columns as occupied
    for (let col = startCol; col <= endCol; col++) {
      if (!rowOccupancy[row]) {
        rowOccupancy[row] = new Array(days.length).fill(false);
      }
      rowOccupancy[row][col] = true;
    }

    layoutedEvents.push({
      event,
      row,
      startCol,
      endCol,
    });
  }

  // Calculate overflow for each day
  const overflowByDay = new Map<number, number>();
  for (let col = 0; col < days.length; col++) {
    let eventsInCol = 0;
    for (const le of layoutedEvents) {
      if (le.startCol <= col && le.endCol >= col) {
        eventsInCol++;
      }
    }
    if (eventsInCol > MAX_VISIBLE_ROWS) {
      overflowByDay.set(col, eventsInCol - MAX_VISIBLE_ROWS);
    }
  }

  return {
    layoutedEvents,
    totalRows: rowOccupancy.length,
    overflowByDay,
  };
}

// ============ Component ============

export function AllDayArea({
  days,
  allDayEvents,
  gutterWidth,
  isDropTarget = false,
  onCreateAllDay,
  onEventDragStart,
}: AllDayAreaProps) {
  const { setEditingEventId, editingEventId } = useCalendarStore();
  const { toggleTask } = useGroupStore();
  
  const areaRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [eventDragStarted, setEventDragStarted] = useState(false);

  // Calculate layout
  const { layoutedEvents, totalRows, overflowByDay } = useMemo(
    () => calculateAllDayLayout(allDayEvents, days),
    [allDayEvents, days]
  );

  // Visible rows (limited unless expanded)
  const visibleRows = isExpanded ? totalRows : Math.min(totalRows, MAX_VISIBLE_ROWS);
  const hasOverflow = totalRows > MAX_VISIBLE_ROWS;

  // Calculate area height
  const areaHeight = Math.max(
    MIN_AREA_HEIGHT,
    visibleRows * (EVENT_HEIGHT + EVENT_GAP) + EVENT_GAP
  );

  // Get day index from mouse position
  const getDayIndexFromMouse = useCallback((clientX: number) => {
    if (!areaRef.current) return null;
    const rect = areaRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left - gutterWidth;
    const dayWidth = (rect.width - gutterWidth) / days.length;
    const dayIndex = Math.floor(relativeX / dayWidth);
    return dayIndex >= 0 && dayIndex < days.length ? dayIndex : null;
  }, [days.length, gutterWidth]);

  // Drag to create handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.all-day-event')) return;

    const dayIndex = getDayIndexFromMouse(e.clientX);
    if (dayIndex === null) return;

    setIsDragging(true);
    setDragStart(dayIndex);
    setDragEnd(dayIndex);
  }, [getDayIndexFromMouse]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const dayIndex = getDayIndexFromMouse(e.clientX);
    if (dayIndex !== null) {
      setDragEnd(dayIndex);
    }
  }, [isDragging, getDayIndexFromMouse]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging || dragStart === null || dragEnd === null) {
      setIsDragging(false);
      return;
    }

    const startIdx = Math.min(dragStart, dragEnd);
    const endIdx = Math.max(dragStart, dragEnd);
    
    onCreateAllDay?.(days[startIdx], days[endIdx]);

    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  }, [isDragging, dragStart, dragEnd, days, onCreateAllDay]);

  const handleMouseLeave = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
    }
  }, [isDragging]);

  // Event click handler
  const handleEventClick = useCallback((e: React.MouseEvent, eventId: string) => {
    e.stopPropagation();
    // Don't open editor if we just finished dragging
    if (eventDragStarted) {
      setEventDragStarted(false);
      return;
    }
    setEditingEventId(eventId, { x: e.clientX, y: e.clientY });
  }, [setEditingEventId, eventDragStarted]);

  // Event drag handler - for dragging all-day events out to time grid
  const handleEventMouseDown = useCallback((e: React.MouseEvent, eventId: string) => {
    if (e.button !== 0) return;
    // Don't start drag if clicking on checkbox
    if ((e.target as HTMLElement).closest('button')) return;
    
    e.stopPropagation();
    setEventDragStarted(true);
    onEventDragStart?.(eventId, e.clientY);
  }, [onEventDragStart]);

  // Toggle completion
  const handleToggle = useCallback((e: React.MouseEvent, eventId: string) => {
    e.stopPropagation();
    toggleTask(eventId);
  }, [toggleTask]);

  // Render ghost selection
  const renderGhost = () => {
    if (!isDragging || dragStart === null || dragEnd === null) return null;
    
    const startIdx = Math.min(dragStart, dragEnd);
    const endIdx = Math.max(dragStart, dragEnd);
    const dayWidth = 100 / days.length;

    return (
      <div
        className="absolute z-20 bg-zinc-400/20 border-2 border-zinc-400 border-dashed rounded-md pointer-events-none"
        style={{
          left: `${startIdx * dayWidth}%`,
          width: `${(endIdx - startIdx + 1) * dayWidth}%`,
          top: EVENT_GAP,
          height: EVENT_HEIGHT,
        }}
      />
    );
  };

  return (
    <div
      ref={areaRef}
      className={`
        relative flex border-b transition-all duration-200
        ${isDropTarget ? 'bg-blue-50/50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700' : 'border-zinc-200 dark:border-zinc-800'}
      `}
      style={{ minHeight: areaHeight }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* Gutter */}
      <div 
        style={{ width: gutterWidth }} 
        className="flex-shrink-0 flex items-end justify-end pr-2 pb-1"
      >
        {allDayEvents.length > 0 && (
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
            全天
          </span>
        )}
      </div>

      {/* Events area */}
      <div className="flex-1 relative">
        {/* Column dividers */}
        <div 
          className="absolute inset-0 grid pointer-events-none"
          style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}
        >
          {days.map((_, i) => (
            <div 
              key={i} 
              className="border-r border-zinc-100 dark:border-zinc-800/50 last:border-r-0" 
            />
          ))}
        </div>

        {/* Events */}
        {layoutedEvents
          .filter(le => !isExpanded ? le.row < MAX_VISIBLE_ROWS : true)
          .map(({ event, row, startCol, endCol }) => {
            const dayWidth = 100 / days.length;
            const colorStyles = COLOR_STYLES[event.color || 'default'] || COLOR_STYLES.default;
            const isActive = editingEventId === event.id;
            const isMultiDay = endCol > startCol;

            return (
              <div
                key={event.id}
                className={`
                  all-day-event absolute flex items-center gap-1 px-1.5 rounded cursor-pointer
                  transition-all duration-150 select-none
                  ${colorStyles.bg} ${colorStyles.text}
                  ${isActive ? 'ring-2 ring-blue-400 dark:ring-blue-500 shadow-md z-30' : 'hover:shadow-sm z-10'}
                  ${event.completed ? 'opacity-60' : ''}
                `}
                style={{
                  left: `calc(${startCol * dayWidth}% + 2px)`,
                  width: `calc(${(endCol - startCol + 1) * dayWidth}% - 4px)`,
                  top: row * (EVENT_HEIGHT + EVENT_GAP) + EVENT_GAP,
                  height: EVENT_HEIGHT,
                }}
                onClick={(e) => handleEventClick(e, event.id)}
                onMouseDown={(e) => handleEventMouseDown(e, event.id)}
              >
                {/* Checkbox */}
                <button
                  onClick={(e) => handleToggle(e, event.id)}
                  className={`
                    flex-shrink-0 w-3 h-3 rounded-sm border flex items-center justify-center
                    ${event.completed
                      ? 'bg-zinc-400 border-zinc-400 dark:bg-zinc-500 dark:border-zinc-500'
                      : 'border-current opacity-50 hover:opacity-80'
                    }
                  `}
                >
                  {event.completed && <Check className="w-2 h-2 text-white" strokeWidth={3} />}
                </button>

                {/* Content */}
                <span className={`
                  flex-1 text-[11px] font-medium truncate
                  ${event.completed ? 'line-through' : ''}
                `}>
                  {event.content || 'Untitled'}
                </span>

                {/* Multi-day indicator */}
                {isMultiDay && startCol === 0 && (
                  <span className="text-[9px] opacity-60">◀</span>
                )}
                {isMultiDay && endCol === days.length - 1 && (
                  <span className="text-[9px] opacity-60">▶</span>
                )}
              </div>
            );
          })}

        {/* Overflow indicators */}
        {!isExpanded && Array.from(overflowByDay.entries()).map(([col, count]) => {
          const dayWidth = 100 / days.length;
          return (
            <button
              key={`overflow-${col}`}
              className="absolute text-[10px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 font-medium"
              style={{
                left: `calc(${col * dayWidth}% + 4px)`,
                bottom: 2,
              }}
              onClick={() => setIsExpanded(true)}
            >
              +{count} more
            </button>
          );
        })}

        {/* Collapse button */}
        {isExpanded && hasOverflow && (
          <button
            className="absolute right-2 bottom-1 text-[10px] text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            onClick={() => setIsExpanded(false)}
          >
            收起
          </button>
        )}

        {/* Ghost selection */}
        {renderGhost()}

        {/* Drop target hint */}
        {isDropTarget && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs text-blue-500 dark:text-blue-400 font-medium bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded">
              释放以设为全天事件
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
