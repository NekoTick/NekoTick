import { isTocShortcutText } from '../toc/tocShortcut';
import { normalizeLineEnding } from './fencedCodeBlockParser';
import {
    isMarkdownLineInContainer,
    parseMarkdownContainerFenceCloseLine,
    parseMarkdownContainerFenceLine,
    type MarkdownContainerState,
} from '@/lib/notes/markdown/markdownFenceProtectedLines';
export {
    looksLikePlainTextWithOnlyBackslashHardBreakSignal,
} from '@/lib/notes/markdown/plainTextBackslashHardBreaks';
export {
    isStandaloneFencedCodeBlock,
    parseStandaloneFencedCodeBlock,
    type FencedCodePayload,
} from './fencedCodeBlockParser';

export interface AtxHeadingPayload {
    level: number;
    text: string;
}

const ATX_HEADING_PATTERN = /^ {0,3}(#{1,6})(?:[ \t]+(.+?))?[ \t]*$/;
const ATX_CLOSING_SEQUENCE_PATTERN = /(?:^|[ \t]+)#{1,}[ \t]*$/;
const BLOCK_MARKDOWN_SIGNAL_PATTERN = /(^|\n)\s{0,3}(#{1,6}[ \t]+|[-+*][ \t]+|\d+[.)][ \t]+|>[ \t]+|```|~~~|\$\$[ \t]*$|\\\[|\[\\|\[[ \t]*$|\[[^\]\n]+\]:|[-*_]{3,}[ \t]*$|\|.+\|)/m;
const SETEXT_HEADING_SIGNAL_PATTERN = /(^|\n)[^\n]+\n {0,3}(?:=+|-+)[ \t]*(?:\n|$)/;
const HARD_BREAK_SIGNAL_PATTERN = /(\\| {2,})\n|<br\s*\/?>/i;
const INLINE_MARKDOWN_SIGNAL_PATTERN = /(\[\^[^\]]+\]|\[[^\]]+\]\([^)]+\)|`[^`\n]+`|\$[^$\n]+\$|==[^=\n]+==|\+\+[^+\n]+\+\+|<(?:mark|sup|sub|u)\b[\s\S]*?<\/(?:mark|sup|sub|u)>|<span\b[^>]*style=["'][^"']*(?:color|background-color)\s*:[^"']*["'][\s\S]*?<\/span>|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/i;
const DEFINITION_LIST_SIGNAL_PATTERN = /(^|\n)[^\n]{1,79}\n(?:[ \t]*\n)?[ \t]{0,3}:[ \t]+\S/m;
const MARKDOWN_FENCE_OPEN_PATTERN = /^```(?:markdown|md|mdx)\s*$/i;
const PLAIN_FENCE_CLOSE_PATTERN = /^```$/;
const ORDERED_LIST_MARKER_PATTERN = /^(\s{0,3})(\d+)[.)][ \t]+/;
const ANY_LIST_MARKER_PATTERN = /^\s*(?:[-+*]|\d+[.)])[ \t]+/;
const BLOCK_START_PATTERN = /^\s{0,3}(?:#{1,6}[ \t]+|[-+*][ \t]+|\d+[.)][ \t]+|>[ \t]+|```|~~~|\$\$[ \t]*$|\\\[|\[\\|\[[ \t]*$|\[\^[^\]]+\]:|[-*_]{3,}[ \t]*$|\|.+\|)/;

type ContainerFenceState = MarkdownContainerState & { marker: string; length: number };

export const parseStandaloneAtxHeading = (value: string): AtxHeadingPayload | null => {
    const normalized = normalizeLineEnding(value).replace(/\n+$/g, '');
    if (!normalized || normalized.includes('\n')) return null;

    const match = normalized.match(ATX_HEADING_PATTERN);
    if (!match) return null;

    const level = match[1].length;
    const text = (match[2] ?? '').replace(ATX_CLOSING_SEQUENCE_PATTERN, '').trim();
    if (!text) return null;

    return {
        level,
        text,
    };
};

export const normalizeStandaloneThematicBreaksForPaste = normalizeLineEnding;

function isListLikeLine(line: string): boolean {
    return ANY_LIST_MARKER_PATTERN.test(line);
}

function isParagraphContinuationBeforeList(line: string | undefined): boolean {
    if (line === undefined || line.trim().length === 0) return false;
    if (isMarkdownFenceOpenLine(line)) return false;
    if (ANY_LIST_MARKER_PATTERN.test(line)) return false;
    return !BLOCK_START_PATTERN.test(line);
}

function hasFollowingOrderedListRun(lines: string[], startIndex: number): boolean {
    const firstMatch = ORDERED_LIST_MARKER_PATTERN.exec(lines[startIndex]);
    if (!firstMatch) return false;

    const firstIndent = firstMatch[1] ?? '';
    const firstNumber = Number(firstMatch[2]);
    if (!Number.isFinite(firstNumber) || firstNumber <= 1) return false;

    for (let index = startIndex + 1; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.trim().length === 0) continue;
        if (isMarkdownFenceOpenLine(line)) return false;

        const nextMatch = ORDERED_LIST_MARKER_PATTERN.exec(line);
        if (!nextMatch) {
            return isListLikeLine(line);
        }

        return (nextMatch[1] ?? '') === firstIndent;
    }

    return false;
}

