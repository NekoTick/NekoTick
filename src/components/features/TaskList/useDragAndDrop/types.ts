import { ItemColor, Task } from '@/stores/useGroupStore';

export interface UseDragAndDropOptions {
  tasks: Task[];
  activeGroupId: string | null;
  groups: { id: string; name: string; createdAt: number; pinned?: boolean }[];
  toggleCollapse: (taskId: string) => void;
  reorderTasks: (taskId: string, targetId: string) => void;
  moveTaskToGroup: (taskId: string, groupId: string, targetId: string | null) => void;
  updateTaskColor: (taskId: string, color: ItemColor) => void;
  setDraggingTaskId: (id: string | null) => void;
}
