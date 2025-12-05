import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ChevronRight, ChevronDown, MoreHorizontal } from 'lucide-react';
import {
  type TimeView,
  getTimeRangeKey,
  formatTimeRangeDisplay,
  getDefaultExpandedDates,
  formatDuration,
} from '@/lib/dateUtils';
import type { StoreTask, Group } from '@/stores/types';

// Priority order for sorting
const priorityOrder = { red: 0, yellow: 1, purple: 2, green: 3, default: 4 };

interface ArchiveTaskListProps {
  tasks: StoreTask[];
  groups: Group[];
  timeView: TimeView;
  selectedPriorities: string[];
  dayRange: number | 'all';
  weekRange: number | 'all';
  monthRange: number | 'all';
  deleteTask: (id: string) => void;
  renderTaskItem: (task: StoreTask, level: number) => React.ReactNode;
}

/**
 * Archive view with date → group → task hierarchy
 */
export function ArchiveTaskList({
  tasks,
  groups,
  timeView,
  selectedPriorities,
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
  const dateMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const groupMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Get current range based on time view
  const getCurrentRange = useCallback(() => {
    if (timeView === 'day') return dayRange;
    if (timeView === 'week') return weekRange;
    return monthRange;
  }, [timeView, dayRange, weekRange, monthRange]);

  // Group archive tasks by time dimension and group
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
        return b.completedAt - a.completedAt;
      });
    
    // Group by time range
    const dateGroups: Record<string, Record<string, StoreTask[]>> = {};
    
    topLevelArchiveTasks.forEach(task => {
      if (!task.completedAt) return;
      
      const timeKey = getTimeRangeKey(task.completedAt, timeView);
      const originalGroupId = task.originalGroupId || 'unknown';
      
      if (!dateGroups[timeKey]) {
        dateGroups[timeKey] = {};
      }
      if (!dateGroups[timeKey][originalGroupId]) {
        dateGroups[timeKey][originalGroupId] = [];
      }
      dateGroups[timeKey][originalGroupId].push(task);
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
          return b.completedAt - a.completedAt;
        });
      });
    });
    
    // Apply time range filter
    const currentRange = getCurrentRange();
    if (currentRange !== 'all') {
      const sortedDateKeys = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a));
      const limitedKeys = sortedDateKeys.slice(0, currentRange);
      const filteredGroups: Record<string, Record<string, StoreTask[]>> = {};
      
      limitedKeys.forEach(key => {
        filteredGroups[key] = dateGroups[key];
      });
      
      return filteredGroups;
    }
    
    return dateGroups;
  }, [tasks, timeView, selectedPriorities, getCurrentRange]);

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

  // Close date menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showDateMenu) {
        const menuRef = dateMenuRefs.current[showDateMenu];
        if (menuRef && !menuRef.contains(event.target as Node)) {
          setShowDateMenu(null);
        }
      }
    };

    if (showDateMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDateMenu]);

  // Close group menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showGroupMenu) {
        const menuRef = groupMenuRefs.current[showGroupMenu];
        if (menuRef && !menuRef.contains(event.target as Node)) {
          setShowGroupMenu(null);
        }
      }
    };

    if (showGroupMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showGroupMenu]);

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

  // Delete all tasks for a specific date
  const handleDeleteDate = useCallback((dateKey: string) => {
    const groupsInDate = groupedArchiveTasks[dateKey];
    if (!groupsInDate) return;
    
    Object.values(groupsInDate).forEach(taskList => {
      taskList.forEach(task => {
        deleteTask(task.id);
      });
    });
    
    setShowDateMenu(null);
  }, [groupedArchiveTasks, deleteTask]);

  // Delete all tasks for a specific group within a date
  const handleDeleteGroupInDate = useCallback((dateKey: string, groupId: string) => {
    const tasksToDelete = groupedArchiveTasks[dateKey]?.[groupId];
    if (!tasksToDelete) return;
    
    tasksToDelete.forEach(task => {
      deleteTask(task.id);
    });
    setShowGroupMenu(null);
  }, [groupedArchiveTasks, deleteTask]);

  // Calculate statistics
  const calculateStats = useCallback((taskList: StoreTask[]) => {
    const count = taskList.length;
    const estimated = taskList.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
    const actual = taskList.reduce((sum, t) => sum + (t.actualMinutes || 0), 0);
    return { count, estimated, actual };
  }, []);

  if (Object.keys(groupedArchiveTasks).length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {Object.keys(groupedArchiveTasks)
        .sort((a, b) => b.localeCompare(a))
        .map(dateKey => {
          const groupsInDate = groupedArchiveTasks[dateKey];
          const dateExpanded = expandedDates.has(dateKey);
          const allTasksInDate = Object.values(groupsInDate).flat();
          const dateStats = calculateStats(allTasksInDate);
          
          return (
            <div key={dateKey} className="space-y-2">
              {/* Date header */}
              <div className="flex items-center gap-2 w-full">
                <button
                  onClick={() => toggleDateExpanded(dateKey)}
                  className="flex items-center gap-1.5 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                >
                  {dateExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="text-xs font-medium text-muted-foreground">
                    {formatTimeRangeDisplay(dateKey, timeView)}
                  </span>
                  <span className="text-xs text-zinc-400 dark:text-zinc-600">
                    ({dateStats.count} tasks
                    {dateStats.estimated > 0 && ` · Est. ${formatDuration(dateStats.estimated)}`}
                    {dateStats.actual > 0 && ` · Act. ${formatDuration(dateStats.actual)}`})
                  </span>
                </button>
                <div className="flex-1 h-px bg-border" />
                
                {/* Date menu */}
                <div className="relative" ref={el => { if (el) dateMenuRefs.current[dateKey] = el; }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDateMenu(showDateMenu === dateKey ? null : dateKey);
                    }}
                    className={`p-1.5 rounded-md transition-colors ${
                      showDateMenu === dateKey
                        ? 'text-zinc-400 bg-zinc-100 dark:text-zinc-500 dark:bg-zinc-800' 
                        : 'text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500'
                    }`}
                    aria-label="More options"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                  {showDateMenu === dateKey && (
                    <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 z-50">
                      <button
                        onClick={() => handleDeleteDate(dateKey)}
                        className="w-full px-3 py-1.5 text-left text-sm text-red-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        Delete All
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Date content: groups */}
              {dateExpanded && (
                <div className="ml-4 space-y-3">
                  {groups.filter(g => g.id !== '__archive__').map(group => {
                    const groupTasks = groupsInDate[group.id] || [];
                    
                    // Skip empty groups in week/month view
                    if (timeView !== 'day' && groupTasks.length === 0) {
                      return null;
                    }
                    
                    const groupKey = `${dateKey}-${group.id}`;
                    const groupExpanded = expandedGroups.has(groupKey);
                    const groupStats = calculateStats(groupTasks);
                    
                    return (
                      <div key={group.id} className="space-y-1">
                        {/* Group header */}
                        <div className="flex items-center gap-2 w-full">
                          <button
                            onClick={() => toggleGroupExpanded(dateKey, group.id)}
                            className="flex items-center gap-1.5 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                          >
                            {groupExpanded ? (
                              <ChevronDown className="h-3 w-3 text-zinc-400" />
                            ) : (
                              <ChevronRight className="h-3 w-3 text-zinc-400" />
                            )}
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                              {group.name}
                            </span>
                            <span className="text-xs text-zinc-400 dark:text-zinc-600">
                              ({groupStats.count}
                              {groupStats.estimated > 0 && ` · ${formatDuration(groupStats.estimated)}`}
                              {groupStats.actual > 0 && ` · ${formatDuration(groupStats.actual)}`})
                            </span>
                          </button>
                          <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                          
                          {/* Group menu - only show if has tasks */}
                          {groupTasks.length > 0 && (
                            <div className="relative" ref={el => { if (el) groupMenuRefs.current[groupKey] = el; }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowGroupMenu(showGroupMenu === groupKey ? null : groupKey);
                                }}
                                className={`p-1 rounded-md transition-colors ${
                                  showGroupMenu === groupKey
                                    ? 'text-zinc-400 bg-zinc-100 dark:text-zinc-500 dark:bg-zinc-800' 
                                    : 'text-zinc-300 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500'
                                }`}
                                aria-label="Group options"
                              >
                                <MoreHorizontal className="size-3" />
                              </button>
                              {showGroupMenu === groupKey && (
                                <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 z-50">
                                  <button
                                    onClick={() => handleDeleteGroupInDate(dateKey, group.id)}
                                    className="w-full px-3 py-1.5 text-left text-xs text-red-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                                  >
                                    Delete All
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Group tasks */}
                        {groupExpanded && (
                          <div className="ml-4 space-y-0.5">
                            {groupTasks.length > 0 ? (
                              <div className="opacity-60">
                                {groupTasks.map(task => renderTaskItem(task, 0))}
                              </div>
                            ) : (
                              <div className="text-xs text-zinc-400 dark:text-zinc-600 italic py-1">
                                No tasks
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
