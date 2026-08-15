import type { EditorView } from '@milkdown/kit/prose/view';
import {
    TEXT_SELECTION_OVERLAY_CLASS,
    TEXT_SELECTION_OVERLAY_FORCE_CLASS,
} from '../selection/textSelectionOverlayState';
import {
    clearSelectedHeadingMarker,
    persistSelectedHeadingMarker,
} from './headingMarkerDeletion';
import { installHeadingMarkerEditingEvents } from './headingMarkerEditingEvents';
import {
    getHeadingMarkerHitRect,
    isPointerPathPastHeadingMarker,
    projectPointerToHeadingLine,
    type HeadingMarkerHitRect,
    type HeadingPointerPoint,
} from './headingMarkerPointerGeometry';

export const HEADING_MARKER_POINTER_RETAINED_CLASS = 'heading-markdown-marker-pointer-retained';
export const RETAINED_HEADING_MARKER_CLASS = 'heading-markdown-marker-retained';
const POINTER_SELECTED_MARKER_CLASS = 'heading-markdown-marker-pointer-selected';

interface RetainedHeadingPointerState {
    anchorIncludesMarker: boolean;
    contentStart: number;
    doc: EditorView['state']['doc'];
    heading: HTMLElement;
    lastPoint: HeadingPointerPoint;
    marker: HTMLElement;
    markerRect: HeadingMarkerHitRect;
    pointerPastMarker: boolean;
    syncSelection: () => boolean;
}

interface PersistedMarkerSelection {
    anchor: number;
    doc: EditorView['state']['doc'];
    head: number;
    headingContentStart: number;
}

interface PointerSelectedMarker {
    element: HTMLElement;
    hadForceClass: boolean;
    hadOverlayClass: boolean;
}

const retainedHeadingPointers = new WeakMap<EditorView, RetainedHeadingPointerState>();

export function getRetainedHeadingMarkerPointerSnapshot(view: EditorView) {
    const retained = retainedHeadingPointers.get(view);
    if (!retained) return null;
    return {
        contentStart: retained.contentStart,
        lastPoint: { ...retained.lastPoint },
        markerRect: { ...retained.markerRect },
        pointerPastMarker: retained.pointerPastMarker,
    };
}

function getHeadingContentStart(view: EditorView, heading: HTMLElement): number | null {
    try {
        return view.posAtDOM(heading, 0);
    } catch {
        return null;
    }
}

function updateRetainedPointer(
    retained: RetainedHeadingPointerState,
    point: HeadingPointerPoint,
): boolean {
    if (
        retained.lastPoint.clientX === point.clientX
        && retained.lastPoint.clientY === point.clientY
    ) return retained.pointerPastMarker;

    retained.pointerPastMarker = isPointerPathPastHeadingMarker(
        retained.markerRect,
        retained.lastPoint,
        point,
        retained.pointerPastMarker,
    );
    retained.lastPoint = {
        clientX: point.clientX,
        clientY: point.clientY,
    };
    return retained.pointerPastMarker;
}

export function getRetainedHeadingMarkerSelectionHead(
    view: EditorView,
    point: { clientX: number; clientY: number },
): number | null {
    const retained = retainedHeadingPointers.get(view);
    return retained && updateRetainedPointer(retained, point)
        ? retained.contentStart
        : null;
}

export function getRetainedHeadingPointerTextProjection(
    view: EditorView,
    point: HeadingPointerPoint,
): HeadingPointerPoint | null {
    const retained = retainedHeadingPointers.get(view);
    return retained ? projectPointerToHeadingLine(retained.markerRect, point) : null;
}

export function syncRetainedHeadingMarkerSelection(view: EditorView): boolean {
    return retainedHeadingPointers.get(view)?.syncSelection() ?? false;
}

