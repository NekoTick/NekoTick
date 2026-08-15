import type { EditorState, Selection } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import {
    DEFAULT_PROSE_DOC_SCAN_NODE_LIMIT,
    STOP_PROSE_SCAN,
    scanProseDescendants,
} from '../shared/boundedProseNodeScan';
import {
    getTransactionChangedRanges,
    transactionInsertedTextMatches,
    transactionTouchesDecorations,
    type DecorationSetLike,
} from '../shared/transactionStepText';
import type { BlockRange } from '../cursor/blockSelectionTypes';
import {
    TEXT_SELECTION_OVERLAY_CLASS,
    TEXT_SELECTION_OVERLAY_FORCE_CLASS,
} from '../selection/textSelectionOverlayState';

const MAX_ACTIVE_HEADING_MARKERS = 1000;
const MAX_EMPTY_HEADING_MARKERS = 1000;
const HEADING_LINE_BREAK_PATTERN = /[\n\r]/u;
const HEADING_MARKER_PATTERN = /#/u;
const STOP_ACTIVE_HEADING_SCAN = Symbol('stopActiveHeadingScan');

interface SelectedHeading {
    blockSelected: boolean;
    fullyTextSelected: boolean;
    node: ProseNode;
    pos: number;
}

function getHeadingMarker(rawLevel: unknown): string {
    const level = typeof rawLevel === 'number' && Number.isFinite(rawLevel)
        ? Math.min(6, Math.max(1, Math.trunc(rawLevel)))
        : 1;
    return `${'#'.repeat(level)} `;
}

function collectSelectedHeadings(
    doc: ProseNode,
    selection: Selection,
    selectedBlocks: readonly BlockRange[],
    maxScanNodes: number,
): SelectedHeading[] {
    const headings = new Map<number, {
        blockSelected: boolean;
        fullyTextSelected: boolean;
        node: ProseNode;
    }>();
    let scannedNodes = 0;

    const isFullyTextSelected = (node: ProseNode, pos: number) => (
        !selection.empty
        && selection.from <= pos + 1
        && selection.to >= pos + 1 + node.content.size
    );

    const collectAncestorHeadings = ($pos: Selection['$from']) => {
        for (let depth = 1; depth <= $pos.depth; depth += 1) {
            const node = $pos.node(depth);
            if (node.type.name === 'heading') {
                const pos = $pos.before(depth);
                headings.set(pos, {
                    blockSelected: false,
                    fullyTextSelected: isFullyTextSelected(node, pos),
                    node,
                });
            }
        }
    };

    collectAncestorHeadings(selection.$from);
    collectAncestorHeadings(selection.$to);

    const scanRange = (from: number, to: number, blockSelected: boolean) => {
        try {
            doc.nodesBetween(from, to, (node, pos) => {
                scannedNodes += 1;
                if (node.type.name === 'heading') {
                    headings.set(pos, {
                        blockSelected: blockSelected || headings.get(pos)?.blockSelected || false,
                        fullyTextSelected: headings.get(pos)?.fullyTextSelected
                            || isFullyTextSelected(node, pos),
                        node,
                    });
                }
                if (
                    scannedNodes >= maxScanNodes
                    || headings.size >= MAX_ACTIVE_HEADING_MARKERS
                ) throw STOP_ACTIVE_HEADING_SCAN;
                return node.type.name !== 'heading';
            });
            return true;
        } catch (error) {
            if (error !== STOP_ACTIVE_HEADING_SCAN) throw error;
            return false;
        }
    };

    if (!selection.empty && !scanRange(selection.from, selection.to, false)) {
        return Array.from(headings, ([pos, heading]) => ({ ...heading, pos }));
    }

    for (const block of selectedBlocks) {
        if (headings.size >= MAX_ACTIVE_HEADING_MARKERS) break;
        const from = Math.max(0, Math.min(block.from, doc.content.size));
        const to = Math.max(from, Math.min(block.to, doc.content.size));
        if (from === to) continue;

        if (!scanRange(from, to, true)) break;
    }

    return Array.from(headings, ([pos, heading]) => ({ ...heading, pos }));
}

function createHeadingMarker(
    markerText: string,
    options: {
        blockSelected?: boolean;
        empty?: boolean;
        fullyTextSelected?: boolean;
    } = {},
): HTMLElement {
    const marker = document.createElement('span');
    marker.className = [
        'heading-markdown-marker',
        options.empty ? 'heading-markdown-marker-empty' : '',
        options.blockSelected ? 'heading-markdown-marker-block-selected' : '',
        options.fullyTextSelected ? TEXT_SELECTION_OVERLAY_CLASS : '',
        options.fullyTextSelected ? TEXT_SELECTION_OVERLAY_FORCE_CLASS : '',
    ].filter(Boolean).join(' ');
    marker.contentEditable = 'false';
    marker.setAttribute('aria-hidden', 'true');
    marker.textContent = markerText;
    return marker;
}

