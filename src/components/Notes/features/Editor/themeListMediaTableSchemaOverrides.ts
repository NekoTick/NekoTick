import type { Ctx } from '@milkdown/kit/ctx';
import {
    imageSchema,
    listItemSchema,
    orderedListSchema,
} from '@milkdown/kit/preset/commonmark';
import {
    tableCellSchema,
    tableHeaderSchema,
} from '@milkdown/kit/preset/gfm';
import { sanitizeNoteMediaSrc } from '@/lib/notes/markdown/urlSecurity';
import {
    normalizeImageWidth,
    parseCropValue,
    serializeCropValue,
} from './plugins/image-block/utils/imageSourceFragment';
import { normalizeImageAlignment } from './plugins/image-block/utils/imageNodeAttrs';
import { getMarkdownHtmlImageAttrs, normalizeMarkdownHtmlImageTextAttr } from './markdownHtmlImage';
import {
    getBoundedImageSrc,
    getObsidianImageEmbedMetadata,
    getRestorableObsidianImageSource,
    getRestorablePersistedImageSrc,
} from './obsidianImagePersistence';
import { escapeHtmlAttr, getDomAttrs, mergeDomClassNames, updateSchemaFactory } from './themeSchemaUtils';

const MAX_LIST_ITEM_DOM_ATTR_CHARS = 128;

function canRestoreMarkdownHtmlImageSource(source: unknown, attrs: Record<string, unknown>): source is string {
    if (typeof source !== 'string') return false;
    const original = getMarkdownHtmlImageAttrs(source);
    if (!original) return false;

    return original.src === attrs.src
        && original.alt === normalizeMarkdownHtmlImageTextAttr(attrs.alt)
        && original.title === (attrs.title == null ? null : normalizeMarkdownHtmlImageTextAttr(attrs.title))
        && original.align === (normalizeImageAlignment(attrs.align) || 'center')
        && original.width === normalizeImageWidth(attrs.width)
        && original.crop === serializeCropValue(attrs.crop);
}

function normalizeOrderedListOrder(value: unknown): number {
    return typeof value === 'number' && Number.isSafeInteger(value) ? value : 1;
}

function normalizeOrderedListSpread(value: unknown): string {
    if (value === false || value === 'false') return 'false';
    return 'true';
}

function normalizeListItemAttr(value: unknown): string {
    return typeof value === 'string' ? value.slice(0, MAX_LIST_ITEM_DOM_ATTR_CHARS) : '';
}

function getOrderedListItemValue(label: string, listType: string): string | undefined {
    if (listType !== 'ordered') return undefined;
    const normalizedLabel = label.replace(/[.)]$/, '');
    if (!/^-?\d{1,9}$/.test(normalizedLabel)) return undefined;
    return normalizedLabel;
}

