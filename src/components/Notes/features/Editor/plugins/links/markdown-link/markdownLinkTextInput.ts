import type { EditorView } from '@milkdown/kit/prose/view';
import { MARKDOWN_SYNTAX_REPARSE_META } from '../../markdown-syntax/markdownSyntaxReparse';
import { sanitizeExplicitMarkdownLinkHref } from '../utils/linkHref';
import {
    getMarkdownLinkInputTextBeforeCursor,
    isMarkdownImagePatternBeforeCursor,
} from './markdownLinkChangeDetection';
import {
    getMarkdownLinkHref,
    MARKDOWN_LINK_PATTERN_BEFORE,
} from './markdownLinkParser';

export function handleMarkdownLinkTextInput(
    view: EditorView,
    from: number,
    to: number,
    inputText: string,
): boolean {
    const state = view.state;
    const doc = state.doc;
    const $from = doc.resolve(from);
    const textBefore = getMarkdownLinkInputTextBeforeCursor($from.parent, $from.parentOffset);
    const match = textBefore.match(MARKDOWN_LINK_PATTERN_BEFORE);
    if (!match) return false;

    const fullMatch = match[0];
    const linkText = match[1];
    const linkUrl = match[2];
    const linkMarkType = state.schema.marks.link;
    if (!linkMarkType) return false;

    const linkStart = from - fullMatch.length;
    if (isMarkdownImagePatternBeforeCursor(textBefore, fullMatch)) {
        return false;
    }

    const syntaxMarkType = state.schema.marks.markdownSyntax;
    if (
        syntaxMarkType
        && doc.rangeHasMark(linkStart, from, linkMarkType)
        && doc.rangeHasMark(linkStart, from, syntaxMarkType)
    ) {
        const tr = state.tr
            .replaceWith(from, to, state.schema.text(inputText))
            .setMeta(MARKDOWN_SYNTAX_REPARSE_META, true);
        tr.removeStoredMark(linkMarkType);
        view.dispatch(tr);
        return true;
    }

    const safeLinkUrl = sanitizeExplicitMarkdownLinkHref(getMarkdownLinkHref(linkUrl));
    const linkedText = safeLinkUrl
        ? state.schema.text(linkText, [linkMarkType.create({ href: safeLinkUrl })])
        : state.schema.text(linkText);
    const trailingText = state.schema.text(inputText);
    const tr = state.tr
        .delete(linkStart, from)
        .insert(linkStart, linkedText)
        .insert(linkStart + linkText.length, trailingText);

    tr.removeStoredMark(linkMarkType);
    view.dispatch(tr);
    return true;
}
