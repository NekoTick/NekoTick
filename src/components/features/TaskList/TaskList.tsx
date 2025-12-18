import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { invoke } from '@tauri-apps/api/core';

import { TaskItem } from '../TaskItem';
import { useGroupStore, useUIStore } from '@/stores/useGroupStore';
import type { TimeView } from '@/lib/dateUtils';
import { useDragAndDrop } from './useDragAndDrop';
import { CompletedSection } from './CompletedSection';
import { ArchiveTaskList } from './ArchiveTaskList';
import { SubTaskModal } from './SubTaskModal';

// Color sorting: red (0) > yellow (1) > purple (2) > green (3) > blue (4) > default (5)
const colorOrder: Record<string, number> = { red: 0, yellow: 1, purple: 2, green: 3, blue: 4, default: 5 };

export function TaskList() {
  const {
    tasks,
    toggleTask,
    updateTask,
    deleteTask,
    archiveCompletedTasks,
    deleteCompletedTasks,
    reorderTasks,
    activeGroupId,
    updateTaskColor,
    moveTaskToGroup,
    addSubTask,
    toggleCollapse,
    groups,
  } = useGroupStore();
  
  const {
    hideCompleted,
    searchQuery,
    setDraggingTaskId,
    selectedColors,
    // Archive time range settings
    archiveTimeView,
    archiveDayRange,
    archiveWeekRange,
    archiveMonthRange,
    setArchiveTimeView,
    setArchiveRange,
  } = useUIStore();

  const [completedExpanded, setCompletedExpanded] = useState(true);
  const [addingSubTaskFor, setAddingSubTaskFor] = useState<string | null>(null);
  const [subTaskContent, setSubTaskContent] = useState('');
  const [showCompletedMenu, setShowCompletedMenu] = useState(false);
  const prevActiveGroupIdRef = useRef<string | null>(null);

  // Time view from store
  const timeView = archiveTimeView;
  const setTimeView = (view: TimeView) => {
    setArchiveTimeView(view);
    // Archive view switching is handled by unified store
  };

  // Time range helpers
  const getCurrentRange = () => {
    if (timeView === 'day') return archiveDayRange;
    if (timeView === 'week') return archiveWeekRange;
    return archiveMonthRange;
  };
  
  const setCurrentRange = (range: number | 'all') => {
    setArchiveRange(timeView, range);
    // Archive range change is handled by unified store
  };

  // Drag and drop hook
  const {
    sensors,
    customCollisionDetection,
    activeId,
    overId,
    dragIndent,
    handleDragStart,
    handleDragMove,
    handleDragOver,
    handleDragEnd,
  } = useDragAndDrop({
    tasks,
    activeGroupId,
    groups,
    toggleCollapse,
    reorderTasks,
    moveTaskToGroup,
    updateTaskColor,
    setDraggingTaskId,
  });

  // Get children for a task
  const getChildren = useCallback((parentId: string) => {
    return tasks
      .filter(t => t.parentId === parentId && t.groupId === activeGroupId)
      .sort((a, b) => a.order - b.order);
  }, [tasks, activeGroupId]);

  // Archive all completed tasks
  const handleArchiveCompleted = useCallback(async () => {
    if (!activeGroupId || activeGroupId === '__archive__') return;
    
    try {
      await archiveCompletedTasks(activeGroupId);
      setShowCompletedMenu(false);
    } catch (error) {
      console.error('Failed to archive completed tasks:', error);
    }
  }, [activeGroupId, archiveCompletedTasks]);

  // Delete all completed tasks
  const handleDeleteCompleted = useCallback(() => {
    if (!activeGroupId || activeGroupId === '__archive__') return;
    
    deleteCompletedTasks(activeGroupId);
    setShowCompletedMenu(false);
  }, [activeGroupId, deleteCompletedTasks]);

  // Handle add subtask
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

  // Filter and sort tasks
  const { incompleteTasks, completedTasks } = useMemo(() => {
    const topLevelTasks = tasks
      .filter((t) => {
        if (t.groupId !== activeGroupId || t.parentId) return false;
        if (!selectedColors.includes(t.color || 'default')) return false;
        return true;
      })
      .sort((a, b) => {
        const aColor = colorOrder[a.color || 'default'];
        const bColor = colorOrder[b.color || 'default'];
        if (aColor !== bColor) return aColor - bColor;
        return a.order - b.order;
      });

    return {
      incompleteTasks: topLevelTasks.filter((t) => !t.completed),
      completedTasks: hideCompleted ? [] : topLevelTasks.filter((t) => t.completed),
    };
  }, [tasks, activeGroupId, hideCompleted, selectedColors]);

  const filteredTasks = useMemo(() => {
    return [...incompleteTasks, ...completedTasks];
  }, [incompleteTasks, completedTasks]);

  // Get all task IDs for SortableContext
  const getAllTaskIds = (taskList: typeof incompleteTasks) => {
    const ids: string[] = [];
    const addTaskAndChildren = (task: typeof taskList[0]) => {
      ids.push(task.id);
      const children = tasks.filter(t => t.parentId === task.id);
      children.forEach(addTaskAndChildren);
    };
    taskList.forEach(addTaskAndChildren);
    return ids;
  };
  
  const incompleteTaskIds = useMemo(() => getAllTaskIds(incompleteTasks), [incompleteTasks, tasks]);
  const completedTaskIds = useMemo(() => getAllTaskIds(completedTasks), [completedTasks, tasks]);

  // Auto-scroll to first matching task when search query exists
  useEffect(() => {
    if (activeGroupId !== prevActiveGroupIdRef.current) {
      prevActiveGroupIdRef.current = activeGroupId;
      
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
        }, 100);
      }
    }
  }, [activeGroupId, searchQuery, filteredTasks]);

  // Cleanup drag window on unmount
  useEffect(() => {
    return () => {
      invoke('destroy_drag_window').catch(() => {});
    };
  }, []);

  // Render a single task item
  const renderTaskItem = useCallback((task: typeof filteredTasks[0], level: number = 0) => {
    const activeIndex = activeId ? filteredTasks.findIndex(t => t.id === activeId) : -1;
    const overIndex = overId ? filteredTasks.findIndex(t => t.id === overId) : -1;
    const isDropTarget = task.id === overId;
    const insertAfter = isDropTarget && activeIndex !== -1 && overIndex > activeIndex;
    
    const children = getChildren(task.id);
    const hasChildren = children.length > 0;
    
    // Check if this task or any ancestor is being dragged
    const checkAncestorDragged = (taskId: string, visited = new Set<string>()): boolean => {
      if (taskId === activeId) return true;
      if (visited.has(taskId)) return false;
      visited.add(taskId);
      const t = tasks.find(item => item.id === taskId);
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
            color: task.color,
            completedAt: task.completedAt ? new Date(task.completedAt).toISOString().split('T')[0] : undefined,
            estimatedMinutes: task.estimatedMinutes,
            actualMinutes: task.actualMinutes,
          }}
          onToggle={toggleTask}
          onUpdate={updateTask}
          onDelete={deleteTask}
          onAddSubTask={handleAddSubTask}
          isBeingDragged={isBeingDragged}
          isDropTarget={isDropTarget}
          insertAfter={insertAfter}
          level={level}
          hasChildren={hasChildren}
          collapsed={task.collapsed}
          onToggleCollapse={() => toggleCollapse(task.id)}
          dragIndent={dragIndent}
        />
        {/* Render children recursively if not collapsed */}
        {hasChildren && !task.collapsed && (
          <div className="ml-6">
            {children.map(child => renderTaskItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  }, [activeId, overId, filteredTasks, getChildren, tasks, toggleTask, updateTask, deleteTask, handleAddSubTask, toggleCollapse, dragIndent]);

  // Empty state
  if (activeGroupId === '__archive__') {
    // Archive view handled by ArchiveTaskList
  } else if (filteredTasks.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground text-sm">No tasks</p>
      </div>
    );
  }

  const isArchiveView = activeGroupId === '__archive__';

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={customCollisionDetection}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {/* Incomplete tasks */}
        <SortableContext items={incompleteTaskIds} strategy={verticalListSortingStrategy}>
          {incompleteTasks.length > 0 && (
            <div className="space-y-0.5">
              {incompleteTasks.map(task => renderTaskItem(task, 0))}
            </div>
          )}
        </SortableContext>

        {/* Completed section header */}
        {(completedTasks.length > 0 || isArchiveView) && (
          <CompletedSection
            count={completedTasks.length}
            expanded={completedExpanded}
            onToggleExpanded={() => setCompletedExpanded(!completedExpanded)}
            isArchiveView={isArchiveView}
            timeView={timeView}
            currentRange={getCurrentRange()}
            onTimeViewChange={setTimeView}
            onRangeChange={setCurrentRange}
            showMenu={showCompletedMenu}
            onToggleMenu={() => setShowCompletedMenu(!showCompletedMenu)}
            onCloseMenu={() => setShowCompletedMenu(false)}
            onArchiveCompleted={handleArchiveCompleted}
            onDeleteCompleted={handleDeleteCompleted}
          />
        )}

        {/* Completed tasks */}
        {completedExpanded && (
          <SortableContext items={completedTaskIds} strategy={verticalListSortingStrategy}>
            {isArchiveView ? (
              <ArchiveTaskList
                tasks={tasks}
                groups={groups}
                timeView={timeView}
                selectedColors={selectedColors}
                dayRange={archiveDayRange}
                weekRange={archiveWeekRange}
                monthRange={archiveMonthRange}
                deleteTask={deleteTask}
                renderTaskItem={renderTaskItem}
              />
            ) : (
              completedTasks.length > 0 && (
                <div className="space-y-0.5 opacity-60">
                  {completedTasks.map(task => renderTaskItem(task, 0))}
                </div>
              )
            )}
          </SortableContext>
        )}
      </DndContext>

      {/* Subtask Modal */}
      <SubTaskModal
        isOpen={!!addingSubTaskFor}
        value={subTaskContent}
        onChange={setSubTaskContent}
        onSubmit={handleSubmitSubTask}
        onCancel={handleCancelSubTask}
      />
    </>
  );
}
