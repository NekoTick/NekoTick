export const MAX_BLOCK_RECT_CONTENT_TEXT_NODES = 512;
export const MAX_BLOCK_RECT_CONTENT_RECTS = 1024;
export const MAX_BLOCK_RECT_CONTENT_LINES = 256;
export const MAX_BLOCK_RECT_LIST_CONTENT_CHILDREN = 1024;

interface ContentLineRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function shouldIgnoreContentBoundsElement(root: HTMLElement, element: Element): boolean {
  for (let current: Element | null = element; current && root.contains(current); current = current.parentElement) {
    if (current.matches('ul, ol, button, .editor-collapse-btn')) return true;
    if (current.matches('[contenteditable="false"]') && !current.closest('.footnote-ref')) return true;
  }
  return false;
}

function appendContentLineRect(lines: ContentLineRect[], rect: DOMRect): boolean {
  const centerY = rect.top + rect.height / 2;
  const line = lines.find((candidate) => (
    centerY >= candidate.top - 2 && centerY <= candidate.bottom + 2
  ));
  if (line) {
    line.left = Math.min(line.left, rect.left);
    line.top = Math.min(line.top, rect.top);
    line.right = Math.max(line.right, rect.right);
    line.bottom = Math.max(line.bottom, rect.bottom);
    return true;
  }

  if (lines.length >= MAX_BLOCK_RECT_CONTENT_LINES) return false;

  lines.push({
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  });
  return true;
}

export function collectTextContentBounds(root: HTMLElement): {
  left: number;
  right: number;
  lineRects?: ContentLineRect[];
} | null {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (shouldIgnoreContentBoundsElement(root, parent)) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.textContent && node.textContent.length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let hasBounds = false;
  let textNodeCount = 0;
  let rectCount = 0;
  const lineRects: ContentLineRect[] = [];

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    textNodeCount += 1;
    if (textNodeCount > MAX_BLOCK_RECT_CONTENT_TEXT_NODES) return null;

    const range = doc.createRange();
    try {
      range.selectNodeContents(node);
      const rects = range.getClientRects();
      if (rects.length > MAX_BLOCK_RECT_CONTENT_RECTS - rectCount) return null;

      for (let index = 0; index < rects.length; index += 1) {
        const rect = rects.item?.(index) ?? rects[index];
        if (!rect || (rect.width <= 0 && rect.height <= 0)) continue;
        rectCount += 1;
        left = Math.min(left, rect.left);
        right = Math.max(right, rect.right);
        if (!appendContentLineRect(lineRects, rect)) return null;
        hasBounds = true;
      }
    } finally {
      range.detach();
    }
  }

  if (!hasBounds) return null;

  return {
    left,
    right,
    ...(lineRects.length > 0 ? { lineRects } : {}),
  };
}

function resolveContentBoundsElement(element: HTMLElement): HTMLElement {
  if (element.tagName !== 'LI') return element;

  const childCount = Math.min(element.children.length, MAX_BLOCK_RECT_LIST_CONTENT_CHILDREN);
  for (let index = 0; index < childCount; index += 1) {
    const child = element.children.item(index);
    if (!(child instanceof HTMLElement)) continue;
    if (shouldIgnoreContentBoundsElement(element, child)) continue;
    return child;
  }

  return element;
}

export function resolveContentHorizontalBounds(
  element: HTMLElement,
  rect: DOMRect,
): { left: number; right: number; lineRects?: ContentLineRect[] } {
  const contentElement = resolveContentBoundsElement(element);
  return collectTextContentBounds(contentElement) ?? {
    left: rect.left,
    right: rect.right,
  };
}
