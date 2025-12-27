/**
 * AllDayArea - All-day events display area
 * 
 * Displays all-day events at the top of the calendar grid.
 * Supports drag-to-create and drag-to-convert interactions.
 */

import { useMemo, useCallback, useState, useRef } from 'react';
import { startOfDay, differenceInDays } from 'date-fns';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

import { useCalendarStore } from '@/stores/useCalendarStore';
import { useGroupStore } from '@/stores/useGroupStore';
import type { CalendarDisplayItem } from '../../hooks/useCalendarEvents';
import { EventContextMenu } from '../Event/EventContextMenu';

// ============ Constants ============

const MAX_VISIBLE_ROWS = 3;
const EVENT_HEIGHT = 22;
const EVENT_GAP = 2;
const MIN_AREA_HEIGHT = 28;
const COLLAPSED_HEIGHT = 28; // Height when collapsed with chevron

// ============ Color Styles - Apple Style Colors ============

const COLOR_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  red: {
    bg: 'bg-[#FE002D]/15 dark:bg-[#FE002D]/25',
    text: 'text-[#FE002D] dark:text-[#FF6B6B]',
    border: 'border-[#FE002D]/30 dark:border-[#FE002D]/40',
  },
  orange: {
    bg: 'bg-[#FF8500]/15 dark:bg-[#FF8500]/25',
    text: 'text-[#FF8500] dark:text-[#FFB366]',
    border: 'border-[#FF8500]/30 dark:border-[#FF8500]/40',
  },
  yellow: {
    bg: 'bg-[#FEC900]/15 dark:bg-[#FEC900]/25',
    text: 'text-[#B8920A] dark:text-[#FEC900]',
    border: 'border-[#FEC900]/30 dark:border-[#FEC900]/40',
  },
  green: {
    bg: 'bg-[#63DA38]/15 dark:bg-[#63DA38]/25',
    text: 'text-[#4CAF2A] dark:text-[#63DA38]',
    border: 'border-[#63DA38]/30 dark:border-[#63DA38]/40',
  },
  blue: {
    bg: 'bg-[#008BFE]/15 dark:bg-[#008BFE]/25',
    text: 'text-[#008BFE] dark:text-[#66B8FF]',
    border: 'border-[#008BFE]/30 dark:border-[#008BFE]/40',
  },
  purple: {
    bg: 'bg-[#DD11E8]/15 dark:bg-[#DD11E8]/25',
    text: 'text-[#DD11E8] dark:text-[#E866F0]',
    border: 'border-[#DD11E8]/30 dark:border-[#DD11E8]/40',
  },
  brown: {
    bg: 'bg-[#B47D58]/15 dark:bg-[#B47D58]/25',
    text: 'text-[#B47D58] dark:text-[#D4A484]',
    border: 'border-[#B47D58]/30 dark:border-[#B47D58]/40',
  },
  default: {
    bg: 'bg-[#9F9FA9]/15 dark:bg-[#9F9FA9]/25',
    text: 'text-[#6B6B73] dark:text-[#9F9FA9]',
    border: 'border-[#9F9FA9]/30 dark:border-[#9F9FA9]/40',
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

// Color sort order: red, orange, yellow, green, blue, purple, brown, gray (default)
const COLOR_SORT_ORDER: Record<string, number> = {
  red: 0,
  orange: 1,
  yellow: 2,
  green: 3,
  blue: 4,
  purple: 5,
  brown: 6,
  default: 7,
};

function getColorSortOrder(color?: string): number {
  return COLOR_SORT_ORDER[color || 'default'] ?? COLOR_SORT_ORDER.default;
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

  // Sort events: by color priority first, then longer events, then by start date
  const sortedEvents = [...events].sort((a, b) => {
    // First by color priority
    const colorOrderA = getColorSortOrder(a.color);
    const colorOrderB = getColorSortOrder(b.color);
    if (colorOrderA !== colorOrderB) return colorOrderA - colorOrderB;
    
    // Then by duration (longer first)
    const durationA = a.endDate - a.startDate;
    const durationB = b.endDate - b.startDate;
    if (durationA !== durationB) return durationB - durationA;
    
    // Finally by start date
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
  const [contextMenu, setContextMenu] = useState<{ eventId: string; x: number; y: number } | null>(null);

  // Calculate layout
  const { layoutedEvents, totalRows } = useMemo(
    () => calculateAllDayLayout(allDayEvents, days),
    [allDayEvents, days]
  );

  // Notion-style: collapse when 2+ visible events, show directly when 0-1 event
  // Use layoutedEvents.length (events in current view) instead of allDayEvents.length
  const shouldCollapse = layoutedEvents.length >= 2;
  const showEvents = !shouldCollapse || isExpanded;

  // Calculate area height
  const areaHeight = useMemo(() => {
    if (layoutedEvents.length === 0) return MIN_AREA_HEIGHT;
    if (!showEvents) return COLLAPSED_HEIGHT; // Collapsed state
    // Expanded or single event
    return Math.max(
      MIN_AREA_HEIGHT,
      totalRows * (EVENT_HEIGHT + EVENT_GAP) + EVENT_GAP
    );
  }, [layoutedEvents.length, showEvents, totalRows]);

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
    // Don't create new event if context menu is open
    if (contextMenu) {
      setContextMenu(null);
      return;
    }

    const dayIndex = getDayIndexFromMouse(e.clientX);
    if (dayIndex === null) return;

    setIsDragging(true);
    setDragStart(dayIndex);
    setDragEnd(dayIndex);
  }, [getDayIndexFromMouse, contextMenu]);

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

  // Right-click context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, eventId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ eventId, x: e.clientX, y: e.clientY });
  }, []);

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
      {/* Gutter - entire area clickable for expand/collapse */}
      <div 
        style={{ width: gutterWidth }} 
        className={`
          flex-shrink-0 flex items-center justify-end pr-2
          ${shouldCollapse ? 'hover:bg-zinc-100/50 dark:hover:bg-zinc-800/30 transition-colors' : ''}
        `}
        onClick={shouldCollapse ? () => setIsExpanded(!isExpanded) : undefined}
      >
        {layoutedEvents.length > 0 && (
          shouldCollapse ? (
            // Notion-style: chevron + count when collapsed
            <div className="flex items-center gap-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
              {isExpanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
              <span className="font-medium">{layoutedEvents.length}</span>
            </div>
          ) : (
            // Single event: just show "全天" label
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
              全天
            </span>
          )
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

        {/* Events - only show when expanded or single event */}
        {showEvents && layoutedEvents.map(({ event, row, startCol, endCol }) => {
            const dayWidth = 100 / days.length;
            const colorStyles = COLOR_STYLES[event.color || 'default'] || COLOR_STYLES.default;
            const isActive = editingEventId === event.id;
            const isMultiDay = endCol > startCol;

            return (
              <div
                key={event.id}
                className={`
                  all-day-event absolute flex items-center gap-1 px-1.5 rounded
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
                onContextMenu={(e) => handleContextMenu(e, event.id)}
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

      {/* Context Menu */}
      {contextMenu && (
        <EventContextMenu
          eventId={contextMenu.eventId}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          currentColor={allDayEvents.find(e => e.id === contextMenu.eventId)?.color}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
