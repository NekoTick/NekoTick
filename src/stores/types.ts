// Store types and interfaces

export interface Group {
  id: string;
  name: string;
  createdAt: number;
  updatedAt?: number;
  pinned?: boolean;
}

// Unified color system: red, orange, yellow, green, blue, purple, brown, gray (default)
export type ItemColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'brown' | 'default';

// View mode type
export type ViewMode = 'day' | 'week' | 'month';

// Unified color configuration with new Apple-style colors
export const ITEM_COLORS: Record<ItemColor, string> = {
  red: '#FE002D',
  orange: '#FF8500',
  yellow: '#FEC900',
  green: '#63DA38',
  blue: '#008BFE',
  purple: '#DD11E8',
  brown: '#B47D58',
  default: '#9F9FA9',
} as const;

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
