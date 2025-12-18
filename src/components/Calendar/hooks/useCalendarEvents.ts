import { useMemo } from 'react';
import { useGroupStore } from '@/stores/useGroupStore';

/**
 * 统一事项模型下的日历事件 hook
 * 
 * 核心理念：所有事项都存储在 tasks 中
 * - 有 startDate 的 task 会显示在日历中
 * - 颜色系统统一，跨视图保持一致
 */
export function useCalendarEvents() {
  const { tasks } = useGroupStore();

  const displayItems = useMemo(() => {
    // 筛选有时间属性的事项
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
        type: 'event' as const,
        // 保留原始 task 引用，用于完成状态切换等操作
        originalTask: t,
      }));
  }, [tasks]);

  return displayItems;
}
