import { describe, expect, it } from 'vitest';
import {
  collectDocumentHeadingMetadata,
  collectDocumentHeadingPositions,
} from './editorHeadingPositionCollection';
import { MAX_BLOCK_POSITION_SNAPSHOT_BLOCKS } from './editorBlockPositionConstants';

function rect(top: number, bottom: number, width = 320): DOMRect {
  return {
    bottom,
    height: bottom - top,
    left: 0,
    right: width,
    top,
    width,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function headingNode(level: number, text: string) {
  return {
    attrs: { level },
    child: () => ({ marks: [], text }),
    childCount: 1,
    nodeSize: text.length + 2,
    type: { name: 'heading' },
  };
}

describe('collectDocumentHeadingPositions', () => {
  it('stops traversing once the heading limit is reached', () => {
    const node = headingNode(2, 'Bounded heading');
    let visited = 0;
    const doc = {
      descendants(callback: (child: typeof node, pos: number) => void) {
        for (let index = 0; index < MAX_BLOCK_POSITION_SNAPSHOT_BLOCKS + 100; index += 1) {
          visited += 1;
          callback(node, index * node.nodeSize);
        }
      },
    };

    expect(collectDocumentHeadingMetadata(doc)).toHaveLength(MAX_BLOCK_POSITION_SNAPSHOT_BLOCKS);
    expect(visited).toBe(MAX_BLOCK_POSITION_SNAPSHOT_BLOCKS);
  });

  it('keeps virtualized headings represented by a top-level placeholder', () => {
    const dom = document.createElement('div');
    const placeholder = document.createElement('div');
    placeholder.className = 'editor-virtual-block-placeholder';
    placeholder.getBoundingClientRect = () => rect(240, 280);
    dom.append(placeholder);
    document.body.append(dom);
    const node = headingNode(3, 'Deferred heading');
    const doc = {
      descendants(callback: (child: typeof node, pos: number) => void) {
        callback(node, 25);
      },
      resolve(pos: number) {
        return pos === 25 ? { before: () => 20, depth: 1 } : { depth: 0 };
      },
    };
    const view = {
      dom,
      nodeDOM: (pos: number) => pos === 20 ? placeholder : null,
      state: { doc },
    };

    expect(collectDocumentHeadingPositions(view as any, 40, 100)).toEqual([
      expect.objectContaining({
        element: placeholder,
        from: 25,
        hasExactGeometry: false,
        level: 3,
        text: 'Deferred heading',
        top: 300,
      }),
    ]);
    dom.remove();
  });

  it('keeps collapsed headings without treating zero-sized DOM as exact geometry', () => {
    const dom = document.createElement('div');
    const heading = document.createElement('h2');
    heading.className = 'heading-collapsed-content';
    heading.getBoundingClientRect = () => rect(0, 0, 0);
    dom.append(heading);
    document.body.append(dom);
    const node = headingNode(2, 'Collapsed child');
    const doc = {
      descendants(callback: (child: typeof node, pos: number) => void) {
        callback(node, 12);
      },
      resolve: () => ({ depth: 0 }),
    };
    const view = { dom, nodeDOM: () => heading, state: { doc } };

    expect(collectDocumentHeadingPositions(view as any, 0, 0)).toEqual([
      expect.objectContaining({
        element: heading,
        hasExactGeometry: false,
        level: 2,
        text: 'Collapsed child',
      }),
    ]);
    dom.remove();
  });
});
