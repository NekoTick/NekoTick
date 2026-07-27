import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import * as ProseModel from '@milkdown/kit/prose/model';
import * as ProseState from '@milkdown/kit/prose/state';
import {
    buildImageNodeAttrs,
    canInsertImageNodeAtSelection,
    insertImageNodeAtSelection,
    insertImageNodesAtSelection,
} from './imageNodeInsertion';

const SchemaCtor = (ProseModel as any).Schema;
const EditorStateCtor = (ProseState as any).EditorState;
const TextSelectionCtor = (ProseState as any).TextSelection;
const schema = new SchemaCtor({
    nodes: {
        doc: { content: 'block+' },
        paragraph: { group: 'block', content: 'inline*' },
        heading: { group: 'block', content: 'inline*' },
        bullet_list: { group: 'block', content: 'list_item+' },
        list_item: { content: 'paragraph block*' },
        image: {
            inline: true,
            group: 'inline',
            atom: true,
            attrs: {
                src: { default: null },
                alt: { default: '' },
                align: { default: 'center' },
                width: { default: null },
            },
        },
        text: { group: 'inline' },
    },
});

function paragraph(text = '') {
    return schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined);
}

function createRealView(doc: any, selectionPos: number) {
    let state = EditorStateCtor.create({
        schema,
        doc,
        selection: TextSelectionCtor.create(doc, selectionPos),
    });
    const dispatch = vi.fn((tr: any) => {
        state = state.apply(tr);
    });
    const view = {
        dom: document.createElement('div'),
        get state() {
            return state;
        },
        dispatch,
    };
    return { dispatch, getState: () => state, view };
}

function inlineLabel(node: any): string {
    const labels: string[] = [];
    node.forEach((child: any) => {
        labels.push(child.isText ? child.text : `<${child.type.name}>`);
    });
    return labels.join('');
}

function findTextEnd(doc: any, text: string): number {
    let result = -1;
    doc.descendants((node: any, pos: number) => {
        if (node.isText && node.text === text) {
            result = pos + text.length;
            return false;
        }
        return true;
    });
    return result;
}

