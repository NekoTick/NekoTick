import { remarkPluginsCtx, schemaTimerCtx } from '@milkdown/core';
import { createTimer, type MilkdownPlugin } from '@milkdown/ctx';
import { $node } from '@milkdown/kit/utils';
import { remarkDefinitionLists } from '@/components/common/markdown/definitionListMarkdown';

const definitionListsRemarkReady = createTimer('definitionListsRemarkReady');

function getDefinitionBlankLineCount(node: { data?: unknown }): number {
    const value = (
        node.data as { vlainaDefinitionBlankLineCount?: unknown } | undefined
    )?.vlainaDefinitionBlankLineCount;
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export const remarkDefinitionListsPlugin: MilkdownPlugin = (ctx) => {
    ctx.record(definitionListsRemarkReady);
    ctx.update(schemaTimerCtx, (timers) => timers.concat(definitionListsRemarkReady));

    return async () => {
        const remarkPlugin = {
            plugin: remarkDefinitionLists,
            options: undefined,
        };

        ctx.update(remarkPluginsCtx, (plugins) => plugins.concat(remarkPlugin as any));
        ctx.done(definitionListsRemarkReady);

        return () => {
            ctx.update(remarkPluginsCtx, (plugins) => plugins.filter((plugin) => plugin !== (remarkPlugin as any)));
            ctx.update(schemaTimerCtx, (timers) => timers.filter((timer) => timer !== definitionListsRemarkReady));
            ctx.clearTimer(definitionListsRemarkReady);
        };
    };
};

export const definitionListSchema = $node('definition_list', () => ({
    content: '(definition_term definition_desc)+',
    group: 'block',
    defining: true,
    parseDOM: [{
        tag: 'dl'
    }],
    toDOM: () => ['dl', { class: 'definition-list' }, 0],
    parseMarkdown: {
        match: (node) => node.type === 'definitionList',
        runner: (state, node, type) => {
            state.openNode(type);
            state.next(node.children);
            state.closeNode();
        }
    },
    toMarkdown: {
        match: (node) => node.type.name === 'definition_list',
        runner: (state, node) => {
            node.forEach((child) => {
                state.next(child);
            });
        }
    }
}));

export const definitionTermSchema = $node('definition_term', () => ({
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [{
        tag: 'dt'
    }],
    toDOM: () => ['dt', { class: 'definition-term' }, 0],
    parseMarkdown: {
        match: (node) => node.type === 'definitionTerm',
        runner: (state, node, type) => {
            state.openNode(type);
            state.next(node.children);
            state.closeNode();
        }
    },
    toMarkdown: {
        match: (node) => node.type.name === 'definition_term',
        runner: (state, node) => {
            state.openNode('paragraph');
            state.next(node.content);
            state.closeNode();
        }
    }
}));

export const definitionDescSchema = $node('definition_desc', () => ({
    content: 'block+',
    group: 'block',
    defining: true,
    attrs: {
        sourceBlankLineCount: { default: 0 },
    },
    parseDOM: [{
        tag: 'dd'
    }],
    toDOM: () => ['dd', { class: 'definition-desc' }, 0],
    parseMarkdown: {
        match: (node) => node.type === 'definitionDescription',
        runner: (state, node, type) => {
            state.openNode(type, {
                sourceBlankLineCount: getDefinitionBlankLineCount(node),
            });
            state.next(node.children);
            state.closeNode();
        }
    },
    toMarkdown: {
        match: (node) => node.type.name === 'definition_desc',
        runner: (state, node) => {
            (state.openNode as (...args: any[]) => any)('paragraph', undefined, {
                data: {
                    vlainaDefinitionBlankLineCount: node.attrs.sourceBlankLineCount,
                },
            });
            state.addNode('text', undefined, ': ');
            const firstChild = node.firstChild;
            if (firstChild?.type.name === 'html_block') {
                state.next(firstChild);
                state.closeNode();
                for (let index = 1; index < node.childCount; index += 1) {
                    state.next(node.child(index));
                }
                return;
            }
            if (firstChild?.type.name === 'paragraph') {
                state.next(firstChild.content);
                state.closeNode();
                for (let index = 1; index < node.childCount; index += 1) {
                    state.next(node.child(index));
                }
                return;
            }
            state.closeNode();
            state.next(node.content);
        }
    }
}));
