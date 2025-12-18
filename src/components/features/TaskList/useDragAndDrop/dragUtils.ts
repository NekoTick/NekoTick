import { StoreTask, Priority } from '@/stores/useGroupStore';

// 颜色优先级排序：red (0) > yellow (1) > purple (2) > green (3) > blue (4) > default (5)
export const priorityOrder: Record<string, number> = { red: 0, yellow: 1, purple: 2, green: 3, blue: 4, default: 5 };

export const findTargetTaskByMouse = (mouseY: number, activeId: string, tasks: StoreTask[]): StoreTask | undefined => {
  if (mouseY <= 0) return undefined;

  const allTaskElements = document.querySelectorAll('[data-task-id]');
  let targetTaskId: string | null = null;
  let minDistance = Infinity;
  
  allTaskElements.forEach(el => {
    const elTaskId = el.getAttribute('data-task-id');
    if (!elTaskId || elTaskId === activeId) return;
    
    const elRect = el.getBoundingClientRect();
    const taskCenterY = elRect.top + elRect.height / 2;
    const distance = Math.abs(mouseY - taskCenterY);
    
    if (mouseY >= elRect.top && mouseY <= elRect.bottom && distance < minDistance) {
      minDistance = distance;
      targetTaskId = elTaskId;
    }
  });

  if (targetTaskId) {
    return tasks.find(t => t.id === targetTaskId);
  }
  return undefined;
};

export const determineParentTask = (
  draggedTask: StoreTask,
  overTask: StoreTask,
  activeId: string,
  overId: string,
  activeGroupId: string,
  tasks: StoreTask[]
): StoreTask | null => {
  if (overId === activeId) {
    // Dragged to own position: find previous top-level task as parent
    if (!draggedTask.parentId) {
      const topLevelTasks = tasks
        .filter(t => 
          t.groupId === activeGroupId && 
          !t.parentId && 
          t.completed === draggedTask.completed
        )
        .sort((a, b) => {
          const aPriority = priorityOrder[a.priority || 'default'];
          const bPriority = priorityOrder[b.priority || 'default'];
          if (aPriority !== bPriority) return aPriority - bPriority;
          return a.order - b.order;
        });
      const selfIndex = topLevelTasks.findIndex(t => t.id === activeId);
      return selfIndex > 0 ? topLevelTasks[selfIndex - 1] : null;
    } else {
      return null;
    }
  } else {
    // Dragged to another task: that task becomes the parent
    return overTask;
  }
};

export const isTaskDescendant = (tasks: StoreTask[], ancestorId: string, descendantId: string): boolean => {
  const children = tasks.filter(t => t.parentId === ancestorId);
  if (children.some(c => c.id === descendantId)) return true;
  return children.some(c => isTaskDescendant(tasks, c.id, descendantId));
};

export const calculatePriorityToInherit = (
  draggedTask: StoreTask,
  targetTask: StoreTask,
  activeGroupId: string | null,
  tasks: StoreTask[],
  overId: string
): Priority | null => {
  if (draggedTask.completed !== targetTask.completed) return null;

  const groupTasks = tasks
    .filter(t => t.groupId === activeGroupId && !t.parentId && t.completed === targetTask.completed && t.id !== draggedTask.id)
    .sort((a, b) => {
      const aPriority = priorityOrder[a.priority || 'default'];
      const bPriority = priorityOrder[b.priority || 'default'];
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.order - b.order;
    });
  
  const targetIndex = groupTasks.findIndex(t => t.id === overId);
  const taskAbove = targetIndex > 0 ? groupTasks[targetIndex - 1] : null;
  
  const abovePriority = (taskAbove?.priority || 'default') as string;
  const targetPriority = (targetTask.priority || 'default') as string;
  
  if (abovePriority !== 'default') {
    return abovePriority as Priority;
  } else if (targetPriority !== 'default') {
    return targetPriority as Priority;
  } else {
    return 'default';
  }
};
