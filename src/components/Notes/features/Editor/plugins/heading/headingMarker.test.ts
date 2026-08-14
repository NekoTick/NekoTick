import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Editor, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { AllSelection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { headingPlugin } from './headingPlugin';
import {
    createActiveHeadingMarkerDecorations,
    createEmptyHeadingMarkerDecorations,
    transactionMayAffectEmptyHeadingMarkers,
} from './headingMarker';
import { captureSelectedHeadingMarkerSelection } from './headingMarkerDeletion';
import { getRetainedHeadingMarkerSelectionHead } from './headingMarkerPointerRetention';

const editors: Editor[] = [];

async function createEditor(markdown: string) {
    const editor = Editor.make()
        .config((ctx) => ctx.set(defaultValueCtx, markdown))
        .use(commonmark);

    for (const plugin of headingPlugin) editor.use(plugin);

    await editor.create();
    editors.push(editor);
    return editor.ctx.get(editorViewCtx);
}

function headingMarkers(view: EditorView): HTMLElement[] {
    return Array.from(view.dom.querySelectorAll<HTMLElement>('.heading-markdown-marker'));
}

async function selectHeadingMarkerAndFirstCharacter(view: EditorView): Promise<void> {
    const heading = view.dom.querySelector<HTMLElement>('h1');
    const marker = headingMarkers(view)[0];
    if (!heading || !marker) throw new Error('Missing heading marker');
    vi.spyOn(marker, 'getBoundingClientRect').mockReturnValue({
        bottom: 40,
        height: 20,
        left: 10,
        right: 30,
        top: 20,
        width: 20,
        x: 10,
        y: 20,
        toJSON: () => ({}),
    });
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: () => heading,
    });

    try {
        heading.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            button: 0,
            clientX: 80,
            clientY: 30,
        }));
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2, 1)));
        document.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            clientX: 20,
            clientY: 30,
        }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
        await Promise.resolve();
    } finally {
        if (originalElementFromPoint) {
            Object.defineProperty(document, 'elementFromPoint', {
                configurable: true,
                value: originalElementFromPoint,
            });
        } else {
            delete (document as { elementFromPoint?: typeof document.elementFromPoint })
                .elementFromPoint;
        }
    }
}

afterEach(async () => {
    await Promise.all(editors.splice(0).map((editor) => editor.destroy()));
});

