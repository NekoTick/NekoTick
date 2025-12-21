/**
 * CalendarTaskPanel - 日历右侧的统一面板
 * 
 * 支持在待办和进度之间切换：
 * - Tasks: 待办任务列表
 * - Progress: 进度追踪
 */

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Maximize2, Minimize2, ChevronDown, Check,
  Archive, Search, X, MoreHorizontal
} from 'lucide-react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

import { useGroupStore, useUIStore } from '@/stores/useGroupStore';
import { useCalendarStore } from '@/stores/useCalendarStore';
import { cn } from '@/lib/utils';
import { EventEditForm } from '../ContextPanel/EventEditForm';
import { PanelTaskInput } from './PanelTaskInput';
import { PanelTaskItem } from './PanelTaskItem';
import { usePanelDragAndDrop } from './usePanelDragAndDrop';
import { ProgressContent } from '@/components/Progress/features/ProgressContent';

// 颜色排序
const colorOrder: Record<string, number> = { 
  red: 0, yellow: 1, purple: 2, green: 3, blue: 4, default: 5 
};

// 面板视图类型
type PanelView = 'tasks' | 'progress';

interface CalendarTaskPanelProps {
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function CalendarTaskPanel({ 
  isExpanded = false, 
  onToggleExpand 
}: CalendarTaskPanelProps) {
  const {
    tasks,
    groups,
    activeGroupId,
    setActiveGroup,
    toggleTask,
    updateTask,
    deleteTask,
    reorderTasks,
    addSubTask,
    toggleCollapse,
    moveTaskToGroup,
    updateTaskColor,
    archiveCompletedTasks,
    deleteCompletedTasks,
  } = useGroupStore();

  const {
    hideCompleted,
    selectedColors,
    setDraggingTaskId,
  } = useUIStore();

  const { editingEventId, events } = useCalendarStore();

  // 面板视图状态
  const [panelView, setPanelView] = useState<PanelView>('tasks');

  // 本地状态
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [showCompletedMenu, setShowCompletedMenu] = useState(false);
  const [addingSubTaskFor, setAddingSubTaskFor] = useState<string | null>(null);
  const [subTaskContent, setSubTaskContent] = useState('');

  const groupPickerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const completedMenuRef = useRef<HTMLDivElement>(null);

  // 当前分组
  const currentGroup = groups.find(g => g.id === activeGroupId) || groups[0];

  // 如果正在编辑事件，显示事件编辑表单
  const editingEvent = editingEventId ? events.find(e => e.id === editingEventId) : null;

  // 拖拽 hook
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
  } = usePanelDragAndDrop({
    tasks,
    activeGroupId: activeGroupId || 'default',
    groups,
    toggleCollapse,
    reorderTasks,
    moveTaskToGroup,
    updateTaskColor,
    setDraggingTaskId,
  });

  // 获取子任务
  const getChildren = useCallback((parentId: string) => {
    return tasks
      .filter(t => t.parentId === parentId && t.groupId === activeGroupId)
      .sort((a, b) => a.order - b.order);
  }, [tasks, activeGroupId]);


