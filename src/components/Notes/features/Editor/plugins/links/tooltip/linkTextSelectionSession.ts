import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { floatingToolbarKey } from '../../floating-toolbar/floatingToolbarKey';
import { TOOLBAR_ACTIONS } from '../../floating-toolbar/types';
import {
    clampDocPosition,
    isInlineTextSelectionEndpoint,
    resolveEditorTextPositionAtPointer,
} from '../../shared/pointerTextPosition';
import { WIKI_LINK_POINTER_SELECTION_META } from '../wiki-link/wikiLinkInteraction';

const LINK_DRAG_SELECTION_THRESHOLD_PX = 4;
export const LINK_TEXT_POSITION_SELECTOR = [
    'a[href]',
    '.autolink',
    '.wiki-link[data-wiki-link-target]',
    '.wiki-link-expanded[data-wiki-link-expanded]',
].join(', ');
const LINK_TEXT_SCAN_ROOT_SELECTOR = [
    'li',
    'p',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
].join(', ');

function isPointInsideElementClientRects(element: HTMLElement, clientX: number, clientY: number): boolean {
    const rects = element.getClientRects();
    for (let index = 0; index < rects.length; index += 1) {
        const rect = rects[index];
        if (!rect || rect.width <= 0 || rect.height <= 0) continue;
        const horizontalSlack = Math.max(2, Math.min(6, rect.width * 0.08));
        const verticalSlack = Math.max(2, Math.min(4, rect.height * 0.15));
        if (
            clientX >= rect.left - horizontalSlack &&
            clientX <= rect.right + horizontalSlack &&
            clientY >= rect.top - verticalSlack &&
            clientY <= rect.bottom + verticalSlack
        ) {
            return true;
        }
    }
    return false;
}

function resolveEventLinkTextRoot(view: EditorView, target: EventTarget | null): HTMLElement | null {
    const targetElement = target instanceof Element
        ? target
        : target instanceof Node
            ? target.parentElement
            : null;
    const linkRoot = targetElement?.closest(LINK_TEXT_POSITION_SELECTOR);
    return linkRoot instanceof HTMLElement && view.dom.contains(linkRoot) ? linkRoot : null;
}

export function resolveLinkTextRootFromMouseEvent(view: EditorView, event: MouseEvent): HTMLElement | null {
    const directRoot = resolveEventLinkTextRoot(view, event.target);
    if (directRoot) return directRoot;

    const targetElement = event.target instanceof Element
        ? event.target
        : event.target instanceof Node
            ? event.target.parentElement
            : null;
    const scanRoot = targetElement?.closest(LINK_TEXT_SCAN_ROOT_SELECTOR);
    const root = scanRoot instanceof HTMLElement && view.dom.contains(scanRoot) ? scanRoot : view.dom;
    let best: { area: number; link: HTMLElement } | null = null;

    const links = root.querySelectorAll<HTMLElement>(LINK_TEXT_POSITION_SELECTOR);
    for (let index = 0; index < links.length; index += 1) {
        const link = links[index];
        if (!link) continue;
        if (!isPointInsideElementClientRects(link, event.clientX, event.clientY)) continue;
        const rect = link.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (best === null || area < best.area) {
            best = { area, link };
        }
    }

    return best?.link ?? null;
}

export function dispatchLinkTextCursorFromMouseEvent(view: EditorView, event: MouseEvent): boolean {
    const pos = resolveEditorTextPositionAtPointer(
        view,
        event.clientX,
        event.clientY,
        resolveLinkTextRootFromMouseEvent(view, event),
    );
    return pos !== null && dispatchEditorTextSelection(view, pos, pos, { hideFloatingToolbar: false });
}

