import { describe, expect, it, vi } from 'vitest';
import {
  collectSelectableBlockRanges,
  collectTextContentBounds,
  createBlockRectResolver,
  MAX_BLOCK_RECT_CONTENT_RECTS,
} from './blockRectResolver';
import {
  createBlockRectYIndex,
  resolveIntersectedBlockRangesFromYIndex,
} from './blockSelectionUtils';
import {
  clearCurrentEditorBlockPositionSnapshot,
  getCurrentEditorBlockPositionSnapshot,
  getFreshCachedEditorBlockTargets,
  setCurrentEditorBlockPositionSnapshot,
} from '../../utils/editorBlockPositionCache';

interface MockNode {
  type: { name: string };
  nodeSize: number;
  forEach: (cb: (child: MockNode, offset: number) => void) => void;
}

function createNode(typeName: string, nodeSize: number, children: MockNode[] = []): MockNode {
  return {
    type: { name: typeName },
    nodeSize,
    forEach(cb) {
      let offset = 0;
      for (const child of children) {
        cb(child, offset);
        offset += child.nodeSize;
      }
    },
  };
}

function createDoc(children: MockNode[]) {
  const size = children.reduce((total, node) => total + node.nodeSize, 0);
  return {
    content: { size },
    forEach(cb: (child: MockNode, offset: number) => void) {
      let offset = 0;
      for (const child of children) {
        cb(child, offset);
        offset += child.nodeSize;
      }
    },
  };
}

function withRect(element: HTMLElement, rect: { top: number; left: number; width: number; height: number }) {
  const result = {
    x: rect.left,
    y: rect.top,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => ({}),
  };
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => result,
  });
}

describe('collectSelectableBlockRanges', () => {
  it('splits top-level list into per-item block ranges', () => {
    const li1 = createNode('list_item', 8);
    const li2 = createNode('list_item', 4);
    const topParagraph = createNode('paragraph', 5);
    const list = createNode('bullet_list', 14, [li1, li2]);
    const tailParagraph = createNode('paragraph', 6);
    const doc = createDoc([topParagraph, list, tailParagraph]);

    const ranges = collectSelectableBlockRanges(doc as any);

    expect(ranges).toEqual([
      { from: 0, to: 5 },
      { from: 6, to: 14 },
      { from: 14, to: 18 },
      { from: 19, to: 25 },
    ]);
  });

  it('splits parent list item header from nested list items', () => {
    const parentWithNestedChildren = createNode('list_item', 12, [
      createNode('paragraph', 4),
      createNode('ordered_list', 6, [createNode('list_item', 4)]),
    ]);
    const sibling = createNode('list_item', 4);
    const ordered = createNode('ordered_list', 18, [parentWithNestedChildren, sibling]);
    const doc = createDoc([ordered]);

    const ranges = collectSelectableBlockRanges(doc as any);

    expect(ranges).toEqual([
      { from: 1, to: 6 },
      { from: 7, to: 11 },
      { from: 13, to: 17 },
    ]);
  });

  it('includes frontmatter blocks in exported selectable ranges', () => {
    const doc = createDoc([
      createNode('frontmatter', 5),
      createNode('paragraph', 4),
      createNode('paragraph', 6),
    ]);

    const ranges = collectSelectableBlockRanges(doc as any);

    expect(ranges).toEqual([
      { from: 0, to: 5 },
      { from: 5, to: 9 },
      { from: 9, to: 15 },
    ]);
  });
});

