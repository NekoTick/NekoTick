/**
 * Event Layout Algorithm
 *
 * Professional calendar event layout algorithm:
 * - Events that overlap in time are placed in separate columns
 * - All events in the same overlap group share the same total column count
 * - This ensures no visual overlap between events
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

// Color sort order: red, orange, yellow, green, blue, purple, brown, gray (default)
const COLOR_SORT_ORDER: Record<ItemColor, number> = {
  red: 0,
  orange: 1,
  yellow: 2,
  green: 3,
  blue: 4,
  purple: 5,
  brown: 6,
  default: 7,
};

/**
 * Get the sort order of a color
 */
function getColorSortOrder(color?: ItemColor): number {
  return COLOR_SORT_ORDER[color || 'default'] ?? COLOR_SORT_ORDER.default;
}

/**
 * Check if two events overlap in time
 */
function eventsOverlap(a: LayoutEvent, b: LayoutEvent): boolean {
  return a.startDate < b.endDate && a.endDate > b.startDate;
}

/**
 * Find all events that are connected through overlaps (transitive closure)
 * Events in the same group must share the same column layout
 */
function findOverlapGroups(events: LayoutEvent[]): LayoutEvent[][] {
  if (events.length === 0) return [];
  
  const visited = new Set<string>();
  const groups: LayoutEvent[][] = [];
  
  for (const event of events) {
    if (visited.has(event.id)) continue;
    
    // BFS to find all connected events
    const group: LayoutEvent[] = [];
    const queue: LayoutEvent[] = [event];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      
      visited.add(current.id);
      group.push(current);
      
      // Find all events that overlap with current
      for (const other of events) {
        if (!visited.has(other.id) && eventsOverlap(current, other)) {
          queue.push(other);
        }
      }
    }
    
    groups.push(group);
  }
  
  return groups;
}

/**
 * Calculate layout for a single overlap group
 * All events in the group will have the same totalColumns
 */
function layoutGroup(events: LayoutEvent[]): Map<string, EventLayoutInfo> {
  const result = new Map<string, EventLayoutInfo>();
  
  if (events.length === 0) return result;
  
  if (events.length === 1) {
    const event = events[0];
    result.set(event.id, {
      id: event.id,
      column: 0,
      totalColumns: 1,
      leftPercent: 0,
      widthPercent: 100,
    });
    return result;
  }
  
  // Sort events for column assignment
  const sorted = [...events].sort((a, b) => {
    // First sort by start time
    if (a.startDate !== b.startDate) return a.startDate - b.startDate;
    
    // Then by completion status: incomplete first (left)
    const completedA = a.completed ? 1 : 0;
    const completedB = b.completed ? 1 : 0;
    if (completedA !== completedB) return completedA - completedB;
    
    // Then by color
    const colorOrderA = getColorSortOrder(a.color);
    const colorOrderB = getColorSortOrder(b.color);
    if (colorOrderA !== colorOrderB) return colorOrderA - colorOrderB;
    
    // Finally by duration descending
    const durationA = a.endDate - a.startDate;
    const durationB = b.endDate - b.startDate;
    return durationB - durationA;
  });
  
  // Assign columns using a greedy algorithm
  const eventColumns = new Map<string, number>();
  
  for (const event of sorted) {
    // Find columns occupied by overlapping events that started before this one
    const occupiedColumns = new Set<number>();
    
    for (const other of sorted) {
      if (other.id === event.id) continue;
      if (!eventColumns.has(other.id)) continue;
      
      // Check if other event overlaps with current event
      if (eventsOverlap(event, other)) {
        occupiedColumns.add(eventColumns.get(other.id)!);
      }
    }
    
    // Find the smallest available column
    let column = 0;
    while (occupiedColumns.has(column)) {
      column++;
    }
    
    eventColumns.set(event.id, column);
  }
  
  // Find the maximum column used in this group
  let maxColumn = 0;
  for (const column of eventColumns.values()) {
    maxColumn = Math.max(maxColumn, column);
  }
  const totalColumns = maxColumn + 1;
  
  // Calculate layout for each event
  const columnWidth = 100 / totalColumns;
  
  for (const event of events) {
    const column = eventColumns.get(event.id) || 0;
    const leftPercent = column * columnWidth;
    
    result.set(event.id, {
      id: event.id,
      column,
      totalColumns,
      leftPercent,
      widthPercent: columnWidth,
    });
  }
  
  return result;
}

/**
 * Calculate layout for all events within a single day
 */
export function calculateEventLayout(
  events: LayoutEvent[]
): Map<string, EventLayoutInfo> {
  const result = new Map<string, EventLayoutInfo>();
  
  if (events.length === 0) return result;
  
  // Find overlap groups
  const groups = findOverlapGroups(events);
  
  // Layout each group independently
  for (const group of groups) {
    const groupLayout = layoutGroup(group);
    for (const [id, layout] of groupLayout) {
      result.set(id, layout);
    }
  }
  
  return result;
}
