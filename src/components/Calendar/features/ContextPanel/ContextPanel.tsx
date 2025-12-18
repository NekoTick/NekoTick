/**
 * ContextPanel - Right side context panel
 * 
 * Displays:
 * 1. Event edit form (when an event is selected)
 * 2. Unscheduled task list (inbox mode)
 */

import { useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import { Tray, Clock } from '@phosphor-icons/react';
import { useGroupStore } from '@/stores/useGroupStore';
import { useCalendarStore } from '@/stores/useCalendarStore';
import { EventEditForm } from './EventEditForm';

// ============ Color Mapping ============

const PRIORITY_COLORS = {
  red: '#ef4444',
  yellow: '#eab308',
  purple: '#a855f7',
  green: '#22c55e',
  blue: '#3b82f6',
  default: 'transparent',
} as const;

// ============ Main Component ============

export function ContextPanel() {
  const { tasks, groups } = useGroupStore();
  const { editingEventId, events } = useCalendarStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Find the event being edited
  const editingEvent = editingEventId ? events.find(e => e.id === editingEventId) : null;

  // If editing an event, show the edit form
  if (editingEvent) {
    return (
      <div data-context-panel className="h-full overflow-visible">
        <EventEditForm event={editingEvent} mode="embedded" />
      </div>
    );
  }

  // Inbox mode: show unscheduled tasks
  const unscheduledTasks = tasks.filter(t => !t.completed && !t.startDate);

  // Sort by color priority
  const priorityOrder: Record<string, number> = { red: 0, yellow: 1, purple: 2, green: 3, blue: 4, default: 5 };
  const sortedTasks = [...unscheduledTasks].sort((a, b) => {
    const aPriority = priorityOrder[a.color || 'default'];
    const bPriority = priorityOrder[b.color || 'default'];
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.createdAt - b.createdAt;
  });

  // Organize tasks by group
  const tasksByGroup = sortedTasks.reduce((acc, task) => {
    const groupId = task.groupId || 'default';
    if (!acc[groupId]) acc[groupId] = [];
    acc[groupId].push(task);
    return acc;
  }, {} as Record<string, typeof sortedTasks>);

  // Sort groups (pinned first)
  const sortedGroupIds = Object.keys(tasksByGroup).sort((a, b) => {
    const groupA = groups.find(g => g.id === a);
    const groupB = groups.find(g => g.id === b);
    if (groupA?.pinned && !groupB?.pinned) return -1;
    if (!groupA?.pinned && groupB?.pinned) return 1;
    return 0;
  });

  return (
    <div data-context-panel className="h-full flex flex-col bg-white dark:bg-zinc-900 overflow-hidden">
      <div
        ref={scrollRef}
        className="
          flex-1 px-3 py-3 overflow-y-auto
          [&::-webkit-scrollbar]:w-1
          [&::-webkit-scrollbar-track]:bg-transparent
          [&::-webkit-scrollbar-thumb]:bg-zinc-200
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb]:hover:bg-zinc-300
          dark:[&::-webkit-scrollbar-thumb]:bg-zinc-800
          dark:[&::-webkit-scrollbar-thumb]:hover:bg-zinc-700
        "
      >
        {/* Empty state */}
        {unscheduledTasks.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <Tray weight="light" className="size-7 text-zinc-200 dark:text-zinc-700" />
          </div>
        )}

        {/* Task list */}
        <div className="space-y-3">
          {sortedGroupIds.map((groupId) => {
            const groupTasks = tasksByGroup[groupId];
            const group = groups.find(g => g.id === groupId);
            const groupName = group?.name || '收集箱';

            return (
              <div key={groupId} className="space-y-1.5">
                <div className="flex items-center px-2 py-1">
                  <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 tracking-wide">
                    {groupName}
                  </span>
                </div>

                <div className="space-y-1">
                  {groupTasks.map(task => (
                    <DraggableTaskCard key={task.id} task={task} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============ Draggable Task Card ============

function DraggableTaskCard({ task }: { task: any }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task-${task.id}`,
    data: { type: 'task', task },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 9999 }
    : undefined;

  const priorityColor = PRIORITY_COLORS[task.color as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.default;
  const hasPriority = task.color && task.color !== 'default';

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      initial={false}
      animate={isDragging ? { scale: 1.03, y: -1 } : { scale: 1, y: 0 }}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={`
        relative overflow-hidden rounded-lg cursor-grab active:cursor-grabbing select-none
        ${isDragging
          ? 'bg-white dark:bg-zinc-800 shadow-lg ring-1 ring-black/5 dark:ring-white/10'
          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
        }
        transition-colors duration-150
      `}
    >
      {hasPriority && (
        <div
          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full"
          style={{ backgroundColor: priorityColor }}
        />
      )}

      <div className={`px-3 py-2 ${hasPriority ? 'pl-4' : ''}`}>
        <p className="text-[13px] text-zinc-600 dark:text-zinc-300 leading-snug break-words">
          {task.content}
        </p>

        {task.estimatedMinutes && (
          <div className="flex items-center gap-1 mt-1.5">
            <Clock weight="regular" className="size-3 text-zinc-300 dark:text-zinc-600" />
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
              {task.estimatedMinutes >= 60
                ? `${Math.floor(task.estimatedMinutes / 60)}h${task.estimatedMinutes % 60 > 0 ? ` ${task.estimatedMinutes % 60}m` : ''}`
                : `${task.estimatedMinutes}m`}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
