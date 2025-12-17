/**
 * Event Layout Algorithm
 *
 * 专业级日历事件布局算法：
 * - 智能列分配，复用已结束事件的列位置
 * - 冲突组识别，确保同组事件宽度一致
 * - 支持任意数量的并发事件
 */

interface LayoutEvent {
  id: string;
  startDate: number;
  endDate: number;
}

export interface EventLayoutInfo {
  id: string;
  column: number;
  totalColumns: number;
  leftPercent: number;
  widthPercent: number;
}

/**
 * 计算单日内所有事件的布局
 */
export function calculateEventLayout(
  events: LayoutEvent[]
): Map<string, EventLayoutInfo> {
  const result = new Map<string, EventLayoutInfo>();

  if (events.length === 0) return result;

  // 按开始时间排序，相同开始时间的按时长降序（长事件优先）
  const sorted = [...events].sort((a, b) => {
    if (a.startDate !== b.startDate) return a.startDate - b.startDate;
    const durationA = a.endDate - a.startDate;
    const durationB = b.endDate - b.startDate;
    return durationB - durationA;
  });

  // 第一步：为每个事件分配列
  const eventColumns = new Map<string, number>();
  const activeSlots: { id: string; endTime: number; column: number }[] = [];

  for (const event of sorted) {
    // 清理已结束的事件
    const stillActive = activeSlots.filter((s) => s.endTime > event.startDate);

    // 找到被占用的列
    const occupied = new Set(stillActive.map((s) => s.column));

    // 分配最小可用列
    let column = 0;
    while (occupied.has(column)) {
      column++;
    }

    eventColumns.set(event.id, column);

    // 更新活跃列表
    activeSlots.length = 0;
    activeSlots.push(...stillActive, {
      id: event.id,
      endTime: event.endDate,
      column,
    });
  }

  // 第二步：构建冲突组（使用并查集）
  const parent = new Map<string, string>();

  const find = (id: string): string => {
    if (!parent.has(id)) parent.set(id, id);
    if (parent.get(id) !== id) {
      parent.set(id, find(parent.get(id)!));
    }
    return parent.get(id)!;
  };

  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent.set(rootA, rootB);
    }
  };

  // 合并所有重叠的事件
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (a.startDate < b.endDate && a.endDate > b.startDate) {
        union(a.id, b.id);
      }
    }
  }

  // 第三步：计算每个冲突组的最大列数
  const groupMaxColumn = new Map<string, number>();

  for (const event of sorted) {
    const root = find(event.id);
    const column = eventColumns.get(event.id) || 0;
    const currentMax = groupMaxColumn.get(root) || 0;
    groupMaxColumn.set(root, Math.max(currentMax, column + 1));
  }

  // 第四步：生成最终布局
  for (const event of sorted) {
    const column = eventColumns.get(event.id) || 0;
    const root = find(event.id);
    const totalColumns = groupMaxColumn.get(root) || 1;

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

  return result;
}
