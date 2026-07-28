import { $prose } from '@milkdown/kit/utils';
import { Plugin } from '@milkdown/kit/prose/state';
import { Fragment, Slice } from '@milkdown/kit/prose/model';
import { DecorationSet } from '@milkdown/kit/prose/view';
import { resolvePasteRange } from '../../clipboard/pasteCursorUtils';
import {
    hasClipboardImageFilePayload,
    hasClipboardImageOnlyHtmlPayload,
} from '../../clipboard/clipboardPayload';
import { sanitizeExplicitMarkdownLinkHref } from '../utils/linkHref';
import {
    getMarkdownLinkHref,
    MARKDOWN_LINK_PATTERN_BEFORE,
    shouldHandleMarkdownLinkPaste,
} from './markdownLinkParser';
import {
    MAX_MARKDOWN_LINK_AUTO_COLLAPSE_MATCHES,
    MAX_MARKDOWN_LINK_DOC_SCAN_NODES,
    MAX_MARKDOWN_LINK_INPUT_LOOKBACK_CHARS,
    MAX_MARKDOWN_LINK_PASTE_NODES,
    MAX_MARKDOWN_LINK_TEXT_SCAN_CHARS,
    MAX_MARKDOWN_LINK_TRANSACTION_STEP_TEXT_CHARS,
    markdownLinkPluginKey,
    RAW_MARKDOWN_LINK_TEXT_CLASS,
    type MarkdownLinkPluginState,
    MAX_MARKDOWN_LINK_DOC_SCAN_SIZE,
    MAX_MARKDOWN_LINK_PASTE_CHARS,
    type RawMarkdownLinkMatch,
} from './markdownLinkConfig';
import {
    docChangeMayAffectRawMarkdownLink,
    docHasRawMarkdownLink,
    getMarkdownLinkInputTextBeforeCursor,
    isMarkdownImagePatternBeforeCursor,
    rangeTouchesRawMarkdownLink,
    textContainsRawMarkdownLink,
    transactionChangeMayAffectRawMarkdownLink,
    transactionMayCreateMarkdownLink,
} from './markdownLinkChangeDetection';
import {
    collectRawMarkdownLinkMatches,
    collectRawMarkdownLinkMatchesInRange,
    collectRawMarkdownLinkMatchesInRanges,
} from './markdownLinkMatches';
import { collectMarkdownLinkAutoCollapseScanRanges } from './markdownLinkScanRanges';
import { createMarkdownLinkPasteNodes } from './markdownLinkPaste';
import { createRawMarkdownLinkTextDecorations } from './markdownLinkDecorations';

export {
    MAX_MARKDOWN_LINK_AUTO_COLLAPSE_MATCHES,
    MAX_MARKDOWN_LINK_DOC_SCAN_NODES,
    MAX_MARKDOWN_LINK_INPUT_LOOKBACK_CHARS,
    MAX_MARKDOWN_LINK_PASTE_NODES,
    MAX_MARKDOWN_LINK_TEXT_SCAN_CHARS,
    MAX_MARKDOWN_LINK_TRANSACTION_STEP_TEXT_CHARS,
    RAW_MARKDOWN_LINK_TEXT_CLASS,
    collectMarkdownLinkAutoCollapseScanRanges,
    collectRawMarkdownLinkMatches,
    collectRawMarkdownLinkMatchesInRange,
    createMarkdownLinkPasteNodes,
    docChangeMayAffectRawMarkdownLink,
    docHasRawMarkdownLink,
    getMarkdownLinkInputTextBeforeCursor,
    isMarkdownImagePatternBeforeCursor,
    markdownLinkPluginKey,
    rangeTouchesRawMarkdownLink,
    textContainsRawMarkdownLink,
    transactionChangeMayAffectRawMarkdownLink,
    transactionMayCreateMarkdownLink,
};
export type { RawMarkdownLinkMatch };

const EMPTY_MARKDOWN_LINK_PLUGIN_STATE: MarkdownLinkPluginState = {
    decorations: DecorationSet.empty,
    hasRawMarkdownLink: false,
};

