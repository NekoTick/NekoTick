import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorView } from '@milkdown/kit/prose/view';
import { scheduleLinkTooltipEditorFocus } from './linkTooltipTimerActions';
import type { LinkTooltipTimers } from './linkTooltipTimers';

function createFocusFixture() {
    let pendingFocus: (() => void) | null = null;
    const editorDom = document.createElement('div');
    const tooltipInput = document.createElement('textarea');
    const view = {
        dom: editorDom,
        focus: vi.fn(),
    } as unknown as EditorView;
    const timers = {
        scheduleFocus: vi.fn((callback: () => void) => {
            pendingFocus = callback;
        }),
    } as unknown as LinkTooltipTimers;
    document.body.append(editorDom, tooltipInput);
    tooltipInput.focus();
    scheduleLinkTooltipEditorFocus(timers, view);

    return {
        runPendingFocus: () => pendingFocus?.(),
        tooltipInput,
        view,
    };
}

describe('scheduleLinkTooltipEditorFocus', () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    it('restores the editor while focus still belongs to the closing tooltip', () => {
        const { runPendingFocus, view } = createFocusFixture();

        runPendingFocus();

        expect(view.focus).toHaveBeenCalledTimes(1);
    });

    it('does not steal focus from a control focused after the tooltip closed', () => {
        const { runPendingFocus, view } = createFocusFixture();
        const nextInput = document.createElement('input');
        document.body.appendChild(nextInput);
        nextInput.focus();

        runPendingFocus();

        expect(view.focus).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(nextInput);
    });
});
