import { TextSelection } from '@milkdown/kit/prose/state';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import { sanitizeEditorLinkHref } from '../utils/linkHref';
import {
    findLinkRange,
    resolveLinkMarkRangeAtPos,
} from '../utils/helpers';
import { hasUsableLinkTextRange } from '../../floating-toolbar/selectionValidity';
import { markEditorUserInput } from '../../shared/userInputEvents';

export const MAX_TOOLTIP_FALLBACK_LINK_TEXT_CHARS = 4096;
export const MAX_TOOLTIP_FALLBACK_LINK_TEXT_NODES = 20_000;

export function getBoundedTextNodeLength(element: HTMLElement, maxChars: number): number | null {
    let length = 0;
    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    let scannedNodes = 0;

    while (node) {
        scannedNodes += 1;
        if (scannedNodes > MAX_TOOLTIP_FALLBACK_LINK_TEXT_NODES) return null;
        length += node.textContent?.length ?? 0;
        if (length > maxChars) return null;
        node = walker.nextNode();
    }

    return length;
}

export function getBoundedLinkTooltipText(element: HTMLElement, maxChars = MAX_TOOLTIP_FALLBACK_LINK_TEXT_CHARS): string {
    let text = '';
    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    let scannedNodes = 0;

    while (node && text.length < maxChars && scannedNodes < MAX_TOOLTIP_FALLBACK_LINK_TEXT_NODES) {
        scannedNodes += 1;
        const value = node.textContent ?? '';
        const remaining = maxChars - text.length;
        text += value.length > remaining ? value.slice(0, remaining) : value;
        node = walker.nextNode();
    }

    return text;
}

export function sanitizeTooltipLinkHref(value: string): string | null {
    return sanitizeEditorLinkHref(value);
}

function isLinkSyntaxNode(node: ProseNode | null | undefined, edge: 'open' | 'close'): boolean {
    if (!node?.isText) return false;
    const syntaxMark = node.marks.find((mark) => mark.type.name === 'markdownSyntax');
    return syntaxMark?.attrs.kind === 'link' && syntaxMark.attrs.edge === edge;
}

function getLinkDestinationSource(href: string): string {
    const escaped = href.replace(/([\\<>])/g, '\\$1');
    return /[\s()<>]/.test(href) ? `<${escaped}>` : href.replace(/([()])/g, '\\$1');
}

function getLinkTitleSource(title: unknown): string {
    return typeof title === 'string' && title.length > 0
        ? ` "${title.replace(/(["\\])/g, '\\$1')}"`
        : '';
}

function getExistingLinkMark(state: EditorView['state'], start: number, linkMarkType: any) {
    const nodeAfter = state.doc.resolve(start).nodeAfter;
    return nodeAfter?.marks.find((mark) => mark.type === linkMarkType) ?? null;
}

export function editExistingLink(
    view: EditorView,
    link: HTMLElement,
    text: string,
    url: string
): number | null {
    const pos = view.posAtDOM(link, 0);
    if (pos < 0) return null;

    const { state, dispatch } = view;
    const linkMarkType = state.schema.marks.link;
    if (!linkMarkType) return null;

    const range = resolveLinkMarkRangeAtPos(state, pos);
    const start = range?.start ?? pos;
    const fallbackTextLength = range ? null : getBoundedTextNodeLength(link, MAX_TOOLTIP_FALLBACK_LINK_TEXT_CHARS);
    const end = range?.end ?? (fallbackTextLength === null ? pos : pos + fallbackTextLength);
    if (start === end) return null;

    const openingSyntax = range ? state.doc.resolve(start).nodeBefore : null;
    const closingSyntax = range ? state.doc.resolve(end).nodeAfter : null;
    const hasOpeningSyntax = isLinkSyntaxNode(openingSyntax, 'open');
    const hasClosingSyntax = isLinkSyntaxNode(closingSyntax, 'close');
    const existingLinkMark = range ? getExistingLinkMark(state, start, linkMarkType) : null;
    // The current tooltip edits the destination only. Keep the existing content
    // nodes so nested formatting, syntax marks, and inline images survive.
    const preserveExistingContent = Boolean(range);

    let tr = state.tr;
    if (range) tr = tr.removeMark(start, end, linkMarkType);

    const safeUrl = sanitizeTooltipLinkHref(url);
    if (!preserveExistingContent) {
        tr = tr.insertText(text, start, end);
    }
    if (safeUrl) {
        const markAttrs = existingLinkMark
            ? { ...existingLinkMark.attrs, href: safeUrl }
            : { href: safeUrl };
        const markEnd = preserveExistingContent ? end : start + text.length;
        tr = tr.addMark(start, markEnd, linkMarkType.create(markAttrs));
    }

    let closingSyntaxEnd: number | null = null;
    if (hasClosingSyntax && closingSyntax) {
        const closeFrom = tr.mapping.map(end, 1);
        const closeTo = tr.mapping.map(end + closingSyntax.nodeSize, -1);
        if (safeUrl) {
            const closingSource = `](${getLinkDestinationSource(safeUrl)}${getLinkTitleSource(existingLinkMark?.attrs?.title)})`;
            tr = tr.replaceWith(
                closeFrom,
                closeTo,
                state.schema.text(closingSource, closingSyntax.marks),
            );
            closingSyntaxEnd = closeFrom + closingSource.length;
        } else {
            tr = tr.delete(closeFrom, closeTo);
        }
    }

    if (!safeUrl && hasOpeningSyntax && openingSyntax) {
        const openFrom = tr.mapping.map(start - openingSyntax.nodeSize, 1);
        const openTo = tr.mapping.map(start, -1);
        tr = tr.delete(openFrom, openTo);
    }

    const contentEnd = preserveExistingContent ? end : start + text.length;
    const selectionPos = closingSyntaxEnd ?? (
        !safeUrl && preserveExistingContent
            ? tr.mapping.map(end, -1)
            : !safeUrl && hasOpeningSyntax && openingSyntax
                ? start - openingSyntax.nodeSize + text.length
                : contentEnd
    );
    tr.setSelection(TextSelection.create(tr.doc, selectionPos));
    tr.removeStoredMark(linkMarkType);
    markEditorUserInput(view);
    dispatch(tr);
    return tr.mapping.map(start);
}