describe('hard-break caret bounds', () => {
  it('keeps inline line range boundaries as exact caret positions', () => {
    const dom = document.createElement('div');
    const paragraph = document.createElement('p');
    const firstLine = document.createTextNode('First');
    const hardBreak = document.createElement('br');
    const secondLine = document.createTextNode('Last');
    paragraph.append(firstLine, hardBreak, secondLine);
    dom.append(paragraph);
    document.body.append(dom);
    withRect(dom, { left: 20, top: 10, width: 600, height: 300 });
    withRect(paragraph, { left: 60, top: 40, width: 120, height: 48 });
    const paragraphNode = createNode('paragraph', 12, [
      createNode('text', 5),
      createNode('hardbreak', 1),
      createNode('text', 4),
    ]);
    const doc = {
      ...createDoc([paragraphNode]),
      resolve: vi.fn((pos: number) => ({
        index: () => 0,
        posAtIndex: () => 0,
        nodeBefore: pos === 7
          ? { type: { name: 'hardbreak' }, nodeSize: 1 }
          : { type: { name: 'text' }, nodeSize: 4 },
      })),
    };
    const createRangeSpy = vi.spyOn(document, 'createRange').mockImplementation(() => ({
      selectNodeContents: vi.fn(),
      setStart: vi.fn(),
      setEnd: vi.fn(),
      getClientRects: vi.fn().mockReturnValue([{
        left: 60,
        top: 40,
        right: 120,
        bottom: 64,
        width: 60,
        height: 24,
      }]),
      detach: vi.fn(),
    }) as any);
    const view = {
      dom,
      state: { doc },
      nodeDOM: vi.fn(() => paragraph),
      domAtPos: vi.fn(() => ({ node: firstLine, offset: 0 })),
    };

    const rects = createBlockRectResolver({
      view: view as any,
      scrollRootSelector: '[data-note-scroll-root="true"]',
    }).getTopLevelBlockRects();

    expect(rects).toMatchObject([
      { from: 1, to: 7, caretRange: { from: 1, to: 6 } },
      { from: 7, to: 11, caretRange: { from: 7, to: 11 } },
    ]);

    createRangeSpy.mockRestore();
    dom.remove();
  });
});

