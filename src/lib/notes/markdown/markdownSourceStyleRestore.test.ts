import { describe, expect, it } from 'vitest';

import { restoreAutolinkStyleFromReference } from './markdownAutolinkStyle';
import { restoreBlockquoteMarkerSpacingFromReference } from './markdownBlockquoteMarkerSpacing';
import { restoreUnrequestedMarkdownEscapesFromReference } from './markdownEscapeStyle';
import { restoreFenceMarkerStyleFromReference } from './markdownFenceMarkerStyle';
import { restoreHardBreakStyleFromReference } from './markdownHardBreakStyle';
import { restoreSetextHeadingStyleFromReference } from './markdownHeadingMarkerStyle';
import { restoreListMarkerStyleFromReference } from './markdownListMarkerStyle';
import { restoreReferenceLinkStyleFromReference } from './markdownReferenceLinkStyle';
import { restoreThematicBreakMarkerStyleFromReference } from './markdownThematicBreakMarkerStyle';

describe('markdown source style restoration after a leading thematic break', () => {
  it('restores a setext heading', () => {
    const reference = ['---', 'Setext heading', '--------------'].join('\n');
    const serialized = ['---', '## Setext heading'].join('\n');

    expect(restoreSetextHeadingStyleFromReference(serialized, reference)).toBe(reference);
  });

  it('keeps equivalent ATX and setext heading occurrences in source order', () => {
    const reference = [
      '## Same heading',
      '',
      'Same heading',
      '------------',
    ].join('\n');
    const serialized = ['## Same heading', '', '## Same heading'].join('\n');

    expect(restoreSetextHeadingStyleFromReference(serialized, reference)).toBe(reference);
  });

  it('does not consume a setext heading style inside an earlier fenced code block', () => {
    const reference = [
      '```md',
      '## Same heading',
      '```',
      '',
      'Same heading',
      '------------',
    ].join('\n');
    const serialized = [
      '```md',
      '## Same heading',
      '```',
      '',
      '## Same heading',
    ].join('\n');

    expect(restoreSetextHeadingStyleFromReference(serialized, reference)).toBe(reference);
  });

  it('restores an outer fence without treating quote-prefixed fence content as its close', () => {
    const reference = ['~~~~md', '> ~~~~', 'inside', '~~~~'].join('\n');
    const serialized = ['```md', '> ~~~~', 'inside', '```'].join('\n');

    expect(restoreFenceMarkerStyleFromReference(serialized, reference)).toBe(reference);
  });

  it('does not consume heading source styles from raw HTML blocks', () => {
    const reference = [
      '<pre>',
      'Same heading',
      '===',
      '</pre>',
      '',
      '# Same heading #',
    ].join('\n');
    const serialized = [
      '<pre>',
      'Same heading',
      '===',
      '</pre>',
      '',
      '# Same heading',
    ].join('\n');

    expect(restoreSetextHeadingStyleFromReference(serialized, reference)).toBe(reference);
  });

  it('restores list and blockquote markers', () => {
    expect(restoreListMarkerStyleFromReference('---\n- Bullet', '---\n+ Bullet'))
      .toBe('---\n+ Bullet');
    expect(restoreBlockquoteMarkerSpacingFromReference('---\n> Quote', '---\n>Quote'))
      .toBe('---\n>Quote');
  });

  it('restores a thematic break after a fence with quote-prefixed fence content', () => {
    const reference = ['```md', '> ```', '***', '```', '___'].join('\n');
    const serialized = ['```md', '> ```', '***', '```', '---'].join('\n');

    expect(restoreThematicBreakMarkerStyleFromReference(serialized, reference)).toBe(reference);
  });

  it.each([
    {
      block: 'fenced code',
      body: ['* ```ts', '  code', '  ```'],
      referenceBody: ['- ```ts', '  code', '  ```'],
    },
    {
      block: 'display math',
      body: ['* $$', '  x + y', '  $$'],
      referenceBody: ['- $$', '  x + y', '  $$'],
    },
    {
      block: 'raw HTML',
      body: ['* <textarea>', '  raw', '  </textarea>'],
      referenceBody: ['- <textarea>', '  raw', '  </textarea>'],
    },
  ])('restores list markers on protected $block openers', ({ body, referenceBody }) => {
    const prefix = ['* Parent', '  * Nested'];
    expect(
      restoreListMarkerStyleFromReference(
        [...prefix, ...body].join('\n'),
        [...prefix, ...referenceBody].join('\n'),
      )
    ).toBe([...prefix, ...referenceBody].join('\n'));
  });

  it('does not restore list-like math openers inside fenced code', () => {
    const serialized = ['```md', '- $$', '```', '', '* $$', '  x', '  $$'].join('\n');
    const reference = ['```md', '+ $$', '```', '', '- $$', '  x', '  $$'].join('\n');

    expect(restoreListMarkerStyleFromReference(serialized, reference)).toBe([
      '```md',
      '- $$',
      '```',
      '',
      '- $$',
      '  x',
      '  $$',
    ].join('\n'));
  });

  it('keeps equivalent spaced and compact blockquote occurrences in source order', () => {
    const reference = ['> Same quote', '', '>Same quote'].join('\n');
    const serialized = ['> Same quote', '', '> Same quote'].join('\n');

    expect(restoreBlockquoteMarkerSpacingFromReference(serialized, reference)).toBe(reference);
  });

  it('restores autolink and reference-link syntax', () => {
    expect(restoreAutolinkStyleFromReference(
      '---\nhttps://example.test/docs',
      '---\n<https://example.test/docs>',
    )).toBe('---\n<https://example.test/docs>');

    const reference = [
      '---',
      'Read [Docs][docs].',
      '[docs]: https://example.test/docs',
    ].join('\n');
    expect(restoreReferenceLinkStyleFromReference(
      '---\nRead [Docs](https://example.test/docs).',
      reference,
    )).toBe(reference);
  });

  it('restores the correct autolink occurrence beside an equivalent plain URL', () => {
    const reference = 'Plain https://example.test/docs then <https://example.test/docs>.';
    const serialized = 'Plain https://example.test/docs then https://example.test/docs.';

    expect(restoreAutolinkStyleFromReference(serialized, reference)).toBe(reference);
  });

  it('does not restore autolinks or reference links inside raw HTML blocks', () => {
    const reference = [
      '<pre>',
      'https://example.test/docs',
      '[Docs](https://example.test/docs)',
      '</pre>',
      '',
      '<https://example.test/docs>',
      'Read [Docs][docs].',
      '',
      '[docs]: https://example.test/docs',
    ].join('\n');
    const serialized = [
      '<pre>',
      'https://example.test/docs',
      '[Docs](https://example.test/docs)',
      '</pre>',
      '',
      'https://example.test/docs',
      'Read [Docs](https://example.test/docs).',
    ].join('\n');

    const withAutolink = restoreAutolinkStyleFromReference(serialized, reference);
    expect(restoreReferenceLinkStyleFromReference(withAutolink, reference)).toBe(reference);
  });

  it('restores mixed thematic break markers by source order', () => {
    const reference = ['---', '***'].join('\n');
    const serialized = ['---', '---'].join('\n');

    expect(restoreThematicBreakMarkerStyleFromReference(serialized, reference)).toBe(reference);
  });

  it('restores a thematic break that serializes like a setext underline', () => {
    const reference = ['See [[Project|alias]].', '***'].join('\n');
    const serialized = ['See [[Project|alias]].', '---'].join('\n');

    expect(restoreThematicBreakMarkerStyleFromReference(serialized, reference)).toBe(reference);
  });

  it('does not count a setext underline as a thematic break', () => {
    const reference = [
      '***',
      'Image paragraph',
      '',
      '***',
      '',
      'Setext heading',
      '----------------',
    ].join('\n');
    const serialized = [
      '---',
      'Image paragraph',
      '',
      '---',
      '',
      '## Setext heading',
    ].join('\n');

    expect(restoreThematicBreakMarkerStyleFromReference(serialized, reference)).toBe([
      '***',
      'Image paragraph',
      '',
      '***',
      '',
      '## Setext heading',
    ].join('\n'));
  });

  it('restores a thematic break immediately after a TOC block', () => {
    const reference = ['[TOC]', '___'].join('\n');
    const serialized = ['[TOC]', '---'].join('\n');

    expect(restoreThematicBreakMarkerStyleFromReference(serialized, reference)).toBe(reference);
  });

  it.each([
    ['footnote definition', '[^note]: Footnote body'],
    ['reference definition', '[docs]: https://example.test/docs'],
    ['abbreviation definition', '*[API]: Application Interface'],
    ['definition-list marker', ': Definition body'],
    ['table row', '| value | cell |'],
  ])('restores a thematic break immediately after a %s', (_name, predecessor) => {
    const reference = [predecessor, '___'].join('\n');
    const serialized = [predecessor, '---'].join('\n');

    expect(restoreThematicBreakMarkerStyleFromReference(serialized, reference)).toBe(reference);
  });

  it.each([
    {
      name: 'raw HTML',
      protectedLines: ['<pre>', '```', 'raw text', '</pre>'],
    },
    {
      name: 'display math',
      protectedLines: ['$$', '```', 'raw math text', '$$'],
    },
  ])('ignores unmatched fence text inside $name before a thematic break', ({ protectedLines }) => {
    const reference = [...protectedLines, '', '***'].join('\n');
    const serialized = [...protectedLines, '', '---'].join('\n');

    expect(restoreThematicBreakMarkerStyleFromReference(serialized, reference)).toBe(reference);
  });

  it('uses the serialized frontmatter range when hidden metadata is restored', () => {
    const reference = [
      '---',
      'title: Demo',
      'vlaina_cover: "@biva/1"',
      '---',
      '***',
    ].join('\n');
    const serialized = [
      '---',
      'title: Demo',
      'vlaina_cover: "@biva/1"',
      '---',
      '---',
    ].join('\n');

    expect(restoreThematicBreakMarkerStyleFromReference(serialized, reference)).toBe([
      '---',
      'title: Demo',
      'vlaina_cover: "@biva/1"',
      '---',
      '***',
    ].join('\n'));
  });
});

