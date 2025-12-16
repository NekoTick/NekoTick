import { useGroupStore } from '@/stores/useGroupStore';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';

export function ContextPanel() {
  const { tasks } = useGroupStore();
  const [isHoveringAdd, setIsHoveringAdd] = useState(false);

  // Filter for tasks that are "Unscheduled"
  // Logic: Not completed, and (no scheduledTime OR explicitly marked as inbox/backlog)
  const unscheduledTasks = tasks.filter(t => 
    !t.completed && 
    (!t.scheduledTime || t.scheduledTime.length === 0)
  );

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800">
       <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Unscheduled</h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">
              {unscheduledTasks.length}
            </span>
            <button 
               onMouseEnter={() => setIsHoveringAdd(true)}
               onMouseLeave={() => setIsHoveringAdd(false)}
               className="group p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
            >
              <Plus className={`size-3.5 transition-transform ${isHoveringAdd ? 'rotate-90' : 'rotate-0'}`} />
            </button>
          </div>
       </div>
       
       <div className="flex-1 p-3 space-y-2 overflow-y-auto custom-scrollbar">
          {unscheduledTasks.length === 0 && (
            <div className="text-center py-8 text-zinc-400 text-sm">
              All cleared!
            </div>
          )}
          
          {unscheduledTasks.map(task => (
            <DraggableTaskCard key={task.id} task={task} />
          ))}
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`
        p-2 rounded border cursor-grab active:cursor-grabbing shadow-sm group transition-all select-none
        ${isDragging 
           ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 opacity-80 rotate-2 scale-105' 
           : 'bg-white dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700/50 hover:border-zinc-300 dark:hover:border-zinc-600'}
      `}
    >
       <div className="flex items-start gap-2">
          <div className={`
            mt-0.5 w-3.5 h-3.5 rounded-sm border flex-shrink-0
            ${task.priority === 'red' ? 'border-red-400 bg-red-50' : 
              task.priority === 'yellow' ? 'border-yellow-400 bg-yellow-50' :
              task.priority === 'green' ? 'border-green-400 bg-green-50' :
              'border-zinc-300 dark:border-zinc-600'}
          `} />
          <span className="text-sm text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 flex-1 min-w-0 break-words leading-tight">
            {task.content}
          </span>
       </div>
       {/* Labels/Tags could go here */}
    </div>
  );
}
