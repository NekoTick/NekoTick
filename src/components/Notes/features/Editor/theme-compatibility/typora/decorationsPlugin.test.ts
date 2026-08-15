import { describe, expect, it, vi } from 'vitest';
import * as ProseModel from '@milkdown/kit/prose/model';
import {
  MAX_THEME_COMPATIBILITY_LIVE_MAP_DECORATIONS,
  MAX_THEME_COMPATIBILITY_DECORATIONS,
  applyThemeCompatibilityDecorationsState,
  buildCompatibilityDecorations,
  createThemeCompatibilityDecorationRebuildController,
  docChangeMayAffectThemeCompatibilityDecorations,
  listContainsTaskItems,
  transactionMayAffectThemeCompatibilityDecorations,
} from './decorationsPlugin';
import {
  MAX_THEME_COMPAT_TEXT_CONTENT_CHARS,
  getTextContent,
} from './decorations/typoraTextSemantics/runs';

const SchemaCtor = (ProseModel as any).Schema;
const schema = new SchemaCtor({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'text*',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    code_block: {
      group: 'block',
      content: 'text*',
      code: true,
      isolating: true,
      marks: '',
      attrs: {
        language: { default: null },
      },
      toDOM: () => ['pre', ['code', 0]],
      parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
    },
    frontmatter: {
      group: 'block',
      content: 'text*',
      code: true,
      isolating: true,
      marks: '',
      toDOM: () => ['div', { 'data-type': 'frontmatter' }, 0],
      parseDOM: [{ tag: 'div[data-type="frontmatter"]', preserveWhitespace: 'full' }],
    },
    math_block: {
      group: 'block',
      content: 'text*',
      code: true,
      isolating: true,
      marks: '',
      toDOM: () => ['div', { 'data-type': 'math-block' }, 0],
      parseDOM: [{ tag: 'div[data-type="math-block"]', preserveWhitespace: 'full' }],
    },
    mermaid: {
      group: 'block',
      content: 'text*',
      code: true,
      isolating: true,
      marks: '',
      toDOM: () => ['div', { 'data-type': 'mermaid' }, 0],
      parseDOM: [{ tag: 'div[data-type="mermaid"]', preserveWhitespace: 'full' }],
    },
    bullet_list: {
      group: 'block',
      content: 'list_item+',
      toDOM: () => ['ul', 0],
      parseDOM: [{ tag: 'ul' }],
    },
    list_item: {
      content: 'paragraph block*',
      attrs: {
        checked: { default: null },
      },
      toDOM: () => ['li', 0],
      parseDOM: [{ tag: 'li' }],
    },
    text: { group: 'inline' },
  },
});

function textNode(text: string) {
  return text ? schema.text(text) : undefined;
}

function paragraph(text: string) {
  return schema.nodes.paragraph.create(null, textNode(text));
}

function codeBlock(text: string) {
  return schema.nodes.code_block.create(null, textNode(text));
}

function frontmatter(text: string) {
  return schema.nodes.frontmatter.create(null, textNode(text));
}

function mathBlock(text: string) {
  return schema.nodes.math_block.create(null, textNode(text));
}

function mermaidBlock(text: string) {
  return schema.nodes.mermaid.create(null, textNode(text));
}

function topLevelNodePos(doc: any, typeName: string): number {
  let found: number | null = null;
  doc.forEach((node: any, offset: number) => {
    if (found !== null || node.type.name !== typeName) return;
    found = offset;
  });
  if (found === null) {
    throw new Error(`Expected top-level ${typeName}`);
  }
  return found;
}

function transactionWithChangedRange(
  oldFrom: number,
  oldTo: number,
  newFrom = oldFrom,
  newTo = oldTo
) {
  return {
    mapping: {
      maps: [{
        forEach(callback: (from: number, to: number, nextFrom: number, nextTo: number) => void) {
          callback(oldFrom, oldTo, newFrom, newTo);
        },
      }],
    },
  };
}

