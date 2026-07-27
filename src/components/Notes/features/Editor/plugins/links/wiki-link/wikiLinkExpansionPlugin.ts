import { $prose } from '@milkdown/kit/utils';
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from '@milkdown/kit/prose/state';
import type { Mark } from '@milkdown/kit/prose/model';
import { DecorationSet } from '@milkdown/kit/prose/view';
import {
  WIKI_LINK_POINTER_SELECTION_META,
  wikiLinkPointerSessionPluginKey,
} from './wikiLinkInteraction';
import {
  createWikiLinkSourceDecorations,
  isValidWikiLinkSourceRange,
  matchWikiLinkSource,
  type WikiLinkSourceRange,
} from './wikiLinkSourceDecorations';

type WikiLinkRange = {
  from: number;
  to: number;
  target: string;
  marks: readonly Mark[];
};

type ExpandedWikiLinkRange = WikiLinkSourceRange;

type WikiLinkExpansionState = {
  expanded: ExpandedWikiLinkRange | null;
  collapsed: ExpandedWikiLinkRange[];
  decorations: DecorationSet;
};

type WikiLinkExpansionMeta =
  | { type: 'expand'; range: ExpandedWikiLinkRange }
  | { type: 'fold'; range: ExpandedWikiLinkRange }
  | { type: 'clear' };

export const wikiLinkExpansionPluginKey = new PluginKey<WikiLinkExpansionState>('wiki-link-expansion');

function findActiveWikiLinkRange(state: EditorState): WikiLinkRange | null {
  const { from, to } = state.selection;
  const scanFrom = state.selection.empty ? Math.max(0, from - 1) : from;
  const scanTo = state.selection.empty ? Math.min(state.doc.content.size, from + 1) : to;
  let activeRange: WikiLinkRange | null = null;
  let activeRangeIsBoundary = false;

  state.doc.nodesBetween(scanFrom, scanTo, (node, pos) => {
    if (!node.isText || !node.text) return;

    const mark = node.marks.find((candidate) => candidate.type.name === 'wiki_link');
    if (!mark) return;

    const nodeEnd = pos + node.nodeSize;
    const isInside = state.selection.empty
      ? from >= pos && from < nodeEnd
      : from < nodeEnd && to > pos;
    const isAtEndBoundary = state.selection.empty && from === nodeEnd;
    if (!isInside && !isAtEndBoundary) return;

    const target = String(mark.attrs.target ?? '');
    if (!activeRange || (isInside && activeRangeIsBoundary)) {
      activeRange = {
        from: pos,
        to: nodeEnd,
        target,
        marks: node.marks.filter((candidate) => candidate.type.name !== 'wiki_link'),
      };
      activeRangeIsBoundary = isAtEndBoundary;
      return;
    }

    if (!isAtEndBoundary && activeRange.target === target && pos <= activeRange.to) {
      activeRange.to = nodeEnd;
    }
  });

  return activeRange;
}

function mapExpandedRange(
  transaction: Transaction,
  range: ExpandedWikiLinkRange,
): ExpandedWikiLinkRange {
  return {
    from: transaction.mapping.map(range.from, 1),
    to: transaction.mapping.map(range.to, -1),
  };
}

function expandWikiLink(state: EditorState, range: WikiLinkRange) {
  const label = state.doc.textBetween(range.from, range.to, '');
  const prefix = label === range.target ? '[[' : `[[${range.target}|`;
  const source = `${prefix}${label}]]`;
  const selectionPosition = state.selection.from <= range.from
    ? range.from
    : state.selection.from >= range.to
      ? range.from + source.length
      : range.from + prefix.length + state.selection.from - range.from;
  const sourceMark = state.schema.marks.wiki_link_source;
  const sourceMarks = sourceMark
    ? [...range.marks, sourceMark.create()]
    : range.marks;
  const tr = state.tr.replaceWith(
    range.from,
    range.to,
    state.schema.text(source, sourceMarks),
  );
  const expanded = { from: range.from, to: range.from + source.length };

  return tr
    .setSelection(TextSelection.create(tr.doc, selectionPosition))
    .setMeta(wikiLinkExpansionPluginKey, { type: 'expand', range: expanded } satisfies WikiLinkExpansionMeta)
    .setMeta('addToHistory', false);
}

function foldWikiLink(state: EditorState, range: ExpandedWikiLinkRange) {
  const source = state.doc.textBetween(range.from, range.to, '');
  const match = matchWikiLinkSource(source);
  const target = match?.[1]?.trim();
  const label = (match?.[2] ?? match?.[1])?.trim();
  let tr = state.tr;

  if (target && label) {
    return tr
      .setMeta(wikiLinkExpansionPluginKey, { type: 'fold', range } satisfies WikiLinkExpansionMeta)
      .setMeta('addToHistory', false);
  } else {
    const sourceMark = state.schema.marks.wiki_link_source;
    if (sourceMark) tr = tr.removeMark(range.from, range.to, sourceMark);
  }

  return tr
    .setMeta(wikiLinkExpansionPluginKey, { type: 'clear' } satisfies WikiLinkExpansionMeta)
    .setMeta('addToHistory', false);
}

