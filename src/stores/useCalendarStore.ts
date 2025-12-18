/**
 * Calendar Store - 日历视图的数据访问层
 * 
 * 核心理念：世界上只有一种"事项"（UnifiedTask）
 * - 有时间属性的事项会出现在日历视图中
 * - 没有时间属性的事项只出现在待办视图中
 * - 日历和待办只是观察同一份数据的不同窗口
 */

import { useUnifiedStore, type ItemColor } from './useUnifiedStore';
import type { UnifiedTask } from '@/lib/storage/unifiedStorage';

// Re-export types
export type ViewMode = 'day' | 'week' | 'month';

/**
 * 日历事件类型
 * 
 * 这是 UnifiedTask 的视图层表示，添加了一些便捷属性
 * 本质上就是带时间属性的 UnifiedTask
 */
export interface CalendarEvent {
  id: string;
  title: string;           // 映射自 content
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
 * 将 UnifiedTask 转换为 CalendarEvent 视图格式
 * 这只是一个视图层的映射，不创建新的数据实体
 */
function toCalendarEvent(task: UnifiedTask): CalendarEvent {
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
  };
}

/**
 * 日历视图的数据访问 hook
 * 
 * 从统一的 tasks 中筛选出有时间属性的事项
 * 提供日历视图所需的所有状态和操作
 */
export function useCalendarStore() {
  const store = useUnifiedStore();
  
  // 从 tasks 中筛选出有时间属性的事项
  const calendarEvents = store.data.tasks
    .filter(t => t.startDate !== undefined)
    .map(toCalendarEvent);
  
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
    
    // Task 操作（日历事件本质上就是 task）
    toggleTask: store.toggleTask,
    updateTaskColor: store.updateTaskColor,
  };
}
