// Store types and interfaces

export interface Group {
  id: string;
  name: string;
  color?: string;
  createdAt: number;
  updatedAt?: number;
  pinned?: boolean;
}

// Priority levels: red (highest) > yellow > purple > green > default (lowest)
export type Priority = 'red' | 'yellow' | 'purple' | 'green' | 'default';

// Priority color mapping
export const PRIORITY_COLORS: Record<Priority, string> = {
  red: '#ef4444',
  yellow: '#eab308',
  purple: '#a855f7',
  green: '#22c55e',
  default: '#d4d4d8',
} as const;

// Internal Task type for persistence (uses 'completed')
export interface StoreTask {
  id: string;
  content: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  scheduledTime?: string;
  order: number;
  groupId: string;
  priority?: Priority;
  
  // Time estimation and tracking
  estimatedMinutes?: number;
  actualMinutes?: number;
  
  // Hierarchical structure (nested tasks)
  parentId: string | null;
  collapsed: boolean;
  
  // Archive metadata - stores original group ID when task is archived
  originalGroupId?: string;
}

// Archive time view type
export type ArchiveTimeView = 'day' | 'week' | 'month';
