import { describe, expect, it } from 'vitest';
import { mapMarkdownOutsideProtectedSegments } from './markdownProtectedBlocks';

describe('markdown protected blocks', () => {
  it('does not transform leading YAML frontmatter', () => {
    const markdown = [
      '---',
      'title: Alpha',
      'url: http\\://example.test',
      'items:',
      '  -苹果',
      '---',
      '',
      '-香蕉',
    ].join('\n');

    expect(
      mapMarkdownOutsideProtectedSegments(markdown, (segment) => segment.replace(/-/g, '*'))
    ).toBe([
      '---',
      'title: Alpha',
      'url: http\\://example.test',
      'items:',
      '  -苹果',
      '---',
      '',
      '*香蕉',
    ].join('\n'));
  });

  it('does not transform leading YAML frontmatter after a UTF-8 BOM', () => {
    const markdown = [
      '\uFEFF---',
      'title: Alpha',
      'items:',
      '  -苹果',
      '---',
      '',
      '-香蕉',
    ].join('\n');

    expect(
      mapMarkdownOutsideProtectedSegments(markdown, (segment) => segment.replace(/-/g, '*'))
    ).toBe([
      '\uFEFF---',
      'title: Alpha',
      'items:',
      '  -苹果',
      '---',
      '',
      '*香蕉',
    ].join('\n'));
  });

  it('treats unmatched leading frontmatter delimiters as normal markdown', () => {
    const markdown = ['---', 'Body'].join('\n');

    expect(
      mapMarkdownOutsideProtectedSegments(markdown, (segment) => segment.replace(/---/g, '***'))
    ).toBe(['***', 'Body'].join('\n'));
  });

  it('treats indented leading frontmatter-like delimiters as normal markdown', () => {
    const markdown = [
      ' ---',
      'title: Alpha',
      ' ---',
      '- Body',
    ].join('\n');

    expect(
      mapMarkdownOutsideProtectedSegments(markdown, (segment) => segment.replace(/-/g, '*'))
    ).toBe([
      ' ***',
      'title: Alpha',
      ' ***',
      '* Body',
    ].join('\n'));
  });

  it('does not transform fenced code blocks and resumes after the closing fence', () => {
    const markdown = [
      'Before - item',
      '```ts',
      'const value = "- hidden";',
      '````',
      'After - item',
    ].join('\n');

    expect(
      mapMarkdownOutsideProtectedSegments(markdown, (segment) => segment.replace(/-/g, '*'))
    ).toBe([
      'Before * item',
      '```ts',
      'const value = "- hidden";',
      '````',
      'After * item',
    ].join('\n'));
  });

  it.each([
    {
      name: 'blockquote fenced code',
      lines: ['> ```md', '> - hidden', '- visible'],
    },
    {
      name: 'list-contained fenced code',
      lines: ['- ```md', '  - hidden', '- visible'],
    },
    {
      name: 'blockquote display math',
      lines: ['> $$', '> - hidden', '- visible'],
    },
    {
      name: 'list-contained display math',
      lines: ['- \\[', '  - hidden', '- visible'],
    },
    {
      name: 'blockquote raw HTML',
      lines: ['> <textarea>', '> - hidden', '- visible'],
    },
    {
      name: 'list-contained raw HTML',
      lines: ['- <textarea>', '  - hidden', '- visible'],
    },
  ])('ends protection when an unclosed $name leaves its container', ({ lines }) => {
    expect(
      mapMarkdownOutsideProtectedSegments(lines.join('\n'), (segment) => segment.replace(/-/g, '*'))
    ).toBe([...lines.slice(0, -1), '* visible'].join('\n'));
  });

  it('does not close a top-level fence on a quote-prefixed fence-like content line', () => {
    const markdown = [
      '```md',
      '> ```',
      '- hidden',
      '```',
      '- visible',
    ].join('\n');

    expect(
      mapMarkdownOutsideProtectedSegments(markdown, (segment) => segment.replace(/-/g, '*'))
    ).toBe([
      '```md',
      '> ```',
      '- hidden',
      '```',
      '* visible',
    ].join('\n'));
  });

  it('does not close a dollar math block with a shorter fence', () => {
    const markdown = [
      'Before - visible',
      '$$$',
      '$$',
      'x - hidden',
      '$$$$',
      'After - visible',
    ].join('\n');

    expect(
      mapMarkdownOutsideProtectedSegments(markdown, (segment) => segment.replace(/-/g, '*'))
    ).toBe([
      'Before * visible',
      '$$$',
      '$$',
      'x - hidden',
      '$$$$',
      'After * visible',
    ].join('\n'));
  });

  it.each([
    {
      close: '  $$',
      content: '  x - hidden',
      open: '- $$',
    },
    {
      close: '   $$',
      content: '   x - hidden',
      open: '7. $$',
    },
    {
      close: '>   $$',
      content: '>   x - hidden',
      open: '> - $$',
    },
    {
      close: '  \\]',
      content: '  x - hidden',
      open: '- \\[',
    },
  ])('protects list-contained math from $open and resumes after its close', ({ close, content, open }) => {
    const markdown = [
      'Before - visible',
      open,
      content,
      close,
      'After - visible',
    ].join('\n');

    expect(
      mapMarkdownOutsideProtectedSegments(markdown, (segment) => segment.replace(/-/g, '*'))
    ).toBe([
      'Before * visible',
      open,
      content,
      close,
      'After * visible',
    ].join('\n'));
  });

  it('transforms deeply nested list markers instead of protecting them as indented code', () => {
    const markdown = [
      '- root',
      '  - child',
      '',
      '    - grandchild',
    ].join('\n');

    expect(
      mapMarkdownOutsideProtectedSegments(markdown, (segment) => segment.replace(/-/g, '*'))
    ).toBe([
      '* root',
      '  * child',
      '',
      '    * grandchild',
    ].join('\n'));
  });

  it('keeps list-like lines inside actual indented code protected', () => {
    const markdown = [
      'Paragraph - visible',
      '',
      '    - code one',
      '',
      '    - code two',
      '',
      'Tail - visible',
    ].join('\n');

    expect(
      mapMarkdownOutsideProtectedSegments(markdown, (segment) => segment.replace(/-/g, '*'))
    ).toBe([
      'Paragraph * visible',
      '',
      '    - code one',
      '',
      '    - code two',
      '',
      'Tail * visible',
    ].join('\n'));
  });

  it('protects fenced code blocks with long marker runs without materializing the marker', () => {
    const marker = '`'.repeat(20_000);
    const markdown = [
      'Before - item',
      `${marker}ts`,
      'const value = "- hidden";',
      marker,
      'After - item',
    ].join('\n');

    expect(
      mapMarkdownOutsideProtectedSegments(markdown, (segment) => segment.replace(/-/g, '*'))
    ).toBe([
      'Before * item',
      `${marker}ts`,
      'const value = "- hidden";',
      marker,
      'After * item',
    ].join('\n'));
  });

  it('protects raw text and sanitizer-dropped HTML block contents', () => {
    const markdown = [
      'Before - item',
      '<svg>',
      '- hidden',
      '</svg>',
      '<math>',
      '- hidden',
      '</math>',
      '<noscript>',
      '- hidden',
      '</noscript>',
      '<xmp>',
      '- hidden',
      '</xmp>',
      'After - item',
    ].join('\n');

    expect(
      mapMarkdownOutsideProtectedSegments(markdown, (segment) => segment.replace(/-/g, '*'))
    ).toBe([
      'Before * item',
      '<svg>',
      '- hidden',
      '</svg>',
      '<math>',
      '- hidden',
      '</math>',
      '<noscript>',
      '- hidden',
      '</noscript>',
      '<xmp>',
      '- hidden',
      '</xmp>',
      'After * item',
    ].join('\n'));
  });

  it.each([
    ['fenced code', '  ```not-a-fence'],
    ['dollar math', '  $$'],
    ['bracket math', '  \\['],
    ['indented code', '      indented text'],
  ])('does not start %s protection from transformed raw HTML contents', (_, nestedLine) => {
    const markdown = [
      '- <textarea>',
      nestedLine,
      '  </textarea>',
      'After - visible',
    ].join('\n');

    expect(
      mapMarkdownOutsideProtectedSegments(
        markdown,
        (segment) => segment.replace('After - visible', 'After * visible'),
        { protectHtmlBlocks: false },
      )
    ).toBe([
      '- <textarea>',
      nestedLine,
      '  </textarea>',
      'After * visible',
    ].join('\n'));
  });

  it('resumes transforms after raw HTML close tags with attributes or whitespace', () => {
    const markdown = [
      'Before - item',
      '<svg>',
      '- hidden',
      '</svg data-extra="ignored">',
      'After - item',
      '<math>',
      '- hidden',
      '</math >',
      'Done - item',
    ].join('\n');

    expect(
      mapMarkdownOutsideProtectedSegments(markdown, (segment) => segment.replace(/-/g, '*'))
    ).toBe([
      'Before * item',
      '<svg>',
      '- hidden',
      '</svg data-extra="ignored">',
      'After * item',
      '<math>',
      '- hidden',
      '</math >',
      'Done * item',
    ].join('\n'));
  });

  it('does not close raw HTML blocks on close-tag text inside non-tag HTML ranges', () => {
    const markdown = [
      'Before - item',
      '<svg>',
      '<!-- </svg> -->',
      '<![CDATA[</svg>]]>',
      '<!bogus </svg>>',
      '- hidden',
      '</svg>',
      'After - item',
    ].join('\n');

    expect(
      mapMarkdownOutsideProtectedSegments(markdown, (segment) => segment.replace(/-/g, '*'))
    ).toBe([
      'Before * item',
      '<svg>',
      '<!-- </svg> -->',
      '<![CDATA[</svg>]]>',
      '<!bogus </svg>>',
      '- hidden',
      '</svg>',
      'After * item',
    ].join('\n'));
  });

  it('protects plaintext HTML blocks through the document end', () => {
    const markdown = [
      'Before - item',
      '<plaintext>',
      '- hidden',
      '</plaintext>',
      'After - hidden',
    ].join('\n');

    expect(
      mapMarkdownOutsideProtectedSegments(markdown, (segment) => segment.replace(/-/g, '*'))
    ).toBe(markdown.replace('Before - item', 'Before * item'));
  });

  it('protects GFM source HTML blocks until a blank line', () => {
    const markdown = [
      'Before - item',
      '<source srcset="images/a.webp 1x">',
      '- hidden',
      '',
      'After - item',
    ].join('\n');

    expect(
      mapMarkdownOutsideProtectedSegments(markdown, (segment) => segment.replace(/-/g, '*'))
    ).toBe([
      'Before * item',
      '<source srcset="images/a.webp 1x">',
      '- hidden',
      '',
      'After * item',
    ].join('\n'));
  });

  it('protects GFM type-7 HTML block contents until a blank line', () => {
    const markdown = [
      'Before - item',
      '<custom-element>',
      '- hidden',
      '</custom-element>',
      'After - hidden',
    ].join('\n');

    expect(
      mapMarkdownOutsideProtectedSegments(markdown, (segment) => segment.replace(/-/g, '*'))
    ).toBe([
      'Before * item',
      '<custom-element>',
      '- hidden',
      '</custom-element>',
      'After - hidden',
    ].join('\n'));
  });

  it('treats oversized leading frontmatter candidates as normal markdown', () => {
    const markdown = [
      '---',
      ...Array.from({ length: 2050 }, (_, index) => `line_${index}: value`),
      '---',
      '- Item',
    ].join('\n');

    const expected = [
      '***',
      ...Array.from({ length: 2050 }, (_, index) => `line_${index}: value`),
      '***',
      '* Item',
    ].join('\n');

    expect(
      mapMarkdownOutsideProtectedSegments(markdown, (segment) => segment.replace(/-/g, '*'))
    ).toBe(expected);
  });
});
