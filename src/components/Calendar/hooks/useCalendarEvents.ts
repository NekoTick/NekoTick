import { useMemo } from 'react';
import { useUnifiedStore } from '@/stores/useUnifiedStore';
import type { ItemColor } from '@/stores/useUnifiedStore';

/**
 * 日历事件显示项
 * 
 * 这是 UnifiedTask 在日历视图中的表示形式
 * 统一了 title 字段名（映射自 content）并确保时间属性存在
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
 * 统一事项模型下的日历事件 hook
 * 
 * 核心理念：世界上只有一种"事项"
 * - 有 startDate 的事项会显示在日历中
 * - 没有 startDate 的事项只在待办列表中显示
 * - 颜色系统统一，跨视图保持一致
 */
export function useCalendarEvents(): CalendarDisplayItem[] {
  const tasks = useUnifiedStore(state => state.data.tasks);

  const displayItems = useMemo(() => {
    // 筛选有时间属性的事项，转换为日历显示格式
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
