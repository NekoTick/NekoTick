import type { EditorState } from '@milkdown/kit/prose/state';
import { DecorationSet, type EditorView } from '@milkdown/kit/prose/view';
import type { BlockRange } from './blockSelectionUtils';
import type { BlockDragStartZone } from './blockDragSession';
import {
  clearBlockSelection,
  getBlockSelectionPluginState,
  hasSelectedBlocks,
} from './blockSelectionPluginState';
import {
  handleBlockSelectionCopy,
  handleBlockSelectionCut,
  handleBlockSelectionKeyDown,
  isClipboardEvent,
} from './blockSelectionInputHandlers';
import { handleListGapPlaceholderPointerDown } from './listGapPlaceholder';
import {
  handleMarkdownBlankLineDeletion,
  handleMarkdownBlankLineKeyboardNavigation,
  handleMarkdownBlankLinePointerDown,
  handleMarkdownBlankLineTextInput,
} from './markdownBlankLineInteraction';
import {
  focusEmptyUntitledDraftTitleFromBlankAreaClick,
  handleTrailingBlankClickInsideLastList,
  resolveInsideBlockTrailingPlainClick,
  shouldIgnoreBlankAreaDragBoxMouseDown,
  startInsideBlockTrailingPlainClickSession,
} from './blankAreaDragBoxPlainClicks';
import { deleteSelectedBlocks } from './blankAreaDragBoxDocumentSelection';

interface CreateBlankAreaDragBoxPluginPropsOptions {
  clearInsideBlockTrailingPlainClickSession: () => void;
  documentInspectedMouseDownEvents: WeakSet<MouseEvent>;
  getDragPreviewSurfaceDecorations: (state: EditorState) => DecorationSet;
  serializeSelectedBlocks: (state: EditorState, selectedBlocks: readonly BlockRange[]) => string;
  setInsideBlockTrailingPlainClickSession: (stop: () => void) => void;
  tryStartSession: (view: EditorView, event: MouseEvent) => BlockDragStartZone | null;
  tryStartUnclaimedBlankPlainClickSession: (view: EditorView, event: MouseEvent) => void;
}

export function createBlankAreaDragBoxPluginProps(options: CreateBlankAreaDragBoxPluginPropsOptions) {
  return {
    decorations(state: EditorState) {
      const interactionDecorations = getBlockSelectionPluginState(state).interactionDecorations;
      const previewDecorations = options.getDragPreviewSurfaceDecorations(state);
      if (previewDecorations === DecorationSet.empty) return interactionDecorations;
      if (interactionDecorations === DecorationSet.empty) return previewDecorations;
      return DecorationSet.create(state.doc, [
        ...interactionDecorations.find(),
        ...previewDecorations.find(),
      ]);
    },
    handleKeyDown(view: EditorView, event: KeyboardEvent) {
      if (event.isComposing) {
        return false;
      }

      const { selectedBlocks } = getBlockSelectionPluginState(view.state);
      if (handleBlockSelectionKeyDown(event, {
        view,
        selectedBlocks,
        serializeSelectedBlocks: options.serializeSelectedBlocks,
        deleteSelectedBlocks,
      })) {
        return true;
      }
      if (handleMarkdownBlankLineDeletion(view, event)) {
        return true;
      }
      return handleMarkdownBlankLineKeyboardNavigation(view, event);
    },
    handleTextInput(view: EditorView, from: number, to: number, text: string) {
      return handleMarkdownBlankLineTextInput(view, from, to, text);
    },
    handleDOMEvents: {
      copy(view: EditorView, event: Event) {
        if (!isClipboardEvent(event)) return false;
        const { selectedBlocks } = getBlockSelectionPluginState(view.state);
        return handleBlockSelectionCopy(event, {
          view,
          selectedBlocks,
          serializeSelectedBlocks: options.serializeSelectedBlocks,
        });
      },
      cut(view: EditorView, event: Event) {
        if (!isClipboardEvent(event)) return false;
        const { selectedBlocks } = getBlockSelectionPluginState(view.state);
        return handleBlockSelectionCut(event, {
          view,
          selectedBlocks,
          serializeSelectedBlocks: options.serializeSelectedBlocks,
          deleteSelectedBlocks,
        });
      },
      mousedown(view: EditorView, event: Event) {
        if (!(event instanceof MouseEvent)) return false;
        if (event.button !== 0) return false;
        if (shouldIgnoreBlankAreaDragBoxMouseDown(view, event)) {
          return false;
        }
        if (focusEmptyUntitledDraftTitleFromBlankAreaClick(view, event)) {
          event.preventDefault();
          return true;
        }
        const inspectedByDocumentRoute = options.documentInspectedMouseDownEvents.has(event);
        if (!inspectedByDocumentRoute) {
          if (handleMarkdownBlankLinePointerDown(view, event)) {
            return true;
          }
          if (handleListGapPlaceholderPointerDown(view, event)) {
            return true;
          }
          if (handleTrailingBlankClickInsideLastList(view, event)) {
            return true;
          }
        }
        const target = event.target;
        if (target instanceof Node && view.dom.contains(target) && hasSelectedBlocks(view.state)) {
          clearBlockSelection(view);
        }
        if (!inspectedByDocumentRoute) {
          const startZone = options.tryStartSession(view, event);
          if (startZone !== null) return true;
        }

        const insideBlockTrailingClickAction = resolveInsideBlockTrailingPlainClick(view, event);
        if (insideBlockTrailingClickAction) {
          options.clearInsideBlockTrailingPlainClickSession();
          options.setInsideBlockTrailingPlainClickSession(startInsideBlockTrailingPlainClickSession(
            view,
            event,
            insideBlockTrailingClickAction,
          ));
          event.preventDefault();
          return true;
        }

        options.tryStartUnclaimedBlankPlainClickSession(view, event);
        return false;
      },
    },
  };
}
