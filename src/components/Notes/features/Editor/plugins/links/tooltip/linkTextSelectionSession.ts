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
import { POINTER_SELECTION_ACTIVE_ATTRIBUTE } from '../../selection/textSelectionOverlayState';

const LINK_DRAG_SELECTION_THRESHOLD_PX = 4;
export const LINK_TEXT_POSITION_SELECTOR = [
    'a[href]',
    '.autolink',
    '.wiki-link[data-wiki-link-target]',
    '.wiki-link-expanded[data-wiki-link-expanded]',
].join(', ');
const GENERATED_TOC_LINK_SELECTOR = '.toc-link[data-heading-pos]';
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
    if (!(linkRoot instanceof HTMLElement) || !view.dom.contains(linkRoot)) return null;
    return linkRoot.matches(GENERATED_TOC_LINK_SELECTOR) ? null : linkRoot;
}

export function resolveLinkTextRootFromMouseEvent(
    view: EditorView,
    event: MouseEvent,
    options: { allowEditorWideScan?: boolean } = {},
): HTMLElement | null {
    const directRoot = resolveEventLinkTextRoot(view, event.target);
    if (directRoot) return directRoot;

    const targetElement = event.target instanceof Element
        ? event.target
        : event.target instanceof Node
            ? event.target.parentElement
            : null;
    const scanRoot = targetElement?.closest(LINK_TEXT_SCAN_ROOT_SELECTOR);
    if (!scanRoot && options.allowEditorWideScan === false) return null;
    const root = scanRoot instanceof HTMLElement && view.dom.contains(scanRoot) ? scanRoot : view.dom;
    let best: { area: number; link: HTMLElement } | null = null;

    const links = root.querySelectorAll<HTMLElement>(LINK_TEXT_POSITION_SELECTOR);
    for (let index = 0; index < links.length; index += 1) {
        const link = links[index];
        if (!link) continue;
        if (link.matches(GENERATED_TOC_LINK_SELECTOR)) continue;
        if (!isPointInsideElementClientRects(link, event.clientX, event.clientY)) continue;
        const rect = link.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (best === null || area < best.area) {
            best = { area, link };
        }
    }

    return best?.link ?? null;
}

function resolveCollapsedWikiLinkSourceEnd(
    view: EditorView,
    event: MouseEvent,
    selectionRoot: HTMLElement | null,
): number | null {
    if (!selectionRoot?.matches('.wiki-link[data-wiki-link-target]')) return null;
    const sourceRoot = selectionRoot.closest('[data-wiki-link-source="true"]');
    if (!(sourceRoot instanceof HTMLElement) || sourceRoot.querySelector('.wiki-link-expanded')) return null;

    const rects = selectionRoot.getClientRects();
    let isAtVisibleEnd = false;
    for (let index = 0; index < rects.length; index += 1) {
        const rect = rects.item(index);
        if (
            rect &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom &&
            Math.abs(event.clientX - rect.right) <= 1
        ) {
            isAtVisibleEnd = true;
            break;
        }
    }
    if (!isAtVisibleEnd) return null;

    try {
        const pos = view.posAtDOM(sourceRoot, sourceRoot.childNodes.length, -1);
        return isInlineTextSelectionEndpoint(view, pos) ? clampDocPosition(view, pos) : null;
    } catch {
        return null;
    }
}

function resolveLinkTextPositionAtPointer(
    view: EditorView,
    event: MouseEvent,
    selectionRoot = resolveLinkTextRootFromMouseEvent(view, event),
): number | null {
    return resolveCollapsedWikiLinkSourceEnd(view, event, selectionRoot)
        ?? resolveEditorTextPositionAtPointer(
            view,
            event.clientX,
            event.clientY,
            selectionRoot,
        );
}

export function dispatchLinkTextCursorFromMouseEvent(view: EditorView, event: MouseEvent): boolean {
    const pos = resolveLinkTextPositionAtPointer(view, event);
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
        tr = tr.setMeta('addToHistory', false);
        view.dispatch(tr);
        if (!view.hasFocus()) view.dom.focus({ preventScroll: true });
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
    onDragSelectionStart: () => void,
    onDragSelectionComplete: () => void,
): boolean {
    if (!isPlainPrimaryMouseDown(event)) return false;

    const selectionRoot = resolveLinkTextRootFromMouseEvent(view, event);
    const isWikiLinkSelection = selectionRoot?.matches(
        '.wiki-link[data-wiki-link-target], .wiki-link-expanded[data-wiki-link-expanded]'
    ) === true;
    const anchor = resolveLinkTextPositionAtPointer(view, event, selectionRoot);
    if (anchor === null) return false;
    const sessionDoc = view.state.doc;

    const ownerDocument = view.dom.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    const startX = event.clientX;
    const startY = event.clientY;
    let selectionHead = anchor;
    let moved = false;
    let stopped = false;

    const clearPointerSelectionState = () => {
        view.dom.removeAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE);
    };
    const stop = (clearPointerState = true) => {
        if (stopped) return;
        stopped = true;
        ownerDocument.removeEventListener('mousemove', handleMouseMove, true);
        ownerDocument.removeEventListener('mouseup', handleMouseUp, true);
        ownerWindow?.removeEventListener('blur', handleWindowBlur);
        if (clearPointerState) clearPointerSelectionState();
    };
    const handleWindowBlur = () => stop();

    const extendSelection = (moveEvent: MouseEvent, suppressWikiLinkExpansion = isWikiLinkSelection) => {
        if (view.state.doc !== sessionDoc) return;
        const head = resolveLinkTextPositionAtPointer(view, moveEvent);
        if (head !== null) {
            selectionHead = head;
            dispatchEditorTextSelection(view, anchor, head, { suppressWikiLinkExpansion });
        }
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
        if (view.state.doc !== sessionDoc) {
            stop();
            return;
        }
        if ((moveEvent.buttons & 1) === 0) return;

        const hasDragged =
            Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > LINK_DRAG_SELECTION_THRESHOLD_PX;
        if (!moved && !hasDragged) return;

        if (!moved) {
            moved = true;
            onDragSelectionStart();
        }
        moveEvent.preventDefault();
        moveEvent.stopPropagation();
        moveEvent.stopImmediatePropagation();
        extendSelection(moveEvent);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
        stop(false);
        if (view.state.doc !== sessionDoc) {
            clearPointerSelectionState();
            return;
        }
        upEvent.preventDefault();
        upEvent.stopPropagation();
        upEvent.stopImmediatePropagation();

        if (!moved) {
            dispatchEditorTextSelection(view, anchor, anchor, { hideFloatingToolbar: false });
            clearPointerSelectionState();
            window.setTimeout(() => {
                if (view.state.doc === sessionDoc) {
                    dispatchEditorTextSelection(view, anchor, anchor, { hideFloatingToolbar: false });
                }
            }, 0);
            return;
        }
        dispatchEditorTextSelection(view, anchor, selectionHead, {
            suppressWikiLinkExpansion: false,
        });
        clearPointerSelectionState();
        onDragSelectionComplete();
    };

    view.dom.setAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE, 'true');
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    dispatchEditorTextSelection(view, anchor, anchor, {
        hideFloatingToolbar: false,
        suppressWikiLinkExpansion: isWikiLinkSelection,
    });
    ownerDocument.addEventListener('mousemove', handleMouseMove, true);
    ownerDocument.addEventListener('mouseup', handleMouseUp, true);
    ownerWindow?.addEventListener('blur', handleWindowBlur);
    return true;
}
