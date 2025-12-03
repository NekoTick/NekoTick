import { useState, useRef, useEffect } from 'react';
import { useSortable, defaultAnimateLayoutChanges, type AnimateLayoutChanges } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Checkbox } from '@/components/ui/checkbox';
import { GripVertical, MoreHorizontal, Trash2, ChevronRight, ChevronDown, Plus, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Task } from '@/types';
import { useGroupStore, parseTimeString } from '@/stores/useGroupStore';

// Format minutes to human-readable string with smart display
// Display format: "2d3h5m2s" (no spaces)
function formatMinutes(minutes: number): string {
  // Validate input
  if (!isFinite(minutes) || minutes < 0) {
    return '0s';
  }
  
  // Cap at reasonable maximum (100 days = 144000 minutes)
  const cappedMinutes = Math.min(minutes, 144000);
  const totalSeconds = Math.round(cappedMinutes * 60);
  
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  
  // Build display string without spaces
  const parts: string[] = [];
  
  if (days > 0) {
    parts.push(`${days}d`);
  }
  
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  
  if (mins > 0) {
    parts.push(`${mins}m`);
  }
  
  // Always show seconds if present (respect user's input precision)
  if (secs > 0) {
    parts.push(`${secs}s`);
  }
  
  // Special case: if nothing to show (truly 0), display "0s"
  if (parts.length === 0) {
    return '0s';
  }
  
  return parts.join('');
}

// Disable drop animation to prevent "snap back" effect
const animateLayoutChanges: AnimateLayoutChanges = (args) => {
  const { isSorting, wasDragging } = args;
  if (isSorting || wasDragging) {
    return false;
  }
  return defaultAnimateLayoutChanges(args);
};

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  onUpdate: (id: string, content: string) => void;
  onUpdateTime?: (id: string, est?: number, act?: number) => void;
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
}

