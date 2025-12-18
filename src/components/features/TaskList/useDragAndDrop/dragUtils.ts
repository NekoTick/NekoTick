import { Task, ItemColor } from '@/stores/useGroupStore';

// Color sorting: red (0) > yellow (1) > purple (2) > green (3) > blue (4) > default (5)
export const colorOrder: Record<string, number> = { red: 0, yellow: 1, purple: 2, green: 3, blue: 4, default: 5 };

export const findTargetTaskByMouse = (mouseY: number, activeId: string, tasks: Task[]): Task | undefined => {
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
  draggedTask: Task,
  overTask: Task,
  activeId: string,
  overId: string,
  activeGroupId: string,
  tasks: Task[]
): Task | null => {
  if (overId === activeId) {
    if (!draggedTask.parentId) {
      const topLevelTasks = tasks
        .filter(t =>
          t.groupId === activeGroupId &&
          !t.parentId &&
          t.completed === draggedTask.completed
        )
        .sort((a, b) => {
          const aColor = colorOrder[a.color || 'default'];
          const bColor = colorOrder[b.color || 'default'];
          if (aColor !== bColor) return aColor - bColor;
          return a.order - b.order;
        });
      const selfIndex = topLevelTasks.findIndex(t => t.id === activeId);
      return selfIndex > 0 ? topLevelTasks[selfIndex - 1] : null;
    } else {
      return null;
    }
  } else {
    return overTask;
  }
};

export const isTaskDescendant = (tasks: Task[], ancestorId: string, descendantId: string): boolean => {
  const children = tasks.filter(t => t.parentId === ancestorId);
  if (children.some(c => c.id === descendantId)) return true;
  return children.some(c => isTaskDescendant(tasks, c.id, descendantId));
};

export const calculateColorToInherit = (
  draggedTask: Task,
  targetTask: Task,
  activeGroupId: string | null,
  tasks: Task[],
  overId: string
): ItemColor | null => {
  if (draggedTask.completed !== targetTask.completed) return null;

  const groupTasks = tasks
    .filter(t => t.groupId === activeGroupId && !t.parentId && t.completed === targetTask.completed && t.id !== draggedTask.id)
    .sort((a, b) => {
      const aColor = colorOrder[a.color || 'default'];
      const bColor = colorOrder[b.color || 'default'];
      if (aColor !== bColor) return aColor - bColor;
      return a.order - b.order;
    });

  const targetIndex = groupTasks.findIndex(t => t.id === overId);
  const taskAbove = targetIndex > 0 ? groupTasks[targetIndex - 1] : null;

  const aboveColor = (taskAbove?.color || 'default') as string;
  const targetColor = (targetTask.color || 'default') as string;

  if (aboveColor !== 'default') {
    return aboveColor as ItemColor;
  } else if (targetColor !== 'default') {
    return targetColor as ItemColor;
  } else {
    return 'default';
  }
};
