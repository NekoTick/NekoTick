import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { focusNoteTitleInputAtEnd } from '../../utils/titleInputDom';
import { shouldMoveSelectionToTitle } from './titleNavigationUtils';

export const titleNavigationPluginKey = new PluginKey('titleNavigation');

export const titleNavigationPlugin = $prose(() => {
    return new Plugin({
        key: titleNavigationPluginKey,
        props: {
            handleKeyDown(view, event) {
                if (
                    event.defaultPrevented ||
                    event.isComposing ||
                    event.shiftKey ||
                    event.ctrlKey ||
                    event.metaKey ||
                    event.altKey
                ) return false;
                const { $cursor } = view.state.selection;
                const shouldMove = event.key === 'ArrowUp'
                    ? shouldMoveSelectionToTitle(view)
                    : event.key === 'Backspace'
                        && $cursor?.depth === 1
                        && $cursor.before(1) === 0
                        && $cursor.parentOffset === 0
                        && $cursor.parent.type.name === 'paragraph';
                if (!shouldMove) return false;
                if (!focusNoteTitleInputAtEnd()) return false;

                event.preventDefault();
                return true;
            },
        },
    });
});
