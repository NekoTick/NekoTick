import type { EditorView } from '@milkdown/kit/prose/view';
import {
  resolveStandaloneImageBlockRange,
  type BlockRange,
} from './blockSelectionUtils';
import { resolveBlockElementAtPos, resolveTopLevelBlockElement } from './topLevelBlockDom';
import {
  collectSelectableBlockRanges,
  getListItemRangeEnd,
  getRangeCacheKey,
  isListContainerNode,
  isStandaloneImageParagraphNode,
  type EditorDoc,
} from './blockUnitRangeCollection';
import {
  mapRangesToSelectableBlocks,
  resolveSelectableBlockRange,
} from './blockUnitRangeMapping';
import { resolveTargetRect } from './blockUnitDomRects';

export interface SelectableBlockTarget {
  range: BlockRange;
  element: HTMLElement;
  subElement?: HTMLElement;
  rect: DOMRect;
}

const COLLAPSED_BLOCK_SELECTOR = '.heading-collapsed-content, .editor-collapsed-content';
const directTopLevelBlockRangeKeysCache = new WeakMap<EditorDoc, Set<string>>();

function isCollapsedBlockElement(element: HTMLElement): boolean {
  return element.closest(COLLAPSED_BLOCK_SELECTOR) !== null;
}

function resolveListItemElement(view: EditorView, from: number, to: number): HTMLElement | null {
  const docSize = view.state.doc.content.size;
  const rangeStart = Math.max(1, Math.min(from + 1, docSize));
  const rangeEnd = Math.max(rangeStart, Math.min(Math.max(from + 1, to - 1), docSize));
  const rangeMiddle = Math.max(rangeStart, Math.min(Math.floor((rangeStart + rangeEnd) / 2), docSize));
  const probePositions = Array.from(new Set([rangeStart, rangeMiddle, rangeEnd]));

  const resolveItemFromNode = (node: Node | null): HTMLElement | null => {
    if (!node) return null;
    const base = node instanceof HTMLElement ? node : node.parentElement;
    const item = base?.closest('li') ?? null;
    if (!(item instanceof HTMLElement)) return null;
    if (!view.dom.contains(item)) return null;
    return item;
  };

  for (const pos of probePositions) {
    try {
      const domPos = view.domAtPos(pos);
      const item = resolveItemFromNode(domPos.node);
      if (item) return item;
    } catch {
    }
  }

  for (const pos of probePositions) {
    const nodeDom = view.nodeDOM(pos);
    const item = resolveItemFromNode(nodeDom as Node | null);
    if (item) return item;
  }

  const fromNode = view.nodeDOM(from);
  const fromItem = resolveItemFromNode(fromNode as Node | null);
  if (fromItem) return fromItem;

  try {
    const domPos = view.domAtPos(rangeStart);
    const item = resolveItemFromNode(domPos.node);
    if (item) return item;
  } catch {
  }

  return null;
}

function resolveStandaloneImageElement(view: EditorView, range: BlockRange): HTMLElement | null {
  const imageRange = resolveStandaloneImageBlockRange(view.state.doc, range);
  if (!imageRange) return null;

  const resolveImageContainer = (node: Node | null): HTMLElement | null => {
    if (!node) return null;
    const base = node instanceof HTMLElement ? node : node.parentElement;
    const container = base?.closest('.image-block-container') ?? null;
    if (!(container instanceof HTMLElement)) return null;
    if (!view.dom.contains(container)) return null;
    return container;
  };

  const nodeDom = view.nodeDOM(imageRange.from);
  const directContainer = resolveImageContainer(nodeDom as Node | null);
  if (directContainer) return directContainer;

  try {
    const domPos = view.domAtPos(imageRange.from);
    const domContainer = resolveImageContainer(domPos.node);
    if (domContainer) return domContainer;
  } catch {
  }

  return null;
}

function resolveInListItemChildElement(view: EditorView, range: BlockRange): HTMLElement | null {
  const safeFrom = Math.max(0, Math.min(range.from, view.state.doc.content.size));
  try {
    const $from = view.state.doc.resolve(safeFrom);
    if ($from.parent.type.name !== 'list_item') return null;
    const nodeDom = view.nodeDOM(range.from);
    if (nodeDom instanceof HTMLElement && view.dom.contains(nodeDom)) return nodeDom;
    if (nodeDom?.parentElement && view.dom.contains(nodeDom.parentElement)) return nodeDom.parentElement;
  } catch {
  }
  return null;
}

function resolveRangeElement(view: EditorView, range: BlockRange): HTMLElement | null {
  const listItemTo = getListItemRangeEnd(view.state.doc, range.from);
  if (listItemTo !== null) {
    const element = resolveListItemElement(view, range.from, range.to);
    if (element) return element;
  }

  const inListItemChild = resolveInListItemChildElement(view, range);
  if (inListItemChild) return inListItemChild;

  const imageElement = resolveStandaloneImageElement(view, range);
  if (imageElement) return imageElement;

  const topLevelElement = resolveTopLevelBlockElement(view, range.from);
  if (topLevelElement) return topLevelElement;

  return resolveBlockElementAtPos(view, range.from);
}

