import type { NotesOutlineHeading } from './types';
import {
  createOutlineHeadingId,
  getHeadingLevelFromTagName,
  readBoundedHeadingText,
} from './outlineUtils';

export interface OutlineHeadingMetric extends NotesOutlineHeading {
  element: HTMLElement;
  top: number;
}

export const MAX_OUTLINE_HEADING_METRICS = 5000;
export const MAX_OUTLINE_HEADING_DOM_SCAN_ELEMENTS = 20_000;
const SCROLL_END_TOLERANCE_PX = 2;

function isHeadingElement(element: HTMLElement): boolean {
  return getHeadingLevelFromTagName(element.tagName) !== null;
}

function collectOutlineHeadingElements(editorRoot: HTMLElement): HTMLElement[] {
  const elements: HTMLElement[] = [];
  const walker = editorRoot.ownerDocument.createTreeWalker(editorRoot, NodeFilter.SHOW_ELEMENT);
  let scannedElements = 0;

  for (
    let node = walker.nextNode();
    node
      && elements.length < MAX_OUTLINE_HEADING_METRICS
      && scannedElements < MAX_OUTLINE_HEADING_DOM_SCAN_ELEMENTS;
    node = walker.nextNode()
  ) {
    scannedElements += 1;
    if (node instanceof HTMLElement && isHeadingElement(node)) {
      elements.push(node);
    }
  }

  return elements;
}

export function readOutlineHeadingMetrics(
  editorRoot: HTMLElement,
  scrollRoot: HTMLElement | null,
): OutlineHeadingMetric[] {
  const headingElements = collectOutlineHeadingElements(editorRoot);
  const scrollTop = scrollRoot?.scrollTop ?? 0;
  const scrollRootTop = scrollRoot?.getBoundingClientRect().top ?? 0;

  return headingElements.flatMap((element, index) => {
    const level = getHeadingLevelFromTagName(element.tagName);
    if (!level) {
      return [];
    }

    const text = readBoundedHeadingText(element);
    const id = createOutlineHeadingId(index, level, text);
    const top = scrollRoot
      ? element.getBoundingClientRect().top - scrollRootTop + scrollTop
      : 0;

    return [{
      id,
      level,
      text,
      from: 0,
      to: 0,
      element,
      top,
    }];
  });
}

export function buildOutlineElementMap(
  metrics: readonly OutlineHeadingMetric[],
): Map<string, HTMLElement> {
  return new Map(metrics.map((metric) => [metric.id, metric.element]));
}

export function buildOutlinePositionMap(
  metrics: readonly OutlineHeadingMetric[],
): Map<string, number> {
  return new Map(metrics.map((metric) => [metric.id, metric.top]));
}

export function refreshOutlineHeadingMetricTops(
  metrics: readonly OutlineHeadingMetric[],
  scrollRoot: HTMLElement,
  scrollTop = scrollRoot.scrollTop,
): OutlineHeadingMetric[] {
  const scrollRootTop = scrollRoot.getBoundingClientRect().top;

  return metrics.flatMap((metric) => {
    if (!metric.element.isConnected) {
      return [];
    }

    return [{
      ...metric,
      top: metric.element.getBoundingClientRect().top - scrollRootTop + scrollTop,
    }];
  });
}

export function selectActiveOutlineHeadingId(
  metrics: readonly OutlineHeadingMetric[],
  scrollTop: number,
  activeOffsetPx: number,
  activeSnapPx: number,
  maxScrollTop?: number,
): string | null {
  if (metrics.length === 0) {
    return null;
  }

  if (maxScrollTop !== undefined && maxScrollTop > 0) {
    const scrollEndTolerance = Math.min(SCROLL_END_TOLERANCE_PX, maxScrollTop / 2);
    if (scrollTop >= maxScrollTop - scrollEndTolerance) {
      return metrics.at(-1)?.id ?? null;
    }
  }

  const anchorY = scrollTop + activeOffsetPx;
  let low = 0;
  let high = metrics.length - 1;
  let bestIndex = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const metric = metrics[middle];
    if (!metric) {
      break;
    }

    if (metric.top <= anchorY) {
      bestIndex = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  const bestMetric = metrics[bestIndex];
  const nextMetric = metrics[bestIndex + 1];
  if (!bestMetric) {
    return null;
  }

  if (!nextMetric) {
    return bestMetric.id;
  }

  const nextDistance = nextMetric.top - anchorY;
  const previousDistance = anchorY - bestMetric.top;
  if (nextDistance <= activeSnapPx && nextDistance < previousDistance) {
    return nextMetric.id;
  }

  return bestMetric.id;
}
