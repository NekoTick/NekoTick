import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installLinkTooltipEvents } from './linkTooltipEvents';
import { floatingToolbarKey } from '../../floating-toolbar/floatingToolbarKey';
import { TOOLBAR_ACTIONS } from '../../floating-toolbar/types';
import { openEditorLinkHref } from '../utils/openEditorLinkHref';
import { WIKI_LINK_POINTER_SELECTION_META } from '../wiki-link/wikiLinkInteraction';
import { POINTER_SELECTION_ACTIVE_ATTRIBUTE } from '../../selection/textSelectionOverlayState';

const stateMocks = vi.hoisted(() => ({
    selectionNear: vi.fn(),
    textSelectionCreate: vi.fn(),
}));

vi.mock('@milkdown/kit/prose/state', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@milkdown/kit/prose/state')>();
    return {
        ...actual,
        Selection: {
            ...actual.Selection,
            near: stateMocks.selectionNear,
        },
        TextSelection: {
            ...actual.TextSelection,
            create: stateMocks.textSelectionCreate,
        },
    };
});

vi.mock('../utils/openEditorLinkHref', () => ({
    openEditorLinkHref: vi.fn(async () => undefined),
}));

function createHandlers() {
    const editorDom = document.createElement('div');
    const tooltipDom = document.createElement('div');
    const handlers = {
        view: { dom: editorDom } as any,
        dom: tooltipDom,
        showLinkWithDelay: vi.fn(),
        hide: vi.fn(),
        scheduleFocus: vi.fn(),
        reposition: vi.fn(),
        clearHideTimer: vi.fn(),
        startHideTimer: vi.fn(),
        clearShowTimer: vi.fn(),
        setKeyboardInteraction: vi.fn(),
        hasActiveLink: vi.fn(() => false),
    };

    return { editorDom, handlers };
}

async function flushAsyncHandlers() {
    await Promise.resolve();
}

function useTextSelectionCapableView(
    editorDom: HTMLElement,
    handlers: ReturnType<typeof createHandlers>['handlers'],
    resolvePos: (point: { left: number; top: number }) => number = () => 5,
) {
    document.body.appendChild(editorDom);
    const doc = {
        content: { size: 40 },
        resolve: vi.fn(() => ({ parent: { inlineContent: true } })),
    };
    const tr = {
        setMeta: vi.fn(() => tr),
        setSelection: vi.fn(() => tr),
        scrollIntoView: vi.fn(() => tr),
    };
    handlers.view = {
        dom: editorDom,
        state: {
            doc,
            tr,
        },
        dispatch: vi.fn(),
        focus: vi.fn(),
        hasFocus: vi.fn(() => true),
        posAtCoords: vi.fn((point: { left: number; top: number }) => ({ pos: resolvePos(point) })),
    } as any;

    return { doc, tr };
}

function stubClientRect(element: HTMLElement, rect: Partial<DOMRect>) {
    const nextRect = {
        bottom: rect.bottom ?? 20,
        height: rect.height ?? 20,
        left: rect.left ?? 0,
        right: rect.right ?? 80,
        top: rect.top ?? 0,
        width: rect.width ?? 80,
        x: rect.x ?? rect.left ?? 0,
        y: rect.y ?? rect.top ?? 0,
        toJSON: () => ({}),
    } as DOMRect;
    Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: () => nextRect,
    });
    Object.defineProperty(element, 'getClientRects', {
        configurable: true,
        value: () => [nextRect],
    });
}

