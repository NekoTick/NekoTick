/**
 * Storage Type Definitions
 * 
 * Legacy types kept for backward compatibility.
 * New code should use types from unifiedStorage.ts
 */

// Time Tracker types (still in use)
export interface AppUsageData {
  name: string;
  duration: number; // seconds
}

export interface DayTimeData {
  date: string;
  apps: AppUsageData[];
  websites: AppUsageData[];
}

// Legacy types (kept for compatibility, prefer UnifiedTask/UnifiedGroup/etc.)
export interface TaskData {
  id: string;
  content: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  scheduledTime?: string;
  order: number;
  parentId: string | null;
  collapsed: boolean;
  priority?: 'red' | 'yellow' | 'purple' | 'green' | 'blue' | 'default';
  estimatedMinutes?: number;
  actualMinutes?: number;
}

export interface GroupData {
  id: string;
  name: string;
  pinned: boolean;
  tasks: TaskData[];
  createdAt: number;
  updatedAt: number;
}

export interface ProgressData {
  id: string;
  type: 'progress' | 'counter';
  title: string;
  icon?: string;
  direction?: 'increment' | 'decrement';
  total?: number;
  step: number;
  unit: string;
  current: number;
  todayCount: number;
  lastUpdateDate?: string;
  history?: Record<string, number>;
  frequency?: 'daily' | 'weekly' | 'monthly';
  resetFrequency?: 'daily' | 'weekly' | 'monthly' | 'none';
  startDate?: number;
  endDate?: number;
  createdAt: number;
  archived?: boolean;
}

export interface ArchiveSection {
  timestamp: string;
  tasks: Array<{
    content: string;
    estimated?: string;
    actual?: string;
    completedAt?: string;
    createdAt?: number;
    priority?: string;
  }>;
}
