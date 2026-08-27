import { TextSelection } from '@milkdown/kit/prose/state';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import { sanitizeEditorLinkHref } from '../utils/linkHref';
import {
    findLinkRange,
    resolveLinkMarkRangeAtPos,
} from '../utils/helpers';
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

    let tr = state.tr;
    if (range) tr = tr.removeMark(start, end, linkMarkType);

    const safeUrl = sanitizeTooltipLinkHref(url);
    tr = tr.insertText(text, start, end);
    if (safeUrl) {
        tr = tr.addMark(start, start + text.length, linkMarkType.create({ href: safeUrl }));
    }

    if (hasClosingSyntax && closingSyntax) {
        const closeFrom = tr.mapping.map(end, 1);
        const closeTo = tr.mapping.map(end + closingSyntax.nodeSize, -1);
        if (safeUrl) {
            tr = tr.replaceWith(
                closeFrom,
                closeTo,
                state.schema.text(`](${getLinkDestinationSource(safeUrl)})`, closingSyntax.marks),
            );
        } else {
            tr = tr.delete(closeFrom, closeTo);
        }
    }

    if (!safeUrl && hasOpeningSyntax && openingSyntax) {
        const openFrom = tr.mapping.map(start - openingSyntax.nodeSize, 1);
        const openTo = tr.mapping.map(start, -1);
        tr = tr.delete(openFrom, openTo);
    }

    const selectionPos = !safeUrl && hasOpeningSyntax && openingSyntax
        ? start - openingSyntax.nodeSize + text.length
        : start + text.length;
    tr.setSelection(TextSelection.create(tr.doc, selectionPos));
    markEditorUserInput(view);
    dispatch(tr);
    return tr.mapping.map(start);
}

export function unlinkExistingLink(view: EditorView, link: HTMLElement): boolean {
    const result = findLinkRange(view, link);
    if (!result) return false;

    const tr = view.state.tr.removeMark(result.start, result.end, result.linkMarkType);
    markEditorUserInput(view);
    view.dispatch(tr);
    return true;
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

    const tr = view.state.tr.delete(result.start, result.end);
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
        const tr = state.tr
            .insertText(text, from, to)
            .addMark(from, from + text.length, linkMarkType.create({ href: safeUrl }));

        tr.setSelection(TextSelection.create(tr.doc, from + text.length));
        markEditorUserInput(view);
        dispatch(tr);
        return tr.mapping.map(from);
    } catch {
        return null;
    }
}
