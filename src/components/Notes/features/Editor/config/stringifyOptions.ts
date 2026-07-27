interface MarkdownFlowNode {
    type?: string;
    children?: unknown[];
    sourceTightFirstBlock?: unknown;
    data?: {
        vlainaDefinitionBlankLineCount?: unknown;
        vlainaAlignmentBlankLineCountBefore?: unknown;
        vlainaAlignmentBlankLineCountAfter?: unknown;
        vlainaSourceHtmlBlankLineCountAfter?: unknown;
        vlainaSourceTightBefore?: unknown;
    };
    value?: unknown;
    lang?: string | null;
    meta?: string | null;
}

interface MarkdownParentNode {
    type?: string;
    children?: MarkdownFlowNode[];
}

interface MarkdownStringifyState {
    indexStack?: number[];
}

function isInternalFrontmatterCodeNode(node: MarkdownFlowNode): boolean {
    return node.type === 'code'
        && node.lang === 'yaml-frontmatter'
        && node.meta === 'vlaina-internal-frontmatter';
}

const TIGHT_ROOT_BLOCK_TYPES = new Set([
    'blockquote',
    'code',
    'footnoteDefinition',
    'heading',
    'list',
    'math',
    'thematicBreak',
    'table',
]);

const MERGEABLE_TIGHT_ROOT_BLOCK_TYPES = new Set(['blockquote', 'list', 'table']);
const SOURCE_HTML_BOUNDARY_CONTAINER_TYPES = new Set([
    'blockquote',
    'definitionDescription',
    'footnoteDefinition',
    'list',
    'listItem',
]);

function isGeneratedBlockParagraph(node: MarkdownFlowNode): boolean {
    if (node.type !== 'paragraph' || !Array.isArray(node.children) || node.children.length !== 1) {
        return false;
    }

    const child = node.children[0] as { type?: string; value?: unknown; alt?: unknown } | undefined;
    return (child?.type === 'image' && child.alt === 'video')
        || (child?.type === 'text' && child.value === '[TOC]');
}

function isImageParagraph(node: MarkdownFlowNode): boolean {
    if (node.type !== 'paragraph' || !Array.isArray(node.children) || node.children.length !== 1) {
        return false;
    }

    return (node.children[0] as { type?: string } | undefined)?.type === 'image';
}

function isInternalBlankLineNode(node: MarkdownFlowNode): boolean {
    return node.type === 'html'
        && node.value === '<!--vlaina-markdown-blank-line-->';
}

function isInternalEditorNode(node: MarkdownFlowNode): boolean {
    return (node.type === 'html' || node.type === 'html_block')
        && typeof node.value === 'string'
        && /^<!--\s*vlaina-/i.test(node.value.trim());
}

function isUserHtmlNode(node: MarkdownFlowNode): boolean {
    return (node.type === 'html' || node.type === 'html_block')
        && !isInternalEditorNode(node);
}

