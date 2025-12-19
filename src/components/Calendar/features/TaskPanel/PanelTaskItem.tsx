/**
 * PanelTaskItem - 面板内的任务项
 * 
 * 紧凑版的任务项，适配右侧面板
 */

import { useState, useRef, useEffect } from 'react';
import { useSortable, defaultAnimateLayoutChanges, type AnimateLayoutChanges } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Checkbox } from '@/components/ui/checkbox';
import { GripVertical, ChevronRight, ChevronDown, MoreHorizontal, Trash2, Plus, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Task } from '@/stores/useGroupStore';
import { useUIStore, useGroupStore } from '@/stores/useGroupStore';
import { parseTimeString } from '@/stores/timeParser';

// 禁用拖拽动画
const animateLayoutChanges: AnimateLayoutChanges = (args) => {
  const { isSorting, wasDragging } = args;
  if (isSorting || wasDragging) return false;
  return defaultAnimateLayoutChanges(args);
};

function formatMinutes(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

function formatEstimatedTimeForInput(minutes: number | undefined): string {
  if (!minutes) return '';
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  return parts.join(' ') || '';
}

interface PanelTaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  onUpdate: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onAddSubTask?: (parentId: string) => void;
  isBeingDragged?: boolean;
  isDropTarget?: boolean;
  insertAfter?: boolean;
  level?: number;
  hasChildren?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  dragIndent?: number;
  compact?: boolean;
}

