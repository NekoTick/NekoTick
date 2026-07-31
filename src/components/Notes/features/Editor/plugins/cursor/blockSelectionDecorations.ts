import type { EditorState } from '@milkdown/kit/prose/state';
import type { MarkType } from '@milkdown/kit/prose/model';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { RAW_MARKDOWN_LINK_TEXT_CLASS } from '../links/markdown-link/markdownLinkConfig';
import { shouldUseLargeBlockSelectionRendering, type BlockRange } from './blockSelectionTypes';
import {
  getBlockRangeKey,
  getDisplayBlockRangesForDecorations,
} from './blockSelectionRanges';
import {
  LARGE_INLINE_LINE_SELECTION_MARKER_CLASS,
  LARGE_RICH_BLOCK_SELECTION_DECORATION_CLASS,
  LARGE_TEXTLIKE_BLOCK_SELECTION_DECORATION_CLASS,
  getBlockSelectionDecorationClass,
  getBlockSelectionStructuralClass,
  isNodeDecorationRange,
  isTextLikeDecorationRange,
  resolveParentMarkerDecorationRanges,
  trimTrailingHardBreakFromInlineRange,
  type BlockSelectionDecorationContext,
} from './blockSelectionDecorationClasses';
import {
  areBlockSelectionDisplayRangesVisuallyAdjacent,
  isPartialParagraphRange,
} from './blockSelectionDecorationAdjacency';

export { areBlockSelectionDisplayRangesVisuallyAdjacent } from './blockSelectionDecorationAdjacency';
export { getBlockSelectionDecorationClass } from './blockSelectionDecorationClasses';

function normalizeTextRange(doc: EditorState['doc'], range: BlockRange): BlockRange | null {
  const from = Math.max(0, Math.min(range.from, doc.content.size));
  const to = Math.max(from, Math.min(range.to, doc.content.size));
  return to > from ? { from, to } : null;
}

function collectMarkedTextRanges(doc: EditorState['doc'], range: BlockRange, markType: MarkType): BlockRange[] {
  const normalizedRange = normalizeTextRange(doc, range);
  if (!normalizedRange) return [];

  const markedRanges: BlockRange[] = [];
  const { from, to } = normalizedRange;

  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return true;

    const textFrom = Math.max(from, pos);
    const textTo = Math.min(to, pos + node.nodeSize);
    if (textTo <= textFrom) return true;

    if (markType.isInSet(node.marks)) {
      const previous = markedRanges[markedRanges.length - 1];
      if (previous && previous.to === textFrom) {
        previous.to = textTo;
      } else {
        markedRanges.push({ from: textFrom, to: textTo });
      }
    }

    return true;
  });

  return markedRanges;
}

function isTextRangeFullyMarked(doc: EditorState['doc'], range: BlockRange, markType: MarkType): boolean {
  const normalizedRange = normalizeTextRange(doc, range);
  if (!normalizedRange) return false;
  const markedRanges = collectMarkedTextRanges(doc, normalizedRange, markType);
  return markedRanges.length === 1
    && markedRanges[0].from === normalizedRange.from
    && markedRanges[0].to === normalizedRange.to;
}

function getInlineSelectionLinkClass(doc: EditorState['doc'], range: BlockRange): string {
  const linkMarkType = doc.type.schema.marks.link;
  if (!linkMarkType) return '';
  return isTextRangeFullyMarked(doc, range, linkMarkType) ? RAW_MARKDOWN_LINK_TEXT_CLASS : '';
}

function createInlineSelectionLinkTextDecorations(doc: EditorState['doc'], range: BlockRange): Decoration[] {
  const linkMarkType = doc.type.schema.marks.link;
  if (!linkMarkType || isTextRangeFullyMarked(doc, range, linkMarkType)) return [];

  return collectMarkedTextRanges(doc, range, linkMarkType).map((linkRange) => (
    Decoration.inline(linkRange.from, linkRange.to, {
      class: RAW_MARKDOWN_LINK_TEXT_CLASS,
    }, {
      inclusiveStart: false,
      inclusiveEnd: false,
    })
  ));
}

