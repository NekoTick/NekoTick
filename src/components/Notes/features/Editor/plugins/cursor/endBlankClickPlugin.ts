import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Selection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { isClickBelowLastBlock, resolveTailBlankClickAction } from './endBlankClickUtils';

export const endBlankClickPluginKey = new PluginKey('endBlankClick');

interface EndBlankClickPluginState {
    temporaryTailParagraphPos: number | null;
}

interface EmptyParagraphNode {
    type: { name: 'paragraph' };
    content: { size: 0 };
    nodeSize: number;
}

type EndBlankClickMetaAction =
    | { type: 'set-temporary-tail-paragraph'; pos: number }
    | { type: 'clear-temporary-tail-paragraph' };

const EMPTY_PLUGIN_STATE: EndBlankClickPluginState = {
    temporaryTailParagraphPos: null,
};
const TEMPORARY_TAIL_PARAGRAPH_HISTORY_META = 'addToHistory';

function parseMetaAction(value: unknown): EndBlankClickMetaAction | null {
    if (!value || typeof value !== 'object') return null;
    const action = value as Partial<EndBlankClickMetaAction>;
    if (action.type === 'clear-temporary-tail-paragraph') return { type: action.type };
    if (action.type === 'set-temporary-tail-paragraph' && typeof action.pos === 'number') {
        return { type: action.type, pos: action.pos };
    }
    return null;
}

function isEmptyParagraphNode(
    node: { type?: { name?: string }; content?: { size?: number }; nodeSize?: number } | null | undefined,
): node is EmptyParagraphNode {
    return node?.type?.name === 'paragraph' && node.content?.size === 0 && typeof node.nodeSize === 'number';
}

export function getTemporaryTailParagraphPos(doc: {
    content: { size: number };
    nodeAt: (pos: number) => { type?: { name?: string }; content?: { size?: number }; nodeSize?: number } | null;
}, pos: number | null): number | null {
    if (pos === null) return null;
    const node = doc.nodeAt(pos);
    if (!isEmptyParagraphNode(node)) return null;
    const nodeSize = node.nodeSize;
    return pos === doc.content.size - nodeSize ? pos : null;
}

function isSelectionInsideTemporaryTailParagraph(state: {
    doc: {
        nodeAt: (pos: number) => { type?: { name?: string }; content?: { size?: number }; nodeSize?: number } | null;
    };
    selection: { from: number; to: number };
}, pos: number): boolean {
    const node = state.doc.nodeAt(pos);
    if (!isEmptyParagraphNode(node)) return false;
    const nodeSize = node.nodeSize;
    return state.selection.from >= pos && state.selection.to <= pos + nodeSize;
}

function createMeta(type: EndBlankClickMetaAction['type'], pos?: number): EndBlankClickMetaAction {
    if (type === 'set-temporary-tail-paragraph') {
        return { type, pos: pos ?? 0 };
    }
    return { type };
}

function createTextSelectionNearDocumentPosition(
    doc: {
        content: { size: number };
        descendants: (
            callback: (
                node: {
                    isTextblock?: boolean;
                    inlineContent?: boolean;
                    content?: { size: number };
                },
                pos: number,
            ) => boolean | void,
        ) => void;
        resolve: (pos: number) => unknown;
    },
    pos: number,
): Selection {
    let before: TextSelection | null = null;
    let after: TextSelection | null = null;

    doc.descendants((node, nodePos) => {
        if (!node.isTextblock || !node.inlineContent) return true;

        const start = nodePos + 1;
        const end = start + (node.content?.size ?? 0);
        if (nodePos <= pos) {
            try {
                before = TextSelection.create(doc as never, end);
            } catch {
                before = null;
            }
        }
        if (after === null && nodePos >= pos) {
            try {
                after = TextSelection.create(doc as never, start);
            } catch {
                after = null;
            }
        }
        return true;
    });

    const textSelection = before ?? after;
    if (textSelection) return textSelection;

    const resolvedPos = Math.max(0, Math.min(pos, doc.content.size));
    return Selection.near(doc.resolve(resolvedPos) as never, -1);
}

export function hasTemporaryTailParagraph(state: any): boolean {
    const pluginState = endBlankClickPluginKey.getState(state) as EndBlankClickPluginState | undefined;
    return getTemporaryTailParagraphPos(state.doc, pluginState?.temporaryTailParagraphPos ?? null) !== null;
}

