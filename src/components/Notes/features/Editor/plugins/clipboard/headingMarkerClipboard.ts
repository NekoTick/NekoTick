import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { Serializer } from '@milkdown/kit/transformer';

import {
    captureSelectedHeadingMarkerSelection,
    getSelectedHeadingMarkerPrefix,
    replaceSelectedHeadingMarkerSelection,
} from '../heading/headingMarkerDeletion';
import { deleteCapturedSelection } from './clipboardDirectHandlers';
import { serializeSelectionToClipboardText } from './selectionSerialization';

export function captureHeadingMarkerClipboardSelection(
    view: EditorView,
    serializer: Serializer | null,
) {
    const text = serializeSelectionToClipboardText(view.state, serializer);
    const markerPrefix = getSelectedHeadingMarkerPrefix(view);
    return {
        deleteHeadingMarkerSelection: markerPrefix
            ? captureSelectedHeadingMarkerSelection(view)
            : null,
        includesHeadingMarker: markerPrefix !== null,
        text: markerPrefix ? `${markerPrefix}${text}` : text,
    };
}

export function deleteHeadingMarkerClipboardSelection(
    view: EditorView,
    selection: typeof view.state.selection,
    doc: ProseNode,
    deleteHeadingMarkerSelection: (() => boolean) | null,
): void {
    if (deleteHeadingMarkerSelection) {
        deleteHeadingMarkerSelection();
        return;
    }
    if (replaceSelectedHeadingMarkerSelection(view, '')) return;
    deleteCapturedSelection(view, selection, doc);
}
