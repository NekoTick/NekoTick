import { Schema } from '@milkdown/kit/prose/model';
import { describe, expect, it } from 'vitest';
import { estimateNativeVirtualizedBlockHeight } from './virtualizedBlockHeight';

function createSchema() {
  return new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { content: 'inline*', group: 'block' },
      text: { group: 'inline' },
    },
    marks: {
      strong: {},
    },
  });
}

function createMetrics(native = true) {
  const editor = document.createElement('div');
  const root = document.createElement('div');
  root.dataset.markdownCompatLayer = native ? 'native' : 'external';
  root.append(editor);
  return {
    availableWidth: 80,
    editor,
    font: 'normal 400 16px sans-serif',
    letterSpacing: 0,
    lineHeight: 24,
    whiteSpace: 'normal',
    wordBreak: 'normal',
  };
}

describe('virtualized block height', () => {
  it('measures plain native paragraphs at the current width', () => {
    const schema = createSchema();
    const paragraph = schema.nodes.paragraph.create(
      null,
      schema.text('A paragraph long enough to wrap across several lines.'),
    );

    expect(estimateNativeVirtualizedBlockHeight(paragraph, createMetrics()))
      .toBeGreaterThan(24);
  });

  it('uses the fallback for marked text and external themes', () => {
    const schema = createSchema();
    const marked = schema.nodes.paragraph.create(
      null,
      schema.text('Strong', [schema.marks.strong.create()]),
    );
    const plain = schema.nodes.paragraph.create(null, schema.text('Plain'));

    expect(estimateNativeVirtualizedBlockHeight(marked, createMetrics())).toBeNull();
    expect(estimateNativeVirtualizedBlockHeight(plain, createMetrics(false))).toBeNull();
  });
});
