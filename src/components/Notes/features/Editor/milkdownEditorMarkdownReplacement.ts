import type { Ctx } from '@milkdown/kit/ctx';
import { editorViewCtx, parserCtx } from '@milkdown/kit/core';
import { GapCursor } from '@milkdown/kit/prose/gapcursor';
import { Slice, type Node as ProseNode } from '@milkdown/kit/prose/model';
import { Selection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { Parser } from '@milkdown/kit/transformer';
import { stripManagedFrontmatter } from '@/stores/notes/frontmatter';
import { normalizeEditorStateMarkdownDocument } from '@/lib/notes/markdown/markdownSerializationUtils';
import { blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION } from './plugins/cursor/blockSelectionPluginState';
import {
  createDocumentFirstLineEndTextSelection,
  createDocumentStartTextSelection,
  createGapCursorSelectionAt,
} from './utils/editorSelection';
import {
  normalizeMarkdownParagraphSeparatorsForEditorComparison,
  serializeEditorMarkdownSnapshot,
} from './utils/pendingMarkdownUpdate';
import { createLargePlainMarkdownDoc } from './milkdownLargePlainMarkdown';
import { logE2EMilkdownTiming } from './milkdownE2ETiming';

interface ReplaceEditorMarkdownOptions {
  replacementDoc?: ProseNode;
  resetSelection?: boolean;
}

function canPreserveSelection(
  doc: unknown,
  selection: unknown,
): doc is ProseNode {
  return Boolean(
    doc &&
    typeof (doc as { resolve?: unknown }).resolve === 'function' &&
    selection &&
    typeof (selection as { from?: unknown }).from === 'number' &&
    typeof (selection as { to?: unknown }).to === 'number'
  );
}

function createInlineTextSelection(doc: ProseNode, from: number, to = from): TextSelection | null {
  try {
    const $from = doc.resolve(from);
    const $to = doc.resolve(to);
    if (!$from.parent.inlineContent || !$to.parent.inlineContent) {
      return null;
    }
    return TextSelection.create(doc, from, to);
  } catch {
    return null;
  }
}

function createPreservedEditorSelection(doc: ProseNode, previousSelection: Selection): Selection {
  const maxPos = doc.content.size;
  const clampPos = (pos: number) => Math.max(0, Math.min(maxPos, pos));

  if (previousSelection instanceof GapCursor) {
    const pos = clampPos(previousSelection.from);
    const gapSelection = createGapCursorSelectionAt(doc, pos)
      ?? createGapCursorSelectionAt(doc, maxPos)
      ?? createGapCursorSelectionAt(doc, 0);
    if (gapSelection) {
      return gapSelection;
    }
  }

  if (previousSelection.empty) {
    const pos = clampPos(previousSelection.from);
    const textSelection = createInlineTextSelection(doc, pos);
    if (textSelection) {
      return textSelection;
    }
    try {
      return Selection.near(doc.resolve(pos), previousSelection.from >= maxPos ? -1 : 1);
    } catch {
      return createDocumentStartTextSelection(doc);
    }
  }

  const from = clampPos(previousSelection.from);
  const to = clampPos(previousSelection.to);
  if (from < to) {
    const textSelection = createInlineTextSelection(doc, from, to);
    if (textSelection) {
      return textSelection;
    }
  }

  try {
    return Selection.near(doc.resolve(from), 1);
  } catch {
    return createDocumentStartTextSelection(doc);
  }
}

function resetEditorPointerClickSequence(view: EditorView): void {
  const input = (view as unknown as {
    input?: { lastClick?: { time: number } };
  }).input;

  // The EditorView is reused across notes, so clicks from the previous note
  // must not contribute to ProseMirror's double/triple-click counter.
  if (input?.lastClick) {
    input.lastClick.time = 0;
  }
}

export function normalizeInitialEditorSelection(view: EditorView): boolean {
  const nextSelection = createDocumentFirstLineEndTextSelection(view.state.doc);
  if (
    !(nextSelection instanceof TextSelection) &&
    !(nextSelection instanceof GapCursor)
  ) {
    return false;
  }
  if (nextSelection.eq(view.state.selection)) {
    return false;
  }

  view.dispatch(
    view.state.tr
      .setSelection(nextSelection)
      .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION)
  );
  return true;
}

export function replaceEditorMarkdown(
  ctx: Ctx,
  markdown: string,
  options: ReplaceEditorMarkdownOptions = {},
): boolean {
  let view: EditorView;
  let doc: ReturnType<Parser> | ProseNode | null;

  try {
    view = ctx.get(editorViewCtx);
    if (options.replacementDoc) {
      doc = options.replacementDoc;
    } else {
      const fastDocStartedAt = performance.now();
      doc = createLargePlainMarkdownDoc(view.state.schema, markdown);
      if (doc) {
        logE2EMilkdownTiming('replace-fast-doc', {
          inputLength: markdown.length,
          durationMs: Math.round(performance.now() - fastDocStartedAt),
        });
      } else {
        const parser = ctx.get(parserCtx);
        doc = parser(markdown);
      }
    }
  } catch {
    return false;
  }

  if (!doc) {
    return false;
  }

  const { state } = view;
  const previousSelection = state.selection;
  let tr = state.tr.replace(
    0,
    state.doc.content.size,
    new Slice(doc.content as never, 0, 0),
  ).setMeta('addToHistory', false);

  if (options.resetSelection) {
    resetEditorPointerClickSequence(view);
    tr = tr
      .setSelection(createDocumentFirstLineEndTextSelection(tr.doc))
      .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION);
  } else if (canPreserveSelection(tr.doc, previousSelection)) {
    tr = tr.setSelection(createPreservedEditorSelection(tr.doc, previousSelection));
  }

  view.dispatch(tr);
  return true;
}

function normalizeComparableEditorMarkdown(markdown: string): string {
  return normalizeMarkdownParagraphSeparatorsForEditorComparison(
    normalizeEditorStateMarkdownDocument(
      normalizeMarkdownParagraphSeparatorsForEditorComparison(stripManagedFrontmatter(markdown))
    )
  );
}

function normalizeNoteContentWithoutManagedFrontmatter(markdown: string): string {
  return stripManagedFrontmatter(markdown).replace(/\r\n?/g, '\n');
}

export function isSameVisibleNoteContentIgnoringManagedFrontmatter(
  previousNoteContent: string,
  nextNoteContent: string,
): boolean {
  return (
    normalizeNoteContentWithoutManagedFrontmatter(previousNoteContent) ===
    normalizeNoteContentWithoutManagedFrontmatter(nextNoteContent)
  );
}

export function isEditorMarkdownEquivalentToNoteContent(
  editorMarkdown: string,
  noteContent: string,
): boolean {
  const serializedEditorMarkdown = serializeEditorMarkdownSnapshot(editorMarkdown, noteContent);
  return (
    normalizeComparableEditorMarkdown(serializedEditorMarkdown) ===
    normalizeComparableEditorMarkdown(noteContent)
  );
}
