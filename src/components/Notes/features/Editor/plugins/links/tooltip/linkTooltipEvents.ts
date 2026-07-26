import { Selection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { floatingToolbarKey } from '../../floating-toolbar/floatingToolbarKey';
import { TOOLBAR_ACTIONS } from '../../floating-toolbar/types';
import { openEditorLinkHref } from '../utils/openEditorLinkHref';
import {
    dispatchLinkTextCursorFromMouseEvent,
    resolveLinkTextRootFromMouseEvent,
    startLinkTextSelectionSession,
} from './linkTextSelectionSession';
import { resolveBlankAreaDragStartZone } from '../../cursor/blankAreaDragTargets';

const LINK_DRAG_CLICK_SUPPRESSION_MS = 500;
const BLOCK_SELECTION_PENDING_CLASS = 'editor-block-selection-pending';

function isPlainMouseClick(event: MouseEvent): boolean {
    return event.detail === 1 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey;
}

function isPlainMultiClick(event: MouseEvent): boolean {
    return event.detail > 1 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey;
}

function resolveTooltipEligibleLink(view: EditorView, event: MouseEvent): HTMLElement | null {
    const target = event.target instanceof HTMLElement
        ? event.target
        : event.target instanceof Node
            ? event.target.parentElement
            : null;

    const tocLink = target?.closest('.toc-link[data-heading-pos]');
    if (tocLink instanceof HTMLElement) return null;

    const link = resolveLinkTextRootFromMouseEvent(view, event);
    if (link?.matches(
        '.wiki-link[data-wiki-link-target], .wiki-link-expanded[data-wiki-link-expanded]'
    )) return null;
    if (link?.closest('.toc-link[data-heading-pos]')) return null;
    return link instanceof HTMLElement ? link : null;
}

type LinkTooltipEventHandlers = {
    view: EditorView;
    dom: HTMLElement;
    showLinkWithDelay: (link: HTMLElement, shouldValidateCursor?: boolean) => void;
    hide: (force?: boolean) => void;
    scheduleFocus: () => void;
    reposition: () => void;
    clearHideTimer: () => void;
    startHideTimer: () => void;
    clearShowTimer: () => void;
    setKeyboardInteraction: (value: boolean) => void;
    hasActiveLink: () => boolean;
};

function collapseEditorSelectionAtPointer(view: EditorView, event: MouseEvent): void {
    const { selection } = view.state;
    if (selection.empty) {
        return;
    }

    const coordsPos = view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
    })?.pos;
    const maxPos = view.state.doc.content.size;
    const tr = view.state.tr;
    const doc = tr.doc ?? view.state.doc;
    const cursorPositions = Array.from(new Set(
        [coordsPos, selection.to]
            .filter((pos): pos is number => typeof pos === 'number')
            .map((pos) => Math.max(0, Math.min(pos, maxPos)))
    ));

    let didSetSelection = false;
    for (const cursorPos of cursorPositions) {
        try {
            if (!doc.resolve(cursorPos).parent.inlineContent) {
                continue;
            }
            tr.setSelection(TextSelection.create(doc, cursorPos));
            didSetSelection = true;
            break;
        } catch {
        }
    }

    if (!didSetSelection) {
        const fallbackPos = Math.max(0, Math.min(selection.to, maxPos));
        tr.setSelection(Selection.near(doc.resolve(fallbackPos), -1));
    }

    view.dom.ownerDocument.defaultView?.getSelection()?.removeAllRanges();
    view.dispatch(
        tr
            .setMeta(floatingToolbarKey, { type: TOOLBAR_ACTIONS.HIDE })
            .setMeta('addToHistory', false)
    );
    view.focus();
}

