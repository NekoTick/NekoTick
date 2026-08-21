import type { EditorState } from '@milkdown/kit/prose/state';
import { describe, expect, it, vi } from 'vitest';
import {
  resolveBlockSelectionPreviewBlocks,
} from './blockSelectionPreviewLayout';

describe('resolveBlockSelectionPreviewBlocks', () => {
  it('resolves each selected display range once per document', () => {
    const selectedBlocks = Array.from({ length: 512 }, (_, index) => ({
      from: index * 3,
      to: index * 3 + 2,
    }));
    const sourceBlocks = selectedBlocks.map((range, index) => ({
      ...range,
      left: 100,
      top: index * 24,
      right: 500,
      bottom: index * 24 + 20,
    }));
    const resolve = vi.fn((pos: number) => ({
      nodeAfter: {
        childCount: 0,
        isText: false,
        nodeSize: 2,
        type: { name: 'paragraph' },
      },
      node: () => ({ type: { name: 'doc' } }),
      depth: 0,
      pos,
    }));
    const doc = {
      content: { size: selectedBlocks.at(-1)?.to ?? 0 },
      nodesBetween() {},
      resolve,
    } as unknown as EditorState['doc'];

    resolveBlockSelectionPreviewBlocks(doc, selectedBlocks, sourceBlocks);
    expect(resolve).toHaveBeenCalledTimes(selectedBlocks.length);

    resolveBlockSelectionPreviewBlocks(doc, selectedBlocks, sourceBlocks);
    expect(resolve).toHaveBeenCalledTimes(selectedBlocks.length);
  });

  it('uses unselected nested geometry when a list-item header expands for display', () => {
    const listItem = {
      isText: false,
      nodeSize: 19,
      type: { name: 'list_item' },
    };
    const nestedItem = {
      isText: false,
      nodeSize: 5,
      type: { name: 'list_item' },
    };
    const doc = {
      content: { size: 30 },
      resolve(pos: number) {
        return {
          nodeAfter: pos === 1 ? listItem : pos === 8 ? nestedItem : null,
        };
      },
    } as unknown as EditorState['doc'];

    expect(resolveBlockSelectionPreviewBlocks(
      doc,
      [{ from: 1, to: 6 }],
      [{ from: 1, to: 6, left: 100, top: 80, right: 500, bottom: 104 }],
      [
        { from: 1, to: 6, left: 100, top: 80, right: 500, bottom: 104 },
        { from: 8, to: 13, left: 100, top: 112, right: 500, bottom: 136 },
      ],
    )).toEqual([
      { from: 1, to: 20, left: 100, top: 80, right: 500, bottom: 136 },
    ]);
  });

  it('keeps selected full-item geometry when cached blocks only contain child ranges', () => {
    const listItem = {
      isText: false,
      nodeSize: 19,
      type: { name: 'list_item' },
    };
    const nestedItem = {
      isText: false,
      nodeSize: 5,
      type: { name: 'list_item' },
    };
    const doc = {
      content: { size: 30 },
      resolve(pos: number) {
        return {
          nodeAfter: pos === 1 ? listItem : pos === 8 ? nestedItem : null,
        };
      },
    } as unknown as EditorState['doc'];

    expect(resolveBlockSelectionPreviewBlocks(
      doc,
      [{ from: 1, to: 20 }],
      [{ from: 1, to: 20, left: 100, top: 80, right: 500, bottom: 180 }],
      [{ from: 8, to: 13, left: 100, top: 112, right: 500, bottom: 136 }],
    )).toEqual([
      { from: 1, to: 20, left: 100, top: 80, right: 500, bottom: 180 },
    ]);
  });

  it('uses the full applied list item range for a selected header and nested child', () => {
    const listItem = {
      isText: false,
      nodeSize: 19,
      type: { name: 'list_item' },
    };
    const nestedItem = {
      isText: false,
      nodeSize: 5,
      type: { name: 'list_item' },
    };
    const doc = {
      content: { size: 30 },
      resolve(pos: number) {
        return {
          nodeAfter: pos === 1 ? listItem : pos === 8 ? nestedItem : null,
        };
      },
    } as unknown as EditorState['doc'];

    expect(resolveBlockSelectionPreviewBlocks(
      doc,
      [
        { from: 1, to: 6 },
        { from: 8, to: 13 },
      ],
      [
        { from: 1, to: 6, left: 100, top: 80, right: 500, bottom: 104 },
        { from: 8, to: 13, left: 100, top: 112, right: 500, bottom: 136 },
      ],
    )).toEqual([
      { from: 1, to: 20, left: 100, top: 80, right: 500, bottom: 136 },
    ]);
  });

  it('merges selected child geometry when the full list item is already selectable', () => {
    const listItem = {
      isText: false,
      nodeSize: 19,
      type: { name: 'list_item' },
    };
    const codeBlock = {
      isText: false,
      nodeSize: 5,
      type: { name: 'code_block' },
    };
    const doc = {
      content: { size: 30 },
      resolve(pos: number) {
        return {
          nodeAfter: pos === 1 ? listItem : pos === 8 ? codeBlock : null,
        };
      },
    } as unknown as EditorState['doc'];

    expect(resolveBlockSelectionPreviewBlocks(
      doc,
      [
        { from: 1, to: 20 },
        { from: 8, to: 13 },
      ],
      [
        { from: 1, to: 20, left: 100, top: 80, right: 500, bottom: 104 },
        { from: 8, to: 13, left: 100, top: 112, right: 500, bottom: 180 },
      ],
    )).toEqual([
      { from: 1, to: 20, left: 100, top: 80, right: 500, bottom: 180 },
    ]);
  });

  it('keeps standalone image geometry when the applied range targets the image node', () => {
    const image = {
      isText: false,
      nodeSize: 1,
      type: { name: 'image' },
    };
    const paragraph = {
      childCount: 1,
      firstChild: image,
      isText: false,
      nodeSize: 3,
      type: { name: 'paragraph' },
    };
    const doc = {
      content: { size: 3 },
      resolve() {
        return { nodeAfter: paragraph };
      },
    } as unknown as EditorState['doc'];

    expect(resolveBlockSelectionPreviewBlocks(
      doc,
      [{ from: 0, to: 3 }],
      [{ from: 0, to: 3, left: 100, top: 80, right: 500, bottom: 180 }],
    )).toEqual([
      { from: 1, to: 2, left: 100, top: 80, right: 500, bottom: 180 },
    ]);
  });
});
