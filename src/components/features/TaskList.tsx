import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragMoveEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { invoke } from '@tauri-apps/api/core';
import { ChevronRight, ChevronDown, MoreHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { TaskItem } from './TaskItem';
import { useGroupStore, type Priority } from '@/stores/useGroupStore';

// Update position without awaiting result for smoother animation
const updatePositionFast = (x: number, y: number) => {
  invoke('update_drag_window_position', { x, y }).catch(() => {});
};

export function TaskList() {
  const {
    tasks,
    toggleTask,
    updateTask,
    deleteTask,
    archiveCompletedTasks,
    deleteCompletedTasks,
    reorderTasks,
    crossStatusReorder,
    activeGroupId,
    updateTaskPriority,
    moveTaskToGroup,
    addSubTask,
    toggleCollapse,
    hideCompleted,
    searchQuery,
    setDraggingTaskId,
    groups,
  } = useGroupStore();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [completedExpanded, setCompletedExpanded] = useState(true);
  const [addingSubTaskFor, setAddingSubTaskFor] = useState<string | null>(null);
  const [subTaskContent, setSubTaskContent] = useState('');
  const originalGroupIdRef = useRef<string | null>(null);
  const subTaskInputRef = useRef<HTMLTextAreaElement>(null);
  const prevActiveGroupIdRef = useRef<string | null>(null);
  const [showCompletedMenu, setShowCompletedMenu] = useState(false);
  const completedMenuRef = useRef<HTMLDivElement>(null);
  const [showDateMenu, setShowDateMenu] = useState<string | null>(null);
  const [showGroupMenu, setShowGroupMenu] = useState<string | null>(null);
  const dateMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const groupMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  
  // 时间维度选择：天/周/月
  type TimeView = 'day' | 'week' | 'month';
  const [timeView, setTimeView] = useState<TimeView>('day');
  const [showTimeViewMenu, setShowTimeViewMenu] = useState(false);
  const timeViewMenuRef = useRef<HTMLDivElement>(null);
  
  // 时间范围选择（每个时间维度独立存储）
  const [dayRange, setDayRange] = useState<number | 'all'>(7);
  const [weekRange, setWeekRange] = useState<number | 'all'>(4);
  const [monthRange, setMonthRange] = useState<number | 'all'>(3);
  const [showRangeMenu, setShowRangeMenu] = useState(false);
  const rangeMenuRef = useRef<HTMLDivElement>(null);
  const [customRangeInput, setCustomRangeInput] = useState('');
  const customRangeInputRef = useRef<HTMLInputElement>(null);
  const originalRangeRef = useRef<number | 'all'>(7); // 保存原始值，用于取消时恢复
  
  // 获取当前时间维度下的范围值
  const getCurrentRange = () => {
    if (timeView === 'day') return dayRange;
    if (timeView === 'week') return weekRange;
    return monthRange;
  };
  
  // 设置当前时间维度下的范围值
  const setCurrentRange = (range: number | 'all') => {
    if (timeView === 'day') setDayRange(range);
    else if (timeView === 'week') setWeekRange(range);
    else setMonthRange(range);
  };
  
  // 获取不同时间维度的范围选项
  const getRangeOptions = () => {
    if (timeView === 'day') return [3, 7, 14, 30, 'all' as const];
    if (timeView === 'week') return [2, 4, 8, 12, 'all' as const];
    return [2, 3, 6, 12, 'all' as const];
  };
  
  // 格式化范围显示文本
  const formatRangeText = (range: number | 'all') => {
    if (range === 'all') return '全部';
    if (timeView === 'day') return `${range}天`;
    if (timeView === 'week') return `${range}周`;
    return `${range}个月`;
  };
  
  // 解析自定义范围输入
  const parseCustomRange = (input: string): number | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    
    // 直接输入数字
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num > 0) {
      return num;
    }
    
    return null;
  };
  
  // 获取时间键值的辅助函数
  const getTodayKey = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  };
  const getYesterdayKey = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  };
  const getCurrentWeekKey = () => {
    const today = new Date();
    const firstDay = new Date(today);
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day; // 周一为第一天
    firstDay.setDate(today.getDate() + diff);
    const yearStart = new Date(firstDay.getFullYear(), 0, 1);
    const weekNum = Math.ceil((firstDay.getTime() - yearStart.getTime()) / 604800000) + 1;
    return `${firstDay.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  };
  const getCurrentMonthKey = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  };
  
  // 根据时间视图动态设置默认展开项
  const getDefaultExpandedDates = () => {
    if (timeView === 'day') {
      return new Set([getTodayKey(), getYesterdayKey()]);
    } else if (timeView === 'week') {
      return new Set([getCurrentWeekKey()]);
    } else {
      return new Set([getCurrentMonthKey()]);
    }
  };
  
  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => getDefaultExpandedDates());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  // 当时间视图切换时，重置展开状态
  useEffect(() => {
    setExpandedDates(getDefaultExpandedDates());
    setExpandedGroups(new Set());
  }, [timeView]);

  // 当范围菜单打开时，清空自定义输入并保存原始值（只在打开瞬间执行一次）
  const prevShowRangeMenu = useRef(false);
  useEffect(() => {
    // 只在菜单从关闭变为打开时执行
    if (showRangeMenu && !prevShowRangeMenu.current) {
      setCustomRangeInput('');
      // 保存当前值（使用当时的值，不依赖后续变化）
      if (timeView === 'day') originalRangeRef.current = dayRange;
      else if (timeView === 'week') originalRangeRef.current = weekRange;
      else originalRangeRef.current = monthRange;
    }
    prevShowRangeMenu.current = showRangeMenu;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRangeMenu]); // 只依赖 showRangeMenu，避免输入时重复触发
  
  // Close completed menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (completedMenuRef.current && !completedMenuRef.current.contains(event.target as Node)) {
        setShowCompletedMenu(false);
      }
      if (timeViewMenuRef.current && !timeViewMenuRef.current.contains(event.target as Node)) {
        setShowTimeViewMenu(false);
      }
      if (rangeMenuRef.current && !rangeMenuRef.current.contains(event.target as Node)) {
        // 点击外部关闭时，如果有未确认的输入，恢复到原始值
        if (customRangeInput.trim()) {
          if (timeView === 'day') setDayRange(originalRangeRef.current);
          else if (timeView === 'week') setWeekRange(originalRangeRef.current);
          else setMonthRange(originalRangeRef.current);
        }
        setShowRangeMenu(false);
        setCustomRangeInput('');
      }
    };

    if (showCompletedMenu || showTimeViewMenu || showRangeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCompletedMenu, showTimeViewMenu, showRangeMenu, customRangeInput, timeView]);

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

  // Close time view menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (timeViewMenuRef.current && !timeViewMenuRef.current.contains(event.target as Node)) {
        setShowTimeViewMenu(false);
      }
    };

    if (showTimeViewMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showTimeViewMenu]);

  // Archive all completed tasks
  const handleArchiveCompleted = useCallback(async () => {
    if (!activeGroupId || activeGroupId === '__archive__') return;
    
    try {
      await archiveCompletedTasks(activeGroupId);
      setShowCompletedMenu(false);
    } catch (error) {
      console.error('Failed to archive completed tasks:', error);
      // 可以在这里添加用户提示
    }
  }, [activeGroupId, archiveCompletedTasks]);

  // Delete all completed tasks
  const handleDeleteCompleted = useCallback(() => {
    if (!activeGroupId || activeGroupId === '__archive__') return;
    
    deleteCompletedTasks(activeGroupId);
    setShowCompletedMenu(false);
  }, [activeGroupId, deleteCompletedTasks]);

  // Get children for a task
  const getChildren = useCallback((parentId: string) => {
    return tasks
      .filter(t => t.parentId === parentId && t.groupId === activeGroupId)
      .sort((a, b) => a.order - b.order);
  }, [tasks, activeGroupId]);

  // Handle add subtask - show modal input
  const handleAddSubTask = useCallback((parentId: string) => {
    setAddingSubTaskFor(parentId);
    setSubTaskContent('');
  }, []);

  const handleSubmitSubTask = useCallback(() => {
    if (addingSubTaskFor && subTaskContent.trim()) {
      addSubTask(addingSubTaskFor, subTaskContent.trim());
    }
    setAddingSubTaskFor(null);
    setSubTaskContent('');
  }, [addingSubTaskFor, subTaskContent, addSubTask]);

  const handleCancelSubTask = useCallback(() => {
    setAddingSubTaskFor(null);
    setSubTaskContent('');
  }, []);

  // Auto-focus input when modal opens
  useEffect(() => {
    if (addingSubTaskFor && subTaskInputRef.current) {
      subTaskInputRef.current.focus();
    }
  }, [addingSubTaskFor]);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = subTaskInputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [subTaskContent]);

  // Priority order: red (0) > yellow (1) > purple (2) > green (3) > default (4)
  const priorityOrder = { red: 0, yellow: 1, purple: 2, green: 3, default: 4 };
  
  // 格式化时间范围显示
  const formatTimeRangeDisplay = (timeKey: string) => {
    if (timeView === 'day') {
      const [year, month, day] = timeKey.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      today.setHours(0, 0, 0, 0);
      yesterday.setHours(0, 0, 0, 0);
      date.setHours(0, 0, 0, 0);
      
      if (date.getTime() === today.getTime()) {
        return '今天';
      } else if (date.getTime() === yesterday.getTime()) {
        return '昨天';
      } else {
        return `${year}年${month}月${day}日`;
      }
    } else if (timeView === 'week') {
      const [yearStr, weekStr] = timeKey.split('-W');
      const year = parseInt(yearStr);
      const week = parseInt(weekStr);
      
      // 计算该周的开始和结束日期
      const yearStart = new Date(year, 0, 1);
      const firstMonday = new Date(yearStart);
      const dayOfWeek = yearStart.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      firstMonday.setDate(yearStart.getDate() + diff);
      
      const weekStart = new Date(firstMonday);
      weekStart.setDate(firstMonday.getDate() + (week - 1) * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      // 检查是否是本周
      const currentWeekKey = getCurrentWeekKey();
      if (timeKey === currentWeekKey) {
        return '本周';
      }
      
      return `${year}年第${week}周 (${weekStart.getMonth() + 1}/${weekStart.getDate()} - ${weekEnd.getMonth() + 1}/${weekEnd.getDate()})`;
    } else {
      const [year, month] = timeKey.split('-');
      const currentMonthKey = getCurrentMonthKey();
      
      if (timeKey === currentMonthKey) {
        return '本月';
      }
      
      return `${year}年${month}月`;
    }
  };

  // 获取时间范围键值的辅助函数
  const getTimeRangeKey = (timestamp: number) => {
    const date = new Date(timestamp);
    
    if (timeView === 'day') {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    } else if (timeView === 'week') {
      const firstDay = new Date(date);
      const day = date.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      firstDay.setDate(date.getDate() + diff);
      const yearStart = new Date(firstDay.getFullYear(), 0, 1);
      const weekNum = Math.ceil((firstDay.getTime() - yearStart.getTime()) / 604800000) + 1;
      return `${firstDay.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    } else {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
  };

  // Filter tasks by current group - only top-level tasks
  // 按时间维度和分组双层分组归档任务
  const groupedArchiveTasks = useMemo(() => {
    if (activeGroupId !== '__archive__') return {};
    
    const topLevelArchiveTasks = tasks
      .filter((t) => t.groupId === activeGroupId && !t.parentId)
      .sort((a, b) => {
        // 按完成时间倒序排序（最新的在前）
        if (!a.completedAt && !b.completedAt) return 0;
        if (!a.completedAt) return 1;
        if (!b.completedAt) return -1;
        return b.completedAt - a.completedAt;
      });
    
    // 第一层：按时间范围分组（天/周/月）
    const dateGroups: Record<string, Record<string, typeof topLevelArchiveTasks>> = {};
    
    topLevelArchiveTasks.forEach(task => {
      if (!task.completedAt) return;
      
      // 根据时间视图获取对应的键值
      const timeKey = getTimeRangeKey(task.completedAt);
      
      // 从任务的 originalGroupId 属性获取原始分组ID
      const originalGroupId = (task as any).originalGroupId || 'unknown';
      
      if (!dateGroups[timeKey]) {
        dateGroups[timeKey] = {};
      }
      if (!dateGroups[timeKey][originalGroupId]) {
        dateGroups[timeKey][originalGroupId] = [];
      }
      dateGroups[timeKey][originalGroupId].push(task);
    });
    
    // 对每个分组内的任务按优先级排序
    Object.keys(dateGroups).forEach(dateKey => {
      Object.keys(dateGroups[dateKey]).forEach(groupId => {
        dateGroups[dateKey][groupId].sort((a, b) => {
          // 先按优先级排序
          const aPriority = priorityOrder[a.priority || 'default'];
          const bPriority = priorityOrder[b.priority || 'default'];
          if (aPriority !== bPriority) {
            return aPriority - bPriority;
          }
          // 同优先级按完成时间倒序（最新的在前）
          if (!a.completedAt && !b.completedAt) return 0;
          if (!a.completedAt) return 1;
          if (!b.completedAt) return -1;
          return b.completedAt - a.completedAt;
        });
      });
    });
    
    // 应用时间范围筛选
    const currentRange = getCurrentRange();
    if (currentRange !== 'all') {
      const sortedDateKeys = Object.keys(dateGroups).sort((a, b) => {
        // 按日期倒序排序（最新的在前）
        return b.localeCompare(a);
      });
      
      // 只保留最近 N 个时间段
      const limitedKeys = sortedDateKeys.slice(0, currentRange);
      const filteredGroups: Record<string, Record<string, typeof topLevelArchiveTasks>> = {};
      
      limitedKeys.forEach(key => {
        filteredGroups[key] = dateGroups[key];
      });
      
      return filteredGroups;
    }
    
    return dateGroups;
  }, [tasks, activeGroupId, timeView, getCurrentRange]);

  const { incompleteTasks, completedTasks } = useMemo(() => {
    const topLevelTasks = tasks
      .filter((t) => t.groupId === activeGroupId && !t.parentId)
      .sort((a, b) => {
        // Sort by priority first (creates color groups)
        const aPriority = priorityOrder[a.priority || 'default'];
        const bPriority = priorityOrder[b.priority || 'default'];
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        // Then by order within same priority
        return a.order - b.order;
      });
    
    return {
      incompleteTasks: topLevelTasks.filter((t) => !t.completed),
      completedTasks: hideCompleted ? [] : topLevelTasks.filter((t) => t.completed),
    };
  }, [tasks, activeGroupId, hideCompleted]);

  // 切换日期展开/折叠
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

  // 切换分组展开/折叠
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
    if (!activeGroupId || activeGroupId !== '__archive__') return;
    
    const groupsInDate = groupedArchiveTasks[dateKey];
    if (!groupsInDate) return;
    
    // 删除该日期下所有分组的所有任务
    Object.values(groupsInDate).forEach(taskList => {
      taskList.forEach(task => {
        deleteTask(task.id);
      });
    });
    
    setShowDateMenu(null);
  }, [activeGroupId, groupedArchiveTasks, deleteTask]);

  // Delete all tasks for a specific group within a date
  const handleDeleteGroupInDate = useCallback((dateKey: string, groupId: string) => {
    if (!activeGroupId || activeGroupId !== '__archive__') return;
    
    const tasksToDelete = groupedArchiveTasks[dateKey]?.[groupId];
    if (!tasksToDelete) return;
    
    tasksToDelete.forEach(task => {
      deleteTask(task.id);
    });
  }, [activeGroupId, groupedArchiveTasks, deleteTask]);

  // 格式化时间显示：超过60分钟转换为小时+分钟
  const formatTime = (minutes: number): string => {
    if (minutes < 60) {
      return `${Math.round(minutes)}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (mins === 0) {
      return `${hours}h`;
    }
    return `${hours}h${mins}m`;
  };

  // 计算统计信息
  const calculateStats = useCallback((taskList: typeof tasks) => {
    const count = taskList.length;
    const estimated = taskList.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
    const actual = taskList.reduce((sum, t) => sum + (t.actualMinutes || 0), 0);
    return { count, estimated, actual };
  }, []);

  const filteredTasks = useMemo(() => {
    return [...incompleteTasks, ...completedTasks];
  }, [incompleteTasks, completedTasks]);


  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const incompleteTaskIds = useMemo(() => incompleteTasks.map((t) => t.id), [incompleteTasks]);
  const completedTaskIds = useMemo(() => completedTasks.map((t) => t.id), [completedTasks]);

  // 自动滚动到第一个匹配搜索词的任务
  useEffect(() => {
    // 检测分组切换
    if (activeGroupId !== prevActiveGroupIdRef.current) {
      prevActiveGroupIdRef.current = activeGroupId;
      
      // 如果有搜索词，滚动到第一个匹配的任务
      if (searchQuery.trim()) {
        setTimeout(() => {
          const query = searchQuery.toLowerCase();
          const matchingTask = filteredTasks.find(task => 
            task.content.toLowerCase().includes(query)
          );
          
          if (matchingTask) {
            const taskElement = document.querySelector(`[data-task-id="${matchingTask.id}"]`);
            if (taskElement) {
              taskElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
        }, 100); // 延迟以确保 DOM 已渲染
      }
    }
  }, [activeGroupId, searchQuery, filteredTasks]);

  const handleDragStart = useCallback(async (event: DragStartEvent) => {
    const id = event.active.id as string;
    setActiveId(id);
    setDraggingTaskId(id);
    // Save original group for cross-group move detection
    originalGroupIdRef.current = activeGroupId;
    
    const task = tasks.find(t => t.id === id);
    if (task) {
      // Count all descendants recursively (including the task itself in subtree)
      const countDescendants = (taskId: string): number => {
        const children = tasks.filter(t => t.parentId === taskId);
        if (children.length === 0) return 0;
        return children.length + children.reduce((sum, child) => sum + countDescendants(child.id), 0);
      };
      const childCount = countDescendants(task.id);
      
      // Get actual dimensions of the task element
      const taskElement = document.querySelector(`[data-task-id="${id}"]`);
      const rect = taskElement?.getBoundingClientRect();
      const width = rect?.width || 350;
      const height = rect?.height || 36;
      
      // Get mouse position (screen coordinates) and detect dark mode
      const pointer = (event.activatorEvent as PointerEvent);
      const isDarkMode = document.documentElement.classList.contains('dark');
      
      // Add child count indicator if task has children
      const displayContent = childCount > 0 
        ? `${task.content} (+${childCount})` 
        : task.content;
      
      try {
        await invoke('create_drag_window', {
          content: displayContent,
          x: pointer.screenX,
          y: pointer.screenY,
          width: width,
          height: height,
          isDone: task.completed,
          isDark: isDarkMode,
          priority: task.priority || 'default',
        });
      } catch (e) {
        console.error('Failed to create drag window:', e);
      }
    }
  }, [tasks, activeGroupId, setDraggingTaskId]);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const rect = (event.activatorEvent as PointerEvent);
    // Calculate current position
    const x = rect.screenX + (event.delta?.x || 0);
    const y = rect.screenY + (event.delta?.y || 0);
    updatePositionFast(x, y);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverId(event.over?.id as string | null);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    const taskId = active.id as string;
    const originalGroupId = originalGroupIdRef.current;
    
    // Check if this is a cross-group move (group changed during drag)
    if (originalGroupId && activeGroupId && originalGroupId !== activeGroupId) {
      // Move task to the new group at the drop position
      try {
        await moveTaskToGroup(taskId, activeGroupId, over?.id as string | null);
      } catch (error) {
        console.error('Failed to move task to group:', error);
      }
    } else if (over && active.id !== over.id) {
      // Check if dragging across completion status boundary
      const draggedTask = tasks.find(t => t.id === taskId);
      const targetTask = tasks.find(t => t.id === over.id);
      
      // First handle reordering
      if (draggedTask && targetTask && draggedTask.completed !== targetTask.completed) {
        // Cross-status drag: use special handler that changes status and reorders atomically
        crossStatusReorder(taskId, over.id as string);
      } else {
        // Same status reorder
        reorderTasks(taskId, over.id as string);
      }
      
      // Then auto-adapt priority based on drop position
      // Only inherit priority when dragging within the same status (incomplete or completed)
      if (draggedTask && targetTask && draggedTask.completed === targetTask.completed) {
        // Find the sorted task list to determine context
        // IMPORTANT: Exclude the dragged task itself to avoid incorrect detection
        const groupTasks = tasks
          .filter(t => t.groupId === activeGroupId && !t.parentId && t.completed === targetTask.completed && t.id !== taskId)
          .sort((a, b) => {
            const aPriority = priorityOrder[a.priority || 'default'];
            const bPriority = priorityOrder[b.priority || 'default'];
            if (aPriority !== bPriority) return aPriority - bPriority;
            return a.order - b.order;
          });
        
        const targetIndex = groupTasks.findIndex(t => t.id === over.id);
        const taskAbove = targetIndex > 0 ? groupTasks[targetIndex - 1] : null;
        
        const abovePriority = (taskAbove?.priority || 'default') as string;
        const targetPriority = (targetTask.priority || 'default') as string;
        const draggedPriority = (draggedTask.priority || 'default') as string;
        
        let priorityToInherit: string | null = null;
        
        // Inherit priority from the drop position
        // Check both above and target task to determine the priority zone
        if (abovePriority !== 'default') {
          // Has priority task above, inherit from it
          priorityToInherit = abovePriority;
        } else if (targetPriority !== 'default') {
          // No priority above, but target has priority, inherit from target
          priorityToInherit = targetPriority;
        } else {
          // Surrounded by default tasks, downgrade to default
          priorityToInherit = 'default';
        }
        
        // Update priority if it changed
        if (priorityToInherit && priorityToInherit !== draggedPriority) {
          updateTaskPriority(taskId, priorityToInherit as Priority);
        }
      }
    }
    
    // Now safe to show the task (it's already at the new position)
    setActiveId(null);
    setOverId(null);
    originalGroupIdRef.current = null;
    
    // Destroy drag window
    try {
      await invoke('destroy_drag_window');
    } catch (e) {
      // ignore
    }
    
    // Delay clearing draggingTaskId to allow cross-group drop handlers to execute
    setTimeout(() => {
      setDraggingTaskId(null);
    }, 50);
  }, [reorderTasks, crossStatusReorder, setDraggingTaskId, activeGroupId, moveTaskToGroup, tasks]);

  // Cleanup: destroy drag window on unmount
  useEffect(() => {
    return () => {
      invoke('destroy_drag_window').catch(() => {});
    };
  }, []);

  if (filteredTasks.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground text-sm">
          No tasks
        </p>
      </div>
    );
  }

  const renderTaskItem = (task: typeof filteredTasks[0], level: number = 0): React.ReactNode => {
    const activeIndex = activeId ? filteredTasks.findIndex(t => t.id === activeId) : -1;
    const overIndex = overId ? filteredTasks.findIndex(t => t.id === overId) : -1;
    const isDropTarget = task.id === overId && overId !== activeId;
    const insertAfter = isDropTarget && activeIndex !== -1 && overIndex > activeIndex;
    
    const children = getChildren(task.id);
    const hasChildren = children.length > 0;
    
    // Check if this task or any ancestor is being dragged
    const checkAncestorDragged = (taskId: string, visited = new Set<string>()): boolean => {
      if (taskId === activeId) return true;
      if (visited.has(taskId)) return false; // Prevent infinite loop
      visited.add(taskId);
      const t = tasks.find(task => task.id === taskId);
      if (t?.parentId) return checkAncestorDragged(t.parentId, visited);
      return false;
    };
    const isBeingDragged = checkAncestorDragged(task.id);
    
    return (
      <div key={task.id}>
        <TaskItem
          task={{
            id: task.id,
            content: task.content,
            isDone: task.completed,
            createdAt: task.createdAt,
            groupId: task.groupId,
            priority: task.priority,
            completedAt: task.completedAt ? new Date(task.completedAt).toISOString().split('T')[0] : undefined,
            estimatedMinutes: task.estimatedMinutes,
            actualMinutes: task.actualMinutes,
          }}
          onToggle={toggleTask}
          onUpdate={updateTask}
          onUpdateTime={() => {}}
          onDelete={deleteTask}
          onAddSubTask={handleAddSubTask}
          isBeingDragged={isBeingDragged}
          isDropTarget={isDropTarget}
          insertAfter={insertAfter}
          level={level}
          hasChildren={hasChildren}
          collapsed={task.collapsed}
          onToggleCollapse={() => toggleCollapse(task.id)}
        />
        {/* Render children recursively if not collapsed */}
        {hasChildren && !task.collapsed && (
          <div className="ml-6">
            {children.map(child => renderTaskItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };


  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {/* 未完成任务区域 - 独立的 SortableContext */}
        <SortableContext items={incompleteTaskIds} strategy={verticalListSortingStrategy}>
          {incompleteTasks.length > 0 && (
            <div className="space-y-0.5">
              {incompleteTasks.map(task => renderTaskItem(task, 0))}
            </div>
          )}
        </SortableContext>

        {/* 分割线 - 在两个 SortableContext 之间 */}
        {completedTasks.length > 0 && (
          <div className="flex items-center gap-2 w-full mt-6 mb-6">
            <button
              onClick={() => setCompletedExpanded(!completedExpanded)}
              className="flex items-center gap-2 group hover:opacity-80 transition-all duration-300"
            >
              {completedExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-xs font-medium text-muted-foreground">
                Completed ({completedTasks.length})
              </span>
            </button>
            <div className="flex-1 h-px bg-border" />
            
            {/* 归档视图中显示时间维度选择器 */}
            {activeGroupId === '__archive__' && (
              <div className="relative" ref={timeViewMenuRef}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTimeViewMenu(!showTimeViewMenu);
                  }}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                    showTimeViewMenu
                      ? 'text-zinc-600 bg-zinc-100 dark:text-zinc-300 dark:bg-zinc-800'
                      : 'text-zinc-500 hover:text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:text-zinc-300 dark:hover:bg-zinc-800'
                  }`}
                >
                  {timeView === 'day' ? '天' : timeView === 'week' ? '周' : '月'}
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showTimeViewMenu && (
                  <div className="absolute right-0 top-full mt-1 w-20 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 z-50">
                    <button
                      onClick={() => {
                        setTimeView('day');
                        setShowTimeViewMenu(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-sm transition-colors flex items-center ${
                        timeView === 'day'
                          ? 'text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800'
                          : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {timeView === 'day' && <span className="mr-1">✓</span>}
                      天
                    </button>
                    <button
                      onClick={() => {
                        setTimeView('week');
                        setShowTimeViewMenu(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-sm transition-colors flex items-center ${
                        timeView === 'week'
                          ? 'text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800'
                          : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {timeView === 'week' && <span className="mr-1">✓</span>}
                      周
                    </button>
                    <button
                      onClick={() => {
                        setTimeView('month');
                        setShowTimeViewMenu(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-sm transition-colors flex items-center ${
                        timeView === 'month'
                          ? 'text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800'
                          : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {timeView === 'month' && <span className="mr-1">✓</span>}
                      月
                    </button>
                  </div>
                )}
              </div>
            )}
            
            {/* 时间范围选择器（归档视图） */}
            {activeGroupId === '__archive__' && (
              <div className="relative" ref={rangeMenuRef}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRangeMenu(!showRangeMenu);
                  }}
                  className={`px-2 py-1 text-xs rounded-md transition-colors flex items-center gap-1 ${
                    showRangeMenu
                      ? 'text-zinc-600 bg-zinc-100 dark:text-zinc-300 dark:bg-zinc-800'
                      : 'text-zinc-500 hover:text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:text-zinc-300 dark:hover:bg-zinc-800'
                  }`}
                >
                  {formatRangeText(getCurrentRange())}
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showRangeMenu && (
                  <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 z-50">
                    {getRangeOptions().map(option => (
                      <button
                        key={option}
                        onClick={() => {
                          setCurrentRange(option);
                          setShowRangeMenu(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-sm transition-colors flex items-center ${
                          getCurrentRange() === option
                            ? 'text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800'
                            : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {getCurrentRange() === option && <span className="mr-1">✓</span>}
                        {formatRangeText(option)}
                      </button>
                    ))}
                    <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
                    {/* 自定义范围输入 */}
                    <div className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <input
                          ref={customRangeInputRef}
                          type="text"
                          value={customRangeInput}
                          onChange={(e) => {
                            const input = e.target.value;
                            setCustomRangeInput(input);
                            // 实时应用：输入时立即解析并应用
                            const parsed = parseCustomRange(input);
                            if (parsed !== null) {
                              setCurrentRange(parsed);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              // Enter 确认应用当前值，关闭菜单
                              setCustomRangeInput('');
                              setShowRangeMenu(false);
                            } else if (e.key === 'Escape') {
                              // Escape 恢复原始值，关闭菜单
                              if (timeView === 'day') setDayRange(originalRangeRef.current);
                              else if (timeView === 'week') setWeekRange(originalRangeRef.current);
                              else setMonthRange(originalRangeRef.current);
                              setCustomRangeInput('');
                              setShowRangeMenu(false);
                            }
                          }}
                          placeholder="输入数字"
                          className="flex-1 w-16 px-2 py-1 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500"
                        />
                        <span className="text-xs text-zinc-400 dark:text-zinc-600 whitespace-nowrap">
                          {timeView === 'day' ? '天' : timeView === 'week' ? '周' : '个月'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* 只在非归档视图中显示三个点菜单 */}
            {activeGroupId !== '__archive__' && (
              <div className="relative" ref={completedMenuRef}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCompletedMenu(!showCompletedMenu);
                  }}
                  className={`p-1.5 rounded-md transition-colors ${
                    showCompletedMenu 
                      ? 'text-zinc-400 bg-zinc-100 dark:text-zinc-500 dark:bg-zinc-800' 
                      : 'text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500'
                  }`}
                  aria-label="More options"
                >
                  <MoreHorizontal className="size-4" />
                </button>
                {showCompletedMenu && (
                  <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 z-50">
                    <button
                      onClick={handleArchiveCompleted}
                      className="w-full px-3 py-1.5 text-left text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      归档全部
                    </button>
                    <button
                      onClick={handleDeleteCompleted}
                      className="w-full px-3 py-1.5 text-left text-sm text-red-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      全部删除
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 已完成任务区域 - 独立的 SortableContext */}
        {completedTasks.length > 0 && completedExpanded && (
          <SortableContext items={completedTaskIds} strategy={verticalListSortingStrategy}>
            {/* 归档视图：按日期>分组双层结构显示 */}
            {activeGroupId === '__archive__' ? (
              <div className="space-y-4">
                {Object.keys(groupedArchiveTasks)
                  .sort((a, b) => b.localeCompare(a)) // 日期倒序
                  .map(dateKey => {
                    const groupsInDate = groupedArchiveTasks[dateKey];
                    const dateExpanded = expandedDates.has(dateKey);
                    
                    // 计算该日期下所有任务的统计
                    const allTasksInDate = Object.values(groupsInDate).flat();
                    const dateStats = calculateStats(allTasksInDate);
                    
                    return (
                      <div key={dateKey} className="space-y-2">
                        {/* 日期分割线 - 可折叠 */}
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
                              {formatTimeRangeDisplay(dateKey)}
                            </span>
                            <span className="text-xs text-zinc-400 dark:text-zinc-600">
                              ({dateStats.count}个任务
                              {dateStats.estimated > 0 && ` · 预估${formatTime(dateStats.estimated)}`}
                              {dateStats.actual > 0 && ` · 实际${formatTime(dateStats.actual)}`})
                            </span>
                          </button>
                          <div className="flex-1 h-px bg-border" />
                          {/* 日期菜单 */}
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
                                  删除全部
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* 日期展开内容：按分组显示 */}
                        {dateExpanded && (
                          <div className="ml-4 space-y-3">
                            {/* 遍历分组：天视图显示空分组，周/月视图只显示有任务的分组 */}
                            {groups.filter(g => g.id !== '__archive__').map(group => {
                              const groupTasks = groupsInDate[group.id] || [];
                              
                              // 在周和月视图中，跳过空分组
                              if (timeView !== 'day' && groupTasks.length === 0) {
                                return null;
                              }
                              
                              const groupKey = `${dateKey}-${group.id}`;
                              const groupExpanded = expandedGroups.has(groupKey);
                              const groupStats = calculateStats(groupTasks);
                              
                              return (
                                <div key={group.id} className="space-y-1">
                                  {/* 分组标题 - 可折叠 */}
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
                                        {groupStats.estimated > 0 && ` · ${formatTime(groupStats.estimated)}`}
                                        {groupStats.actual > 0 && ` · ${formatTime(groupStats.actual)}`})
                                      </span>
                                    </button>
                                    <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                                    {/* 分组菜单 - 只在有任务时显示 */}
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
                                              onClick={() => {
                                                handleDeleteGroupInDate(dateKey, group.id);
                                                setShowGroupMenu(null);
                                              }}
                                              className="w-full px-3 py-1.5 text-left text-xs text-red-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                                            >
                                              删除全部
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* 分组任务列表 */}
                                  {groupExpanded && (
                                    <div className="ml-4 space-y-0.5">
                                      {groupTasks.length > 0 ? (
                                        <div className="opacity-60">
                                          {groupTasks.map(task => renderTaskItem(task, 0))}
                                        </div>
                                      ) : (
                                        <div className="text-xs text-zinc-400 dark:text-zinc-600 italic py-1">
                                          暂无任务
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
            ) : (
              /* 普通视图：直接显示已完成任务 */
              <div className="space-y-0.5 opacity-60">
                {completedTasks.map(task => renderTaskItem(task, 0))}
              </div>
            )}
          </SortableContext>
        )}
      </DndContext>

      {/* Subtask Input Modal */}
      <AnimatePresence>
        {addingSubTaskFor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCancelSubTask}
            className="fixed inset-0 bg-black/20 dark:bg-black/40 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-[500px] max-w-[90vw] p-4"
            >
              <textarea
                ref={subTaskInputRef}
                value={subTaskContent}
                onChange={(e) => setSubTaskContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitSubTask();
                  } else if (e.key === 'Escape') {
                    handleCancelSubTask();
                  }
                }}
                placeholder="输入子任务内容... (Enter 确认, Shift+Enter 换行, Esc 取消)"
                rows={1}
                className="w-full bg-transparent border-none outline-none resize-none text-sm text-foreground placeholder:text-muted-foreground/50 leading-relaxed min-h-[60px] max-h-[400px] overflow-y-auto"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