export function installLinkTooltipEvents(handlers: LinkTooltipEventHandlers): () => void {
    const {
        view,
        dom,
        showLinkWithDelay,
        hide,
        scheduleFocus,
        reposition,
        clearHideTimer,
        startHideTimer,
        clearShowTimer,
        setKeyboardInteraction,
        hasActiveLink,
    } = handlers;
    let suppressNextClick = false;
    let clearSuppressNextClickTimer: number | null = null;
    let hoveredLink: HTMLElement | null = null;

    const suppressNextEditorClick = () => {
        suppressNextClick = true;
        if (clearSuppressNextClickTimer !== null) {
            window.clearTimeout(clearSuppressNextClickTimer);
        }
        clearSuppressNextClickTimer = window.setTimeout(() => {
            suppressNextClick = false;
            clearSuppressNextClickTimer = null;
        }, LINK_DRAG_CLICK_SUPPRESSION_MS);
    };

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
        if (event.isComposing || event.key !== 'Escape' || dom.classList.contains('hidden')) return;
        event.preventDefault();
        event.stopPropagation();
        hide(true);
        scheduleFocus();
    };

    const handleScroll = () => {
        if (dom.hasAttribute('data-editing')) {
            reposition();
            return;
        }
        if (hasActiveLink()) hide();
    };

    const handleEditorMouseDown = (event: MouseEvent) => {
        if (!(event.target instanceof Node) || !view.dom.contains(event.target)) return;
        const selectableLink = resolveLinkTextRootFromMouseEvent(view, event);
        if (!selectableLink) {
            setKeyboardInteraction(false);
            if (!dom.classList.contains('hidden')) {
                const isPlainPrimaryMouseDown = event.button === 0 &&
                    !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
                const blockStartZone = isPlainPrimaryMouseDown ? resolveBlankAreaDragStartZone(view, event) : null;
                if (blockStartZone !== null) {
                    hide(true);
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                hide(true);
                collapseEditorSelectionAtPointer(view, event);
            }
            return;
        }

        setKeyboardInteraction(false);
        if (selectableLink.matches('.wiki-link-expanded[data-wiki-link-expanded]')) return;
        const isWikiLink = selectableLink.matches(
            '.wiki-link[data-wiki-link-target], .wiki-link-expanded[data-wiki-link-expanded]'
        );
        if (startLinkTextSelectionSession(view, event, () => {
            clearShowTimer();
            hide(true);
            suppressNextEditorClick();
        })) {
            if (isWikiLink) suppressNextEditorClick();
            return;
        }
    };

    const handleEditorClick = async (event: MouseEvent) => {
        if (!(event.target instanceof Node) || !view.dom.contains(event.target)) return;
        const selectableLink = resolveLinkTextRootFromMouseEvent(view, event);
        const link = resolveTooltipEligibleLink(view, event);
        if (!selectableLink) return;
        if (selectableLink.matches('.wiki-link-expanded[data-wiki-link-expanded]')) return;

        // Wiki links use their own Ctrl/Cmd-click navigation handler.
        if (!link && (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)) return;
        if (isPlainMultiClick(event)) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (suppressNextClick) {
            suppressNextClick = false;
            if (clearSuppressNextClickTimer !== null) {
                window.clearTimeout(clearSuppressNextClickTimer);
                clearSuppressNextClickTimer = null;
            }
            return;
        }

        if (isPlainMouseClick(event)) {
            if (dispatchLinkTextCursorFromMouseEvent(view, event)) {
                return;
            }
        }

        if (!link) return;

        const href = link.getAttribute('href') || link.getAttribute('data-href');
        if (href) await openEditorLinkHref(href, { view });
    };

    const updateHoveredLinkFromMouseEvent = (event: MouseEvent) => {
        if (view.dom.classList.contains(BLOCK_SELECTION_PENDING_CLASS)) {
            hoveredLink = null;
            clearShowTimer();
            if (hasActiveLink()) hide(true);
            return;
        }

        const link = resolveTooltipEligibleLink(view, event);
        if (!link) {
            if (hoveredLink === null && !hasActiveLink()) return;
            hoveredLink = null;
            clearShowTimer();
            if (hasActiveLink()) startHideTimer();
            return;
        }

        if (hoveredLink === link) return;
        hoveredLink = link;
        clearHideTimer();
        showLinkWithDelay(link, false);
    };

    const handleEditorMouseOver = (event: Event) => {
        if (event instanceof MouseEvent) updateHoveredLinkFromMouseEvent(event);
    };

    const handleEditorMouseMove = (event: Event) => {
        if (event instanceof MouseEvent) updateHoveredLinkFromMouseEvent(event);
    };

    const handleEditorMouseOut = () => {
        hoveredLink = null;
        clearShowTimer();
        if (!hasActiveLink()) return;

        startHideTimer();
    };

    const handleTooltipMouseLeave = (event: MouseEvent) => {
        if (dom.hasAttribute('data-dropdown-open')) return;

        const relatedTarget = event.relatedTarget as HTMLElement | null;
        if (relatedTarget) {
            const isRadixDropdown = relatedTarget.closest('[data-radix-popper-content-wrapper]') ||
                relatedTarget.closest('[role="menu"]');
            if (isRadixDropdown) return;
        }

        startHideTimer();
    };

    const handleEditorKeyDown = (event: KeyboardEvent): void => {
        if (event.isComposing) {
            return;
        }

        setKeyboardInteraction(true);

        if (event.key === 'Tab' && !dom.classList.contains('hidden')) {
            event.preventDefault();
            const firstFocusable = dom.querySelector('button, input') as HTMLElement;
            firstFocusable?.focus();
        }
    };

    view.dom.addEventListener('mouseover', handleEditorMouseOver);
    view.dom.addEventListener('mousemove', handleEditorMouseMove);
    view.dom.addEventListener('mouseout', handleEditorMouseOut);
    view.dom.addEventListener('mousedown', handleEditorMouseDown, true);
    view.dom.addEventListener('click', handleEditorClick, true);
    document.addEventListener('mousedown', handleEditorMouseDown, true);
    document.addEventListener('click', handleEditorClick, true);
    dom.addEventListener('mouseenter', clearHideTimer);
    dom.addEventListener('mouseleave', handleTooltipMouseLeave);
    window.addEventListener('scroll', handleScroll, true);
    view.dom.addEventListener('keydown', handleEditorKeyDown, true);
    document.addEventListener('keydown', handleGlobalKeyDown, true);

    return () => {
        if (clearSuppressNextClickTimer !== null) {
            window.clearTimeout(clearSuppressNextClickTimer);
        }
        view.dom.removeEventListener('mouseover', handleEditorMouseOver);
        view.dom.removeEventListener('mousemove', handleEditorMouseMove);
        view.dom.removeEventListener('mouseout', handleEditorMouseOut);
        view.dom.removeEventListener('mousedown', handleEditorMouseDown, true);
        view.dom.removeEventListener('click', handleEditorClick, true);
        document.removeEventListener('mousedown', handleEditorMouseDown, true);
        document.removeEventListener('click', handleEditorClick, true);
        dom.removeEventListener('mouseenter', clearHideTimer);
        dom.removeEventListener('mouseleave', handleTooltipMouseLeave);
        window.removeEventListener('scroll', handleScroll, true);
        view.dom.removeEventListener('keydown', handleEditorKeyDown, true);
        document.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
}
