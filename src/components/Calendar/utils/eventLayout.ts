/**
 * Event Layout Algorithm
 *
 * Professional calendar event layout algorithm:
 * - Completion status sorting: incomplete events on the left, completed on the right
 * - Color priority sorting: high priority colors on the left
 * - Each event's width is based on its actual concurrency
 * - Non-overlapping events display at 100% width
 */

import type { ItemColor } from '@/stores/types';

interface LayoutEvent {
  id: string;
  startDate: number;
  endDate: number;
  color?: ItemColor;
  completed?: boolean;
}

export interface EventLayoutInfo {
  id: string;
  column: number;
  totalColumns: number;
  leftPercent: number;
  widthPercent: number;
}

// Color priority mapping: lower number = higher priority, positioned more to the left
const COLOR_PRIORITY: Record<ItemColor, number> = {
  red: 0,
  yellow: 1,
  purple: 2,
  green: 3,
  blue: 4,
  default: 5,
};

/**
 * Get the color priority of an event
 */
function getColorPriority(color?: ItemColor): number {
  return COLOR_PRIORITY[color || 'default'] ?? COLOR_PRIORITY.default;
}

/**
 * Check if two events overlap in time
 */
function eventsOverlap(a: LayoutEvent, b: LayoutEvent): boolean {
  return a.startDate < b.endDate && a.endDate > b.startDate;
}

/**
 * Calculate layout for all events within a single day
 */
export function calculateEventLayout(
  events: LayoutEvent[]
): Map<string, EventLayoutInfo> {
  const result = new Map<string, EventLayoutInfo>();

  if (events.length === 0) return result;

  // Sorting rules:
  // 1. Start time (earlier first) - most important, ensures correct column assignment
  // 2. Completion status (incomplete first, on the left)
  // 3. Color priority (red > yellow > purple > green > blue > default)
  // 4. Duration (longer first, more stable visual anchor)
  const sorted = [...events].sort((a, b) => {
    // First sort by start time - ensures correct column assignment
    if (a.startDate !== b.startDate) return a.startDate - b.startDate;

    // Then sort by completion status: incomplete first (left)
    const completedA = a.completed ? 1 : 0;
    const completedB = b.completed ? 1 : 0;
    if (completedA !== completedB) return completedA - completedB;

    // Then sort by color priority
    const colorPriorityA = getColorPriority(a.color);
    const colorPriorityB = getColorPriority(b.color);
    if (colorPriorityA !== colorPriorityB) return colorPriorityA - colorPriorityB;

    // Finally sort by duration descending (longer events first)
    const durationA = a.endDate - a.startDate;
    const durationB = b.endDate - b.startDate;
    return durationB - durationA;
  });

  // Assign columns to each event
  const eventColumns = new Map<string, number>();

  for (const event of sorted) {
    // Find all events still active at current event's start time (already assigned columns)
    const activeEvents = sorted.filter(e => 
      eventColumns.has(e.id) && // Already assigned a column
      e.endDate > event.startDate && // Not yet ended
      e.startDate < event.startDate // Started before current event
    );

    // Find occupied columns
    const occupied = new Set(activeEvents.map(e => eventColumns.get(e.id)!));

    // Assign the smallest available column
    let column = 0;
    while (occupied.has(column)) {
      column++;
    }

    eventColumns.set(event.id, column);
  }

  // Calculate layout for each event
  for (const event of sorted) {
    const column = eventColumns.get(event.id) || 0;
    
    // Find all events overlapping with current event
    const overlappingEvents = sorted.filter(e => 
      e.id !== event.id && eventsOverlap(event, e)
    );
    
    if (overlappingEvents.length === 0) {
      // No overlap, display at 100% width
      result.set(event.id, {
        id: event.id,
        column: 0,
        totalColumns: 1,
        leftPercent: 0,
        widthPercent: 100,
      });
    } else {
      // Has overlap, calculate max column count
      let maxColumn = column;
      for (const other of overlappingEvents) {
        const otherColumn = eventColumns.get(other.id) || 0;
        maxColumn = Math.max(maxColumn, otherColumn);
      }
      
      const totalColumns = maxColumn + 1;
      const columnWidth = 100 / totalColumns;
      const leftPercent = column * columnWidth;

      result.set(event.id, {
        id: event.id,
        column,
        totalColumns,
        leftPercent,
        widthPercent: columnWidth,
      });
    }
  }

  return result;
}
