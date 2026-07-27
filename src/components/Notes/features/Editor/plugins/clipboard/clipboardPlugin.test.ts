import { describe, expect, it, vi } from 'vitest';
import { Editor, defaultValueCtx, editorViewCtx, remarkStringifyOptionsCtx, serializerCtx } from '@milkdown/kit/core';
import { AllSelection, Selection, TextSelection } from '@milkdown/kit/prose/state';
import { CellSelection } from '@milkdown/kit/prose/tables';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import {
    clipboardPlugin,
    createStandaloneTocPasteNode,
    hasClipboardPayload,
    MAX_INLINE_FOOTNOTE_PASTE_TEXT_CHARS,
    MAX_MARKDOWN_PASTE_CHARS,
} from './clipboardPlugin';
import { dispatchTailBlankClickAction, endBlankClickPlugin } from '../cursor/endBlankClickPlugin';
import { mermaidPlugin } from '../mermaid';
import { mathPlugin } from '../math';
import { codePlugin } from '../code';
import { notesRemarkStringifyOptions } from '../../config/stringifyOptions';
import {
    normalizeSerializedMarkdownDocument,
    stripTrailingNewlines,
} from '@/lib/notes/markdown/markdownSerializationUtils';
import { CHAT_HEADING_DRAG_MIME } from '@/lib/drag/chatHeadingDrag';

const MARKDOWN_BLANK_LINE_COMMENT = '<!--vlaina-markdown-blank-line-->';

function findTextRange(doc: any, text: string): { from: number; to: number } {
    let resolved: { from: number; to: number } | null = null;

    doc.descendants((node: any, pos: number) => {
        if (resolved) return false;
        if (!node.isText || node.text !== text) return;

        resolved = {
            from: pos,
            to: pos + text.length,
        };
        return false;
    });

    if (!resolved) {
        throw new Error(`Unable to resolve text range for "${text}"`);
    }

    return resolved;
}

function findTableCellPos(doc: any, text: string): number {
    let resolved: number | null = null;

    doc.descendants((node: any, pos: number) => {
        if (resolved !== null) return false;
        if (node.type?.name !== 'table_cell' && node.type?.name !== 'table_header') return;
        if (node.textContent !== text) return;

        resolved = pos;
        return false;
    });

    if (resolved === null) {
        throw new Error(`Unable to resolve table cell position for "${text}"`);
    }

    return resolved;
}

function simulateClipboardKeydown(
    view: any,
    init: KeyboardEventInit,
): { handled: boolean; event: KeyboardEvent } {
    const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ...init,
    });

    let handled = false;
    view.someProp('handleKeyDown', (handleKeyDown: any) => {
        handled = handleKeyDown(view, event) || handled;
    });

    return { handled, event };
}

function simulateCopyKeydown(view: any): { handled: boolean; event: KeyboardEvent } {
    return simulateClipboardKeydown(view, { key: 'c', ctrlKey: true });
}

function simulateComposingCopyKeydown(view: any): { handled: boolean; event: KeyboardEvent } {
    return simulateClipboardKeydown(view, { key: 'c', ctrlKey: true, isComposing: true });
}

function simulateCutKeydown(view: any): { handled: boolean; event: KeyboardEvent } {
    return simulateClipboardKeydown(view, { key: 'x', ctrlKey: true });
}

function simulateClipboardEvent(
    view: any,
    type: 'copy' | 'cut',
    options: { clipboardData?: { setData: ReturnType<typeof vi.fn> } | null } = {},
) {
    const clipboardData = {
        setData: vi.fn(),
    };
    const event = {
        clipboardData: options.clipboardData === undefined ? clipboardData : options.clipboardData,
        preventDefault: vi.fn(),
    };

    let handled = false;
    view.someProp('handleDOMEvents', (handleDOMEvents: any) => {
        handled = handleDOMEvents[type]?.(view, event) || handled;
    });

    return { handled, event, clipboardData };
}

function simulateCopyEvent(view: any) {
    return simulateClipboardEvent(view, 'copy');
}

function simulateCutEvent(view: any) {
    return simulateClipboardEvent(view, 'cut');
}

function simulateClipboardEventWithoutData(view: any, type: 'copy' | 'cut') {
    return simulateClipboardEvent(view, type, { clipboardData: null });
}

function simulatePasteText(view: any, text: string): boolean {
    const event = {
        clipboardData: {
            getData(type: string) {
                return type === 'text/plain' ? text : '';
            },
        },
        preventDefault: vi.fn(),
    };

    let handled = false;
    view.someProp('handlePaste', (handlePaste: any) => {
        const didHandle = handlePaste(view, event, null);
        handled = didHandle || handled;
        return didHandle || undefined;
    });
    return handled;
}

function simulatePasteTextWithEvent(view: any, text: string): { handled: boolean; event: { preventDefault: ReturnType<typeof vi.fn> } } {
    const event = {
        clipboardData: {
            getData(type: string) {
                return type === 'text/plain' ? text : '';
            },
        },
        preventDefault: vi.fn(),
    };

    let handled = false;
    view.someProp('handlePaste', (handlePaste: any) => {
        const didHandle = handlePaste(view, event, null);
        handled = didHandle || handled;
        return didHandle || undefined;
    });
    return { handled, event };
}

