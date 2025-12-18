import { useState, useEffect, useCallback } from 'react';
import { getDefaultExpandedDates } from '@/lib/dateUtils';
import { ArchiveTaskListProps } from './types';
import { useArchiveGrouping } from './useArchiveGrouping';
import { ArchiveDateGroup } from './ArchiveDateGroup';

/**
 * Archive view with date → group → task hierarchy
 */
export function ArchiveTaskList({
  tasks,
  groups,
  timeView,
  selectedColors,
  dayRange,
  weekRange,
  monthRange,
  deleteTask,
  renderTaskItem,
}: ArchiveTaskListProps) {
  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => getDefaultExpandedDates(timeView));
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showDateMenu, setShowDateMenu] = useState<string | null>(null);
  const [showGroupMenu, setShowGroupMenu] = useState<string | null>(null);

  const groupedArchiveTasks = useArchiveGrouping({
    tasks,
    timeView,
    selectedColors,
    dayRange,
    weekRange,
    monthRange
  });

  // Reset expanded state when time view changes
  useEffect(() => {
    setExpandedDates(getDefaultExpandedDates(timeView));
    setExpandedGroups(new Set());
  }, [timeView]);

  // In day view, auto-expand all dates and groups
  useEffect(() => {
    if (timeView === 'day') {
      const allDateKeys = Object.keys(groupedArchiveTasks);
      setExpandedDates(new Set(allDateKeys));
      
      const allGroupKeys: string[] = [];
      allDateKeys.forEach(dateKey => {
        const groupsInDate = groupedArchiveTasks[dateKey];
        Object.keys(groupsInDate).forEach(groupId => {
          allGroupKeys.push(`${dateKey}-${groupId}`);
        });
      });
      setExpandedGroups(new Set(allGroupKeys));
    }
  }, [timeView, groupedArchiveTasks]);

  // Toggle date expand/collapse
  const toggleDateExpanded = useCallback((dateKey: string) => {
    setExpandedDates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dateKey)) {
        newSet.delete(dateKey);
      } else {
        newSet.add(dateKey);
      }
      return newSet;
    });
  }, []);

  // Toggle group expand/collapse
  const toggleGroupExpanded = useCallback((dateKey: string, groupId: string) => {
    const key = `${dateKey}-${groupId}`;
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  }, []);

  if (Object.keys(groupedArchiveTasks).length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {Object.keys(groupedArchiveTasks)
        .sort((a, b) => b.localeCompare(a))
        .map(dateKey => (
          <ArchiveDateGroup
            key={dateKey}
            dateKey={dateKey}
            groupsInDate={groupedArchiveTasks[dateKey]}
            allGroups={groups}
            timeView={timeView}
            expandedDates={expandedDates}
            toggleDateExpanded={toggleDateExpanded}
            expandedGroups={expandedGroups}
            toggleGroupExpanded={toggleGroupExpanded}
            showDateMenu={showDateMenu}
            setShowDateMenu={setShowDateMenu}
            showGroupMenu={showGroupMenu}
            setShowGroupMenu={setShowGroupMenu}
            deleteTask={deleteTask}
            renderTaskItem={renderTaskItem}
          />
        ))}
    </div>
  );
}
