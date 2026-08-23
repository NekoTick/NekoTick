import { describe, expect, it } from 'vitest';
import { collectHtmlInlineSourceTokens } from './htmlInlineSourceTokens';

describe('htmlInlineSourceTokens', () => {
  it('tokenizes tag markup, names, attributes, operators, and quoted values', () => {
    const source = '<span style="color: rgb(15, 118, 110)">';
    const tokens = collectHtmlInlineSourceTokens(source, 0, source.length);

    expect(tokens.map((token) => ({
      className: token.className,
      value: source.slice(token.start, token.end),
    }))).toEqual([
      { className: 'md-html-source-markup', value: '<' },
      { className: 'md-html-source-tag', value: 'span' },
      { className: 'md-html-source-attribute', value: 'style' },
      { className: 'md-html-source-operator', value: '=' },
      { className: 'md-html-source-string', value: '"color: rgb(15, 118, 110)"' },
      { className: 'md-html-source-markup', value: '>' },
    ]);
  });

  it('tokenizes closing and self-closing markup without accepting incomplete tags', () => {
    const closing = '</em>';
    const selfClosing = '<br />';

    expect(collectHtmlInlineSourceTokens(closing, 0, closing.length).map((token) => (
      closing.slice(token.start, token.end)
    ))).toEqual(['</', 'em', '>']);
    expect(collectHtmlInlineSourceTokens(selfClosing, 0, selfClosing.length).map((token) => (
      selfClosing.slice(token.start, token.end)
    ))).toEqual(['<', 'br', '/>']);
    expect(collectHtmlInlineSourceTokens('<em', 0, 3)).toEqual([]);
  });
});
