import type { Ctx } from '@milkdown/kit/ctx';
import {
    blockquoteSchema,
    codeBlockSchema,
    headingSchema,
    htmlBlockSchema,
    htmlSchema,
    inlineCodeSchema,
    hrSchema,
    linkSchema,
    paragraphSchema,
} from '@milkdown/kit/preset/commonmark';
import { sanitizeNoteLinkHref } from '@/lib/notes/markdown/urlSecurity';
import {
    getAlignedBlockDomAttrs,
    getDomAttrs,
    getDomTextAlignment,
    mergeDomClassNames,
    updateSchemaFactory,
} from './themeSchemaUtils';
import {
    alignmentCommentMarkdownAttrs,
    getAlignmentCommentMarkdownAttrs,
    getTextAlignmentMarkdownParseAttrs,
    serializeTextBlockWithAlignmentComment,
    textAlignmentMarkdownAttrs,
} from './themeTextAlignmentMarkdown';
import {
    readEscapedMarkdownBlockSyntax,
} from '@/components/common/markdown/escapedBlockSyntax';
import {
    getRawMarkdownHtmlValue,
    getRawMarkdownHtmlRenderValue,
    isLiteralInlineMarkdownHtmlElement,
    MARKDOWN_HTML_INLINE_CLASS,
    MARKDOWN_HTML_SOURCE_TEXT_CLASS,
    renderRawMarkdownHtmlValueIntoElement,
    sanitizeRawMarkdownHtmlValue,
} from './themeRawMarkdownHtml';
import {
    SOURCE_HTML_BLANK_LINE_COUNT_AFTER_ATTR,
    SOURCE_TIGHT_HTML_BEFORE_ATTR,
} from './plugins/html-block/htmlBlockMarkdown';
export {
    renderRawMarkdownHtmlValueIntoElement,
    sanitizeRawMarkdownHtmlValue,
    shouldRenderRawMarkdownHtmlValueAsLiteralText,
} from './themeRawMarkdownHtml';

function getHeadingCompatibilityClass(level: unknown): string {
    const normalizedLevel = typeof level === 'number' && level >= 1 && level <= 6 ? level : 1;
    return `HyperMD-header HyperMD-header-${normalizedLevel} cm-header cm-header-${normalizedLevel} cm-line`;
}

function isExternalLinkHref(href: string | null): boolean {
    return typeof href === 'string' && /^(?:https?:|mailto:|weixin:)/i.test(href.trim());
}