export function TaskItem({ task, onToggle, onUpdate, onDelete, onAddSubTask, isBeingDragged, isDropTarget, insertAfter, level = 0, hasChildren = false, collapsed = false, onToggleCollapse, dragIndent = 0 }: TaskItemProps) {
  const MAX_LEVEL = 3; // 0, 1, 2, 3 = 4 层
  const canAddSubTask = level < MAX_LEVEL;
  const itemRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(task.content);
  const [showMenu, setShowMenu] = useState(false);
  const [estimatedTime, setEstimatedTime] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const { searchQuery, hideActualTime } = useGroupStore();
  
  // Format current estimated time for display in input
  const formatEstimatedTimeForInput = (minutes?: number): string => {
    if (!minutes) return '';
    const totalSeconds = Math.round(minutes * 60);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0) parts.push(`${mins}m`);
    if (secs > 0) parts.push(`${secs}s`);
    
    return parts.join('');
  };
  
  // Initialize estimated time when menu opens
  useEffect(() => {
    if (showMenu) {
      setEstimatedTime(formatEstimatedTimeForInput(task.estimatedMinutes));
    }
    // Only run when menu opens, not when estimatedMinutes changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMenu]);
  
  // 高亮搜索词 (加粗)
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? <span key={index} className="font-extrabold text-zinc-900 dark:text-zinc-100">{part}</span> : part
    );
  };

  // Allow dragging for all tasks (will be restricted to same level in reorderTasks)
  const isDraggable = true;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
  } = useSortable({ 
    id: task.id,
    animateLayoutChanges,
    disabled: !isDraggable,  // Disable dragging for child tasks
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: undefined, // Disable all dnd-kit transitions to prevent flicker
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      // Move cursor to end instead of selecting all
      const length = inputRef.current.value.length;
      inputRef.current.setSelectionRange(length, length);
    }
  }, [isEditing]);

  useEffect(() => {
    setContent(task.content);
  }, [task.content]);

  // Close menu when clicking outside
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
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [isEditing, content]);

  // Combined ref for both sortable and item selection
  const combinedRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    (itemRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  // Drop target indicator with indent based on drag offset
  const INDENT_THRESHOLD = 28;
  const shouldShowIndent = dragIndent > INDENT_THRESHOLD;
  const indentAmount = shouldShowIndent ? 24 : 0; // 24px indent when threshold exceeded
  
  const dropIndicator = isDropTarget && (
    <div 
      className="h-10 rounded-md border-2 border-dashed border-zinc-300 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/50 transition-all duration-150"
      style={{ marginLeft: `${indentAmount}px` }}
    />
  );

  return (
    <>
      {!insertAfter && dropIndicator}
      <div
        ref={combinedRef}
        style={{ ...style, transition: 'none' }}
        data-task-id={task.id}
        className={cn(
          'group flex items-start gap-2 px-2 py-2 rounded-md',
          'border border-transparent',
          isBeingDragged 
            ? 'h-0 overflow-hidden opacity-0 !p-0 !m-0' 
            : 'hover:bg-muted/50 hover:border-border/50'
        )}
      >
      {/* Collapse/Expand Icon */}
      {hasChildren ? (
        <button
          onClick={onToggleCollapse}
          className="p-0.5 rounded hover:bg-muted transition-colors flex-shrink-0"
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      ) : (
        <div className="w-5" /> /* Spacer for alignment */
      )}

      {/* Drag Handle - only show on hover */}
      {isDraggable ? (
        <button
          {...attributes}
          {...listeners}
          className={cn(
            'opacity-0 group-hover:opacity-100 cursor-move',
            'p-0.5 rounded hover:bg-muted transition-opacity duration-150',
            'touch-none'
          )}
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      ) : (
        <div className="w-5" /> /* Spacer for child tasks */
      )}

      {/* Checkbox with Priority Border */}
      <div className="mt-0.5">
        <Checkbox
          checked={task.isDone}
          onCheckedChange={() => onToggle(task.id)}
          checkmarkColor={
            task.isDone && task.priority && task.priority !== 'default'
              ? task.priority === 'red' ? '#ef4444' :
                task.priority === 'yellow' ? '#eab308' :
                task.priority === 'purple' ? '#a855f7' :
                task.priority === 'green' ? '#22c55e' : undefined
              : undefined
          }
          className={cn(
            "h-4 w-4 rounded-sm transition-none",
            task.priority && task.priority !== 'default'
              ? "border-2"
              : "border border-muted-foreground/40"
          )}
          style={
            task.priority && task.priority !== 'default'
              ? {
                  borderColor: task.priority === 'red' ? '#ef4444' :
                               task.priority === 'yellow' ? '#eab308' :
                               task.priority === 'purple' ? '#a855f7' :
                               task.priority === 'green' ? '#22c55e' : undefined
                }
              : undefined
          }
        />
      </div>

      {/* Content */}
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
              'text-sm text-foreground placeholder:text-muted-foreground',
              'focus:ring-0 leading-relaxed min-h-[20px] max-h-[200px]'
            )}
          />
        ) : (
          <div
            data-editable
            onClick={() => setIsEditing(true)}
            className={cn(
              'w-full text-sm cursor-text select-none whitespace-pre-wrap break-all',
              task.isDone
                ? 'text-muted-foreground line-through'
                : 'text-foreground',
              'leading-relaxed'
            )}
          >
            {highlightText(task.content, searchQuery)}
          </div>
        )}
        
        {/* Time Estimation Display */}
        {!hideActualTime && (task.estimatedMinutes || task.actualMinutes) && (
          <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400 dark:text-zinc-600">
            {task.estimatedMinutes && (
              <span>预估 {formatMinutes(task.estimatedMinutes)}</span>
            )}
            {task.actualMinutes && (
              <span>实际 {formatMinutes(task.actualMinutes)}</span>
            )}
          </div>
        )}
      </div>

      {/* More Options Button */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className={cn(
            'opacity-0 group-hover:opacity-100',
            'p-1 rounded hover:bg-muted',
            'transition-opacity duration-150'
          )}
          aria-label="More options"
        >
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </button>
        
        {/* Dropdown Menu */}
        {showMenu && (
          <div 
            className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 z-50"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Priority Selector */}
            <div className="px-3 py-2">
              <div className="flex items-center justify-between gap-1.5">
                {(['default', 'green', 'purple', 'yellow', 'red'] as const).map((priority) => (
                  <button
                    key={priority}
                    onClick={() => {
                      useGroupStore.getState().updateTaskPriority(task.id, priority);
                      setShowMenu(false);
                    }}
                    className={cn(
                      "w-6 h-6 rounded-sm border-2 transition-all hover:scale-110",
                      task.priority === priority || (!task.priority && priority === 'default')
                        ? "ring-2 ring-zinc-400 dark:ring-zinc-500 ring-offset-1"
                        : ""
                    )}
                    style={{
                      borderColor: priority === 'red' ? '#ef4444' :
                                   priority === 'yellow' ? '#eab308' :
                                   priority === 'purple' ? '#a855f7' :
                                   priority === 'green' ? '#22c55e' :
                                   '#d4d4d8', // zinc-300 for default
                      backgroundColor: priority === 'default' ? 'transparent' : undefined
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
            
            {/* Edit Estimated Time */}
            <div className="px-3 py-2">
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5">预估时间</div>
              <input
                ref={timeInputRef}
                type="text"
                value={estimatedTime}
                onChange={(e) => setEstimatedTime(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    // Parse the input and update estimation directly
                    if (estimatedTime.trim()) {
                      const newEstimation = parseTimeString(estimatedTime.trim());
                      if (newEstimation !== undefined) {
                        // Valid input, update and close
                        useGroupStore.getState().updateTaskEstimation(task.id, newEstimation);
                        setShowMenu(false);
                      } else {
                        // Invalid input, revert and stay open for correction
                        setEstimatedTime(formatEstimatedTimeForInput(task.estimatedMinutes));
                      }
                    } else {
                      // Empty input, clear estimation and close
                      useGroupStore.getState().updateTaskEstimation(task.id, undefined);
                      setShowMenu(false);
                    }
                  } else if (e.key === 'Escape') {
                    setEstimatedTime(formatEstimatedTimeForInput(task.estimatedMinutes));
                    setShowMenu(false);
                  }
                }}
                onBlur={() => {
                  // Auto-update on blur if value changed
                  const currentFormatted = formatEstimatedTimeForInput(task.estimatedMinutes);
                  if (estimatedTime.trim() !== currentFormatted) {
                    if (estimatedTime.trim()) {
                      const newEstimation = parseTimeString(estimatedTime.trim());
                      if (newEstimation !== undefined) {
                        // Valid input, update
                        useGroupStore.getState().updateTaskEstimation(task.id, newEstimation);
                      } else {
                        // Invalid input, revert to original value
                        setEstimatedTime(currentFormatted);
                      }
                    } else {
                      // Empty input, clear estimation
                      useGroupStore.getState().updateTaskEstimation(task.id, undefined);
                    }
                  }
                }}
                placeholder="如 2d, 3h, 30m, 2d3h5m"
                className="w-full px-2 py-1 text-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500 text-zinc-900 dark:text-zinc-100"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
            {/* Add Subtask option */}
            <button
              onClick={() => {
                if (canAddSubTask && onAddSubTask) {
                  onAddSubTask(task.id);
                  setShowMenu(false);
                }
              }}
              disabled={!canAddSubTask}
              title={!canAddSubTask ? '已达到最大嵌套层级（4层）' : ''}
              className={cn(
                "w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2",
                canAddSubTask 
                  ? "text-zinc-600 dark:text-zinc-300" 
                  : "text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
              )}
            >
              <Plus className="h-4 w-4" />
              <span>Add Subtask</span>
              {!canAddSubTask && <span className="ml-auto text-xs">(Max 4层)</span>}
            </button>
            <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
            {/* Archive option - only for completed tasks and not in archive view */}
            {task.isDone && task.groupId !== '__archive__' && (
              <button
                onClick={async () => {
                  try {
                    await useGroupStore.getState().archiveSingleTask(task.id);
                    setShowMenu(false);
                  } catch (error) {
                    console.error('Failed to archive task:', error);
                  }
                }}
                className="w-full px-3 py-1.5 text-left text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2"
              >
                <Archive className="h-4 w-4" />
                <span>归档</span>
              </button>
            )}
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
