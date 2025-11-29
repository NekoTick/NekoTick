/**
 * Core Task interface
 * Represents a single task item in Nekotick
 */
export interface Task {
  id: string;
  content: string;
  isDone: boolean;
  createdAt: number;  // Unix timestamp
  tags?: string[];
  groupId?: string;   // Group ID, defaults to 'inbox'
  
  // Time Auditing
  estimatedMinutes?: number;  // Estimated duration in minutes
  actualMinutes?: number;     // Actual time spent in minutes
  completedAt?: string;       // ISO date string (YYYY-MM-DD) for heatmap
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

