import { $prose } from '@milkdown/kit/utils';
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { MAX_WIKI_LINK_TEXT_CHARS } from './wikiLinkMarkdown';
import {
  WIKI_LINK_POINTER_SELECTION_META,
  wikiLinkPointerSessionPluginKey,
} from './wikiLinkInteraction';

type WikiLinkRange = {
  from: number;
  to: number;
  target: string;
};

type ExpandedWikiLinkRange = {
  from: number;
  to: number;
};

type WikiLinkExpansionState = {
  expanded: ExpandedWikiLinkRange | null;
  collapsed: ExpandedWikiLinkRange | null;
  decorations: DecorationSet;
};

type WikiLinkExpansionMeta =
  | { type: 'expand'; range: ExpandedWikiLinkRange }
  | { type: 'fold'; range: ExpandedWikiLinkRange }
  | { type: 'clear' };

const WIKI_LINK_SOURCE_PATTERN = new RegExp(
  `^\\[\\[([^\\]|\\n]{1,${MAX_WIKI_LINK_TEXT_CHARS}})(?:\\|([^\\]\\n]{1,${MAX_WIKI_LINK_TEXT_CHARS}}))?\\]\\]$`,
);

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
      activeRange = { from: pos, to: nodeEnd, target };
      activeRangeIsBoundary = isAtEndBoundary;
      return;
    }

    if (!isAtEndBoundary && activeRange.target === target && pos <= activeRange.to) {
      activeRange.to = nodeEnd;
    }
  });

  return activeRange;
}

function createDecorations(
  state: EditorState,
  expanded: ExpandedWikiLinkRange | null,
  collapsed: ExpandedWikiLinkRange | null,
): DecorationSet {
  const range = expanded ?? collapsed;
  if (!range || range.to <= range.from || range.to > state.doc.content.size) {
    return DecorationSet.empty;
  }

  const source = state.doc.textBetween(range.from, range.to, '');
  const match = WIKI_LINK_SOURCE_PATTERN.exec(source);
  const target = match?.[1]?.trim() ?? '';
  if (expanded) {
    return DecorationSet.create(state.doc, [
      Decoration.inline(range.from, range.to, {
        class: 'wiki-link-expanded',
        'data-wiki-link-expanded': 'true',
        'data-wiki-link-target': target,
      }, {
        inclusiveStart: false,
        inclusiveEnd: false,
      }),
    ]);
  }

  const targetSource = match?.[1] ?? '';
  const labelSource = match?.[2] ?? targetSource;
  const label = labelSource.trim();
  if (!target || !label) return DecorationSet.empty;

  const labelPrefixLength = match?.[2] === undefined
    ? 2
    : 2 + targetSource.length + 1;
  const leadingWhitespaceLength = labelSource.length - labelSource.trimStart().length;
  const labelFrom = range.from + labelPrefixLength + leadingWhitespaceLength;
  const labelTo = labelFrom + label.length;
  return DecorationSet.create(state.doc, [
    Decoration.inline(range.from, labelFrom, {
      class: 'wiki-link-source-hidden',
    }, {
      inclusiveStart: false,
      inclusiveEnd: false,
    }),
    Decoration.inline(labelFrom, labelTo, {
      class: 'internal-link wiki-link',
      'data-wiki-link-target': target,
    }, {
      inclusiveStart: false,
      inclusiveEnd: false,
    }),
    Decoration.inline(labelTo, range.to, {
      class: 'wiki-link-source-hidden',
    }, {
      inclusiveStart: false,
      inclusiveEnd: false,
    }),
  ]);
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
  const tr = state.tr.replaceWith(
    range.from,
    range.to,
    state.schema.text(source, sourceMark ? [sourceMark.create()] : undefined),
  );
  const expanded = { from: range.from, to: range.from + source.length };

  return tr
    .setSelection(TextSelection.create(tr.doc, selectionPosition))
    .setMeta(wikiLinkExpansionPluginKey, { type: 'expand', range: expanded } satisfies WikiLinkExpansionMeta)
    .setMeta('addToHistory', false);
}

function foldWikiLink(state: EditorState, range: ExpandedWikiLinkRange) {
  const source = state.doc.textBetween(range.from, range.to, '');
  const match = WIKI_LINK_SOURCE_PATTERN.exec(source);
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
      collapsed: null,
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
      const collapsed = meta?.type === 'fold'
        ? meta.range
        : meta?.type === 'expand' || meta?.type === 'clear'
          ? null
          : previous.collapsed && transaction.docChanged
            ? mapExpandedRange(transaction, previous.collapsed)
            : previous.collapsed;
      return {
        expanded,
        collapsed,
        decorations: createDecorations(newState, expanded, collapsed),
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

    const collapsed = pluginState?.collapsed;
    if (collapsed) {
      if (
        newState.selection.empty &&
        newState.selection.from >= collapsed.from &&
        newState.selection.from <= collapsed.to &&
        !transactions.some((transaction) => transaction.getMeta(WIKI_LINK_POINTER_SELECTION_META) === true)
      ) {
        return newState.tr
          .setMeta(
            wikiLinkExpansionPluginKey,
            { type: 'expand', range: collapsed } satisfies WikiLinkExpansionMeta,
          )
          .setMeta('addToHistory', false);
      }
      return null;
    }

    if (
      !newState.selection.empty ||
      transactions.some((transaction) => transaction.getMeta(WIKI_LINK_POINTER_SELECTION_META) === true)
    ) {
      return null;
    }

    const range = findActiveWikiLinkRange(newState);
    return range ? expandWikiLink(newState, range) : null;
  },
  props: {
    decorations: (state) => wikiLinkExpansionPluginKey.getState(state)?.decorations ?? DecorationSet.empty,
    handleKeyDown: (view, event) => {
      if (
        event.isComposing ||
        event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !view.state.selection.empty ||
        (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
      ) {
        return false;
      }

      const expanded = wikiLinkExpansionPluginKey.getState(view.state)?.expanded;
      if (!expanded) return false;
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
