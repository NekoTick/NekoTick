import { describe, expect, it } from 'vitest';
import {
  collectTocBlocks,
  countTocNodes,
  docHasTocNode,
  MAX_TOC_DOC_SCAN_NODES,
  scanTocNodes,
  stepSliceContainsToc,
} from './tocScan';

function createScanNode(name: string, children: any[] = []) {
  return {
    type: { name },
    childCount: children.length,
    child: (index: number) => children[index],
  };
}

describe('tocScan', () => {
  it('collects TOC blocks without scanning past the DOM budget', () => {
    const root = document.createElement('div');
    for (let index = 0; index < 6; index += 1) {
      const block = document.createElement('div');
      block.className = 'toc-block';
      block.dataset.index = String(index);
      root.append(block);
    }

    const blocks = collectTocBlocks(root, 10, 3);

    expect(blocks).toHaveLength(3);
    expect(blocks.map((block) => block.dataset.index)).toEqual(['0', '1', '2']);
  });

  it('stops document node scans once a TOC node is found', () => {
    const doc = createScanNode('doc', [
      createScanNode('paragraph'),
      createScanNode('toc'),
      createScanNode('paragraph'),
    ]);

    expect(scanTocNodes(doc, 10)).toEqual({ found: true, exhausted: false });
  });

  it('treats exhausted document scans as possibly containing TOC nodes', () => {
    const doc = createScanNode('doc', [
      createScanNode('paragraph'),
      createScanNode('paragraph'),
      createScanNode('paragraph'),
    ]);

    const oversizedContent = createScanNode(
      'doc',
      Array.from({ length: MAX_TOC_DOC_SCAN_NODES + 1 }, () => createScanNode('paragraph'))
    );

    expect(scanTocNodes(doc, 2)).toEqual({ found: false, exhausted: true });
    expect(docHasTocNode(doc, 2)).toBe(true);
    expect(stepSliceContainsToc({ slice: { content: oversizedContent } })).toBe(true);
  });

  it('counts TOC nodes without touching the DOM', () => {
    const doc = createScanNode('doc', [
      createScanNode('toc'),
      createScanNode('paragraph', [createScanNode('toc')]),
    ]);

    expect(countTocNodes(doc)).toBe(2);
    expect(countTocNodes(doc, 1)).toBe(2);
  });
});
