// Store types and interfaces

export interface Group {
  id: string;
  name: string;
  createdAt: number;
  updatedAt?: number;
  pinned?: boolean;
}

// 统一颜色系统：用于待办和日历
export type ItemColor = 'red' | 'yellow' | 'purple' | 'green' | 'blue' | 'default';

// 保留 Priority 别名以便兼容
export type Priority = ItemColor;

// 统一颜色配置
export const PRIORITY_COLORS: Record<ItemColor, string> = {
  red: '#ef4444',
  yellow: '#eab308',
  purple: '#a855f7',
  green: '#22c55e',
  blue: '#3b82f6',
  default: '#d4d4d8',
} as const;

// 统一事项模型
export interface StoreTask {
  id: string;
  content: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  order: number;
  groupId: string;
  
  // 统一颜色
  color: ItemColor;
  // priority 是 color 的别名，保持向后兼容
  priority: ItemColor;
  
  // 时间属性（有时间 = 日历事件，无时间 = 纯待办）
  startDate?: number;
  endDate?: number;
  isAllDay?: boolean;
  
  // 时间追踪
  estimatedMinutes?: number;
  actualMinutes?: number;
  
  // 层级结构
  parentId: string | null;
  collapsed: boolean;
  
  // 日历相关
  location?: string;
  description?: string;
}

// Archive time view type
export type ArchiveTimeView = 'day' | 'week' | 'month';
