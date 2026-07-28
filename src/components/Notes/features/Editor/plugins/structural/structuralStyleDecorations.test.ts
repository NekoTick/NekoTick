import { describe, expect, it } from 'vitest';
import * as ProseModel from '@milkdown/kit/prose/model';
import * as ProseState from '@milkdown/kit/prose/state';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { Decoration } from '@milkdown/kit/prose/view';
import {
  STRUCTURAL_EAGER_LAYOUT_PARAGRAPH_CLASS,
  STRUCTURAL_EMPTY_PARAGRAPH_CLASS,
  STRUCTURAL_LIST_ITEM_ALIGN_CENTER_CLASS,
  STRUCTURAL_LIST_ITEM_ALIGN_RIGHT_CLASS,
  STRUCTURAL_PARAGRAPH_HAS_IMAGE_BLOCK_CLASS,
  STRUCTURAL_PARAGRAPH_HAS_MULTIPLE_IMAGE_BLOCKS_CLASS,
  applyStructuralStyleDecorationsState,
  createStructuralStyleDecorations,
  getStructuralDecorationContextRanges,
  getStructuralStyleDecorationClass,
} from './structuralStyleDecorations';

const SchemaCtor = (ProseModel as any).Schema;
const EditorStateCtor = (ProseState as any).EditorState;
const schema = new SchemaCtor({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: {
        align: { default: 'left' },
      },
      toDOM: (node: any) => {
        const align = node.attrs.align;
        return align && align !== 'left'
          ? ['p', { 'data-text-align': align }, 0]
          : ['p', 0];
      },
      parseDOM: [{ tag: 'p' }],
    },
    image: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: {
        src: { default: null },
        width: { default: null },
      },
      toDOM: () => ['span', { class: 'image-block-container' }],
      parseDOM: [{ tag: 'span.image-block-container' }],
    },
    html_block: {
      group: 'block',
      atom: true,
      attrs: { value: { default: '' } },
      toDOM: (node: any) => ['div', { 'data-value': node.attrs.value }],
      parseDOM: [{ tag: 'div[data-value]' }],
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
  marks: {
    strong: {
      parseDOM: [{ tag: 'strong' }],
      toDOM: () => ['strong', 0],
    },
  },
});

function textNode(text: string) {
  return text ? schema.text(text) : undefined;
}

function paragraph(text = '', attrs?: Record<string, unknown>) {
  return schema.nodes.paragraph.create(attrs, textNode(text));
}

function image() {
  return schema.nodes.image.create({ src: 'image.png' });
}

function paragraphWithChildren(children: unknown[], attrs?: Record<string, unknown>) {
  return schema.nodes.paragraph.create(attrs, children as any);
}

function listItem(child: ProseNode) {
  return schema.nodes.list_item.create(null, [child]);
}

function docWith(nodes: ProseNode[]) {
  return schema.nodes.doc.create(null, nodes);
}

function decorationClasses(doc: ProseNode): string[] {
  return createStructuralStyleDecorations(doc)
    .find()
    .map((decoration: Decoration) => (decoration.type as any).attrs?.class);
}

function findTextPosition(doc: ProseNode, text: string, edge: 'start' | 'end'): number {
  let result = -1;
  doc.descendants((node, pos) => {
    if (!node.isText) {
      return true;
    }
    const index = (node.text ?? '').indexOf(text);
    if (index < 0) {
      return true;
    }
    result = pos + index + (edge === 'end' ? text.length : 0);
    return false;
  });

  if (result < 0) {
    throw new Error(`Text not found: ${text}`);
  }
  return result;
}

function findNodePosition(doc: ProseNode, typeName: string): number {
  let result = -1;
  doc.descendants((node, pos) => {
    if (node.type.name !== typeName) {
      return true;
    }
    result = pos;
    return false;
  });
  if (result < 0) {
    throw new Error(`Node not found: ${typeName}`);
  }
  return result;
}

