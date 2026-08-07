import type { WheelEvent as ReactWheelEvent } from 'react';

const WHEEL_DELTA_MODE_LINE = 1;
const WHEEL_DELTA_MODE_PAGE = 2;
const WHEEL_LINE_HEIGHT_PX = 16;
const SCROLL_EPSILON_PX = 1;
const SCROLLABLE_OVERFLOW_VALUES = new Set(['auto', 'scroll', 'overlay']);

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeWheelDelta(delta: number, deltaMode: number, pageSize: number) {
  if (deltaMode === WHEEL_DELTA_MODE_LINE) {
    return delta * WHEEL_LINE_HEIGHT_PX;
  }

  if (deltaMode === WHEEL_DELTA_MODE_PAGE) {
    return delta * pageSize;
  }

  return delta;
}

function getElementFromTarget(target: EventTarget | null) {
  if (target instanceof Element) {
    return target;
  }

  if (target instanceof Node) {
    return target.parentElement;
  }

  return null;
}

function canElementScrollVertically(element: HTMLElement) {
  const overflowY = window.getComputedStyle(element).overflowY;
  return (
    SCROLLABLE_OVERFLOW_VALUES.has(overflowY) &&
    element.scrollHeight - element.clientHeight > SCROLL_EPSILON_PX
  );
}

function canElementScrollHorizontally(element: HTMLElement) {
  const overflowX = window.getComputedStyle(element).overflowX;
  return (
    SCROLLABLE_OVERFLOW_VALUES.has(overflowX) &&
    element.scrollWidth - element.clientWidth > SCROLL_EPSILON_PX
  );
}

function canElementConsumeHorizontalDelta(element: HTMLElement, deltaX: number) {
  const maxScrollLeft = Math.max(element.scrollWidth - element.clientWidth, 0);

  if (deltaX < 0) {
    return element.scrollLeft > SCROLL_EPSILON_PX;
  }

  if (deltaX > 0) {
    return element.scrollLeft < maxScrollLeft - SCROLL_EPSILON_PX;
  }

  return false;
}

function hasNestedScrollableConsumer(
  target: EventTarget | null,
  root: HTMLElement,
  deltaX: number,
) {
  let element = getElementFromTarget(target);

  while (element && element !== root) {
    if (
      element instanceof HTMLElement &&
      canElementScrollHorizontally(element) &&
      canElementConsumeHorizontalDelta(element, deltaX)
    ) {
      return true;
    }

    element = element.parentElement;
  }

  return false;
}

function scrollElementHorizontally(scrollRoot: HTMLElement, deltaX: number) {
  const maxScrollLeft = Math.max(scrollRoot.scrollWidth - scrollRoot.clientWidth, 0);
  if (maxScrollLeft <= 0) {
    return false;
  }

  const nextScrollLeft = clamp(scrollRoot.scrollLeft + deltaX, 0, maxScrollLeft);
  if (Math.abs(nextScrollLeft - scrollRoot.scrollLeft) < SCROLL_EPSILON_PX) {
    return false;
  }

  scrollRoot.scrollLeft = nextScrollLeft;
  return true;
}

export function handleScrollableWheel(event: ReactWheelEvent<HTMLElement>) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey) {
    return;
  }

  const scrollRoot = event.currentTarget;
  const canScrollVertically = canElementScrollVertically(scrollRoot);

  if (event.deltaY !== 0 && canScrollVertically) {
    return;
  }

  const rawDeltaX = event.deltaX !== 0
    ? event.deltaX
    : !canScrollVertically
      ? event.deltaY
      : 0;
  const deltaX = normalizeWheelDelta(rawDeltaX, event.deltaMode, scrollRoot.clientWidth);
  if (
    deltaX === 0 ||
    hasNestedScrollableConsumer(event.target, scrollRoot, deltaX) ||
    !scrollElementHorizontally(scrollRoot, deltaX)
  ) {
    return;
  }

  event.preventDefault();
}