  // 过滤和排序任务
  const { incompleteTasks, completedTasks } = useMemo(() => {
    const topLevelTasks = tasks
      .filter((t) => {
        if (t.groupId !== activeGroupId || t.parentId) return false;
        if (!selectedColors.includes(t.color || 'default')) return false;
        // 搜索过滤
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          if (!t.content.toLowerCase().includes(query)) return false;
        }
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
  }, [tasks, activeGroupId, hideCompleted, selectedColors, searchQuery]);

  // 任务 ID 列表
  const incompleteTaskIds = useMemo(() => {
    const ids: string[] = [];
    const addTaskAndChildren = (task: typeof incompleteTasks[0]) => {
      ids.push(task.id);
      const children = tasks.filter(t => t.parentId === task.id);
      children.forEach(addTaskAndChildren);
    };
    incompleteTasks.forEach(addTaskAndChildren);
    return ids;
  }, [incompleteTasks, tasks]);

  const completedTaskIds = useMemo(() => {
    const ids: string[] = [];
    const addTaskAndChildren = (task: typeof completedTasks[0]) => {
      ids.push(task.id);
      const children = tasks.filter(t => t.parentId === task.id);
      children.forEach(addTaskAndChildren);
    };
    completedTasks.forEach(addTaskAndChildren);
    return ids;
  }, [completedTasks, tasks]);

  // 关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-color-option]')) return;
      
      if (groupPickerRef.current && !groupPickerRef.current.contains(target)) {
        setShowGroupPicker(false);
      }
      if (completedMenuRef.current && !completedMenuRef.current.contains(target)) {
        setShowCompletedMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 处理子任务
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

  // 渲染单个任务
  const renderTaskItem = useCallback((task: typeof incompleteTasks[0], level: number = 0) => {
    const activeIndex = activeId ? incompleteTasks.findIndex(t => t.id === activeId) : -1;
    const overIndex = overId ? incompleteTasks.findIndex(t => t.id === overId) : -1;
    const isDropTarget = task.id === overId;
    const insertAfter = isDropTarget && activeIndex !== -1 && overIndex > activeIndex;
    
    const children = getChildren(task.id);
    const hasChildren = children.length > 0;
    
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
        <PanelTaskItem
          task={task}
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
          compact={!isExpanded}
        />
        {hasChildren && !task.collapsed && (
          <div className={isExpanded ? "ml-6" : "ml-4"}>
            {children.map(child => renderTaskItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  }, [activeId, overId, incompleteTasks, getChildren, tasks, toggleTask, updateTask, deleteTask, handleAddSubTask, toggleCollapse, dragIndent, isExpanded]);

  // 如果正在编辑事件，显示编辑表单
  if (editingEvent) {
    return (
      <div data-context-panel className="h-full overflow-visible">
        <EventEditForm event={editingEvent} mode="embedded" />
      </div>
    );
  }

  return (
    <div 
      data-context-panel 
      className={cn(
        "h-full flex flex-col bg-white dark:bg-zinc-900 overflow-hidden",
        isExpanded && "fixed inset-0 z-50"
      )}
    >
      {/* 头部：Tab 切换 + 工具栏 */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          {/* Tab 切换器 */}
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => setPanelView('tasks')}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-all",
                panelView === 'tasks'
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
              )}
            >
              Tasks
            </button>
            <button
              onClick={() => setPanelView('progress')}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-all",
                panelView === 'progress'
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
              )}
            >
              Progress
            </button>
          </div>

          {/* 工具按钮 */}
          <div className="flex items-center gap-1">
            {/* 搜索按钮 - 仅在 tasks 视图显示 */}
            {panelView === 'tasks' && (
              <button
                onClick={() => setShowSearch(!showSearch)}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  showSearch
                    ? "text-zinc-600 bg-zinc-100 dark:text-zinc-300 dark:bg-zinc-800"
                    : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                )}
              >
                <Search className="size-4" />
              </button>
            )}

            {/* 放大/缩小按钮 */}
            {onToggleExpand && (
              <button
                onClick={onToggleExpand}
                className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              >
                {isExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Tasks 视图的分组选择器和搜索框 */}
        {panelView === 'tasks' && (
          <>
            <div className="flex items-center gap-2 mt-2">
              {/* 分组选择器 */}
              <div className="relative flex-1 min-w-0" ref={groupPickerRef}>
                <button
                  onClick={() => setShowGroupPicker(!showGroupPicker)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors max-w-full"
                >
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200 truncate">
                    {currentGroup?.name || 'Inbox'}
                  </span>
                  <ChevronDown className={cn(
                    "size-3.5 text-zinc-400 transition-transform flex-shrink-0",
                    showGroupPicker && "rotate-180"
                  )} />
                </button>

                {/* 分组下拉菜单 */}
                <AnimatePresence>
                  {showGroupPicker && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-0 top-full mt-1 w-48 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 z-50 max-h-64 overflow-y-auto"
                    >
                      {groups.map((group) => (
                        <button
                          key={group.id}
                          onClick={() => {
                            setActiveGroup(group.id);
                            setShowGroupPicker(false);
                          }}
                          className={cn(
                            "w-full px-3 py-1.5 text-left text-sm transition-colors flex items-center gap-2",
                            group.id === activeGroupId
                              ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
                              : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                          )}
                        >
                          {group.pinned && <span className="text-[10px]">📌</span>}
                          <span className="truncate">{group.name}</span>
                          {group.id === activeGroupId && (
                            <Check className="size-3.5 ml-auto flex-shrink-0" />
                          )}
                        </button>
                      ))}
                      {/* 归档入口 */}
                      <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
                      <button
                        onClick={() => {
                          setActiveGroup('__archive__');
                          setShowGroupPicker(false);
                        }}
                        className={cn(
                          "w-full px-3 py-1.5 text-left text-sm transition-colors flex items-center gap-2",
                          activeGroupId === '__archive__'
                            ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
                            : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                        )}
                      >
                        <Archive className="size-3.5" />
                        <span>Archive</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* 搜索框 */}
            <AnimatePresence>
              {showSearch && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="relative mt-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search tasks..."
                      autoFocus
                      className="w-full px-3 py-1.5 text-sm bg-zinc-100 dark:bg-zinc-800 rounded-md outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      {/* Progress 视图 */}
      {panelView === 'progress' && (
        <div className="flex-1 overflow-hidden">
          <ProgressContent compact />
        </div>
      )}

      {/* Tasks 视图 */}
      {panelView === 'tasks' && (
        <>
          {/* 任务输入框 */}
          {activeGroupId !== '__archive__' && (
            <div className="flex-shrink-0 px-3 pb-2">
              <PanelTaskInput compact={!isExpanded} />
            </div>
          )}

      {/* 任务列表 */}
      <div
        ref={scrollRef}
        className={cn(
          "flex-1 overflow-y-auto px-3 pb-3",
          "[&::-webkit-scrollbar]:w-1",
          "[&::-webkit-scrollbar-track]:bg-transparent",
          "[&::-webkit-scrollbar-thumb]:bg-zinc-200",
          "[&::-webkit-scrollbar-thumb]:rounded-full",
          "[&::-webkit-scrollbar-thumb]:hover:bg-zinc-300",
          "dark:[&::-webkit-scrollbar-thumb]:bg-zinc-800",
          "dark:[&::-webkit-scrollbar-thumb]:hover:bg-zinc-700"
        )}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={customCollisionDetection}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {/* 未完成任务 */}
          <SortableContext items={incompleteTaskIds} strategy={verticalListSortingStrategy}>
            {incompleteTasks.length > 0 ? (
              <div className="space-y-0.5">
                {incompleteTasks.map(task => renderTaskItem(task, 0))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-xs text-zinc-400 dark:text-zinc-600">No tasks</p>
              </div>
            )}
          </SortableContext>

          {/* 已完成任务 */}
          {completedTasks.length > 0 && (
            <>
              <div className="flex items-center gap-2 w-full mt-4 mb-2">
                <button
                  onClick={() => setCompletedExpanded(!completedExpanded)}
                  className="flex items-center gap-2 group hover:opacity-80 transition-opacity"
                >
                  <ChevronDown className={cn(
                    "size-3.5 text-zinc-400 transition-transform",
                    !completedExpanded && "-rotate-90"
                  )} />
                  <span className="text-xs text-zinc-400">
                    Completed ({completedTasks.length})
                  </span>
                </button>
                <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                
                {/* 已完成菜单 - 非归档视图 */}
                {activeGroupId !== '__archive__' && (
                  <div className="relative" ref={completedMenuRef}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCompletedMenu(!showCompletedMenu);
                      }}
                      className={cn(
                        "p-1 rounded-md transition-colors",
                        showCompletedMenu 
                          ? "text-zinc-400 bg-zinc-100 dark:text-zinc-500 dark:bg-zinc-800" 
                          : "text-zinc-300 hover:text-zinc-400 dark:text-zinc-600 dark:hover:text-zinc-500"
                      )}
                    >
                      <MoreHorizontal className="size-3.5" />
                    </button>
                    {showCompletedMenu && (
                      <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 z-50">
                        <button
                          onClick={() => {
                            if (activeGroupId) {
                              archiveCompletedTasks(activeGroupId);
                            }
                            setShowCompletedMenu(false);
                          }}
                          className="w-full px-3 py-1.5 text-left text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        >
                          Archive All
                        </button>
                        <button
                          onClick={() => {
                            if (activeGroupId) {
                              deleteCompletedTasks(activeGroupId);
                            }
                            setShowCompletedMenu(false);
                          }}
                          className="w-full px-3 py-1.5 text-left text-sm text-red-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        >
                          Delete All
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <AnimatePresence>
                {completedExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <SortableContext items={completedTaskIds} strategy={verticalListSortingStrategy}>
                      <div className="space-y-0.5 opacity-60">
                        {completedTasks.map(task => renderTaskItem(task, 0))}
                      </div>
                    </SortableContext>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {/* Drag Overlay - rendered via portal for cross-panel dragging */}
          {createPortal(
            <DragOverlay dropAnimation={null} className="cursor-grabbing" style={{ zIndex: 999999 }}>
              {activeId ? (() => {
                const task = tasks.find(t => t.id === activeId);
                if (!task) return null;
                return (
                  <div className="px-3 py-2 bg-white dark:bg-zinc-800 rounded-lg shadow-xl ring-1 ring-black/5 dark:ring-white/10 max-w-[240px]">
                    <span className="text-[13px] text-zinc-700 dark:text-zinc-200 line-clamp-2">
                      {task.content}
                    </span>
                  </div>
                );
              })() : null}
            </DragOverlay>,
            document.body
          )}
        </DndContext>
      </div>
        </>
      )}

      {/* 子任务弹窗 */}
      <AnimatePresence>
        {addingSubTaskFor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 flex items-center justify-center z-50"
            onClick={() => setAddingSubTaskFor(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-80 p-4"
            >
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-200 mb-3">
                Add Sub-task
              </h3>
              <input
                type="text"
                value={subTaskContent}
                onChange={(e) => setSubTaskContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmitSubTask();
                  if (e.key === 'Escape') setAddingSubTaskFor(null);
                }}
                placeholder="Sub-task content..."
                autoFocus
                className="w-full px-3 py-2 text-sm bg-zinc-100 dark:bg-zinc-800 rounded-md outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
              />
              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={() => setAddingSubTaskFor(null)}
                  className="px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitSubTask}
                  disabled={!subTaskContent.trim()}
                  className="px-3 py-1.5 text-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
