import { useRef } from 'react';
import { ChevronRight, ChevronDown, MoreHorizontal } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { TimeViewSelector } from '../TimeViewSelector';
import { TimeRangeSelector } from '../TimeRangeSelector';
import type { TimeView } from '@/lib/dateUtils';

interface CompletedSectionProps {
  count: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  // Archive view props
  isArchiveView: boolean;
  timeView: TimeView;
  currentRange: number | 'all';
  onTimeViewChange: (view: TimeView) => void;
  onRangeChange: (range: number | 'all') => void;
  // Menu props
  showMenu: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onArchiveCompleted: () => void;
  onDeleteCompleted: () => void;
}

/**
 * Section header for completed tasks with time selectors and action menu
 */
export function CompletedSection({
  count,
  expanded,
  onToggleExpanded,
  isArchiveView,
  timeView,
  currentRange,
  onTimeViewChange,
  onRangeChange,
  showMenu,
  onToggleMenu,
  onCloseMenu,
  onArchiveCompleted,
  onDeleteCompleted,
}: CompletedSectionProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  
  useClickOutside(menuRef, (e) => {
    // Don't close menu if clicking on priority filter option
    if ((e.target as HTMLElement).closest('[data-priority-option]')) {
      return;
    }
    onCloseMenu();
  }, showMenu);

  return (
    <div className="flex items-center gap-2 w-full mt-6 mb-6">
      <button
        onClick={onToggleExpanded}
        className="flex items-center gap-2 group hover:opacity-80 transition-all duration-300"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-xs font-medium text-muted-foreground">
          Completed ({count})
        </span>
      </button>
      <div className="flex-1 h-px bg-border" />
      
      {/* Archive view: Time view selector */}
      {isArchiveView && (
        <TimeViewSelector
          timeView={timeView}
          onTimeViewChange={onTimeViewChange}
        />
      )}
      
      {/* Archive view: Time range selector */}
      {isArchiveView && (
        <TimeRangeSelector
          timeView={timeView}
          currentRange={currentRange}
          onRangeChange={onRangeChange}
        />
      )}
      
      {/* Non-archive view: Action menu */}
      {!isArchiveView && (
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu();
            }}
            className={`p-1.5 rounded-md transition-colors ${
              showMenu 
                ? 'text-zinc-400 bg-zinc-100 dark:text-zinc-500 dark:bg-zinc-800' 
                : 'text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500'
            }`}
            aria-label="More options"
          >
            <MoreHorizontal className="size-4" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 z-50">
              <button
                onClick={onArchiveCompleted}
                className="w-full px-3 py-1.5 text-left text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Archive All
              </button>
              <button
                onClick={onDeleteCompleted}
                className="w-full px-3 py-1.5 text-left text-sm text-red-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Delete All
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
