import type { EditorView } from '@milkdown/kit/prose/view';
import { hasLinkMarkAroundCursor } from '../utils/helpers';
import type { LinkTooltipTimers } from './linkTooltipTimers';

const LINK_TOOLTIP_SHOW_DELAY = 70;

export function startLinkTooltipShowTimer(
    timers: LinkTooltipTimers,
    view: EditorView,
    link: HTMLElement,
    show: (link: HTMLElement) => void,
    shouldValidateCursor = true,
) {
    timers.scheduleShow(() => {
        if (!shouldValidateCursor || hasLinkMarkAroundCursor(view.state, view.state.selection.$from.pos)) {
            show(link);
        }
    }, LINK_TOOLTIP_SHOW_DELAY);
}

export function startLinkTooltipHideTimer(timers: LinkTooltipTimers, hide: () => void) {
    timers.scheduleHide(hide, 300);
}

export function scheduleLinkTooltipEditorFocus(timers: LinkTooltipTimers, view: EditorView) {
    const doc = view.dom.ownerDocument;
    const focusOwner = doc.activeElement;
    timers.scheduleFocus(() => {
        const activeElement = doc.activeElement;
        if (
            activeElement !== focusOwner &&
            activeElement !== doc.body &&
            !view.dom.contains(activeElement)
        ) {
            return;
        }
        view.focus();
    }, 10);
}