export function PanelTaskItem({
  task,
  onToggle,
  onUpdate,
  onDelete,
  onAddSubTask,
  isBeingDragged,
  isDropTarget,
  insertAfter,
  level = 0,
  hasChildren = false,
  collapsed = false,
  onToggleCollapse,
  dragIndent = 0,
  compact = false,
}: PanelTaskItemProps) {
  const MAX_LEVEL = 3;
  const canAddSubTask = level < MAX_LEVEL;
  const itemRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(task.content);
  const [showMenu, setShowMenu] = useState(false);
  const [estimatedTime, setEstimatedTime] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { hideActualTime } = useUIStore();

  useEffect(() => {
    if (showMenu) {
      setEstimatedTime(formatEstimatedTimeForInput(task.estimatedMinutes));
    }
  }, [showMenu, task.estimatedMinutes]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
  } = useSortable({ 
    id: task.id,
    animateLayoutChanges,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: undefined,
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      const length = inputRef.current.value.length;
      inputRef.current.setSelectionRange(length, length);
    }
  }, [isEditing]);

  useEffect(() => {
    setContent(task.content);
  }, [task.content]);

  // 关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const handleBlur = () => {
    setIsEditing(false);
    if (content.trim() && content !== task.content) {
      onUpdate(task.id, content.trim());
    } else {
      setContent(task.content);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleBlur();
    } else if (e.key === 'Escape') {
      setContent(task.content);
      setIsEditing(false);
    }
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      const textarea = inputRef.current;
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [isEditing, content]);

  const combinedRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    (itemRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  // 拖拽指示器
  const INDENT_THRESHOLD = 28;
  const shouldShowIndent = dragIndent > INDENT_THRESHOLD;
  const baseMargin = compact ? 36 : 44;
  const indentAmount = shouldShowIndent ? baseMargin + 20 : baseMargin;
  
  const dropIndicator = isDropTarget && (
    <div 
      className="h-8 rounded-md border-2 border-dashed border-zinc-300 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/50 transition-all duration-150"
      style={{ marginLeft: `${indentAmount}px` }}
    />
  );

  // 颜色值
  const colorValue = task.color && task.color !== 'default'
    ? task.color === 'red' ? '#ef4444' :
      task.color === 'yellow' ? '#eab308' :
      task.color === 'purple' ? '#a855f7' :
      task.color === 'green' ? '#22c55e' :
      task.color === 'blue' ? '#3b82f6' : undefined
    : undefined;

  return (
    <>
      {!insertAfter && dropIndicator}
      <div
        ref={combinedRef}
        style={{ ...style, transition: 'none' }}
        data-task-id={task.id}
        className={cn(
          'group flex items-start gap-1.5 px-1.5 py-1.5 rounded-md',
          'border border-transparent',
          isBeingDragged 
            ? 'h-0 overflow-hidden opacity-0 !p-0 !m-0' 
            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
        )}
      >
        {/* 折叠/展开图标 */}
        {hasChildren ? (
          <button
            onClick={onToggleCollapse}
            className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex-shrink-0"
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
            )}
          </button>
        ) : (
          <div className="w-4" />
        )}

        {/* 拖拽手柄 */}
        <button
          {...attributes}
          {...listeners}
          className={cn(
            'opacity-0 group-hover:opacity-100 cursor-move',
            'p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-opacity duration-150',
            'touch-none flex-shrink-0'
          )}
        >
          <GripVertical className="h-3.5 w-3.5 text-zinc-400" />
        </button>

        {/* 复选框 */}
        <div className="mt-0.5 flex-shrink-0">
          <Checkbox
            checked={task.completed}
            onCheckedChange={() => onToggle(task.id)}
            checkmarkColor={task.completed && colorValue ? colorValue : undefined}
            className={cn(
              "h-3.5 w-3.5 rounded-sm transition-none",
              colorValue ? "border-2" : "border border-zinc-400/40"
            )}
            style={colorValue ? { borderColor: colorValue } : undefined}
          />
        </div>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <textarea
              ref={inputRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              rows={1}
              className={cn(
                'w-full bg-transparent border-none outline-none resize-none',
                'text-[13px] text-foreground placeholder:text-muted-foreground',
                'focus:ring-0 leading-relaxed min-h-[18px] max-h-[120px]'
              )}
            />
          ) : (
            <div
              onClick={() => setIsEditing(true)}
              className={cn(
                'w-full text-[13px] cursor-text select-none whitespace-pre-wrap break-words',
                task.completed
                  ? 'text-zinc-400 line-through'
                  : 'text-zinc-700 dark:text-zinc-200',
                'leading-relaxed'
              )}
            >
              {task.content}
            </div>
          )}
          
          {/* 时间信息 */}
          {!hideActualTime && (task.estimatedMinutes || task.actualMinutes) && (
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-600">
              {task.estimatedMinutes && (
                <span>Est. {formatMinutes(task.estimatedMinutes)}</span>
              )}
              {task.actualMinutes && (
                <span>Act. {formatMinutes(task.actualMinutes)}</span>
              )}
            </div>
          )}
        </div>

        {/* 更多菜单 */}
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className={cn(
              'p-1 rounded transition-all',
              showMenu
                ? 'opacity-100 bg-zinc-100 dark:bg-zinc-800'
                : 'opacity-0 group-hover:opacity-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            )}
          >
            <MoreHorizontal className="h-3.5 w-3.5 text-zinc-400" />
          </button>

          {showMenu && (
            <div 
              className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 z-50"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 颜色选择器 */}
              <div className="px-3 py-2">
                <div className="flex items-center justify-between gap-1.5">
                  {(['default', 'blue', 'green', 'purple', 'yellow', 'red'] as const).map((color) => (
                    <button
                      key={color}
                      onClick={() => {
                        useGroupStore.getState().updateTaskColor(task.id, color);
                        setShowMenu(false);
                      }}
                      className={cn(
                        "w-5 h-5 rounded-sm border-2 transition-all hover:scale-110",
                        task.color === color || (!task.color && color === 'default')
                          ? "ring-2 ring-zinc-400 dark:ring-zinc-500 ring-offset-1"
                          : ""
                      )}
                      style={{
                        borderColor: color === 'red' ? '#ef4444' :
                                     color === 'yellow' ? '#eab308' :
                                     color === 'purple' ? '#a855f7' :
                                     color === 'green' ? '#22c55e' :
                                     color === 'blue' ? '#3b82f6' : '#d4d4d8',
                        backgroundColor: color === 'default' ? 'transparent' : undefined
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
              
              {/* 预估时间 */}
              <div className="px-3 py-2">
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5">Estimated Time</div>
                <input
                  type="text"
                  value={estimatedTime}
                  onChange={(e) => setEstimatedTime(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (estimatedTime.trim()) {
                        const newEstimation = parseTimeString(estimatedTime.trim());
                        if (newEstimation !== undefined) {
                          useGroupStore.getState().updateTaskEstimation(task.id, newEstimation);
                          setShowMenu(false);
                        } else {
                          setEstimatedTime(formatEstimatedTimeForInput(task.estimatedMinutes));
                        }
                      } else {
                        useGroupStore.getState().updateTaskEstimation(task.id, undefined);
                        setShowMenu(false);
                      }
                    } else if (e.key === 'Escape') {
                      setEstimatedTime(formatEstimatedTimeForInput(task.estimatedMinutes));
                      setShowMenu(false);
                    }
                  }}
                  onBlur={() => {
                    const currentFormatted = formatEstimatedTimeForInput(task.estimatedMinutes);
                    if (estimatedTime.trim() !== currentFormatted) {
                      if (estimatedTime.trim()) {
                        const newEstimation = parseTimeString(estimatedTime.trim());
                        if (newEstimation !== undefined) {
                          useGroupStore.getState().updateTaskEstimation(task.id, newEstimation);
                        } else {
                          setEstimatedTime(currentFormatted);
                        }
                      } else {
                        useGroupStore.getState().updateTaskEstimation(task.id, undefined);
                      }
                    }
                  }}
                  placeholder="e.g. 2d, 3h, 30m"
                  className="w-full px-2 py-1 text-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500 text-zinc-900 dark:text-zinc-100"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
              
              {/* 添加子任务 */}
              <button
                onClick={() => {
                  if (canAddSubTask && onAddSubTask) {
                    onAddSubTask(task.id);
                    setShowMenu(false);
                  }
                }}
                disabled={!canAddSubTask}
                className={cn(
                  "w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2",
                  canAddSubTask 
                    ? "text-zinc-600 dark:text-zinc-300" 
                    : "text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
                )}
              >
                <Plus className="h-4 w-4" />
                <span>Add Subtask</span>
                {!canAddSubTask && <span className="ml-auto text-xs">(Max)</span>}
              </button>
              <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
              
              {/* 归档 - 仅已完成任务 */}
              {task.completed && task.groupId !== '__archive__' && (
                <button
                  onClick={() => setShowMenu(false)}
                  className="w-full px-3 py-1.5 text-left text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2"
                >
                  <Archive className="h-4 w-4" />
                  <span>Archive</span>
                </button>
              )}
              
              {/* 删除 */}
              <button
                onClick={() => {
                  onDelete(task.id);
                  setShowMenu(false);
                }}
                className="w-full px-3 py-1.5 text-left text-sm text-red-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete</span>
              </button>
            </div>
          )}
        </div>
      </div>
      {insertAfter && dropIndicator}
    </>
  );
}
