import type { EditorView } from '@milkdown/kit/prose/view';
import { TextSelection } from '@milkdown/kit/prose/state';

interface SelectedHeadingMarker {
    doc: EditorView['state']['doc'];
    from: number;
    headingContentStart: number;
    to: number;
}

const selectedHeadingMarkers = new WeakMap<EditorView, SelectedHeadingMarker>();

interface CapturedSelectedHeadingMarker {
    doc: EditorView['state']['doc'];
    from: number;
    headingContentStart: number;
    headingPos: number;
    level: number;
    to: number;
}

export function persistSelectedHeadingMarker(
    view: EditorView,
    headingContentStart: number,
): void {
    const { from, to } = view.state.selection;
    selectedHeadingMarkers.set(view, {
        doc: view.state.doc,
        from,
        headingContentStart,
        to,
    });
}

export function clearSelectedHeadingMarker(view: EditorView): void {
    selectedHeadingMarkers.delete(view);
}

export function selectionMatchesSelectedHeadingMarker(view: EditorView): boolean {
    const selectedMarker = selectedHeadingMarkers.get(view);
    const { selection } = view.state;
    return Boolean(
        selectedMarker
        && selectedMarker.doc === view.state.doc
        && selectedMarker.from === selection.from
        && selectedMarker.to === selection.to
    );
}

function captureSelectedHeadingMarker(view: EditorView): CapturedSelectedHeadingMarker | null {
    const selectedMarker = selectedHeadingMarkers.get(view);
    if (!selectedMarker || !selectionMatchesSelectedHeadingMarker(view)) return null;

    const { doc, selection } = view.state;
    const heading = selection.$from.parent;
    const headingContentStart = selection.$from.start();
    const headingPos = selection.$from.before();
    if (
        selection.empty
        || heading.type.name !== 'heading'
        || headingContentStart !== selectedMarker.headingContentStart
        || selection.from !== headingContentStart
        || doc.nodeAt(headingPos) !== heading
        || selection.to > headingContentStart + heading.content.size
    ) return null;

    const level = Number(heading.attrs.level);
    if (!Number.isInteger(level) || level < 1 || level > 6) return null;
    return {
        doc,
        from: selection.from,
        headingContentStart,
        headingPos,
        level,
        to: selection.to,
    };
}

function selectedMarkerMatchesCapture(
    view: EditorView,
    capture: CapturedSelectedHeadingMarker,
): boolean {
    const selectedMarker = selectedHeadingMarkers.get(view);
    return Boolean(
        selectedMarker
        && selectedMarker.doc === capture.doc
        && selectedMarker.from === capture.from
        && selectedMarker.headingContentStart === capture.headingContentStart
        && selectedMarker.to === capture.to
    );
}

function replaceCapturedHeadingMarkerSelection(
    view: EditorView,
    capture: CapturedSelectedHeadingMarker,
    text: string,
): boolean {
    const paragraph = view.state.schema.nodes.paragraph;
    if (!paragraph || !view.state.doc.eq(capture.doc)) return false;

    const heading = view.state.doc.nodeAt(capture.headingPos);
    if (
        heading?.type.name !== 'heading'
        || heading.attrs.level !== capture.level
        || capture.headingContentStart !== capture.headingPos + 1
        || capture.to > capture.headingContentStart + heading.content.size
    ) return false;

    if (selectedMarkerMatchesCapture(view, capture)) clearSelectedHeadingMarker(view);
    const tr = view.state.tr
        .setSelection(TextSelection.create(view.state.doc, capture.from, capture.to))
        .insertText(text, capture.from, capture.to)
        .setNodeMarkup(capture.headingPos, paragraph);
    view.dispatch(tr);
    return true;
}

export function getSelectedHeadingMarkerPrefix(view: EditorView): string | null {
    const selectedMarker = captureSelectedHeadingMarker(view);
    return selectedMarker ? `${'#'.repeat(selectedMarker.level)} ` : null;
}

export function captureSelectedHeadingMarkerSelection(
    view: EditorView,
): (() => boolean) | null {
    const capture = captureSelectedHeadingMarker(view);
    if (!capture) return null;
    return () => replaceCapturedHeadingMarkerSelection(view, capture, '');
}

export function captureSelectedHeadingMarkerComposition(
    view: EditorView,
): (() => boolean) | null {
    const capture = captureSelectedHeadingMarker(view);
    if (!capture) return null;

    return () => {
        const paragraph = view.state.schema.nodes.paragraph;
        const heading = view.state.doc.nodeAt(capture.headingPos);
        const { selection } = view.state;
        if (
            !paragraph
            || view.state.doc.eq(capture.doc)
            || heading?.type.name !== 'heading'
            || heading.attrs.level !== capture.level
            || (selection.$from.parent !== heading && selection.$to.parent !== heading)
        ) return false;

        clearSelectedHeadingMarker(view);
        view.dispatch(view.state.tr.setNodeMarkup(capture.headingPos, paragraph));
        return true;
    };
}

export function prepareSelectedHeadingMarkerReplacement(view: EditorView): boolean {
    const selectedMarker = captureSelectedHeadingMarker(view);
    const paragraph = view.state.schema.nodes.paragraph;
    if (!selectedMarker || !paragraph) return false;

    clearSelectedHeadingMarker(view);
    view.dispatch(view.state.tr.setNodeMarkup(selectedMarker.headingPos, paragraph));
    return true;
}

export function replaceSelectedHeadingMarkerSelection(
    view: EditorView,
    text: string,
): boolean {
    const selectedMarker = captureSelectedHeadingMarker(view);
    return selectedMarker
        ? replaceCapturedHeadingMarkerSelection(view, selectedMarker, text)
        : false;
}

export function handleSelectedHeadingMarkerDelete(
    view: EditorView,
    event: KeyboardEvent,
): boolean {
    if (
        event.isComposing
        || (event.key !== 'Backspace' && event.key !== 'Delete')
        || event.altKey
        || event.ctrlKey
        || event.metaKey
        || event.shiftKey
    ) return false;

    return replaceSelectedHeadingMarkerSelection(view, '');
}

export function handleHeadingMarkerBoundaryBackspace(
    view: EditorView,
    event: KeyboardEvent,
): boolean {
    if (
        event.isComposing
        || event.key !== 'Backspace'
        || event.altKey
        || event.ctrlKey
        || event.metaKey
        || event.shiftKey
    ) return false;

    const { selection } = view.state;
    const heading = selection.$from.parent;
    if (
        !selection.empty
        || heading.type.name !== 'heading'
        || heading.content.size === 0
        || selection.from !== selection.$from.start()
    ) return false;

    const level = Number(heading.attrs.level);
    const paragraph = view.state.schema.nodes.paragraph;
    if (!paragraph || !Number.isInteger(level) || level < 1 || level > 6) return false;

    clearSelectedHeadingMarker(view);
    const headingPos = selection.$from.before();
    const markerText = view.state.schema.text('#'.repeat(level));
    view.dispatch(
        view.state.tr
            .insert(selection.from, markerText)
            .setNodeMarkup(headingPos, paragraph),
    );
    return true;
}

export function handleSelectedHeadingMarkerBeforeInput(
    view: EditorView,
    event: InputEvent,
): boolean {
    if (event.isComposing) return false;

    const replacement = event.inputType.startsWith('delete')
        ? ''
        : event.inputType === 'insertText' || event.inputType === 'insertReplacementText'
        ? event.data
        : null;
    return replacement !== null && replaceSelectedHeadingMarkerSelection(view, replacement);
}
