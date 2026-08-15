import { $prose } from '@milkdown/kit/utils';
import { parserCtx, serializerCtx } from '@milkdown/kit/core';
import { Plugin } from '@milkdown/kit/prose/state';
import { DOMParser as ProseDOMParser, type Node as ProseNode } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { Parser, Serializer } from '@milkdown/kit/transformer';
import { tryWriteTextToClipboardSynchronously, writeTextToClipboard } from '@/lib/clipboard';
import { hasSelectedBlocks } from '../cursor/blockSelectionPluginState';
import { hasHeadingDropPayload } from '../cursor/externalTextDropCursorPlugin';
import { insertImageNodesAtSelection } from '../image-upload/imageNodeInsertion';
import { collapseSelectionAndHideFloatingToolbar } from './copyCleanup';
import { sanitizeClipboardHtml } from './sanitizer';
import {
    clearSelectedHeadingMarker,
    prepareSelectedHeadingMarkerReplacement,
} from '../heading/headingMarkerDeletion';
import {
    collapseCapturedSelectionAndHideFloatingToolbar,
    isClipboardCopyShortcut,
    isClipboardCutShortcut,
    shouldHandleCopyShortcutDirectly,
    shouldHandleCutShortcutDirectly,
} from './clipboardDirectHandlers';
import {
    captureHeadingMarkerClipboardSelection,
    deleteHeadingMarkerClipboardSelection,
} from './headingMarkerClipboard';
import {
    getClipboardTextPayload,
    hasClipboardImageFilePayload,
    hasClipboardImageOnlyHtmlPayload,
    normalizeImageOnlyClipboardHtml,
} from './clipboardPayload';
import {
    dispatchPlainTextPayload,
    moveSelectionToDropPoint,
    replaceBlockSelectionBeforePaste,
    shouldReplaceBlockSelectionForEmptyPaste,
} from './clipboardPasteDispatch';
import {
    MAX_HTML_PASTE_CHARS,
    MAX_MARKDOWN_PASTE_CHARS,
    clipboardPluginKey,
} from './clipboardPluginConstants';

function parseImageOnlyClipboardNodes(view: EditorView, html: string): ProseNode[] {
    const container = view.dom.ownerDocument.createElement('div');
    container.innerHTML = normalizeImageOnlyClipboardHtml(sanitizeClipboardHtml(html));
    const parsed = ProseDOMParser.fromSchema(view.state.schema).parse(container);
    const imageType = view.state.schema.nodes.image;
    if (!imageType) return [];

    const images: ProseNode[] = [];
    parsed.descendants((node: ProseNode) => {
        if (node.type === imageType) {
            images.push(node);
            return false;
        }
        return true;
    });
    return images;
}

export {
    MAX_HTML_PASTE_CHARS,
    MAX_INLINE_FOOTNOTE_PASTE_LABEL_CHARS,
    MAX_INLINE_FOOTNOTE_PASTE_REFERENCES,
    MAX_INLINE_FOOTNOTE_PASTE_TEXT_CHARS,
    MAX_MARKDOWN_PASTE_CHARS,
    MAX_MARKDOWN_PASTE_TOP_LEVEL_NODES,
    MAX_PLAIN_TEXT_LINE_BREAK_PASTE_LINES,
    MAX_PLAIN_TEXT_PARAGRAPH_PASTE_BLOCKS,
    clipboardPluginKey,
} from './clipboardPluginConstants';
export { hasClipboardPayload } from './clipboardPayload';
export { createStandaloneTocPasteNode } from './clipboardPasteDispatch';
export { replaceInlineFootnoteReferencesInNodes } from './clipboardInlineFootnotes';
export {
    createPlainParagraphNodesFromText,
    createPlainTextBlankLineSlice,
    createPlainTextLineBreakSlice,
} from './clipboardPlainTextPaste';
export { collectMarkdownPasteTopLevelNodes } from './clipboardMarkdownParsing';

