import { useMemo, useCallback } from 'react';
import { getTimeRangeKey } from '@/lib/dateUtils';
import { StoreTask } from '@/stores/types';
import { TimeView } from '@/lib/dateUtils';
import { DateGroups } from './types';

// 颜色优先级排序
const priorityOrder: Record<string, number> = { red: 0, yellow: 1, purple: 2, green: 3, blue: 4, default: 5 };

interface UseArchiveGroupingProps {
  tasks: StoreTask[];
  timeView: TimeView;
  selectedPriorities: string[];
  dayRange: number | 'all';
  weekRange: number | 'all';
  monthRange: number | 'all';
}

export function useArchiveGrouping({
  tasks,
  timeView,
  selectedPriorities,
  dayRange,
  weekRange,
  monthRange
}: UseArchiveGroupingProps) {
  
  // Get current range based on time view
  const getCurrentRange = useCallback(() => {
    if (timeView === 'day') return dayRange;
    if (timeView === 'week') return weekRange;
    return monthRange;
  }, [timeView, dayRange, weekRange, monthRange]);

  const groupedArchiveTasks = useMemo(() => {
    const topLevelArchiveTasks = tasks
      .filter((t) => {
        if (t.groupId !== '__archive__' || t.parentId) return false;
        if (!selectedPriorities.includes(t.priority || 'default')) return false;
        return true;
      })
      .sort((a, b) => {
        if (!a.completedAt && !b.completedAt) return 0;
        if (!a.completedAt) return 1;
        if (!b.completedAt) return -1;
        return (b.completedAt || 0) - (a.completedAt || 0);
      });
    
    // Group by time range
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
    
    // Sort tasks within each group by priority
    Object.keys(dateGroups).forEach(dateKey => {
      Object.keys(dateGroups[dateKey]).forEach(groupId => {
        dateGroups[dateKey][groupId].sort((a, b) => {
          const aPriority = priorityOrder[a.priority || 'default'];
          const bPriority = priorityOrder[b.priority || 'default'];
          if (aPriority !== bPriority) return aPriority - bPriority;
          
          if (!a.completedAt && !b.completedAt) return 0;
          if (!a.completedAt) return 1;
          if (!b.completedAt) return -1;
          return (b.completedAt || 0) - (a.completedAt || 0);
        });
      });
    });
    
    // Apply time range filter
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
  }, [tasks, timeView, selectedPriorities, getCurrentRange]);

  return groupedArchiveTasks;
}
