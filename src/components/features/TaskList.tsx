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

  // Close completed menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (completedMenuRef.current && !completedMenuRef.current.contains(event.target as Node)) {
        setShowCompletedMenu(false);
      }
    };

    if (showCompletedMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCompletedMenu]);

  // Delete all completed tasks
  const handleDeleteAllCompleted = useCallback(() => {
    const completedTasksInGroup = tasks.filter(
      t => t.groupId === activeGroupId && t.completed && !t.parentId
    );
    
    completedTasksInGroup.forEach(task => {
      deleteTask(task.id);
    });
    
    setShowCompletedMenu(false);
  }, [tasks, activeGroupId, deleteTask]);

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

  // Filter tasks by current group - only top-level tasks
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
      moveTaskToGroup(taskId, activeGroupId, over?.id as string | null);
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
                    onClick={handleDeleteAllCompleted}
                    className="w-full px-3 py-1.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    删除全部
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 已完成任务区域 - 独立的 SortableContext */}
        {completedTasks.length > 0 && completedExpanded && (
          <SortableContext items={completedTaskIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-0.5 opacity-60">
              {completedTasks.map(task => renderTaskItem(task, 0))}
            </div>
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
