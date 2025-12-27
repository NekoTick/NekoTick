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

function formatScheduledTime(startDate: number, endDate?: number): string {
  const start = new Date(startDate);
  const month = (start.getMonth() + 1).toString().padStart(2, '0');
  const day = start.getDate().toString().padStart(2, '0');
  const startHour = start.getHours().toString().padStart(2, '0');
  const startMin = start.getMinutes().toString().padStart(2, '0');
  
  if (endDate) {
    const end = new Date(endDate);
    const endHour = end.getHours().toString().padStart(2, '0');
    const endMin = end.getMinutes().toString().padStart(2, '0');
    const durationMin = Math.round((endDate - startDate) / 60000);
    return `${startHour}:${startMin} - ${endHour}:${endMin} (${durationMin}m) · ${month}/${day}`;
  }
  return `${startHour}:${startMin} · ${month}/${day}`;
}

interface PanelTaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  onUpdate: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onAddSubTask?: (parentId: string) => void;
  isBeingDragged?: boolean;
  level?: number;
  hasChildren?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function PanelTaskItem({
  task,
  onToggle,
  onUpdate,
  onDelete,
  onAddSubTask,
  isBeingDragged,
  level = 0,
  hasChildren = false,
  collapsed = false,
  onToggleCollapse,
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
    transition,
  } = useSortable({ 
    id: task.id,
    animateLayoutChanges,
    data: { task }, // Pass task data for cross-panel dragging
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
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

  // 颜色值 - Apple 风格颜色
  const colorHexMap: Record<string, string> = {
    red: '#FE002D',
    orange: '#FF8500',
    yellow: '#FEC900',
    green: '#63DA38',
    blue: '#008BFE',
    purple: '#DD11E8',
    brown: '#B47D58',
    default: '#9F9FA9',
  };
  const colorValue = task.color && task.color !== 'default'
    ? colorHexMap[task.color]
    : undefined;

  return (
    <>
      <div
        ref={combinedRef}
        style={style}
        data-task-id={task.id}
        className={cn(
          'group flex items-start gap-1.5 px-1.5 py-1.5 rounded-md',
          'border border-transparent',
          isBeingDragged 
            ? 'opacity-0' 
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
          
          {/* 已分配时间 */}
          {task.startDate && !task.isAllDay && (
            <div className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
              {formatScheduledTime(task.startDate, task.endDate)}
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
                  {(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'brown', 'default'] as const).map((color) => (
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
                        borderColor: colorHexMap[color],
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
    </>
  );
}
