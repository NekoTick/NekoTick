import { scanProseDescendants } from '../shared/boundedProseNodeScan';

export const MAX_TOC_DOM_SCAN_ELEMENTS = 20_000;
export const MAX_TOC_DOC_SCAN_NODES = 20_000;

interface TocScanNode {
  type?: { name?: string };
  childCount?: number;
  child?: (index: number) => TocScanNode;
  descendants?: (callback: (node: TocScanNode) => boolean | void) => void;
}

interface TocScanResult {
  found: boolean;
  exhausted: boolean;
}

function getTocScanChildCount(node: TocScanNode): number {
  return typeof node.childCount === 'number' && Number.isFinite(node.childCount) && node.childCount > 0
    ? Math.floor(node.childCount)
    : 0;
}

export function collectTocBlocks(
  root: HTMLElement,
  maxMatches = Number.POSITIVE_INFINITY,
  maxScanned = MAX_TOC_DOM_SCAN_ELEMENTS
): HTMLElement[] {
  const blocks: HTMLElement[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, 1);
  let scanned = 0;
  let node = walker.nextNode();

  while (node) {
    if (node instanceof HTMLElement) {
      scanned += 1;
      if (scanned > maxScanned) break;
      if (node.classList.contains('toc-block')) {
        blocks.push(node);
        if (blocks.length >= maxMatches) break;
      }
    }
    node = walker.nextNode();
  }

  return blocks;
}

export function scanTocNodes(root: TocScanNode, maxNodes = MAX_TOC_DOC_SCAN_NODES): TocScanResult {
  if (typeof root.child === 'function') {
    let scanned = 0;
    const stack: Array<{ node: TocScanNode; index: number; childCount: number }> = [{
      node: root,
      index: 0,
      childCount: getTocScanChildCount(root),
    }];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (frame.index >= frame.childCount) {
        stack.pop();
        continue;
      }

      if (scanned >= maxNodes) {
        return { found: false, exhausted: true };
      }

      const nextNode = frame.node.child?.(frame.index);
      frame.index += 1;
      if (!nextNode) continue;

      scanned += 1;
      if (nextNode.type?.name === 'toc') {
        return { found: true, exhausted: false };
      }

      const nextChildCount = getTocScanChildCount(nextNode);
      if (nextChildCount > 0 && typeof nextNode.child === 'function') {
        stack.push({ node: nextNode, index: 0, childCount: nextChildCount });
      }
    }

    return { found: false, exhausted: false };
  }

  let found = false;
  let exhausted = false;
  let scanned = 0;
  root.descendants?.((node) => {
    if (found || exhausted) return false;
    scanned += 1;
    if (scanned > maxNodes) {
      exhausted = true;
      return false;
    }
    if (node.type?.name === 'toc') {
      found = true;
      return false;
    }
    return true;
  });

  return { found, exhausted };
}

export function docHasTocNode(doc: TocScanNode, maxNodes = MAX_TOC_DOC_SCAN_NODES): boolean {
  const result = scanTocNodes(doc, maxNodes);
  return result.found || result.exhausted;
}

export function countTocNodes(doc: TocScanNode, maxNodes = MAX_TOC_DOC_SCAN_NODES): number {
  let count = 0;
  const completed = scanProseDescendants(doc, (node) => {
    if (node.type?.name === 'toc') count += 1;
    return true;
  }, maxNodes);
  return completed ? count : maxNodes + 1;
}

export function stepSliceContainsToc(step: unknown): boolean {
  const content = (step as {
    slice?: {
      content?: TocScanNode;
    };
  }).slice?.content;
  if (!content || (typeof content.child !== 'function' && typeof content.descendants !== 'function')) {
    return false;
  }

  const result = scanTocNodes(content);
  return result.found || result.exhausted;
}
