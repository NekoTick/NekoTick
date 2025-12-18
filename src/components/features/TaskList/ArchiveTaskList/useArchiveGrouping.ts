import { useMemo, useCallback } from 'react';
import { getTimeRangeKey } from '@/lib/dateUtils';
import { Task } from '@/stores/useGroupStore';
import { TimeView } from '@/lib/dateUtils';
import { DateGroups } from './types';

// Color sorting
const colorOrder: Record<string, number> = { red: 0, yellow: 1, purple: 2, green: 3, blue: 4, default: 5 };

interface UseArchiveGroupingProps {
  tasks: Task[];
  timeView: TimeView;
  selectedColors: string[];
  dayRange: number | 'all';
  weekRange: number | 'all';
  monthRange: number | 'all';
}

export function useArchiveGrouping({
  tasks,
  timeView,
  selectedColors,
  dayRange,
  weekRange,
  monthRange
}: UseArchiveGroupingProps) {

  const getCurrentRange = useCallback(() => {
    if (timeView === 'day') return dayRange;
    if (timeView === 'week') return weekRange;
    return monthRange;
  }, [timeView, dayRange, weekRange, monthRange]);

  const groupedArchiveTasks = useMemo(() => {
    const topLevelArchiveTasks = tasks
      .filter((t) => {
        if (t.groupId !== '__archive__' || t.parentId) return false;
        if (!selectedColors.includes(t.color || 'default')) return false;
        return true;
      })
      .sort((a, b) => {
        if (!a.completedAt && !b.completedAt) return 0;
        if (!a.completedAt) return 1;
        if (!b.completedAt) return -1;
        return (b.completedAt || 0) - (a.completedAt || 0);
      });

    const dateGroups: DateGroups = {};

    topLevelArchiveTasks.forEach(task => {
      if (!task.completedAt) return;

      const timeKey = getTimeRangeKey(task.completedAt, timeView);
      const taskGroupId = task.groupId || 'unknown';

      if (!dateGroups[timeKey]) {
        dateGroups[timeKey] = {};
      }
      if (!dateGroups[timeKey][taskGroupId]) {
        dateGroups[timeKey][taskGroupId] = [];
      }
      dateGroups[timeKey][taskGroupId].push(task);
    });

    // Sort tasks within each group by color
    Object.keys(dateGroups).forEach(dateKey => {
      Object.keys(dateGroups[dateKey]).forEach(groupId => {
        dateGroups[dateKey][groupId].sort((a, b) => {
          const aColor = colorOrder[a.color || 'default'];
          const bColor = colorOrder[b.color || 'default'];
          if (aColor !== bColor) return aColor - bColor;

          if (!a.completedAt && !b.completedAt) return 0;
          if (!a.completedAt) return 1;
          if (!b.completedAt) return -1;
          return (b.completedAt || 0) - (a.completedAt || 0);
        });
      });
    });

    const currentRange = getCurrentRange();
    if (currentRange !== 'all') {
      const sortedDateKeys = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a));
      const limitedKeys = sortedDateKeys.slice(0, currentRange);
      const filteredGroups: DateGroups = {};

      limitedKeys.forEach(key => {
        filteredGroups[key] = dateGroups[key];
      });

      return filteredGroups;
    }

    return dateGroups;
  }, [tasks, timeView, selectedColors, getCurrentRange]);

  return groupedArchiveTasks;
}
