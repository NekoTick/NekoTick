/**
 * Calendar Store - 日历视图的数据访问层
 * 
 * 核心理念：日历事件就是带时间属性的待办事项
 * 这个 store 从统一的 tasks 中筛选出有时间属性的事项
 */

import { useUnifiedStore, type ItemColor } from './useUnifiedStore';
import type { UnifiedTask } from '@/lib/storage/unifiedStorage';

// Re-export types
export type ViewMode = 'day' | 'week' | 'month';

// 日历事件类型（实际上就是带时间的 task）
export interface CalendarEvent {
  id: string;
  title: string;
  startDate: number;
  endDate: number;
  isAllDay: boolean;
  color: ItemColor;
  completed: boolean;
  description?: string;
  location?: string;
  groupId: string;
  // 原始 task 引用
  type: 'event' | 'task';
}

// 将 UnifiedTask 转换为 CalendarEvent 格式
function taskToCalendarEvent(task: UnifiedTask): CalendarEvent {
  return {
    id: task.id,
    title: task.content,
    startDate: task.startDate!,
    endDate: task.endDate || task.startDate! + 60 * 60 * 1000,
    isAllDay: task.isAllDay || false,
    color: task.color || 'blue',
    completed: task.completed,
    description: task.description,
    location: task.location,
    groupId: task.groupId,
    type: 'event',
  };
}

// Custom hook that wraps UnifiedStore for calendar-specific data
export function useCalendarStore() {
  const store = useUnifiedStore();
  
  // 从 tasks 中筛选出有时间属性的事项作为日历事件
  const calendarEvents = store.data.tasks
    .filter(t => t.startDate !== undefined)
    .map(taskToCalendarEvent);
  
  return {
    // Data - 日历事件（有时间属性的 tasks）
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
    
    // 直接访问 task 的方法
    toggleTask: store.toggleTask,
    updateTaskColor: store.updateTaskColor,
  };
}
