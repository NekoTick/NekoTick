import { describe, expect, it, vi } from 'vitest';

import {
  MAX_CLIPBOARD_SERIALIZATION_DEPTH,
  MAX_CLIPBOARD_SERIALIZATION_NODES,
} from './clipboardTraversalBudget';
import { serializeSelectionToClipboardText } from './selectionSerialization';

function createTextNode(text: string) {
  return {
    isText: true,
    text,
    marks: [],
    type: { name: 'text' },
  };
}

function createNode(typeName: string, children: any[] = []) {
  return {
    isText: false,
    isBlock: false,
    isTextblock: typeName === 'paragraph',
    type: { name: typeName },
    content: {
      size: children.length,
      forEach(callback: (child: any) => void) {
        children.forEach(callback);
      },
    },
  };
}

function createSlice(nodes: any[]) {
  return {
    content: {
      size: nodes.length,
      forEach(callback: (node: any) => void) {
        nodes.forEach(callback);
      },
    },
  };
}

function createDeepPlainTextSlice() {
  let node: any = createTextNode('deep');
  for (let index = 0; index <= MAX_CLIPBOARD_SERIALIZATION_DEPTH + 1; index += 1) {
    node = createNode('paragraph', [node]);
  }
  return createSlice([node]);
}

describe('selectionSerialization clipboard traversal budget', () => {
  it('skips markdown serialization for over-deep plain-text selections', () => {
    const slice = createDeepPlainTextSlice();
    const selection = {
      constructor: { name: 'TextSelection' },
      from: 1,
      to: 20,
      empty: false,
      content: () => slice,
    };
    const serializer = vi.fn(() => 'serialized fallback\n');
    const state: any = {
      selection,
      doc: {
        slice: vi.fn(() => slice),
      },
      schema: {
        topNodeType: {
          createAndFill: vi.fn(() => ({ type: 'doc' })),
        },
      },
    };

    expect(serializeSelectionToClipboardText(state, serializer)).toBe('');
    expect(serializer).not.toHaveBeenCalled();
  });

  it('serializes an over-budget full document selection in one pass', () => {
    const slice = createSlice(Array.from(
      { length: MAX_CLIPBOARD_SERIALIZATION_NODES + 1 },
      (_, index) => createTextNode(`node-${index}`),
    ));
    const selection = {
      constructor: { name: 'AllSelection' },
      from: 0,
      to: MAX_CLIPBOARD_SERIALIZATION_NODES + 1,
      empty: false,
      content: () => slice,
    };
    const doc = {
      slice: vi.fn(() => slice),
    };
    const serializer = vi.fn(() => 'first sentinel\n\nlast sentinel\n');
    const state: any = {
      selection,
      doc,
      schema: {
        topNodeType: {
          createAndFill: vi.fn(() => ({ type: 'doc' })),
        },
      },
    };

    expect(serializeSelectionToClipboardText(state, serializer)).toBe(
      'first sentinel\n\nlast sentinel',
    );
    expect(serializer).toHaveBeenCalledTimes(1);
    expect(serializer).toHaveBeenCalledWith(doc);
  });
});