export function resolveSelectableBlockElement(
  view: EditorView,
  range: BlockRange,
): HTMLElement | null {
  return resolveRangeElement(view, range);
}

function collectDirectTopLevelBlockRangeKeysUncached(doc: EditorDoc): Set<string> {
  const keys = new Set<string>();
  doc.forEach((node, offset) => {
    const nodeName = node.type.name;
    if (
      isListContainerNode(nodeName) ||
      nodeName === 'list_item' ||
      nodeName === 'image' ||
      isStandaloneImageParagraphNode(node)
    ) {
      return;
    }

    keys.add(getRangeCacheKey(offset, offset + node.nodeSize));
  });
  return keys;
}

function collectDirectTopLevelBlockRangeKeys(doc: EditorDoc): Set<string> {
  const cached = directTopLevelBlockRangeKeysCache.get(doc);
  if (cached) return cached;

  const keys = collectDirectTopLevelBlockRangeKeysUncached(doc);
  directTopLevelBlockRangeKeysCache.set(doc, keys);
  return keys;
}

function resolveKnownTopLevelBlockElement(view: EditorView, blockPos: number): HTMLElement | null {
  const docSize = view.state.doc.content.size;
  const probePos = Math.max(1, Math.min(blockPos + 1, docSize));

  try {
    const domPos = view.domAtPos(probePos);
    let element = domPos.node instanceof HTMLElement ? domPos.node : domPos.node.parentElement;
    while (element && element.parentElement !== view.dom) {
      element = element.parentElement;
    }
    if (element && element.parentElement === view.dom) return element;
  } catch {
  }

  const nodeDom = view.nodeDOM(blockPos);
  if (!(nodeDom instanceof HTMLElement)) return null;

  let element: HTMLElement | null = nodeDom;
  while (element && element.parentElement !== view.dom) {
    element = element.parentElement;
  }
  return element && element.parentElement === view.dom ? element : null;
}

function resolveDirectTopLevelTarget(view: EditorView, range: BlockRange): SelectableBlockTarget | null {
  const directTopLevelRangeKeys = collectDirectTopLevelBlockRangeKeys(view.state.doc);
  if (!directTopLevelRangeKeys.has(getRangeCacheKey(range.from, range.to))) {
    return null;
  }

  const element = resolveKnownTopLevelBlockElement(view, range.from);
  if (!element || isCollapsedBlockElement(element)) return null;

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  return { range, element, rect };
}

export function resolveSelectableBlockTargetByPos(view: EditorView, blockPos: number): SelectableBlockTarget | null {
  const range = resolveSelectableBlockRange(view.state.doc, blockPos);
  if (!range) return null;

  const directTarget = resolveDirectTopLevelTarget(view, range);
  if (directTarget) return directTarget;

  const element = resolveRangeElement(view, range);
  if (!element || isCollapsedBlockElement(element)) return null;

  let subElement: HTMLElement | undefined;
  if (element.tagName === 'LI') {
    try {
      const nodeDom = view.nodeDOM(range.from);
      if (nodeDom instanceof HTMLElement && element.contains(nodeDom) && nodeDom !== element) {
        subElement = nodeDom;
      }
    } catch {
    }
  }

  const rect = resolveTargetRect(element, range, view);
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { range, element, subElement, rect };
}

export function collectSelectableBlockTargets(
  view: EditorView,
  ranges?: readonly BlockRange[],
): SelectableBlockTarget[] {
  const targetRanges = ranges
    ? mapRangesToSelectableBlocks(view.state.doc, ranges)
    : collectSelectableBlockRanges(view.state.doc);
  if (targetRanges.length === 0) return [];

  const targets: SelectableBlockTarget[] = [];
  for (const range of targetRanges) {
    const directTarget = resolveDirectTopLevelTarget(view, range);
    if (directTarget) {
      targets.push(directTarget);
      continue;
    }

    const element = resolveRangeElement(view, range);
    if (!element || isCollapsedBlockElement(element)) continue;

    let subElement: HTMLElement | undefined;
    if (element.tagName === 'LI') {
      try {
        const nodeDom = view.nodeDOM(range.from);
        if (nodeDom instanceof HTMLElement && element.contains(nodeDom) && nodeDom !== element) {
          subElement = nodeDom;
        }
      } catch {
      }
    }

    const rect = resolveTargetRect(element, range, view);
    if (rect.width <= 0 || rect.height <= 0) continue;

    targets.push({ range, element, subElement, rect });
  }
  return targets;
}
