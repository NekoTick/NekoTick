import { describe, expect, it, vi } from 'vitest';
import { Editor, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';

import { markdownLinkPlugin } from '../links/markdown-link/markdownLinkPlugin';
import { clipboardPlugin } from './clipboardPlugin';

const URL = 'https://example.test/apps/image-source';

function createClipboardData(options: { image?: boolean; text: string; html?: string }) {
    const image = options.image
        ? new File(['image'], 'clipboard.png', { type: 'image/png' })
        : null;

    return {
        files: image ? [image] : [],
        items: image
            ? [{
                kind: 'file',
                type: image.type,
                getAsFile: () => image,
            }]
            : [],
        types: [
            ...(image ? [image.type] : []),
            'text/plain',
            ...(options.html ? ['text/html'] : []),
        ],
        getData(type: string) {
            if (type === 'text/plain') return options.text;
            if (type === 'text/html') return options.html ?? '';
            return '';
        },
    };
}

function simulatePaste(view: any, clipboardData: ReturnType<typeof createClipboardData>) {
    const event = {
        clipboardData,
        preventDefault: vi.fn(),
    };
    let handled = false;

    view.someProp('handlePaste', (handlePaste: any) => {
        const didHandle = handlePaste(view, event, null);
        handled = didHandle || handled;
        return didHandle || undefined;
    });

    return { event, handled };
}

async function createEditor(plugin: typeof clipboardPlugin | typeof markdownLinkPlugin) {
    const editor = Editor.make()
        .config((ctx) => {
            ctx.set(defaultValueCtx, '');
        })
        .use(commonmark)
        .use(plugin);

    await editor.create();
    return editor;
}

describe('image clipboard paste isolation', () => {
    it.each([
        { name: 'plain URL', text: URL },
        {
            name: 'Markdown link and zero-width-prefixed URL',
            text: `[${URL.slice(0, -1)}](${URL})\n\n\u200B${URL}`,
        },
    ])('does not insert companion $name from an image clipboard payload', async ({ text }) => {
        const editor = await createEditor(clipboardPlugin);
        const view = editor.ctx.get(editorViewCtx);

        try {
            const result = simulatePaste(view, createClipboardData({
                image: true,
                text,
                html: `<a href="${URL}">${URL}</a>`,
            }));

            expect(result.handled).toBe(true);
            expect(result.event.preventDefault).toHaveBeenCalledTimes(1);
            expect(view.state.doc.textContent).toBe('');
        } finally {
            await editor.destroy();
        }
    });

    it('does not insert companion Markdown link text from an image clipboard payload', async () => {
        const editor = await createEditor(markdownLinkPlugin);
        const view = editor.ctx.get(editorViewCtx);

        try {
            const result = simulatePaste(view, createClipboardData({
                image: true,
                text: `[${URL}](${URL})`,
            }));

            expect(result.handled).toBe(true);
            expect(result.event.preventDefault).toHaveBeenCalledTimes(1);
            expect(view.state.doc.textContent).toBe('');
        } finally {
            await editor.destroy();
        }
    });

    it('inserts image-only HTML as standalone image paragraphs without companion text', async () => {
        const editor = await createEditor(clipboardPlugin);
        const view = editor.ctx.get(editorViewCtx);

        try {
            const result = simulatePaste(view, createClipboardData({
                text: `[Image source](${URL})`,
                html: [
                    `<a href="${URL}"><img src="https://images.example.test/first.png" alt="First"></a>`,
                    '<img src="https://images.example.test/second.png" alt="Second">',
                ].join(''),
            }));

            expect(result.handled).toBe(true);
            expect(result.event.preventDefault).toHaveBeenCalledTimes(1);
            expect(view.state.doc.textContent).toBe('');
            expect(view.state.doc.childCount).toBe(3);
            expect(view.state.doc.child(0).firstChild?.attrs).toMatchObject({
                src: 'https://images.example.test/first.png',
                alt: 'First',
            });
            expect(view.state.doc.child(1).firstChild?.attrs).toMatchObject({
                src: 'https://images.example.test/second.png',
                alt: 'Second',
            });
            expect(view.state.doc.child(2).childCount).toBe(0);
            expect(view.state.selection.$from.parent).toBe(view.state.doc.child(2));
            expect(view.state.selection.$from.parentOffset).toBe(0);
        } finally {
            await editor.destroy();
        }
    });

    it('leaves image-only HTML to the native parser in the Markdown link handler', async () => {
        const editor = await createEditor(markdownLinkPlugin);
        const view = editor.ctx.get(editorViewCtx);

        try {
            const result = simulatePaste(view, createClipboardData({
                text: `[Image source](${URL})`,
                html: `<a href="${URL}"><img src="https://images.example.test/copied.png"></a>`,
            }));

            expect(result.handled).toBe(false);
            expect(result.event.preventDefault).not.toHaveBeenCalled();
            expect(view.state.doc.textContent).toBe('');
        } finally {
            await editor.destroy();
        }
    });

    it('keeps pure URL paste behavior when the clipboard has no image file', async () => {
        const editor = await createEditor(clipboardPlugin);
        const view = editor.ctx.get(editorViewCtx);

        try {
            const result = simulatePaste(view, createClipboardData({ text: URL }));

            expect(result.handled).toBe(false);
            expect(result.event.preventDefault).not.toHaveBeenCalled();
            expect(view.state.doc.textContent).toBe('');
        } finally {
            await editor.destroy();
        }
    });
});
