import { useState, useRef, useEffect } from 'react';
import { useSortable, defaultAnimateLayoutChanges, type AnimateLayoutChanges } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Checkbox } from '@/components/ui/checkbox';
import { GripVertical, MoreHorizontal, Trash2, ChevronRight, ChevronDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Task } from '@/types';
import { useGroupStore } from '@/stores/useGroupStore';

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
}

export function TaskItem({ task, onToggle, onUpdate, onDelete, onAddSubTask, isBeingDragged, isDropTarget, insertAfter, level = 0, hasChildren = false, collapsed = false, onToggleCollapse }: TaskItemProps) {
  const MAX_LEVEL = 3; // 0, 1, 2, 3 = 4 层
  const canAddSubTask = level < MAX_LEVEL;
  const itemRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(task.content);
  const [showMenu, setShowMenu] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { searchQuery } = useGroupStore();
  
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

  // Drop target indicator
  const dropIndicator = isDropTarget && (
    <div className="h-10 rounded-md border-2 border-dashed border-zinc-300 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/50" />
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
