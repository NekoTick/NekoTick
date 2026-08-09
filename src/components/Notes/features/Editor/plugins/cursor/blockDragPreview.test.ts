import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collectBlockDragPreviewElements,
  createBlockDragPreview,
  createBlockDragSourceMarker,
  MAX_BLOCK_DRAG_PREVIEW_CAPTURE_CONCURRENCY,
  MAX_BLOCK_DRAG_PREVIEW_DOM_SCAN_ELEMENTS,
} from './blockDragPreview';

function createNode(typeName: string, nodeSize: number, children: any[] = []) {
  return {
    type: { name: typeName },
    nodeSize,
    childCount: children.length,
    child(index: number) {
      return children[index];
    },
    forEach(cb: (child: any, offset: number) => void) {
      let offset = 0;
      for (const child of children) {
        cb(child, offset);
        offset += child.nodeSize;
      }
    },
  };
}

afterEach(() => {
  document.body.innerHTML = '';
  delete (window as any).vlainaDesktop;
});

describe('createBlockDragPreview', () => {
  it('collects drag preview elements without materializing selector results', () => {
    const root = document.createElement('div');
    root.innerHTML = '<section><span data-hit="true"></span><span></span></section>';
    const querySelectorAllSpy = vi.spyOn(root, 'querySelectorAll');
    const arrayFromSpy = vi.spyOn(Array, 'from').mockImplementation(() => {
      throw new Error('Array.from should not be used');
    });

    try {
      const collection = collectBlockDragPreviewElements(
        root,
        (element) => element.dataset.hit === 'true'
      );

      expect(collection.complete).toBe(true);
      expect(collection.elements).toHaveLength(1);
      expect(collection.elements[0]?.dataset.hit).toBe('true');
      expect(querySelectorAllSpy).not.toHaveBeenCalled();
    } finally {
      arrayFromSpy.mockRestore();
      querySelectorAllSpy.mockRestore();
    }
  });

  it('stops collecting drag preview elements at the scan budget', () => {
    const root = document.createElement('div');
    for (let index = 0; index < MAX_BLOCK_DRAG_PREVIEW_DOM_SCAN_ELEMENTS + 1; index += 1) {
      root.appendChild(document.createElement('span'));
    }

    const collection = collectBlockDragPreviewElements(root, () => true);

    expect(collection.complete).toBe(false);
    expect(collection.elements).toEqual([]);
  });

  it('marks dragged source blocks independently from preview creation', () => {
    const editorRoot = document.createElement('div');
    const block = document.createElement('p');
    block.textContent = 'Drag source';
    block.getBoundingClientRect = () => ({
      left: 80,
      top: 40,
      right: 360,
      bottom: 64,
      width: 280,
      height: 24,
      x: 80,
      y: 40,
      toJSON: () => ({}),
    } as DOMRect);
    editorRoot.appendChild(block);
    document.body.appendChild(editorRoot);

    const paragraphNode = createNode('paragraph', 10);
    const view = {
      dom: editorRoot,
      state: {
        doc: {
          content: { size: 10 },
          childCount: 1,
          child() {
            return paragraphNode;
          },
          forEach(cb: (child: any, offset: number) => void) {
            cb(paragraphNode, 0);
          },
          resolve(pos: number) {
            return {
              pos,
              depth: 0,
              nodeAfter: paragraphNode,
              node() {
                return createNode('doc', 10);
              },
              before() {
                return 0;
              },
            };
          },
        },
      },
      nodeDOM() {
        return block;
      },
    } as any;

    const marker = createBlockDragSourceMarker({
      view,
      ranges: [{ from: 1, to: 9 }],
    });

    expect(marker).not.toBeNull();
    expect(block.classList.contains('editor-block-drag-source')).toBe(true);
    expect(block.classList.contains('editor-block-drag-source-textlike')).toBe(true);

    marker?.destroy();

    expect(block.classList.contains('editor-block-drag-source')).toBe(false);
    expect(block.classList.contains('editor-block-drag-source-textlike')).toBe(false);
  });

  it('marks parent list items for dragged child marker styling without CSS child scans', () => {
    const editorRoot = document.createElement('div');
    const list = document.createElement('ul');
    const item = document.createElement('li');
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Selected child';
    paragraph.classList.add('editor-block-selected');
    item.appendChild(paragraph);
    list.appendChild(item);
    editorRoot.appendChild(list);
    document.body.appendChild(editorRoot);

    const marker = createBlockDragSourceMarker({
      view: {
        dom: editorRoot,
        state: { doc: { content: { size: 0 } } },
      } as any,
      ranges: [],
    });

    expect(marker).not.toBeNull();
    expect(paragraph.classList.contains('editor-block-drag-source')).toBe(true);
    expect(paragraph.classList.contains('editor-block-drag-source-textlike')).toBe(true);
    expect(item.classList.contains('editor-block-drag-source-parent-marker')).toBe(true);

    marker?.destroy();

    expect(paragraph.classList.contains('editor-block-drag-source')).toBe(false);
    expect(paragraph.classList.contains('editor-block-drag-source-textlike')).toBe(false);
    expect(item.classList.contains('editor-block-drag-source-parent-marker')).toBe(false);
  });

  it('marks adjacent text-like drag sources without CSS sibling scans', () => {
    const editorRoot = document.createElement('div');
    const first = document.createElement('p');
    const second = document.createElement('p');
    first.textContent = 'First';
    second.textContent = 'Second';
    first.classList.add('editor-block-selected');
    second.classList.add('editor-block-selected');
    editorRoot.append(first, second);
    document.body.appendChild(editorRoot);

    const marker = createBlockDragSourceMarker({
      view: {
        dom: editorRoot,
        state: { doc: { content: { size: 0 } } },
      } as any,
      ranges: [],
    });

    expect(marker).not.toBeNull();
    expect(first.classList.contains('editor-block-drag-source-textlike')).toBe(true);
    expect(first.classList.contains('editor-block-drag-source-has-next')).toBe(true);
    expect(second.classList.contains('editor-block-drag-source-textlike')).toBe(true);
    expect(second.classList.contains('editor-block-drag-source-has-previous')).toBe(true);

    marker?.destroy();

    expect(first.classList.contains('editor-block-drag-source-has-next')).toBe(false);
    expect(second.classList.contains('editor-block-drag-source-has-previous')).toBe(false);
  });

  it('does not mark rich child paragraphs as text-like drag sources', () => {
    const editorRoot = document.createElement('div');
    const paragraph = document.createElement('p');
    const image = document.createElement('span');
    image.className = 'image-block-container';
    paragraph.classList.add('editor-block-selected');
    paragraph.appendChild(image);
    editorRoot.appendChild(paragraph);
    document.body.appendChild(editorRoot);

    const marker = createBlockDragSourceMarker({
      view: {
        dom: editorRoot,
        state: { doc: { content: { size: 0 } } },
      } as any,
      ranges: [],
    });

    expect(marker).not.toBeNull();
    expect(paragraph.classList.contains('editor-block-drag-source')).toBe(true);
    expect(paragraph.classList.contains('editor-block-drag-source-textlike')).toBe(false);

    marker?.destroy();
  });

  it('preserves the handle-to-block gap instead of snapping under the pointer', () => {
    const editorRoot = document.createElement('div');
    const block = document.createElement('p');
    block.textContent = 'Drag me';
    editorRoot.appendChild(block);
    document.body.appendChild(editorRoot);

    const view = {
      dom: editorRoot,
      state: {
        doc: {
          content: { size: 10 },
          childCount: 1,
          child(index: number) {
            return index === 0 ? createNode('paragraph', 10) : null;
          },
          forEach(cb: (child: any, offset: number) => void) {
            cb(createNode('paragraph', 10), 0);
          },
          resolve(pos: number) {
            return {
              pos,
              depth: 0,
              nodeAfter: createNode('paragraph', 10),
              node() {
                return createNode('doc', 10);
              },
              before() {
                return 0;
              },
            };
          },
        },
      },
      nodeDOM() {
        return block;
      },
      domAtPos() {
        return { node: block.firstChild as Node };
      },
    } as any;

    const previewRect = {
      left: 0,
      top: 0,
      width: 240,
      height: 32,
      right: 240,
      bottom: 32,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this === block) {
          return {
            left: 120,
            top: 80,
            width: 240,
            height: 32,
            right: 360,
            bottom: 112,
            x: 120,
            y: 80,
            toJSON: () => ({}),
          } as DOMRect;
        }
        if (this.dataset.noEditorDragBox === 'true') {
          return previewRect as DOMRect;
        }
        return {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          right: 0,
          bottom: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

    const handleClientX = 88;
    const preview = createBlockDragPreview({
      view,
      ranges: [{ from: 0, to: 5 }],
      clientX: handleClientX,
      clientY: 96,
    });

    expect(preview).not.toBeNull();
    expect(preview?.offsetX).toBe(handleClientX - 120);
    expect(handleClientX - (preview?.offsetX ?? 0)).toBe(120);
    expect(preview?.offsetY).toBe(16);
    expect(preview?.element.style.left).toBe('0px');
    expect(preview?.element.style.top).toBe('0px');
    expect(preview?.element.style.transform).toBe('translate3d(120px, 80px, 0)');

    preview?.move(140, 120);

    expect(preview?.element.style.left).toBe('0px');
    expect(preview?.element.style.top).toBe('0px');
    expect(preview?.element.style.transform).toBe('translate3d(172px, 104px, 0)');

    preview?.destroy();
    rectSpy.mockRestore();
  });

  it('keeps very long drag previews anchored close to the pointer', () => {
    const editorRoot = document.createElement('div');
    const block = document.createElement('p');
    block.textContent = 'Very long selected block';
    editorRoot.appendChild(block);
    document.body.appendChild(editorRoot);

    const paragraphNode = createNode('paragraph', 10);
    const view = {
      dom: editorRoot,
      state: {
        doc: {
          content: { size: 10 },
          childCount: 1,
          child(index: number) {
            return index === 0 ? paragraphNode : null;
          },
          forEach(cb: (child: any, offset: number) => void) {
            cb(paragraphNode, 0);
          },
          resolve(pos: number) {
            return {
              pos,
              depth: 0,
              nodeAfter: paragraphNode,
              node() {
                return createNode('doc', 10);
              },
              before() {
                return 0;
              },
            };
          },
        },
      },
      nodeDOM() {
        return block;
      },
      domAtPos() {
        return { node: block.firstChild as Node };
      },
    } as any;

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this === block) {
          return {
            left: 120,
            top: -520,
            width: 420,
            height: 1400,
            right: 540,
            bottom: 880,
            x: 120,
            y: -520,
            toJSON: () => ({}),
          } as DOMRect;
        }
        if (this.dataset.noEditorDragBox === 'true') {
          return {
            left: 0,
            top: 0,
            width: 420,
            height: 1400,
            right: 420,
            bottom: 1400,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          } as DOMRect;
        }
        return {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          right: 0,
          bottom: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

    const pointerY = 480;
    const preview = createBlockDragPreview({
      view,
      ranges: [{ from: 0, to: 10 }],
      clientX: 140,
      clientY: pointerY,
    });

    expect(preview).not.toBeNull();
    expect(preview?.offsetY).toBe(96);
    expect(pointerY - (preview?.offsetY ?? 0)).toBe(384);

    preview?.destroy();
    rectSpy.mockRestore();
  });

  it('uses the editor width for short fit-content paragraphs', () => {
    const editorRoot = document.createElement('div');
    const block = document.createElement('p');
    block.textContent = '1';
    editorRoot.appendChild(block);
    document.body.appendChild(editorRoot);

    const view = {
      dom: editorRoot,
      state: {
        doc: {
          content: { size: 3 },
          childCount: 1,
          child(index: number) {
            return index === 0 ? createNode('paragraph', 3) : null;
          },
          forEach(cb: (child: any, offset: number) => void) {
            cb(createNode('paragraph', 3), 0);
          },
          resolve(pos: number) {
            return {
              pos,
              depth: 0,
              nodeAfter: createNode('paragraph', 3),
              node() {
                return createNode('doc', 3);
              },
              before() {
                return 0;
              },
            };
          },
        },
      },
      nodeDOM() {
        return block;
      },
      domAtPos() {
        return { node: block.firstChild as Node };
      },
    } as any;

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this === editorRoot) {
          return {
            left: 20,
            top: 20,
            width: 600,
            height: 300,
            right: 620,
            bottom: 320,
            x: 20,
            y: 20,
            toJSON: () => ({}),
          } as DOMRect;
        }
        if (this === block) {
          return {
            left: 60,
            top: 80,
            width: 10,
            height: 24,
            right: 70,
            bottom: 104,
            x: 60,
            y: 80,
            toJSON: () => ({}),
          } as DOMRect;
        }
        if (this.dataset.noEditorDragBox === 'true') {
          const width = Number.parseFloat(this.style.width || '0');
          return {
            left: 0,
            top: 0,
            width,
            height: 32,
            right: width,
            bottom: 32,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          } as DOMRect;
        }
        return {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          right: 0,
          bottom: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

    const preview = createBlockDragPreview({
      view,
      ranges: [{ from: 0, to: 3 }],
      clientX: 88,
      clientY: 96,
    });

    expect(preview).not.toBeNull();
    expect(preview?.element.style.width).toBe('600px');

    preview?.destroy();
    rectSpy.mockRestore();
  });

  it('clones only the selected hard-break line for inline line previews', () => {
    const editorRoot = document.createElement('div');
    const paragraph = document.createElement('p');
    const firstLine = document.createTextNode('A');
    const hardBreak = document.createElement('br');
    const secondLine = document.createTextNode('B');
    paragraph.append(firstLine, hardBreak, secondLine);
    editorRoot.appendChild(paragraph);
    document.body.appendChild(editorRoot);

    const paragraphNode = createNode('paragraph', 5, [
      createNode('text', 1),
      createNode('hardbreak', 1),
      createNode('text', 1),
    ]);

    const view = {
      dom: editorRoot,
      state: {
        doc: {
          content: { size: 5 },
          childCount: 1,
          child(index: number) {
            return index === 0 ? paragraphNode : null;
          },
          forEach(cb: (child: any, offset: number) => void) {
            cb(paragraphNode, 0);
          },
          resolve(pos: number) {
            return {
              pos,
              depth: 0,
              nodeAfter: paragraphNode,
              node() {
                return createNode('doc', 5);
              },
              before() {
                return 0;
              },
            };
          },
        },
      },
      nodeDOM() {
        return paragraph;
      },
      domAtPos(pos: number) {
        if (pos <= 1) return { node: firstLine, offset: 0 };
        if (pos === 2) return { node: paragraph, offset: 1 };
        if (pos === 3) return { node: secondLine, offset: 0 };
        return { node: secondLine, offset: secondLine.textContent?.length ?? 0 };
      },
    } as any;

    const rangeRect = {
      left: 120,
      top: 80,
      width: 24,
      height: 20,
      right: 144,
      bottom: 100,
      x: 120,
      y: 80,
      toJSON: () => ({}),
    };
    const previewRect = {
      left: 0,
      top: 0,
      width: 80,
      height: 24,
      right: 80,
      bottom: 24,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };

    const getClientRectsSpy = vi
      .spyOn(Range.prototype, 'getClientRects')
      .mockReturnValue([rangeRect] as any);
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this === editorRoot) {
          return {
            left: 20,
            top: 20,
            width: 600,
            height: 300,
            right: 620,
            bottom: 320,
            x: 20,
            y: 20,
            toJSON: () => ({}),
          } as DOMRect;
        }
        if (this === paragraph) {
          return {
            left: 120,
            top: 80,
            width: 600,
            height: 48,
            right: 720,
            bottom: 128,
            x: 120,
            y: 80,
            toJSON: () => ({}),
          } as DOMRect;
        }
        if (this.dataset.noEditorDragBox === 'true') return previewRect as DOMRect;
        return {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          right: 0,
          bottom: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

    const preview = createBlockDragPreview({
      view,
      ranges: [{ from: 1, to: 3 }],
      clientX: 124,
      clientY: 88,
    });

    expect(preview).not.toBeNull();
    expect(preview?.element.textContent).toBe('A');
    expect(preview?.element.style.width).toBe('80px');
    expect(paragraph.classList.contains('editor-block-drag-source')).toBe(false);

    preview?.destroy();
    getClientRectsSpy.mockRestore();
    rectSpy.mockRestore();
  });

  it('does not duplicate nested list content when parent and child ranges are both selected', () => {
    const editorRoot = document.createElement('div');
    const list = document.createElement('ol');
    const parentItem = document.createElement('li');
    const parentText = document.createElement('p');
    const nestedList = document.createElement('ol');
    const childItem = document.createElement('li');
    const childText = document.createElement('p');

    parentText.textContent = 'Parent';
    childText.textContent = 'Child';
    childItem.appendChild(childText);
    nestedList.appendChild(childItem);
    parentItem.append(parentText, nestedList);
    list.appendChild(parentItem);
    editorRoot.appendChild(list);
    document.body.appendChild(editorRoot);

    const parentRect = { left: 120, top: 80, width: 260, height: 28, right: 380, bottom: 108, x: 120, y: 80, toJSON: () => ({}) };
    const childRect = { left: 156, top: 116, width: 224, height: 24, right: 380, bottom: 140, x: 156, y: 116, toJSON: () => ({}) };
    const previewRect = { left: 0, top: 0, width: 260, height: 60, right: 260, bottom: 60, x: 0, y: 0, toJSON: () => ({}) };

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this === parentItem) return parentRect as DOMRect;
        if (this === parentText) return parentRect as DOMRect;
        if (this === childItem) return childRect as DOMRect;
        if (this === childText) return childRect as DOMRect;
        if (this.dataset.noEditorDragBox === 'true') return previewRect as DOMRect;
        return {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          right: 0,
          bottom: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

    const nestedListItemNode = createNode('list_item', 8, [createNode('paragraph', 6)]);
    const nestedListWithItemNode = createNode('ordered_list', 10, [nestedListItemNode]);
    const parentListItemNode = createNode('list_item', 22, [
      createNode('paragraph', 10),
      nestedListWithItemNode,
    ]);
    const listNode = createNode('ordered_list', 24, [parentListItemNode]);

    const view = {
      dom: editorRoot,
      state: {
        doc: {
          content: { size: 32 },
          childCount: 1,
          child(index: number) {
            return index === 0 ? listNode : null;
          },
          forEach(cb: (child: any, offset: number) => void) {
            cb(listNode, 0);
          },
          resolve(pos: number) {
            return {
              pos,
              depth: 1,
              nodeAfter: pos === 1 ? parentListItemNode : pos === 13 ? nestedListItemNode : null,
              node() {
                return listNode;
              },
              before() {
                return 0;
              },
            };
          },
        },
      },
      nodeDOM(pos: number) {
        if (pos >= 13) return childItem;
        return parentItem;
      },
      domAtPos(pos: number) {
        if (pos >= 14) return { node: childText.firstChild as Node };
        return { node: parentText.firstChild as Node };
      },
    } as any;

    const preview = createBlockDragPreview({
      view,
      ranges: [
        { from: 1, to: 13 },
        { from: 13, to: 21 },
      ],
      clientX: 88,
      clientY: 96,
    });

    expect(preview).not.toBeNull();
    expect(preview?.element.querySelectorAll('li')).toHaveLength(2);

    preview?.destroy();
    rectSpy.mockRestore();
  });

  it('wraps detached ordered list items with the original marker number', () => {
    const editorRoot = document.createElement('div');
    const list = document.createElement('ol');
    list.start = 5;
    const firstItem = document.createElement('li');
    firstItem.textContent = 'Five';
    const secondItem = document.createElement('li');
    secondItem.textContent = 'Six';
    list.append(firstItem, secondItem);
    editorRoot.appendChild(list);
    document.body.appendChild(editorRoot);

    const firstItemNode = createNode('list_item', 6);
    const secondItemNode = createNode('list_item', 6);
    const listNode = createNode('ordered_list', 14, [firstItemNode, secondItemNode]);

    const view = {
      dom: editorRoot,
      state: {
        doc: {
          content: { size: 14 },
          childCount: 1,
          child(index: number) {
            return index === 0 ? listNode : null;
          },
          forEach(cb: (child: any, offset: number) => void) {
            cb(listNode, 0);
          },
          resolve(pos: number) {
            const itemNode = pos === 7 ? secondItemNode : firstItemNode;
            return {
              pos,
              depth: 1,
              nodeAfter: itemNode,
              node() {
                return listNode;
              },
              before() {
                return 0;
              },
            };
          },
        },
      },
      nodeDOM(pos: number) {
        return pos >= 7 ? secondItem : firstItem;
      },
      domAtPos(pos: number) {
        return { node: pos >= 7 ? secondItem.firstChild as Node : firstItem.firstChild as Node };
      },
    } as any;

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this === firstItem || this === secondItem) {
          const top = this === firstItem ? 80 : 112;
          return {
            left: 120,
            top,
            width: 260,
            height: 32,
            right: 380,
            bottom: top + 32,
            x: 120,
            y: top,
            toJSON: () => ({}),
          } as DOMRect;
        }
        if (this.dataset.noEditorDragBox === 'true') {
          return {
            left: 0,
            top: 0,
            width: 260,
            height: 32,
            right: 260,
            bottom: 32,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          } as DOMRect;
        }
        return {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          right: 0,
          bottom: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

    const firstPreview = createBlockDragPreview({
      view,
      ranges: [{ from: 1, to: 7 }],
      clientX: 88,
      clientY: 96,
    });

    expect(firstPreview).not.toBeNull();
    expect(firstPreview?.element.querySelector('ol')?.getAttribute('start')).toBe('5');
    firstPreview?.destroy();

    const secondPreview = createBlockDragPreview({
      view,
      ranges: [{ from: 7, to: 13 }],
      clientX: 88,
      clientY: 128,
    });

    expect(secondPreview).not.toBeNull();
    expect(secondPreview?.element.querySelector('ol')?.getAttribute('start')).toBe('6');

    secondPreview?.destroy();
    rectSpy.mockRestore();
  });

  it('continues ordered list preview numbering after explicit item values', () => {
    const editorRoot = document.createElement('div');
    const list = document.createElement('ol');
    const firstItem = document.createElement('li');
    firstItem.value = 9;
    firstItem.textContent = 'Nine';
    const secondItem = document.createElement('li');
    secondItem.textContent = 'Ten';
    list.append(firstItem, secondItem);
    editorRoot.appendChild(list);
    document.body.appendChild(editorRoot);

    const itemNode = createNode('list_item', 6);
    const listNode = createNode('ordered_list', 14, [createNode('list_item', 6), itemNode]);
    const view = {
      dom: editorRoot,
      state: {
        doc: {
          content: { size: 14 },
          childCount: 1,
          child(index: number) {
            return index === 0 ? listNode : null;
          },
          forEach(cb: (child: any, offset: number) => void) {
            cb(listNode, 0);
          },
          resolve(pos: number) {
            return {
              pos,
              depth: 1,
              nodeAfter: itemNode,
              node() {
                return listNode;
              },
              before() {
                return 0;
              },
            };
          },
        },
      },
      nodeDOM() {
        return secondItem;
      },
      domAtPos() {
        return { node: secondItem.firstChild as Node };
      },
    } as any;

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this === secondItem) {
          return {
            left: 120,
            top: 80,
            width: 260,
            height: 32,
            right: 380,
            bottom: 112,
            x: 120,
            y: 80,
            toJSON: () => ({}),
          } as DOMRect;
        }
        if (this.dataset.noEditorDragBox === 'true') {
          return {
            left: 0,
            top: 0,
            width: 260,
            height: 32,
            right: 260,
            bottom: 32,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          } as DOMRect;
        }
        return {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          right: 0,
          bottom: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

    const preview = createBlockDragPreview({
      view,
      ranges: [{ from: 7, to: 13 }],
      clientX: 88,
      clientY: 96,
    });

    expect(preview).not.toBeNull();
    expect(preview?.element.querySelector('ol')?.getAttribute('start')).toBe('10');

    preview?.destroy();

    firstItem.setAttribute('value', '9x');
    const fallbackPreview = createBlockDragPreview({
      view,
      ranges: [{ from: 7, to: 13 }],
      clientX: 88,
      clientY: 96,
    });

    expect(fallbackPreview).not.toBeNull();
    expect(fallbackPreview?.element.querySelector('ol')?.getAttribute('start')).toBe('2');

    fallbackPreview?.destroy();
    rectSpy.mockRestore();
  });

  it('preserves bullet list wrappers in detached list item previews', () => {
    const editorRoot = document.createElement('div');
    const bulletList = document.createElement('ul');
    const bulletItem = document.createElement('li');
    bulletItem.textContent = 'Bullet';
    bulletList.appendChild(bulletItem);
    editorRoot.appendChild(bulletList);
    document.body.appendChild(editorRoot);

    const itemNode = createNode('list_item', 6);
    const listNode = createNode('bullet_list', 8, [itemNode]);
    const view = {
      dom: editorRoot,
      state: {
        doc: {
          content: { size: 16 },
          childCount: 1,
          child(index: number) {
            return index === 0 ? listNode : null;
          },
          forEach(cb: (child: any, offset: number) => void) {
            cb(listNode, 0);
          },
          resolve(pos: number) {
            return {
              pos,
              depth: 1,
              nodeAfter: itemNode,
              node() {
                return listNode;
              },
              before() {
                return 0;
              },
            };
          },
        },
      },
      nodeDOM() {
        return bulletItem;
      },
      domAtPos() {
        return { node: bulletItem.firstChild as Node };
      },
    } as any;

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this === bulletItem) {
          return {
            left: 120,
            top: 80,
            width: 260,
            height: 32,
            right: 380,
            bottom: 112,
            x: 120,
            y: 80,
            toJSON: () => ({}),
          } as DOMRect;
        }
        if (this.dataset.noEditorDragBox === 'true') {
          return {
            left: 0,
            top: 0,
            width: 260,
            height: 32,
            right: 260,
            bottom: 32,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          } as DOMRect;
        }
        return {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          right: 0,
          bottom: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

    const bulletPreview = createBlockDragPreview({
      view,
      ranges: [{ from: 1, to: 7 }],
      clientX: 88,
      clientY: 96,
    });

    expect(bulletPreview).not.toBeNull();
    expect(bulletPreview?.element.querySelector('ul > li')?.textContent).toBe('Bullet');
    bulletPreview?.destroy();
    rectSpy.mockRestore();
  });

  it('preserves task list attributes in detached list item previews', () => {
    const editorRoot = document.createElement('div');
    const taskList = document.createElement('ul');
    const taskItem = document.createElement('li');
    taskItem.dataset.itemType = 'task';
    taskItem.dataset.checked = 'true';
    taskItem.textContent = 'Task';
    taskList.appendChild(taskItem);
    editorRoot.appendChild(taskList);
    document.body.appendChild(editorRoot);

    const itemNode = createNode('list_item', 6);
    const listNode = createNode('bullet_list', 8, [itemNode]);
    const view = {
      dom: editorRoot,
      state: {
        doc: {
          content: { size: 8 },
          childCount: 1,
          child(index: number) {
            return index === 0 ? listNode : null;
          },
          forEach(cb: (child: any, offset: number) => void) {
            cb(listNode, 0);
          },
          resolve(pos: number) {
            return {
              pos,
              depth: 1,
              nodeAfter: itemNode,
              node() {
                return listNode;
              },
              before() {
                return 0;
              },
            };
          },
        },
      },
      nodeDOM() {
        return taskItem;
      },
      domAtPos() {
        return { node: taskItem.firstChild as Node };
      },
    } as any;

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this === taskItem) {
          return {
            left: 120,
            top: 80,
            width: 260,
            height: 32,
            right: 380,
            bottom: 112,
            x: 120,
            y: 80,
            toJSON: () => ({}),
          } as DOMRect;
        }
        if (this.dataset.noEditorDragBox === 'true') {
          return {
            left: 0,
            top: 0,
            width: 260,
            height: 32,
            right: 260,
            bottom: 32,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          } as DOMRect;
        }
        return {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          right: 0,
          bottom: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

    const taskPreview = createBlockDragPreview({
      view,
      ranges: [{ from: 1, to: 7 }],
      clientX: 88,
      clientY: 96,
    });

    expect(taskPreview).not.toBeNull();
    const previewTaskItem = taskPreview?.element.querySelector('ul > li[data-item-type="task"]');
    expect(previewTaskItem?.getAttribute('data-item-type')).toBe('task');
    expect(previewTaskItem?.getAttribute('data-checked')).toBe('true');

    taskPreview?.destroy();
    rectSpy.mockRestore();
  });

  it('replaces video iframes with a stable preview surface', () => {
    const editorRoot = document.createElement('div');
    const videoBlock = document.createElement('div');
    videoBlock.className = 'video-block';
    videoBlock.dataset.type = 'video';
    const iframe = document.createElement('iframe');
    iframe.src = 'https://player.bilibili.com/player.html?bvid=BV1xx411c7mD';
    videoBlock.appendChild(iframe);
    editorRoot.appendChild(videoBlock);
    document.body.appendChild(editorRoot);

    const videoNode = createNode('video', 1);
    const view = {
      dom: editorRoot,
      state: {
        doc: {
          content: { size: 2 },
          childCount: 1,
          child(index: number) {
            return index === 0 ? videoNode : null;
          },
          forEach(cb: (child: any, offset: number) => void) {
            cb(videoNode, 0);
          },
          resolve(pos: number) {
            return {
              pos,
              depth: 0,
              nodeAfter: videoNode,
              node() {
                return createNode('doc', 2);
              },
              before() {
                return 0;
              },
            };
          },
        },
      },
      nodeDOM() {
        return videoBlock;
      },
      domAtPos() {
        return { node: videoBlock };
      },
    } as any;

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this === videoBlock) {
          return {
            left: 120,
            top: 80,
            width: 560,
            height: 315,
            right: 680,
            bottom: 395,
            x: 120,
            y: 80,
            toJSON: () => ({}),
          } as DOMRect;
        }
        if (this.dataset.noEditorDragBox === 'true') {
          return {
            left: 0,
            top: 0,
            width: 560,
            height: 315,
            right: 560,
            bottom: 315,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          } as DOMRect;
        }
        return {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          right: 0,
          bottom: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

    const preview = createBlockDragPreview({
      view,
      ranges: [{ from: 0, to: 1 }],
      clientX: 140,
      clientY: 96,
    });

    expect(preview).not.toBeNull();
    expect(preview?.element.querySelector('iframe')).toBeNull();
    expect(preview?.element.querySelector('video')).toBeNull();
    expect(preview?.element.querySelector('.video-drag-preview-surface')?.textContent).toBe('');

    preview?.destroy();
    rectSpy.mockRestore();
  });

  it('replaces mermaid blocks with a stable preview surface when capture is available', async () => {
    (window as any).vlainaDesktop = {
      media: {
        capturePage: vi.fn().mockResolvedValue('data:image/png;base64,preview'),
      },
    };

    const editorRoot = document.createElement('div');
    const mermaidBlock = document.createElement('div');
    mermaidBlock.className = 'mermaid-block';
    mermaidBlock.dataset.type = 'mermaid';
    mermaidBlock.innerHTML = '<svg><text>graph TD</text></svg>';
    editorRoot.appendChild(mermaidBlock);
    document.body.appendChild(editorRoot);

    const mermaidNode = createNode('mermaid', 1);
    const view = {
      dom: editorRoot,
      state: {
        doc: {
          content: { size: 2 },
          childCount: 1,
          child(index: number) {
            return index === 0 ? mermaidNode : null;
          },
          forEach(cb: (child: any, offset: number) => void) {
            cb(mermaidNode, 0);
          },
          resolve(pos: number) {
            return {
              pos,
              depth: 0,
              nodeAfter: mermaidNode,
              node() {
                return createNode('doc', 2);
              },
              before() {
                return 0;
              },
            };
          },
        },
      },
      nodeDOM() {
        return mermaidBlock;
      },
      domAtPos() {
        return { node: mermaidBlock };
      },
    } as any;

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this === mermaidBlock) {
          return {
            left: 120,
            top: 80,
            width: 420,
            height: 240,
            right: 540,
            bottom: 320,
            x: 120,
            y: 80,
            toJSON: () => ({}),
          } as DOMRect;
        }
        if (this.dataset.noEditorDragBox === 'true') {
          return {
            left: 0,
            top: 0,
            width: 420,
            height: 240,
            right: 420,
            bottom: 240,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          } as DOMRect;
        }
        return {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          right: 0,
          bottom: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

    const preview = createBlockDragPreview({
      view,
      ranges: [{ from: 0, to: 1 }],
      clientX: 140,
      clientY: 96,
    });

    expect(preview).not.toBeNull();
    expect(preview?.element.querySelector('.mermaid-block')).toBeNull();
    expect(preview?.element.querySelector('.mermaid-drag-preview-surface')).not.toBeNull();

    await vi.waitFor(() => {
      const image = preview?.element.querySelector<HTMLImageElement>('.mermaid-drag-preview-image');
      expect(image?.src).toBe('data:image/png;base64,preview');
    });

    preview?.destroy();
    rectSpy.mockRestore();
  });

  it('limits concurrent media captures while still processing every capture job', async () => {
    const releaseCapture: Array<() => void> = [];
    let activeCaptureCount = 0;
    let maxActiveCaptureCount = 0;
    const capturePage = vi.fn(() => {
      activeCaptureCount += 1;
      maxActiveCaptureCount = Math.max(maxActiveCaptureCount, activeCaptureCount);
      return new Promise<string>((resolve) => {
        releaseCapture.push(() => {
          activeCaptureCount -= 1;
          resolve('data:image/png;base64,preview');
        });
      });
    });
    (window as any).vlainaDesktop = {
      media: { capturePage },
    };

    const editorRoot = document.createElement('div');
    const mermaidBlocks = Array.from({ length: MAX_BLOCK_DRAG_PREVIEW_CAPTURE_CONCURRENCY + 3 }, (_, index) => {
      const block = document.createElement('div');
      block.className = 'mermaid-block';
      block.dataset.type = 'mermaid';
      block.textContent = `graph ${index}`;
      editorRoot.appendChild(block);
      return block;
    });
    document.body.appendChild(editorRoot);

    const mermaidNodes = mermaidBlocks.map(() => createNode('mermaid', 1));
    const view = {
      dom: editorRoot,
      state: {
        doc: {
          content: { size: mermaidNodes.length },
          childCount: mermaidNodes.length,
          child(index: number) {
            return mermaidNodes[index] ?? null;
          },
          forEach(cb: (child: any, offset: number) => void) {
            mermaidNodes.forEach((node, offset) => cb(node, offset));
          },
          resolve(pos: number) {
            return {
              pos,
              depth: 0,
              parent: createNode('doc', mermaidNodes.length),
              nodeAfter: mermaidNodes[pos] ?? null,
              node() {
                return createNode('doc', mermaidNodes.length);
              },
              before() {
                return 0;
              },
            };
          },
        },
      },
      nodeDOM(pos: number) {
        return mermaidBlocks[pos] ?? mermaidBlocks[0];
      },
      domAtPos(pos: number) {
        return { node: editorRoot, offset: pos };
      },
    } as any;

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const blockIndex = mermaidBlocks.indexOf(this as HTMLDivElement);
        if (blockIndex >= 0) {
          const top = 80 + blockIndex * 32;
          return {
            left: 120,
            top,
            width: 420,
            height: 24,
            right: 540,
            bottom: top + 24,
            x: 120,
            y: top,
            toJSON: () => ({}),
          } as DOMRect;
        }
        if (this.dataset.noEditorDragBox === 'true') {
          return {
            left: 0,
            top: 0,
            width: 420,
            height: 160,
            right: 420,
            bottom: 160,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          } as DOMRect;
        }
        return {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          right: 0,
          bottom: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

    const preview = createBlockDragPreview({
      view,
      ranges: mermaidBlocks.map((_, index) => ({ from: index, to: index + 1 })),
      clientX: 140,
      clientY: 96,
    });

    expect(preview).not.toBeNull();
    await vi.waitFor(() => {
      expect(capturePage).toHaveBeenCalledTimes(MAX_BLOCK_DRAG_PREVIEW_CAPTURE_CONCURRENCY);
    });
    expect(maxActiveCaptureCount).toBe(MAX_BLOCK_DRAG_PREVIEW_CAPTURE_CONCURRENCY);

    while (capturePage.mock.calls.length < mermaidBlocks.length) {
      releaseCapture.shift()?.();
      await vi.waitFor(() => {
        expect(releaseCapture.length).toBeGreaterThan(0);
      });
      expect(maxActiveCaptureCount).toBe(MAX_BLOCK_DRAG_PREVIEW_CAPTURE_CONCURRENCY);
    }
    releaseCapture.splice(0).forEach((release) => release());

    await vi.waitFor(() => {
      expect(preview?.element.querySelectorAll('.mermaid-drag-preview-image')).toHaveLength(mermaidBlocks.length);
    });
    expect(capturePage).toHaveBeenCalledTimes(mermaidBlocks.length);

    preview?.destroy();
    rectSpy.mockRestore();
  });
});
