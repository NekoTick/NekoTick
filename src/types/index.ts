/**
 * Core Task interface
 * Represents a single task item in Nekotick
 */
export interface Task {
  id: string;
  content: string;
  isDone: boolean;
  createdAt: number;
  tags?: string[];
  groupId?: string;
  color?: 'red' | 'yellow' | 'purple' | 'green' | 'blue' | 'default';

  // Time Auditing
  estimatedMinutes?: number;
  actualMinutes?: number;
  completedAt?: string;

  // Hierarchical structure
  parentId?: string | null;
  collapsed?: boolean;
}

/**
 * Time log entry for activity tracking (Phase 2)
 */
export interface TimeLog {
  date: string;        // YYYY-MM-DD format
  taskId: string;
  duration: number;    // Duration in minutes
}

/**
 * Storage Repository Interface - The Abstraction Layer
 * Implements the Repository Pattern for data persistence
 */
export interface StorageRepository {
  getTasks(): Promise<Task[]>;
  saveTask(task: Task): Promise<void>;
  updateTask(task: Task): Promise<void>;
  deleteTask(id: string): Promise<void>;
}

/**
 * Task creation input (without auto-generated fields)
 */
export type TaskInput = Pick<Task, 'content'> & Partial<Pick<Task, 'tags'>>;

