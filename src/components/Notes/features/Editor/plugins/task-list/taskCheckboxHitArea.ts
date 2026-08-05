const DEFAULT_CHECKBOX_SIZE = 16;
const DEFAULT_CLICK_PADDING = 6;

export interface CheckboxBoundsInput {
  textLeft: number;
  gap: number;
  checkboxSize?: number;
}

export function calculateTaskCheckboxBounds({
  textLeft,
  gap,
  checkboxSize = DEFAULT_CHECKBOX_SIZE,
}: CheckboxBoundsInput) {
  const right = textLeft - gap;
  const left = right - checkboxSize;

  return { left, right };
}

export function getTaskCheckboxBounds(taskItem: HTMLElement) {
  const itemRect = taskItem.getBoundingClientRect();
  const textBlock = taskItem.querySelector(':scope > [data-text-align], :scope > p') as HTMLElement | null;

  if (!textBlock) {
    return { left: itemRect.left - 30, right: itemRect.left + 5 };
  }

  const textRect = textBlock.getBoundingClientRect();
  if (!Number.isFinite(textRect.left)) {
    return { left: itemRect.left - 30, right: itemRect.left + 5 };
  }

  const itemStyle = window.getComputedStyle(taskItem);
  const beforeStyle = window.getComputedStyle(taskItem, '::before');
  const gap = Number.parseFloat(itemStyle.columnGap || itemStyle.gap || '8') || 8;
  const checkboxSize = Number.parseFloat(beforeStyle.width || '') || DEFAULT_CHECKBOX_SIZE;

  return calculateTaskCheckboxBounds({
    textLeft: textRect.left,
    gap,
    checkboxSize,
  });
}

export function isTaskCheckboxClick(taskItem: HTMLElement, clientX: number) {
  const { left, right } = getTaskCheckboxBounds(taskItem);
  return clientX >= left - DEFAULT_CLICK_PADDING && clientX <= right + DEFAULT_CLICK_PADDING;
}

export function isPointVerticallyInsideTaskPrimaryLine(taskItem: HTMLElement, clientY: number): boolean {
  const textBlock = taskItem.querySelector(':scope > [data-text-align], :scope > p') as HTMLElement | null;
  const rect = (textBlock ?? taskItem).getBoundingClientRect();
  const slack = Math.max(4, Math.min(8, rect.height * 0.35));
  return clientY >= rect.top - slack && clientY <= rect.bottom + slack;
}

function compareDeepestFirst(a: HTMLElement, b: HTMLElement): number {
  if (a === b) return 0;
  if (a.contains(b)) return 1;
  if (b.contains(a)) return -1;
  return 0;
}

export function resolveTaskCheckboxTarget(
  root: HTMLElement,
  target: HTMLElement,
  clientX: number,
  clientY: number
): HTMLElement | null {
  const directTaskLi = target.closest('li[data-item-type="task"]') as HTMLElement | null;
  if (
    directTaskLi &&
    root.contains(directTaskLi) &&
    isPointVerticallyInsideTaskPrimaryLine(directTaskLi, clientY) &&
    isTaskCheckboxClick(directTaskLi, clientX)
  ) {
    return directTaskLi;
  }

  const scanRoot = target.closest('li');
  if (!scanRoot || !root.contains(scanRoot)) {
    return null;
  }
  const candidates = Array.from(scanRoot.querySelectorAll<HTMLElement>('li[data-item-type="task"]'))
    .filter((taskItem) => (
      isPointVerticallyInsideTaskPrimaryLine(taskItem, clientY) &&
      isTaskCheckboxClick(taskItem, clientX)
    ))
    .sort(compareDeepestFirst);

  return candidates[0] ?? null;
}
