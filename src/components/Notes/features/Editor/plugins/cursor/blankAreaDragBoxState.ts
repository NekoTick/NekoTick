import type { Transaction, EditorState } from '@milkdown/kit/prose/state';
import { TextSelection } from '@milkdown/kit/prose/state';
import { DecorationSet } from '@milkdown/kit/prose/view';
import {
  createBlockSelectionDecorations,
  createBlockSelectionPreviewSurfaceDecorations,
  mapBlockRangesThroughTransaction,
  normalizeBlockRanges,
  type BlockRange,
} from './blockSelectionUtils';
import {
  EMPTY_BLOCK_SELECTION_PLUGIN_STATE,
  type BlankAreaDragBoxState,
  type BlockSelectionAction,
} from './blockSelectionPluginState';
import {
  createEditableMarkdownBlankLineDecorations,
  EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
} from './markdownBlankLineInteraction';
import {
  transactionInsertedTextMatches,
  transactionTouchesDecorations,
} from '../shared/transactionStepText';
import { shouldRenderBlockSelectionWithPreview } from './blockSelectionTypes';

const editorInteractionDecorationsCache = new WeakMap<
  EditorState['doc'],
  WeakMap<DecorationSet, WeakMap<DecorationSet, DecorationSet>>
>();
const EDITABLE_MARKDOWN_BLANK_LINE_TRIGGER_PATTERN = new RegExp(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER, 'u');

function combineEditorInteractionDecorations(
  doc: EditorState['doc'],
  blockSelectionDecorations: DecorationSet,
  editableBlankLineDecorations: DecorationSet,
): DecorationSet {
  if (blockSelectionDecorations === DecorationSet.empty) {
    return editableBlankLineDecorations;
  }
  if (editableBlankLineDecorations === DecorationSet.empty) {
    return blockSelectionDecorations;
  }

  let blockCache = editorInteractionDecorationsCache.get(doc);
  if (!blockCache) {
    blockCache = new WeakMap();
    editorInteractionDecorationsCache.set(doc, blockCache);
  }
  let blankLineCache = blockCache.get(blockSelectionDecorations);
  if (!blankLineCache) {
    blankLineCache = new WeakMap();
    blockCache.set(blockSelectionDecorations, blankLineCache);
  }
  const cached = blankLineCache.get(editableBlankLineDecorations);
  if (cached) return cached;

  const decorations = [
    ...blockSelectionDecorations.find(),
    ...editableBlankLineDecorations.find(),
  ];
  const decorationSet = DecorationSet.create(doc, decorations);
  blankLineCache.set(editableBlankLineDecorations, decorationSet);
  return decorationSet;
}

export function createBlankAreaDragBoxState(
  doc: EditorState['doc'],
  selectedBlocks: BlockRange[],
  blockSelectionDecorations: DecorationSet,
  editableMarkdownBlankLineDecorations: DecorationSet,
  decorationsDeferred = false,
): BlankAreaDragBoxState {
  if (
    selectedBlocks.length === 0 &&
    blockSelectionDecorations === DecorationSet.empty &&
    editableMarkdownBlankLineDecorations === DecorationSet.empty
  ) {
    return EMPTY_BLOCK_SELECTION_PLUGIN_STATE;
  }

  return {
    selectedBlocks,
    decorations: blockSelectionDecorations,
    decorationsDeferred,
    editableMarkdownBlankLineDecorations,
    interactionDecorations: combineEditorInteractionDecorations(
      doc,
      blockSelectionDecorations,
      editableMarkdownBlankLineDecorations,
    ),
  };
}

export function updateEditableMarkdownBlankLineDecorations(
  previous: BlankAreaDragBoxState,
  tr: Transaction,
): DecorationSet {
  const previousDecorations = previous.editableMarkdownBlankLineDecorations ?? DecorationSet.empty;
  if (!tr.docChanged) {
    return previousDecorations;
  }

  if (
    transactionInsertedTextMatches(tr, EDITABLE_MARKDOWN_BLANK_LINE_TRIGGER_PATTERN) ||
    transactionTouchesDecorations(previousDecorations, tr)
  ) {
    return createEditableMarkdownBlankLineDecorations(tr.doc);
  }

  return previousDecorations.map(tr.mapping, tr.doc);
}

export function applyBlankAreaDragBoxStateTransaction(
  tr: Transaction,
  pluginState: BlankAreaDragBoxState,
  action: BlockSelectionAction | undefined,
): BlankAreaDragBoxState {
  const editableMarkdownBlankLineDecorations = updateEditableMarkdownBlankLineDecorations(pluginState, tr);
  if (action?.type === 'clear-blocks') {
    return createBlankAreaDragBoxState(
      tr.doc,
      [],
      DecorationSet.empty,
      editableMarkdownBlankLineDecorations,
    );
  }
  if (action?.type === 'set-blocks') {
    const selectedBlocks = normalizeBlockRanges(action.blocks);
    const decorations = action.deferDecorations
      ? DecorationSet.empty
      : shouldRenderBlockSelectionWithPreview(selectedBlocks.length)
      ? createBlockSelectionPreviewSurfaceDecorations(
        tr.doc,
        selectedBlocks,
      )
      : createBlockSelectionDecorations(tr.doc, selectedBlocks);
    return createBlankAreaDragBoxState(
      tr.doc,
      selectedBlocks,
      decorations,
      editableMarkdownBlankLineDecorations,
      Boolean(action.deferDecorations && selectedBlocks.length > 0),
    );
  }

  if (pluginState.selectedBlocks.length === 0) {
    if (editableMarkdownBlankLineDecorations === pluginState.editableMarkdownBlankLineDecorations) {
      return pluginState;
    }
    return createBlankAreaDragBoxState(
      tr.doc,
      [],
      DecorationSet.empty,
      editableMarkdownBlankLineDecorations,
    );
  }

  if (shouldClearBlockSelectionForTransaction(tr, pluginState)) {
    return createBlankAreaDragBoxState(
      tr.doc,
      [],
      DecorationSet.empty,
      editableMarkdownBlankLineDecorations,
    );
  }

  if (!tr.docChanged) {
    return pluginState;
  }

  const selectedBlocks = mapBlockRangesThroughTransaction(pluginState.selectedBlocks, tr);
  if (selectedBlocks.length === 0) {
    return createBlankAreaDragBoxState(
      tr.doc,
      [],
      DecorationSet.empty,
      editableMarkdownBlankLineDecorations,
    );
  }
  const decorations = pluginState.decorationsDeferred
    ? DecorationSet.empty
    : shouldRenderBlockSelectionWithPreview(selectedBlocks.length)
    ? createBlockSelectionPreviewSurfaceDecorations(tr.doc, selectedBlocks)
    : createBlockSelectionDecorations(tr.doc, selectedBlocks);
  return createBlankAreaDragBoxState(
    tr.doc,
    selectedBlocks,
    decorations,
    editableMarkdownBlankLineDecorations,
    pluginState.decorationsDeferred,
  );
}

export function shouldClearBlockSelectionForTransaction(
  tr: Pick<Transaction, 'selection'> & { selectionSet?: boolean },
  pluginState: Pick<BlankAreaDragBoxState, 'selectedBlocks'>,
): boolean {
  return pluginState.selectedBlocks.length > 0
    && Boolean(tr.selectionSet)
    && tr.selection instanceof TextSelection;
}
