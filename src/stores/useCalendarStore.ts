/**
 * Calendar Store - Calendar view data access layer
 * 
 * Core concept: There is only one type of "item" (UnifiedTask)
 * - Items with time properties appear in calendar view
 * - Items without time properties only appear in todo view
 * - Calendar and todo are just different windows observing the same data
 */

import { useUnifiedStore, type ItemColor } from './useUnifiedStore';
import type { UnifiedTask } from '@/lib/storage/unifiedStorage';

// Re-export types
export type ViewMode = 'day' | 'week' | 'month';

/**
 * Calendar event type
 * 
 * This is the view layer representation of UnifiedTask with time properties
 * Uses same field names as UnifiedTask for consistency
 */
export interface CalendarEvent {
  id: string;
  content: string;
  startDate: number;
  endDate: number;
  isAllDay: boolean;
  color: ItemColor;
  completed: boolean;
  description?: string;
  location?: string;
  groupId: string;
}

/**
 * Convert UnifiedTask to CalendarEvent view format
 */
function toCalendarEvent(task: UnifiedTask): CalendarEvent {
  return {
    id: task.id,
    content: task.content,
    startDate: task.startDate!,
    endDate: task.endDate || task.startDate! + 60 * 60 * 1000,
    isAllDay: task.isAllDay || false,
    color: task.color || 'default',
    completed: task.completed,
    description: task.description,
    location: task.location,
    groupId: task.groupId,
  };
}

/**
 * Calendar view data access hook
 * 
 * Filters items with time properties from unified tasks
 * Provides all state and operations needed for calendar view
 */
export function useCalendarStore() {
  const store = useUnifiedStore();
  
  // Filter items with time properties from tasks
  const calendarEvents = store.data.tasks
    .filter(t => t.startDate !== undefined)
    .map(toCalendarEvent);
  
  return {
    // Data - calendar events (tasks with time properties)
    events: calendarEvents,
    groups: store.data.groups,
    loaded: store.loaded,
    
    // View State
    viewMode: store.data.settings.viewMode,
    selectedDate: store.selectedDate,
    dayCount: store.data.settings.dayCount,
    showSidebar: store.showSidebar,
    showContextPanel: store.showContextPanel,
    editingEventId: store.editingEventId,
    editingEventPosition: store.editingEventPosition,
    selectedEventId: store.selectedEventId,
    timezone: store.data.settings.timezone,
    hourHeight: store.data.settings.hourHeight ?? 64,
    use24Hour: store.data.settings.use24Hour ?? false,
    
    // Actions
    load: store.load,
    addEvent: store.addEvent,
    updateEvent: store.updateEvent,
    deleteEvent: store.deleteEvent,
    undo: store.undo,
    
    setViewMode: store.setViewMode,
    setSelectedDate: store.setSelectedDate,
    setDayCount: store.setDayCount,
    setHourHeight: store.setHourHeight,
    toggleSidebar: store.toggleSidebar,
    toggleContextPanel: store.toggleContextPanel,
    setEditingEventId: store.setEditingEventId,
    setSelectedEventId: store.setSelectedEventId,
    closeEditingEvent: store.closeEditingEvent,
    setTimezone: store.setTimezone,
    toggle24Hour: store.toggle24Hour,
    
    // Task operations (calendar events are essentially tasks)
    toggleTask: store.toggleTask,
    updateTaskColor: store.updateTaskColor,
    
    // Timer operations
    startTimer: store.startTimer,
    pauseTimer: store.pauseTimer,
    resumeTimer: store.resumeTimer,
    stopTimer: store.stopTimer,
  };
}