export const normalizeInterruptedOrderedListsForPaste = (value: string): string => {
    const normalized = normalizeLineEnding(value);
    const lines = normalized.split('\n');
    if (lines.length < 2) return normalized;

    const result: string[] = [];
    let activeFence: ContainerFenceState | null = null;

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];

        if (activeFence) {
            if (isMarkdownLineInContainer(line, activeFence)) {
                result.push(line);
                if (parseMarkdownContainerFenceCloseLine(line, activeFence)) {
                    activeFence = null;
                }
                continue;
            }
            activeFence = null;
        }

        const openingFence = getMarkdownFenceOpenLine(line);
        if (openingFence) {
            activeFence = {
                blockquoteDepth: openingFence.blockquoteDepth,
                containerIndent: openingFence.containerIndent,
                length: openingFence.length,
                marker: openingFence.marker,
            };
            result.push(line);
            continue;
        }

        const previousLine = result[result.length - 1];
        if (
            previousLine !== ''
            && hasFollowingOrderedListRun(lines, index)
            && isParagraphContinuationBeforeList(previousLine)
        ) {
            result.push('');
        }

        result.push(line);
    }

    return result.join('\n');
};

function getMarkdownFenceOpenLine(line: string) {
    const fence = parseMarkdownContainerFenceLine(line);
    if (!fence || (fence.marker === '`' && line.indexOf('`', fence.infoStart) !== -1)) {
        return null;
    }
    return fence;
}

function isMarkdownFenceOpenLine(line: string): boolean {
    return getMarkdownFenceOpenLine(line) !== null;
}

export const looksLikeMarkdownForPaste = (value: string): boolean => {
    const normalized = normalizeLineEnding(value);
    if (!normalized.trim()) return false;

    return (
        isTocShortcutText(normalized)
        || BLOCK_MARKDOWN_SIGNAL_PATTERN.test(normalized)
        || SETEXT_HEADING_SIGNAL_PATTERN.test(normalized)
        || HARD_BREAK_SIGNAL_PATTERN.test(normalized)
        || DEFINITION_LIST_SIGNAL_PATTERN.test(normalized)
        || INLINE_MARKDOWN_SIGNAL_PATTERN.test(normalized)
    );
};

export const extractLargestMarkdownFenceContent = (value: string): string | null => {
    const normalized = normalizeLineEnding(value);
    if (!normalized.trim()) return null;

    const lines = normalized.split('\n');
    let bestStart = -1;
    let bestEnd = -1;
    let bestSpan = -1;
    let activeStart = -1;

    for (let index = 0; index < lines.length; index += 1) {
        const trimmed = lines[index].trim();
        if (activeStart < 0) {
            if (MARKDOWN_FENCE_OPEN_PATTERN.test(trimmed)) {
                activeStart = index;
            }
            continue;
        }

        if (PLAIN_FENCE_CLOSE_PATTERN.test(trimmed)) {
            const span = index - activeStart;
            if (span > bestSpan) {
                bestStart = activeStart;
                bestEnd = index;
                bestSpan = span;
            }
        }
    }

    if (bestStart < 0 || bestEnd <= bestStart + 1) return null;

    const content = lines.slice(bestStart + 1, bestEnd).join('\n').trim();
    return content || null;
};
