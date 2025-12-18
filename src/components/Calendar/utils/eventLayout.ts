/**
 * Event Layout Algorithm
 *
 * 专业级日历事件布局算法：
 * - 完成状态排序：未完成的事件排在左侧，已完成的排在右侧
 * - 颜色优先级排序：高优先级颜色的事件排在左侧
 * - 每个事件的宽度基于其实际并发数
 * - 没有重叠的事件显示为 100% 宽度
 */

import type { ItemColor } from '@/stores/types';

interface LayoutEvent {
  id: string;
  startDate: number;
  endDate: number;
  color?: ItemColor;
  completed?: boolean;
}

export interface EventLayoutInfo {
  id: string;
  column: number;
  totalColumns: number;
  leftPercent: number;
  widthPercent: number;
}

// 颜色优先级映射：数字越小优先级越高，排在越左边
const COLOR_PRIORITY: Record<ItemColor, number> = {
  red: 0,
  yellow: 1,
  purple: 2,
  green: 3,
  blue: 4,
  default: 5,
};

/**
 * 获取事件的颜色优先级
 */
function getColorPriority(color?: ItemColor): number {
  return COLOR_PRIORITY[color || 'default'] ?? COLOR_PRIORITY.default;
}

/**
 * 检查两个事件是否在时间上重叠
 */
function eventsOverlap(a: LayoutEvent, b: LayoutEvent): boolean {
  return a.startDate < b.endDate && a.endDate > b.startDate;
}

/**
 * 计算单日内所有事件的布局
 */
export function calculateEventLayout(
  events: LayoutEvent[]
): Map<string, EventLayoutInfo> {
  const result = new Map<string, EventLayoutInfo>();

  if (events.length === 0) return result;

  // 排序规则：
  // 1. 开始时间（早的优先）- 这是最重要的，确保列分配正确
  // 2. 完成状态（未完成优先，排在左边）
  // 3. 颜色优先级（红 > 黄 > 紫 > 绿 > 蓝 > 默认）
  // 4. 时长（长的优先，更稳定的视觉锚点）
  const sorted = [...events].sort((a, b) => {
    // 首先按开始时间排序 - 这确保列分配是正确的
    if (a.startDate !== b.startDate) return a.startDate - b.startDate;

    // 然后按完成状态排序：未完成的排在前面（左边）
    const completedA = a.completed ? 1 : 0;
    const completedB = b.completed ? 1 : 0;
    if (completedA !== completedB) return completedA - completedB;

    // 然后按颜色优先级排序
    const colorPriorityA = getColorPriority(a.color);
    const colorPriorityB = getColorPriority(b.color);
    if (colorPriorityA !== colorPriorityB) return colorPriorityA - colorPriorityB;

    // 最后按时长降序（长事件优先）
    const durationA = a.endDate - a.startDate;
    const durationB = b.endDate - b.startDate;
    return durationB - durationA;
  });

  // 为每个事件分配列
  const eventColumns = new Map<string, number>();

  for (const event of sorted) {
    // 找出所有在当前事件开始时仍然活跃的事件（已经分配了列的）
    const activeEvents = sorted.filter(e => 
      eventColumns.has(e.id) && // 已经分配了列
      e.endDate > event.startDate && // 还没结束
      e.startDate < event.startDate // 在当前事件之前开始
    );

    // 找到被占用的列
    const occupied = new Set(activeEvents.map(e => eventColumns.get(e.id)!));

    // 分配最小可用列
    let column = 0;
    while (occupied.has(column)) {
      column++;
    }

    eventColumns.set(event.id, column);
  }

  // 计算每个事件的布局
  for (const event of sorted) {
    const column = eventColumns.get(event.id) || 0;
    
    // 找出所有与当前事件重叠的事件
    const overlappingEvents = sorted.filter(e => 
      e.id !== event.id && eventsOverlap(event, e)
    );
    
    if (overlappingEvents.length === 0) {
      // 没有重叠，显示为 100% 宽度
      result.set(event.id, {
        id: event.id,
        column: 0,
        totalColumns: 1,
        leftPercent: 0,
        widthPercent: 100,
      });
    } else {
      // 有重叠，计算最大列数
      let maxColumn = column;
      for (const other of overlappingEvents) {
        const otherColumn = eventColumns.get(other.id) || 0;
        maxColumn = Math.max(maxColumn, otherColumn);
      }
      
      const totalColumns = maxColumn + 1;
      const columnWidth = 100 / totalColumns;
      const leftPercent = column * columnWidth;

      result.set(event.id, {
        id: event.id,
        column,
        totalColumns,
        leftPercent,
        widthPercent: columnWidth,
      });
    }
  }

  return result;
}
