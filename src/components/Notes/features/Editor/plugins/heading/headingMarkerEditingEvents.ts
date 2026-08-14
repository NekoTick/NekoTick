import type { EditorView } from '@milkdown/kit/prose/view';

import {
    captureSelectedHeadingMarkerComposition,
    handleHeadingMarkerBoundaryBackspace,
    handleSelectedHeadingMarkerBeforeInput,
    handleSelectedHeadingMarkerDelete,
} from './headingMarkerDeletion';

export function installHeadingMarkerEditingEvents(
    view: EditorView,
    onWindowBlur: () => void,
): () => void {
    const { dom: viewDom } = view;
    const ownerDocument = viewDom.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    let finishHeadingMarkerComposition: (() => boolean) | null = null;

    const isEditorEvent = (event: Event) => (
        event.target instanceof Node && viewDom.contains(event.target)
    );
    const handleKeyDown = (event: KeyboardEvent) => {
        if (!isEditorEvent(event)) return;
        const handled = handleSelectedHeadingMarkerDelete(view, event)
            || handleHeadingMarkerBoundaryBackspace(view, event);
        if (!handled) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    };
    const handleBeforeInput = (event: InputEvent) => {
        if (!isEditorEvent(event) || !handleSelectedHeadingMarkerBeforeInput(view, event)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    };
    const handleCompositionStart = (event: CompositionEvent) => {
        if (!isEditorEvent(event)) return;
        finishHeadingMarkerComposition = captureSelectedHeadingMarkerComposition(view);
    };
    const handleCompositionEnd = (event: CompositionEvent) => {
        if (!isEditorEvent(event)) return;
        const finishComposition = finishHeadingMarkerComposition;
        finishHeadingMarkerComposition = null;
        if (finishComposition) queueMicrotask(finishComposition);
    };
    const handleWindowBlur = () => {
        finishHeadingMarkerComposition = null;
        onWindowBlur();
    };

    ownerDocument.addEventListener('beforeinput', handleBeforeInput, true);
    ownerDocument.addEventListener('compositionstart', handleCompositionStart, true);
    ownerDocument.addEventListener('compositionend', handleCompositionEnd, true);
    ownerDocument.addEventListener('keydown', handleKeyDown, true);
    ownerWindow?.addEventListener('blur', handleWindowBlur);

    return () => {
        finishHeadingMarkerComposition = null;
        ownerDocument.removeEventListener('beforeinput', handleBeforeInput, true);
        ownerDocument.removeEventListener('compositionstart', handleCompositionStart, true);
        ownerDocument.removeEventListener('compositionend', handleCompositionEnd, true);
        ownerDocument.removeEventListener('keydown', handleKeyDown, true);
        ownerWindow?.removeEventListener('blur', handleWindowBlur);
    };
}
