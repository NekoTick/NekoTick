import { useMemo } from 'react';
import { useUnifiedStore } from '@/stores/useUnifiedStore';
import type { ItemColor } from '@/stores/useUnifiedStore';

/**
 * Calendar event display item
 * 
 * This is the representation of UnifiedTask in calendar view
 * Unified title field name (mapped from content) and ensures time properties exist
 */
export interface CalendarDisplayItem {
  id: string;
  title: string;
  startDate: number;
  endDate: number;
  isAllDay: boolean;
  color: ItemColor;
  completed: boolean;
  groupId: string;
}

/**
 * Calendar events hook under unified item model
 * 
 * Core concept: There is only one type of "item"
 * - Items with startDate are displayed in calendar
 * - Items without startDate only appear in todo list
 * - Unified color system, consistent across views
 */
export function useCalendarEvents(): CalendarDisplayItem[] {
  const tasks = useUnifiedStore(state => state.data.tasks);

  const displayItems = useMemo(() => {
    // Filter items with time properties, convert to calendar display format
    return tasks
      .filter(t => t.startDate !== undefined)
      .map(t => ({
        id: t.id,
        title: t.content,
        startDate: t.startDate!,
        endDate: t.endDate || t.startDate! + (t.estimatedMinutes || 60) * 60 * 1000,
        isAllDay: t.isAllDay || false,
        color: t.color || 'blue',
        completed: t.completed,
        groupId: t.groupId,
      }));
  }, [tasks]);

  return displayItems;
}
