import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';

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

export const headingPlugin = [
    firstParagraphPlugin,
];