export function installHeadingMarkerPointerRetention(view: EditorView) {
    const { dom: viewDom } = view;
    const retentionHost = viewDom.closest<HTMLElement>('.milkdown') ?? viewDom;
    let pointerSelectedMarker: PointerSelectedMarker | null = null;
    let persistedSelection: PersistedMarkerSelection | null = null;
    let persistedSelectionReleaseFrame: number | null = null;

    const cancelPersistedSelectionRelease = () => {
        if (persistedSelectionReleaseFrame === null) return;
        cancelAnimationFrame(persistedSelectionReleaseFrame);
        persistedSelectionReleaseFrame = null;
    };

    const clearPointerSelectedMarker = () => {
        if (!pointerSelectedMarker) return;
        const { element, hadForceClass, hadOverlayClass } = pointerSelectedMarker;
        if (!hadOverlayClass) element.classList.remove(TEXT_SELECTION_OVERLAY_CLASS);
        if (!hadForceClass) element.classList.remove(TEXT_SELECTION_OVERLAY_FORCE_CLASS);
        element.classList.remove(POINTER_SELECTED_MARKER_CLASS);
        pointerSelectedMarker = null;
    };
    const selectHeadingMarker = (marker: HTMLElement) => {
        if (pointerSelectedMarker?.element !== marker) {
            clearPointerSelectedMarker();
            pointerSelectedMarker = {
                element: marker,
                hadForceClass: marker.classList.contains(TEXT_SELECTION_OVERLAY_FORCE_CLASS),
                hadOverlayClass: marker.classList.contains(TEXT_SELECTION_OVERLAY_CLASS),
            };
        }
        marker.classList.add(
            POINTER_SELECTED_MARKER_CLASS,
            TEXT_SELECTION_OVERLAY_CLASS,
            TEXT_SELECTION_OVERLAY_FORCE_CLASS,
        );
    };
    const resolveHeadingAt = (contentStart: number) => {
        const node = view.nodeDOM(contentStart - 1);
        return (
            node instanceof HTMLElement
            && node.matches('h1, h2, h3, h4, h5, h6')
        ) ? node : null;
    };
    const selectionMatchesPersistedMarker = () => {
        if (!persistedSelection || persistedSelection.doc !== view.state.doc) return false;
        const { selection } = view.state;
        return (
            persistedSelection.anchor === selection.anchor
            && persistedSelection.head === selection.head
        );
    };
    const refreshRetainedDom = () => {
        const retained = retainedHeadingPointers.get(view);
        if (!retained) return null;
        if (retained.doc !== view.state.doc) {
            retainedHeadingPointers.delete(view);
            retentionHost.classList.remove(HEADING_MARKER_POINTER_RETAINED_CLASS);
            return null;
        }
        if (
            viewDom.contains(retained.heading)
            && retained.heading.contains(retained.marker)
        ) return retained;

        const heading = resolveHeadingAt(retained.contentStart);
        const marker = heading?.querySelector<HTMLElement>('.heading-markdown-marker') ?? null;
        if (!heading || !marker) {
            retainedHeadingPointers.delete(view);
            retentionHost.classList.remove(HEADING_MARKER_POINTER_RETAINED_CLASS);
            return null;
        }
        if (marker !== retained.marker) {
            retained.marker.classList.remove(RETAINED_HEADING_MARKER_CLASS);
            retained.heading = heading;
            retained.marker = marker;
            marker.classList.add(RETAINED_HEADING_MARKER_CLASS);
            retained.markerRect = getHeadingMarkerHitRect(marker);
        }
        return retained;
    };
    const syncMarkerSelection = () => {
        const retained = refreshRetainedDom();
        const persistedHeading = !retained && persistedSelection
            ? resolveHeadingAt(persistedSelection.headingContentStart)
            : null;
        const marker = retained?.marker
            ?? persistedHeading?.querySelector<HTMLElement>('.heading-markdown-marker')
            ?? null;
        const { selection } = view.state;
        const pointerIncludesMarker = Boolean(
            retained
            && !selection.empty
            && selection.from <= retained.contentStart
            && selection.to > retained.contentStart
            && (retained.anchorIncludesMarker || retained.pointerPastMarker)
        );
        const keepPersistedMarker = Boolean(marker && selectionMatchesPersistedMarker());
        const shouldSelectMarker = pointerIncludesMarker || keepPersistedMarker;

        if (shouldSelectMarker && marker) {
            if (pointerSelectedMarker?.element !== marker) selectHeadingMarker(marker);
        } else {
            clearPointerSelectedMarker();
            if (!retained && persistedSelectionReleaseFrame === null) {
                persistedSelection = null;
            }
        }
        return shouldSelectMarker;
    };
    const clearPointerRetention = (persistMarker: boolean) => {
        const retained = retainedHeadingPointers.get(view);
        if (persistMarker && pointerSelectedMarker && retained) {
            persistedSelection = {
                anchor: view.state.selection.anchor,
                doc: view.state.doc,
                head: view.state.selection.head,
                headingContentStart: retained.contentStart,
            };
            persistSelectedHeadingMarker(view, retained.contentStart);
            cancelPersistedSelectionRelease();
            persistedSelectionReleaseFrame = requestAnimationFrame(() => {
                persistedSelectionReleaseFrame = requestAnimationFrame(() => {
                    persistedSelectionReleaseFrame = null;
                    syncMarkerSelection();
                });
            });
        } else if (!persistMarker) {
            cancelPersistedSelectionRelease();
        }
        retained?.marker.classList.remove(RETAINED_HEADING_MARKER_CLASS);
        retainedHeadingPointers.delete(view);
        retentionHost.classList.remove(HEADING_MARKER_POINTER_RETAINED_CLASS);
        syncMarkerSelection();
    };
    const handleMouseDown = (event: MouseEvent) => {
        persistedSelection = null;
        clearSelectedHeadingMarker(view);
        clearPointerSelectedMarker();
        clearPointerRetention(false);
        if (event.button !== 0 || !(event.target instanceof Element)) return;
        const heading = event.target.closest<HTMLElement>('h1, h2, h3, h4, h5, h6');
        if (!heading || !viewDom.contains(heading)) return;
        const marker = heading.querySelector<HTMLElement>('.heading-markdown-marker');
        if (!marker) return;
        const contentStart = getHeadingContentStart(view, heading);
        if (contentStart === null) return;

        marker.classList.add(RETAINED_HEADING_MARKER_CLASS);
        const markerRect = getHeadingMarkerHitRect(marker);
        const pointerPastMarker = isPointerPathPastHeadingMarker(
            markerRect,
            null,
            event,
            false,
        );
        retainedHeadingPointers.set(view, {
            anchorIncludesMarker: pointerPastMarker,
            contentStart,
            doc: view.state.doc,
            heading,
            lastPoint: { clientX: event.clientX, clientY: event.clientY },
            marker,
            markerRect,
            pointerPastMarker,
            syncSelection: syncMarkerSelection,
        });
        retentionHost.classList.add(HEADING_MARKER_POINTER_RETAINED_CLASS);
    };
    const handleMouseMove = (event: MouseEvent) => {
        const retained = retainedHeadingPointers.get(view);
        if (!retained) return;
        const previousPointerPastMarker = retained.pointerPastMarker;
        const pointerPastMarker = updateRetainedPointer(retained, event);
        if (pointerPastMarker === previousPointerPastMarker) return;
        syncMarkerSelection();
    };
    const refreshMarkerRect = () => {
        const retained = retainedHeadingPointers.get(view);
        if (retained) retained.markerRect = getHeadingMarkerHitRect(retained.marker);
    };
    const handleMouseUp = () => {
        queueMicrotask(() => clearPointerRetention(true));
    };
    const handleWindowBlur = () => {
        clearSelectedHeadingMarker(view);
        clearPointerRetention(false);
    };
    const ownerDocument = viewDom.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    const scrollRoot = viewDom.closest('[data-note-scroll-root="true"]');
    ownerDocument.addEventListener('mousedown', handleMouseDown, true);
    ownerDocument.addEventListener('mousemove', handleMouseMove, true);
    ownerDocument.addEventListener('mouseup', handleMouseUp, true);
    const destroyEditingEvents = installHeadingMarkerEditingEvents(view, handleWindowBlur);
    ownerWindow?.addEventListener('resize', refreshMarkerRect);
    scrollRoot?.addEventListener('scroll', refreshMarkerRect, { passive: true });

    return {
        update() {
            syncMarkerSelection();
        },
        destroy() {
            cancelPersistedSelectionRelease();
            persistedSelection = null;
            clearSelectedHeadingMarker(view);
            clearPointerSelectedMarker();
            clearPointerRetention(false);
            ownerDocument.removeEventListener('mousedown', handleMouseDown, true);
            ownerDocument.removeEventListener('mousemove', handleMouseMove, true);
            ownerDocument.removeEventListener('mouseup', handleMouseUp, true);
            destroyEditingEvents();
            ownerWindow?.removeEventListener('resize', refreshMarkerRect);
            scrollRoot?.removeEventListener('scroll', refreshMarkerRect);
        },
    };
}
