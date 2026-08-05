export const SCROLL_EPSILON_PX = 1;

export const scrollbarThumbIdleColor = 'bg-[var(--vlaina-color-scrollbar-thumb)]';
export const scrollbarThumbActiveColor = 'bg-[var(--vlaina-color-scrollbar-thumb-hover)]';
export const scrollbarThumbHoverColor = 'hover:bg-[var(--vlaina-color-scrollbar-thumb-hover)]';

const MIN_THUMB_HEIGHT = 36;

export const scrollbarVariantClasses = {
  default: {
    rail: 'w-4',
    railHover: 'w-4',
    railAlign: 'justify-center',
    track: 'w-3',
    trackHover: 'w-3',
    thumbOffset: 'right-[var(--vlaina-scrollbar-thumb-offset)]',
    thumbHoverOffset: 'right-[var(--vlaina-scrollbar-thumb-offset)]',
    thumbIdleWidth: 'w-2',
    thumbHoverWidth: 'w-2',
    thumbDraggingWidth: 'w-[var(--vlaina-size-9px)]',
  },
  compact: {
    rail: 'w-[var(--vlaina-size-7px)]',
    railHover: 'w-4',
    railAlign: 'justify-end',
    track: 'w-[var(--vlaina-size-7px)]',
    trackHover: 'w-3',
    thumbOffset: 'right-0',
    thumbHoverOffset: 'right-[var(--vlaina-scrollbar-thumb-offset)]',
    thumbIdleWidth: 'w-[var(--vlaina-size-5px)]',
    thumbHoverWidth: 'w-2',
    thumbDraggingWidth: 'w-[var(--vlaina-size-9px)]',
  },
} as const;

export type ScrollbarVariant = keyof typeof scrollbarVariantClasses;
export type ScrollbarVariantClasses = typeof scrollbarVariantClasses[ScrollbarVariant];

export interface ScrollMetrics {
  canScroll: boolean;
  viewportHeight: number;
  scrollHeight: number;
  scrollTop: number;
  thumbHeight: number;
  thumbOffset: number;
}

export interface ScrollbarDragState {
  pointerStartY: number;
  scrollTopStart: number;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getScrollMetrics(element: HTMLDivElement): ScrollMetrics {
  const viewportHeight = element.clientHeight;
  const scrollHeight = element.scrollHeight;
  const scrollTop = element.scrollTop;
  const maxScrollTop = Math.max(scrollHeight - viewportHeight, 0);
  const canScroll = maxScrollTop > 0;

  if (!canScroll) {
    return {
      canScroll,
      viewportHeight,
      scrollHeight,
      scrollTop,
      thumbHeight: viewportHeight,
      thumbOffset: 0,
    };
  }

  const thumbHeight = clamp((viewportHeight / scrollHeight) * viewportHeight, MIN_THUMB_HEIGHT, viewportHeight);
  const maxThumbOffset = Math.max(viewportHeight - thumbHeight, 0);
  const thumbOffset = maxScrollTop === 0
    ? 0
    : (scrollTop / maxScrollTop) * maxThumbOffset;

  return {
    canScroll,
    viewportHeight,
    scrollHeight,
    scrollTop,
    thumbHeight,
    thumbOffset,
  };
}

export function getScrolledMetrics(metrics: ScrollMetrics, scrollTop: number): ScrollMetrics {
  const maxScrollTop = Math.max(metrics.scrollHeight - metrics.viewportHeight, 0);
  const maxThumbOffset = Math.max(metrics.viewportHeight - metrics.thumbHeight, 0);
  const nextScrollTop = clamp(scrollTop, 0, maxScrollTop);
  return {
    ...metrics,
    scrollTop: nextScrollTop,
    thumbOffset: maxScrollTop === 0
      ? 0
      : (nextScrollTop / maxScrollTop) * maxThumbOffset,
  };
}

export function getDraggedScrollMetrics(
  metrics: ScrollMetrics,
  dragState: ScrollbarDragState,
  clientY: number,
): ScrollMetrics | null {
  const maxThumbOffset = Math.max(metrics.viewportHeight - metrics.thumbHeight, 0);
  const maxScrollTop = Math.max(metrics.scrollHeight - metrics.viewportHeight, 0);
  if (!metrics.canScroll || maxThumbOffset === 0 || maxScrollTop === 0) {
    return null;
  }

  const deltaY = clientY - dragState.pointerStartY;
  const scrollDelta = (deltaY / maxThumbOffset) * maxScrollTop;
  const scrollTop = clamp(dragState.scrollTopStart + scrollDelta, 0, maxScrollTop);
  return {
    ...metrics,
    scrollTop,
    thumbOffset: (scrollTop / maxScrollTop) * maxThumbOffset,
  };
}
