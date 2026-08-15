import { describe, expect, it } from 'vitest';
import {
  normalizeEditorStateMarkdownDocument,
  normalizeSerializedMarkdownDocument,
} from './markdownSerializationUtils';
import { normalizeInternalMarkdownBlankLineComments } from './markdownSerializationInternalBlankComments';
import { LIST_GAP_SENTINEL } from './markdownSerializationShared';
import { preserveMarkdownBlankLinesForEditor } from './markdownEditorBlankLines';

describe('markdown internal artifact protection', () => {
  it.each([
    '<!--vlaina-markdown-blank-line-->',
    '<!--VLAINA-MARKDOWN-TIGHT-HEADING-->',
    '<!--vlaina-rendered-html-boundary-blank-line-->',
    '> <!--vlaina-markdown-blank-line-->',
  ])('preserves the user-authored standalone comment %s in note state', (comment) => {
    const markdown = ['Before', comment, 'After'].join('\n');

    expect(normalizeEditorStateMarkdownDocument(markdown)).toBe(markdown);
  });

  it('round-trips user-authored internal-like comments through editor placeholders', () => {
    const markdown = [
      'Before',
      '<!--vlaina-markdown-blank-line-->',
      '<!--vlaina-markdown-tight-heading-->',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      '<!--vlaina-user-authored-internal-comment:literal-->',
      'After',
    ].join('\n');

    expect(
      normalizeSerializedMarkdownDocument(preserveMarkdownBlankLinesForEditor(markdown))
    ).toBe(markdown);
  });

  it.each([
    ['dollar math', ['$$', '<!--vlaina-markdown-blank-line-->', '$$'].join('\n')],
    ['bracket math', ['\\[', '<!--vlaina-markdown-tight-heading-->', '\\]'].join('\n')],
    ['blockquote math', [
      '> $$',
      '> <!--vlaina-rendered-html-boundary-blank-line-->',
      '> $$',
    ].join('\n')],
    ['nested-list math', [
      '- Parent',
      '  - $$',
      '    <!--vlaina-markdown-blank-line-->',
      '    $$',
    ].join('\n')],
  ])('preserves a user-authored reserved comment inside %s', (_label, markdown) => {
    expect(normalizeEditorStateMarkdownDocument(markdown)).toBe(markdown);
    expect(
      normalizeSerializedMarkdownDocument(preserveMarkdownBlankLinesForEditor(markdown))
    ).toBe(markdown);
  });

  it('removes editor blank-line comments outside protected content', () => {
    expect(
      normalizeSerializedMarkdownDocument(['A', '<!--vlaina-markdown-blank-line-->', 'B'].join('\n'))
    ).toBe(['A', '', 'B'].join('\n'));
  });

  it.each([
    ['paragraph before thematic break', ['Body', '<!--vlaina-markdown-blank-line-->', '', '---']],
    ['image before paragraph', ['![alt](image.png)', '<!--vlaina-markdown-blank-line-->', '', 'Body']],
    ['definition before paragraph', ['Term', '', ': Definition', '<!--vlaina-markdown-blank-line-->', '', 'Body']],
  ])('keeps the structural separator plus an authored blank for %s', (_, serializedLines) => {
    const expectedLines = [...serializedLines];
    expectedLines[serializedLines.indexOf('<!--vlaina-markdown-blank-line-->')] = '';

    expect(normalizeSerializedMarkdownDocument(serializedLines.join('\n'))).toBe(
      expectedLines.join('\n')
    );
  });

  it.each([
    ['root dollar math', ['$$x = y$$', '<!--vlaina-markdown-blank-line-->', '![alt](image.png)']],
    ['ordered-list dollar math', ['7. $$x = y$$', '<!--vlaina-markdown-blank-line-->', '![alt](image.png)']],
    ['bullet-list bracket math', ['- \\[x = y\\]', '<!--vlaina-markdown-blank-line-->', '[TOC]']],
  ])('restores one authored blank after %s without adding a structural duplicate', (_, serializedLines) => {
    const expectedLines = [...serializedLines];
    expectedLines[serializedLines.indexOf('<!--vlaina-markdown-blank-line-->')] = '';

    expect(normalizeSerializedMarkdownDocument(serializedLines.join('\n'))).toBe(
      expectedLines.join('\n')
    );
  });

  it.each([
    ['root fenced code', ['```ts', 'code', '```']],
    ['list-first fenced code', ['- ```ts', '  code', '  ```']],
    ['ordered-list-first fenced code', ['7. ```ts', '   code', '   ```']],
  ])('removes editor blank-line comments after %s closes', (_, blockLines) => {
    const serialized = [
      ...blockLines,
      '<!--vlaina-markdown-blank-line-->',
      '***',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(serialized)).toBe([
      ...blockLines,
      '',
      '***',
    ].join('\n'));
  });

  it.each([
    ['dollar', ['- $$', '  x + y', '  $$']],
    ['bracket', ['- \\[', '  x + y', '  \\]']],
  ])('removes editor blank-line comments after list-contained %s math closes', (_, blockLines) => {
    const serialized = [
      ...blockLines,
      '<!--vlaina-markdown-blank-line-->',
      '[TOC]',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(serialized)).toBe([
      ...blockLines,
      '',
      '[TOC]',
    ].join('\n'));
  });

  it.each([
    ['task', '- [ ] Task\n- [x] Done'],
    ['ordered', '1. Ordered\n2. Continued'],
  ])('preserves a blank line from a nested bullet list to a %s list', (_, nextList) => {
    const serialized = [
      '* Bullet',
      '  * Nested',
      '<!--vlaina-markdown-blank-line-->',
      nextList,
    ].join('\n');
    const withSentinel = [
      '* Bullet',
      '  * Nested',
      LIST_GAP_SENTINEL,
      nextList,
    ].join('\n');
    const expected = [
      '* Bullet',
      '  * Nested',
      '',
      nextList,
    ].join('\n');

    expect(normalizeInternalMarkdownBlankLineComments(serialized)).toBe(withSentinel);
    expect(normalizeSerializedMarkdownDocument(serialized)).toBe(expected);
  });

  it('removes editor-generated rendered HTML boundary helper comments from serialized editor output', () => {
    const markdown = [
      '<img src="./assets/demo.svg" alt="Demo" />',
      '',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      'After image.',
    ].join('\n');
    const expected = [
      '<img src="./assets/demo.svg" alt="Demo" />',
      '',
      'After image.',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(expected);
    expect(normalizeEditorStateMarkdownDocument(markdown)).toBe(markdown);
  });

  it('restores one blank line for each rendered HTML boundary helper', () => {
    const helper = '<!--vlaina-rendered-html-boundary-blank-line-->';
    const serialized = ['<div>Raw</div>', '', helper, '', helper, '<!-- User comment -->'].join('\n');

    expect(normalizeSerializedMarkdownDocument(serialized)).toBe([
      '<div>Raw</div>',
      '',
      '',
      '<!-- User comment -->',
    ].join('\n'));
  });

  it('removes rendered HTML boundary helpers after serializer-escaped closing tags', () => {
    const serialized = [
      '<div>',
      'Alpha',
      '',
      'Beta',
      '',
      '\\</div>',
      '',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      '',
      'After',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(serialized)).toBe([
      '<div>',
      'Alpha',
      '',
      'Beta',
      '</div>',
      '',
      'After',
    ].join('\n'));
  });

  it('removes rendered HTML boundary helpers after raw HTML with fence-like text', () => {
    const serialized = [
      '- <textarea>',
      '  - protected html marker',
      '  ```not-a-fence',
      '  </textarea>',
      '',
      '<div>Raw HTML</div>',
      '',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      '7) Ordered',
      '8) Continued',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(serialized)).toBe([
      '- <textarea>',
      '  - protected html marker',
      '  ```not-a-fence',
      '  </textarea>',
      '',
      '<div>Raw HTML</div>',
      '',
      '7) Ordered',
      '8) Continued',
    ].join('\n'));
  });

  it('preserves user-authored rendered HTML boundary comments outside helper positions', () => {
    const markdown = [
      'Before',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      'After',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
    expect(normalizeEditorStateMarkdownDocument(markdown)).toBe(markdown);
  });

  it('removes case-insensitive internal artifact comments outside protected content', () => {
    expect(
      normalizeSerializedMarkdownDocument(['A', '<!--VLAINA-MARKDOWN-BLANK-LINE-->', 'B'].join('\n'))
    ).toBe(['A', '', 'B'].join('\n'));
    expect(
      normalizeSerializedMarkdownDocument([
        '<img src="./assets/demo.svg" alt="Demo" />',
        '',
        '<!--VLAINA-RENDERED-HTML-BOUNDARY-BLANK-LINE-->',
        'After image.',
      ].join('\n'))
    ).toBe([
      '<img src="./assets/demo.svg" alt="Demo" />',
      '',
      'After image.',
    ].join('\n'));
    expect(
      normalizeSerializedMarkdownDocument(['# Alpha', '', '<!--VLAINA-MARKDOWN-TIGHT-HEADING-->', '', '## Beta'].join('\n'))
    ).toBe(['# Alpha', '## Beta'].join('\n'));
  });

  it('removes editor tight-heading comments outside protected content', () => {
    expect(
      normalizeSerializedMarkdownDocument(['# Alpha', '', '<!--vlaina-markdown-tight-heading-->', '', '## Beta'].join('\n'))
    ).toBe(['# Alpha', '## Beta'].join('\n'));
  });

  it('preserves internal artifact-like text inside fenced code', () => {
    const markdown = [
      '```html',
      '<!--vlaina-markdown-blank-line-->',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      '<!--vlaina-markdown-tight-heading-->',
      '<br data-vlaina-empty-line="true" />',
      '��VLAINA_LIST_GAP_SENTINEL��',
      '��VLAINA_USER_BR_SENTINEL��',
      '\u0000VLAINA_USER_BR_SENTINEL\u0000',
      '\u2800',
      '```',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('cleans leaked editor artifact comments inside display math blocks', () => {
    expect(
      normalizeSerializedMarkdownDocument([
        '$$',
        '<!--vlaina-markdown-blank-line-->',
        'hi',
        '<!--vlaina-markdown-blank-line-->',
        '$$',
      ].join('\n'))
    ).toBe(['$$', 'hi', '$$'].join('\n'));

    expect(
      normalizeSerializedMarkdownDocument([
        '$$',
        'a = b',
        '<!--vlaina-markdown-blank-line-->',
        'c = d',
        '$$',
      ].join('\n'))
    ).toBe(['$$', 'a = b', '', 'c = d', '$$'].join('\n'));

    expect(
      normalizeSerializedMarkdownDocument([
        '\\[',
        '<!--vlaina-rendered-html-boundary-blank-line-->',
        'x',
        '<!--vlaina-markdown-tight-heading-->',
        '\\]',
      ].join('\n'))
    ).toBe(['\\[', 'x', '\\]'].join('\n'));
  });

  it('preserves list gap placeholders inside longer fenced code blocks', () => {
    const markdown = [
      '````markdown',
      '```',
      '- before',
      '- \u2800',
      '- after',
      '````',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('preserves internal artifact-like text inside long-marker fenced code blocks', () => {
    const marker = '`'.repeat(20_000);
    const markdown = [
      `${marker}markdown`,
      '<!--vlaina-markdown-blank-line-->',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      '- \u2800',
      marker,
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('preserves internal artifact-like text inside leading frontmatter', () => {
    const markdown = [
      '---',
      'description: "<!--vlaina-markdown-blank-line-->"',
      'htmlBoundary: "<!--vlaina-rendered-html-boundary-blank-line-->"',
      'gap: "\u2800"',
      'literal: "��VLAINA_LIST_GAP_SENTINEL��"',
      '---',
      '',
      'Body',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('does not add rendered HTML boundary helpers inside fenced frontmatter content', () => {
    const markdown = [
      '````yaml-frontmatter vlaina-internal-frontmatter',
      'body: |',
      '  ```md',
      '  <span>First</span>',
      '',
      '  <span>Second</span>',
      '  ```',
      '````',
      '# Heading',
    ].join('\n');

    expect(preserveMarkdownBlankLinesForEditor(markdown)).toBe(markdown);
  });

  it('preserves internal artifact-like comments inside multiline html comments', () => {
    const blankLineComment = [
      '<!--',
      '<!--vlaina-markdown-blank-line-->',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      '',
      'Body',
    ].join('\n');
    const tightHeadingComment = [
      '<!--',
      '<!--vlaina-markdown-tight-heading-->',
      '',
      'Body',
    ].join('\n');
    const explicitCloseComment = [
      '<!--',
      '<!--vlaina-markdown-tight-heading',
      '-->',
      '',
      'Body',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(blankLineComment)).toBe(blankLineComment);
    expect(normalizeSerializedMarkdownDocument(tightHeadingComment)).toBe(tightHeadingComment);
    expect(normalizeSerializedMarkdownDocument(explicitCloseComment)).toBe(explicitCloseComment);
  });

  it('preserves internal artifact-like text inside raw html blocks', () => {
    const markdown = [
      '<pre>',
      '<!--vlaina-markdown-blank-line-->',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      '<br data-vlaina-empty-line="true" />',
      '��VLAINA_USER_BR_SENTINEL��',
      '</pre>',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('preserves internal artifact-like text after raw html close-tag text in comments', () => {
    const markdown = [
      '<svg>',
      '<!-- </svg> -->',
      '<![CDATA[</svg>]]>',
      '<br data-vlaina-empty-line="true" />',
      '��VLAINA_USER_BR_SENTINEL��',
      '</svg>',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('preserves internal artifact-like text inside source html blocks', () => {
    const markdown = [
      '<source srcset="images/a.webp 1x">',
      '<br data-vlaina-empty-line="true" />',
      '<!--vlaina-markdown-blank-line-->',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      '',
      'Body',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('preserves internal artifact-like text inside GFM type-7 HTML blocks', () => {
    const markdown = [
      '<custom-element>',
      '<!--vlaina-markdown-blank-line-->',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      '<br data-vlaina-empty-line="true" />',
      '��VLAINA_USER_BR_SENTINEL��',
      '</custom-element>',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('removes leaked internal sentinels outside protected content', () => {
    expect(
      normalizeSerializedMarkdownDocument(['A', '��VLAINA_LIST_GAP_SENTINEL��', 'B'].join('\n'))
    ).toBe(['A', '', 'B'].join('\n'));
    expect(
      normalizeSerializedMarkdownDocument(['A', '��VLAINA_USER_BR_SENTINEL��', 'B'].join('\n'))
    ).toBe(['A\\', 'B'].join('\n'));
  });
});
