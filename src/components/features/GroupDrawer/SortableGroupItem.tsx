import { useState } from 'react';
import { Check, Pin, GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface SortableGroupItemProps {
  group: { id: string; name: string; pinned?: boolean };
  isActive: boolean;
  isEditing: boolean;
  editingName: string;
  isDragTarget?: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditNameChange: (name: string) => void;
  onTogglePin: () => void;
  onTaskDrop?: () => void;
  editInputRef?: React.RefObject<HTMLInputElement | null>;
}

/**
 * Sortable group item with edit and pin functionality
 */
export function SortableGroupItem({
  group,
  isActive,
  isEditing,
  editingName,
  isDragTarget,
  onSelect,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditNameChange,
  onTogglePin,
  onTaskDrop,
  editInputRef,
}: SortableGroupItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id });
  
  const [shouldCancelOnBlur, setShouldCancelOnBlur] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      onMouseUp={onTaskDrop}
      className={`group flex items-center gap-1 px-2 py-1.5 mx-2 rounded-md cursor-pointer transition-colors ${
        isDragTarget
          ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-400'
          : isActive
            ? 'bg-zinc-100 text-zinc-900'
            : 'text-zinc-600 hover:bg-zinc-50'
      }`}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="p-0.5 cursor-move opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-600"
      >
        <GripVertical className="size-3" />
      </div>

      {isEditing ? (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <input
            ref={editInputRef}
            type="text"
            value={editingName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setShouldCancelOnBlur(false);
                onSaveEdit();
              }
              if (e.key === 'Escape') {
                setShouldCancelOnBlur(true);
                onCancelEdit();
              }
            }}
            onBlur={() => {
              if (!shouldCancelOnBlur) {
                onSaveEdit();
              }
              setShouldCancelOnBlur(false);
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className="flex-1 min-w-0 text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-2 py-1 outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSaveEdit();
            }}
            className="p-0.5 rounded hover:bg-zinc-100"
          >
            <Check className="size-3.5 text-zinc-600" />
          </button>
        </div>
      ) : (
        <>
          <span
            onDoubleClick={(e) => {
              e.stopPropagation();
              onStartEdit();
            }}
            className="flex-1 text-sm whitespace-pre-wrap break-words"
          >
            {group.name}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            className={`p-0.5 rounded transition-colors ${
              group.pinned 
                ? 'text-zinc-500' 
                : 'opacity-0 group-hover:opacity-100 text-zinc-200 hover:text-zinc-400'
            }`}
          >
            <Pin className={`size-3.5 transition-all duration-200 ${group.pinned ? 'rotate-0' : 'rotate-45'}`} />
          </button>
        </>
      )}
    </div>
  );
}
