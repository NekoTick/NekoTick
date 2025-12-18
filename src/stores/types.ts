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