function simulateDropText(
    view: any,
    text: string,
    pos = 1,
    options: {
        types?: string[];
        getData?: (type: string) => string;
    } = {},
): { handled: boolean; event: { preventDefault: ReturnType<typeof vi.fn> } } {
    const originalPosAtCoords = view.posAtCoords;
    view.posAtCoords = vi.fn(() => ({ pos, inside: -1 }));

    const event = {
        clientX: 12,
        clientY: 24,
        dataTransfer: {
            files: { length: 0 },
            types: options.types ?? ['text/plain'],
            getData(type: string) {
                if (options.getData) return options.getData(type);
                return type === 'text/plain' ? text : '';
            },
        },
        preventDefault: vi.fn(),
    };

    let handled = false;
    try {
        view.someProp('handleDOMEvents', (handleDOMEvents: any) => {
            handled = handleDOMEvents.drop?.(view, event) || handled;
        });
    } finally {
        view.posAtCoords = originalPosAtCoords;
    }

    return { handled, event };
}

function insertEmptyParagraphAfterDocumentEnd(view: any): void {
    const paragraphType = view.state.schema.nodes.paragraph;
    const tr = view.state.tr.insert(view.state.doc.content.size, paragraphType.create());
    const cursorPos = tr.doc.content.size - 1;
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, cursorPos)));
}

describe('createStandaloneTocPasteNode', () => {
    it('creates a toc node for [toc]', () => {
        const node = { type: 'toc-node' } as any;
        const create = vi.fn(() => node);

        const result = createStandaloneTocPasteNode({
            nodes: {
                toc: { create },
            },
        }, '[toc]');

        expect(create).toHaveBeenCalledWith({ maxLevel: 6 });
        expect(result).toBe(node);
    });

    it('creates a toc node for {:toc}', () => {
        const node = { type: 'toc-node' } as any;
        const create = vi.fn(() => node);

        const result = createStandaloneTocPasteNode({
            nodes: {
                toc: { create },
            },
        }, '{:toc}');

        expect(create).toHaveBeenCalledWith({ maxLevel: 6 });
        expect(result).toBe(node);
    });

    it('returns null for non-toc text', () => {
        const create = vi.fn(() => ({ type: 'toc-node' } as any));

        const result = createStandaloneTocPasteNode({
            nodes: {
                toc: { create },
            },
        }, '[to]');

        expect(result).toBeNull();
        expect(create).not.toHaveBeenCalled();
    });

    it('returns null when toc schema is unavailable', () => {
        const result = createStandaloneTocPasteNode({
            nodes: {},
        }, '[toc]');

        expect(result).toBeNull();
    });
});

describe('hasClipboardPayload', () => {
    it('detects clipboard payloads from types without reading clipboard data', () => {
        const getData = vi.fn(() => 'x'.repeat(MAX_MARKDOWN_PASTE_CHARS + 1));
        const event = {
            clipboardData: {
                types: ['text/plain'],
                getData,
            },
        } as unknown as ClipboardEvent;

        expect(hasClipboardPayload(event)).toBe(true);
        expect(getData).not.toHaveBeenCalled();
    });
});