export function applyListMediaTableSchemaOverrides(ctx: Ctx) {
    updateSchemaFactory(ctx, orderedListSchema.key, (prev: any) => ({
        ...prev,
        parseMarkdown: {
            match: (node: any) => node?.type === 'list' && node.ordered === true,
            runner: (state: any, node: any, type: any) => {
                const spread = normalizeOrderedListSpread(node.spread);
                const order = normalizeOrderedListOrder(node.start);
                state.openNode(type, { spread, order }).next(node.children).closeNode();
            },
        },
        toMarkdown: {
            match: (node: any) => node.type.name === 'ordered_list',
            runner: (state: any, node: any) => {
                state.openNode('list', undefined, {
                    ordered: true,
                    start: typeof node.attrs.order === 'number' ? node.attrs.order : 1,
                    spread: node.attrs.spread === 'true' || node.attrs.spread === true,
                });
                state.next(node.content);
                state.closeNode();
            },
        },
        toDOM: (node: any) => {
            const order = normalizeOrderedListOrder(node.attrs?.order);
            return [
                'ol',
                getDomAttrs({
                    ...(order !== 1 ? { start: String(order) } : {}),
                }),
                0,
            ];
        }
    }));

    updateSchemaFactory(ctx, listItemSchema.key, (prev: any) => ({
        ...prev,
        toDOM: (node: any) => {
            const label = normalizeListItemAttr(node.attrs.label);
            const listType = normalizeListItemAttr(node.attrs.listType);
            const spread = normalizeListItemAttr(node.attrs.spread);
            const itemValue = getOrderedListItemValue(label, listType);
            const isTaskItem = typeof node.attrs.checked === 'boolean';
            const taskState = isTaskItem ? (node.attrs.checked ? 'x' : ' ') : undefined;

            return ['li', getDomAttrs({
                ...(isTaskItem ? {
                    class: mergeDomClassNames(
                        'md-task-list-item',
                        'task-list-item',
                        'HyperMD-task-line',
                        node.attrs.checked ? 'is-checked' : undefined
                    ),
                    'data-item-type': 'task',
                    'data-checked': String(node.attrs.checked),
                    'data-task': taskState,
                    'aria-checked': String(node.attrs.checked),
                } : {}),
                'data-label': label,
                'data-list-type': listType,
                'data-spread': spread,
                ...(itemValue !== undefined ? { value: itemValue } : {}),
            }), 0];
        }
    }));

    updateSchemaFactory(ctx, imageSchema.key, (prev: any) => ({
        ...prev,
        attrs: {
            src: { default: null },
            alt: { default: null },
            title: { default: null },
            align: { default: 'center' },
            width: { default: null },
            crop: { default: null },
            markdownSource: { default: null },
            persistedSrc: { default: null },
            obsidianEmbed: { default: null }
        },
        toDOM: (node: any) => {
            const safeSrc = sanitizeNoteMediaSrc(node.attrs.src);
            const alt = normalizeMarkdownHtmlImageTextAttr(node.attrs.alt);
            const title = normalizeMarkdownHtmlImageTextAttr(node.attrs.title);
            const width = normalizeImageWidth(node.attrs.width);
            const crop = serializeCropValue(node.attrs.crop);
            const align = normalizeImageAlignment(node.attrs.align);
            return ['img', {
                class: 'md-image image-embed',
                src: safeSrc || undefined,
                alt,
                title: title || undefined,
                align: align || 'center',
                width,
                'data-src': safeSrc || undefined,
                'data-vlaina-crop': crop || undefined,
                'data-obsidian-image-embed': getObsidianImageEmbedMetadata(node.attrs.obsidianEmbed)
                    ? 'true'
                    : undefined,
                referrerpolicy: 'no-referrer',
            }];
        },
        parseDOM: [
            {
                tag: 'img[src]',
                getAttrs: (dom: HTMLElement) => {
                    const safeSrc = sanitizeNoteMediaSrc(dom.getAttribute('src'));
                    if (!safeSrc) return false;
                    return {
                        src: safeSrc,
                        alt: normalizeMarkdownHtmlImageTextAttr(dom.getAttribute('alt')),
                        title: dom.hasAttribute('title')
                            ? normalizeMarkdownHtmlImageTextAttr(dom.getAttribute('title'))
                            : null,
                        align: normalizeImageAlignment(dom.getAttribute('align')) || 'center',
                        width: normalizeImageWidth(dom.getAttribute('width')),
                        crop: parseCropValue(dom.getAttribute('data-vlaina-crop')),
                    };
                }
            },
            ...(prev.parseDOM || [])
        ],
        parseMarkdown: {
            match: (node: any) => {
                if (
                    node.type === 'html'
                    && typeof node.value === 'string'
                    && typeof node.githubHtmlRenderValue !== 'string'
                )
                    return getMarkdownHtmlImageAttrs(node.value) !== null;
                return node.type === 'image';
            },
            runner: (state: any, node: any, type: any) => {
                if (node.type === 'html') {
                    const attrs = getMarkdownHtmlImageAttrs(node.value as string);
                    if (attrs) {
                        const { wrapInParagraph, ...imageAttrs } = attrs;
                        const parentType = state.top()?.type;
                        const shouldWrapInParagraph = parentType?.contentMatch
                            ? !parentType.contentMatch.matchType(type)
                            : parentType?.inlineContent === false
                                || (wrapInParagraph && parentType?.inlineContent !== true);
                        if (shouldWrapInParagraph) state.openNode(state.schema.nodes.paragraph);
                        state.addNode(type, { ...imageAttrs, markdownSource: node.value });
                        if (shouldWrapInParagraph) state.closeNode();
                    }
                    return;
                }

                const persistedSrc = getBoundedImageSrc(node.url);
                if (!persistedSrc) return;
                state.addNode(type, {
                    src: sanitizeNoteMediaSrc(persistedSrc),
                    alt: normalizeMarkdownHtmlImageTextAttr(node.alt),
                    title: typeof node.title === 'string'
                        ? normalizeMarkdownHtmlImageTextAttr(node.title)
                        : null,
                    align: 'center',
                    width: getObsidianImageEmbedMetadata(node.data?.obsidianImageEmbed)?.width ?? null,
                    crop: null,
                    persistedSrc,
                    obsidianEmbed: getObsidianImageEmbedMetadata(node.data?.obsidianImageEmbed),
                });
            }
        },
        toMarkdown: {
            match: (node: any) => node.type.name === 'image',
            runner: (state: any, node: any) => {
                const { src, alt, title, align, width, crop } = node.attrs;
                const obsidianImageSource = getRestorableObsidianImageSource(node.attrs);
                if (obsidianImageSource) {
                    state.addNode('image', undefined, undefined, {
                        url: node.attrs.persistedSrc,
                        alt: normalizeMarkdownHtmlImageTextAttr(node.attrs.alt),
                        title: null,
                        data: { obsidianImageEmbedSource: obsidianImageSource },
                    });
                    return;
                }
                if (canRestoreMarkdownHtmlImageSource(node.attrs.markdownSource, node.attrs)) {
                    state.addNode('html', undefined, node.attrs.markdownSource);
                    return;
                }
                const restorablePersistedSrc = getRestorablePersistedImageSrc(node.attrs);
                if (restorablePersistedSrc) {
                    state.addNode('image', undefined, undefined, {
                        title: typeof title === 'string' ? normalizeMarkdownHtmlImageTextAttr(title) : null,
                        url: restorablePersistedSrc,
                        alt: normalizeMarkdownHtmlImageTextAttr(alt),
                    });
                    return;
                }
                const persistedSrc = sanitizeNoteMediaSrc(src);
                if (!persistedSrc) return;
                const srcStr = escapeHtmlAttr(persistedSrc);
                const effectiveAlign = normalizeImageAlignment(align);
                const safeWidth = normalizeImageWidth(width);
                const safeCrop = serializeCropValue(crop);

                const hasCustomWidth = safeWidth && safeWidth !== '';
                const hasCustomAlign = effectiveAlign && effectiveAlign !== 'center';

                const attrs: string[] = [];
                if (hasCustomWidth) attrs.push(`width="${escapeHtmlAttr(safeWidth)}"`);
                if (hasCustomAlign) attrs.push(`align="${escapeHtmlAttr(effectiveAlign)}"`);
                if (safeCrop) attrs.push(`data-vlaina-crop="${escapeHtmlAttr(safeCrop)}"`);
                const safeTitle = normalizeMarkdownHtmlImageTextAttr(title);
                if (safeTitle) attrs.push(`title="${escapeHtmlAttr(safeTitle)}"`);

                const attrsStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
                const altStr = escapeHtmlAttr(normalizeMarkdownHtmlImageTextAttr(alt));

                state.addNode('html', undefined, `<img src="${srcStr}" alt="${altStr}"${attrsStr} />`);
            }
        }
    }));

    updateSchemaFactory(ctx, tableHeaderSchema.key, (prev: any) => ({
        ...prev,
        toDOM: (_node: any) => ['th', getDomAttrs(_node.attrs), 0]
    }));

    updateSchemaFactory(ctx, tableCellSchema.key, (prev: any) => ({
        ...prev,
        toDOM: (_node: any) => ['td', getDomAttrs(_node.attrs), 0]
    }));
}