export const clipboardPlugin = $prose((ctx) => {
    let markdownParser: Parser | null = null;
    let markdownSerializer: Serializer | null = null;
    const getMarkdownParser = () => {
        if (markdownParser) return markdownParser;
        try {
            markdownParser = ctx.get(parserCtx);
            return markdownParser;
        } catch {
            return null;
        }
    };
    const getMarkdownSerializer = () => {
        if (markdownSerializer) return markdownSerializer;
        try {
            markdownSerializer = ctx.get(serializerCtx);
            return markdownSerializer;
        } catch {
            return null;
        }
    };
    const captureClipboardSelection = (view: EditorView) =>
        captureHeadingMarkerClipboardSelection(view, getMarkdownSerializer());

    return new Plugin({
        key: clipboardPluginKey,
        props: {
            handleKeyDown(view, event) {
                if (hasSelectedBlocks(view.state)) {
                    return false;
                }

                const isDirectCopy =
                    isClipboardCopyShortcut(event) &&
                    shouldHandleCopyShortcutDirectly(view.state.selection);
                const isDirectCut =
                    isClipboardCutShortcut(event) &&
                    shouldHandleCutShortcutDirectly(view.state.selection);

                if (!isDirectCopy && !isDirectCut) {
                    return false;
                }

                const clipboardSelection = captureClipboardSelection(view);
                const { includesHeadingMarker, text } = clipboardSelection;
                if (text.length === 0) {
                    return false;
                }
                if (!tryWriteTextToClipboardSynchronously(text)) {
                    return false;
                }

                const selection = view.state.selection;
                const doc = view.state.doc;
                event.preventDefault();
                if (isDirectCut) {
                    deleteHeadingMarkerClipboardSelection(
                        view,
                        selection,
                        doc,
                        clipboardSelection.deleteHeadingMarkerSelection,
                    );
                } else {
                    if (includesHeadingMarker) clearSelectedHeadingMarker(view);
                    collapseCapturedSelectionAndHideFloatingToolbar(view, selection, doc);
                }
                return true;
            },
            handleDOMEvents: {
                copy(view, event) {
                    if (hasSelectedBlocks(view.state)) {
                        return false;
                    }

                    const { includesHeadingMarker, text } = captureClipboardSelection(view);
                    if (text.length === 0) return false;

                    const selection = view.state.selection;
                    const doc = view.state.doc;
                    event.preventDefault();
                    if (event.clipboardData) {
                        event.clipboardData.setData('text/plain', text);
                        if (includesHeadingMarker) clearSelectedHeadingMarker(view);
                        collapseSelectionAndHideFloatingToolbar(view);
                        return true;
                    }

                    void writeTextToClipboard(text).then((didCopy) => {
                        if (didCopy) {
                            if (
                                includesHeadingMarker
                                && view.state.doc.eq(doc)
                                && selection.eq(view.state.selection)
                            ) clearSelectedHeadingMarker(view);
                            collapseCapturedSelectionAndHideFloatingToolbar(view, selection, doc);
                        }
                    }).catch(() => undefined);
                    return true;
                },
                cut(view, event) {
                    if (hasSelectedBlocks(view.state)) {
                        return false;
                    }

                    if (!shouldHandleCutShortcutDirectly(view.state.selection)) {
                        return false;
                    }

                    const clipboardSelection = captureClipboardSelection(view);
                    const { text } = clipboardSelection;
                    if (text.length === 0) return false;

                    const selection = view.state.selection;
                    const doc = view.state.doc;
                    event.preventDefault();
                    if (event.clipboardData) {
                        event.clipboardData.setData('text/plain', text);
                        deleteHeadingMarkerClipboardSelection(
                            view,
                            selection,
                            doc,
                            clipboardSelection.deleteHeadingMarkerSelection,
                        );
                        return true;
                    }

                    void writeTextToClipboard(text).then((didCopy) => {
                        if (didCopy) {
                            deleteHeadingMarkerClipboardSelection(
                                view,
                                selection,
                                doc,
                                clipboardSelection.deleteHeadingMarkerSelection,
                            );
                        }
                    }).catch(() => undefined);
                    return true;
                },
                drop(view, event) {
                    const dragEvent = event as DragEvent;
                    if (dragEvent.dataTransfer?.files && dragEvent.dataTransfer.files.length > 0) {
                        return false;
                    }
                    if (hasHeadingDropPayload(dragEvent.dataTransfer)) {
                        return false;
                    }

                    const text = dragEvent.dataTransfer?.getData('text/plain');
                    if (!text) return false;

                    if (text.length > MAX_MARKDOWN_PASTE_CHARS) {
                        dragEvent.preventDefault();
                        return true;
                    }

                    if (!moveSelectionToDropPoint(view, dragEvent)) {
                        return false;
                    }

                    if (!dispatchPlainTextPayload(view, text, getMarkdownParser())) {
                        return false;
                    }

                    dragEvent.preventDefault();
                    return true;
                },
            },
            handlePaste(view, event) {
                if (hasClipboardImageFilePayload(event.clipboardData)) {
                    event.preventDefault();
                    return true;
                }
                if (hasClipboardImageOnlyHtmlPayload(event.clipboardData)) {
                    const html = event.clipboardData?.getData('text/html') ?? '';
                    const imageNodes = parseImageOnlyClipboardNodes(view, html);
                    prepareSelectedHeadingMarkerReplacement(view);
                    if (!insertImageNodesAtSelection(view, imageNodes)) {
                        event.preventDefault();
                        return true;
                    }
                    event.preventDefault();
                    return true;
                }

                const text = getClipboardTextPayload(event.clipboardData);
                if (!text) {
                    if (shouldReplaceBlockSelectionForEmptyPaste(view, event)) {
                        replaceBlockSelectionBeforePaste(view);
                    }
                    if (event.clipboardData?.getData('text/html')) {
                        prepareSelectedHeadingMarkerReplacement(view);
                    }
                    return false;
                }
                if (text.length > MAX_MARKDOWN_PASTE_CHARS) {
                    event.preventDefault();
                    return true;
                }

                prepareSelectedHeadingMarkerReplacement(view);
                if (!dispatchPlainTextPayload(view, text, getMarkdownParser())) {
                    return false;
                }

                event.preventDefault();
                return true;
            },
            transformPastedHTML(html) {
                if (html.length > MAX_HTML_PASTE_CHARS) {
                    return '';
                }
                return normalizeImageOnlyClipboardHtml(sanitizeClipboardHtml(html));
            }
        }
    });
});
