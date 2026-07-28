import {
    normalizeAlternativeMathBlockFences,
    normalizeLenientMarkdownLineMarkers,
    preserveMarkdownBlankLinesForPaste,
} from '@/lib/notes/markdown/markdownSerializationUtils';
import { normalizeCanonicalMarkdownSpacingForPaste } from '@/lib/notes/markdown/markdownCanonicalSpacing';
import {
    isMarkdownLineInContainer,
    parseMarkdownContainerFenceCloseLine,
    parseMarkdownContainerFenceLine,
    type MarkdownContainerState,
} from '@/lib/notes/markdown/markdownFenceProtectedLines';

import {
    looksLikeMarkdownForPaste,
    normalizeInterruptedOrderedListsForPaste,
    normalizeStandaloneThematicBreaksForPaste,
} from './fencedCodePaste';
import { normalizeLeadingFrontmatterMarkdown } from '../frontmatter/frontmatterMarkdown';
import { joinWrappedPlainTextLines } from './clipboardPlainTextPaste';

const BULLET_PREFIXED_ORDERED_MARKER_PATTERN = /^(?:\s*)[•‣◦]\s*(\d{1,3})[.)][ \t]+(.+)$/u;
const ORDERED_OUTLINE_MARKER_PATTERN = /^(\s{0,3})(?:[•‣◦]\s*)?(\d{1,3})[.)][ \t]+(.+)$/u;
const INLINE_EMBEDDED_HTML_EXAMPLE_PATTERN =
    /<(video|audio|iframe)\b[^>\n]*>[^<\n]*<\/\1>|<(img|source|track|video|audio|iframe)\b[^>\n]*\/?>/gi;

function getInlineCodeSpanRanges(line: string): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    let index = 0;

    while (index < line.length) {
        const start = line.indexOf('`', index);
        if (start < 0) break;

        let markerSize = 1;
        while (line[start + markerSize] === '`') {
            markerSize += 1;
        }

        const marker = '`'.repeat(markerSize);
        const end = line.indexOf(marker, start + markerSize);
        if (end < 0) break;

        ranges.push([start, end + markerSize]);
        index = end + markerSize;
    }

    return ranges;
}

function isOffsetInRanges(offset: number, ranges: ReadonlyArray<[number, number]>): boolean {
    return ranges.some(([start, end]) => offset >= start && offset < end);
}

function stripMarkdownContainerPrefix(value: string): string {
    let normalized = value.replace(/^(?: {0,3}>[ \t]*)*/, '');
    normalized = normalized.replace(/^ {0,3}(?:[-+*]|\d+[.)])[ \t]+(?:\[(?: |x|X)\][ \t]+)?/, '');
    return normalized;
}

function startsWithRawHtmlAfterMarkdownContainerPrefix(value: string): boolean {
    return stripMarkdownContainerPrefix(value).trimStart().startsWith('<');
}

function isAtRawHtmlLineStart(line: string, offset: number): boolean {
    return stripMarkdownContainerPrefix(line.slice(0, offset)).trim().length === 0
        && stripMarkdownContainerPrefix(line).trimStart().startsWith('<');
}

function escapeInlineEmbeddedHtmlExamples(text: string): string {
    let activeFence: (MarkdownContainerState & { marker: string; length: number }) | null = null;

    return text.replace(/^.*$/gm, (line) => {
        if (activeFence) {
            if (isMarkdownLineInContainer(line, activeFence)) {
                if (parseMarkdownContainerFenceCloseLine(line, activeFence)) {
                    activeFence = null;
                }
                return line;
            }
            activeFence = null;
        }

        const fence = parseMarkdownContainerFenceLine(line);
        if (fence && (fence.marker !== '`' || line.indexOf('`', fence.infoStart) === -1)) {
            activeFence = {
                blockquoteDepth: fence.blockquoteDepth,
                containerIndent: fence.containerIndent,
                marker: fence.marker,
                length: fence.length,
            };
            return line;
        }

        INLINE_EMBEDDED_HTML_EXAMPLE_PATTERN.lastIndex = 0;
        if (!INLINE_EMBEDDED_HTML_EXAMPLE_PATTERN.test(line)) {
            return line;
        }

        INLINE_EMBEDDED_HTML_EXAMPLE_PATTERN.lastIndex = 0;
        const codeSpanRanges = getInlineCodeSpanRanges(line);
        return line.replace(INLINE_EMBEDDED_HTML_EXAMPLE_PATTERN, (match, _tagName, _voidTagName, offset: number) => {
            if (isOffsetInRanges(offset, codeSpanRanges)) {
                return match;
            }

            const before = line.slice(0, offset);
            const after = line.slice(offset + match.length);
            if (startsWithRawHtmlAfterMarkdownContainerPrefix(before)) {
                return match;
            }

            if (isAtRawHtmlLineStart(line, offset) && after.trimStart().startsWith('<')) {
                return match;
            }

            const isStandaloneHtmlLine = before.trim().length === 0 && after.trim().length === 0;
            if (isStandaloneHtmlLine) {
                return match;
            }

            return match.replace(/[<>/]/g, '\\$&');
        });
    });
}