describe('fenced code source style restoration', () => {
  it.each([1, 2])(
    'restores %s structural blank line(s) after contextual indented code',
    (blankLineCount) => {
      const reference = [
        'Term HTML',
        ': <textarea>',
        '  nested definition raw HTML',
        '  </textarea>',
        '',
        '    indented code',
        ...Array.from({ length: blankLineCount }, () => ''),
        '![Image](image.png)',
      ].join('\n');
      const serialized = [
        'Term HTML',
        ': <textarea>',
        '  nested definition raw HTML',
        '  </textarea>',
        '',
        '```',
        'indented code',
        '```',
        ...Array.from({ length: Math.max(0, blankLineCount - 1) }, () => ''),
        '![Image](image.png)',
      ].join('\n');

      expect(restoreFenceMarkerStyleFromReference(serialized, reference)).toBe(reference);
    },
  );

  it('restores indented and labelled fences with the same body by source order', () => {
    const serialized = [
      '```',
      'const value = 1;',
      '```',
      '',
      '```ts',
      'const value = 1;',
      '```',
    ].join('\n');
    const reference = [
      '    const value = 1;',
      '',
      '~~~~ts',
      'const value = 1;',
      '~~~~',
    ].join('\n');

    expect(restoreFenceMarkerStyleFromReference(serialized, reference)).toBe(reference);
  });

  it.each([
    {
      name: 'indented code before the fence',
      reference: ['    duplicate', '', '~~~~', 'duplicate', '~~~~'].join('\n'),
    },
    {
      name: 'indented code after the fence',
      reference: ['~~~~', 'duplicate', '~~~~', '', '    duplicate'].join('\n'),
    },
  ])('restores unlabelled duplicate blocks with $name', ({ reference }) => {
    const serialized = [
      '```',
      'duplicate',
      '```',
      '',
      '```',
      'duplicate',
      '```',
    ].join('\n');
    expect(restoreFenceMarkerStyleFromReference(serialized, reference)).toBe(reference);
  });

  it.each([
    {
      name: 'raw HTML',
      protectedLines: ['<pre>', '```', 'raw text', '</pre>'],
    },
    {
      name: 'display math',
      protectedLines: ['$$', '```', 'raw math text', '$$'],
    },
  ])('ignores unmatched fence text inside $name before a real code block', ({ protectedLines }) => {
    const reference = [
      ...protectedLines,
      '',
      '~~~~text',
      'actual code',
      '~~~~',
    ].join('\n');
    const serialized = [
      ...protectedLines,
      '',
      '```text',
      'actual code',
      '```',
    ].join('\n');

    expect(restoreFenceMarkerStyleFromReference(serialized, reference)).toBe(reference);
  });
});

