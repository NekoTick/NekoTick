import { describe, expect, it } from 'vitest';
import * as ProseModel from '@milkdown/kit/prose/model';
import * as ProseState from '@milkdown/kit/prose/state';
import { DecorationSet } from '@milkdown/kit/prose/view';
import {
  collectHtmlInlineSourceTextDecorations,
  updateHtmlInlineSourceTextDecorationsForTransaction,
} from './htmlInlineSourceTextPlugin';

const SchemaCtor = (ProseModel as any).Schema;
const EditorStateCtor = (ProseState as any).EditorState;
const schema = new SchemaCtor({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    text: { group: 'inline' },
  },
  marks: {},
});

function createTextNode(text: string, marks: Array<{ type: { name: string } }> = []) {
  return {
    isText: true,
    marks,
    nodeSize: text.length,
    text,
    type: { name: 'text' },
  };
}

function createNode(typeName: string, children: any[]) {
  return {
    child: (index: number) => children[index],
    childCount: children.length,
    nodeSize: children.reduce((sum, child) => sum + child.nodeSize, 2),
    type: { name: typeName },
  };
}

function paragraph(text: string) {
  return schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined);
}

function docWithParagraphs(texts: string[]) {
  return schema.nodes.doc.create(null, texts.map(paragraph));
}

function createDecorationSet(doc: any) {
  const decorations = collectHtmlInlineSourceTextDecorations(doc);
  return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

function findTextPosition(doc: any, text: string, edge: 'start' | 'end') {
  let result = -1;
  doc.descendants((node: any, pos: number) => {
    if (!node.isText) return true;
    const index = (node.text ?? '').indexOf(text);
    if (index < 0) return true;
    result = pos + index + (edge === 'end' ? text.length : 0);
    return false;
  });
  if (result < 0) throw new Error(`Text not found: ${text}`);
  return result;
}

describe('htmlInlineSourceTextPlugin', () => {
  it('decorates literal inline HTML tags while skipping code', () => {
    const text = 'Example <video src="xxx.mp4" /> tail';
    const inlineCodeText = '<span>code</span>';
    const codeBlockText = '<audio src="demo.mp3" />';
    const paragraph = createNode('paragraph', [
      createTextNode(text),
      createTextNode(inlineCodeText, [{ type: { name: 'inlineCode' } }]),
    ]);
    const codeBlock = createNode('code_block', [
      createTextNode(codeBlockText),
    ]);
    const doc = createNode('doc', [paragraph, codeBlock]);

    const decorations = collectHtmlInlineSourceTextDecorations(doc as any);

    expect(decorations.length).toBeGreaterThan(1);
    expect(decorations[0].from).toBe(1 + text.indexOf('<video'));
    expect(decorations[0].to).toBe(1 + text.indexOf(' />') + 3);
    expect((decorations[0].type as any).attrs?.class).toBe('md-html-inline md-html-source-text');
    const classes = decorations.map((decoration: any) => decoration.type.attrs?.class);
    expect(classes).toContain('md-html-source-markup');
    expect(classes).toContain('md-html-source-tag');
    expect(classes).toContain('md-html-source-attribute');
    expect(classes).toContain('md-html-source-string');
    expect(classes).toContain('md-html-source-operator');
  });

  it('bounds decoration collection', () => {
    const doc = {
      childCount: 1,
      child: () => ({
        isText: true,
        marks: [],
        nodeSize: 24,
        text: '<video src="a.mp4" />',
        type: { name: 'text' },
      }),
      type: { name: 'doc' },
    };

    expect(collectHtmlInlineSourceTextDecorations(doc as any, 0)).toHaveLength(0);
  });

  it('updates inline HTML source decorations incrementally', () => {
    const initialDoc = docWithParagraphs([
      'Example <video src="xxx.mp4" /> tail',
      'Plain paragraph',
    ]);
    const state = EditorStateCtor.create({ schema, doc: initialDoc });
    const initialDecorations = createDecorationSet(state.doc);

    const unrelatedInsert = state.tr.insertText(' updated', findTextPosition(state.doc, 'Plain', 'end'));
    const mappedDecorations = updateHtmlInlineSourceTextDecorationsForTransaction(
      initialDecorations,
      unrelatedInsert,
      unrelatedInsert.doc,
    );

    expect(mappedDecorations.find().length).toBeGreaterThan(1);
    expect(mappedDecorations.find().some((decoration: any) => (
      decoration.type.attrs?.class === 'md-html-inline md-html-source-text'
    ))).toBe(true);

    const htmlStart = findTextPosition(unrelatedInsert.doc, '<video', 'start');
    const deleteHtmlStart = EditorStateCtor.create({ schema, doc: unrelatedInsert.doc }).tr.delete(htmlStart, htmlStart + 1);
    const updatedDecorations = updateHtmlInlineSourceTextDecorationsForTransaction(
      mappedDecorations,
      deleteHtmlStart,
      deleteHtmlStart.doc,
    );

    expect(updatedDecorations.find()).toHaveLength(0);
  });
});