describe('imageNodeInsertion', () => {
    it('builds stable image attrs from the uploaded path', () => {
        expect(buildImageNodeAttrs('./assets/demo-image.png')).toEqual({
            src: './assets/demo-image.png',
            alt: 'demo-image',
            align: 'center',
            width: null,
        });
    });

    it('builds alt text from the image filename without URL metadata', () => {
        expect(buildImageNodeAttrs('.\\assets\\demo-image.png?cache=1#preview')).toEqual({
            src: '.\\assets\\demo-image.png?cache=1#preview',
            alt: 'demo-image',
            align: 'center',
            width: null,
        });
    });

    it('detects when the current selection can accept an image node', () => {
        const replaceSelectionWith = vi.fn(function () {
            return tr;
        });
        const tr = { docChanged: true, replaceSelectionWith };
        const create = vi.fn(() => ({ type: 'image-node' }));
        const view = {
            state: {
                schema: { nodes: { image: { create } } },
                tr,
            },
        };

        expect(canInsertImageNodeAtSelection(view as never)).toBe(true);
        expect(create).toHaveBeenCalledWith({
            src: './image.png',
            alt: 'image',
            align: 'center',
            width: null,
        });
    });

    it('returns false when the current selection cannot accept an image node', () => {
        const replaceSelectionWith = vi.fn(() => {
            throw new Error('cannot insert');
        });
        const create = vi.fn(() => ({ type: 'image-node' }));
        const view = {
            state: {
                schema: { nodes: { image: { create } } },
                tr: { replaceSelectionWith },
            },
        };

        expect(canInsertImageNodeAtSelection(view as never)).toBe(false);
    });

    it('replaces the current selection with an image node', () => {
        const scrollIntoView = vi.fn(function () {
            return tr;
        });
        const replaceSelectionWith = vi.fn(function () {
            return tr;
        });
        const tr = { replaceSelectionWith, scrollIntoView };
        const dispatch = vi.fn();
        const imageNode = { type: 'image-node' };
        const create = vi.fn(() => imageNode);
        const view = {
            dom: { dispatchEvent: vi.fn() },
            state: {
                schema: { nodes: { image: { create } } },
                tr,
            },
            dispatch,
        };

        expect(insertImageNodeAtSelection(view as never, './assets/demo-image.png')).toBe(true);
        expect(create).toHaveBeenCalledWith({
            src: './assets/demo-image.png',
            alt: 'demo-image',
            align: 'center',
            width: null,
        });
        expect(replaceSelectionWith).toHaveBeenCalledWith(imageNode);
        expect(scrollIntoView).toHaveBeenCalled();
        expect(view.dom.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
            type: 'editor:image-user-input',
        }));
        expect(dispatch).toHaveBeenCalledWith(tr);
    });

    it.each([
        ['empty paragraph', '', 0, ['<image>', '']],
        ['paragraph start', 'after', 0, ['<image>', 'after']],
        ['paragraph middle', 'before after', 'before '.length, ['before ', '<image>', 'after']],
        ['paragraph end', 'before', 'before'.length, ['before', '<image>', '']],
    ])('isolates an image at the %s and places the caret in the following paragraph', (
        _label,
        text,
        offset,
        expectedBlocks,
    ) => {
        const doc = schema.nodes.doc.create(null, [paragraph(text)]);
        const harness = createRealView(doc, 1 + offset);

        expect(insertImageNodeAtSelection(
            harness.view as never,
            './assets/inserted.png',
        )).toBe(true);

        const state = harness.getState();
        const blocks = Array.from(
            { length: state.doc.childCount },
            (_value, index) => inlineLabel(state.doc.child(index)),
        );
        expect(blocks).toEqual(expectedBlocks);
        expect(state.selection.$from.parent.type.name).toBe('paragraph');
        expect(state.selection.$from.parentOffset).toBe(0);
        expect(inlineLabel(state.selection.$from.parent)).not.toContain('<image>');
    });

    it('keeps heading text before the image and moves following text into a paragraph', () => {
        const heading = schema.nodes.heading.create(null, schema.text('before after'));
        const doc = schema.nodes.doc.create(null, [heading]);
        const harness = createRealView(doc, 1 + 'before '.length);

        expect(insertImageNodeAtSelection(harness.view as never, './assets/heading.png')).toBe(true);

        const state = harness.getState();
        expect(Array.from(
            { length: state.doc.childCount },
            (_value, index) => ({
                content: inlineLabel(state.doc.child(index)),
                type: state.doc.child(index).type.name,
            }),
        )).toEqual([
            { content: 'before ', type: 'heading' },
            { content: '<image>', type: 'paragraph' },
            { content: 'after', type: 'paragraph' },
        ]);
        expect(state.selection.$from.parent.textContent).toBe('after');
        expect(state.selection.$from.parentOffset).toBe(0);
    });

    it('creates an editable paragraph after an image inserted in a list item', () => {
        const listItem = schema.nodes.list_item.create(null, [paragraph('list item')]);
        const list = schema.nodes.bullet_list.create(null, [listItem]);
        const doc = schema.nodes.doc.create(null, [list]);
        const harness = createRealView(doc, findTextEnd(doc, 'list item'));

        expect(insertImageNodeAtSelection(harness.view as never, './assets/list.png')).toBe(true);

        const state = harness.getState();
        const updatedListItem = state.doc.firstChild.firstChild;
        expect(Array.from(
            { length: updatedListItem.childCount },
            (_value, index) => inlineLabel(updatedListItem.child(index)),
        )).toEqual(['list item', '<image>', '']);
        expect(state.selection.$from.parent.type.name).toBe('paragraph');
        expect(state.selection.$from.parentOffset).toBe(0);
    });

    it('isolates multiple images in order and places one caret paragraph after them', () => {
        const doc = schema.nodes.doc.create(null, [paragraph('before after')]);
        const harness = createRealView(doc, 1 + 'before '.length);
        const images = ['first.png', 'second.png'].map((src) =>
            schema.nodes.image.create({ src, alt: src, align: 'center', width: null })
        );

        expect(insertImageNodesAtSelection(harness.view as never, images)).toBe(true);

        const state = harness.getState();
        expect(Array.from(
            { length: state.doc.childCount },
            (_value, index) => inlineLabel(state.doc.child(index)),
        )).toEqual(['before ', '<image>', '<image>', 'after']);
        expect(state.doc.child(1).firstChild.attrs.src).toBe('first.png');
        expect(state.doc.child(2).firstChild.attrs.src).toBe('second.png');
        expect(state.selection.$from.parent.textContent).toBe('after');
        expect(state.selection.$from.parentOffset).toBe(0);
    });

    it('preserves randomized text around image insertion and always exposes the following caret', () => {
        fc.assert(fc.property(
            fc.string({ maxLength: 48 }),
            fc.string({ maxLength: 48 }),
            (before, after) => {
                const doc = schema.nodes.doc.create(null, [paragraph(before + after)]);
                const harness = createRealView(doc, 1 + before.length);

                expect(insertImageNodeAtSelection(harness.view as never, './assets/random.png')).toBe(true);

                const state = harness.getState();
                const blocks = Array.from(
                    { length: state.doc.childCount },
                    (_value, index) => inlineLabel(state.doc.child(index)),
                );
                expect(blocks).toEqual(before ? [before, '<image>', after] : ['<image>', after]);
                expect(state.selection.$from.parent.textContent).toBe(after);
                expect(state.selection.$from.parentOffset).toBe(0);
                expect(inlineLabel(state.selection.$from.parent)).not.toContain('<image>');
            },
        ), { numRuns: 500, seed: 0x20260727 });
    });

    it('restores a saved selection and inserts the image in one transaction', () => {
        const savedSelection = { type: 'saved-selection' };
        const scrollIntoView = vi.fn(function () {
            return tr;
        });
        const replaceSelectionWith = vi.fn(function () {
            return tr;
        });
        const setSelection = vi.fn(function () {
            return tr;
        });
        const tr = { replaceSelectionWith, scrollIntoView, setSelection };
        const dispatch = vi.fn();
        const imageNode = { type: 'image-node' };
        const view = {
            dom: { dispatchEvent: vi.fn() },
            state: {
                schema: { nodes: { image: { create: vi.fn(() => imageNode) } } },
                tr,
            },
            dispatch,
        };

        expect(insertImageNodeAtSelection(
            view as never,
            './assets/demo-image.png',
            savedSelection as never,
        )).toBe(true);
        expect(setSelection).toHaveBeenCalledWith(savedSelection);
        expect(setSelection.mock.invocationCallOrder[0]).toBeLessThan(
            replaceSelectionWith.mock.invocationCallOrder[0],
        );
        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(dispatch).toHaveBeenCalledWith(tr);
    });
});
