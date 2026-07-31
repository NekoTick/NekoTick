import { isTocShortcutText } from '../toc/tocShortcut';
import { normalizeLineEnding } from './fencedCodeBlockParser';
import { normalizeInterruptedOrderedListsForPaste } from '@/lib/notes/markdown/markdownInterruptedOrderedLists';
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

export { normalizeInterruptedOrderedListsForPaste };

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