export function createBlockSelectionDecorations(doc: EditorState['doc'], blocks: readonly BlockRange[]): DecorationSet {
  if (blocks.length === 0) return DecorationSet.empty;

  const displayRanges = getDisplayBlockRangesForDecorations(doc, blocks);
  const useLargeSelectionRendering = shouldUseLargeBlockSelectionRendering(doc, displayRanges.length);
  const displayRangeKeys = new Set(displayRanges.map((range) => getBlockRangeKey(range.from, range.to)));
  const hasNextDisplayRangeKeys = new Set<string>();
  const hasPreviousDisplayRangeKeys = new Set<string>();
  for (let index = 0; index < displayRanges.length - 1; index += 1) {
    const current = displayRanges[index];
    const next = displayRanges[index + 1];
    if (!current || !next || !areBlockSelectionDisplayRangesVisuallyAdjacent(doc, current, next)) continue;
    hasNextDisplayRangeKeys.add(getBlockRangeKey(current.from, current.to));
    hasPreviousDisplayRangeKeys.add(getBlockRangeKey(next.from, next.to));
  }
  const context: BlockSelectionDecorationContext = {
    displayRangeKeys,
    hasNextDisplayRangeKeys,
    hasPreviousDisplayRangeKeys,
  };
  const parentMarkerDecorations = new Map<string, Decoration>();

  const addParentMarkerDecorations = (range: BlockRange) => {
    if (useLargeSelectionRendering) return;
    for (const parentRange of resolveParentMarkerDecorationRanges(doc, range, displayRangeKeys)) {
      parentMarkerDecorations.set(
        getBlockRangeKey(parentRange.from, parentRange.to),
        Decoration.node(parentRange.from, parentRange.to, { class: 'editor-block-selected-parent-marker' }),
      );
    }
  };

  const decorations = displayRanges.flatMap((range) => {
    const isNodeRange = isNodeDecorationRange(doc, range);
    const isInlineLineSelection = !isNodeRange && isPartialParagraphRange(doc, range);
    if (useLargeSelectionRendering) {
      const rangeKey = getBlockRangeKey(range.from, range.to);
      const structuralClass = getBlockSelectionStructuralClass(doc, range, isNodeRange);
      const hasNextClass = context.hasNextDisplayRangeKeys.has(rangeKey)
        ? 'editor-block-selected-has-next'
        : '';
      const hasPreviousClass = context.hasPreviousDisplayRangeKeys.has(rangeKey)
        ? 'editor-block-selected-has-previous'
        : '';
      if (isNodeRange) {
        const className = [
          isTextLikeDecorationRange(doc, range, true)
            ? LARGE_TEXTLIKE_BLOCK_SELECTION_DECORATION_CLASS
            : LARGE_RICH_BLOCK_SELECTION_DECORATION_CLASS,
          structuralClass,
          hasNextClass,
          hasPreviousClass,
        ].filter(Boolean).join(' ');
        return [Decoration.node(range.from, range.to, { class: className })];
      }
      const inlineRange = trimTrailingHardBreakFromInlineRange(doc, range);
      if (!inlineRange) return [];

      const linkClass = getInlineSelectionLinkClass(doc, inlineRange);
      const linkTextDecorations = createInlineSelectionLinkTextDecorations(doc, inlineRange);
      if (isInlineLineSelection && !linkClass && linkTextDecorations.length === 0) {
        return [Decoration.widget(inlineRange.from, (view) => {
          const marker = view.dom.ownerDocument.createElement('span');
          marker.className = LARGE_INLINE_LINE_SELECTION_MARKER_CLASS;
          marker.setAttribute('aria-hidden', 'true');
          return marker;
        }, {
          blockSelectionLineMarker: true,
          ignoreSelection: true,
          key: `block-selection-line:${rangeKey}`,
          side: -1,
        })];
      }

      const className = [
        LARGE_TEXTLIKE_BLOCK_SELECTION_DECORATION_CLASS,
        linkClass,
        structuralClass,
        hasNextClass,
        hasPreviousClass,
        isInlineLineSelection ? 'editor-block-selected-inline-line' : '',
      ].filter(Boolean).join(' ');
      return [
        Decoration.inline(inlineRange.from, inlineRange.to, {
          class: className,
        }),
        ...linkTextDecorations,
      ];
    }

    const rangeKey = getBlockRangeKey(range.from, range.to);
    const isTextLikeSelection = isTextLikeDecorationRange(doc, range, isNodeRange);
    const structuralClass = getBlockSelectionStructuralClass(doc, range, isNodeRange);
    const attrs = {
      class: [
        getBlockSelectionDecorationClass(doc, range, displayRanges, context),
        isTextLikeSelection ? 'editor-block-selected-textlike' : '',
        !isNodeRange ? getInlineSelectionLinkClass(doc, range) : '',
        structuralClass,
        context.hasNextDisplayRangeKeys.has(rangeKey) ? 'editor-block-selected-has-next' : '',
        context.hasPreviousDisplayRangeKeys.has(rangeKey) ? 'editor-block-selected-has-previous' : '',
        isInlineLineSelection ? 'editor-block-selected-inline-line' : '',
      ].filter(Boolean).join(' '),
    };
    if (isNodeRange) {
      addParentMarkerDecorations(range);
      return [Decoration.node(range.from, range.to, attrs)];
    }

    const inlineRange = trimTrailingHardBreakFromInlineRange(doc, range);
    if (!inlineRange) return [];

    addParentMarkerDecorations(range);
    return [
      Decoration.inline(inlineRange.from, inlineRange.to, attrs),
      ...createInlineSelectionLinkTextDecorations(doc, inlineRange),
    ];
  });

  return DecorationSet.create(doc, [
    ...decorations,
    ...parentMarkerDecorations.values(),
  ]);
}