describe('hard break source style restoration', () => {
  it('restores exact two-space and multi-space hard break markers', () => {
    const serialized = ['Alpha\\', 'Beta', '', '> Quote\\', '> Continued'].join('\n');
    const reference = ['Alpha  ', 'Beta', '', '> Quote   ', '> Continued'].join('\n');

    expect(restoreHardBreakStyleFromReference(serialized, reference)).toBe(reference);
  });

  it('restores odd backslash runs without touching protected blocks', () => {
    const serialized = [
      'Alpha\\\\\\',
      'Beta',
      '',
      '```text',
      'Code  ',
      'Next',
      '```',
    ].join('\n');
    const reference = [
      'Alpha\\',
      'Beta',
      '',
      '```text',
      'Code  ',
      'Next',
      '```',
    ].join('\n');

    expect(restoreHardBreakStyleFromReference(serialized, reference)).toBe(reference);
  });
});

describe('markdown escape source style restoration', () => {
  it('restores a source line when serialization doubles backslashes before HTML entities', () => {
    const reference = String.raw`<img src='image.png?a=1\\&amp;b=2' alt='A \\&quot;quote\\&quot;' />`;
    const serialized = String.raw`<img src='image.png?a=1\\\\\&amp;b=2' alt='A \\\\\&quot;quote\\\\\&quot;' />`;

    expect(restoreUnrequestedMarkdownEscapesFromReference(serialized, reference)).toBe(reference);
  });

  it('does not restore doubled backslashes when other source text changed', () => {
    const reference = String.raw`before\\after`;
    const serialized = String.raw`changed\\\\after`;

    expect(restoreUnrequestedMarkdownEscapesFromReference(serialized, reference)).toBe(serialized);
  });
});
