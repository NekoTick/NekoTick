import { useSortable, defaultAnimateLayoutChanges, type AnimateLayoutChanges } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Minus, GripVertical } from 'lucide-react';
import type { ProgressItem, CounterItem, ProgressOrCounter } from '@/stores/useProgressStore';

// Disable drop animation to prevent "snap back" effect
const animateLayoutChanges: AnimateLayoutChanges = (args) => {
  const { isSorting, wasDragging } = args;
  if (isSorting || wasDragging) {
    return false;
  }
  return defaultAnimateLayoutChanges(args);
};

interface ItemCardProps {
  item: ProgressOrCounter;
  onUpdate: (id: string, delta: number) => void;
  onDelete: (id: string) => void;
  isDragging?: boolean;
}

/**
 * Unified card component for both Progress and Counter items
 */
export function ItemCard({ item, onUpdate, onDelete, isDragging }: ItemCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
  } = useSortable({
    id: item.id,
    animateLayoutChanges,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: undefined,
  };

  const step = item.type === 'progress'
    ? (item.direction === 'increment' ? item.step : -item.step)
    : item.step;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-item-id={item.id}
      className={`group flex items-center gap-2 px-2 py-2 rounded-md border border-transparent ${
        isDragging
          ? 'h-0 overflow-hidden opacity-0 !p-0 !m-0'
          : 'hover:bg-muted/50 hover:border-border/50'
      }`}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="opacity-0 group-hover:opacity-100 cursor-move p-0.5 rounded hover:bg-muted transition-opacity duration-150 touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground/60" />
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground mb-1">{item.title}</div>
        {item.type === 'progress' ? (
          <ProgressContent item={item} />
        ) : (
          <CounterContent item={item} />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onUpdate(item.id, -step)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Decrease"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={() => onUpdate(item.id, step)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Increase"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
          aria-label="Delete"
        >
          <span className="text-xs">×</span>
        </button>
      </div>
    </div>
  );
}

function ProgressContent({ item }: { item: ProgressItem }) {
  const percentage = Math.round((item.current / item.total) * 100);

  return (
    <>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="px-1.5 py-0.5 bg-muted rounded text-xs">Progress</span>
        <span>{item.current}/{item.total}{item.unit}</span>
        <span className="text-muted-foreground/60">Today {item.todayCount}{item.unit}</span>
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-foreground/40 transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{percentage}%</span>
      </div>
    </>
  );
}

function CounterContent({ item }: { item: CounterItem }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="px-1.5 py-0.5 bg-muted rounded text-xs">Counter</span>
      <span>Total {item.current}{item.unit}</span>
      <span className="text-muted-foreground/60">Today {item.todayCount}{item.unit}</span>
    </div>
  );
}