describe('clipboardPlugin copy', () => {
    it('leaves composing Ctrl+C to the input method', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, 'Alpha Beta');
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);
        const range = findTextRange(view.state.doc, 'Alpha Beta');
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, range.from, range.to)));

        const { handled, event } = simulateComposingCopyKeydown(view);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(handled).toBe(false);
        expect(event.defaultPrevented).toBe(false);
        expect(writeText).not.toHaveBeenCalled();

        await editor.destroy();
    });

    it('copies a text selection during Ctrl+C keydown', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '- first bullet\n- second bullet');
                ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                    ...prev,
                    ...notesRemarkStringifyOptions,
                }));
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);
        const firstRange = findTextRange(view.state.doc, 'first bullet');
        const secondRange = findTextRange(view.state.doc, 'second bullet');
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, firstRange.from, secondRange.to)));

        const { handled, event } = simulateCopyKeydown(view);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(handled).toBe(true);
        expect(event.defaultPrevented).toBe(true);
        expect(writeText).toHaveBeenCalledWith('- first bullet\n- second bullet');
        expect(view.state.selection.empty).toBe(true);
        expect(view.state.selection.from).not.toBe(firstRange.from);

        await editor.destroy();
    });

    it('keeps a later selection intact when async Ctrl+C completes after selection moves', async () => {
        let resolveWrite: () => void = () => {
            throw new Error('clipboard write promise was not created');
        };
        const writeText = vi.fn(() => new Promise<void>((resolve) => {
            resolveWrite = resolve;
        }));
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, 'Alpha Beta Gamma');
                ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                    ...prev,
                    ...notesRemarkStringifyOptions,
                }));
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);
        const fullRange = findTextRange(view.state.doc, 'Alpha Beta Gamma');
        const betaFrom = fullRange.from + 'Alpha '.length;
        const betaTo = betaFrom + 'Beta'.length;
        const gammaFrom = fullRange.from + 'Alpha Beta '.length;
        const gammaTo = gammaFrom + 'Gamma'.length;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, betaFrom, betaTo)));

        const { handled, event } = simulateCopyKeydown(view);
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, gammaFrom, gammaTo)));
        resolveWrite();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(handled).toBe(true);
        expect(event.defaultPrevented).toBe(true);
        expect(writeText).toHaveBeenCalledWith('Beta');
        expect(view.state.selection.from).toBe(gammaFrom);
        expect(view.state.selection.to).toBe(gammaTo);

        await editor.destroy();
    });

    it('keeps the original selection when Ctrl+C cannot write to the clipboard', async () => {
        const writeText = vi.fn().mockRejectedValue(new Error('clipboard unavailable'));
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, 'Alpha Beta Gamma');
                ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                    ...prev,
                    ...notesRemarkStringifyOptions,
                }));
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);
        const fullRange = findTextRange(view.state.doc, 'Alpha Beta Gamma');
        const betaFrom = fullRange.from + 'Alpha '.length;
        const betaTo = betaFrom + 'Beta'.length;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, betaFrom, betaTo)));

        const { handled, event } = simulateCopyKeydown(view);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(handled).toBe(true);
        expect(event.defaultPrevented).toBe(true);
        expect(writeText).toHaveBeenCalledWith('Beta');
        expect(view.state.selection.from).toBe(betaFrom);
        expect(view.state.selection.to).toBe(betaTo);

        await editor.destroy();
    });

    it('keeps a later selection intact when native copy falls back after selection moves', async () => {
        let resolveWrite: () => void = () => {
            throw new Error('clipboard write promise was not created');
        };
        const writeText = vi.fn(() => new Promise<void>((resolve) => {
            resolveWrite = resolve;
        }));
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, 'Alpha Beta Gamma');
                ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                    ...prev,
                    ...notesRemarkStringifyOptions,
                }));
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);
        const fullRange = findTextRange(view.state.doc, 'Alpha Beta Gamma');
        const betaFrom = fullRange.from + 'Alpha '.length;
        const betaTo = betaFrom + 'Beta'.length;
        const gammaFrom = fullRange.from + 'Alpha Beta '.length;
        const gammaTo = gammaFrom + 'Gamma'.length;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, betaFrom, betaTo)));

        const { handled, event } = simulateClipboardEventWithoutData(view, 'copy');
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, gammaFrom, gammaTo)));
        resolveWrite();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(handled).toBe(true);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(writeText).toHaveBeenCalledWith('Beta');
        expect(view.state.selection.from).toBe(gammaFrom);
        expect(view.state.selection.to).toBe(gammaTo);

        await editor.destroy();
    });

    it('copies a Ctrl+A all-selection during Ctrl+C keydown', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, 'Alpha\n\nBeta');
                ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                    ...prev,
                    ...notesRemarkStringifyOptions,
                }));
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);
        view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));

        const { handled, event } = simulateCopyKeydown(view);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(handled).toBe(true);
        expect(event.defaultPrevented).toBe(true);
        expect(writeText).toHaveBeenCalledWith('Alpha\n\nBeta');
        expect(view.state.selection).not.toBeInstanceOf(AllSelection);
        expect(view.state.selection.empty).toBe(true);

        await editor.destroy();
    });

    it('copies a text selection during Ctrl+Insert keydown', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, 'Alpha Beta Gamma');
                ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                    ...prev,
                    ...notesRemarkStringifyOptions,
                }));
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);
        const fullRange = findTextRange(view.state.doc, 'Alpha Beta Gamma');
        const betaFrom = fullRange.from + 'Alpha '.length;
        const betaTo = betaFrom + 'Beta'.length;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, betaFrom, betaTo)));

        const { handled, event } = simulateClipboardKeydown(view, { key: 'Insert', ctrlKey: true });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(handled).toBe(true);
        expect(event.defaultPrevented).toBe(true);
        expect(writeText).toHaveBeenCalledWith('Beta');
        expect(view.state.selection.empty).toBe(true);
        expect(view.state.selection.from).not.toBe(betaFrom);

        await editor.destroy();
    });

    it('cuts a text selection during Ctrl+X keydown', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, 'Alpha Beta Gamma');
                ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                    ...prev,
                    ...notesRemarkStringifyOptions,
                }));
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);
        const fullRange = findTextRange(view.state.doc, 'Alpha Beta Gamma');
        const betaFrom = fullRange.from + 'Alpha '.length;
        const betaTo = betaFrom + 'Beta'.length;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, betaFrom, betaTo)));

        const { handled, event } = simulateCutKeydown(view);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(handled).toBe(true);
        expect(event.defaultPrevented).toBe(true);
        expect(writeText).toHaveBeenCalledWith('Beta');
        expect(view.state.doc.textContent).toBe('Alpha  Gamma');

        await editor.destroy();
    });

    it('cuts a text selection during Shift+Delete keydown', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, 'Alpha Beta Gamma');
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);
        const fullRange = findTextRange(view.state.doc, 'Alpha Beta Gamma');
        const betaFrom = fullRange.from + 'Alpha '.length;
        const betaTo = betaFrom + 'Beta'.length;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, betaFrom, betaTo)));

        const { handled, event } = simulateClipboardKeydown(view, { key: 'Delete', shiftKey: true });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(handled).toBe(true);
        expect(event.defaultPrevented).toBe(true);
        expect(writeText).toHaveBeenCalledWith('Beta');
        expect(view.state.doc.textContent).toBe('Alpha  Gamma');

        await editor.destroy();
    });

    it('deletes the original text selection when async Ctrl+X completes after selection moves', async () => {
        let resolveWrite: () => void = () => {
            throw new Error('clipboard write promise was not created');
        };
        const writeText = vi.fn(() => new Promise<void>((resolve) => {
            resolveWrite = resolve;
        }));
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, 'Alpha Beta Gamma');
                ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                    ...prev,
                    ...notesRemarkStringifyOptions,
                }));
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);
        const fullRange = findTextRange(view.state.doc, 'Alpha Beta Gamma');
        const betaFrom = fullRange.from + 'Alpha '.length;
        const betaTo = betaFrom + 'Beta'.length;
        const gammaFrom = fullRange.from + 'Alpha Beta '.length;
        const gammaTo = gammaFrom + 'Gamma'.length;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, betaFrom, betaTo)));

        const { handled, event } = simulateCutKeydown(view);
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, gammaFrom, gammaTo)));
        resolveWrite();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(handled).toBe(true);
        expect(event.defaultPrevented).toBe(true);
        expect(writeText).toHaveBeenCalledWith('Beta');
        expect(view.state.doc.textContent).toBe('Alpha  Gamma');

        await editor.destroy();
    });

    it('cuts a Ctrl+A all-selection during Ctrl+X keydown', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, 'Alpha\n\nBeta');
                ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                    ...prev,
                    ...notesRemarkStringifyOptions,
                }));
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);
        view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));

        const { handled, event } = simulateCutKeydown(view);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(handled).toBe(true);
        expect(event.defaultPrevented).toBe(true);
        expect(writeText).toHaveBeenCalledWith('Alpha\n\nBeta');
        expect(view.state.doc.textContent).toBe('');

        await editor.destroy();
    });

    it('does not delete after native cut fallback when the document changed before copy resolves', async () => {
        let resolveWrite: () => void = () => {
            throw new Error('clipboard write promise was not created');
        };
        const writeText = vi.fn(() => new Promise<void>((resolve) => {
            resolveWrite = resolve;
        }));
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, 'Alpha Beta Gamma');
                ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                    ...prev,
                    ...notesRemarkStringifyOptions,
                }));
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);
        const fullRange = findTextRange(view.state.doc, 'Alpha Beta Gamma');
        const betaFrom = fullRange.from + 'Alpha '.length;
        const betaTo = betaFrom + 'Beta'.length;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, betaFrom, betaTo)));

        const { handled, event } = simulateClipboardEventWithoutData(view, 'cut');
        view.dispatch(view.state.tr.insertText('!', view.state.doc.content.size));
        resolveWrite();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(handled).toBe(true);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(writeText).toHaveBeenCalledWith('Beta');
        expect(view.state.doc.textContent).toBe('Alpha Beta Gamma!');

        await editor.destroy();
    });

    it('cuts a text selection during the native cut event', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, 'Alpha Beta Gamma');
                ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                    ...prev,
                    ...notesRemarkStringifyOptions,
                }));
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);
        const fullRange = findTextRange(view.state.doc, 'Alpha Beta Gamma');
        const betaFrom = fullRange.from + 'Alpha '.length;
        const betaTo = betaFrom + 'Beta'.length;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, betaFrom, betaTo)));

        const { handled, event, clipboardData } = simulateCutEvent(view);

        expect(handled).toBe(true);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(clipboardData.setData).toHaveBeenCalledWith('text/plain', 'Beta');
        expect(view.state.doc.textContent).toBe('Alpha  Gamma');

        await editor.destroy();
    });

    it('copies two selected list lines in the copy event', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '- first bullet\n- second bullet');
                ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                    ...prev,
                    ...notesRemarkStringifyOptions,
                }));
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);
        const firstRange = findTextRange(view.state.doc, 'first bullet');
        const secondRange = findTextRange(view.state.doc, 'second bullet');
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, firstRange.from, secondRange.to)));

        const { handled, event, clipboardData } = simulateCopyEvent(view);

        expect(handled).toBe(true);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(clipboardData.setData).toHaveBeenCalledWith('text/plain', '- first bullet\n- second bullet');
        expect(view.state.selection.empty).toBe(true);
        expect(view.state.selection.from).not.toBe(firstRange.from);

        await editor.destroy();
    });

    it('copies ordinary marked text in the copy event as visible plain text', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '[Example](https://example.com) **Pro $76.80** and `code \\ value`');
                ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                    ...prev,
                    ...notesRemarkStringifyOptions,
                }));
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);
        const from = findTextRange(view.state.doc, 'Example').from;
        const to = findTextRange(view.state.doc, 'code \\ value').to;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));

        const { handled, event, clipboardData } = simulateCopyEvent(view);

        expect(handled).toBe(true);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(clipboardData.setData).toHaveBeenCalledWith('text/plain', 'Example Pro $76.80 and code \\ value');
        const copied = clipboardData.setData.mock.calls[0]?.[1] ?? '';
        expect(copied).not.toContain('[Example]');
        expect(copied).not.toContain('(https://example.com)');
        expect(copied).not.toContain('**');
        expect(copied).not.toContain('`');
        expect(copied).not.toContain('\\$');
        expect(copied).not.toContain('&#x20;');

        await editor.destroy();
    });

    it('copies a single selected table cell in the copy event as cell text', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, [
                    '| newapi | 状态 |',
                    '| --- | --- |',
                    '| 启动 | 正常 |',
                ].join('\n'));
                ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                    ...prev,
                    ...notesRemarkStringifyOptions,
                }));
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);
        const cellPos = findTableCellPos(view.state.doc, '启动');
        view.dispatch(view.state.tr.setSelection(new CellSelection(
            view.state.doc.resolve(cellPos),
            view.state.doc.resolve(cellPos)
        ) as never));

        const { handled, event, clipboardData } = simulateCopyEvent(view);

        expect(handled).toBe(true);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(clipboardData.setData).toHaveBeenCalledWith('text/plain', '启动');
        expect(view.state.selection).not.toBeInstanceOf(CellSelection);
        expect(view.state.selection.empty).toBe(true);

        await editor.destroy();
    });

    it('copies a cell selection during Ctrl+C keydown', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, [
                    '| newapi | 状态 |',
                    '| --- | --- |',
                    '| 启动 | 正常 |',
                ].join('\n'));
                ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                    ...prev,
                    ...notesRemarkStringifyOptions,
                }));
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);
        const cellPos = findTableCellPos(view.state.doc, '启动');
        view.dispatch(view.state.tr.setSelection(new CellSelection(
            view.state.doc.resolve(cellPos),
            view.state.doc.resolve(cellPos)
        ) as never));

        const { handled, event } = simulateCopyKeydown(view);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(handled).toBe(true);
        expect(event.defaultPrevented).toBe(true);
        expect(writeText).toHaveBeenCalledWith('启动');
        expect(view.state.selection).not.toBeInstanceOf(CellSelection);
        expect(view.state.selection.empty).toBe(true);

        await editor.destroy();
    });
});

