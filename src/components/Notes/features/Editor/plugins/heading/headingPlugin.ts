import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { DecorationSet } from '@milkdown/kit/prose/view';
import {
    combineHeadingMarkerDecorations,
    createActiveHeadingMarkerDecorations,
    createEmptyHeadingMarkerDecorations,
    transactionMayAffectEmptyHeadingMarkers,
} from './headingMarker';
import { installHeadingMarkerPointerRetention } from './headingMarkerPointerRetention';
import { replaceSelectedHeadingMarkerSelection } from './headingMarkerDeletion';
import { getBlockSelectionPluginState } from '../cursor/blockSelectionPluginState';

interface HeadingMarkerPluginState {
    emptyDecorations: DecorationSet;
}

const firstParagraphPlugin = $prose(() => {
    return new Plugin({
        key: new PluginKey('firstParagraph'),
        props: {
            handleKeyDown(view, event) {
                if (event.isComposing || event.key !== 'Backspace') return false;
                
                const { selection, doc } = view.state;
                const { from, empty } = selection;
                
                if (from !== 1 || !empty) return false;
                
                const firstNode = doc.firstChild;
                if (!firstNode) return false;
                
                const isEmptyParagraph = 
                    firstNode.type.name === 'paragraph' && 
                    firstNode.content.size === 0;
                
                if (isEmptyParagraph && doc.childCount > 1) {
                    const tr = view.state.tr.delete(0, firstNode.nodeSize);
                    view.dispatch(tr);
                    return true;
                }
                
                return false;
            }
        }
    });
});

const headingMarkerPlugin = $prose(() => {
    return new Plugin<HeadingMarkerPluginState>({
        key: new PluginKey<HeadingMarkerPluginState>('headingMarker'),
        state: {
            init(_config, state) {
                const emptyDecorations = createEmptyHeadingMarkerDecorations(state.doc);
                return { emptyDecorations };
            },
            apply(tr, oldPluginState, oldState, newState) {
                if (!tr.docChanged) return oldPluginState;

                const emptyDecorations = transactionMayAffectEmptyHeadingMarkers(
                        oldPluginState.emptyDecorations,
                        tr,
                        oldState.doc,
                        newState.doc,
                    )
                    ? createEmptyHeadingMarkerDecorations(newState.doc)
                    : oldPluginState.emptyDecorations.map(tr.mapping, tr.doc);
                return { emptyDecorations };
            },
        },
        props: {
            handleTextInput(view, from, to, text) {
                const { selection } = view.state;
                if (from !== selection.from || to !== selection.to) return false;
                return replaceSelectedHeadingMarkerSelection(view, text);
            },
            decorations(state) {
                const emptyDecorations = this.getState(state)?.emptyDecorations;
                if (!emptyDecorations) return undefined;
                const { selectedBlocks } = getBlockSelectionPluginState(state);
                const activeDecorations = createActiveHeadingMarkerDecorations(
                    state,
                    selectedBlocks,
                );
                return combineHeadingMarkerDecorations(
                    state.doc,
                    emptyDecorations,
                    activeDecorations,
                );
            },
        },
        view(view) {
            return installHeadingMarkerPointerRetention(view);
        },
    });
});

export const headingPlugin = [
    firstParagraphPlugin,
    headingMarkerPlugin,
];
