import { useRef, useEffect, useState } from 'react';
import { Trash2, Plus, Archive, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGroupStore, parseTimeString } from '@/stores/useGroupStore';
import { Task } from '@/types';
import { formatEstimatedTimeForInput } from './utils';

interface TaskMenuProps {
  task: Task;
  showMenu: boolean;
  setShowMenu: (show: boolean) => void;
  onDelete: (id: string) => void;
  onAddSubTask?: (parentId: string) => void;
  canAddSubTask: boolean;
}

export function TaskMenu({ task, showMenu, setShowMenu, onDelete, onAddSubTask, canAddSubTask }: TaskMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const [estimatedTime, setEstimatedTime] = useState('');

  // Initialize estimated time when menu opens
  useEffect(() => {
    if (showMenu) {
      setEstimatedTime(formatEstimatedTimeForInput(task.estimatedMinutes));
    }
  }, [showMenu, task.estimatedMinutes]);

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
  }, [showMenu, setShowMenu]);

  return (
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
                onClick={() => {
                  // Archive is now handled by unified storage
                  // For now, just close the menu
                  setShowMenu(false);
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
  );
}
