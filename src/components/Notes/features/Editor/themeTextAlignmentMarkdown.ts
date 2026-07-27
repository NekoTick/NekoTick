import {
    DEFAULT_ALIGNMENT_COMMENT_BLANK_LINE_COUNT,
    getTextAlignmentComment,
    readMarkdownNodeAlignment,
    type AlignmentCommentPlacement,
    type TextAlignment,
} from './plugins/floating-toolbar/blockAlignmentMarkdown';
import { normalizeTextAlignment } from './themeSchemaUtils';

interface AlignmentMarkdownData {
    vlainaAlignmentBlankLineCountBefore?: unknown;
    vlainaAlignmentBlankLineCountAfter?: unknown;
    vlainaAlignmentCommentPlacement?: unknown;
}

export const alignmentCommentMarkdownAttrs = {
    vlainaAlignmentBlankLineCountBefore: { default: null },
    vlainaAlignmentBlankLineCountAfter: { default: null },
};

export function getAlignmentCommentMarkdownAttrs(
    data: AlignmentMarkdownData | undefined,
): Record<string, unknown> {
    const attrs: Record<string, unknown> = {};
    for (const key of [
        'vlainaAlignmentBlankLineCountBefore',
        'vlainaAlignmentBlankLineCountAfter',
    ] as const) {
        const value = data?.[key];
        if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
            attrs[key] = value;
        }
    }
    return attrs;
}

export const textAlignmentMarkdownAttrs = {
    align: { default: 'left' },
    vlainaAlignmentBlankLineCountBefore: {
        default: DEFAULT_ALIGNMENT_COMMENT_BLANK_LINE_COUNT,
    },
    vlainaAlignmentBlankLineCountAfter: {
        default: DEFAULT_ALIGNMENT_COMMENT_BLANK_LINE_COUNT,
    },
    vlainaAlignmentCommentPlacement: { default: null },
};

function normalizeAlignmentBlankLineCount(value: unknown): number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
        ? value
        : DEFAULT_ALIGNMENT_COMMENT_BLANK_LINE_COUNT;
}

function normalizeAlignmentCommentPlacement(value: unknown): AlignmentCommentPlacement | null {
    return value === 'before' || value === 'after' ? value : null;
}

export function getTextAlignmentMarkdownParseAttrs(node: {
    align?: unknown;
    data?: AlignmentMarkdownData;
}): Record<string, unknown> | null {
    const align = readMarkdownNodeAlignment(node);
    const placement = normalizeAlignmentCommentPlacement(
        node.data?.vlainaAlignmentCommentPlacement
    );
    if (align === 'left' && placement === null) return null;

    return {
        align,
        vlainaAlignmentBlankLineCountBefore: normalizeAlignmentBlankLineCount(
            node.data?.vlainaAlignmentBlankLineCountBefore
        ),
        vlainaAlignmentBlankLineCountAfter: normalizeAlignmentBlankLineCount(
            node.data?.vlainaAlignmentBlankLineCountAfter
        ),
        vlainaAlignmentCommentPlacement: placement,
    };
}

function addTextAlignmentComment(state: any, node: any, align: TextAlignment): void {
    state.addNode('html', undefined, getTextAlignmentComment(align), {
        data: {
            vlainaAlignmentBlankLineCountBefore: normalizeAlignmentBlankLineCount(
                node.attrs.vlainaAlignmentBlankLineCountBefore
            ),
            vlainaAlignmentBlankLineCountAfter: normalizeAlignmentBlankLineCount(
                node.attrs.vlainaAlignmentBlankLineCountAfter
            ),
        },
    });
}

export function serializeTextBlockWithAlignmentComment(
    state: any,
    node: any,
    serializeBlock: () => void,
): void {
    const align = normalizeTextAlignment(node.attrs.align);
    const sourcePlacement = normalizeAlignmentCommentPlacement(
        node.attrs.vlainaAlignmentCommentPlacement
    );
    const shouldSerializeComment = align !== 'left' || sourcePlacement !== null;
    const placement = sourcePlacement ?? 'after';

    if (shouldSerializeComment && placement === 'before') {
        addTextAlignmentComment(state, node, align);
    }
    serializeBlock();
    if (shouldSerializeComment && placement === 'after') {
        addTextAlignmentComment(state, node, align);
    }
}
