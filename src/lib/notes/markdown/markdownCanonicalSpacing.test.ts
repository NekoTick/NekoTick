import { describe, expect, it } from 'vitest';
import {
  normalizeCanonicalMarkdownSpacingForPaste,
  normalizeCanonicalMarkdownSpacingForPersistence,
} from './markdownCanonicalSpacing';

describe('markdown canonical spacing', () => {
  it('keeps adjacent list items inside emoji callouts unchanged during persistence', () => {
    const markdown = ['> 💡 Callout', '>', '> - First', '> - Second'].join('\n');

    expect(normalizeCanonicalMarkdownSpacingForPersistence(markdown)).toBe(markdown);
  });

  it('spreads adjacent list items inside emoji callouts for paste normalization', () => {
    expect(
      normalizeCanonicalMarkdownSpacingForPaste(
        ['> 💡 Callout', '>', '> - First', '> - Second'].join('\n')
      )
    ).toBe(['> 💡 Callout', '>', '> - First', '>', '> - Second'].join('\n'));
  });

  it('does not treat text-presentation symbol blockquotes as callouts', () => {
    expect(
      normalizeCanonicalMarkdownSpacingForPaste(
        ['> © Copyright', '>', '> - First', '> - Second', '', '> ™ Trademark'].join('\n')
      )
    ).toBe(['> © Copyright', '>', '> - First', '> - Second', '', '> ™ Trademark'].join('\n'));
  });

  it('does not canonicalize thematic breaks during persistence', () => {
    const markdown = [' ***', 'url: http\\://example.test', ' ***', '', 'Body'].join('\n');

    expect(normalizeCanonicalMarkdownSpacingForPersistence(markdown)).toBe(markdown);
  });

  it('does not canonicalize leading thematic breaks into frontmatter openers during paste normalization', () => {
    expect(
      normalizeCanonicalMarkdownSpacingForPaste(
        [' ***', 'url: http\\://example.test', ' ***', '', 'Body'].join('\n')
      )
    ).toBe([' ***', 'url: http\\://example.test', '---', '', 'Body'].join('\n'));
  });

  it('removes serializer-only spacing before deeply nested list items', () => {
    const serialized = [
      '- root',
      '  - child',
      '',
      '    - grandchild',
    ].join('\n');

    expect(normalizeCanonicalMarkdownSpacingForPersistence(serialized)).toBe([
      '- root',
      '  - child',
      '    - grandchild',
    ].join('\n'));
  });

  it('removes serializer-only blockquote spacing before nested list items', () => {
    const serialized = [
      '> 1. parent',
      '>',
      '>    1. child',
    ].join('\n');

    expect(normalizeCanonicalMarkdownSpacingForPersistence(serialized)).toBe([
      '> 1. parent',
      '>    1. child',
    ].join('\n'));
  });

  it('keeps blank lines inside list-like indented code', () => {
    const markdown = [
      'Paragraph',
      '',
      '    - code one',
      '',
      '    - code two',
    ].join('\n');

    expect(normalizeCanonicalMarkdownSpacingForPersistence(markdown)).toBe(markdown);
  });

  it('canonicalizes thematic breaks after leading frontmatter during paste normalization', () => {
    expect(
      normalizeCanonicalMarkdownSpacingForPaste(
        ['---', 'title: Demo', '---', '', '***', '', 'Body'].join('\n')
      )
    ).toBe(['---', 'title: Demo', '---', '', '---', '', 'Body'].join('\n'));
  });
});