describe('docChangeMayAffectThemeCompatibilityDecorations', () => {
  it('skips code block text edits', () => {
    const oldDoc = schema.nodes.doc.create(null, [
      paragraph('Before'),
      codeBlock('const value = 1;'),
      paragraph('After'),
    ]);
    const nextDoc = schema.nodes.doc.create(null, [
      paragraph('Before'),
      codeBlock('const value = 2;'),
      paragraph('After'),
    ]);

    expect(docChangeMayAffectThemeCompatibilityDecorations(oldDoc, nextDoc)).toBe(false);
  });

  it('skips frontmatter text edits', () => {
    const oldDoc = schema.nodes.doc.create(null, [
      frontmatter('title: Old'),
      paragraph('Body'),
    ]);
    const nextDoc = schema.nodes.doc.create(null, [
      frontmatter('title: New'),
      paragraph('Body'),
    ]);

    expect(docChangeMayAffectThemeCompatibilityDecorations(oldDoc, nextDoc)).toBe(false);
  });

  it('skips math block source edits', () => {
    const oldDoc = schema.nodes.doc.create(null, [
      paragraph('Before'),
      mathBlock('\\frac{1}{2}'),
      paragraph('After'),
    ]);
    const nextDoc = schema.nodes.doc.create(null, [
      paragraph('Before'),
      mathBlock('\\frac{1}{2 + x}'),
      paragraph('After'),
    ]);

    expect(docChangeMayAffectThemeCompatibilityDecorations(oldDoc, nextDoc)).toBe(false);
  });

  it('skips Mermaid block source edits', () => {
    const oldDoc = schema.nodes.doc.create(null, [
      paragraph('Before'),
      mermaidBlock('graph TD\\nA --> B'),
      paragraph('After'),
    ]);
    const nextDoc = schema.nodes.doc.create(null, [
      paragraph('Before'),
      mermaidBlock('graph TD\\nA --> B\\nB --> C'),
      paragraph('After'),
    ]);

    expect(docChangeMayAffectThemeCompatibilityDecorations(oldDoc, nextDoc)).toBe(false);
  });

  it('rebuilds for ordinary paragraph edits', () => {
    const oldDoc = schema.nodes.doc.create(null, [
      paragraph('Caption'),
      codeBlock('const value = 1;'),
    ]);
    const nextDoc = schema.nodes.doc.create(null, [
      paragraph('Changed caption'),
      codeBlock('const value = 1;'),
    ]);

    expect(docChangeMayAffectThemeCompatibilityDecorations(oldDoc, nextDoc)).toBe(true);
  });

  it('rebuilds when safe block markup changes', () => {
    const oldDoc = schema.nodes.doc.create(null, [
      codeBlock('const value = 1;'),
    ]);
    const nextDoc = schema.nodes.doc.create(null, [
      schema.nodes.code_block.create({ language: 'ts' }, textNode('const value = 1;')),
    ]);

    expect(docChangeMayAffectThemeCompatibilityDecorations(oldDoc, nextDoc)).toBe(true);
  });
});

describe('transactionMayAffectThemeCompatibilityDecorations', () => {
  it('uses changed transaction ranges to skip code block text edits', () => {
    const oldDoc = schema.nodes.doc.create(null, [
      paragraph('Before'),
      codeBlock('const value = 1;'),
      paragraph('After'),
    ]);
    const nextDoc = schema.nodes.doc.create(null, [
      paragraph('Before'),
      codeBlock('const value = 2;'),
      paragraph('After'),
    ]);
    const codePos = topLevelNodePos(oldDoc, 'code_block');
    const changedPos = codePos + 1 + 'const value = '.length;

    expect(transactionMayAffectThemeCompatibilityDecorations(
      oldDoc,
      nextDoc,
      transactionWithChangedRange(changedPos, changedPos + 1)
    )).toBe(false);
  });

  it('uses changed transaction ranges to skip math and Mermaid source edits', () => {
    const oldDoc = schema.nodes.doc.create(null, [
      paragraph('Before'),
      mathBlock('\\frac{1}{2}'),
      mermaidBlock('graph TD\\nA --> B'),
      paragraph('After'),
    ]);
    const nextDoc = schema.nodes.doc.create(null, [
      paragraph('Before'),
      mathBlock('\\frac{1}{2 + x}'),
      mermaidBlock('graph TD\\nA --> B\\nB --> C'),
      paragraph('After'),
    ]);
    const mathPos = topLevelNodePos(oldDoc, 'math_block') + 1 + '\\frac{1}{2'.length;
    const mermaidPos = topLevelNodePos(oldDoc, 'mermaid') + 1 + 'graph TD\\nA --> B'.length;

    expect(transactionMayAffectThemeCompatibilityDecorations(
      oldDoc,
      nextDoc,
      transactionWithChangedRange(mathPos, mathPos)
    )).toBe(false);
    expect(transactionMayAffectThemeCompatibilityDecorations(
      oldDoc,
      nextDoc,
      transactionWithChangedRange(mermaidPos, mermaidPos)
    )).toBe(false);
  });

  it('rebuilds for ordinary paragraph transaction ranges', () => {
    const oldDoc = schema.nodes.doc.create(null, [
      paragraph('Before'),
      codeBlock('const value = 1;'),
    ]);
    const nextDoc = schema.nodes.doc.create(null, [
      paragraph('After'),
      codeBlock('const value = 1;'),
    ]);

    expect(transactionMayAffectThemeCompatibilityDecorations(
      oldDoc,
      nextDoc,
      transactionWithChangedRange(1, 3)
    )).toBe(true);
  });
});

