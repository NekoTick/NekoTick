import { describe, expect, it } from 'vitest';

import { MAX_HTML_TAG_END_SCAN_CHARS } from '../markdown/markdownHtmlRanges';
import { extractNoteTagOccurrences, extractNoteTags } from './tags';

describe('note tags', () => {
  it('excludes tags from bounded leading frontmatter', () => {
    expect(extractNoteTags([
      '---',
      'tags: #hidden',
      '---',
      '',
      '#visible',
    ].join('\n'))).toEqual(['visible']);
  });

  it('excludes tags from bounded leading frontmatter after a UTF-8 BOM', () => {
    expect(extractNoteTags([
      '\uFEFF---',
      'tags: #hidden',
      '---',
      '',
      '#visible',
    ].join('\n'))).toEqual(['visible']);
  });

  it('does not truncate oversized tag tokens into sidebar tags', () => {
    expect(extractNoteTags(`#${'a'.repeat(129)} #valid`)).toEqual(['valid']);
  });

  it('does not extract escaped markdown hash tags', () => {
    expect(extractNoteTags(String.raw`\#escaped #visible`)).toEqual(['visible']);
  });

  it('counts tag match ordinals case-insensitively without indexing excluded tags', () => {
    expect(extractNoteTagOccurrences('`#Topic` #topic #Topic')).toEqual([
      expect.objectContaining({ tag: 'topic', token: '#topic', matchOrdinal: 1 }),
      expect.objectContaining({ tag: 'topic', token: '#Topic', matchOrdinal: 2 }),
    ]);
  });

  it('excludes fenced code blocks and resumes after the closing fence', () => {
    expect(extractNoteTags([
      '```ts',
      '#hidden',
      '```',
      '#visible',
      '~~~',
      '#also-hidden',
      '~~~',
      '#after',
    ].join('\n'))).toEqual(['visible', 'after']);
  });

  it.each([
    ['list', ['- ```md', '  #hidden', '  ```', '#visible']],
    ['ordered list', ['7. ```md', '   #hidden', '   ```', '#visible']],
    ['blockquote', ['> ```md', '> #hidden', '> ```', '#visible']],
  ])('excludes tags from %s-contained fenced code', (_name, lines) => {
    expect(extractNoteTags(lines.join('\n'))).toEqual(['visible']);
  });

  it('resumes tag extraction after an unclosed list fence leaves its container', () => {
    expect(extractNoteTags([
      '- ```md',
      '  #hidden',
      '#visible',
    ].join('\n'))).toEqual(['visible']);
  });

  it('does not close a top-level fence on quote-prefixed fence content', () => {
    expect(extractNoteTags([
      '```md',
      '> ```',
      '#hidden',
      '```',
      '#visible',
    ].join('\n'))).toEqual(['visible']);
  });

  it('excludes tags from raw text and sanitizer-dropped HTML contents', () => {
    expect(extractNoteTags([
      '#visible',
      '<svg>',
      '#hidden-svg',
      '</svg>',
      '<math><mtext>#hidden-math</mtext></math>',
      '<noscript>#hidden-noscript</noscript>',
      '<plaintext>',
      '#hidden-plaintext',
      '#also-hidden',
    ].join('\n'))).toEqual(['visible']);
  });

  it('excludes tags from blockquote raw text and sanitizer-dropped HTML contents', () => {
    expect(extractNoteTags([
      '> <svg>',
      '> #hidden-svg',
      '> </svg>',
      '#visible',
    ].join('\n'))).toEqual(['visible']);
  });

  it('excludes tags from GFM HTML block contents until a blank line', () => {
    expect(extractNoteTags([
      '<div>',
      '#hidden-div',
      '</div>',
      '<source srcset="img:hero.webp 1x">',
      '#hidden-source',
      '<custom-element>',
      '#hidden-custom',
      '</custom-element>',
      '',
      '#visible',
    ].join('\n'))).toEqual(['visible']);
  });

  it('excludes tags from blockquote GFM HTML block contents until a blank line', () => {
    expect(extractNoteTags([
      '> <custom-element>',
      '> #hidden-custom',
      '> </custom-element>',
      '>',
      '#visible',
    ].join('\n'))).toEqual(['visible']);
  });

  it('excludes tags from non-tag GFM HTML block contents', () => {
    expect(extractNoteTags([
      '<![CDATA[',
      '#hidden-cdata',
      ']]>',
      '<?process #hidden-processing ?>',
      '<!DOCTYPE #hidden-declaration>',
      '#visible',
    ].join('\n'))).toEqual(['visible']);
  });

  it('excludes tags from inline HTML comments', () => {
    expect(extractNoteTags('text <!-- #hidden --> #visible')).toEqual(['visible']);
  });

  it('excludes inline code with long backtick marker runs without materializing the marker', () => {
    const marker = '`'.repeat(20_000);

    expect(extractNoteTags(`${marker}#hidden${marker} #visible`)).toEqual(['visible']);
  });

  it('excludes tags from overlong inline HTML tags while keeping later tags visible', () => {
    const badLine = `<span data-topic="#hidden ${'a'.repeat(MAX_HTML_TAG_END_SCAN_CHARS)}`;
    const content = `${badLine}\n#visible`;

    expect(extractNoteTags(content)).toEqual(['visible']);
  });

  it('caps extracted tag occurrences from a single document', () => {
    const content = Array.from({ length: 2500 }, (_, index) => `#tag-${index}`).join(' ');

    expect(extractNoteTagOccurrences(content)).toHaveLength(2000);
  });

  it('caps excluded ranges while still extracting visible tags', () => {
    const hiddenInlineCode = Array.from(
      { length: 12_000 },
      (_, index) => `\`#hidden-${index}\``
    ).join(' ');

    expect(extractNoteTags(`${hiddenInlineCode} #visible`)).toContain('visible');
  });

  it('does not index tags after the excluded range budget is exhausted', () => {
    const hiddenInlineCode = Array.from(
      { length: 50_000 },
      () => '`hidden`'
    ).join(' ');
    const tags = extractNoteTags(`${hiddenInlineCode}\n\`\`\`\n#hidden-after-budget\n\`\`\`\n#also-hidden`);

    expect(tags).not.toContain('hidden-after-budget');
    expect(tags).not.toContain('also-hidden');
  });

  it('does not treat oversized leading frontmatter candidates as excluded ranges', () => {
    const content = [
      '---',
      '#visible',
      ...Array.from({ length: 2050 }, (_, index) => `line_${index}: value`),
      '---',
      '#after',
    ].join('\n');

    expect(extractNoteTags(content)).toEqual(['visible', 'after']);
  });

  it('bounds malformed markdown link scans while keeping later tags visible', () => {
    const malformedLinks = Array.from({ length: 400 }, () => '[').join('');
    const content = `${malformedLinks}\n[hidden](https://example.test/#fragment)\n#visible`;

    expect(extractNoteTags(content)).toEqual(['visible']);
  });
});