export function removeTemporaryTailParagraph(view: EditorView): boolean {
    const pluginState = endBlankClickPluginKey.getState(view.state) as EndBlankClickPluginState | undefined;
    const pos = getTemporaryTailParagraphPos(view.state.doc, pluginState?.temporaryTailParagraphPos ?? null);
    if (pos === null) return false;
    const node = view.state.doc.nodeAt(pos);
    if (!node?.nodeSize) return false;

    let tr = view.state.tr
        .delete(pos, pos + node.nodeSize)
        .setMeta(TEMPORARY_TAIL_PARAGRAPH_HISTORY_META, false)
        .setMeta(endBlankClickPluginKey, createMeta('clear-temporary-tail-paragraph'));
    tr = tr.setSelection(createTextSelectionNearDocumentPosition(tr.doc, pos));
    view.dispatch(tr);
    return true;
}

export function dispatchTailBlankClickAction(view: EditorView): boolean {
    const { state } = view;
    const action = resolveTailBlankClickAction(state);
    if (!action) return false;

    let tr = state.tr;
    if (action.mode === 'insert-temporary') {
        const docEnd = state.doc.content.size;
        const paragraphType = state.doc.type.schema.nodes.paragraph;
        if (!paragraphType) return false;
        tr = tr
            .insert(docEnd, paragraphType.create())
            .setMeta(TEMPORARY_TAIL_PARAGRAPH_HISTORY_META, false)
            .setMeta(endBlankClickPluginKey, createMeta('set-temporary-tail-paragraph', docEnd));
    }

    tr = tr.setSelection(Selection.near(tr.doc.resolve(action.targetPos), action.bias));
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return true;
}

export const endBlankClickPlugin = $prose(() => {
    return new Plugin({
        key: endBlankClickPluginKey,
        state: {
            init() {
                return EMPTY_PLUGIN_STATE;
            },
            apply(tr, pluginState, _oldState, newState) {
                let temporaryTailParagraphPos = pluginState.temporaryTailParagraphPos;
                if (tr.docChanged && temporaryTailParagraphPos !== null) {
                    temporaryTailParagraphPos = tr.mapping.map(temporaryTailParagraphPos, 1);
                }

                const metaAction = parseMetaAction(tr.getMeta(endBlankClickPluginKey));
                if (metaAction?.type === 'set-temporary-tail-paragraph') {
                    temporaryTailParagraphPos = metaAction.pos;
                } else if (metaAction?.type === 'clear-temporary-tail-paragraph') {
                    temporaryTailParagraphPos = null;
                }

                return {
                    temporaryTailParagraphPos: getTemporaryTailParagraphPos(newState.doc, temporaryTailParagraphPos),
                };
            },
        },
        appendTransaction(_transactions, _oldState, newState) {
            const pluginState = endBlankClickPluginKey.getState(newState) as EndBlankClickPluginState | undefined;
            const pos = getTemporaryTailParagraphPos(newState.doc, pluginState?.temporaryTailParagraphPos ?? null);
            if (pos === null) return null;
            if (isSelectionInsideTemporaryTailParagraph(newState, pos)) return null;

            const node = newState.doc.nodeAt(pos);
            if (!node?.nodeSize) return null;

            let tr = newState.tr
                .delete(pos, pos + node.nodeSize)
                .setMeta(TEMPORARY_TAIL_PARAGRAPH_HISTORY_META, false)
                .setMeta(endBlankClickPluginKey, createMeta('clear-temporary-tail-paragraph'));
            tr = tr.setSelection(createTextSelectionNearDocumentPosition(tr.doc, pos));
            return tr;
        },
        props: {
            handleDOMEvents: {
                blur(view) {
                    removeTemporaryTailParagraph(view);
                    return false;
                },
                mousedown(view, event) {
                    if (!(event instanceof MouseEvent)) return false;
                    if (event.button !== 0) return false;
                    if (event.defaultPrevented) return false;
                    if (!(event.target instanceof HTMLElement)) return false;
                    if (!view.dom.contains(event.target)) return false;
                    if (event.target.closest('.heading-toggle-btn')) return false;
                    if (event.target !== view.dom) return false;
                    if (!isClickBelowLastBlock(view.dom, event.clientY)) return false;

                    const handled = dispatchTailBlankClickAction(view);
                    if (!handled) return false;

                    event.preventDefault();
                    return true;
                },
            },
        },
    });
});