export const wikiLinkExpansionPlugin = $prose(() => new Plugin<WikiLinkExpansionState>({
  key: wikiLinkExpansionPluginKey,
  state: {
    init: () => ({
      expanded: null,
      collapsed: [],
      decorations: DecorationSet.empty,
    }),
    apply: (transaction, previous, _oldState, newState) => {
      const meta = transaction.getMeta(wikiLinkExpansionPluginKey) as WikiLinkExpansionMeta | undefined;
      const expanded = meta?.type === 'expand'
        ? meta.range
        : meta?.type === 'fold' || meta?.type === 'clear'
          ? null
          : previous.expanded && transaction.docChanged
            ? mapExpandedRange(transaction, previous.expanded)
            : previous.expanded;
      const mappedCollapsed = transaction.docChanged
        ? previous.collapsed.map((range) => mapExpandedRange(transaction, range))
        : previous.collapsed;
      const sameRange = (range: ExpandedWikiLinkRange, other: ExpandedWikiLinkRange) => (
        range.from === other.from && range.to === other.to
      );
      const nextCollapsed = meta?.type === 'fold'
        ? [...mappedCollapsed.filter((range) => !sameRange(range, meta.range)), meta.range]
        : meta?.type === 'expand'
          ? mappedCollapsed.filter((range) => !sameRange(range, meta.range))
          : mappedCollapsed;
      const collapsed = nextCollapsed.filter((range) => isValidWikiLinkSourceRange(newState, range));
      return {
        expanded,
        collapsed,
        decorations: createWikiLinkSourceDecorations(newState, expanded, collapsed),
      };
    },
  },
  appendTransaction: (transactions, _oldState, newState) => {
    if (transactions.some((transaction) => transaction.getMeta(wikiLinkExpansionPluginKey))) {
      return null;
    }

    const pluginState = wikiLinkExpansionPluginKey.getState(newState);
    const expanded = pluginState?.expanded;
    if (expanded) {
      if (wikiLinkPointerSessionPluginKey.getState(newState)) return null;
      const { selection } = newState;
      if (selection.empty && (selection.from < expanded.from || selection.from > expanded.to)) {
        return foldWikiLink(newState, expanded);
      }
      return null;
    }

    const suppressPointerExpansion = transactions.some(
      (transaction) => transaction.getMeta(WIKI_LINK_POINTER_SELECTION_META) === true,
    );
    if (
      !newState.selection.empty ||
      suppressPointerExpansion
    ) {
      return null;
    }

    const selectionPos = newState.selection.from;
    const collapsedInside = pluginState?.collapsed.find((range) => (
      selectionPos >= range.from && selectionPos < range.to
    ));
    if (collapsedInside) {
      return newState.tr
        .setMeta(
          wikiLinkExpansionPluginKey,
          { type: 'expand', range: collapsedInside } satisfies WikiLinkExpansionMeta,
        )
        .setMeta('addToHistory', false);
    }

    const range = findActiveWikiLinkRange(newState);
    if (range) return expandWikiLink(newState, range);

    const collapsedBoundary = pluginState?.collapsed.find((candidate) => candidate.to === selectionPos);
    return collapsedBoundary
      ? newState.tr
        .setMeta(
          wikiLinkExpansionPluginKey,
          { type: 'expand', range: collapsedBoundary } satisfies WikiLinkExpansionMeta,
        )
        .setMeta('addToHistory', false)
      : null;
  },
  props: {
    decorations: (state) => wikiLinkExpansionPluginKey.getState(state)?.decorations ?? DecorationSet.empty,
    handleTextInput: (view, from, to, text) => {
      const expanded = wikiLinkExpansionPluginKey.getState(view.state)?.expanded;
      if (
        view.composing ||
        !expanded ||
        from < expanded.from ||
        to > expanded.to
      ) {
        return false;
      }

      view.dispatch(view.state.tr.insertText(text, from, to).scrollIntoView());
      return true;
    },
    handleKeyDown: (view, event) => {
      if (
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
      ) {
        return false;
      }

      const expanded = wikiLinkExpansionPluginKey.getState(view.state)?.expanded;
      if (!expanded) return false;
      const { anchor, empty, head } = view.state.selection;
      if (event.shiftKey) {
        const nextHead = event.key === 'ArrowLeft' ? head - 1 : head + 1;
        if (
          anchor < expanded.from ||
          anchor > expanded.to ||
          head < expanded.from ||
          head > expanded.to ||
          nextHead < expanded.from ||
          nextHead > expanded.to
        ) {
          return false;
        }

        event.preventDefault();
        view.dispatch(view.state.tr
          .setSelection(TextSelection.create(view.state.doc, anchor, nextHead))
          .setMeta('addToHistory', false)
          .scrollIntoView());
        return true;
      }
      if (!empty) return false;

      const position = view.state.selection.from;
      const nextPosition = event.key === 'ArrowLeft' ? position - 1 : position + 1;
      if (nextPosition < expanded.from || nextPosition > expanded.to) return false;

      event.preventDefault();
      view.dispatch(
        view.state.tr
          .setSelection(TextSelection.create(view.state.doc, nextPosition))
          .setMeta('addToHistory', false)
          .scrollIntoView(),
      );
      return true;
    },
  },
}));