export function applyTextSchemaOverrides(ctx: Ctx) {
    updateSchemaFactory(ctx, paragraphSchema.key, (prev: any) => ({
        ...prev,
        attrs: {
            ...(prev.attrs || {}),
            ...textAlignmentMarkdownAttrs,
            vlainaEscapedBlockSyntax: { default: null },
        },
        toDOM: (node: any) => [
            'p',
            (() => {
                const attrs = getAlignedBlockDomAttrs(node.attrs.align);
                return {
                    ...attrs,
                    class: mergeDomClassNames(attrs.class, 'md-p cm-line'),
                };
            })(),
            0
        ],
        parseDOM: [
            {
                tag: 'p',
                getAttrs: (dom: HTMLElement) => ({
                    align: getDomTextAlignment(dom),
                }),
            },
            ...(prev.parseDOM || []),
        ],
        parseMarkdown: {
            match: (node: any) => node.type === 'paragraph',
            runner: (state: any, node: any, type: any) => {
                const escapedBlockSyntax = readEscapedMarkdownBlockSyntax(node);
                const attrs = {
                    ...(getTextAlignmentMarkdownParseAttrs(node) || {}),
                    ...(escapedBlockSyntax ? { vlainaEscapedBlockSyntax: escapedBlockSyntax } : {}),
                };
                state.openNode(type, Object.keys(attrs).length > 0 ? attrs : undefined);
                state.next(node.children);
                state.closeNode();
            },
        },
        toMarkdown: {
            match: (node: any) => node.type.name === 'paragraph',
            runner: (state: any, node: any) => {
                serializeTextBlockWithAlignmentComment(
                    state,
                    node,
                    () => prev.toMarkdown.runner(state, node),
                );
            },
        },
    }));

    updateSchemaFactory(ctx, headingSchema.key, (prev: any) => ({
        ...prev,
        attrs: {
            ...(prev.attrs || {}),
            ...textAlignmentMarkdownAttrs,
        },
        toDOM: (node: any) => {
            const level = node.attrs.level;
            const attrs = getAlignedBlockDomAttrs(node.attrs.align);
            return [`h${level}`, {
                ...attrs,
                class: mergeDomClassNames(attrs.class, getHeadingCompatibilityClass(level)),
            }, 0];
        },
        parseDOM: [
            ...Array.from({ length: 6 }, (_, index) => ({
                tag: `h${index + 1}`,
                getAttrs: (dom: HTMLElement) => ({
                    level: index + 1,
                    align: getDomTextAlignment(dom),
                }),
            })),
            ...(prev.parseDOM || []),
        ],
        parseMarkdown: {
            match: (node: any) => node.type === 'heading',
            runner: (state: any, node: any, type: any) => {
                const attrs = {
                    level: node.depth,
                    ...(getTextAlignmentMarkdownParseAttrs(node) || {}),
                };
                state.openNode(type, attrs);
                state.next(node.children);
                state.closeNode();
            },
        },
        toMarkdown: {
            match: (node: any) => node.type.name === 'heading',
            runner: (state: any, node: any) => {
                serializeTextBlockWithAlignmentComment(
                    state,
                    node,
                    () => prev.toMarkdown.runner(state, node),
                );
            },
        },
    }));

    updateSchemaFactory(ctx, linkSchema.key, (prev: any) => ({
        ...prev,
        toDOM: (node: any) => {
            const safeHref = sanitizeNoteLinkHref(node.attrs.href);
            if (!safeHref) return ['span', 0];
            const attrs = getDomAttrs({ ...node.attrs, href: safeHref ?? undefined });
            const isExternalLink = isExternalLinkHref(safeHref);
            const className = mergeDomClassNames(
                attrs.class,
                isExternalLink ? 'external-link' : 'internal-link'
            );

            if (className) {
                attrs.class = className;
            } else {
                delete attrs.class;
            }

            return ['a', attrs, 0];
        }
    }));

    updateSchemaFactory(ctx, htmlSchema.key, (prev: any) => ({
        ...prev,
        toDOM: (node: any) => {
            const renderValue = getRawMarkdownHtmlRenderValue(node.attrs?.renderValue);
            const safeValue = sanitizeRawMarkdownHtmlValue(renderValue ?? node.attrs?.value);
            const dom = prev.toDOM({
                ...node,
                attrs: {
                    ...node.attrs,
                    renderValue: null,
                    value: safeValue,
                },
            });
            if (dom instanceof HTMLElement) {
                dom.classList.add(MARKDOWN_HTML_INLINE_CLASS);
                dom.classList.toggle(
                    MARKDOWN_HTML_SOURCE_TEXT_CLASS,
                    isLiteralInlineMarkdownHtmlElement(dom, safeValue),
                );
            }
            return dom;
        },
        parseMarkdown: {
            match: (node: any) => prev.parseMarkdown?.match?.(node) ?? node.type === 'html',
            runner: (state: any, node: any, type: any) => {
                const rawValue = getRawMarkdownHtmlValue(node.value);
                if (rawValue) {
                    state.addNode(type, {
                        renderValue: getRawMarkdownHtmlRenderValue(node.githubHtmlRenderValue),
                        value: rawValue,
                    });
                }
            },
        },
        toMarkdown: {
            match: (node: any) => node.type.name === 'html',
            runner: (state: any, node: any) => {
                const rawValue = getRawMarkdownHtmlValue(node.attrs?.value);
                if (rawValue) state.addNode('html', undefined, rawValue);
            },
        },
    }));

    updateSchemaFactory(ctx, inlineCodeSchema.key, (prev: any) => ({
        ...prev,
        toDOM: (mark: any) => {
            const attrs = typeof prev.toDOM === 'function' ? prev.toDOM(mark)?.[1] : {};
            return ['code', {
                ...(typeof attrs === 'object' && attrs ? attrs : {}),
                class: mergeDomClassNames(
                    typeof attrs === 'object' && attrs ? attrs.class : undefined,
                    'v-std-code cm-inline-code'
                ),
            }, 0];
        },
    }));

    updateSchemaFactory(ctx, blockquoteSchema.key, (prev: any) => ({
        ...prev,
        toDOM: (node: any) => {
            const inheritedAttrs = typeof prev.toDOM === 'function' ? prev.toDOM(node)?.[1] : {};
            return ['blockquote', {
                ...(typeof inheritedAttrs === 'object' && inheritedAttrs ? inheritedAttrs : {}),
                class: mergeDomClassNames(
                    typeof inheritedAttrs === 'object' && inheritedAttrs ? inheritedAttrs.class : undefined,
                    'v-q HyperMD-quote cm-hmd-indent-in-quote cm-line'
                ),
            }, 0];
        },
    }));

    updateSchemaFactory(ctx, hrSchema.key, (prev: any) => ({
        ...prev,
        toDOM: () => [
            'div',
            {
                class: 'md-hr',
                'data-type': 'hr',
                contenteditable: 'false',
            },
            ['hr']
        ],
    }));

    updateSchemaFactory(ctx, codeBlockSchema.key, (prev: any) => ({
        ...prev,
        toDOM: (node: any) => [
            'div',
            getDomAttrs({ 'data-language': node.attrs.language }),
            ['pre', ['code', { spellcheck: 'false' }, 0]]
        ]
    }));

    updateSchemaFactory(ctx, htmlBlockSchema.key, (prev: any) => ({
        ...prev,
        attrs: {
            ...(prev.attrs || {}),
            ...alignmentCommentMarkdownAttrs,
            [SOURCE_HTML_BLANK_LINE_COUNT_AFTER_ATTR]: { default: null },
            [SOURCE_TIGHT_HTML_BEFORE_ATTR]: { default: false },
        },
        toDOM: (node: any) => {
            const renderValue = getRawMarkdownHtmlRenderValue(node.attrs?.renderValue);
            const safeValue = sanitizeRawMarkdownHtmlValue(renderValue ?? node.attrs?.value);
            const dom = prev.toDOM({
                ...node,
                attrs: {
                    ...node.attrs,
                    renderValue: null,
                    value: safeValue,
                },
            });
            if (dom instanceof HTMLElement) {
                dom.classList.add('md-htmlblock', 'md-htmlblock-container');
                renderRawMarkdownHtmlValueIntoElement(dom, safeValue);
            }
            return dom;
        },
        parseMarkdown: {
            match: (node: any) => prev.parseMarkdown?.match?.(node) ?? node.type === 'html',
            runner: (state: any, node: any, type: any) => {
                const rawValue = getRawMarkdownHtmlValue(node.value);
                if (rawValue) {
                    state.addNode(type, {
                        renderValue: getRawMarkdownHtmlRenderValue(node.githubHtmlRenderValue),
                        value: rawValue,
                        ...getAlignmentCommentMarkdownAttrs(node.data),
                        [SOURCE_HTML_BLANK_LINE_COUNT_AFTER_ATTR]:
                            getSourceHtmlBlankLineCount(
                                node.data?.[SOURCE_HTML_BLANK_LINE_COUNT_AFTER_ATTR]
                            ),
                        [SOURCE_TIGHT_HTML_BEFORE_ATTR]:
                            node.data?.[SOURCE_TIGHT_HTML_BEFORE_ATTR] === true,
                    });
                }
            },
        },
        toMarkdown: {
            match: (node: any) => node.type.name === 'html_block',
            runner: (state: any, node: any) => {
                const rawValue = getRawMarkdownHtmlValue(node.attrs?.value);
                if (rawValue) {
                    const data = getAlignmentCommentMarkdownAttrs(node.attrs);
                    if (node.attrs?.[SOURCE_TIGHT_HTML_BEFORE_ATTR] === true) {
                        data[SOURCE_TIGHT_HTML_BEFORE_ATTR] = true;
                    }
                    const sourceHtmlBlankLineCountAfter = getSourceHtmlBlankLineCount(
                        node.attrs?.[SOURCE_HTML_BLANK_LINE_COUNT_AFTER_ATTR]
                    );
                    if (sourceHtmlBlankLineCountAfter !== null) {
                        data[SOURCE_HTML_BLANK_LINE_COUNT_AFTER_ATTR] = sourceHtmlBlankLineCountAfter;
                    }
                    state.addNode(
                        'html',
                        undefined,
                        rawValue,
                        Object.keys(data).length > 0 ? { data } : undefined,
                    );
                }
            },
        },
    }));
}

function getSourceHtmlBlankLineCount(value: unknown): number | null {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
        ? value
        : null;
}
