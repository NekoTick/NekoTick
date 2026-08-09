import { describe, expect, it, vi } from 'vitest';
import {
  MAX_BLOCK_UNIT_DOM_RANGE_RECTS,
  MAX_SELECTABLE_BLOCK_RANGE_SCAN_NODES,
  MAX_SELECTABLE_BLOCK_RANGES,
  collectMovableBlockTargetRanges,
  collectSelectableBlockTargets,
  collectSelectableBlockRanges,
  mapRangesToSelectableBlocks,
  resolveDOMRangeRect,
  resolveSelectableBlockTargetByPos,
  resolveSelectableBlockRange,
  expandKnownSelectableListItemHeaderRanges,
  expandListItemHeaderRanges,
  isNonDraggableBlockRange,
} from './blockUnitResolver';

interface MockNode {
  type: { name: string };
  nodeSize: number;
  child?: (index: number) => MockNode;
  childCount?: number;
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

function createIndexedDoc(children: MockNode[]) {
  const nodeSize = 2 + children.reduce((total, node) => total + node.nodeSize, 0);
  const doc = {
    ...createNode('doc', nodeSize, children),
    ...createDoc(children),
  } as MockNode & ReturnType<typeof createDoc> & {
    child: (index: number) => MockNode;
    childCount: number;
  };
  doc.childCount = children.length;
  doc.child = vi.fn((index: number) => children[index]);
  return doc;
}

function createStructuredDoc() {
  const li1 = createNode('list_item', 8);
  const li2 = createNode('list_item', 4);
  const paragraph = createNode('paragraph', 5);
  const list = createNode('ordered_list', 14, [li1, li2]);
  const tailParagraph = createNode('paragraph', 6);
  return createDoc([paragraph, list, tailParagraph]);
}

describe('collectSelectableBlockRanges', () => {
  it('splits top-level list containers into list-item ranges', () => {
    const ranges = collectSelectableBlockRanges(createStructuredDoc() as any);
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

  it('keeps frontmatter blocks in the selectable range set', () => {
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

  it('splits top-level paragraphs at markdown hard breaks', () => {
    const paragraph = createNode('paragraph', 12, [
      createNode('text', 5),
      createNode('hardbreak', 1),
      createNode('text', 4),
    ]);
    const doc = createDoc([paragraph]);

    const ranges = collectSelectableBlockRanges(doc as any);

    expect(ranges).toEqual([
      { from: 1, to: 7 },
      { from: 7, to: 11 },
    ]);
  });

  it('also accepts legacy hard_break node names when splitting paragraph lines', () => {
    const paragraph = createNode('paragraph', 12, [
      createNode('text', 5),
      createNode('hard_break', 1),
      createNode('text', 4),
    ]);
    const doc = createDoc([paragraph]);

    expect(collectSelectableBlockRanges(doc as any)).toEqual([
      { from: 1, to: 7 },
      { from: 7, to: 11 },
    ]);
  });

  it('caps generated selectable ranges for oversized documents', () => {
    const children = Array.from(
      { length: MAX_SELECTABLE_BLOCK_RANGES + 10 },
      () => createNode('paragraph', 4),
    );
    const doc = createIndexedDoc(children);

    expect(collectSelectableBlockRanges(doc as any)).toHaveLength(MAX_SELECTABLE_BLOCK_RANGES);
    expect(doc.child).toHaveBeenCalledTimes(MAX_SELECTABLE_BLOCK_RANGES);
  });

  it('caps child scans for oversized non-selectable list containers', () => {
    const children = Array.from(
      { length: MAX_SELECTABLE_BLOCK_RANGE_SCAN_NODES + 10 },
      () => createNode('paragraph', 4),
    );
    const list = createIndexedDoc(children);
    list.type = { name: 'bullet_list' };
    list.nodeSize = 2 + children.reduce((total, child) => total + child.nodeSize, 0);
    const doc = createIndexedDoc([list]);

    expect(collectSelectableBlockRanges(doc as any)).toEqual([]);
    expect(list.child).toHaveBeenCalledTimes(MAX_SELECTABLE_BLOCK_RANGE_SCAN_NODES - 1);
  });
});

describe('resolveDOMRangeRect', () => {
  it('returns null for oversized DOM range rect lists without iterating them', () => {
    const editor = document.createElement('div');
    const rectIterator = vi.fn(() => {
      throw new Error('rects should not be iterated');
    });
    const createRangeSpy = vi.spyOn(document, 'createRange').mockReturnValue({
      setStart: vi.fn(),
      setEnd: vi.fn(),
      getClientRects: () => ({
        length: MAX_BLOCK_UNIT_DOM_RANGE_RECTS + 1,
        [Symbol.iterator]: rectIterator,
      }),
      detach: vi.fn(),
    } as unknown as Range);
    const view = {
      dom: editor,
      domAtPos: vi.fn(() => ({ node: editor, offset: 0 })),
    };

    try {
      expect(resolveDOMRangeRect(view as any, { from: 1, to: 2 })).toBeNull();
      expect(rectIterator).not.toHaveBeenCalled();
    } finally {
      createRangeSpy.mockRestore();
    }
  });

  it('combines small DOM range rect lists without materializing them', () => {
    const editor = document.createElement('div');
    const rectIterator = vi.fn(() => {
      throw new Error('rects should not be iterated');
    });
    const createRangeSpy = vi.spyOn(document, 'createRange').mockReturnValue({
      setStart: vi.fn(),
      setEnd: vi.fn(),
      getClientRects: () => ({
        0: {
          left: 10,
          top: 20,
          right: 40,
          bottom: 44,
          width: 30,
          height: 24,
        },
        1: {
          left: 8,
          top: 46,
          right: 64,
          bottom: 70,
          width: 56,
          height: 24,
        },
        length: 2,
        [Symbol.iterator]: rectIterator,
      }),
      detach: vi.fn(),
    } as unknown as Range);
    const view = {
      dom: editor,
      domAtPos: vi.fn(() => ({ node: editor, offset: 0 })),
    };

    try {
      expect(resolveDOMRangeRect(view as any, { from: 1, to: 2 })).toMatchObject({
        left: 8,
        top: 20,
        right: 64,
        bottom: 70,
        width: 56,
        height: 50,
      });
      expect(rectIterator).not.toHaveBeenCalled();
    } finally {
      createRangeSpy.mockRestore();
    }
  });
});

describe('collectSelectableBlockTargets', () => {
  function mockRect(top: number): DOMRect {
    return {
      bottom: top + 24,
      height: 24,
      left: 0,
      right: 640,
      top,
      width: 640,
      x: 0,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
  }

  it('maps ordinary top-level blocks without resolving list or image fallbacks', () => {
    const paragraph = createNode('paragraph', 5);
    const heading = createNode('heading', 7);
    const doc = {
      ...createDoc([paragraph, heading]),
      resolve: vi.fn(() => {
        throw new Error('ordinary top-level target collection should not resolve document positions');
      }),
    };
    const editor = document.createElement('div');
    const paragraphElement = document.createElement('p');
    const headingElement = document.createElement('h2');
    const paragraphText = document.createTextNode('Paragraph');
    const headingText = document.createTextNode('Heading');
    paragraphElement.append(paragraphText);
    headingElement.append(headingText);
    editor.append(paragraphElement, headingElement);
    paragraphElement.getBoundingClientRect = vi.fn(() => mockRect(10));
    headingElement.getBoundingClientRect = vi.fn(() => mockRect(40));
    const nodeDOM = vi.fn(() => {
      throw new Error('ordinary top-level target collection should not use nodeDOM fallback');
    });
    const view = {
      dom: editor,
      state: { doc },
      domAtPos: vi.fn((pos: number) => ({
        node: pos < 5 ? paragraphText : headingText,
        offset: 0,
      })),
      nodeDOM,
    };

    const targets = collectSelectableBlockTargets(view as any);

    expect(targets).toHaveLength(2);
    expect(targets.map((target) => target.element)).toEqual([paragraphElement, headingElement]);
    expect(doc.resolve).not.toHaveBeenCalled();
    expect(nodeDOM).not.toHaveBeenCalled();
    expect(paragraphElement.getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(headingElement.getBoundingClientRect).toHaveBeenCalledTimes(1);
  });

  it('uses the same fast top-level path for single position target lookup', () => {
    const paragraph = createNode('paragraph', 5);
    const doc = {
      ...createDoc([paragraph]),
      resolve: vi.fn(() => {
        throw new Error('ordinary top-level target lookup should not resolve document positions');
      }),
    };
    const editor = document.createElement('div');
    const paragraphElement = document.createElement('p');
    const paragraphText = document.createTextNode('Paragraph');
    paragraphElement.append(paragraphText);
    editor.append(paragraphElement);
    paragraphElement.getBoundingClientRect = vi.fn(() => mockRect(10));
    const nodeDOM = vi.fn(() => {
      throw new Error('ordinary top-level target lookup should not use nodeDOM fallback');
    });
    const view = {
      dom: editor,
      state: { doc },
      domAtPos: vi.fn(() => ({
        node: paragraphText,
        offset: 0,
      })),
      nodeDOM,
    };

    const target = resolveSelectableBlockTargetByPos(view as any, 2);

    expect(target?.element).toBe(paragraphElement);
    expect(doc.resolve).not.toHaveBeenCalled();
    expect(nodeDOM).not.toHaveBeenCalled();
    expect(paragraphElement.getBoundingClientRect).toHaveBeenCalledTimes(1);
  });

  it('does not measure collapsed top-level blocks', () => {
    const collapsedParagraph = createNode('paragraph', 5);
    const visibleParagraph = createNode('paragraph', 5);
    const doc = createDoc([collapsedParagraph, visibleParagraph]);
    const editor = document.createElement('div');
    const collapsedElement = document.createElement('p');
    const visibleElement = document.createElement('p');
    const collapsedText = document.createTextNode('Collapsed');
    const visibleText = document.createTextNode('Visible');
    collapsedElement.className = 'heading-collapsed-content';
    collapsedElement.append(collapsedText);
    visibleElement.append(visibleText);
    editor.append(collapsedElement, visibleElement);
    collapsedElement.getBoundingClientRect = vi.fn(() => {
      throw new Error('Collapsed blocks should not be measured');
    });
    visibleElement.getBoundingClientRect = vi.fn(() => mockRect(10));
    const view = {
      dom: editor,
      state: { doc },
      domAtPos: vi.fn((pos: number) => ({
        node: pos < 5 ? collapsedText : visibleText,
        offset: 0,
      })),
      nodeDOM: vi.fn(),
    };

    const targets = collectSelectableBlockTargets(view as any);

    expect(targets.map((target) => target.element)).toEqual([visibleElement]);
    expect(collapsedElement.getBoundingClientRect).not.toHaveBeenCalled();
    expect(visibleElement.getBoundingClientRect).toHaveBeenCalledTimes(1);
  });
});

describe('collectMovableBlockTargetRanges', () => {
  it('uses the whole paragraph as the movable target for hard-break paragraph lines', () => {
    const paragraph = createNode('paragraph', 12, [
      createNode('text', 5),
      createNode('hardbreak', 1),
      createNode('text', 4),
    ]);
    const tail = createNode('paragraph', 5);
    const doc = createDoc([paragraph, tail]);

    expect(collectMovableBlockTargetRanges(doc as any)).toEqual([
      { from: 0, to: 12 },
      { from: 12, to: 17 },
    ]);
  });
});

describe('resolveSelectableBlockRange', () => {
  it('maps document positions to the nearest selectable block range', () => {
    const doc = createStructuredDoc() as any;
    expect(resolveSelectableBlockRange(doc, 0)).toEqual({ from: 0, to: 5 });
    expect(resolveSelectableBlockRange(doc, 5)).toEqual({ from: 6, to: 14 });
    expect(resolveSelectableBlockRange(doc, 12)).toEqual({ from: 6, to: 14 });
    expect(resolveSelectableBlockRange(doc, 14)).toEqual({ from: 14, to: 18 });
    expect(resolveSelectableBlockRange(doc, 99)).toEqual({ from: 19, to: 25 });
  });

  it('returns the frontmatter range for positions inside frontmatter blocks', () => {
    const doc = createDoc([
      createNode('frontmatter', 5),
      createNode('paragraph', 4),
    ]) as any;

    expect(resolveSelectableBlockRange(doc, 0)).toEqual({ from: 0, to: 5 });
    expect(resolveSelectableBlockRange(doc, 4)).toEqual({ from: 0, to: 5 });
    expect(resolveSelectableBlockRange(doc, 5)).toEqual({ from: 5, to: 9 });
  });

  it('maps positions inside hard-break paragraph lines to the matching line range', () => {
    const paragraph = createNode('paragraph', 12, [
      createNode('text', 5),
      createNode('hardbreak', 1),
      createNode('text', 4),
    ]);
    const doc = createDoc([paragraph]) as any;

    expect(resolveSelectableBlockRange(doc, 0)).toEqual({ from: 1, to: 7 });
    expect(resolveSelectableBlockRange(doc, 3)).toEqual({ from: 1, to: 7 });
    expect(resolveSelectableBlockRange(doc, 7)).toEqual({ from: 7, to: 11 });
    expect(resolveSelectableBlockRange(doc, 99)).toEqual({ from: 7, to: 11 });
  });

  it('reuses selectable ranges for repeated lookups on the same immutable document', () => {
    const doc = createStructuredDoc() as any;
    const originalForEach = doc.forEach.bind(doc);
    doc.forEach = vi.fn(originalForEach);

    expect(resolveSelectableBlockRange(doc, 0)).toEqual({ from: 0, to: 5 });
    expect(resolveSelectableBlockRange(doc, 12)).toEqual({ from: 6, to: 14 });
    expect(resolveSelectableBlockRange(doc, 99)).toEqual({ from: 19, to: 25 });
    expect(doc.forEach).toHaveBeenCalledTimes(1);

    const nextDoc = createDoc([createNode('paragraph', 4), createNode('paragraph', 6)]) as any;
    const nextForEach = nextDoc.forEach.bind(nextDoc);
    nextDoc.forEach = vi.fn(nextForEach);
    expect(resolveSelectableBlockRange(nextDoc, 4)).toEqual({ from: 4, to: 10 });
    expect(nextDoc.forEach).toHaveBeenCalledTimes(1);
  });
});

describe('mapRangesToSelectableBlocks', () => {
  it('normalizes arbitrary ranges into deduplicated selectable blocks', () => {
    const mapped = mapRangesToSelectableBlocks(
      createStructuredDoc() as any,
      [
        { from: 6, to: 7 },
        { from: 12, to: 13 },
        { from: 15, to: 16 },
        { from: 15, to: 17 },
      ],
    );
    expect(mapped).toEqual([
      { from: 6, to: 14 },
      { from: 14, to: 18 },
    ]);
  });
});

// doc: bullet_list(14)[ list_item(12)[ paragraph(4), code_block(6) ] ]
// positions:
//   listFrom=0, listContentFrom=1, itemFrom=1
//   paragraph: from=2, to=6
//   code_block: from=6, to=12
//   itemEnd=13 (itemFrom+nodeSize=1+12)
// Expected ranges:
//   Range A (whole list item): { from:1, to:13 }  — to = itemFrom + node.nodeSize
//   Range B (code block alone): { from:6, to:12 }
function createListItemWithCodeBlockDoc() {
  const codeBlock = createNode('code_block', 6);
  const para = createNode('paragraph', 4);
  const listItem = createNode('list_item', 12, [para, codeBlock]);
  const list = createNode('bullet_list', 14, [listItem]);
  return createDoc([list]);
}

describe('collectSelectableBlockRanges — list_item with paragraph then code_block', () => {
  it('produces both the whole-item range and the code-block-only range', () => {
    const doc = createListItemWithCodeBlockDoc();
    const ranges = collectSelectableBlockRanges(doc as any);
    expect(ranges).toContainEqual({ from: 1, to: 13 });
    expect(ranges).toContainEqual({ from: 6, to: 12 });
  });

  it('does not produce a paragraph-only range that excludes the code block', () => {
    const doc = createListItemWithCodeBlockDoc();
    const ranges = collectSelectableBlockRanges(doc as any);
    // para-only range { from:2, to:6 } should NOT exist — hovering the para should select whole item
    expect(ranges).not.toContainEqual({ from: 2, to: 6 });
  });

  it('does not produce more than two ranges for a single list item', () => {
    const doc = createListItemWithCodeBlockDoc();
    const ranges = collectSelectableBlockRanges(doc as any);
    expect(ranges).toHaveLength(2);
  });
});

describe('collectSelectableBlockRanges — list_item with paragraph then atomic preview blocks', () => {
  it.each([
    ['math_block', 6],
    ['mermaid', 6],
  ])('produces both the whole-item range and the %s-only range', (typeName, nodeSize) => {
    const previewBlock = createNode(typeName, nodeSize);
    const para = createNode('paragraph', 4);
    const listItem = createNode('list_item', 12, [para, previewBlock]);
    const list = createNode('bullet_list', 14, [listItem]);
    const doc = createDoc([list]);

    const ranges = collectSelectableBlockRanges(doc as any);

    expect(ranges).toContainEqual({ from: 1, to: 13 });
    expect(ranges).toContainEqual({ from: 6, to: 12 });
    expect(ranges).not.toContainEqual({ from: 2, to: 6 });
  });

  it.each([
    ['math_block', 6],
    ['mermaid', 6],
  ])('returns the %s-only range when resolving a position inside the block', (typeName, nodeSize) => {
    const previewBlock = createNode(typeName, nodeSize);
    const para = createNode('paragraph', 4);
    const listItem = createNode('list_item', 12, [para, previewBlock]);
    const list = createNode('bullet_list', 14, [listItem]);
    const doc = createDoc([list]);

    expect(resolveSelectableBlockRange(doc as any, 8)).toEqual({ from: 6, to: 12 });
  });
});

describe('collectSelectableBlockRanges — list_item starting with complex preview blocks', () => {
  it.each([
    ['code_block', 6],
    ['image', 1],
    ['math_block', 1],
    ['mermaid', 1],
    ['table', 6],
    ['video', 1],
    ['toc', 1],
  ])('keeps a leading %s block independently selectable inside a list item', (typeName, nodeSize) => {
    const previewBlock = createNode(typeName, nodeSize);
    const listItem = createNode('list_item', nodeSize + 2, [previewBlock]);
    const list = createNode('bullet_list', nodeSize + 4, [listItem]);
    const doc = createDoc([list]);

    const ranges = collectSelectableBlockRanges(doc as any);

    expect(ranges).toContainEqual({ from: 2, to: 2 + nodeSize });
    expect(resolveSelectableBlockRange(doc as any, 2)).toEqual({ from: 2, to: 2 + nodeSize });
  });
});

describe('resolveSelectableBlockRange — list_item with paragraph then code_block', () => {
  it('returns the code-block-only range when pos is inside the code block', () => {
    const doc = createListItemWithCodeBlockDoc() as any;
    // pos=8 is inside code_block [6,12)
    const range = resolveSelectableBlockRange(doc, 8);
    expect(range).toEqual({ from: 6, to: 12 });
  });

  it('returns the whole-item range when pos is inside the paragraph', () => {
    const doc = createListItemWithCodeBlockDoc() as any;
    // pos=3 is inside paragraph [2,6)
    const range = resolveSelectableBlockRange(doc, 3);
    expect(range).toEqual({ from: 1, to: 13 });
  });

  it('returns the smaller (code-block) range because resolveSelectableBlockRange picks smallest', () => {
    const doc = createListItemWithCodeBlockDoc() as any;
    // pos=6 is the start of code_block — both Range A [1,12) and Range B [6,12) match
    const range = resolveSelectableBlockRange(doc, 6);
    // smallest range wins: [6,12) size=6 < [1,12) size=11
    expect(range).toEqual({ from: 6, to: 12 });
  });
});

describe('isNonDraggableBlockRange', () => {
  it('filters invalid and list item marker-only ranges', () => {
    const listItem = createNode('list_item', 8);
    const doc = {
      content: { size: 12 },
      resolve(pos: number) {
        return {
          nodeAfter: pos === 1 ? listItem : null,
        };
      },
    };

    expect(isNonDraggableBlockRange(doc as any, { from: 4, to: 4 })).toBe(true);
    expect(isNonDraggableBlockRange(doc as any, { from: 1, to: 2 })).toBe(true);
    expect(isNonDraggableBlockRange(doc as any, { from: 1, to: 9 })).toBe(false);
  });
});

describe('expandListItemHeaderRanges — list_item with paragraph then code_block', () => {
  it('does not further expand the code-block range (expansion is handled by getDraggableBlockRanges)', () => {
    const doc = createListItemWithCodeBlockDoc() as any;
    // expandListItemHeaderRanges is for expanding a list_item header to include
    // sibling children in the same list_item, not for expanding a code_block range.
    // Range B (code_block) from=6: getListItemRangeEnd checks if nodeAfter at pos=6 is list_item,
    // but it's a code_block, so returns null → no expansion → returns unchanged Range B.
    const expanded = expandListItemHeaderRanges(doc, [{ from: 6, to: 12 }]);
    expect(expanded).toEqual([{ from: 6, to: 12 }]);
  });

  it('expands known selectable list-item headers without re-resolving input ranges', () => {
    const parentWithNestedChildren = createNode('list_item', 12, [
      createNode('paragraph', 4),
      createNode('ordered_list', 6, [createNode('list_item', 4)]),
    ]);
    const ordered = createNode('ordered_list', 14, [parentWithNestedChildren]);
    const doc = {
      ...createDoc([ordered]),
      resolve(pos: number) {
        return {
          nodeAfter: pos === 1 ? parentWithNestedChildren : null,
        };
      },
    } as any;
    const selectableRanges = collectSelectableBlockRanges(doc);

    expect(expandKnownSelectableListItemHeaderRanges(
      doc,
      [{ from: 1, to: 6 }],
      selectableRanges,
    )).toEqual([
      { from: 1, to: 6 },
      { from: 7, to: 11 },
    ]);
  });
});