describe('listContainsTaskItems', () => {
  it('reuses cached nested list results during one decoration pass', () => {
    const taskItem = {
      type: { name: 'list_item' },
      attrs: { checked: true },
      forEach: vi.fn(),
    };
    const nestedList = {
      type: { name: 'bullet_list' },
      forEach: vi.fn((visit: (node: unknown) => void) => visit(taskItem)),
    };
    const outerList = {
      type: { name: 'bullet_list' },
      forEach: vi.fn((visit: (node: unknown) => void) => visit(nestedList)),
    };
    const cache = new WeakMap<object, boolean>();

    expect(listContainsTaskItems(outerList, cache)).toBe(true);
    expect(listContainsTaskItems(nestedList, cache)).toBe(true);
    expect(nestedList.forEach).toHaveBeenCalledTimes(1);
  });
});

describe('buildCompatibilityDecorations', () => {
  it('caps theme compatibility decorations in large notes', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.bullet_list.create(null, Array.from({ length: MAX_THEME_COMPATIBILITY_DECORATIONS + 10 }, () => (
        schema.nodes.list_item.create(null, [paragraph('item')])
      ))),
    ]);

    expect(buildCompatibilityDecorations(doc).find()).toHaveLength(MAX_THEME_COMPATIBILITY_DECORATIONS);
  });
});

describe('applyThemeCompatibilityDecorationsState', () => {
  it('reuses decorations for selection-only transactions', () => {
    const doc = schema.nodes.doc.create(null, [
      paragraph('Caption'),
      codeBlock('const value = 1;'),
    ]);
    const previousDecorations = buildCompatibilityDecorations(doc);
    const previous = {
      decorationMaxTo: Math.max(0, ...previousDecorations.find().map((decoration) => decoration.to)),
      decorationCount: previousDecorations.find().length,
      decorations: previousDecorations,
      rebuildVersion: 2,
    };

    const next = applyThemeCompatibilityDecorationsState(
      {
        docChanged: false,
        getMeta: () => undefined,
        mapping: transactionWithChangedRange(1, 1).mapping,
      } as any,
      previous,
      doc,
      doc,
    );

    expect(next).toBe(previous);
  });

  it('clears large decoration sets for edits that overlap existing decorations', () => {
    const oldDoc = schema.nodes.doc.create(null, [
      schema.nodes.bullet_list.create(null, Array.from({ length: MAX_THEME_COMPATIBILITY_LIVE_MAP_DECORATIONS + 10 }, () => (
        schema.nodes.list_item.create(null, [paragraph('item')])
      ))),
      paragraph('Tail'),
    ]);
    const nextDoc = schema.nodes.doc.create(null, [
      schema.nodes.bullet_list.create(null, Array.from({ length: MAX_THEME_COMPATIBILITY_LIVE_MAP_DECORATIONS + 10 }, () => (
        schema.nodes.list_item.create(null, [paragraph('item')])
      ))),
      paragraph('Tail changed'),
    ]);
    const previousDecorations = buildCompatibilityDecorations(oldDoc);
    const previousDecorationCount = previousDecorations.find().length;

    expect(previousDecorationCount).toBeGreaterThanOrEqual(MAX_THEME_COMPATIBILITY_LIVE_MAP_DECORATIONS);

    const next = applyThemeCompatibilityDecorationsState(
      {
        docChanged: true,
        getMeta: () => undefined,
        mapping: transactionWithChangedRange(2, 2).mapping,
      } as any,
      {
        decorationMaxTo: Math.max(...previousDecorations.find().map((decoration) => decoration.to)),
        decorationCount: previousDecorationCount,
        decorations: previousDecorations,
        rebuildVersion: 2,
      },
      oldDoc,
      nextDoc,
    );

    expect(next.decorations.find()).toHaveLength(0);
    expect(next.decorationCount).toBe(0);
    expect(next.rebuildVersion).toBe(3);
  });

  it('keeps large decoration sets for edits after the existing decorated range', () => {
    const oldDoc = schema.nodes.doc.create(null, [
      schema.nodes.bullet_list.create(null, Array.from({ length: MAX_THEME_COMPATIBILITY_LIVE_MAP_DECORATIONS + 10 }, () => (
        schema.nodes.list_item.create(null, [paragraph('item')])
      ))),
      paragraph('Tail'),
    ]);
    const nextDoc = schema.nodes.doc.create(null, [
      schema.nodes.bullet_list.create(null, Array.from({ length: MAX_THEME_COMPATIBILITY_LIVE_MAP_DECORATIONS + 10 }, () => (
        schema.nodes.list_item.create(null, [paragraph('item')])
      ))),
      paragraph('Tail changed'),
    ]);
    const previousDecorations = buildCompatibilityDecorations(oldDoc);
    const previousDecorationCount = previousDecorations.find().length;
    const previousDecorationMaxTo = Math.max(...previousDecorations.find().map((decoration) => decoration.to));

    expect(previousDecorationCount).toBeGreaterThanOrEqual(MAX_THEME_COMPATIBILITY_LIVE_MAP_DECORATIONS);
    expect(previousDecorationMaxTo).toBeLessThan(oldDoc.content.size - 'Tail'.length);

    const next = applyThemeCompatibilityDecorationsState(
      {
        docChanged: true,
        getMeta: () => undefined,
        mapping: transactionWithChangedRange(oldDoc.content.size - 'Tail'.length, oldDoc.content.size).mapping,
      } as any,
      {
        decorationMaxTo: previousDecorationMaxTo,
        decorationCount: previousDecorationCount,
        decorations: previousDecorations,
        rebuildVersion: 2,
      },
      oldDoc,
      nextDoc,
    );

    expect(next.decorations).toBe(previousDecorations);
    expect(next.decorationCount).toBe(previousDecorationCount);
    expect(next.decorationMaxTo).toBe(previousDecorationMaxTo);
    expect(next.rebuildVersion).toBe(3);
  });
});