describe('structuralStyleDecorations', () => {
  it('marks paragraphs that need image or empty paragraph presentation classes', () => {
    expect(getStructuralStyleDecorationClass(paragraph())).toBe(STRUCTURAL_EMPTY_PARAGRAPH_CLASS);
    expect(getStructuralStyleDecorationClass(paragraphWithChildren([image()]))).toBe(
      STRUCTURAL_PARAGRAPH_HAS_IMAGE_BLOCK_CLASS,
    );
    expect(getStructuralStyleDecorationClass(paragraphWithChildren([image(), image()]))).toBe(
      `${STRUCTURAL_PARAGRAPH_HAS_IMAGE_BLOCK_CLASS} ${STRUCTURAL_PARAGRAPH_HAS_MULTIPLE_IMAGE_BLOCKS_CLASS}`,
    );
    expect(getStructuralStyleDecorationClass(paragraphWithChildren([
      image(),
      textNode('Visible text'),
    ]))).toBeNull();
  });

  it('eagerly lays out only long paragraphs with dense inline structure', () => {
    const denseChildren = Array.from({ length: 12 }, (_, index) => (
      schema.text('formatted segment '.repeat(12), index % 2 === 0 ? [schema.marks.strong.create()] : undefined)
    ));

    expect(getStructuralStyleDecorationClass(paragraphWithChildren(denseChildren))).toBe(
      STRUCTURAL_EAGER_LAYOUT_PARAGRAPH_CLASS,
    );
    expect(getStructuralStyleDecorationClass(paragraph('plain text '.repeat(300)))).toBeNull();
    expect(getStructuralStyleDecorationClass(paragraphWithChildren(denseChildren.slice(0, 6)))).toBeNull();
  });

  it('marks list items based on direct child text alignment', () => {
    expect(getStructuralStyleDecorationClass(listItem(paragraph('centered', { align: 'center' })))).toBe(
      STRUCTURAL_LIST_ITEM_ALIGN_CENTER_CLASS,
    );
    expect(getStructuralStyleDecorationClass(listItem(paragraph('right', { align: 'right' })))).toBe(
      STRUCTURAL_LIST_ITEM_ALIGN_RIGHT_CLASS,
    );
  });

  it('creates structural style decorations for images, empty paragraphs, and aligned list items', () => {
    const doc = docWith([
      schema.nodes.bullet_list.create(null, [
        listItem(paragraph('centered', { align: 'center' })),
        listItem(paragraph('right', { align: 'right' })),
      ]),
      paragraphWithChildren([image()]),
      paragraphWithChildren([image(), image()]),
      paragraph(),
      paragraph('plain'),
    ]);

    expect(decorationClasses(doc).sort()).toEqual([
      STRUCTURAL_LIST_ITEM_ALIGN_CENTER_CLASS,
      STRUCTURAL_LIST_ITEM_ALIGN_RIGHT_CLASS,
      STRUCTURAL_PARAGRAPH_HAS_IMAGE_BLOCK_CLASS,
      `${STRUCTURAL_PARAGRAPH_HAS_IMAGE_BLOCK_CLASS} ${STRUCTURAL_PARAGRAPH_HAS_MULTIPLE_IMAGE_BLOCKS_CLASS}`,
      STRUCTURAL_EMPTY_PARAGRAPH_CLASS,
    ].sort());
  });

  it('limits incremental updates to the changed structural context', () => {
    const doc = docWith([
      schema.nodes.bullet_list.create(null, [
        listItem(paragraph('centered', { align: 'center' })),
      ]),
      paragraph('target text'),
    ]);
    const targetPos = findTextPosition(doc, 'target text', 'end');
    const ranges = getStructuralDecorationContextRanges(doc, targetPos, targetPos);

    expect(ranges).toHaveLength(1);
    expect(doc.nodeAt(ranges[0].from)?.type.name).toBe('paragraph');
  });

  it('falls back to a full-document structural range when context scanning is exhausted', () => {
    let scanned = 0;
    const fakeDoc = {
      content: { size: 300 },
      resolve: () => ({
        depth: 0,
        nodeAfter: null,
        nodeBefore: null,
      }),
      nodesBetween: (_from: number, _to: number, callback: (node: any, pos: number) => boolean | void) => {
        for (let index = 0; index < 5; index += 1) {
          scanned += 1;
          const shouldContinue = callback({ type: { name: 'text' }, nodeSize: 1 }, index * 20);
          if (shouldContinue === false) break;
        }
      },
    } as unknown as ProseNode;

    expect(getStructuralDecorationContextRanges(fakeDoc, 0, 200, 1)).toEqual([{ from: 0, to: 300 }]);
    expect(scanned).toBe(2);
  });

  it('does not collapse a text paragraph when an image is inserted', () => {
    const state = EditorStateCtor.create({
      schema,
      doc: docWith([paragraph('Target')]),
    });
    const previousDecorations = createStructuralStyleDecorations(state.doc);
    const tr = state.tr.insert(findTextPosition(state.doc, 'Target', 'end'), image());

    const next = applyStructuralStyleDecorationsState(tr, {
      decorationCount: previousDecorations.find().length,
      decorations: previousDecorations,
    }, tr.doc);

    expect(next.decorations.find()).toEqual([]);
  });

  it('reuses structural decorations for selection-only transactions', () => {
    const state = EditorStateCtor.create({
      schema,
      doc: docWith([paragraphWithChildren([image()]), paragraph('Target')]),
    });
    const decorations = createStructuralStyleDecorations(state.doc);
    const previous = {
      decorationCount: decorations.find().length,
      decorations,
    };

    const next = applyStructuralStyleDecorationsState(
      state.tr.setMeta('selection-only', true),
      previous,
      state.doc,
    );

    expect(next).toBe(previous);
  });

  it('removes stale structural classes incrementally when an image is deleted', () => {
    const state = EditorStateCtor.create({
      schema,
      doc: docWith([paragraphWithChildren([image()])]),
    });
    const previousDecorations = createStructuralStyleDecorations(state.doc);
    const imagePos = findNodePosition(state.doc, 'image');
    const tr = state.tr.delete(imagePos, imagePos + 1);

    const next = applyStructuralStyleDecorationsState(tr, {
      decorationCount: previousDecorations.find().length,
      decorations: previousDecorations,
    }, tr.doc);

    expect(next.decorations.find().map((decoration: Decoration) => (decoration.type as any).attrs?.class)).toEqual([
      STRUCTURAL_EMPTY_PARAGRAPH_CLASS,
    ]);
  });

  it('keeps image paragraph classes when image attrs change without replacing the paragraph', () => {
    const state = EditorStateCtor.create({
      schema,
      doc: docWith([paragraphWithChildren([image()]), paragraph('After')]),
    });
    const previousDecorations = createStructuralStyleDecorations(state.doc);
    const imagePos = findNodePosition(state.doc, 'image');
    const tr = state.tr.setNodeMarkup(imagePos, undefined, {
      ...state.doc.nodeAt(imagePos)!.attrs,
      width: '33.13%',
    });

    const next = applyStructuralStyleDecorationsState(tr, {
      decorationCount: previousDecorations.find().length,
      decorations: previousDecorations,
    }, tr.doc);

    expect(next.decorations.find().map((decoration: Decoration) => (decoration.type as any).attrs?.class)).toEqual([
      STRUCTURAL_PARAGRAPH_HAS_IMAGE_BLOCK_CLASS,
    ]);
  });

  it('keeps image paragraph classes when a preview commit marks following text', () => {
    const target = 'target text';
    const state = EditorStateCtor.create({
      schema,
      doc: docWith([paragraphWithChildren([image()]), paragraph(`Prefix ${target} suffix`)]),
    });
    const previousDecorations = createStructuralStyleDecorations(state.doc);
    const from = findTextPosition(state.doc, target, 'start');
    const to = findTextPosition(state.doc, target, 'end');
    const previewDoc = state.tr.addMark(from, to, schema.marks.strong.create()).doc;
    const diffStart = (state.doc.content as any).findDiffStart(previewDoc.content);
    const diffEnd = (state.doc.content as any).findDiffEnd(previewDoc.content);

    expect(diffStart).not.toBeNull();
    expect(diffEnd).toBeTruthy();

    const tr = state.tr.replace(
      diffStart,
      diffEnd.a,
      previewDoc.slice(diffStart, diffEnd.b),
    );

    const next = applyStructuralStyleDecorationsState(tr, {
      decorationCount: previousDecorations.find().length,
      decorations: previousDecorations,
    }, tr.doc);

    expect(next.decorations.find().map((decoration: Decoration) => (decoration.type as any).attrs?.class)).toContain(
      STRUCTURAL_PARAGRAPH_HAS_IMAGE_BLOCK_CLASS,
    );
  });

  it('keeps distant image paragraph classes when an HTML blank line becomes editable', () => {
    const imageParagraph = () => paragraphWithChildren([image()]);
    const state = EditorStateCtor.create({
      schema,
      doc: docWith([
        imageParagraph(),
        imageParagraph(),
        schema.nodes.html_block.create({ value: '<!--vlaina-markdown-blank-line-->' }),
        imageParagraph(),
      ]),
    });
    const previousDecorations = createStructuralStyleDecorations(state.doc);
    const blankLinePos = findNodePosition(state.doc, 'html_block');
    const tr = state.tr.replaceWith(
      blankLinePos,
      blankLinePos + state.doc.nodeAt(blankLinePos)!.nodeSize,
      paragraph('\u200B'),
    );

    const next = applyStructuralStyleDecorationsState(tr, {
      decorationCount: previousDecorations.find().length,
      decorations: previousDecorations,
    }, tr.doc);

    expect(next.decorations.find().map((decoration: Decoration) => ({
      className: (decoration.type as any).attrs?.class,
      from: decoration.from,
      to: decoration.to,
    }))).toEqual([
      { className: STRUCTURAL_PARAGRAPH_HAS_IMAGE_BLOCK_CLASS, from: 0, to: 3 },
      { className: STRUCTURAL_PARAGRAPH_HAS_IMAGE_BLOCK_CLASS, from: 3, to: 6 },
      { className: STRUCTURAL_PARAGRAPH_HAS_IMAGE_BLOCK_CLASS, from: 9, to: 12 },
    ]);
  });
});