describe('heading Markdown markers', () => {
    it('inherits heading typography and only hides during pointer selection', () => {
        const css = readFileSync(resolve(
            process.cwd(),
            'src/components/Notes/features/Editor/styles/markdown.css',
        ), 'utf8');
        const markerRule = css.match(/\.heading-markdown-marker\s*\{[^}]+\}/)?.[0] ?? '';
        const pointerSelectionRule = css.match(/\.ProseMirror\[data-editor-pointer-selecting='true'\][^{]+\{[^}]+\}/)?.[0] ?? '';

        expect(markerRule).toContain('font-size: inherit');
        expect(markerRule).toContain('font-weight: inherit');
        expect(markerRule).toContain('line-height: inherit');
        expect(css).not.toContain('.ProseMirror:not(.ProseMirror-focused) .heading-markdown-marker');
        expect(pointerSelectionRule).toContain(':not(.heading-markdown-marker-retained)');
        expect(pointerSelectionRule).toContain('display: none');
        expect(css).toContain('.heading-markdown-fully-selected .editor-text-selection-overlay,');
        expect(css).toContain('> .heading-markdown-marker-pointer-selected');
        expect(css).toContain('background-size: 100% 1lh;');
    });

    it('shows the marker for the heading containing the cursor', async () => {
        const view = await createEditor(['# First', '', 'Body', '', '## Second'].join('\n'));

        expect(headingMarkers(view).map((marker) => marker.textContent)).toEqual(['# ']);

        const secondHeadingPos = view.state.doc.child(0).nodeSize
            + view.state.doc.child(1).nodeSize;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, secondHeadingPos + 1)));

        expect(headingMarkers(view).map((marker) => marker.textContent)).toEqual(['## ']);
    });

    it('keeps an existing marker visible while reselecting inside the same heading', async () => {
        const view = await createEditor('# 123456');
        const heading = view.dom.querySelector('h1');
        expect(heading).not.toBeNull();
        expect(headingMarkers(view).map((marker) => marker.textContent)).toEqual(['# ']);

        const originalElementFromPoint = document.elementFromPoint;
        Object.defineProperty(document, 'elementFromPoint', {
            configurable: true,
            value: () => heading,
        });

        try {
            heading!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            view.dom.setAttribute('data-editor-pointer-selecting', 'true');

            expect(view.dom.closest('.milkdown')).toHaveClass('heading-markdown-marker-pointer-retained');
            expect(headingMarkers(view)).toHaveLength(1);
            expect(headingMarkers(view)[0]).toHaveClass('heading-markdown-marker-retained');

            document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
            view.dom.removeAttribute('data-editor-pointer-selecting');
            await Promise.resolve();

            expect(view.dom.closest('.milkdown')).not.toHaveClass('heading-markdown-marker-pointer-retained');
            expect(headingMarkers(view)).toHaveLength(1);
            expect(headingMarkers(view)[0]).not.toHaveClass('heading-markdown-marker-retained');
        } finally {
            if (originalElementFromPoint) {
                Object.defineProperty(document, 'elementFromPoint', {
                    configurable: true,
                    value: originalElementFromPoint,
                });
            } else {
                delete (document as { elementFromPoint?: typeof document.elementFromPoint })
                    .elementFromPoint;
            }
        }
    });

    it('does not remeasure the heading marker on every pointer move', async () => {
        const view = await createEditor('# 123456');
        const heading = view.dom.querySelector('h1');
        const marker = headingMarkers(view)[0];
        expect(heading).not.toBeNull();
        expect(marker).toBeDefined();
        const getBoundingClientRect = vi.spyOn(marker, 'getBoundingClientRect').mockReturnValue({
            bottom: 40,
            height: 20,
            left: 10,
            right: 30,
            top: 20,
            width: 20,
            x: 10,
            y: 20,
            toJSON: () => ({}),
        });
        const originalElementFromPoint = document.elementFromPoint;
        Object.defineProperty(document, 'elementFromPoint', {
            configurable: true,
            value: () => heading,
        });

        try {
            heading!.dispatchEvent(new MouseEvent('mousedown', {
                bubbles: true,
                button: 0,
                clientX: 80,
                clientY: 30,
            }));
            for (let index = 0; index < 20; index += 1) {
                document.dispatchEvent(new MouseEvent('mousemove', {
                    bubbles: true,
                    clientX: 80 - index,
                    clientY: 30,
                }));
            }

            expect(getBoundingClientRect).toHaveBeenCalledTimes(1);
            document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
        } finally {
            Object.defineProperty(document, 'elementFromPoint', {
                configurable: true,
                value: originalElementFromPoint,
            });
        }
    });

    it('keeps a sparse diagonal marker crossing for the selection handler', async () => {
        const view = await createEditor('# 123456');
        const heading = view.dom.querySelector('h1');
        const marker = headingMarkers(view)[0];
        expect(heading).not.toBeNull();
        expect(marker).toBeDefined();
        vi.spyOn(marker, 'getBoundingClientRect').mockReturnValue({
            bottom: 40,
            height: 20,
            left: 10,
            right: 30,
            top: 20,
            width: 20,
            x: 10,
            y: 20,
            toJSON: () => ({}),
        });
        const endpoint = { clientX: -100, clientY: 0 };
        const originalElementFromPoint = document.elementFromPoint;
        Object.defineProperty(document, 'elementFromPoint', {
            configurable: true,
            value: () => heading,
        });

        try {
            heading!.dispatchEvent(new MouseEvent('mousedown', {
                bubbles: true,
                button: 0,
                clientX: 80,
                clientY: 30,
            }));
            document.dispatchEvent(new MouseEvent('mousemove', {
                bubbles: true,
                ...endpoint,
            }));

            expect(getRetainedHeadingMarkerSelectionHead(view, endpoint)).toBe(1);
            document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
            await Promise.resolve();
        } finally {
            if (originalElementFromPoint) {
                Object.defineProperty(document, 'elementFromPoint', {
                    configurable: true,
                    value: originalElementFromPoint,
                });
            } else {
                delete (document as { elementFromPoint?: typeof document.elementFromPoint })
                    .elementFromPoint;
            }
        }
    });

    it('hides markers after the cursor moves outside headings', async () => {
        const view = await createEditor(['# Heading', '', 'Body'].join('\n'));
        const paragraphPos = view.state.doc.child(0).nodeSize;

        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, paragraphPos + 1)));

        expect(headingMarkers(view)).toHaveLength(0);
    });

    it('shows every heading touched by a text selection', async () => {
        const view = await createEditor(['# First', '', 'Body', '', '### Third'].join('\n'));

        view.dispatch(view.state.tr.setSelection(TextSelection.create(
            view.state.doc,
            1,
            view.state.doc.content.size - 1,
        )));

        expect(headingMarkers(view).map((marker) => marker.textContent)).toEqual(['# ', '### ']);
    });

    it('selects the marker when the full heading text is selected', async () => {
        const view = await createEditor('## Entire heading');
        const heading = view.state.doc.firstChild!;

        view.dispatch(view.state.tr.setSelection(TextSelection.create(
            view.state.doc,
            1,
            1 + heading.content.size,
        )));

        expect(headingMarkers(view)[0]).toHaveClass(
            'editor-text-selection-overlay',
            'editor-text-selection-overlay-force',
        );
        expect(view.dom.querySelector('h2')).toHaveClass('heading-markdown-fully-selected');
    });

    it('does not select the marker for a partial heading text selection', async () => {
        const view = await createEditor('## Partial heading');

        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2, 8)));

        expect(headingMarkers(view)[0]).not.toHaveClass('editor-text-selection-overlay');
    });

    it.each(['Backspace', 'Delete'])('removes a selected marker with %s and keeps the remaining text', async (key) => {
        const view = await createEditor('# 12345');
        await selectHeadingMarkerAndFirstCharacter(view);

        expect(headingMarkers(view)[0]).toHaveClass('heading-markdown-marker-pointer-selected');
        view.dom.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key,
        }));

        expect(view.state.doc.firstChild?.type.name).toBe('paragraph');
        expect(view.state.doc.firstChild?.textContent).toBe('2345');
        expect(headingMarkers(view)).toHaveLength(0);
    });

    it.each([
        ['# 12345', '#12345', 2],
        ['###### 12345', '######12345', 7],
    ])('deletes only the marker space at the heading content boundary', async (
        markdown,
        expectedText,
        expectedCursor,
    ) => {
        const view = await createEditor(markdown);
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));

        view.dom.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'Backspace',
        }));

        expect(view.state.doc.firstChild?.type.name).toBe('paragraph');
        expect(view.state.doc.firstChild?.textContent).toBe(expectedText);
        expect(view.state.selection.from).toBe(expectedCursor);
    });

    it('does not depend on mapping the marker decoration back to a document position', async () => {
        const view = await createEditor('# 12345');
        await selectHeadingMarkerAndFirstCharacter(view);
        const posAtDOM = vi.spyOn(view, 'posAtDOM').mockImplementation(() => {
            throw new Error('Decoration DOM mapping changed');
        });

        view.dom.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'Backspace',
        }));

        expect(posAtDOM).not.toHaveBeenCalled();
        expect(view.state.doc.firstChild?.type.name).toBe('paragraph');
        expect(view.state.doc.firstChild?.textContent).toBe('2345');
    });

    it('deletes the marker after its transient selection class is removed', async () => {
        const view = await createEditor('# 12345');
        await selectHeadingMarkerAndFirstCharacter(view);
        headingMarkers(view)[0]?.classList.remove('heading-markdown-marker-pointer-selected');

        view.dom.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'Backspace',
        }));

        expect(view.state.doc.firstChild?.type.name).toBe('paragraph');
        expect(view.state.doc.firstChild?.textContent).toBe('2345');
    });

    it('replaces a selected marker and heading text before native DOM input', async () => {
        const view = await createEditor('# 12345');
        await selectHeadingMarkerAndFirstCharacter(view);

        view.dom.dispatchEvent(new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            data: 'Q',
            inputType: 'insertText',
        }));

        expect(view.state.doc.firstChild?.type.name).toBe('paragraph');
        expect(view.state.doc.firstChild?.textContent).toBe('Q2345');
    });

    it.each([
        { data: 'Q', inputType: 'insertReplacementText', text: 'Q2345' },
        { data: null, inputType: 'deleteContentBackward', text: '2345' },
    ])('handles $inputType without relying on keydown', async ({ data, inputType, text }) => {
        const view = await createEditor('# 12345');
        await selectHeadingMarkerAndFirstCharacter(view);

        view.dom.dispatchEvent(new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            data,
            inputType,
        }));

        expect(view.state.doc.firstChild?.type.name).toBe('paragraph');
        expect(view.state.doc.firstChild?.textContent).toBe(text);
    });

    it('deletes the captured marker selection after the live selection moves', async () => {
        const view = await createEditor('# 12345');
        await selectHeadingMarkerAndFirstCharacter(view);
        const deleteCapturedSelection = captureSelectedHeadingMarkerSelection(view);
        expect(deleteCapturedSelection).not.toBeNull();

        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4, 6)));

        expect(deleteCapturedSelection?.()).toBe(true);
        expect(view.state.doc.firstChild?.type.name).toBe('paragraph');
        expect(view.state.doc.firstChild?.textContent).toBe('2345');
    });

    it('converts the heading after native composition commits', async () => {
        const view = await createEditor('# 12345');
        await selectHeadingMarkerAndFirstCharacter(view);

        view.dom.dispatchEvent(new CompositionEvent('compositionstart', {
            bubbles: true,
            data: '',
        }));
        view.dispatch(view.state.tr.insertText('中'));
        view.dom.dispatchEvent(new CompositionEvent('compositionend', {
            bubbles: true,
            data: '中',
        }));
        await Promise.resolve();

        expect(view.state.doc.firstChild?.type.name).toBe('paragraph');
        expect(view.state.doc.firstChild?.textContent).toBe('中2345');
    });

    it('keeps the heading when native composition is cancelled', async () => {
        const view = await createEditor('# 12345');
        await selectHeadingMarkerAndFirstCharacter(view);

        view.dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
        view.dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
        await Promise.resolve();

        expect(view.state.doc.firstChild?.type.name).toBe('heading');
        expect(view.state.doc.firstChild?.textContent).toBe('12345');
    });

    it.each([
        { key: 'Backspace', shiftKey: true },
        { key: 'Delete', ctrlKey: true },
        { key: 'Delete', metaKey: true },
        { altKey: true, key: 'Delete' },
    ])('does not intercept modified $key', async (eventInit) => {
        const view = await createEditor('# 12345');
        await selectHeadingMarkerAndFirstCharacter(view);

        view.dom.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            ...eventInit,
        }));

        expect(view.state.doc.firstChild?.type.name).toBe('heading');
    });

    it('keeps a heading when its text selection does not include the marker', async () => {
        const view = await createEditor('# 12345');
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 2)));

        view.dom.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'Backspace',
        }));

        expect(view.state.doc.firstChild?.type.name).toBe('heading');
    });

    it('selects markers for both populated and empty headings in an editor-wide selection', async () => {
        const view = await createEditor(['# Populated', '', '## ', '', 'Body'].join('\n'));

        view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));

        expect(headingMarkers(view).map((marker) => marker.textContent)).toEqual(['# ', '##']);
        expect(headingMarkers(view).every((marker) => (
            marker.classList.contains('editor-text-selection-overlay')
        ))).toBe(true);
    });

    it('shows headings included in block selection ranges', async () => {
        const view = await createEditor(['# First', '', 'Body', '', '### Third'].join('\n'));
        const firstHeading = view.state.doc.firstChild!;
        const body = view.state.doc.child(1);
        const thirdHeadingPos = firstHeading.nodeSize + body.nodeSize;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(
            view.state.doc,
            firstHeading.nodeSize + 1,
        )));

        const decorations = createActiveHeadingMarkerDecorations(view.state, [
            { from: 0, to: firstHeading.nodeSize },
            { from: thirdHeadingPos, to: thirdHeadingPos + view.state.doc.child(2).nodeSize },
        ]);

        expect(decorations.find()).toHaveLength(2);
    });

    it.each([
        ['# ', '#'],
        ['###### ', '######'],
    ])('shows an empty heading as %s', async (markdown, expectedMarker) => {
        const view = await createEditor(markdown);

        expect(view.state.doc.firstChild?.type.name).toBe('heading');
        expect(headingMarkers(view).map((marker) => marker.textContent)).toEqual([expectedMarker]);
    });

    it('keeps empty heading markers visible when the cursor moves away', async () => {
        const view = await createEditor(['## ', '', 'Body'].join('\n'));
        const paragraphPos = view.state.doc.firstChild?.nodeSize ?? 0;

        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, paragraphPos + 1)));

        expect(headingMarkers(view).map((marker) => marker.textContent)).toEqual(['##']);
        expect(headingMarkers(view)[0]).toHaveClass('heading-markdown-marker-empty');
    });

    it('caps empty heading markers in large notes', async () => {
        const view = await createEditor('');
        const heading = view.state.schema.nodes.heading;
        const nodes = Array.from({ length: 1005 }, () => heading.create({ level: 2 }));
        const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, nodes);

        expect(createEmptyHeadingMarkerDecorations(tr.doc).find()).toHaveLength(1000);
    });

    it('caps active heading scans when a large selection contains no headings', async () => {
        const view = await createEditor('Body');
        const paragraph = view.state.schema.nodes.paragraph;
        const heading = view.state.schema.nodes.heading;
        const nodes = [
            ...Array.from({ length: 5 }, () => paragraph.create()),
            heading.create({ level: 2 }, view.state.schema.text('Beyond scan budget')),
        ];
        const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, nodes);
        const nextState = view.state.apply(
            tr.setSelection(new AllSelection(tr.doc)),
        );

        const decorations = createActiveHeadingMarkerDecorations(nextState, [], 5);

        expect(decorations.find()).toHaveLength(0);
    });

    it('maps empty markers for ordinary paragraph input without rescanning headings', async () => {
        const view = await createEditor(['# Heading', '', 'Body'].join('\n'));
        const oldState = view.state;
        const tr = oldState.tr.insertText(' typed', oldState.doc.content.size - 1);

        expect(transactionMayAffectEmptyHeadingMarkers(
            createEmptyHeadingMarkerDecorations(oldState.doc),
            tr,
            oldState.doc,
            tr.doc,
        )).toBe(false);
    });

    it('rescans markers when deleting heading text creates an empty heading', async () => {
        const view = await createEditor(['# Heading', '', 'Body'].join('\n'));
        const oldState = view.state;
        const tr = oldState.tr.delete(1, 8);

        expect(transactionMayAffectEmptyHeadingMarkers(
            createEmptyHeadingMarkerDecorations(oldState.doc),
            tr,
            oldState.doc,
            tr.doc,
        )).toBe(true);
    });
});
