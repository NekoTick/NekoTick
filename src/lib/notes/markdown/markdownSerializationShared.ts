export const BR_ONLY_PATTERN = /^<br\b[^>]*\/?>\s*(?:<\/br>)?$/i;
export const UTF8_BOM = '\uFEFF';
export const LEGACY_EMPTY_LINE_ATTR_PATTERN = '\\bdat[ae]-vlaina-?(?:empty|empt)-line';
export const LEGACY_LIST_GAP_ATTR_PATTERN = '\\bdat[ae]-vlaina-?list-gap';
export const LEGACY_USER_BR_ATTR_PATTERN = '\\bdat[ae]-vlaina-?user-br';
export const LEGACY_BLOCKQUOTE_DEPTH_ATTR_PATTERN = '\\bdat[ae]-vlaina-?blockquote-depth';
export const TRUE_ATTR_VALUE_PATTERN = '(?:"true"|\'true\'|true\\b)';
export const DEPTH_ATTR_VALUE_PATTERN = '(?:"(\\d+)"|\'(\\d+)\'|(\\d+)\\b)';
export const MARKED_BR_ONLY_PATTERN =
  new RegExp(`^<br\\b(?=[^>]*${LEGACY_EMPTY_LINE_ATTR_PATTERN}=${TRUE_ATTR_VALUE_PATTERN})[^>]*\\/?>\\s*(?:<\\/br>)?$`, 'i');
export const INTERNAL_MARKDOWN_BLANK_LINE_COMMENT_PATTERN = /^\s*<!--\s*vlaina-markdown-blank-line\s*-->\s*$/i;
export const RENDERED_HTML_BOUNDARY_BLANK_LINE_COMMENT_PATTERN =
  /^\s*<!--\s*vlaina-rendered-html-boundary-blank-line\s*-->\s*$/i;
export const INTERNAL_TIGHT_HEADING_COMMENT_PATTERN = /^\s*<!--\s*vlaina-markdown-tight-heading\s*-->\s*$/i;
export const HTML_COMMENT_OPEN_PATTERN = /^(?: {0,3})<!--/;
export const HTML_COMMENT_CLOSE_PATTERN = /-->/;
export const HTML_IMAGE_LINE_PATTERN = /^(?: {0,3})<img(?:\s|\/?>|$)/i;
export const HTML_BLOCK_LINE_PATTERN =
  /^(?: {0,3})<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h1|h2|h3|h4|h5|h6|head|header|hr|html|iframe|img|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|\/?>|$)/i;
export const HTML_ONE_LINE_RENDERED_BLOCK_PATTERN =
  /^(?: {0,3})<([A-Za-z][A-Za-z0-9-]*)(?:\s|>|\/>)[\s\S]*?(?:<\/\1>|\/>)[ \t]*$/;
export const HTML_ONE_LINE_RENDERED_VOID_BLOCK_PATTERN =
  /^(?: {0,3})<(?:img|hr|br)(?:\s|\/?>|$)[\s\S]*$/i;
export const HTML_CLOSING_RENDERED_BLOCK_PATTERN =
  /^(?: {0,3})<\/([A-Za-z][A-Za-z0-9-]*)\s*>[ \t]*$/;