function createMarkdownLinkPluginState(doc: Parameters<typeof collectRawMarkdownLinkMatches>[0]): MarkdownLinkPluginState {
    const rawMarkdownLinks = collectRawMarkdownLinkMatches(doc);
    return {
        decorations: createRawMarkdownLinkTextDecorations(doc, rawMarkdownLinks),
        hasRawMarkdownLink: rawMarkdownLinks.length > 0,
    };
}

export const markdownLinkPlugin = $prose(() => {
    return new Plugin<MarkdownLinkPluginState>({
        key: markdownLinkPluginKey,
        state: {
            init(_config, state) {
                return state.doc.content.size <= MAX_MARKDOWN_LINK_DOC_SCAN_SIZE
                    ? createMarkdownLinkPluginState(state.doc)
                    : EMPTY_MARKDOWN_LINK_PLUGIN_STATE;
            },
            apply(tr, previous, oldState) {
                if (!tr.docChanged) {
                    return previous;
                }

                if (tr.doc.content.size > MAX_MARKDOWN_LINK_DOC_SCAN_SIZE) {
                    return EMPTY_MARKDOWN_LINK_PLUGIN_STATE;
                }

                if (!previous.hasRawMarkdownLink) {
                    if (oldState.doc.content.size > MAX_MARKDOWN_LINK_DOC_SCAN_SIZE) {
                        return createMarkdownLinkPluginState(tr.doc);
                    }
                    const hasAffectedRawMarkdownLink = transactionChangeMayAffectRawMarkdownLink(oldState.doc, tr.doc, tr);
                    if (!transactionMayCreateMarkdownLink(tr) && !hasAffectedRawMarkdownLink) {
                        return previous;
                    }
                    return createMarkdownLinkPluginState(tr.doc);
                }

                if (
                    previous.hasRawMarkdownLink
                    && !transactionMayCreateMarkdownLink(tr)
                    && !transactionChangeMayAffectRawMarkdownLink(oldState.doc, tr.doc, tr)
                ) {
                    return {
                        ...previous,
                        decorations: previous.decorations.map(tr.mapping, tr.doc),
                    };
                }

                return createMarkdownLinkPluginState(tr.doc);
            },
        },

        // Auto-collapse when selection moves away from a markdown link pattern
        // AND cleanup unwanted styles (code, strong) from raw markdown link syntax
        appendTransaction(transactions, oldState, newState) {
            if (newState.doc.content.size > MAX_MARKDOWN_LINK_DOC_SCAN_SIZE) {
                return null;
            }

            if (!markdownLinkPluginKey.getState(newState)?.hasRawMarkdownLink) {
                return null;
            }

            const selectionChanged = !oldState.selection.eq(newState.selection);
            if (
                !selectionChanged
                && (
                    !transactions.some((tr) => tr.docChanged)
                    || !docChangeMayAffectRawMarkdownLink(oldState.doc, newState.doc)
                )
            ) {
                return null;
            }

            let tr = newState.tr;
            let hasChanges = false;
            const schema = newState.schema;
            const linkMarkType = schema.marks.link;

            if (!linkMarkType) return null;

            const scanRanges = collectMarkdownLinkAutoCollapseScanRanges(oldState, newState, transactions);
            if (scanRanges.length === 0) {
                return null;
            }

            const rawMarkdownLinks = collectRawMarkdownLinkMatchesInRanges(newState.doc, scanRanges);
            for (const rawMarkdownLink of rawMarkdownLinks) {
                const mapping = tr.mapping;
                const mappedStart = mapping.map(rawMarkdownLink.from);
                const mappedEnd = mapping.map(rawMarkdownLink.to);
                if (mappedEnd <= mappedStart) continue;

                // 1. SANITIZE STYLES: Remove ALL marks from the raw syntax [text](url)
                // This "Nuclear Option" strips any background/color/bold/code styles
                Object.values(schema.marks).forEach(markType => {
                    if (tr.doc.rangeHasMark(mappedStart, mappedEnd, markType)) {
                        tr.removeMark(mappedStart, mappedEnd, markType);
                        hasChanges = true;
                    }
                });

                // 2. AUTO-COLLAPSE: Check if new selection is OUTSIDE this pattern
                // Only if selection actually changed compared to old state
                if (!oldState.selection.eq(newState.selection)) {
                    const selFrom = newState.selection.from;
                    const selTo = newState.selection.to;
                    const isOutside = selTo <= rawMarkdownLink.from || selFrom >= rawMarkdownLink.to;

                    if (isOutside) {
                        const safeLinkUrl = sanitizeExplicitMarkdownLinkHref(getMarkdownLinkHref(rawMarkdownLink.linkUrl));
                        const marks = safeLinkUrl ? [linkMarkType.create({ href: safeLinkUrl })] : [];
                        tr = tr
                            .delete(mappedStart, mappedEnd)
                            .insert(mappedStart, schema.text(rawMarkdownLink.linkText, marks));
                        tr.removeStoredMark(linkMarkType);

                        hasChanges = true;
                    }
                }
            }

            return hasChanges ? tr : null;
        },

        props: {
            decorations(state) {
                return markdownLinkPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
            },

            handleTextInput(view, from, _to, inputText) {
                // Only trigger on space, newline, or certain punctuation
                if (!/^[\s.,;:!?，。；：！？、】【》）]$/.test(inputText)) {
                    return false;
                }

                const state = view.state;
                const doc = state.doc;

                // Get text before cursor
                const $from = doc.resolve(from);
                const textBefore = getMarkdownLinkInputTextBeforeCursor($from.parent, $from.parentOffset);

                // Check if there's a markdown link pattern ending at cursor
                const match = textBefore.match(MARKDOWN_LINK_PATTERN_BEFORE);
                if (!match) return false;

                const fullMatch = match[0];
                const linkText = match[1];
                const linkUrl = match[2];
                const linkMarkType = state.schema.marks.link;
                if (!linkMarkType) return false;

                // Calculate positions
                const linkStart = from - fullMatch.length;
                if (isMarkdownImagePatternBeforeCursor(textBefore, fullMatch)) {
                    return false;
                }

                // Create transaction
                const safeLinkUrl = sanitizeExplicitMarkdownLinkHref(getMarkdownLinkHref(linkUrl));
                const linkedText = safeLinkUrl
                    ? state.schema.text(linkText, [linkMarkType.create({ href: safeLinkUrl })])
                    : state.schema.text(linkText);
                const spaceText = state.schema.text(inputText);

                const tr = state.tr
                    .delete(linkStart, from)
                    .insert(linkStart, linkedText)
                    .insert(linkStart + linkText.length, spaceText);

                tr.removeStoredMark(linkMarkType);

                view.dispatch(tr);
                return true;
            },

            handlePaste(view, event) {
                const clipboardData = event.clipboardData;
                if (!clipboardData) return false;
                if (hasClipboardImageFilePayload(clipboardData)) {
                    event.preventDefault();
                    return true;
                }
                if (hasClipboardImageOnlyHtmlPayload(clipboardData)) {
                    return false;
                }

                const text = clipboardData.getData('text/plain');
                if (text.length > MAX_MARKDOWN_LINK_PASTE_CHARS) {
                    event.preventDefault();
                    return true;
                }
                if (!shouldHandleMarkdownLinkPaste(text)) {
                    return false;
                }

                const linkMarkType = view.state.schema.marks.link;
                if (!linkMarkType) return false;

                const nodes = createMarkdownLinkPasteNodes(text, view.state.schema, linkMarkType);
                if (!nodes) {
                    const { from, to } = resolvePasteRange(view.state, Slice.empty);
                    const tr = view.state.tr.insertText(text, from, to);
                    view.dispatch(tr);
                    event.preventDefault();
                    return true;
                }

                const fragment = Fragment.from(nodes);
                const slice = new Slice(fragment, 0, 0);

                const { from, to } = resolvePasteRange(view.state, slice);
                const tr = view.state.tr.replaceRange(from, to, slice);
                view.dispatch(tr);

                event.preventDefault();
                return true;
            }
        }
    });
});
