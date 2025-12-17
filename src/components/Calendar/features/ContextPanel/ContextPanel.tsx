import { useGroupStore } from '@/stores/useGroupStore';
import { useCalendarStore } from '@/stores/useCalendarStore';
import { Tray, Clock } from '@phosphor-icons/react';
import { useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import { EventEditForm } from './EventEditForm';

// 优先级颜色映射
const PRIORITY_COLORS = {
  red: '#ef4444',
  yellow: '#eab308',
  purple: '#a855f7',
  green: '#22c55e',
  default: 'transparent',
} as const;

export function ContextPanel() {
  const { tasks, groups } = useGroupStore();
  const { editingEventId, events } = useCalendarStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Find the event being edited
  const editingEvent = editingEventId ? events.find(e => e.id === editingEventId) : null;

  // If editing an event, show the edit form
  if (editingEvent) {
    return <EventEditForm event={editingEvent} />;
  }

  // 收件箱模式：显示所有未安排的任务（没有 scheduledTime 的任务）
  const unscheduledTasks = tasks.filter(t => 
    !t.completed && 
    (!t.scheduledTime || t.scheduledTime.length === 0)
  );

  // 按优先级排序：红 > 黄 > 紫 > 绿 > 默认
  const priorityOrder = { red: 0, yellow: 1, purple: 2, green: 3, default: 4 };
  const sortedTasks = [...unscheduledTasks].sort((a, b) => {
    const aPriority = priorityOrder[a.priority || 'default'];
    const bPriority = priorityOrder[b.priority || 'default'];
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.createdAt - b.createdAt;
  });

  // Group tasks by their groupId
  const tasksByGroup = sortedTasks.reduce((acc, task) => {
    const groupId = task.groupId || 'default';
    if (!acc[groupId]) acc[groupId] = [];
    acc[groupId].push(task);
    return acc;
  }, {} as Record<string, typeof sortedTasks>);

  // 获取分组顺序（pinned 的在前）
  const sortedGroupIds = Object.keys(tasksByGroup).sort((a, b) => {
    const groupA = groups.find(g => g.id === a);
    const groupB = groups.find(g => g.id === b);
    if (groupA?.pinned && !groupB?.pinned) return -1;
    if (!groupA?.pinned && groupB?.pinned) return 1;
    return 0;
  });

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900 overflow-hidden">
      {/* Task List */}
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
        {/* Empty State */}
        {unscheduledTasks.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <Tray weight="light" className="size-7 text-zinc-200 dark:text-zinc-700" />
          </div>
        )}

        {/* Tasks by Group */}
        <div className="space-y-3">
          {sortedGroupIds.map((groupId) => {
            const groupTasks = tasksByGroup[groupId];
            const group = groups.find(g => g.id === groupId);
            const groupName = group?.name || '收集箱';
            
            return (
              <div key={groupId} className="space-y-1.5">
                {/* Group Header */}
                <div className="flex items-center px-2 py-1">
                  <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 tracking-wide">
                    {groupName}
                  </span>
                </div>
                
                {/* Tasks */}
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


function DraggableTaskCard({ task }: { task: any }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task-${task.id}`,
    data: { type: 'task', task },
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: 9999,
  } : undefined;

  const priorityColor = PRIORITY_COLORS[task.priority as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.default;
  const hasPriority = task.priority && task.priority !== 'default';

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      initial={false}
      animate={isDragging 
        ? { scale: 1.03, y: -1 } 
        : { scale: 1, y: 0 }
      }
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={`
        relative overflow-hidden rounded-lg cursor-grab active:cursor-grabbing select-none
        ${isDragging 
          ? 'bg-white dark:bg-zinc-800 shadow-lg ring-1 ring-black/5 dark:ring-white/10' 
          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
        }
        transition-colors duration-150
      `}
    >
      {/* Priority Indicator - Left Edge Line */}
      {hasPriority && (
        <div 
          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full"
          style={{ backgroundColor: priorityColor }}
        />
      )}

      {/* Content */}
      <div className={`px-3 py-2 ${hasPriority ? 'pl-4' : ''}`}>
        <p className="text-[13px] text-zinc-600 dark:text-zinc-300 leading-snug break-words">
          {task.content}
        </p>
        
        {/* Time Estimation - 更紧凑 */}
        {task.estimatedMinutes && (
          <div className="flex items-center gap-1 mt-1.5">
            <Clock weight="regular" className="size-3 text-zinc-300 dark:text-zinc-600" />
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
              {task.estimatedMinutes >= 60 
                ? `${Math.floor(task.estimatedMinutes / 60)}h${task.estimatedMinutes % 60 > 0 ? ` ${task.estimatedMinutes % 60}m` : ''}`
                : `${task.estimatedMinutes}m`
              }
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