export function unlinkExistingLink(view: EditorView, link: HTMLElement): boolean {
    const result = findLinkRange(view, link);
    if (!result) return false;

    // Markdown links keep their `[ ]( )` delimiters as syntax text nodes. Use
    // the same transaction path as clearing a URL so those delimiters are
    // removed while the linked content and its other marks remain intact.
    return editExistingLink(view, link, getBoundedLinkTooltipText(link), '') !== null;
}

export function removeExistingLink(view: EditorView, link: HTMLElement): boolean {
    const result = findLinkRange(view, link);
    if (!result) {
        if (!link.classList.contains('autolink')) return false;

        const start = view.posAtDOM(link, 0);
        const textLength = getBoundedTextNodeLength(link, MAX_TOOLTIP_FALLBACK_LINK_TEXT_CHARS);
        if (textLength === null) return false;
        const end = start + textLength;
        if (start < 0 || textLength <= 0 || end > view.state.doc.content.size) return false;

        const tr = view.state.tr.delete(start, end);
        markEditorUserInput(view);
        view.dispatch(tr);
        return true;
    }

    const openingSyntax = view.state.doc.resolve(result.start).nodeBefore;
    const closingSyntax = view.state.doc.resolve(result.end).nodeAfter;
    const hasOpeningSyntax = isLinkSyntaxNode(openingSyntax, 'open');
    const hasClosingSyntax = isLinkSyntaxNode(closingSyntax, 'close');
    const deleteFrom = hasOpeningSyntax && openingSyntax
        ? result.start - openingSyntax.nodeSize
        : result.start;
    const deleteTo = hasClosingSyntax && closingSyntax
        ? result.end + closingSyntax.nodeSize
        : result.end;
    const tr = view.state.tr.delete(deleteFrom, deleteTo);
    markEditorUserInput(view);
    view.dispatch(tr);
    return true;
}

export function editLinkAtPosition(
    view: EditorView,
    from: number,
    to: number,
    text: string,
    url: string
): number | null {
    const { state, dispatch } = view;
    const linkMarkType = state.schema.marks.link;
    if (!linkMarkType) return null;
    const docSize = state.doc.content.size;
    if (
        !Number.isFinite(from) ||
        !Number.isFinite(to) ||
        from < 0 ||
        to < from ||
        to > docSize
    ) {
        return null;
    }
    if (!hasUsableLinkTextRange(state.doc, from, to)) {
        return null;
    }

    const safeUrl = sanitizeTooltipLinkHref(url);
    if (!safeUrl) {
        try {
            const tr = state.tr.removeMark(from, to, linkMarkType);
            markEditorUserInput(view);
            dispatch(tr);
        } catch {
            return null;
        }
        return null;
    }

    try {
        const selectedText = state.doc.textBetween(from, to, '', '');
        const preserveExistingContent = selectedText === text;
        const tr = preserveExistingContent
            ? state.tr.addMark(from, to, linkMarkType.create({ href: safeUrl }))
            : state.tr
                .insertText(text, from, to)
                .addMark(from, from + text.length, linkMarkType.create({ href: safeUrl }));

        tr.setSelection(TextSelection.create(tr.doc, from + text.length));
        tr.removeStoredMark(linkMarkType);
        markEditorUserInput(view);
        dispatch(tr);
        return tr.mapping.map(from);
    } catch {
        return null;
    }
}