function normalizeBulletPrefixedOrderedOutlinePaste(text: string): string {
    const normalized = text.replace(/\r\n?/g, '\n');
    const lines = normalized.split('\n');

    if (!lines.some((line) => BULLET_PREFIXED_ORDERED_MARKER_PATTERN.test(line))) {
        return text;
    }

    type OutlineItem = {
        number: string;
        title: string;
        bodyLines: string[];
    };

    const items: OutlineItem[] = [];
    let current: OutlineItem | null = null;
    let sawBulletPrefixedMarker = false;

    for (const line of lines) {
        const markerMatch = ORDERED_OUTLINE_MARKER_PATTERN.exec(line);
        if (markerMatch) {
            if (BULLET_PREFIXED_ORDERED_MARKER_PATTERN.test(line)) {
                sawBulletPrefixedMarker = true;
            }
            current = {
                number: markerMatch[2] ?? '1',
                title: (markerMatch[3] ?? '').trim(),
                bodyLines: [],
            };
            items.push(current);
            continue;
        }

        if (!current) {
            if (line.trim().length > 0) return text;
            continue;
        }

        if (line.trim().length > 0 && !/^[ \t]{2,}\S/.test(line)) {
            return text;
        }

        current.bodyLines.push(line);
    }

    if (!sawBulletPrefixedMarker || items.length < 2) return text;

    return items
        .map((item) => {
            const body = joinWrappedPlainTextLines(item.bodyLines);
            if (!body) return `${item.number}. ${item.title}`;
            return `${item.number}. ${item.title}\n\n   ${body}`;
        })
        .join('\n\n');
}

export function prepareMarkdownPasteInput(
    text: string,
    isWithinBounds: (value: string) => boolean,
): string | null {
    const withOrderedOutline = normalizeBulletPrefixedOrderedOutlinePaste(text);
    if (!isWithinBounds(withOrderedOutline)) {
        return null;
    }
    const withMathFences = normalizeAlternativeMathBlockFences(withOrderedOutline);
    if (!isWithinBounds(withMathFences)) {
        return null;
    }
    const withEscapedInlineEmbeddedHtml = escapeInlineEmbeddedHtmlExamples(withMathFences);
    if (!isWithinBounds(withEscapedInlineEmbeddedHtml)) {
        return null;
    }
    const withLenientLineMarkers = normalizeLenientMarkdownLineMarkers(withEscapedInlineEmbeddedHtml);
    if (!isWithinBounds(withLenientLineMarkers)) {
        return null;
    }
    if (
        !looksLikeMarkdownForPaste(withOrderedOutline)
        && !looksLikeMarkdownForPaste(withMathFences)
        && !looksLikeMarkdownForPaste(withLenientLineMarkers)
    ) {
        return null;
    }

    const withFrontmatter = normalizeLeadingFrontmatterMarkdown(withLenientLineMarkers);
    if (!isWithinBounds(withFrontmatter)) {
        return null;
    }
    const withThematicBreaks = normalizeStandaloneThematicBreaksForPaste(withFrontmatter);
    if (!isWithinBounds(withThematicBreaks)) {
        return null;
    }
    const shouldCompactLenientListGaps = withLenientLineMarkers !== withMathFences;
    const pasteMarkdown = shouldCompactLenientListGaps
        ? normalizeCanonicalMarkdownSpacingForPaste(withThematicBreaks)
        : withThematicBreaks;
    if (!isWithinBounds(pasteMarkdown)) {
        return null;
    }
    const withPreservedBlankLines = preserveMarkdownBlankLinesForPaste(pasteMarkdown);
    if (!isWithinBounds(withPreservedBlankLines)) {
        return null;
    }
    const editorInput = normalizeInterruptedOrderedListsForPaste(withPreservedBlankLines);
    return isWithinBounds(editorInput) ? editorInput : null;
}
