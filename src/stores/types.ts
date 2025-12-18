// Store types and interfaces

export interface Group {
  id: string;
  name: string;
  createdAt: number;
  updatedAt?: number;
  pinned?: boolean;
}

// 统一颜色系统
export type ItemColor = 'red' | 'yellow' | 'purple' | 'green' | 'blue' | 'default';

// 统一颜色配置
export const ITEM_COLORS: Record<ItemColor, string> = {
  red: '#ef4444',
  yellow: '#eab308',
  purple: '#a855f7',
  green: '#22c55e',
  blue: '#3b82f6',
  default: '#d4d4d8',
} as const;

// Alias for backward compatibility
export const PRIORITY_COLORS = ITEM_COLORS;

// StoreTask type for archive components
export interface StoreTask {
  id: string;
  content: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  order: number;
  groupId: string;
  parentId: string | null;
  collapsed: boolean;
  color: ItemColor;
  estimatedMinutes?: number;
  actualMinutes?: number;
  startDate?: number;
  endDate?: number;
  isAllDay?: boolean;
}

// Archive time view type
export type ArchiveTimeView = 'day' | 'week' | 'month';
