import { getCodeBlockSourceText } from '../code/codeBlockText';
import {
    consumeClipboardTraversalNode,
    createClipboardTraversalBudget,
    getProseNodeChildren,
} from './clipboardTraversalBudget';
import { isBackslashHardBreakSourceTextNode } from '../hard-break/backslashHardBreakNodes';

function escapeLinkText(text: string): string {
    return text.replace(/([[\]])/g, '\\$1');
}

function escapeLinkUrl(url: string): string {
    if (/[\s<>]/.test(url)) {
        return '<' + url.replace(/([\\<>])/g, '\\$1') + '>';
    }
    return url.replace(/([()])/g, '\\$1');
}

function normalizeHeadingLevel(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(1, Math.min(6, Math.trunc(value)))
        : 1;
}

function isHardBreakNodeName(name: string): boolean {
    return name === 'hardbreak' || name === 'hard_break';
}

export function serializeSliceToText(slice: any): string {
    const budget = createClipboardTraversalBudget();

    const processNode = (node: any, depth: number): string | null => {
        if (!consumeClipboardTraversalNode(budget, depth)) {
            return null;
        }

        if (node.isText && node.text) {
            if (node.marks?.some((mark: any) => mark.type.name === 'markdownSyntax')) {
                return '';
            }
            const linkMark = node.marks?.find((m: any) => m.type.name === 'link');
            if (linkMark) {
                const href = linkMark.attrs?.href;
                if (typeof href !== 'string') {
                    return node.text;
                }
                if (node.text === href) {
                    return node.text;
                } else {
                    return '[' + escapeLinkText(node.text) + '](' + escapeLinkUrl(href) + ')';
                }
            }
            return node.text;
        }

        if (isHardBreakNodeName(node.type.name)) {
            return '\n';
        }

        if (node.type.name === 'hr') {
            return '---\n';
        }

        if (node.type.name === 'heading') {
            const level = normalizeHeadingLevel(node.attrs?.level);
            const rawContent = serializeNodeContent(node, depth + 1);
            if (rawContent === null) return null;
            const content = rawContent.replace(/\n+$/, '');
            return '#'.repeat(level) + (content ? ' ' + content : '') + '\n';
        }

        if (node.type.name === 'code_block') {
            const language = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
            const content = getCodeBlockSourceText(node);
            return '```' + language + '\n' + content + '\n```\n';
        }

        if (node.isTextblock && node.content?.size === 0) {
            return '\n';
        }

        if (node.content && node.content.size > 0) {
            const content = serializeNodeContent(node, depth + 1);
            if (content === null) return null;
            if (node.isBlock) {
                return content.endsWith('\n') ? content : content + '\n';
            }
            return content;
        }

        return '';
    };

    const serializeNodeContent = (
        node: any,
        depth: number,
    ): string | null => {
        let content = '';
        const children = getProseNodeChildren(node);
        for (let index = 0; index < children.length; index += 1) {
            const child = children[index];
            const next = children[index + 1];
            if (
                isBackslashHardBreakSourceTextNode(child)
                && isHardBreakNodeName(next?.type?.name)
            ) {
                continue;
            }

            if (isHardBreakNodeName(child.type?.name)) {
                content += '\n';
                continue;
            }

            const piece = processNode(child, depth);
            if (piece === null) return null;
            content += piece;
        }
        return content;
    };

    let result = '';
    const topLevelNodes = getProseNodeChildren({ content: slice.content });
    for (let index = 0; index < topLevelNodes.length; index += 1) {
        const node = topLevelNodes[index];
        const next = topLevelNodes[index + 1];
        if (
            isBackslashHardBreakSourceTextNode(node)
            && isHardBreakNodeName(next?.type?.name)
        ) {
            continue;
        }

        const piece = processNode(node, 0);
        if (piece === null) return '';
        result += piece;
    }

    return result.replace(/\n+$/, '');
}
