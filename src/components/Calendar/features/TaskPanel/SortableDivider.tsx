/**
 * SortableDivider - 可排序的分割线
 * 
 * 这个组件作为 sortable 元素参与拖拽排序，
 * 但它本身不能被拖动，只能被其他任务"推动"
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SortableDividerProps {
  id: string;
  label: string;
  count: number;
  expanded: boolean;
  onToggleExpand: () => void;
  showMenu?: boolean;
  menuContent?: React.ReactNode;
  onMenuToggle?: () => void;
  menuRef?: React.RefObject<HTMLDivElement | null>;
}

export function SortableDivider({
  id,
  label,
  count,
  expanded,
  onToggleExpand,
  showMenu,
  menuContent,
  onMenuToggle,
  menuRef,
}: SortableDividerProps) {
  const {
    setNodeRef,
    transform,
    transition,
  } = useSortable({ 
    id,
    // 禁用拖拽，只能被推动
    disabled: true,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 w-full mt-4 mb-2"
    >
      <button
        onClick={onToggleExpand}
        className="flex items-center gap-2 group hover:opacity-80 transition-opacity"
      >
        <ChevronDown className={cn(
          "size-3.5 text-zinc-400 transition-transform",
          !expanded && "-rotate-90"
        )} />
        <span className="text-xs text-zinc-400">
          {label} ({count})
        </span>
      </button>
      <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
      
      {/* 可选的菜单按钮 */}
      {onMenuToggle && (
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMenuToggle();
            }}
            className={cn(
              "p-1 rounded-md transition-colors",
              showMenu 
                ? "text-zinc-400 bg-zinc-100 dark:text-zinc-500 dark:bg-zinc-800" 
                : "text-zinc-300 hover:text-zinc-400 dark:text-zinc-600 dark:hover:text-zinc-500"
            )}
          >
            <MoreHorizontal className="size-3.5" />
          </button>
          {showMenu && menuContent}
        </div>
      )}
    </div>
  );
}
