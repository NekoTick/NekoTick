import type { EditorView } from '@milkdown/kit/prose/view';
import { resolveLinkTextRootFromMouseEvent } from './linkTextSelectionSession';

const DRAG_THRESHOLD_PX = 4;

export function installExternalLinkDragClickSuppression(
    view: EditorView,
    suppressNextClick: () => void,
): () => void {
    const ownerDocument = view.dom.ownerDocument;
    let start: { x: number; y: number } | null = null;
    let moved = false;

    const handleMouseDown = (event: MouseEvent) => {
        if (
            event.button !== 0 ||
            !(event.target instanceof Node) ||
            !view.dom.contains(event.target) ||
            resolveLinkTextRootFromMouseEvent(view, event)
        ) {
            start = null;
            moved = false;
            return;
        }
        start = { x: event.clientX, y: event.clientY };
        moved = false;
    };

    const handleMouseMove = (event: MouseEvent) => {
        if (!start || moved || (event.buttons & 1) === 0) return;
        moved = Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_THRESHOLD_PX;
    };

    const handleMouseUp = (event: MouseEvent) => {
        const shouldSuppress = moved && Boolean(resolveLinkTextRootFromMouseEvent(view, event));
        start = null;
        moved = false;
        if (shouldSuppress) suppressNextClick();
    };

    ownerDocument.addEventListener('mousedown', handleMouseDown, true);
    ownerDocument.addEventListener('mousemove', handleMouseMove, true);
    ownerDocument.addEventListener('mouseup', handleMouseUp, true);
    return () => {
        ownerDocument.removeEventListener('mousedown', handleMouseDown, true);
        ownerDocument.removeEventListener('mousemove', handleMouseMove, true);
        ownerDocument.removeEventListener('mouseup', handleMouseUp, true);
    };
}
