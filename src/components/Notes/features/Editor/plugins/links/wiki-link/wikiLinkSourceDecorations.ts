import type { EditorState } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { MAX_WIKI_LINK_TEXT_CHARS } from './wikiLinkMarkdown';

export type WikiLinkSourceRange = {
  from: number;
  to: number;
};

const WIKI_LINK_SOURCE_PATTERN = new RegExp(
  `^\\[\\[([^\\]|\\n]{1,${MAX_WIKI_LINK_TEXT_CHARS}})(?:\\|([^\\]\\n]{1,${MAX_WIKI_LINK_TEXT_CHARS}}))?\\]\\]$`,
);

function isRangeWithinDocument(state: EditorState, range: WikiLinkSourceRange): boolean {
  return range.to > range.from && range.to <= state.doc.content.size;
}

export function matchWikiLinkSource(source: string): RegExpExecArray | null {
  return WIKI_LINK_SOURCE_PATTERN.exec(source);
}

function matchWikiLinkSourceRange(
  state: EditorState,
  range: WikiLinkSourceRange,
): RegExpExecArray | null {
  if (!isRangeWithinDocument(state, range)) return null;
  return matchWikiLinkSource(state.doc.textBetween(range.from, range.to, ''));
}

export function isValidWikiLinkSourceRange(
  state: EditorState,
  range: WikiLinkSourceRange,
): boolean {
  return matchWikiLinkSourceRange(state, range) !== null;
}

function appendExpandedDecoration(
  decorations: Decoration[],
  range: WikiLinkSourceRange,
  target: string,
): void {
  decorations.push(Decoration.inline(range.from, range.to, {
    class: 'wiki-link-expanded',
    'data-wiki-link-expanded': 'true',
    'data-wiki-link-target': target,
  }, {
    inclusiveStart: false,
    inclusiveEnd: false,
  }));
}

function appendCollapsedDecorations(
  decorations: Decoration[],
  range: WikiLinkSourceRange,
  match: RegExpExecArray,
  target: string,
): void {
  const targetSource = match[1] ?? '';
  const labelSource = match[2] ?? targetSource;
  const label = labelSource.trim();
  if (!target || !label) return;

  const labelPrefixLength = match[2] === undefined
    ? 2
    : 2 + targetSource.length + 1;
  const leadingWhitespaceLength = labelSource.length - labelSource.trimStart().length;
  const labelFrom = range.from + labelPrefixLength + leadingWhitespaceLength;
  const labelTo = labelFrom + label.length;
  decorations.push(
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
  );
}

export function createWikiLinkSourceDecorations(
  state: EditorState,
  expanded: WikiLinkSourceRange | null,
  collapsed: readonly WikiLinkSourceRange[],
): DecorationSet {
  const decorations: Decoration[] = [];
  const appendRange = (range: WikiLinkSourceRange, isExpanded: boolean) => {
    if (!isRangeWithinDocument(state, range)) return;
    const match = matchWikiLinkSourceRange(state, range);
    const target = match?.[1]?.trim() ?? '';
    if (isExpanded) appendExpandedDecoration(decorations, range, target);
    else if (match) appendCollapsedDecorations(decorations, range, match, target);
  };

  collapsed.forEach((range) => appendRange(range, false));
  if (expanded) appendRange(expanded, true);
  return decorations.length > 0
    ? DecorationSet.create(state.doc, decorations)
    : DecorationSet.empty;
}