function isTightUserHtmlNode(node: MarkdownFlowNode): boolean {
    if (node.type === 'paragraph' && Array.isArray(node.children) && node.children.length === 1) {
        return isTightUserHtmlNode(node.children[0] as MarkdownFlowNode);
    }

    if (node.type !== 'html' && node.type !== 'html_block') return false;
    if (typeof node.value !== 'string') return false;

    const value = node.value.trim();
    if (/^<!--\s*vlaina-/i.test(value)) return false;

    if (value.startsWith('<!--')) return value.endsWith('-->');
    if (value.startsWith('<?')) return value.endsWith('?>');
    if (/^<!\[CDATA\[/i.test(value)) return value.endsWith(']]>');
    if (/^<![A-Za-z]/i.test(value)) return value.endsWith('>');

    const rawTag = /^<(script|pre|style|textarea)(?:\s|>)/i.exec(value)?.[1];
    return rawTag !== undefined
        && new RegExp('</' + rawTag + '\\s*>$', 'i').test(value);
}

function getAlignmentBlankLineCount(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
        ? value
        : undefined;
}

function getSourceHtmlBlankLineCount(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
        ? value
        : undefined;
}

function getTrailingSourceHtmlBlankLineCount(node: MarkdownFlowNode): number | undefined {
    const ownCount = getSourceHtmlBlankLineCount(
        node.data?.vlainaSourceHtmlBlankLineCountAfter
    );
    if (ownCount !== undefined) return ownCount;
    const isFlattenedDefinitionDescription = node.type === 'paragraph'
        && typeof node.data?.vlainaDefinitionBlankLineCount === 'number';
    if (!Array.isArray(node.children) || (
        !isFlattenedDefinitionDescription
        && (!node.type || !SOURCE_HTML_BOUNDARY_CONTAINER_TYPES.has(node.type))
    )) {
        return undefined;
    }

    const lastChild = node.children[node.children.length - 1] as MarkdownFlowNode | undefined;
    return lastChild ? getTrailingSourceHtmlBlankLineCount(lastChild) : undefined;
}

function isSourceTightFirstBlockListBoundary(
    node: MarkdownFlowNode,
    edge: 'first' | 'last',
): boolean {
    if (node.type !== 'list' || !Array.isArray(node.children)) return false;
    const itemIndex = edge === 'first' ? 0 : node.children.length - 1;
    const item = node.children[itemIndex] as MarkdownFlowNode | undefined;
    return item?.type === 'listItem' && item.sourceTightFirstBlock === true;
}

function joinAdjacentTightRootBlocks(
    left: MarkdownFlowNode,
    right: MarkdownFlowNode,
    parent: MarkdownParentNode,
    state?: MarkdownStringifyState,
): number | undefined {
    const sourceHtmlBlankLineCountAfter = getTrailingSourceHtmlBlankLineCount(left);
    if (sourceHtmlBlankLineCountAfter !== undefined) {
        return sourceHtmlBlankLineCountAfter;
    }

    if (isSourceTightFirstBlockListBoundary(left, 'last')) {
        return 0;
    }

    const alignmentBlankLineCountBefore = getAlignmentBlankLineCount(
        right.data?.vlainaAlignmentBlankLineCountBefore
    );
    if (alignmentBlankLineCountBefore !== undefined) {
        return alignmentBlankLineCountBefore;
    }

    const alignmentBlankLineCountAfter = getAlignmentBlankLineCount(
        left.data?.vlainaAlignmentBlankLineCountAfter
    );
    if (alignmentBlankLineCountAfter !== undefined) {
        return alignmentBlankLineCountAfter;
    }

    if (isSourceTightFirstBlockListBoundary(right, 'first')) {
        return 0;
    }

    if (parent.type !== 'root') return undefined;

    if (right.data?.vlainaSourceTightBefore === true) {
        return 0;
    }

    if (isInternalFrontmatterCodeNode(left)) {
        return 0;
    }

    if (isTightUserHtmlNode(left) || isTightUserHtmlNode(right)) {
        return 0;
    }

    if (isUserHtmlNode(left) || isUserHtmlNode(right)) {
        return undefined;
    }

    const definitionBlankLineCount = right.data?.vlainaDefinitionBlankLineCount;
    if (
        right.type === 'paragraph'
        && typeof definitionBlankLineCount === 'number'
        && Number.isSafeInteger(definitionBlankLineCount)
        && definitionBlankLineCount >= 0
    ) {
        return definitionBlankLineCount;
    }

    if (
        isNonEmptyTextBlock(left, 'paragraph')
        && isNonEmptyTextBlock(right, 'paragraph')
        && isFollowedByHeading(parent, state)
    ) {
        return 0;
    }

    if (
        isNonEmptyTextBlock(left)
        && isNonEmptyTextBlock(right)
        && (left.type === 'heading') !== (right.type === 'heading')
    ) {
        return 0;
    }

    if (
        (isGeneratedBlockParagraph(left) && right.type === 'code')
        || (left.type === 'code' && isGeneratedBlockParagraph(right))
        || (left.type === 'code' && isNonEmptyTextBlock(right))
        || (isNonEmptyTextBlock(left) && right.type === 'code')
    ) {
        return 0;
    }

    if (
        (
            isGeneratedBlockParagraph(left)
            && !isImageParagraph(left)
            && isInternalBlankLineNode(right)
        )
        || (
            isImageParagraph(left)
            && isInternalBlankLineNode(right)
        )
        || (isInternalBlankLineNode(left) && right.type === 'code')
    ) {
        return 0;
    }

    if (
        TIGHT_ROOT_BLOCK_TYPES.has(left.type ?? '')
        && TIGHT_ROOT_BLOCK_TYPES.has(right.type ?? '')
        && (
            left.type !== right.type
            || !MERGEABLE_TIGHT_ROOT_BLOCK_TYPES.has(left.type ?? '')
        )
    ) {
        return 0;
    }

    if (
        left.type
        && right.type
        && !isInternalEditorNode(left)
        && !isInternalEditorNode(right)
        && !(left.type === 'list' && right.type === 'paragraph')
        && !(left.type === 'paragraph' && right.type === 'paragraph')
        && !(
            left.type === right.type
            && MERGEABLE_TIGHT_ROOT_BLOCK_TYPES.has(left.type)
        )
    ) {
        return 0;
    }

    return undefined;
}

function isNonEmptyTextBlock(
    node: MarkdownFlowNode,
    type?: 'heading' | 'paragraph',
): boolean {
    if (type && node.type !== type) return false;

    return (
        node.type === 'heading'
        || (
            node.type === 'paragraph'
            && Array.isArray(node.children)
            && node.children.length > 0
        )
    );
}

function isFollowedByHeading(
    parent: MarkdownParentNode,
    state?: MarkdownStringifyState,
): boolean {
    const currentIndex = state?.indexStack?.[state.indexStack.length - 1];
    if (
        typeof currentIndex !== 'number'
        || !Array.isArray(parent.children)
    ) {
        return false;
    }

    for (let index = currentIndex + 2; index < parent.children.length; index += 1) {
        const next = parent.children[index];
        if (!next || next.type === 'html' || next.type === 'html_block') {
            continue;
        }
        return next.type === 'heading';
    }

    return false;
}

export const notesRemarkStringifyOptions = {
    bullet: '-' as const,
    join: [joinAdjacentTightRootBlocks],
    rule: '-' as const,
    ruleRepetition: 3,
    setext: false,
};

export const notesRemarkGfmOptions = {
    tableCellPadding: false,
    tablePipeAlign: false,
};