describe('installLinkTooltipEvents', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        stateMocks.selectionNear.mockReset();
        stateMocks.textSelectionCreate.mockReset();
        stateMocks.selectionNear.mockReturnValue({ type: 'near-selection' });
        stateMocks.textSelectionCreate.mockReturnValue({ type: 'text-selection' });
    });

    it('coalesces editing tooltip repositioning while scrolling', () => {
        const frameCallbacks: FrameRequestCallback[] = [];
        const requestAnimationFrameSpy = vi
            .spyOn(window, 'requestAnimationFrame')
            .mockImplementation((callback) => {
                frameCallbacks.push(callback);
                return frameCallbacks.length;
            });
        const { handlers } = createHandlers();
        handlers.dom.setAttribute('data-editing', 'true');
        const cleanup = installLinkTooltipEvents(handlers);

        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('scroll'));

        expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
        expect(handlers.reposition).not.toHaveBeenCalled();
        frameCallbacks[0]?.(0);
        expect(handlers.reposition).toHaveBeenCalledTimes(1);

        cleanup();
        requestAnimationFrameSpy.mockRestore();
    });

    it('opens keyboard-activated editor links through the shared link opener', async () => {
        const { editorDom, handlers } = createHandlers();
        const link = document.createElement('a');
        link.href = 'http://127.0.0.1:3000/private.md';
        link.textContent = 'local';
        editorDom.appendChild(link);

        const cleanup = installLinkTooltipEvents(handlers);
        const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            detail: 0,
        });

        link.dispatchEvent(event);
        await flushAsyncHandlers();

        expect(event.defaultPrevented).toBe(true);
        expect(openEditorLinkHref).toHaveBeenCalledWith('http://127.0.0.1:3000/private.md', {
            view: handlers.view,
        });

        cleanup();
    });

    it('leaves generated TOC links for the TOC click handler', async () => {
        const { editorDom, handlers } = createHandlers();
        const link = document.createElement('a');
        link.className = 'toc-link';
        link.dataset.headingPos = '12';
        link.href = '#';
        link.textContent = 'Heading';
        editorDom.appendChild(link);
        const tocClickHandler = vi.fn();
        link.addEventListener('click', tocClickHandler);

        const cleanup = installLinkTooltipEvents(handlers);
        const mouseDown = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            detail: 1,
            button: 0,
            buttons: 1,
        });
        const click = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            detail: 1,
            button: 0,
        });

        link.dispatchEvent(mouseDown);
        link.dispatchEvent(click);
        await flushAsyncHandlers();

        expect(mouseDown.defaultPrevented).toBe(false);
        expect(click.defaultPrevented).toBe(false);
        expect(tocClickHandler).toHaveBeenCalledOnce();
        expect(openEditorLinkHref).not.toHaveBeenCalled();

        cleanup();
    });

    it('keeps mouse-activated editor links editable after preparing text selection', async () => {
        const { editorDom, handlers } = createHandlers();
        const link = document.createElement('a');
        link.href = 'https://example.com/docs';
        link.textContent = 'docs';
        editorDom.appendChild(link);
        const { doc, tr } = useTextSelectionCapableView(editorDom, handlers);

        const cleanup = installLinkTooltipEvents(handlers);
        const mouseDown = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            detail: 1,
            button: 0,
            buttons: 1,
            clientX: 10,
            clientY: 10,
        });
        const mouseUp = new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: 10,
            clientY: 10,
        });
        const click = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            detail: 1,
        });

        link.dispatchEvent(mouseDown);
        document.dispatchEvent(mouseUp);
        await flushAsyncHandlers();

        expect(mouseDown.defaultPrevented).toBe(true);
        expect(handlers.clearShowTimer).not.toHaveBeenCalled();
        expect(handlers.hide).not.toHaveBeenCalled();
        expect(tr.setMeta).not.toHaveBeenCalledWith(floatingToolbarKey, { type: TOOLBAR_ACTIONS.HIDE });
        expect(openEditorLinkHref).not.toHaveBeenCalled();

        link.dispatchEvent(click);
        await flushAsyncHandlers();

        expect(click.defaultPrevented).toBe(true);
        expect(stateMocks.textSelectionCreate).toHaveBeenCalledWith(doc, 5, 5);
        expect(handlers.view.dispatch).toHaveBeenCalled();
        expect(handlers.hide).not.toHaveBeenCalled();
        expect(tr.setMeta).not.toHaveBeenCalledWith(floatingToolbarKey, { type: TOOLBAR_ACTIONS.HIDE });
        expect(openEditorLinkHref).not.toHaveBeenCalled();

        cleanup();
        editorDom.remove();
    });

    it('keeps wiki links editable after a plain click and supports drag selection', async () => {
        const { editorDom, handlers } = createHandlers();
        const link = document.createElement('span');
        link.className = 'wiki-link';
        link.dataset.wikiLinkTarget = 'Project Beta';
        link.textContent = 'the beta note';
        editorDom.appendChild(link);
        const { doc, tr } = useTextSelectionCapableView(
            editorDom,
            handlers,
            ({ left }) => left < 50 ? 5 : 15,
        );

        const cleanup = installLinkTooltipEvents(handlers);
        const mouseDown = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: 1,
            clientX: 10,
            clientY: 10,
        });
        const mouseMove = new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            buttons: 1,
            clientX: 100,
            clientY: 10,
        });
        const mouseUp = new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: 100,
            clientY: 10,
        });
        const click = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            detail: 1,
            clientX: 100,
            clientY: 10,
        });

        link.dispatchEvent(mouseDown);
        document.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            buttons: 0,
            clientX: 10,
            clientY: 10,
        }));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        document.dispatchEvent(mouseMove);
        document.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            buttons: 0,
            clientX: 100,
            clientY: 10,
        }));
        document.dispatchEvent(mouseUp);
        link.dispatchEvent(click);
        await flushAsyncHandlers();

        expect(mouseDown.defaultPrevented).toBe(true);
        expect(mouseMove.defaultPrevented).toBe(true);
        expect(mouseUp.defaultPrevented).toBe(true);
        expect(click.defaultPrevented).toBe(true);
        expect(stateMocks.textSelectionCreate).toHaveBeenCalledWith(doc, 5, 5);
        expect(stateMocks.textSelectionCreate).toHaveBeenCalledWith(doc, 5, 15);
        expect(tr.setMeta).toHaveBeenCalledWith(floatingToolbarKey, { type: TOOLBAR_ACTIONS.HIDE });
        expect(tr.setMeta).toHaveBeenCalledWith(WIKI_LINK_POINTER_SELECTION_META, true);
        expect(openEditorLinkHref).not.toHaveBeenCalled();

        cleanup();
        editorDom.remove();
    });

    it('places a wiki-link caret at the resolved right edge instead of the previous character', async () => {
        const { editorDom, handlers } = createHandlers();
        const link = document.createElement('span');
        link.className = 'wiki-link';
        link.dataset.wikiLinkTarget = 'Project Beta';
        link.textContent = 'the beta note';
        editorDom.appendChild(link);
        const { doc } = useTextSelectionCapableView(editorDom, handlers, () => 15);

        const cleanup = installLinkTooltipEvents(handlers);
        const click = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            detail: 1,
            clientX: 100,
            clientY: 10,
        });

        link.dispatchEvent(click);
        await flushAsyncHandlers();

        expect(click.defaultPrevented).toBe(true);
        expect(stateMocks.textSelectionCreate).toHaveBeenCalledWith(doc, 15, 15);

        cleanup();
        editorDom.remove();
    });

    it('does not replay a wiki-link click after its pointer session expands the source', async () => {
        const { editorDom, handlers } = createHandlers();
        const link = document.createElement('span');
        link.className = 'wiki-link';
        link.dataset.wikiLinkTarget = 'Project Beta';
        link.textContent = 'the beta note';
        editorDom.appendChild(link);
        const { doc } = useTextSelectionCapableView(
            editorDom,
            handlers,
            ({ left }) => left < 50 ? 15 : 31,
        );

        const cleanup = installLinkTooltipEvents(handlers);
        link.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: 1,
            clientX: 10,
            clientY: 10,
        }));
        document.dispatchEvent(new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: 10,
            clientY: 10,
        }));
        const click = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            detail: 1,
            clientX: 100,
            clientY: 10,
        });
        link.dispatchEvent(click);
        await flushAsyncHandlers();

        expect(click.defaultPrevented).toBe(true);
        expect(stateMocks.textSelectionCreate).toHaveBeenCalledWith(doc, 15, 15);
        expect(stateMocks.textSelectionCreate).not.toHaveBeenCalledWith(doc, 31, 31);

        cleanup();
        editorDom.remove();
    });

    it('leaves expanded wiki-link source drag selection to the browser', () => {
        const { editorDom, handlers } = createHandlers();
        const source = document.createElement('span');
        source.className = 'wiki-link-expanded';
        source.dataset.wikiLinkExpanded = 'true';
        source.dataset.wikiLinkTarget = 'Project Beta';
        source.textContent = '[[Project Beta|the beta note]]';
        editorDom.appendChild(source);
        useTextSelectionCapableView(editorDom, handlers);

        const cleanup = installLinkTooltipEvents(handlers);
        const mouseDown = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: 1,
            clientX: 10,
            clientY: 10,
        });
        source.dispatchEvent(mouseDown);

        expect(mouseDown.defaultPrevented).toBe(false);
        expect(handlers.view.dispatch).not.toHaveBeenCalled();

        cleanup();
        editorDom.remove();
    });

    it('leaves an outer expanded wiki-link source boundary to the wiki-link pointer handler', () => {
        const { editorDom, handlers } = createHandlers();
        const sourceMark = document.createElement('span');
        sourceMark.dataset.wikiLinkSource = 'true';
        const source = document.createElement('span');
        source.className = 'wiki-link-expanded';
        source.dataset.wikiLinkExpanded = 'true';
        source.textContent = '[[Project Beta|the beta note]]';
        sourceMark.appendChild(source);
        editorDom.appendChild(sourceMark);
        useTextSelectionCapableView(editorDom, handlers);

        const cleanup = installLinkTooltipEvents(handlers);
        const downstreamMouseDown = vi.fn();
        editorDom.addEventListener('mousedown', downstreamMouseDown, true);
        const mouseDown = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: 1,
            clientX: 10,
            clientY: 10,
        });
        sourceMark.dispatchEvent(mouseDown);

        expect(mouseDown.defaultPrevented).toBe(false);
        expect(downstreamMouseDown).toHaveBeenCalledOnce();
        expect(handlers.hide).toHaveBeenCalledWith(true);
        expect(handlers.view.dispatch).not.toHaveBeenCalled();

        cleanup();
        editorDom.remove();
    });

    it('starts text selection inside a folded wiki-link source', () => {
        const { editorDom, handlers } = createHandlers();
        const sourceMark = document.createElement('span');
        sourceMark.dataset.wikiLinkSource = 'true';
        const link = document.createElement('span');
        link.className = 'wiki-link';
        link.dataset.wikiLinkTarget = 'Project Beta';
        link.textContent = 'the beta note';
        sourceMark.appendChild(link);
        editorDom.appendChild(sourceMark);
        useTextSelectionCapableView(editorDom, handlers);

        const cleanup = installLinkTooltipEvents(handlers);
        const mouseDown = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: 1,
            clientX: 10,
            clientY: 10,
        });
        link.dispatchEvent(mouseDown);
        document.dispatchEvent(new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: 10,
            clientY: 10,
        }));

        expect(mouseDown.defaultPrevented).toBe(true);
        expect(handlers.view.dispatch).toHaveBeenCalled();

        cleanup();
        editorDom.remove();
    });

    it('preserves an external drag selection when mouseup is followed by a link click', async () => {
        const { editorDom, handlers } = createHandlers();
        const plainText = document.createElement('span');
        plainText.textContent = 'before';
        const link = document.createElement('span');
        link.className = 'wiki-link';
        link.dataset.wikiLinkTarget = 'Project Beta';
        link.textContent = 'the beta note';
        editorDom.appendChild(plainText);
        editorDom.appendChild(link);
        useTextSelectionCapableView(editorDom, handlers);
        handlers.dom.classList.add('hidden');

        const cleanup = installLinkTooltipEvents(handlers);
        plainText.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: 1,
            clientX: 10,
            clientY: 10,
        }));
        document.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            buttons: 1,
            clientX: 100,
            clientY: 10,
        }));
        link.dispatchEvent(new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: 100,
            clientY: 10,
        }));
        const click = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            detail: 1,
            clientX: 100,
            clientY: 10,
        });
        link.dispatchEvent(click);
        await flushAsyncHandlers();

        expect(click.defaultPrevented).toBe(true);
        expect(handlers.view.dispatch).not.toHaveBeenCalled();

        cleanup();
        editorDom.remove();
    });

    it('leaves wiki double-click selection to the browser', () => {
        const { editorDom, handlers } = createHandlers();
        const link = document.createElement('span');
        link.className = 'wiki-link';
        link.dataset.wikiLinkTarget = 'Project Beta';
        link.textContent = 'the beta note';
        editorDom.appendChild(link);
        useTextSelectionCapableView(editorDom, handlers);

        const cleanup = installLinkTooltipEvents(handlers);
        const doubleClick = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            detail: 2,
        });

        link.dispatchEvent(doubleClick);

        expect(doubleClick.defaultPrevented).toBe(false);
        expect(openEditorLinkHref).not.toHaveBeenCalled();

        cleanup();
        editorDom.remove();
    });

    it('does not replay a link pointer position after the document changes', () => {
        const { editorDom, handlers } = createHandlers();
        const link = document.createElement('a');
        link.href = 'https://example.com/docs';
        link.textContent = 'docs';
        editorDom.appendChild(link);
        const { doc } = useTextSelectionCapableView(editorDom, handlers);
        const cleanup = installLinkTooltipEvents(handlers);

        link.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: 1,
            clientX: 10,
            clientY: 10,
        }));
        handlers.view.dispatch.mockClear();
        handlers.view.state.doc = { ...doc };
        const mouseUp = new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: 10,
            clientY: 10,
        });

        document.dispatchEvent(mouseUp);

        expect(mouseUp.defaultPrevented).toBe(false);
        expect(handlers.view.dispatch).not.toHaveBeenCalled();

        cleanup();
        editorDom.remove();
    });

    it('shows editor link tooltips when a list item is the pointer target', () => {
        const { editorDom, handlers } = createHandlers();
        const listItem = document.createElement('li');
        const link = document.createElement('a');
        link.href = 'https://example.com/docs';
        link.textContent = 'docs';
        stubClientRect(link, { left: 5, right: 45, top: 5, bottom: 25, width: 40, height: 20 });
        listItem.appendChild(link);
        editorDom.appendChild(listItem);

        const cleanup = installLinkTooltipEvents(handlers);
        listItem.dispatchEvent(new MouseEvent('mouseover', {
            bubbles: true,
            cancelable: true,
            clientX: 12,
            clientY: 12,
        }));

        expect(handlers.clearHideTimer).toHaveBeenCalled();
        expect(handlers.showLinkWithDelay).toHaveBeenCalledWith(link, false);

        cleanup();
    });

    it('does not scan the entire editor for a hover on the editor root', () => {
        const { editorDom, handlers } = createHandlers();
        const link = document.createElement('a');
        link.href = 'https://example.com/docs';
        link.textContent = 'docs';
        const getClientRects = vi.fn(() => [{
            left: 5,
            right: 45,
            top: 5,
            bottom: 25,
            width: 40,
            height: 20,
        }] as unknown as DOMRectList);
        link.getClientRects = getClientRects;
        editorDom.appendChild(link);

        const cleanup = installLinkTooltipEvents(handlers);
        editorDom.dispatchEvent(new MouseEvent('mouseover', {
            bubbles: true,
            cancelable: true,
            clientX: 12,
            clientY: 12,
        }));

        expect(getClientRects).not.toHaveBeenCalled();
        expect(handlers.showLinkWithDelay).not.toHaveBeenCalled();

        cleanup();
    });

    it('shows editor link tooltips without changing an existing block selection', () => {
        const { editorDom, handlers } = createHandlers();
        const link = document.createElement('a');
        link.href = 'https://example.com/docs';
        link.textContent = 'docs';
        editorDom.appendChild(link);
        handlers.view.state = { selectedBlocks: [{ from: 1, to: 5 }] };

        const cleanup = installLinkTooltipEvents(handlers);
        link.dispatchEvent(new MouseEvent('mouseover', {
            bubbles: true,
            cancelable: true,
            clientX: 12,
            clientY: 12,
        }));

        expect(handlers.clearHideTimer).toHaveBeenCalled();
        expect(handlers.showLinkWithDelay).toHaveBeenCalledWith(link, false);
        expect(handlers.view.state.selectedBlocks).toEqual([{ from: 1, to: 5 }]);
        expect(handlers.hide).not.toHaveBeenCalled();

        cleanup();
    });

    it('does not resolve link hover targets while the Notes viewport is scrolling', () => {
        const { editorDom, handlers } = createHandlers();
        editorDom.dataset.noteScrollRoot = 'true';
        editorDom.dataset.overlayScrollbarInteracting = 'true';
        const link = document.createElement('a');
        link.href = 'https://example.com/docs';
        link.textContent = 'docs';
        editorDom.appendChild(link);

        const cleanup = installLinkTooltipEvents(handlers);
        link.dispatchEvent(new MouseEvent('mouseover', {
            bubbles: true,
            cancelable: true,
            clientX: 12,
            clientY: 12,
        }));

        expect(handlers.clearShowTimer).toHaveBeenCalled();
        expect(handlers.showLinkWithDelay).not.toHaveBeenCalled();

        cleanup();
    });

    it('does not scan link layouts while pointer text selection is active', () => {
        const { editorDom, handlers } = createHandlers();
        const paragraph = document.createElement('p');
        const link = document.createElement('a');
        const getClientRects = vi.fn(() => []);
        link.href = 'https://example.com/docs';
        link.textContent = 'docs';
        Object.defineProperty(link, 'getClientRects', {
            configurable: true,
            value: getClientRects,
        });
        paragraph.appendChild(link);
        editorDom.appendChild(paragraph);
        editorDom.setAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE, 'true');
        handlers.hasActiveLink.mockReturnValue(true);

        const cleanup = installLinkTooltipEvents(handlers);
        paragraph.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            buttons: 1,
            clientX: 120,
            clientY: 12,
        }));

        expect(getClientRects).not.toHaveBeenCalled();
        expect(handlers.clearShowTimer).toHaveBeenCalled();
        expect(handlers.hide).toHaveBeenCalledWith(true);
        expect(handlers.showLinkWithDelay).not.toHaveBeenCalled();

        cleanup();
    });

    it('does not open or keep a link tooltip while block drag selection is pending', () => {
        const { editorDom, handlers } = createHandlers();
        const link = document.createElement('a');
        link.href = 'https://example.com/docs';
        link.textContent = 'docs';
        editorDom.appendChild(link);
        editorDom.classList.add('editor-block-selection-pending');
        handlers.hasActiveLink.mockReturnValue(true);

        const cleanup = installLinkTooltipEvents(handlers);
        link.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            buttons: 1,
            clientX: 12,
            clientY: 12,
        }));

        expect(handlers.clearShowTimer).toHaveBeenCalled();
        expect(handlers.hide).toHaveBeenCalledWith(true);
        expect(handlers.showLinkWithDelay).not.toHaveBeenCalled();

        cleanup();
    });

    it('lets an editor blank-area block selection start while the link tooltip is visible', () => {
        const { editorDom, handlers } = createHandlers();
        editorDom.setAttribute('data-note-scroll-root', 'true');
        document.body.appendChild(editorDom);
        handlers.hasActiveLink.mockReturnValue(true);
        handlers.hide.mockImplementation(() => handlers.dom.classList.add('hidden'));
        const blockSelectionStart = vi.fn();
        editorDom.addEventListener('mousedown', blockSelectionStart);

        const cleanup = installLinkTooltipEvents(handlers);
        const mouseDown = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: 1,
            clientX: 12,
            clientY: 12,
        });

        editorDom.dispatchEvent(mouseDown);

        expect(handlers.hide).toHaveBeenCalledWith(true);
        expect(mouseDown.defaultPrevented).toBe(false);
        expect(blockSelectionStart).toHaveBeenCalledTimes(1);

        cleanup();
        editorDom.remove();
    });

    it('skips structural coordinate positions when closing the tooltip selection', () => {
        const { editorDom, handlers } = createHandlers();
        const text = document.createElement('span');
        text.textContent = 'plain text';
        editorDom.appendChild(text);
        const { doc } = useTextSelectionCapableView(editorDom, handlers, () => 5);
        doc.resolve.mockImplementation((pos?: number) => ({
            parent: { inlineContent: pos === 7 },
        }));
        handlers.view.state.selection = { empty: false, from: 1, to: 7 };

        const cleanup = installLinkTooltipEvents(handlers);
        text.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: 1,
            clientX: 10,
            clientY: 10,
        }));

        expect(stateMocks.textSelectionCreate).toHaveBeenCalledWith(doc, 7);
        expect(stateMocks.textSelectionCreate).not.toHaveBeenCalledWith(doc, 5);
        expect(handlers.view.dispatch).toHaveBeenCalledTimes(1);

        cleanup();
        editorDom.remove();
    });

    it('shows editor link tooltips when the pointer moves onto a link inside the same list item', () => {
        const { editorDom, handlers } = createHandlers();
        const listItem = document.createElement('li');
        const link = document.createElement('a');
        link.href = 'https://example.com/docs';
        link.textContent = 'docs';
        stubClientRect(link, { left: 50, right: 90, top: 5, bottom: 25, width: 40, height: 20 });
        listItem.appendChild(link);
        editorDom.appendChild(listItem);

        const cleanup = installLinkTooltipEvents(handlers);
        listItem.dispatchEvent(new MouseEvent('mouseover', {
            bubbles: true,
            cancelable: true,
            clientX: 12,
            clientY: 12,
        }));
        listItem.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            clientX: 55,
            clientY: 12,
        }));

        expect(handlers.showLinkWithDelay).toHaveBeenCalledTimes(1);
        expect(handlers.showLinkWithDelay).toHaveBeenCalledWith(link, false);

        cleanup();
    });

    it('clears a pending link tooltip when the pointer leaves before it appears', () => {
        const { editorDom, handlers } = createHandlers();
        const link = document.createElement('a');
        link.href = 'https://example.com/docs';
        link.textContent = 'docs';
        editorDom.appendChild(link);

        const cleanup = installLinkTooltipEvents(handlers);
        link.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            clientX: 12,
            clientY: 12,
        }));
        link.dispatchEvent(new MouseEvent('mouseout', {
            bubbles: true,
            cancelable: true,
            clientX: 46,
            clientY: 12,
        }));

        expect(handlers.showLinkWithDelay).toHaveBeenCalledWith(link, false);
        expect(handlers.clearShowTimer).toHaveBeenCalled();
        expect(handlers.startHideTimer).not.toHaveBeenCalled();

        cleanup();
    });

    it('selects editor link text when a list item receives the mouse down', async () => {
        const { editorDom, handlers } = createHandlers();
        const listItem = document.createElement('li');
        const link = document.createElement('a');
        link.href = 'https://example.com/docs';
        link.textContent = 'docs';
        stubClientRect(link, { left: 5, right: 45, top: 5, bottom: 25, width: 40, height: 20 });
        listItem.appendChild(link);
        editorDom.appendChild(listItem);
        const { doc, tr } = useTextSelectionCapableView(editorDom, handlers);

        const cleanup = installLinkTooltipEvents(handlers);
        const mouseDown = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: 1,
            clientX: 12,
            clientY: 12,
        });
        listItem.dispatchEvent(mouseDown);
        document.dispatchEvent(new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: 12,
            clientY: 12,
        }));
        await flushAsyncHandlers();

        expect(mouseDown.defaultPrevented).toBe(true);
        expect(handlers.clearShowTimer).not.toHaveBeenCalled();
        expect(handlers.hide).not.toHaveBeenCalled();
        expect(stateMocks.textSelectionCreate).toHaveBeenCalledWith(doc, 5, 5);
        expect(tr.setMeta).not.toHaveBeenCalledWith(floatingToolbarKey, { type: TOOLBAR_ACTIONS.HIDE });
        expect(openEditorLinkHref).not.toHaveBeenCalled();

        cleanup();
        editorDom.remove();
    });

    it('keeps the tooltip visible when a plain editor link click prepares text selection', async () => {
        const { editorDom, handlers } = createHandlers();
        const link = document.createElement('a');
        link.href = 'https://example.com/docs';
        link.textContent = 'docs';
        editorDom.appendChild(link);
        const { doc, tr } = useTextSelectionCapableView(editorDom, handlers);

        const cleanup = installLinkTooltipEvents(handlers);
        const click = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            detail: 1,
            clientX: 10,
            clientY: 10,
        });

        link.dispatchEvent(click);
        await flushAsyncHandlers();

        expect(click.defaultPrevented).toBe(true);
        expect(handlers.clearShowTimer).not.toHaveBeenCalled();
        expect(handlers.hide).not.toHaveBeenCalled();
        expect(stateMocks.textSelectionCreate).toHaveBeenCalledWith(doc, 5, 5);
        expect(tr.setMeta).not.toHaveBeenCalledWith(floatingToolbarKey, { type: TOOLBAR_ACTIONS.HIDE });
        expect(openEditorLinkHref).not.toHaveBeenCalled();

        cleanup();
        editorDom.remove();
    });

    it('selects editor link text while dragging and suppresses the follow-up click', async () => {
        const { editorDom, handlers } = createHandlers();
        const link = document.createElement('a');
        link.href = 'https://example.com/docs';
        link.textContent = 'docs';
        editorDom.appendChild(link);
        const { doc, tr } = useTextSelectionCapableView(
            editorDom,
            handlers,
            ({ left }) => left < 50 ? 5 : 15,
        );

        const cleanup = installLinkTooltipEvents(handlers);
        const mouseDown = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: 1,
            clientX: 10,
            clientY: 10,
        });
        const mouseMove = new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            buttons: 1,
            clientX: 100,
            clientY: 10,
        });
        const mouseUp = new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: 100,
            clientY: 10,
        });
        const click = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            detail: 1,
        });

        link.dispatchEvent(mouseDown);
        document.dispatchEvent(mouseMove);
        expect(handlers.hide).toHaveBeenCalledWith(true);
        document.dispatchEvent(mouseUp);
        link.dispatchEvent(click);
        await flushAsyncHandlers();

        expect(mouseDown.defaultPrevented).toBe(true);
        expect(mouseMove.defaultPrevented).toBe(true);
        expect(mouseUp.defaultPrevented).toBe(true);
        expect(click.defaultPrevented).toBe(true);
        expect(handlers.clearShowTimer).toHaveBeenCalled();
        expect(handlers.hide).toHaveBeenCalledWith(true);
        expect(tr.setMeta).toHaveBeenCalledWith(floatingToolbarKey, { type: TOOLBAR_ACTIONS.HIDE });
        expect(stateMocks.textSelectionCreate).toHaveBeenCalledWith(doc, 5, 5);
        expect(stateMocks.textSelectionCreate).toHaveBeenCalledWith(doc, 5, 15);
        expect(handlers.view.dispatch).toHaveBeenCalled();
        expect(openEditorLinkHref).not.toHaveBeenCalled();

        cleanup();
        editorDom.remove();
    });

    it('hides the tooltip and collapses selected editor text when clicking non-link content', () => {
        const { editorDom, handlers } = createHandlers();
        const blankText = document.createElement('span');
        const doc = {
            content: { size: 40 },
            resolve: vi.fn((pos: number) => ({ pos, parent: { inlineContent: true } })),
        };
        const tr = {
            doc,
            setMeta: vi.fn(() => tr),
            setSelection: vi.fn(() => tr),
        };
        handlers.view = {
            dom: editorDom,
            state: {
                doc,
                selection: {
                    from: 3,
                    to: 8,
                    empty: false,
                },
                tr,
            },
            dispatch: vi.fn(),
            focus: vi.fn(),
            posAtCoords: vi.fn(() => ({ pos: 12 })),
        } as any;
        editorDom.appendChild(blankText);

        const cleanup = installLinkTooltipEvents(handlers);
        const mouseDown = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            clientX: 7,
            clientY: 11,
        });

        blankText.dispatchEvent(mouseDown);

        expect(mouseDown.defaultPrevented).toBe(true);
        expect(handlers.setKeyboardInteraction).toHaveBeenCalledWith(false);
        expect(handlers.hide).toHaveBeenCalledWith(true);
        expect(handlers.view.posAtCoords).toHaveBeenCalledWith({ left: 7, top: 11 });
        expect(stateMocks.textSelectionCreate).toHaveBeenCalledWith(doc, 12);
        expect(tr.setSelection).toHaveBeenCalledWith({ type: 'text-selection' });
        expect(tr.setMeta).toHaveBeenCalledWith(floatingToolbarKey, { type: TOOLBAR_ACTIONS.HIDE });
        expect(tr.setMeta).toHaveBeenCalledWith('addToHistory', false);
        expect(handlers.view.dispatch).toHaveBeenCalledWith(tr);
        expect(handlers.view.focus).toHaveBeenCalled();

        cleanup();
    });

    it('falls back to the selected range end when the clicked point is not a text cursor', () => {
        const { editorDom, handlers } = createHandlers();
        const blankText = document.createElement('span');
        const doc = {
            content: { size: 40 },
            resolve: vi.fn((pos: number) => ({
                pos,
                parent: { inlineContent: pos !== 39 },
            })),
        };
        const tr = {
            doc,
            setMeta: vi.fn(() => tr),
            setSelection: vi.fn(() => tr),
        };
        stateMocks.textSelectionCreate.mockReturnValue({ type: 'text-selection' });
        handlers.view = {
            dom: editorDom,
            state: {
                doc,
                selection: {
                    from: 3,
                    to: 8,
                    empty: false,
                },
                tr,
            },
            dispatch: vi.fn(),
            focus: vi.fn(),
            posAtCoords: vi.fn(() => ({ pos: 39 })),
        } as any;
        editorDom.appendChild(blankText);

        const cleanup = installLinkTooltipEvents(handlers);

        blankText.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            clientX: 7,
            clientY: 11,
        }));

        expect(stateMocks.textSelectionCreate).toHaveBeenCalledTimes(1);
        expect(stateMocks.textSelectionCreate).toHaveBeenCalledWith(doc, 8);
        expect(tr.setSelection).toHaveBeenCalledWith({ type: 'text-selection' });
        expect(handlers.view.dispatch).toHaveBeenCalledWith(tr);

        cleanup();
    });
});