describe('clipboardPlugin paste', () => {
    it('keeps only the first pasted plain paragraph inside an empty task item', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '- [ ] <br />');
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);
        view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)));

        expect(simulatePasteText(view, [
            '验证码发送主要按“邮箱”限流，不主要按“IP”限流。',
            '',
            '同一个邮箱保持 60 秒只能发一次验证码。这个限制最重要，必须保留。因为不管用户换不换 IP，只',
            '  要攻击目标是同一个邮箱，都不能让它一直刷邮件。',
            '',
            'IP 限流保留，但只作为兜底防刷，不要太严格。',
        ].join('\n'))).toBe(true);

        expect(view.state.doc.childCount).toBe(3);

        const list = view.state.doc.child(0);
        expect(list.type.name).toBe('bullet_list');
        expect(list.childCount).toBe(1);

        const taskItem = list.child(0);
        expect(taskItem.type.name).toBe('list_item');
        expect(taskItem.attrs.checked).toBe(false);
        expect(taskItem.childCount).toBe(1);
        expect(taskItem.textContent).toBe('验证码发送主要按“邮箱”限流，不主要按“IP”限流。');

        expect(view.state.doc.child(1).type.name).toBe('paragraph');
        expect(view.state.doc.child(1).textContent).toBe(
            '同一个邮箱保持 60 秒只能发一次验证码。这个限制最重要，必须保留。因为不管用户换不换 IP，只要攻击目标是同一个邮箱，都不能让它一直刷邮件。',
        );
        expect(view.state.doc.child(2).type.name).toBe('paragraph');
        expect(view.state.doc.child(2).textContent).toBe('IP 限流保留，但只作为兜底防刷，不要太严格。');

        await editor.destroy();
    });

    it('pastes inline markdown into the current empty line instead of the previous line tail', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, 'first');
            })
            .use(commonmark)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);
        insertEmptyParagraphAfterDocumentEnd(view);

        expect(simulatePasteText(view, '**bold**')).toBe(true);

        expect(view.state.doc.childCount).toBe(2);
        expect(view.state.doc.child(0).textContent).toBe('first');
        expect(view.state.doc.child(1).textContent).toBe('bold');

        await editor.destroy();
    });

    it('pastes a standalone inline footnote reference as a footnote node', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, '这是第二个脚注的例子[^note2]。')).toBe(true);

        const inlineNodes: string[] = [];
        let footnoteLabel: string | null = null;
        view.state.doc.child(0).descendants((node) => {
            inlineNodes.push(node.type.name);
            if (node.type.name === 'footnote_reference') {
                footnoteLabel = node.attrs.label;
            }
        });

        expect(view.state.doc.child(0).textContent).toBe('这是第二个脚注的例子。');
        expect(inlineNodes).toContain('footnote_reference');
        expect(footnoteLabel).toBe('note2');

        await editor.destroy();
    });

    it('keeps inline footnote references when mixed with other inline markdown', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, '**加粗** 和 [链接](https://example.com)[^note2]。')).toBe(true);

        const inlineNodes: string[] = [];
        const markNames: string[] = [];
        let footnoteLabel: string | null = null;
        view.state.doc.child(0).descendants((node) => {
            inlineNodes.push(node.type.name);
            markNames.push(...node.marks.map((mark: any) => mark.type.name));
            if (node.type.name === 'footnote_reference') {
                footnoteLabel = node.attrs.label;
            }
        });

        expect(view.state.doc.child(0).textContent).toBe('加粗 和 链接。');
        expect(markNames).toContain('strong');
        expect(markNames).toContain('link');
        expect(inlineNodes).toContain('footnote_reference');
        expect(footnoteLabel).toBe('note2');

        await editor.destroy();
    });

    it('does not scan oversized inline footnote paste text', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);
        const oversizedText = `${'x'.repeat(MAX_INLINE_FOOTNOTE_PASTE_TEXT_CHARS + 1)}[^note2]`;

        expect(simulatePasteText(view, oversizedText)).toBe(false);
        expect(view.state.doc.textContent).toBe('');

        await editor.destroy();
    });

    it('preserves intentional blank lines inside structural markdown paste', async () => {
        const markdown = '# A\n\n\n# B';
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
                ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                    ...prev,
                    ...notesRemarkStringifyOptions,
                }));
            })
            .use(commonmark)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, markdown)).toBe(true);

        expect(view.state.doc.childCount).toBe(4);
        expect(view.state.doc.child(0).textContent).toBe('A');
        expect(view.state.doc.child(1).textContent).toBe('');
        expect(view.state.doc.child(2).textContent).toBe('');
        expect(view.state.doc.child(3).textContent).toBe('B');
        const serializer = editor.ctx.get(serializerCtx);
        expect(stripTrailingNewlines(normalizeSerializedMarkdownDocument(serializer(view.state.doc)))).toBe(
            markdown
        );

        await editor.destroy();
    });

    it('preserves visible blank lines for plain text paste before reopening the note', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
                ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                    ...prev,
                    ...notesRemarkStringifyOptions,
                }));
            })
            .use(commonmark)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, 'Alpha plain text\n\nBeta plain text')).toBe(true);

        expect(view.state.doc.childCount).toBe(3);
        expect(view.state.doc.child(0).textContent).toBe('Alpha plain text');
        expect(view.state.doc.child(1).type.name).toBe('html_block');
        expect(view.state.doc.child(1).attrs.value).toBe(MARKDOWN_BLANK_LINE_COMMENT);
        expect(view.state.doc.child(1).textContent).toBe('');
        expect(view.state.doc.child(2).textContent).toBe('Beta plain text');

        const serializer = editor.ctx.get(serializerCtx);
        expect(stripTrailingNewlines(normalizeSerializedMarkdownDocument(serializer(view.state.doc)))).toBe(
            'Alpha plain text\n\nBeta plain text',
        );

        await editor.destroy();
    });

    it('does not intercept dedicated chat heading drops before the heading drop plugin', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        const { handled, event } = simulateDropText(view, '# Chat Heading', 1, {
            types: [CHAT_HEADING_DRAG_MIME, 'text/plain'],
            getData(type) {
                if (type === CHAT_HEADING_DRAG_MIME) {
                    return JSON.stringify({ level: 2, text: 'Chat Heading' });
                }
                return type === 'text/plain' ? '# Chat Heading' : '';
            },
        });

        expect(handled).toBe(false);
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(view.state.doc.textContent).toBe('');

        await editor.destroy();
    });

    it('handles plain text drops when the chat heading payload is invalid', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        const { handled, event } = simulateDropText(view, 'Dropped A\n\nDropped B', 1, {
            types: [CHAT_HEADING_DRAG_MIME, 'text/plain'],
            getData(type) {
                if (type === CHAT_HEADING_DRAG_MIME) {
                    return 'not-json';
                }
                return type === 'text/plain' ? 'Dropped A\n\nDropped B' : '';
            },
        });

        expect(handled).toBe(true);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(view.state.doc.textContent).toBe('Dropped ADropped B');

        await editor.destroy();
    });

    it('routes dropped plain chat text through persistent markdown blank line nodes', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
                ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                    ...prev,
                    ...notesRemarkStringifyOptions,
                }));
            })
            .use(commonmark)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        const { handled, event } = simulateDropText(view, 'Dropped A\n\n\nDropped B');

        expect(handled).toBe(true);
        expect(event.preventDefault).toHaveBeenCalledTimes(1);
        expect(view.state.doc.childCount).toBe(4);
        expect(view.state.doc.child(0).textContent).toBe('Dropped A');
        expect(view.state.doc.child(1).type.name).toBe('html_block');
        expect(view.state.doc.child(1).attrs.value).toBe(MARKDOWN_BLANK_LINE_COMMENT);
        expect(view.state.doc.child(1).textContent).toBe('');
        expect(view.state.doc.child(2).type.name).toBe('html_block');
        expect(view.state.doc.child(2).attrs.value).toBe(MARKDOWN_BLANK_LINE_COMMENT);
        expect(view.state.doc.child(2).textContent).toBe('');
        expect(view.state.doc.child(3).textContent).toBe('Dropped B');

        const serializer = editor.ctx.get(serializerCtx);
        expect(stripTrailingNewlines(normalizeSerializedMarkdownDocument(serializer(view.state.doc)))).toBe(
            'Dropped A\n\n\nDropped B',
        );

        await editor.destroy();
    });

    it('keeps a pasted ordered list separate after an inline-code paragraph', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, [
            '`mindmap支持是否完整`',
            '3. 表格看看是否需要调整大小',
            '4. ',
            '5. 斜杠工具栏',
            '6. 文件的拖入star',
        ].join('\n'))).toBe(true);

        expect(view.state.doc.childCount).toBe(2);
        expect(view.state.doc.child(0).type.name).toBe('paragraph');
        expect(view.state.doc.child(0).textContent).toBe('mindmap支持是否完整');

        const list = view.state.doc.child(1);
        expect(list.type.name).toBe('ordered_list');
        expect(list.attrs).toMatchObject({ order: 3 });
        expect(list.childCount).toBe(4);
        expect(list.child(0).textContent).toBe('表格看看是否需要调整大小');
        expect(list.child(1).textContent).toBe('');
        expect(list.child(2).textContent).toBe('斜杠工具栏');
        expect(list.child(3).textContent).toBe('文件的拖入star');

        await editor.destroy();
    });

    it('recognizes pasted ordered lists that are missing the marker space', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, ['1.1', '2.1'].join('\n'))).toBe(true);

        expect(view.state.doc.childCount).toBe(1);
        const list = view.state.doc.child(0);
        expect(list.type.name).toBe('ordered_list');
        expect(list.attrs).toMatchObject({ order: 1 });
        expect(list.childCount).toBe(2);
        expect(list.child(0).textContent).toBe('1');
        expect(list.child(1).textContent).toBe('1');

        await editor.destroy();
    });

    it('recognizes pasted blank-separated ordered lists that are missing the marker space', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, ['0.安装更换路径', '', '1.调用笔记', '', '2.切换笔记'].join('\n'))).toBe(true);

        expect(view.state.doc.childCount).toBe(1);
        const list = view.state.doc.child(0);
        expect(list.type.name).toBe('ordered_list');
        expect(list.attrs).toMatchObject({ order: 0 });
        expect(list.childCount).toBe(3);
        expect(list.child(0).textContent).toContain('安装更换路径');
        expect(list.child(1).textContent).toContain('调用笔记');
        expect(list.child(2).textContent).toBe('切换笔记');

        await editor.destroy();
    });

    it('recognizes pasted task lists with malformed checkbox markers', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, ['- [] fsedf', '-[] ', '-[x]done'].join('\n'))).toBe(true);

        expect(view.state.doc.childCount).toBe(1);
        const list = view.state.doc.child(0);
        expect(list.type.name).toBe('bullet_list');
        expect(list.childCount).toBe(3);
        expect(list.child(0).attrs.checked).toBe(false);
        expect(list.child(0).textContent).toBe('fsedf');
        expect(list.child(1).attrs.checked).toBe(false);
        expect(list.child(1).textContent).toBe('');
        expect(list.child(2).attrs.checked).toBe(true);
        expect(list.child(2).textContent).toBe('done');

        await editor.destroy();
    });

    it('keeps the ordered-list tail separate in a realistic pasted Chinese task note', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, [
            '# 3',
            '',
            '1输入不要固定的高度，',
            '',
            ' 测试yt那些',
            '',
            '1. 输入反斜杠东西出来的有点慢',
            '',
            '1. 右键单击图表，将其另存为本地磁盘上的 SVG、PNG 或 JPG 文件。',
            '2. 不同的主题',
            '',
            '1. 表格的渲染太慢了，打开的时候可以看到loadign',
            '2. 检查对',
            '',
            '`mindmap支持是否完整`',
            '3. 表格看看是否需要调整大小',
            '4. ',
            '5. 斜杠工具栏',
            '6. 文件的拖入star',
            '7. todo之后就是会换行',
            '8. 从外部拖动文件进来，就是变成和我们一样的拖动文件的样式',
            '9. 给所有的换图标',
            '10. 这个md的解析和使用直接诶是乱套了',
            '11. 这个merger表格根本用不了',
            '    1. 在他下面弄个反斜杠直接消失了',
            '12. 自动生成的目录部分的高度需要调整',
            '13. 角注需要处理',
            '14. 链接到其他文件',
            '15. 少了直接创建mermed',
            '16. html语法的支持情况',
            '17. 那个图表的话就是记得有主题的lobchat有',
            '18. 在两个公式或图标中怎么插入空行',
            '    1. 然后箭头的移动应该选中',
        ].join('\n'))).toBe(true);

        let mindmapIndex = -1;
        for (let index = 0; index < view.state.doc.childCount; index += 1) {
            if (view.state.doc.child(index).textContent === 'mindmap支持是否完整') {
                mindmapIndex = index;
                break;
            }
        }

        expect(mindmapIndex).toBeGreaterThanOrEqual(0);
        expect(view.state.doc.child(mindmapIndex).type.name).toBe('paragraph');

        const list = view.state.doc.child(mindmapIndex + 1);
        expect(list.type.name).toBe('ordered_list');
        expect(list.attrs).toMatchObject({ order: 3 });
        expect(list.childCount).toBe(16);
        expect(list.textContent).toContain('表格看看是否需要调整大小');
        expect(list.textContent).toContain('然后箭头的移动应该选中');
        expect(list.child(8).textContent).toContain('在他下面弄个反斜杠直接消失了');
        expect(list.child(9).textContent).toBe('自动生成的目录部分的高度需要调整');

        await editor.destroy();
    });

    it('replaces a temporary tail empty line with structural markdown paste', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, 'first');
            })
            .use(commonmark)
            .use(clipboardPlugin)
            .use(endBlankClickPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(dispatchTailBlankClickAction(view)).toBe(true);
        expect(simulatePasteText(view, '- item')).toBe(true);

        expect(view.state.doc.childCount).toBe(2);
        expect(view.state.doc.child(0).textContent).toBe('first');
        expect(view.state.doc.child(1).type.name).toBe('bullet_list');
        expect(view.state.doc.child(1).textContent).toBe('item');

        await editor.destroy();
    });

    it('recognizes pasted markdown tables as table blocks', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n'))).toBe(true);

        const table = view.state.doc.firstChild;
        expect(table?.type.name).toBe('table');
        expect(table?.childCount).toBe(2);
        expect(table?.firstChild?.firstChild?.textContent).toBe('A');
        expect(table?.child(1).child(1).textContent).toBe('2');

        await editor.destroy();
    });

    it('recognizes spreadsheet tab separated paste as a table', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(gfm)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, 'Name\tScore\nAda\t10\nLinus\t9')).toBe(true);

        const table = view.state.doc.firstChild;
        expect(table?.type.name).toBe('table');
        expect(table?.childCount).toBe(3);
        expect(table?.firstChild?.childCount).toBe(2);
        expect(table?.firstChild?.firstChild?.textContent).toBe('Name');
        expect(table?.firstChild?.child(1).textContent).toBe('Score');
        expect(table?.child(1).firstChild?.textContent).toBe('Ada');
        expect(table?.child(1).child(1).textContent).toBe('10');

        await editor.destroy();
    });

    it('recognizes pasted inline math markdown as an inline formula', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(clipboardPlugin)
            .use(mathPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, '$x^2$')).toBe(true);

        const paragraph = view.state.doc.firstChild;
        expect(paragraph?.type.name).toBe('paragraph');
        expect(paragraph?.firstChild?.type.name).toBe('math_inline');
        expect(paragraph?.firstChild?.attrs.latex).toBe('x^2');

        await editor.destroy();
    });

    it('recognizes pasted display math markdown as a formula block', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(clipboardPlugin)
            .use(mathPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, '$$\ndfsdf\n$$')).toBe(true);

        const formula = view.state.doc.firstChild;
        expect(formula?.type.name).toBe('math_block');
        expect(formula?.attrs.latex).toBe('dfsdf');

        await editor.destroy();
    });

    it('recognizes pasted bracket-backslash display math markdown as a formula block', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(clipboardPlugin)
            .use(mathPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, '[\\\nf=\\mu mg\\\n]')).toBe(true);

        const formula = view.state.doc.firstChild;
        expect(formula?.type.name).toBe('math_block');
        expect(formula?.attrs.latex).toBe('f=\\mu mg');

        await editor.destroy();
    });

    it('recognizes pasted bracket-only latex-like display math markdown as a formula block', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(clipboardPlugin)
            .use(mathPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, '[\nf=\\mu mg\n]')).toBe(true);

        const formula = view.state.doc.firstChild;
        expect(formula?.type.name).toBe('math_block');
        expect(formula?.attrs.latex).toBe('f=\\mu mg');

        await editor.destroy();
    });

    it('recognizes pasted bracket-backslash display math with the closer on the formula line', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(clipboardPlugin)
            .use(mathPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, '[\\\na=\\frac{f}{m}=\\mu g]')).toBe(true);

        const formula = view.state.doc.firstChild;
        expect(formula?.type.name).toBe('math_block');
        expect(formula?.attrs.latex).toBe('a=\\frac{f}{m}=\\mu g');

        await editor.destroy();
    });

    it('recognizes standalone mermaid alias fences before falling back to code block paste', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(clipboardPlugin)
            .use(mermaidPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, [
            '```sequence',
            'Alice->Bob: Hello Bob, how are you?',
            'Note right of Bob: Bob thinks',
            'Bob-->Alice: I am good thanks!',
            '```',
        ].join('\n'))).toBe(true);

        const mermaid = view.state.doc.firstChild;
        expect(mermaid?.type.name).toBe('mermaid');
        expect(mermaid?.attrs.code).toBe([
            'sequenceDiagram',
            'Alice->Bob: Hello Bob, how are you?',
            'Note right of Bob: Bob thinks',
            'Bob-->Alice: I am good thanks!',
        ].join('\n'));

        await editor.destroy();
    });

    it('recognizes pasted fenced code as a code block', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(clipboardPlugin)
            .use(codePlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, ['```ts', 'const value = 1;', '```'].join('\n'))).toBe(true);

        const code = view.state.doc.firstChild;
        expect(code?.type.name).toBe('code_block');
        expect(code?.attrs.language).toBe('ts');
        expect(code?.textContent).toBe('const value = 1;');

        await editor.destroy();
    });

    it('recognizes pasted multiple fenced code blocks as separate code blocks', async () => {
        const markdown = [
            '```',
            'first',
            '```',
            '',
            '```',
            'second',
            '```',
        ].join('\n');
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
                ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                    ...prev,
                    ...notesRemarkStringifyOptions,
                }));
            })
            .use(commonmark)
            .use(clipboardPlugin)
            .use(codePlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, markdown)).toBe(true);

        expect(view.state.doc.childCount).toBe(3);
        expect(view.state.doc.child(0).type.name).toBe('code_block');
        expect(view.state.doc.child(0).textContent).toBe('first');
        expect(view.state.doc.child(1).textContent).toBe('');
        expect(view.state.doc.child(2).type.name).toBe('code_block');
        expect(view.state.doc.child(2).textContent).toBe('second');
        const serializer = editor.ctx.get(serializerCtx);
        expect(stripTrailingNewlines(normalizeSerializedMarkdownDocument(serializer(view.state.doc)))).toBe(
            markdown
        );

        await editor.destroy();
    });

    it('uses markdown heading semantics for standalone ATX headings', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, '### issue #123 ###')).toBe(true);

        const heading = view.state.doc.firstChild;
        expect(heading?.type.name).toBe('heading');
        expect(heading?.attrs.level).toBe(3);
        expect(heading?.textContent).toBe('issue #123');

        await editor.destroy();
    });

    it('recognizes pasted markdown fences as editable markdown content', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, ['```md', '# Title', '- item', '```'].join('\n'))).toBe(true);

        expect(view.state.doc.childCount).toBe(2);
        expect(view.state.doc.child(0).type.name).toBe('heading');
        expect(view.state.doc.child(0).textContent).toBe('Title');
        expect(view.state.doc.child(1).type.name).toBe('bullet_list');
        expect(view.state.doc.child(1).textContent).toBe('item');

        await editor.destroy();
    });

    it('leaves plain text paste to the browser default path', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, 'hello world')).toBe(false);

        await editor.destroy();
    });

    it('blocks oversized plain text paste before native insertion', async () => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(clipboardPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        const { handled, event } = simulatePasteTextWithEvent(view, 'x'.repeat(1024 * 1024 + 1));

        expect(handled).toBe(true);
        expect(event.preventDefault).toHaveBeenCalledTimes(1);
        expect(view.state.doc.textContent).toBe('');

        await editor.destroy();
    });

    it.each([
        ['flow', 'flowchart TD'],
        ['flowchart-v2', 'flowchart TD'],
    ])('normalizes pasted %s alias fences that omit the Mermaid directive', async (language, directive) => {
        const editor = Editor.make()
            .config((ctx) => {
                ctx.set(defaultValueCtx, '');
            })
            .use(commonmark)
            .use(clipboardPlugin)
            .use(mermaidPlugin);

        await editor.create();
        const view = editor.ctx.get(editorViewCtx);

        expect(simulatePasteText(view, [
            `\`\`\`${language}`,
            'A --> B',
            '```',
        ].join('\n'))).toBe(true);

        const mermaid = view.state.doc.firstChild;
        expect(mermaid?.type.name).toBe('mermaid');
        expect(mermaid?.attrs.code).toBe([
            directive,
            'A --> B',
        ].join('\n'));

        await editor.destroy();
    });
});
