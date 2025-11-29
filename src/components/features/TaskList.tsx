import { useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { TaskItem } from './TaskItem';
import { useTaskStore } from '@/stores/useTaskStore';
import { useGroupStore } from '@/stores/useGroupStore';

export function TaskList() {
  const { tasks, toggleTask, updateTaskContent, updateTaskTime, deleteTask, reorderTasks } = useTaskStore();
  const activeGroupId = useGroupStore((s) => s.activeGroupId);

  // Filter tasks by current group
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => (t.groupId || 'default') === activeGroupId);
  }, [tasks, activeGroupId]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px of movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const taskIds = useMemo(() => filteredTasks.map((t) => t.id), [filteredTasks]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      reorderTasks(active.id as string, over.id as string);
    }
  };

  if (filteredTasks.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground text-sm">
          暂无任务
        </p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-0.5">
          <AnimatePresence mode="popLayout">
            {filteredTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onToggle={toggleTask}
                onUpdate={updateTaskContent}
                onUpdateTime={updateTaskTime}
                onDelete={deleteTask}
              />
            ))}
          </AnimatePresence>
        </div>
      </SortableContext>
    </DndContext>
  );
}