describe('createBlockRectResolver', () => {
  it('collects text content bounds without materializing DOM rect lists', () => {
    const paragraph = document.createElement('p');
    paragraph.textContent = 'alpha beta';
    const rectIterator = vi.fn(() => {
      throw new Error('rects should not be iterated');
    });
    const createRangeSpy = vi.spyOn(document, 'createRange').mockReturnValue({
      selectNodeContents: vi.fn(),
      getClientRects: () => ({
        length: 2,
        item: (index: number) => [
          {
            left: 10,
            right: 60,
            top: 20,
            bottom: 40,
            width: 50,
            height: 20,
          },
          {
            left: 12,
            right: 90,
            top: 22,
            bottom: 42,
            width: 78,
            height: 20,
          },
        ][index] as DOMRect | undefined ?? null,
        [Symbol.iterator]: rectIterator,
      }),
      detach: vi.fn(),
    } as unknown as Range);

    expect(collectTextContentBounds(paragraph)).toEqual({
      left: 10,
      right: 90,
      lineRects: [
        {
          left: 10,
          top: 20,
          right: 90,
          bottom: 42,
        },
      ],
    });
    expect(rectIterator).not.toHaveBeenCalled();

    createRangeSpy.mockRestore();
  });

  it('aborts text content bounds for oversized DOM rect lists without reading entries', () => {
    const paragraph = document.createElement('p');
    paragraph.textContent = 'alpha beta';
    const item = vi.fn(() => {
      throw new Error('rect entries should not be read');
    });
    const rectIterator = vi.fn(() => {
      throw new Error('rects should not be iterated');
    });
    const createRangeSpy = vi.spyOn(document, 'createRange').mockReturnValue({
      selectNodeContents: vi.fn(),
      getClientRects: () => ({
        length: MAX_BLOCK_RECT_CONTENT_RECTS + 1,
        item,
        [Symbol.iterator]: rectIterator,
      }),
      detach: vi.fn(),
    } as unknown as Range);

    expect(collectTextContentBounds(paragraph)).toBeNull();
    expect(item).not.toHaveBeenCalled();
    expect(rectIterator).not.toHaveBeenCalled();

    createRangeSpy.mockRestore();
  });

  it('uses editor horizontal bounds for block selection hit testing', () => {
    const dom = document.createElement('div');
    const paragraph = document.createElement('p');
    paragraph.textContent = '1';
    dom.append(paragraph);
    withRect(dom, { left: 20, top: 10, width: 600, height: 300 });
    withRect(paragraph, { left: 60, top: 40, width: 10, height: 24 });

    const doc = createDoc([createNode('paragraph', 3)]);
    const view = {
      dom,
      state: { doc },
      nodeDOM: () => paragraph,
      domAtPos: () => ({ node: paragraph.firstChild as Node }),
    };

    const resolver = createBlockRectResolver({
      view: view as any,
      scrollRootSelector: '[data-note-scroll-root="true"]',
    });

    expect(resolver.getTopLevelBlockRects()).toEqual([
      {
        from: 0,
        to: 3,
        left: 20,
        top: 40,
        right: 620,
        bottom: 64,
        contentLeft: 60,
        contentRight: 70,
        allowInsideTrailingClick: true,
      },
    ]);
  });

  it('uses live DOM rects even when the global block position snapshot is stale', () => {
    const dom = document.createElement('div');
    const paragraph = document.createElement('p');
    paragraph.textContent = '1';
    dom.append(paragraph);
    withRect(dom, { left: 20, top: 10, width: 600, height: 300 });
    withRect(paragraph, { left: 60, top: 40, width: 10, height: 24 });

    const doc = createDoc([createNode('paragraph', 3)]);
    const view = {
      dom,
      state: { doc },
      nodeDOM: () => paragraph,
      domAtPos: () => ({ node: paragraph.firstChild as Node }),
    };

    const staleRect = {
      x: 60,
      y: 120,
      left: 60,
      top: 120,
      width: 10,
      height: 24,
      right: 70,
      bottom: 144,
      toJSON: () => ({}),
    } as DOMRect;

    const blocks = [{
      from: 0,
      to: 3,
      element: paragraph,
      rect: staleRect,
      documentTop: 120,
      documentBottom: 144,
      tagName: 'P',
      headingLevel: null,
      headingId: null,
      headingText: null,
    }];

    setCurrentEditorBlockPositionSnapshot({
      version: 1,
      view: view as any,
      doc: doc as any,
      editorRoot: dom,
      scrollRoot: null,
      scrollLeft: 0,
      scrollTop: 0,
      blocks,
      blockIndex: new Map(blocks.map((block) => [`${block.from}:${block.to}`, block])),
      headings: [],
    });

    try {
      const resolver = createBlockRectResolver({
        view: view as any,
        scrollRootSelector: '[data-note-scroll-root="true"]',
      });

      expect(resolver.getTopLevelBlockRects()[0]).toMatchObject({
        from: 0,
        to: 3,
        top: 40,
        bottom: 64,
      });
    } finally {
      clearCurrentEditorBlockPositionSnapshot();
    }
  });

  it('uses fresh cached target rects for drag-selection hit testing without text-boundary measurement', () => {
    const dom = document.createElement('div');
    const paragraph = document.createElement('p');
    paragraph.textContent = '1';
    dom.append(paragraph);
    withRect(dom, { left: 20, top: 10, width: 600, height: 300 });
    withRect(paragraph, { left: 60, top: 40, width: 10, height: 24 });

    const doc = createDoc([createNode('paragraph', 3)]);
    const view = {
      dom,
      state: { doc },
      nodeDOM: () => paragraph,
      domAtPos: () => ({ node: paragraph.firstChild as Node }),
    };

    const blocks = [{
      from: 0,
      to: 3,
      element: paragraph,
      rect: paragraph.getBoundingClientRect(),
      documentTop: 40,
      documentBottom: 64,
      tagName: 'P',
      headingLevel: null,
      headingId: null,
      headingText: null,
    }];

    setCurrentEditorBlockPositionSnapshot({
      version: 1,
      view: view as any,
      doc: doc as any,
      editorRoot: dom,
      scrollRoot: null,
      scrollLeft: 0,
      scrollTop: 0,
      blocks,
      blockIndex: new Map(blocks.map((block) => [`${block.from}:${block.to}`, block])),
      headings: [],
    });

    const originalCreateRange = document.createRange;
    document.createRange = () => {
      throw new Error('drag selection rects should not measure text ranges when a fresh cache exists');
    };

    try {
      expect(getCurrentEditorBlockPositionSnapshot()).not.toBeNull();
      expect(getFreshCachedEditorBlockTargets(view as any, null)).toHaveLength(1);

      const resolver = createBlockRectResolver({
        view: view as any,
        scrollRootSelector: '[data-note-scroll-root="true"]',
      });

      expect(resolver.getSelectionBlockRects()).toEqual([
        {
          from: 0,
          to: 3,
          left: 20,
          top: 40,
          right: 620,
          bottom: 64,
          allowInsideTrailingClick: true,
        },
      ]);
    } finally {
      document.createRange = originalCreateRange;
      clearCurrentEditorBlockPositionSnapshot();
    }
  });

  it('remeasures requested preview ranges after their live height changes', () => {
    const dom = document.createElement('div');
    const paragraph = document.createElement('p');
    paragraph.textContent = '1';
    dom.append(paragraph);
    withRect(dom, { left: 20, top: 10, width: 600, height: 300 });
    withRect(paragraph, { left: 60, top: 40, width: 10, height: 24 });

    const doc = createDoc([createNode('paragraph', 3)]);
    const view = {
      dom,
      state: { doc },
      nodeDOM: () => paragraph,
      domAtPos: () => ({ node: paragraph.firstChild as Node }),
    };
    const resolver = createBlockRectResolver({
      view: view as any,
      scrollRootSelector: '[data-note-scroll-root="true"]',
    });

    withRect(paragraph, { left: 60, top: 120, width: 10, height: 80 });

    expect(resolver.getLiveSelectionBlockRects([{ from: 0, to: 3 }])).toEqual([{
      from: 0,
      to: 3,
      left: 20,
      top: 120,
      right: 620,
      bottom: 200,
      allowInsideTrailingClick: true,
    }]);
  });

  it('measures only cached blocks near a plain-click point', () => {
    const dom = document.createElement('div');
    const paragraphs = [0, 1, 2].map((index) => {
      const paragraph = document.createElement('p');
      paragraph.textContent = `paragraph-${index}`;
      dom.appendChild(paragraph);
      withRect(paragraph, { left: 60, top: 40 + index * 90, width: 120, height: 24 });
      return paragraph;
    });
    document.body.appendChild(dom);
    withRect(dom, { left: 20, top: 10, width: 600, height: 300 });

    const nodes = [0, 1, 2].map(() => createNode('paragraph', 5));
    const doc = createDoc(nodes);
    const ranges = [
      { from: 0, to: 5 },
      { from: 5, to: 10 },
      { from: 10, to: 15 },
    ];
    const blocks = ranges.map((range, index) => {
      const rect = paragraphs[index].getBoundingClientRect();
      return {
        ...range,
        element: paragraphs[index],
        rect,
        documentLeft: rect.left,
        documentRight: rect.right,
        documentTop: rect.top,
        documentBottom: rect.bottom,
        tagName: 'P',
        headingLevel: null,
        headingId: null,
        headingText: null,
      };
    });
    const view = {
      dom,
      state: { doc },
      nodeDOM: (pos: number) => paragraphs[ranges.findIndex((range) => range.from === pos)] ?? null,
      domAtPos: () => ({ node: paragraphs[1].firstChild as Node }),
    };

    setCurrentEditorBlockPositionSnapshot({
      version: 1,
      view: view as any,
      doc: doc as any,
      editorRoot: dom,
      scrollRoot: null,
      scrollLeft: 0,
      scrollTop: 0,
      blocks,
      blockIndex: new Map(blocks.map((block) => [`${block.from}:${block.to}`, block])),
      headings: [],
    });

    const measuredNodes: Node[] = [];
    const originalCreateRange = document.createRange;
    document.createRange = () => {
      let selectedNode: Node | null = null;
      return {
        selectNodeContents(node: Node) {
          selectedNode = node;
          measuredNodes.push(node);
        },
        getClientRects: () => {
          const paragraph = selectedNode?.parentElement;
          return paragraph ? [paragraph.getBoundingClientRect()] : [];
        },
        detach: () => undefined,
      } as unknown as Range;
    };

    try {
      const resolver = createBlockRectResolver({
        view: view as any,
        scrollRootSelector: '[data-note-scroll-root="true"]',
      });

      expect(resolver.getPlainClickBlockRects(540, 142)).toEqual([
        {
          from: 5,
          to: 10,
          left: 20,
          top: 130,
          right: 620,
          bottom: 154,
          contentLeft: 60,
          contentRight: 180,
          contentLineRects: [
            {
              left: 60,
              top: 130,
              right: 180,
              bottom: 154,
            },
          ],
          allowInsideTrailingClick: true,
        },
      ]);
      expect(measuredNodes).toEqual([paragraphs[1].firstChild]);
    } finally {
      document.createRange = originalCreateRange;
      clearCurrentEditorBlockPositionSnapshot();
      dom.remove();
    }
  });

  it('can bypass cached target rects for live drag-selection hit testing', () => {
    const dom = document.createElement('div');
    const paragraph = document.createElement('p');
    paragraph.textContent = '1';
    dom.append(paragraph);
    withRect(dom, { left: 20, top: 10, width: 600, height: 300 });
    withRect(paragraph, { left: 60, top: 40, width: 10, height: 24 });

    const doc = createDoc([createNode('paragraph', 3)]);
    const view = {
      dom,
      state: { doc },
      nodeDOM: () => paragraph,
      domAtPos: () => ({ node: paragraph.firstChild as Node }),
    };

    const staleRect = {
      x: 60,
      y: 120,
      left: 60,
      top: 120,
      width: 10,
      height: 24,
      right: 70,
      bottom: 144,
      toJSON: () => ({}),
    } as DOMRect;
    const blocks = [{
      from: 0,
      to: 3,
      element: paragraph,
      rect: staleRect,
      documentTop: 120,
      documentBottom: 144,
      tagName: 'P',
      headingLevel: null,
      headingId: null,
      headingText: null,
    }];

    setCurrentEditorBlockPositionSnapshot({
      version: 1,
      view: view as any,
      doc: doc as any,
      editorRoot: dom,
      scrollRoot: null,
      scrollLeft: 0,
      scrollTop: 0,
      blocks,
      blockIndex: new Map(blocks.map((block) => [`${block.from}:${block.to}`, block])),
      headings: [],
    });

    try {
      const resolver = createBlockRectResolver({
        view: view as any,
        scrollRootSelector: '[data-note-scroll-root="true"]',
        usePositionCache: false,
      });

      expect(resolver.getSelectionBlockRects()).toEqual([
        {
          from: 0,
          to: 3,
          left: 20,
          top: 40,
          right: 620,
          bottom: 64,
          allowInsideTrailingClick: true,
        },
      ]);
    } finally {
      clearCurrentEditorBlockPositionSnapshot();
    }
  });

  it('reuses cached target rects for drag-selection hit testing across scroll changes', () => {
    const scrollRoot = document.createElement('div');
    scrollRoot.setAttribute('data-note-scroll-root', 'true');
    scrollRoot.scrollTop = 20;
    withRect(scrollRoot, { left: 0, top: 10, width: 700, height: 400 });
    const dom = document.createElement('div');
    const paragraph = document.createElement('p');
    paragraph.textContent = '1';
    dom.append(paragraph);
    scrollRoot.appendChild(dom);
    document.body.appendChild(scrollRoot);
    withRect(dom, { left: 20, top: 10, width: 600, height: 300 });
    withRect(paragraph, { left: 60, top: 40, width: 10, height: 24 });

    const doc = createDoc([createNode('paragraph', 3)]);
    const view = {
      dom,
      state: { doc },
      nodeDOM: () => paragraph,
      domAtPos: () => ({ node: paragraph.firstChild as Node }),
    };

    const blocks = [{
      from: 0,
      to: 3,
      element: paragraph,
      rect: paragraph.getBoundingClientRect(),
      documentLeft: 60,
      documentRight: 70,
      documentTop: 50,
      documentBottom: 74,
      tagName: 'P',
      headingLevel: null,
      headingId: null,
      headingText: null,
    }];

    setCurrentEditorBlockPositionSnapshot({
      version: 1,
      view: view as any,
      doc: doc as any,
      editorRoot: dom,
      scrollRoot,
      scrollLeft: 0,
      scrollTop: 20,
      blocks,
      blockIndex: new Map(blocks.map((block) => [`${block.from}:${block.to}`, block])),
      headings: [],
    });

    const originalCreateRange = document.createRange;
    document.createRange = () => {
      throw new Error('drag selection rects should not measure text ranges while auto-scrolling');
    };
    Object.defineProperty(paragraph, 'getBoundingClientRect', {
      configurable: true,
      value: () => {
        throw new Error('drag selection rects should not remeasure block DOM while auto-scrolling');
      },
    });

    try {
      scrollRoot.scrollTop = 80;
      expect(getFreshCachedEditorBlockTargets(view as any, scrollRoot)?.[0]?.rect.top).toBe(-20);

      const resolver = createBlockRectResolver({
        view: view as any,
        scrollRootSelector: '[data-note-scroll-root="true"]',
      });

      expect(resolver.getSelectionBlockRects()).toEqual([
        {
          from: 0,
          to: 3,
          left: 20,
          top: -20,
          right: 620,
          bottom: 4,
          allowInsideTrailingClick: true,
        },
      ]);
    } finally {
      document.createRange = originalCreateRange;
      clearCurrentEditorBlockPositionSnapshot();
      scrollRoot.remove();
    }
  });

  it('skips live block rect scans for very large documents without cached targets', () => {
    const dom = document.createElement('div');
    document.body.appendChild(dom);
    withRect(dom, { left: 20, top: 10, width: 600, height: 300 });
    const doc = {
      childCount: 5001,
      content: { size: 5001 },
      forEach() {
        throw new Error('large documents should not be scanned for block rects');
      },
    };
    const view = {
      dom,
      state: { doc },
      nodeDOM: () => null,
      domAtPos: () => {
        throw new Error('large documents should not resolve block DOM positions');
      },
    };

    const resolver = createBlockRectResolver({
      view: view as any,
      scrollRootSelector: '[data-note-scroll-root="true"]',
    });

    expect(resolver.getTopLevelBlockRects()).toEqual([]);
    expect(resolver.getSelectionBlockRects()).toEqual([]);

    dom.remove();
  });

  it('uses list item text bounds for plain click edge detection', () => {
    const dom = document.createElement('div');
    const list = document.createElement('ul');
    const item = document.createElement('li');
    const paragraph = document.createElement('p');
    const text = document.createTextNode('short');
    paragraph.append(text);
    item.append(paragraph);
    list.append(item);
    dom.append(list);

    withRect(dom, { left: 20, top: 10, width: 600, height: 300 });
    withRect(item, { left: 60, top: 40, width: 560, height: 24 });
    withRect(paragraph, { left: 100, top: 40, width: 520, height: 24 });

    const paragraphNode = createNode('paragraph', 5);
    const listItemNode = createNode('list_item', 7, [paragraphNode]);
    const listNode = createNode('bullet_list', 9, [listItemNode]);
    const doc = {
      ...createDoc([listNode]),
      resolve(pos: number) {
        return {
          nodeAfter: pos === 1 ? listItemNode : null,
        };
      },
    };
    const originalCreateRange = document.createRange;
    document.createRange = () => ({
      selectNodeContents: () => undefined,
      getClientRects: () => [{
        x: 140,
        y: 44,
        left: 140,
        top: 44,
        width: 50,
        height: 16,
        right: 190,
        bottom: 60,
        toJSON: () => ({}),
      }],
      detach: () => undefined,
    }) as any;

    try {
      const view = {
        dom,
        state: { doc },
        nodeDOM: () => item,
        domAtPos: () => ({ node: text }),
      };

      const resolver = createBlockRectResolver({
        view: view as any,
        scrollRootSelector: '[data-note-scroll-root="true"]',
      });

      expect(resolver.getTopLevelBlockRects()).toEqual([
        {
          from: 1,
          to: 8,
          left: 20,
          top: 40,
          right: 620,
          bottom: 64,
          contentLeft: 140,
          contentRight: 190,
          contentLineRects: [
            {
              left: 140,
              top: 44,
              right: 190,
              bottom: 60,
            },
          ],
          allowInsideTrailingClick: true,
        },
      ]);
    } finally {
      document.createRange = originalCreateRange;
    }
  });

  it('selects consecutive ordered list item ranges when the drag box covers their rows', () => {
    const firstItem = createNode('list_item', 5, [createNode('paragraph', 3)]);
    const secondItem = createNode('list_item', 5, [createNode('paragraph', 3)]);
    const thirdItem = createNode('list_item', 5, [createNode('paragraph', 3)]);
    const orderedList = createNode('ordered_list', 17, [firstItem, secondItem, thirdItem]);
    const doc = {
      ...createDoc([orderedList]),
      resolve(pos: number) {
        return {
          nodeAfter:
            pos === 1 ? firstItem
              : pos === 6 ? secondItem
                : pos === 11 ? thirdItem
                  : null,
        };
      },
    };
    const dom = document.createElement('div');
    const list = document.createElement('ol');
    const items = [0, 1, 2].map((index) => {
      const item = document.createElement('li');
      const paragraph = document.createElement('p');
      paragraph.textContent = String(index + 1);
      item.append(paragraph);
      list.append(item);
      withRect(item, { left: 60, top: 40 + index * 24, width: 560, height: 20 });
      withRect(paragraph, { left: 100, top: 40 + index * 24, width: 520, height: 20 });
      return item;
    });
    dom.append(list);
    withRect(dom, { left: 20, top: 10, width: 600, height: 300 });

    const view = {
      dom,
      state: { doc },
      nodeDOM(pos: number) {
        if (pos === 1) return items[0];
        if (pos === 6) return items[1];
        if (pos === 11) return items[2];
        return null;
      },
      domAtPos(pos: number) {
        if (pos < 6) return { node: items[0].firstChild?.firstChild as Node };
        if (pos < 11) return { node: items[1].firstChild?.firstChild as Node };
        return { node: items[2].firstChild?.firstChild as Node };
      },
    };

    const resolver = createBlockRectResolver({
      view: view as any,
      scrollRootSelector: '[data-note-scroll-root="true"]',
    });
    const blockRects = resolver.getSelectionBlockRects();
    const selected = resolveIntersectedBlockRangesFromYIndex(
      createBlockRectYIndex(blockRects),
      {
        left: 0,
        right: 800,
        top: 39,
        bottom: 85,
      },
    );

    expect(blockRects.map(({ from, to }) => ({ from, to }))).toEqual([
      { from: 1, to: 6 },
      { from: 6, to: 11 },
      { from: 11, to: 16 },
    ]);
    expect(selected).toEqual([
      { from: 1, to: 6 },
      { from: 6, to: 11 },
    ]);
  });

  it('preserves wrapped list item line bounds for visual-line click detection', () => {
    const dom = document.createElement('div');
    const list = document.createElement('ul');
    const item = document.createElement('li');
    const paragraph = document.createElement('p');
    const text = document.createTextNode('wrapped text');
    paragraph.append(text);
    item.append(paragraph);
    list.append(item);
    dom.append(list);

    withRect(dom, { left: 20, top: 10, width: 600, height: 300 });
    withRect(item, { left: 60, top: 40, width: 560, height: 48 });
    withRect(paragraph, { left: 100, top: 40, width: 520, height: 48 });

    const paragraphNode = createNode('paragraph', 14);
    const listItemNode = createNode('list_item', 16, [paragraphNode]);
    const listNode = createNode('bullet_list', 18, [listItemNode]);
    const doc = {
      ...createDoc([listNode]),
      resolve(pos: number) {
        return {
          nodeAfter: pos === 1 ? listItemNode : null,
        };
      },
    };
    const originalCreateRange = document.createRange;
    document.createRange = () => ({
      selectNodeContents: () => undefined,
      getClientRects: () => [
        {
          x: 140,
          y: 44,
          left: 140,
          top: 44,
          width: 220,
          height: 16,
          right: 360,
          bottom: 60,
          toJSON: () => ({}),
        },
        {
          x: 140,
          y: 68,
          left: 140,
          top: 68,
          width: 80,
          height: 16,
          right: 220,
          bottom: 84,
          toJSON: () => ({}),
        },
      ],
      detach: () => undefined,
    }) as any;

    try {
      const view = {
        dom,
        state: { doc },
        nodeDOM: () => item,
        domAtPos: () => ({ node: text }),
      };

      const resolver = createBlockRectResolver({
        view: view as any,
        scrollRootSelector: '[data-note-scroll-root="true"]',
      });

      expect(resolver.getTopLevelBlockRects()[0]).toMatchObject({
        from: 1,
        to: 17,
        contentLeft: 140,
        contentRight: 360,
        contentLineRects: [
          { left: 140, top: 44, right: 360, bottom: 60 },
          { left: 140, top: 68, right: 220, bottom: 84 },
        ],
      });
    } finally {
      document.createRange = originalCreateRange;
    }
  });

  it('includes footnote reference chips in paragraph trailing click bounds', () => {
    const dom = document.createElement('div');
    const paragraph = document.createElement('p');
    const text = document.createTextNode('Text');
    const footnote = document.createElement('sup');
    const footnoteLabel = document.createElement('span');
    footnote.className = 'footnote-ref';
    footnote.setAttribute('contenteditable', 'false');
    footnoteLabel.className = 'footnote-ref-label';
    footnoteLabel.setAttribute('contenteditable', 'false');
    footnoteLabel.textContent = '[1]';
    footnote.append(footnoteLabel);
    paragraph.append(text, footnote);
    dom.append(paragraph);

    withRect(dom, { left: 20, top: 10, width: 600, height: 300 });
    withRect(paragraph, { left: 60, top: 40, width: 120, height: 24 });

    const doc = createDoc([createNode('paragraph', 4)]);
    const originalCreateRange = document.createRange;
    let selectedNode: Node | null = null;
    document.createRange = () => ({
      selectNodeContents: (node: Node) => {
        selectedNode = node;
      },
      getClientRects: () => {
        if (selectedNode === text) {
          return [{
            x: 60,
            y: 44,
            left: 60,
            top: 44,
            width: 36,
            height: 16,
            right: 96,
            bottom: 60,
            toJSON: () => ({}),
          }];
        }
        return [{
          x: 100,
          y: 36,
          left: 100,
          top: 36,
          width: 28,
          height: 12,
          right: 128,
          bottom: 48,
          toJSON: () => ({}),
        }];
      },
      detach: () => undefined,
    }) as any;

    try {
      const view = {
        dom,
        state: { doc },
        nodeDOM: () => paragraph,
        domAtPos: () => ({ node: text }),
      };

      const resolver = createBlockRectResolver({
        view: view as any,
        scrollRootSelector: '[data-note-scroll-root="true"]',
      });

      expect(resolver.getTopLevelBlockRects()).toEqual([
        {
          from: 0,
          to: 4,
          left: 20,
          top: 40,
          right: 620,
          bottom: 64,
          contentLeft: 60,
          contentRight: 128,
          contentLineRects: [
            {
              left: 60,
              top: 36,
              right: 128,
              bottom: 60,
            },
          ],
          allowInsideTrailingClick: true,
        },
      ]);
    } finally {
      document.createRange = originalCreateRange;
    }
  });
});