describe('createThemeCompatibilityDecorationRebuildController', () => {
  it('dispatches one rebuild after typing settles', () => {
    vi.useFakeTimers();
    const dispatchRebuild = vi.fn();
    const controller = createThemeCompatibilityDecorationRebuildController({
      delayMs: 160,
      dispatchRebuild,
    });

    controller.schedule();
    vi.advanceTimersByTime(120);
    controller.schedule();
    vi.advanceTimersByTime(159);

    expect(dispatchRebuild).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(dispatchRebuild).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('defers a pending rebuild while user input continues', () => {
    vi.useFakeTimers();
    const dispatchRebuild = vi.fn();
    const controller = createThemeCompatibilityDecorationRebuildController({
      delayMs: 160,
      dispatchRebuild,
    });

    controller.schedule();
    vi.advanceTimersByTime(120);
    controller.deferIfPending();
    vi.advanceTimersByTime(159);

    expect(dispatchRebuild).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(dispatchRebuild).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('drops pending rebuilds after destroy', () => {
    vi.useFakeTimers();
    const dispatchRebuild = vi.fn();
    const controller = createThemeCompatibilityDecorationRebuildController({
      delayMs: 160,
      dispatchRebuild,
    });

    controller.schedule();
    controller.destroy();
    vi.advanceTimersByTime(160);
    controller.flush();

    expect(dispatchRebuild).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('getTextContent', () => {
  it('ignores hidden markdown syntax while reading descendant text', () => {
    const node = {
      descendants: (visit: (child: unknown) => void) => {
        visit({
          isText: true,
          text: '# ',
          marks: [{ type: { name: 'markdownSyntax' } }],
        });
        visit({ isText: true, text: 'Heading', marks: [] });
      },
    };

    expect(getTextContent(node)).toBe('Heading');
  });

  it('uses bounded textBetween for ProseMirror nodes', () => {
    const node = {
      content: { size: MAX_THEME_COMPAT_TEXT_CONTENT_CHARS + 100 },
      textBetween: vi.fn(() => 'body'),
      get textContent() {
        throw new Error('textContent should not be read');
      },
    };

    expect(getTextContent(node)).toBe('body');
    expect(node.textBetween).toHaveBeenCalledWith(
      0,
      MAX_THEME_COMPAT_TEXT_CONTENT_CHARS,
      '\n',
      '\n'
    );
  });

  it('does not classify oversized whitespace prefixes as empty text', () => {
    const node = {
      content: { size: MAX_THEME_COMPAT_TEXT_CONTENT_CHARS + 100 },
      textBetween: vi.fn(() => ' '.repeat(MAX_THEME_COMPAT_TEXT_CONTENT_CHARS)),
      get textContent() {
        throw new Error('textContent should not be read');
      },
    };

    expect(getTextContent(node)).toBe(' ');
  });

  it('bounds fallback textContent reads when textBetween is unavailable', () => {
    const node = {
      textContent: 'x'.repeat(MAX_THEME_COMPAT_TEXT_CONTENT_CHARS + 1),
    };

    expect(getTextContent(node)).toHaveLength(MAX_THEME_COMPAT_TEXT_CONTENT_CHARS);
  });
});
