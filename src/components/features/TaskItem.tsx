import { useState, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Checkbox } from '@/components/ui/checkbox';
import { GripVertical, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Task } from '@/types';

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  onUpdate: (id: string, content: string) => void;
  onUpdateTime?: (id: string, est?: number, act?: number) => void;
  onDelete: (id: string) => void;
  isBeingDragged?: boolean;
  isDropTarget?: boolean;
  insertAfter?: boolean;
}

export function TaskItem({ task, onToggle, onUpdate, onDelete, isBeingDragged, isDropTarget, insertAfter }: TaskItemProps) {
  const itemRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(task.content);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
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
    if (e.key === 'Enter') {
      handleBlur();
    }
    if (e.key === 'Escape') {
      setContent(task.content);
      setIsEditing(false);
    }
  };

  // Combined ref for both sortable and item selection
  const combinedRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    (itemRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  // Drop target indicator
  const dropIndicator = isDropTarget && (
    <div className="h-10 rounded-md border-2 border-dashed border-zinc-300 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/50" />
  );

  // When being dragged, hide the original item (content shown in native window)
  if (isBeingDragged) {
    return (
      <>
        {dropIndicator}
        <div
          ref={combinedRef}
          data-task-id={task.id}
          className="h-0 overflow-hidden"
        />
      </>
    );
  }

  return (
    <>
      {!insertAfter && dropIndicator}
      <div
        ref={combinedRef}
        style={style}
        data-task-id={task.id}
        className={cn(
          'group flex items-center gap-2 px-2 py-2 rounded-md',
          'hover:bg-muted/50 transition-colors duration-150',
          'border border-transparent hover:border-border/50'
        )}
      >
      {/* Drag Handle */}
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
        <GripVertical className="h-4 w-4 text-muted-foreground/60" />
      </button>

      {/* Checkbox */}
      <Checkbox
        checked={task.isDone}
        onCheckedChange={() => onToggle(task.id)}
        className="h-4 w-4 rounded-sm border-muted-foreground/40"
      />

      {/* Content */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={cn(
              'flex-1 bg-transparent border-none outline-none',
              'text-sm text-foreground placeholder:text-muted-foreground',
              'focus:ring-0'
            )}
          />
        ) : (
          <span
            data-editable
            onClick={() => !task.isDone && setIsEditing(true)}
            className={cn(
              'flex-1 text-sm cursor-text select-none truncate',
              task.isDone
                ? 'line-through text-muted-foreground/60'
                : 'text-foreground'
            )}
          >
            {task.content}
          </span>
        )}
      </div>

      {/* Delete Button */}
      <button
        onClick={() => onDelete(task.id)}
        className={cn(
          'opacity-0 group-hover:opacity-100',
          'p-1 rounded hover:bg-destructive/10 hover:text-destructive',
          'transition-opacity duration-150'
        )}
        aria-label="Delete task"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
    {insertAfter && dropIndicator}
    </>
  );
}
