import { sanitizeHtml } from './plugins/clipboard/sanitizer';

const MAX_RAW_MARKDOWN_HTML_CHARS = 2 * 1024 * 1024;
const PLAIN_UNCLOSED_HTML_BLOCK_START_PATTERN =
    /^(?: {0,3})<(div|blockquote|details|figure|section|article|aside|table|tbody|thead|tfoot|tr|td|th|ul|ol|li|dl|dt|dd|p|pre)>\n/i;
const RAW_MARKDOWN_HTML_COMMENT_PATTERN = /^<!--(?:(?!-->)[\s\S])*-->$/;
const RAW_MARKDOWN_ALIGNMENT_COMMENT_PATTERN = /^<!--\s*align\s*:\s*(?:left|center|right)\s*-->$/i;

export const MARKDOWN_HTML_INLINE_CLASS = 'md-html-inline';
export const MARKDOWN_HTML_SOURCE_TEXT_CLASS = 'md-html-source-text';

export function getRawMarkdownHtmlValue(value: unknown): string {
    return typeof value === 'string' && value.length <= MAX_RAW_MARKDOWN_HTML_CHARS ? value : '';
}

export function getRawMarkdownHtmlRenderValue(value: unknown): string | null {
    return typeof value === 'string' && value.length <= MAX_RAW_MARKDOWN_HTML_CHARS ? value : null;
}

function isSafeInternalMarkdownHtmlValue(value: string): boolean {
    const trimmed = value.trim();
    return trimmed === '<!--vlaina-markdown-blank-line-->'
        || trimmed === '<!--vlaina-rendered-html-boundary-blank-line-->'
        || trimmed === '<!--vlaina-markdown-tight-heading-->';
}

function isNonRenderingMarkdownHtmlValue(value: string): boolean {
    const trimmed = value.trim();
    return /^<!--(?:(?!-->)[\s\S])*-->$/.test(trimmed)
        || /^<\?(?:(?!\?>)[\s\S])*\?>$/.test(trimmed)
        || /^<![A-Za-z][^>]*>$/.test(trimmed)
        || /^<!\[CDATA\[(?:(?!\]\]>)[\s\S])*\]\]>$/.test(trimmed);
}

function isSafeStaticMarkdownHtmlValue(value: string): boolean {
    const trimmed = value.trim();
    return /^<div\s+class\s*=\s*(?:"v-page-break"|'v-page-break')\s*>\s*<\/div>$/i.test(trimmed);
}

function isPlainUnclosedHtmlBlockStart(value: string): boolean {
    const tagName = PLAIN_UNCLOSED_HTML_BLOCK_START_PATTERN.exec(value)?.[1];
    return Boolean(tagName && !new RegExp(`</${tagName}\\s*>`, 'i').test(value));
}

export function sanitizeRawMarkdownHtmlValue(value: unknown): string {
    const rawValue = getRawMarkdownHtmlValue(value);
    if (!rawValue) return '';
    if (
        isSafeInternalMarkdownHtmlValue(rawValue)
        || isNonRenderingMarkdownHtmlValue(rawValue)
        || isSafeStaticMarkdownHtmlValue(rawValue)
    ) {
        return rawValue.trim();
    }
    if (isPlainUnclosedHtmlBlockStart(rawValue)) return rawValue;
    return sanitizeHtml(rawValue);
}

export function shouldRenderRawMarkdownHtmlValueAsLiteralText(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    return RAW_MARKDOWN_HTML_COMMENT_PATTERN.test(trimmed)
        && !isSafeInternalMarkdownHtmlValue(trimmed)
        && !RAW_MARKDOWN_ALIGNMENT_COMMENT_PATTERN.test(trimmed);
}

export function renderRawMarkdownHtmlValueIntoElement(element: HTMLElement, value: string) {
    const renderAsLiteralText = shouldRenderRawMarkdownHtmlValueAsLiteralText(value);
    element.classList.toggle('md-htmlblock-literal-text', renderAsLiteralText);
    element.classList.toggle(MARKDOWN_HTML_SOURCE_TEXT_CLASS, renderAsLiteralText);
    element.dataset.value = value;
    if (renderAsLiteralText) {
        element.textContent = value;
    } else {
        element.innerHTML = value;
    }
}

export function isLiteralInlineMarkdownHtmlElement(element: HTMLElement, value: string): boolean {
    return element.childNodes.length === 1
        && element.firstChild?.nodeType === Node.TEXT_NODE
        && element.textContent === value;
}