function dispatchEditorTextSelection(
    view: EditorView,
    anchor: number,
    head = anchor,
    options: { hideFloatingToolbar?: boolean; suppressWikiLinkExpansion?: boolean } = {},
): boolean {
    if (!view.dom.isConnected) return false;

    const nextAnchor = clampDocPosition(view, anchor);
    const nextHead = clampDocPosition(view, head);
    if (
        !isInlineTextSelectionEndpoint(view, nextAnchor) ||
        !isInlineTextSelectionEndpoint(view, nextHead)
    ) {
        return false;
    }

    try {
        let tr = view.state.tr
            .setSelection(TextSelection.create(view.state.doc, nextAnchor, nextHead));
        if (options.hideFloatingToolbar !== false) {
            tr = tr.setMeta(floatingToolbarKey, { type: TOOLBAR_ACTIONS.HIDE });
        }
        if (options.suppressWikiLinkExpansion) {
            tr = tr.setMeta(WIKI_LINK_POINTER_SELECTION_META, true);
        }
        tr = tr
            .setMeta('addToHistory', false)
            .scrollIntoView();
        view.dispatch(tr);
        view.dom.focus({ preventScroll: true });
        view.focus();
        return true;
    } catch {
        return false;
    }
}

function isPlainPrimaryMouseDown(event: MouseEvent): boolean {
    return event.button === 0 &&
        event.detail <= 1 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey;
}

export function startLinkTextSelectionSession(
    view: EditorView,
    event: MouseEvent,
    onDragSelectionComplete: () => void,
): boolean {
    if (!isPlainPrimaryMouseDown(event)) return false;

    const selectionRoot = resolveLinkTextRootFromMouseEvent(view, event);
    const isWikiLinkSelection = selectionRoot?.matches(
        '.wiki-link[data-wiki-link-target], .wiki-link-expanded[data-wiki-link-expanded]'
    ) === true;
    const anchor = resolveEditorTextPositionAtPointer(
        view,
        event.clientX,
        event.clientY,
        selectionRoot,
    );
    if (anchor === null) return false;
    const sessionDoc = view.state.doc;

    const ownerDocument = view.dom.ownerDocument;
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    let stopped = false;

    const stop = () => {
        if (stopped) return;
        stopped = true;
        ownerDocument.removeEventListener('mousemove', handleMouseMove, true);
        ownerDocument.removeEventListener('mouseup', handleMouseUp, true);
    };

    const extendSelection = (moveEvent: MouseEvent, suppressWikiLinkExpansion = isWikiLinkSelection) => {
        if (view.state.doc !== sessionDoc) return;
        const head = resolveEditorTextPositionAtPointer(
            view,
            moveEvent.clientX,
            moveEvent.clientY,
            resolveLinkTextRootFromMouseEvent(view, moveEvent),
        );
        if (head !== null) {
            dispatchEditorTextSelection(view, anchor, head, { suppressWikiLinkExpansion });
        }
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
        if (view.state.doc !== sessionDoc) {
            stop();
            return;
        }
        if ((moveEvent.buttons & 1) === 0) {
            stop();
            return;
        }

        const hasDragged =
            Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > LINK_DRAG_SELECTION_THRESHOLD_PX;
        if (!moved && !hasDragged) return;

        moved = true;
        moveEvent.preventDefault();
        moveEvent.stopPropagation();
        moveEvent.stopImmediatePropagation();
        extendSelection(moveEvent);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
        stop();
        if (view.state.doc !== sessionDoc) return;
        upEvent.preventDefault();
        upEvent.stopPropagation();
        upEvent.stopImmediatePropagation();

        if (!moved) {
            dispatchEditorTextSelection(view, anchor, anchor, { hideFloatingToolbar: false });
            window.setTimeout(() => {
                if (view.state.doc === sessionDoc) {
                    dispatchEditorTextSelection(view, anchor, anchor, { hideFloatingToolbar: false });
                }
            }, 0);
            return;
        }
        extendSelection(upEvent, false);
        onDragSelectionComplete();
    };

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    dispatchEditorTextSelection(view, anchor, anchor, {
        hideFloatingToolbar: false,
        suppressWikiLinkExpansion: isWikiLinkSelection,
    });
    ownerDocument.addEventListener('mousemove', handleMouseMove, true);
    ownerDocument.addEventListener('mouseup', handleMouseUp, true);
    return true;
}