export function createActiveHeadingMarkerDecorations(
    state: EditorState,
    selectedBlocks: readonly BlockRange[] = [],
    maxScanNodes = DEFAULT_PROSE_DOC_SCAN_NODE_LIMIT,
): DecorationSet {
    const decorations = collectSelectedHeadings(
        state.doc,
        state.selection,
        selectedBlocks,
        maxScanNodes,
    ).flatMap(({ blockSelected, fullyTextSelected, node, pos }) => {
        if (node.content.size === 0 && !fullyTextSelected) return [];
        const empty = node.content.size === 0;
        const markerText = empty
            ? getHeadingMarker(node.attrs.level).trimEnd()
            : getHeadingMarker(node.attrs.level);
        const marker = Decoration.widget(
            pos + 1,
            () => createHeadingMarker(markerText, { blockSelected, empty, fullyTextSelected }),
            {
                key: [
                    'heading-marker',
                    pos,
                    markerText.length,
                    blockSelected ? 'block' : 'text',
                    fullyTextSelected ? 'selected' : 'plain',
                ].join('-'),
                side: -1,
            },
        );
        if (!fullyTextSelected) return [marker];

        return [
            Decoration.node(pos, pos + node.nodeSize, {
                class: 'heading-markdown-fully-selected',
            }),
            marker,
        ];
    });

    return DecorationSet.create(state.doc, decorations);
}

export function createEmptyHeadingMarkerDecorations(doc: ProseNode): DecorationSet {
    const decorations: Decoration[] = [];

    scanProseDescendants(doc, (node, pos) => {
        if (decorations.length >= MAX_EMPTY_HEADING_MARKERS) return STOP_PROSE_SCAN;
        if (node.type?.name !== 'heading' || node.content?.size !== 0) return true;

        const markerText = getHeadingMarker(node.attrs?.level).trimEnd();
        decorations.push(Decoration.widget(
            pos + 1,
            () => createHeadingMarker(markerText, { empty: true }),
            {
                key: `empty-heading-marker-${pos}-${markerText.length}`,
                side: -1,
            },
        ));
        return decorations.length < MAX_EMPTY_HEADING_MARKERS ? true : STOP_PROSE_SCAN;
    });

    return DecorationSet.create(doc, decorations);
}

export function combineHeadingMarkerDecorations(
    doc: ProseNode,
    emptyDecorations: DecorationSet,
    activeDecorations: DecorationSet,
): DecorationSet {
    const activeWidgetPositions = new Set(
        activeDecorations.find()
            .filter((decoration) => decoration.from === decoration.to)
            .map((decoration) => decoration.from),
    );
    return DecorationSet.create(doc, [
        ...emptyDecorations.find().filter((decoration) => (
            !activeWidgetPositions.has(decoration.from)
        )),
        ...activeDecorations.find(),
    ]);
}

function positionHasHeadingContext(doc: ProseNode, pos: number): boolean {
    try {
        const resolvedPos = Math.max(0, Math.min(pos, doc.content.size));
        const $pos = doc.resolve(resolvedPos);

        for (let depth = $pos.depth; depth >= 0; depth -= 1) {
            if ($pos.node(depth).type.name === 'heading') return true;
        }

        if ($pos.nodeBefore?.type.name === 'heading') return true;
        if ($pos.nodeAfter?.type.name === 'heading') return true;
        return doc.nodeAt(resolvedPos)?.type.name === 'heading';
    } catch {
        return false;
    }
}

export function transactionMayAffectEmptyHeadingMarkers(
    previous: DecorationSetLike,
    tr: unknown,
    oldDoc: ProseNode,
    newDoc: ProseNode,
): boolean {
    const ranges = getTransactionChangedRanges(tr);
    if (ranges.length === 0) return true;

    const insertsLineBreak = transactionInsertedTextMatches(tr, HEADING_LINE_BREAK_PATTERN);
    if (
        !insertsLineBreak
        && previous.find().length === 0
        && ranges.every((range) => range.oldFrom === range.oldTo)
        && !transactionInsertedTextMatches(tr, HEADING_MARKER_PATTERN)
    ) {
        return false;
    }

    return insertsLineBreak
        || transactionTouchesDecorations(previous, tr)
        || ranges.some((range) => (
            positionHasHeadingContext(oldDoc, range.oldFrom)
            || positionHasHeadingContext(oldDoc, range.oldTo)
            || positionHasHeadingContext(newDoc, range.newFrom)
            || positionHasHeadingContext(newDoc, range.newTo)
        ));
}
