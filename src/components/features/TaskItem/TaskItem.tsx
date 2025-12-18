import { useState, useRef, useEffect } from 'react';
import { useSortable, defaultAnimateLayoutChanges, type AnimateLayoutChanges } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Checkbox } from '@/components/ui/checkbox';
import { GripVertical, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Task } from '@/types';
import { useUIStore } from '@/stores/useGroupStore';
import { formatMinutes } from './utils';
import { TaskMenu } from './TaskMenu';

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
  const MAX_LEVEL = 3; // 0, 1, 2, 3 = 4 levels
  const canAddSubTask = level < MAX_LEVEL;
  const itemRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(task.content);
  const [showMenu, setShowMenu] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { searchQuery, hideActualTime } = useUIStore();
  
  // Highlight search terms (bold)
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\\]/g, '\\$&')})`, 'gi');
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
  // Base left margin: 8px(px-2) + 20px(w-5 collapse icon) + 8px(gap-2) + 14px(handle to checkbox center) = 50px
  // If indented, add extra 24px
  const baseMargin = 50;
  const indentAmount = shouldShowIndent ? baseMargin + 24 : baseMargin;
  
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

      {/* Checkbox with Color Border */}
      <div className="mt-0.5">
        <Checkbox
          checked={task.isDone}
          onCheckedChange={() => onToggle(task.id)}
          checkmarkColor={
            task.isDone && task.color && task.color !== 'default'
              ? task.color === 'red' ? '#ef4444' :
                task.color === 'yellow' ? '#eab308' :
                task.color === 'purple' ? '#a855f7' :
                task.color === 'green' ? '#22c55e' :
                task.color === 'blue' ? '#3b82f6' : undefined
              : undefined
          }
          className={cn(
            "h-4 w-4 rounded-sm transition-none",
            task.color && task.color !== 'default'
              ? "border-2"
              : "border border-muted-foreground/40"
          )}
          style={
            task.color && task.color !== 'default'
              ? {
                  borderColor: task.color === 'red' ? '#ef4444' :
                               task.color === 'yellow' ? '#eab308' :
                               task.color === 'purple' ? '#a855f7' :
                               task.color === 'green' ? '#22c55e' :
                               task.color === 'blue' ? '#3b82f6' : undefined
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
              <span>Est. {formatMinutes(task.estimatedMinutes)}</span>
            )}
            {task.actualMinutes && (
              <span>Actual {formatMinutes(task.actualMinutes)}</span>
            )}
          </div>
        )}
      </div>

      {/* More Options Button & Menu */}
      <TaskMenu 
        task={task} 
        showMenu={showMenu} 
        setShowMenu={setShowMenu} 
        onDelete={onDelete} 
        onAddSubTask={onAddSubTask}
        canAddSubTask={canAddSubTask}
      />

    </div>
    {insertAfter && dropIndicator}
    </>
  );
}
