export const HTML_INLINE_SOURCE_MARKUP_CLASS = 'md-html-source-markup';
export const HTML_INLINE_SOURCE_TAG_CLASS = 'md-html-source-tag';
export const HTML_INLINE_SOURCE_ATTRIBUTE_CLASS = 'md-html-source-attribute';
export const HTML_INLINE_SOURCE_STRING_CLASS = 'md-html-source-string';
export const HTML_INLINE_SOURCE_OPERATOR_CLASS = 'md-html-source-operator';

export type HtmlInlineSourceToken = {
  className: string;
  end: number;
  start: number;
};

export function collectHtmlInlineSourceTokens(text: string, start: number, end: number): HtmlInlineSourceToken[] {
  const value = text.slice(start, end);
  if (!value.endsWith('>')) return [];
  const openingMatch = /^<(\/?)\s*([A-Za-z][A-Za-z0-9:-]*)/.exec(value);
  if (!openingMatch) return [];

  const tokens: HtmlInlineSourceToken[] = [];
  const prefixLength = 1 + openingMatch[1].length;
  tokens.push({
    className: HTML_INLINE_SOURCE_MARKUP_CLASS,
    start,
    end: start + prefixLength,
  });
  const tagNameStart = start + prefixLength;
  tokens.push({
    className: HTML_INLINE_SOURCE_TAG_CLASS,
    start: tagNameStart,
    end: tagNameStart + openingMatch[2].length,
  });

  const tagBodyStart = tagNameStart + openingMatch[2].length;
  const tagBodyEnd = value.endsWith('/>') ? end - 2 : end - 1;
  if (tagBodyEnd > tagBodyStart) {
    const attributeSource = text.slice(tagBodyStart, tagBodyEnd);
    const attributePattern = /([A-Za-z_:][A-Za-z0-9:._-]*)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/g;
    let match: RegExpExecArray | null;
    while ((match = attributePattern.exec(attributeSource))) {
      const attributeStart = tagBodyStart + match.index;
      const attributeNameEnd = attributeStart + match[1].length;
      tokens.push({
        className: HTML_INLINE_SOURCE_ATTRIBUTE_CLASS,
        start: attributeStart,
        end: attributeNameEnd,
      });
      const operatorStart = attributeNameEnd + match[2].search(/\S/);
      tokens.push({
        className: HTML_INLINE_SOURCE_OPERATOR_CLASS,
        start: operatorStart,
        end: operatorStart + match[2].trim().length,
      });
      const valueStart = attributeStart + match[0].indexOf(match[3]);
      tokens.push({
        className: HTML_INLINE_SOURCE_STRING_CLASS,
        start: valueStart,
        end: valueStart + match[3].length,
      });
    }
  }

  tokens.push({
    className: HTML_INLINE_SOURCE_MARKUP_CLASS,
    start: end - (value.endsWith('/>') ? 2 : 1),
    end,
  });
  return tokens;
}
