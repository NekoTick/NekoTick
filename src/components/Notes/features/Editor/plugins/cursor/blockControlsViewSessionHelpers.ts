import { isAbsolutePath } from '@/lib/storage/adapter';
import { MAX_COMPOSER_PROGRAMMATIC_INSERT_CHARS, canInsertTextIntoComposerValue } from '@/lib/ui/composerFocusRegistry';
import { normalizeSelectedTextForComposer } from '@/lib/ui/normalizeSelectedTextForComposer';
import { savePendingEditorMarkdown } from '@/stores/notes/pendingEditorMarkdown';
import { useNotesStore } from '@/stores/useNotesStore';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { Fragment } from '@milkdown/kit/prose/model';
import { Selection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { getCurrentMarkdownParser, getCurrentMarkdownSerializer } from '../../utils/editorViewRegistry';
import { serializeEditorMarkdownSnapshot } from '../../utils/pendingMarkdownUpdate';
import { markEditorUserInput } from '../shared/userInputEvents';
import type { BlockDragPreviewHandle } from './blockDragPreview';
import { serializeSelectedBlocksToText } from './blockSelectionSerializer';
import { normalizeBlockRanges, type BlockRange } from './blockSelectionUtils';
import { buildDeleteRangesForBlockSelection } from './listBlockUtils';

export const SCROLL_ROOT_SELECTOR = '[data-note-scroll-root="true"]';
export const MIN_DROP_DISTANCE_PX = 4;
export const HANDLE_VERTICAL_GAP_PX = 24;
export const NOTES_BLOCK_DROP_TARGET_SELECTOR = '[data-notes-block-drop-target="true"]';
export const NOTES_TAB_PATH_SELECTOR = '[data-notes-tab-path]';
export const NOTES_SPLIT_LEAF_PATH_SELECTOR = '[data-notes-split-leaf-path]';
export const NOTES_FILE_TREE_FILE_PATH_SELECTOR = '[data-file-tree-kind="file"][data-file-tree-path]';
export const BLOCK_DRAG_TAB_OPEN_DELAY_MS = 280;
export const BLOCK_SELECTION_PENDING_CLASS = 'editor-block-selection-pending';
export const LIST_CONTAINER_NODE_NAMES = new Set(['bullet_list', 'ordered_list']);

export function serializeDraggedRangesForComposer(view: EditorView, ranges: BlockRange[]): string {
  if (ranges.some((range) => range.to - range.from > MAX_COMPOSER_PROGRAMMATIC_INSERT_CHARS)) {
    return '';
  }

  const text = normalizeSelectedTextForComposer(
    serializeSelectedBlocksToText(view.state, ranges, {
      markdownSerializer: getCurrentMarkdownSerializer(),
    })
  );
  return canInsertTextIntoComposerValue('', text) ? text : '';
}

export function serializeDraggedRangesForMarkdown(view: EditorView, ranges: BlockRange[]): string {
  if (ranges.some((range) => range.to - range.from > MAX_COMPOSER_PROGRAMMATIC_INSERT_CHARS)) {
    return '';
  }

  return serializeSelectedBlocksToText(view.state, ranges, {
    markdownSerializer: getCurrentMarkdownSerializer(),
    preserveSingleListBlockMarker: true,
  }).trim();
}

export function getCurrentNotePath(): string | null {
  return useNotesStore.getState().currentNote?.path ?? null;
}

export function getReferenceMarkdownForNotePath(notePath: string | null): string {
  if (!notePath) return '';
  const state = useNotesStore.getState();
  if (state.currentNote?.path === notePath) {
    return state.currentNote.content;
  }
  return state.noteContentsCache.get(notePath)?.content ?? '';
}

export function openNotePath(path: string): Promise<void> {
  const state = useNotesStore.getState();
  return isAbsolutePath(path)
    ? state.openNoteByAbsolutePath(path)
    : state.openNote(path);
}

export function serializeSourceMarkdownAfterDelete(
  view: EditorView,
  ranges: readonly BlockRange[],
  sourceNotePath: string | null,
): string | null {
  const serializer = getCurrentMarkdownSerializer();
  if (!serializer || !sourceNotePath) return null;

  const normalized = normalizeBlockRanges(ranges);
  const deleteRanges = buildDeleteRangesForBlockSelection(view.state, normalized);
  if (deleteRanges.length === 0) return null;

  try {
    let tr = view.state.tr;
    for (let index = deleteRanges.length - 1; index >= 0; index -= 1) {
      const range = deleteRanges[index];
      tr = tr.delete(range.from, range.to);
    }

    if (tr.doc.content.size === 0) {
      const paragraphType = tr.doc.type.schema.nodes.paragraph;
      if (paragraphType) {
        tr = tr.insert(0, paragraphType.create());
      }
    }

    return serializeEditorMarkdownSnapshot(
      serializer(tr.doc),
      getReferenceMarkdownForNotePath(sourceNotePath),
    );
  } catch {
    return null;
  }
}

export function serializeCurrentMarkdownForNotePath(view: EditorView, notePath: string | null): string | null {
  const serializer = getCurrentMarkdownSerializer();
  if (!serializer || !notePath) return null;

  try {
    return serializeEditorMarkdownSnapshot(
      serializer(view.state.doc),
      getReferenceMarkdownForNotePath(notePath),
    );
  } catch {
    return null;
  }
}

export function parseDraggedMarkdown(markdown: string | null): Fragment | null {
  if (!markdown?.trim()) return null;
  const parser = getCurrentMarkdownParser();
  if (!parser) return null;

  try {
    const doc = parser(markdown) as ProseNode | null;
    return doc?.content ? (doc.content as Fragment) : null;
  } catch {
    return null;
  }
}

export function unwrapListFragmentForTarget(fragment: Fragment, parentTypeName: string): Fragment | null {
  if (!LIST_CONTAINER_NODE_NAMES.has(parentTypeName) || fragment.childCount !== 1) {
    return null;
  }

  const child = fragment.child(0);
  return child.type.name === parentTypeName ? (child.content as Fragment) : null;
}

export function resolveCrossNoteInsertContent(view: EditorView, markdown: string | null, insertPos: number): {
  content: Fragment;
  insertPos: number;
} | null {
  const fragment = parseDraggedMarkdown(markdown);
  if (!fragment || fragment.size === 0) return null;

  try {
    const safePos = Math.max(0, Math.min(insertPos, view.state.doc.content.size));
    const $target = view.state.doc.resolve(safePos);
    const targetIndex = $target.index();
    const unwrappedListContent = unwrapListFragmentForTarget(fragment, $target.parent.type.name);
    const candidates = unwrappedListContent ? [unwrappedListContent, fragment] : [fragment];

    for (const content of candidates) {
      if (content.size === 0) continue;
      if ($target.parent.canReplace(targetIndex, targetIndex, content)) {
        return { content, insertPos: safePos };
      }
    }
  } catch {
  }

  return null;
}

export function canInsertCrossNoteDraggedMarkdown(view: EditorView, markdown: string | null, insertPos: number): boolean {
  return (
    getCurrentMarkdownSerializer() !== null &&
    resolveCrossNoteInsertContent(view, markdown, insertPos) !== null
  );
}

export function insertCrossNoteDraggedMarkdown(
  view: EditorView,
  markdown: string | null,
  insertPos: number,
  targetNotePath: string | null,
): string | null {
  if (!getCurrentMarkdownSerializer() || !targetNotePath) return null;
  const target = resolveCrossNoteInsertContent(view, markdown, insertPos);
  if (!target) return null;

  try {
    let tr = view.state.tr.insert(target.insertPos, target.content);
    const selectionAnchor = Math.max(0, Math.min(target.insertPos + target.content.size, tr.doc.content.size));
    tr = tr.setSelection(Selection.near(tr.doc.resolve(selectionAnchor), -1)).scrollIntoView();
    markEditorUserInput(view);
    view.dispatch(tr);
    view.focus();
    return serializeCurrentMarkdownForNotePath(view, targetNotePath);
  } catch {
    return null;
  }
}

export function getElementsFromPoint(doc: Document, clientX: number, clientY: number): Element[] {
  return typeof doc.elementsFromPoint === 'function'
    ? doc.elementsFromPoint(clientX, clientY)
    : [];
}

export function isOverNotesBlockDropTarget(elements: readonly Element[]): boolean {
  return elements.some((element) => (
    element.closest(NOTES_BLOCK_DROP_TARGET_SELECTOR)
    || element.closest(NOTES_FILE_TREE_FILE_PATH_SELECTOR)
  ));
}

export function getNotesBlockOpenTargetPathFromElements(elements: readonly Element[]): string | null {
  for (const element of elements) {
    const tab = element.closest(NOTES_TAB_PATH_SELECTOR) as HTMLElement | null;
    const tabPath = tab?.dataset.notesTabPath;
    if (tabPath) return tabPath;

    const splitLeaf = element.closest(NOTES_SPLIT_LEAF_PATH_SELECTOR) as HTMLElement | null;
    const splitLeafPath = splitLeaf?.dataset.notesSplitLeafPath;
    if (splitLeafPath) return splitLeafPath;

    const fileTreeFile = element.closest(NOTES_FILE_TREE_FILE_PATH_SELECTOR) as HTMLElement | null;
    const fileTreePath = fileTreeFile?.dataset.fileTreePath;
    if (fileTreePath) return fileTreePath;
  }

  return null;
}

export type PendingCrossNoteBlockDrag = {
  sourceNotePath: string | null;
  draggedMarkdown: string | null;
  sourceMarkdownAfterDelete: string | null;
  dragStartClientX: number;
  dragStartClientY: number;
  lastClientX: number;
  lastClientY: number;
  preview: BlockDragPreviewHandle | null;
};

export let pendingCrossNoteBlockDrag: PendingCrossNoteBlockDrag | null = null;

export type SavePendingMarkdown = typeof savePendingEditorMarkdown;

export async function saveCrossNoteBlockDropAfterTargetSave({
  sourceNotePath,
  sourceMarkdownAfterDelete,
  targetNotePath,
  targetMarkdownAfterInsert,
  saveMarkdown = savePendingEditorMarkdown,
}: {
  sourceNotePath: string;
  sourceMarkdownAfterDelete: string;
  targetNotePath: string;
  targetMarkdownAfterInsert: string;
  saveMarkdown?: SavePendingMarkdown;
}): Promise<boolean> {
  const targetSaved = await saveMarkdown(targetNotePath, targetMarkdownAfterInsert);
  if (!targetSaved) return false;

  return saveMarkdown(sourceNotePath, sourceMarkdownAfterDelete, {
    replaceConcurrentContent: true,
  });
}

export function setPendingCrossNoteBlockDrag(pending: PendingCrossNoteBlockDrag): void {
  pendingCrossNoteBlockDrag = pending;
}

export function clearPendingCrossNoteBlockDrag(): void {
  pendingCrossNoteBlockDrag = null;
}

export function updatePendingCrossNoteBlockDragPointer(clientX: number, clientY: number): void {
  if (!pendingCrossNoteBlockDrag) return;
  pendingCrossNoteBlockDrag.lastClientX = clientX;
  pendingCrossNoteBlockDrag.lastClientY = clientY;
}

export function setPendingCrossNoteBlockDragPreview(preview: BlockDragPreviewHandle | null): void {
  if (!pendingCrossNoteBlockDrag) return;
  pendingCrossNoteBlockDrag.preview = preview;
}