export const NON_EDITABLE_HTML_BOUNDARY_TAG_NAMES = new Set([
  'base',
  'basefont',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'script',
  'style',
  'pre',
  'textarea',
  'title',
  'xmp',
  'noembed',
  'noframes',
  'plaintext',
  'math',
  'noscript',
  'svg',
]);
export const BLANK_TERMINATED_NON_EDITABLE_HTML_TAG_NAMES = new Set([
  'math',
  'noembed',
  'noscript',
  'svg',
  'textarea',
  'xmp',
]);
export const MARKDOWN_ESCAPE_PATTERN = /\\([\\`*_{}[\]()#+\-.!])/g;
export const ESCAPED_LESS_THAN_PATTERN = /(^|[^\\])\\</g;
export const REDUNDANT_PAIRED_MARKER_ESCAPES = new Set(['*', '~']);
export const LIST_GAP_SENTINEL = '\u0000VLAINA_LIST_GAP_SENTINEL\u0000';
export const USER_BR_SENTINEL = '\u0000VLAINA_USER_BR_SENTINEL\u0000';
export const LEAKED_LIST_GAP_SENTINEL_PATTERN =
  /(?:�+VLAINA_LIST_GAP_SENTINEL�*|�*VLAINA_LIST_GAP_SENTINEL�+)/g;
export const LEAKED_USER_BR_SENTINEL_PATTERN =
  /(?:�+VLAINA_USER_BR_SENTINEL�*|�*VLAINA_USER_BR_SENTINEL�+)/g;
export const LEAKED_LIST_GAP_SENTINEL_WITH_NEWLINES_PATTERN =
  new RegExp(`\\n*${LEAKED_LIST_GAP_SENTINEL_PATTERN.source}\\n*`, 'g');
export const MARKDOWN_SPACE_ENTITY_PATTERN = /&#(?:x0*20|0*32)(?:;|(?=$|[ \t]))/i;
export const LEADING_MARKDOWN_SPACE_ENTITY_RUN_PATTERN =
  /^(?:(?:[ \t]+)|(?:&#(?:x0*20|0*32);|&#(?:x0*20|0*32)(?=$|[ \t])))+/i;
export const MARKDOWN_SPACE_ENTITY_REPLACEMENT_PATTERN =
  /&#(?:x0*20|0*32);|&#(?:x0*20|0*32)(?:[ \t]|$)/gi;
export const BLOCKQUOTE_CONTAINER_PREFIX_PATTERN = /^(?: {0,3}>[ \t]?)/;
export const LIST_CONTAINER_PREFIX_PATTERN =
  /^(?: {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+(?:\[(?: |x|X)\][ \t]+)?)/;
export const INVISIBLE_EMPTY_LINE_PLACEHOLDER_PATTERN = /^[\t ]*\\?\u200B[\t ]*$/;
export const INVISIBLE_LIST_GAP_PLACEHOLDER_PATTERN = /^[\t ]*\\?\u200B\\?\u200C[\t ]*$/;
export const EDITABLE_LIST_GAP_PLACEHOLDER_PATTERN = /^[\t ]*\u2800[\t ]*$/;
export const USER_BR_SENTINEL_LINE_PATTERN =
  new RegExp(`^(\\s*(?:>\\s*)*)${USER_BR_SENTINEL}$`);
export const MARKED_EMPTY_MARKDOWN_LINE_PLACEHOLDER_PATTERN =
  new RegExp(`^(\\s*(?:>\\s*)*(?:(?:[-+*]|\\d+[.)])\\s+(?:\\[(?: |x|X)\\]\\s+)?)?)<br\\b(?=[^>]*${LEGACY_EMPTY_LINE_ATTR_PATTERN}=${TRUE_ATTR_VALUE_PATTERN})[^>]*\\/?>\\s*(?:<\\/br>)?$`, 'gim');
export const MARKED_EMPTY_LINE_PATTERN =
  new RegExp(`^<br\\b(?=[^>]*${LEGACY_EMPTY_LINE_ATTR_PATTERN}=${TRUE_ATTR_VALUE_PATTERN})[^>]*\\/?>\\s*(?:<\\/br>)?$`, 'i');
export const MARKED_EMPTY_LINE_TOKEN_PATTERN =
  new RegExp(`[ \\t]*<br\\b(?=[^>]*${LEGACY_EMPTY_LINE_ATTR_PATTERN}=${TRUE_ATTR_VALUE_PATTERN})[^>]*\\/?>[ \\t]*(?:<\\/br>)?`, 'gi');
export const MARKED_USER_BR_PATTERN =
  new RegExp(`^<br\\b(?=[^>]*${LEGACY_USER_BR_ATTR_PATTERN}=${TRUE_ATTR_VALUE_PATTERN})[^>]*\\/?>\\s*(?:<\\/br>)?$`, 'i');
export const MARKED_BLOCKQUOTE_USER_BR_PATTERN =
  new RegExp(`^(\\s*(?:>\\s*)+)<br\\b(?=[^>]*${LEGACY_USER_BR_ATTR_PATTERN}=${TRUE_ATTR_VALUE_PATTERN})[^>]*\\/?>\\s*(?:<\\/br>)?$`, 'i');
export const MARKED_BLOCKQUOTE_USER_BR_WITH_DEPTH_PATTERN =
  new RegExp(`^(\\s*(?:>\\s*)*)<br\\b(?=[^>]*${LEGACY_USER_BR_ATTR_PATTERN}=${TRUE_ATTR_VALUE_PATTERN})(?=[^>]*${LEGACY_BLOCKQUOTE_DEPTH_ATTR_PATTERN}=${DEPTH_ATTR_VALUE_PATTERN})[^>]*\\/?>\\s*(?:<\\/br>)?$`, 'i');
export const MARKED_BLOCKQUOTE_USER_BR_TOKEN_PATTERN =
  new RegExp(`[ \\t]*(?:\\\\?\\u200B[ \\t]*)?<br\\b(?=[^>]*${LEGACY_USER_BR_ATTR_PATTERN}=${TRUE_ATTR_VALUE_PATTERN})(?=[^>]*${LEGACY_BLOCKQUOTE_DEPTH_ATTR_PATTERN}=${DEPTH_ATTR_VALUE_PATTERN})[^>]*\\/?>[ \\t]*(?:<\\/br>)?`, 'gi');
export const MARKED_USER_BR_TOKEN_PATTERN =
  new RegExp(`[ \\t]*(?:\\\\?\\u200B[ \\t]*)?<br\\b(?=[^>]*${LEGACY_USER_BR_ATTR_PATTERN}=${TRUE_ATTR_VALUE_PATTERN})[^>]*\\/?>[ \\t]*(?:<\\/br>)?`, 'gi');
export const MARKED_LIST_GAP_TOKEN_PATTERN = new RegExp(`[ \\t]*<br\\b(?=[^>]*${LEGACY_LIST_GAP_ATTR_PATTERN}=${TRUE_ATTR_VALUE_PATTERN})[^>]*\\/?>[ \\t]*(?:<\\/br>)?`, 'gi');
export const EMPTY_LIST_ITEM_PLACEHOLDER_PATTERN =
  /^(\s*(?:>\s*)*(?:[-+*]|\d+[.)])(?:\s+\[(?: |x|X)\])?)\s+<br\b[^>]*\/?>\s*(?:<\/br>)?$/gim;
export const EDITABLE_LIST_GAP_MARKER_PLACEHOLDER_PATTERN =
  /^(\s*(?:>\s*)*(?:[-+*]|\d+[.)])(?:\s+\[(?: |x|X)\])?)\s+\\?\u2800\s*$/;
export const SERIALIZED_EDITABLE_LIST_GAP_PLACEHOLDER_PATTERN =
  /^\s*(?:>\s*)*(?:[-+*]|\d+[.)])\s+\\?\u2800\s*$/;
export const STANDALONE_BR_LINE_PATTERN = /^(\s*)<br\b[^>]*\/?>\s*(?:<\/br>)?$/i;
export const BLOCKQUOTE_STANDALONE_BR_LINE_PATTERN = /^(\s*(?:>\s*)+)<br\b[^>]*\/?>\s*(?:<\/br>)?$/i;
export const INLINE_TERMINAL_LIST_BR_PATTERN =
  /^(\s*(?:>\s*)*(?:[-+*]|\d+[.)])\s+(?:\[(?: |x|X)\]\s+)?(?:.+?))<br\b[^>]*\/?>\s*(?:<\/br>)?$/i;
export const EMPTY_FOOTNOTE_DEFINITION_PLACEHOLDER_PATTERN =
  /^(\s*\[\^[^\]]+\]:)\s*<br\s*\/?>$/gim;
export const EMPTY_TABLE_CELL_PLACEHOLDER_PATTERN = /(\|\s*)<br\s*\/?>(\s*\|)/g;
export const EMPTY_ATX_HEADING_MARKER_PATTERN = /^( {0,3})(#{1,6})[ \t]*$/gm;
export const LIST_ITEM_LINE_PATTERN = /^(?: {0,3})(?:[-+*]|\d+[.)])(?:\s+|$)/;
export const NESTED_LIST_ITEM_LINE_PATTERN = /^\s*(?:>\s*)*(?:[-+*]|\d+[.)])(?:\s+|$)/;
export const MISSING_ORDERED_LIST_SPACE_LINE_PATTERN =
  /^((?:(?: {0,3}>[ \t]?)* {0,3})(\d{1,3})\.)(\S.*)$/;
export const MISSING_UNORDERED_LIST_SPACE_LINE_PATTERN =
  /^((?:(?: {0,3}>[ \t]?)* {0,3})([-+*－＊＋]))([^\s\d\-+*－＊＋[\]].*)$/u;
export const UNICODE_BULLET_LIST_LINE_PATTERN =
  /^((?:(?: {0,3}>[ \t]?)* {0,3})([•‣◦]))[ \t]+(.+)$/u;
export const CHINESE_ORDERED_LIST_MARKER_PATTERN =
  /^((?:(?: {0,3}>[ \t]?)* {0,3})(?:[（(]\s*)?(\d{1,3})(?:\s*[）)]|[、．]))[ \t]*(\S.*)$/u;
export const MALFORMED_TASK_LIST_MARKER_PATTERN =
  /^((?:(?: {0,3}>[ \t]?)* {0,3})(?:[-+*－＊＋]|\d+[.)]))[ \t]*(?:\[\s*([xXｘＸ✓✔√]?)\s*\]|［\s*([xXｘＸ✓✔√]?)\s*］|【\s*([xXｘＸ✓✔√]?)\s*】)[ \t]*(.*)$/u;
export const FULLWIDTH_MARKDOWN_LINE_MARKER_PATTERN =
  /^((?:(?: {0,3}＞[ \t]?| {0,3}>[ \t]?)* {0,3}))(＃{1,6}|＞)(.*)$/u;
export const FULLWIDTH_ORDERED_LIST_DIGIT_PATTERN =
  /^((?:(?: {0,3}>[ \t]?)* {0,3})(?:[（(][ \t]*)?)([０-９]{1,3})(?=[ \t]*(?:[）)]|[、．.]))/u;
export const FULLWIDTH_TABLE_PIPE_PATTERN = /｜/g;
export const TABLE_ROW_PATTERN = /^\s*\|.*\|\s*$/;
export const TABLE_DELIMITER_ROW_PATTERN = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
export const MISSING_BLOCKQUOTE_SPACE_PATTERN =
  /^((?:(?: {0,3}>[ \t]?)* {0,3})>)(\S.*)$/;
export const CJK_ATX_HEADING_WITHOUT_SPACE_PATTERN =
  /^((?:(?: {0,3}>[ \t]?)* {0,3})#{1,6})([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}].*)$/u;
export const GENERIC_HTML_BLOCK_OPEN_LINE_PATTERN =
  /^(?: {0,3})<([A-Za-z][A-Za-z0-9-]*)(?:\s[^<>]*)?>\s*$/;
export const RAW_HTML_BLOCK_OPEN_LINE_PATTERN =
  /^(?: {0,3})<(pre|script|style|textarea|title|xmp|noembed|noframes|plaintext|math|noscript|svg)(?:\s|>|$)/i;
export const MAX_CACHED_MARKDOWN_NORMALIZATION_LENGTH = 1_000_000;
export const FAST_NORMALIZATION_MIN_LENGTH = 1_000_000;
export const ESCAPED_HIGHLIGHT_PATTERN = /\\==([^=\n]+)==/g;
export const ESCAPED_URL_SCHEME_PATTERN = /\b(https?)\\:(?=\/\/)/gi;
export const MARKDOWN_AUTOLINK_LITERAL_PATTERN =
  /<((?:https?:\/\/|mailto:)[^\s<>"']+|[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+)>/gi;
export const EMAIL_ADDRESS_SOURCE = String.raw`[A-Za-z0-9.!#$%&'*+/=?^_{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+`;
export const MAILTO_EMAIL_MARKDOWN_LINK_PATTERN = new RegExp(
  String.raw`(^|[^!])\[(${EMAIL_ADDRESS_SOURCE})\]\(mailto:(${EMAIL_ADDRESS_SOURCE})\)`,
  'gi'
);
export const FAST_NORMALIZATION_STRUCTURAL_LINE_PATTERN =
  /^\s*(?:[-+*]\s+|\d+[.)]\s+|>\s*|`{3,}|~{3,}|\|.*\||#{1,6}[ \t]*$|[-*_][ \t]*[-*_][ \t]*[-*_]|=+[ \t]*$)/;
export const LATEX_LIKE_MATH_CONTENT_PATTERN = /\\[A-Za-z]+|(?:^|[^\w])(?:\\?[A-Za-z]\w*)\s*(?:=|[<>]|\^(?:\{|\d)|_(?:\{|\d)|\\(?:le|ge|neq|approx|times|cdot|frac|sqrt|mu|alpha|beta|gamma|theta)\b)/;
export const GENERIC_HTML_BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'body',
  'caption',
  'center',
  'colgroup',
  'dd',
  'details',
  'dialog',
  'dir',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'frame',
  'frameset',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'html',
  'iframe',
  'legend',
  'li',
  'main',
  'menu',
  'menuitem',
  'nav',
  'ol',
  'optgroup',
  'option',
  'p',
  'search',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

export type MathBlockFenceStyle = 'dollar' | 'bracket' | 'dollar-inline' | 'bracket-inline';

export interface MathBlockFenceReference {
  closeFenceLength?: number;
  latex: string;
  openFenceLength?: number;
  style: MathBlockFenceStyle;
}

export interface MathBlockFenceReferenceIndex {
  byLatex: Map<string, number[]>;
  normalizedLatexes: string[];
}

export interface DollarMathFenceMatch {
  closeFenceLength: number;
  closePrefix: string;
  prefix: string;
  contentPrefix: string;
  closeIndex: number;
  openFenceLength: number;
}

export interface MarkdownFenceLine {
  blockquoteDepth: number;
  containerIndent: number;
  infoStart: number;
  length: number;
  marker: string;
}

export interface GenericHtmlSpacingFenceState {
  blockquoteDepth: number;
  containerIndent: number;
  length: number;
  marker: string;
}
