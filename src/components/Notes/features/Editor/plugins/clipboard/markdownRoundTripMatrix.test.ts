import { describe, it } from 'vitest';
import {
  expectStableMarkdownRoundTrip,
  expectStableMarkdownRoundTrips,
} from './markdownRoundTripTestUtils';

interface BoundaryBlock {
  expectedLines?: string[];
  lines: string[];
  name: string;
  requiresPairSeparator?: boolean;
  requiresSeparator?: boolean;
}

describe('markdown syntax persistence matrix', () => {
  it.each([
    {
      name: 'yaml frontmatter',
      markdown: ['---', 'title: Demo', 'tags:', '  - one', '---', '# Heading'].join('\n'),
    },
    {
      name: 'frontmatter with hidden app metadata',
      markdown: [
        '---',
        'title: Demo',
        'vlaina_cover: "@biva/1"',
        '---',
        '# Heading',
      ].join('\n'),
    },
    {
      name: 'leading yaml-frontmatter code fence',
      markdown: ['```yaml-frontmatter', 'title: Demo', '```', '# Heading'].join('\n'),
    },
    {
      name: 'math block and inline math',
      markdown: ['Inline math $x + y$.', '', '$$', '\\frac{1}{2}', '$$'].join('\n'),
    },
    {
      name: 'parenthesized inline math',
      markdown: 'Inline math \\(x + y\\).',
      expected: 'Inline math $x + y$.',
    },
    {
      name: 'same-line dollar display math',
      markdown: '$$x + y$$',
    },
    {
      name: 'same-line bracket display math',
      markdown: '\\[x + y\\]',
    },
    {
      name: 'math code fence canonicalizes to display math',
      markdown: ['```math', '\\frac{1}{2}', '```'].join('\n'),
      expected: ['$$', '\\frac{1}{2}', '$$'].join('\n'),
    },
    {
      name: 'latex code fence remains source code',
      markdown: ['```latex', '\\documentclass{article}', '```'].join('\n'),
    },
    {
      name: 'standard bracket display math',
      markdown: ['Before math.', '', '\\[', 'f=\\mu mg', '\\]', '', 'After math.'].join('\n'),
    },
    {
      name: 'generated bracket-backslash display math',
      markdown: ['摩擦力大小为', '', '[\\', 'f=\\mu mg\\', ']', '', '故 A 在传送带上的加速度大小为'].join('\n'),
      expected: ['摩擦力大小为', '', '\\[', 'f=\\mu mg', '\\]', '', '故 A 在传送带上的加速度大小为'].join('\n'),
    },
    {
      name: 'generated bracket-only display math',
      markdown: ['摩擦力大小为', '', '[', 'f=\\mu mg', ']', '', '故 A 在传送带上的加速度大小为'].join('\n'),
      expected: ['摩擦力大小为', '', '\\[', 'f=\\mu mg', '\\]', '', '故 A 在传送带上的加速度大小为'].join('\n'),
    },
    {
      name: 'generated bracket-backslash display math with inline closer',
      markdown: ['摩擦力大小为', '', '[\\', 'a=\\frac{f}{m}=\\mu g]', '', '故 A 在传送带上的加速度大小为'].join('\n'),
      expected: ['摩擦力大小为', '', '\\[', 'a=\\frac{f}{m}=\\mu g', '\\]', '', '故 A 在传送带上的加速度大小为'].join('\n'),
    },
    {
      name: 'escaped bracket display math with trailing opener backslash',
      markdown: ['摩擦力大小为', '', '\\[\\', 'f=\\mu mg\\', ']', '', '\\\\[\\', 'a=\\frac{f}{m}=\\mu g\\', ']', '', '故 A 在传送带上的加速度大小为'].join('\n'),
      expected: ['摩擦力大小为', '', '\\[', 'f=\\mu mg', '\\]', '', '\\[', 'a=\\frac{f}{m}=\\mu g', '\\]', '', '故 A 在传送带上的加速度大小为'].join('\n'),
    },
    {
      name: 'math block with blank lines',
      markdown: ['Before math.', '', '$$', 'a = b', '', 'c = d', '$$', '', 'After math.'].join('\n'),
    },
    {
      name: 'advanced math structures and chemistry syntax',
      markdown: [
        '$$',
        '\\begin{align}a&=b\\\\c&=d\\end{align}',
        '$$',
        '',
        '$$',
        '\\begin{gather}x=y\\\\u=v\\end{gather}',
        '$$',
        '',
        'Chemistry $\\ce{H2O}$ and units $\\pu{123 kJ mol-1}$.',
      ].join('\n'),
    },
    {
      name: 'callout blockquote',
      markdown: ['> 💡 Callout title', '>', '> Callout body'].join('\n'),
    },
    {
      name: 'callout with nested list and code',
      markdown: [
        '> 💡 Callout title',
        '>',
        '> - First item',
        '> - Second item',
        '>',
        '> ```ts',
        '> const value = 1;',
        '> ```',
      ].join('\n'),
    },
    {
      name: 'footnotes',
      markdown: ['Footnote ref[^1].', '', '[^1]: Footnote body'].join('\n'),
    },
    {
      name: 'footnote with nested paragraph and list',
      markdown: [
        'Footnote ref[^note].',
        '',
        '[^note]: First paragraph.',
        '',
        '    Second paragraph.',
        '',
        '    - Nested item',
      ].join('\n'),
    },
    {
      name: 'frontmatter followed by paragraph without extra blank line',
      markdown: ['---', 'title: Demo', '---', 'Body text.'].join('\n'),
    },
    {
      name: 'plain markdown punctuation text persists without redundant escapes',
      markdown: [
        'Plain punctuation: h_i, foo__bar, a*b, a * b, C++, a+b, a-b, v1.2, wow!, a#b, #tag, a[b], path_(x), a~b, a`b, a|b, a:b, and 1 < 2.',
        '',
        '#tag',
      ].join('\n'),
    },
    {
      name: 'highlight superscript and subscript',
      markdown: 'Use ==highlight==, X^2^, and H~2~O.',
    },
    {
      name: 'escaped custom inline mark delimiters',
      markdown: 'Use \\==literal==, X\\^2^, H\\~2~O, and \\++under++.',
      expected: 'Use \\==literal==, X\\^2^, H\\~2\\~O, and \\++under++.',
    },
    {
      name: 'html superscript and subscript serialize to markdown syntax',
      markdown: 'Use <sup>up</sup>, and <sub>down</sub>.',
      expected: 'Use ^up^, and ~down~.',
    },
    {
      name: 'escaped html text inside custom inline marks',
      markdown: [
        '<sup>a &lt; b &amp; c</sup>',
        '<sub>x &gt; y</sub>',
        '<span style="color: #123456">red &lt; blue</span>',
        '<mark style="background-color: #ecf6ff">marked &amp; safe</mark>',
      ].join(' '),
      expectedText: 'a < b & c x > y red < blue marked & safe',
    },
    {
      name: 'custom inline color html with mixed css declarations',
      markdown: [
        '<span class="x" style="font-weight: 600; color: #123456">red &lt; blue</span>',
        '<mark data-bg-color="#ecf6ff" style="border-radius: 2px; background-color: #ecf6ff">marked &amp; safe</mark>',
      ].join(' '),
      expected: [
        '<span style="color: #123456">red &lt; blue</span>',
        '<mark style="background-color: #ecf6ff">marked &amp; safe</mark>',
      ].join(' '),
      expectedText: 'red < blue marked & safe',
    },
    {
      name: 'custom inline color html with css case and markdown punctuation',
      markdown: [
        '<span style="font-weight: 600; COLOR: #123456">Use *literal* [text] &quot;quote&quot;</span>',
        '<mark style="BACKGROUND-COLOR: #ecf6ff">a * b &amp; c</mark>',
      ].join(' '),
      expected: [
        '<span style="color: #123456">Use </span>*<span style="color: #123456">literal</span>*<span style="color: #123456"> [text] "quote"</span>',
        '<mark style="background-color: #ecf6ff">a * b &amp; c</mark>',
      ].join(' '),
      expectedText: 'Use literal [text] "quote" a * b & c',
    },
    {
      name: 'custom inline color html with nested inline markdown',
      markdown: '<span style="color : #123456"><em>nested</em></span> <mark style="background-color : #ecf6ff"><strong>bold</strong></mark>',
      expectedText: 'nested bold',
    },
    {
      name: 'custom inline color html around markdown links remains stable',
      markdown: '<span style="color : #123456">[Docs](https://example.com)</span> <mark style="background-color : #ecf6ff">[Safe](docs/safe.md)</mark>',
      expected: '[<span style="color: #123456">Docs</span>](https://example.com) [<mark style="background-color: #ecf6ff">Safe</mark>](docs/safe.md)',
      expectedText: 'Docs Safe',
    },
    {
      name: 'custom inline html marks preserve nested markdown emphasis',
      markdown: '<u>*under*</u> <sup>**up**</sup> <sub>[down](docs/down.md)</sub>',
      expected: '*++under++* **^up^** [~down~](docs/down.md)',
      expectedText: 'under up down',
    },
    {
      name: 'unsupported inline span html stays standard markdown html',
      markdown: '<span data-note="keep">plain &lt; text</span>',
      expectedText: 'plain < text',
    },
    {
      name: 'plain unclosed html-like paragraph text',
      markdown: '<p>',
      expectedText: '<p>',
    },
    {
      name: 'plain closing html-like paragraph text',
      markdown: '</p>',
      expectedText: '</p>',
    },
    {
      name: 'plain unclosed html-like text with trailing content',
      markdown: '<div>literal',
      expectedText: '<div>literal',
    },
    {
      name: 'plain empty inline html-like text',
      markdown: '<a></a>',
      expectedText: '<a></a>',
    },
    {
      name: 'plain empty block html-like text',
      markdown: '<p></p>',
      expectedText: '<p></p>',
    },
    {
      name: 'raw html block with content',
      markdown: '<div>raw</div>',
      expectedText: 'raw',
    },
    ...(['math', 'noembed', 'noscript', 'plaintext', 'svg', 'textarea', 'xmp'] as const)
      .flatMap((tagName) => [0, 1, 2].map((blankLineCount) => ({
        name: `${tagName} raw html with ${blankLineCount} trailing blank line(s)`,
        markdown: [
          `<${tagName}>`,
          `hidden ${tagName} source`,
          `</${tagName}>`,
          ...Array.from({ length: blankLineCount }, () => ''),
          '# After raw html',
        ].join('\n'),
      }))),
    {
      name: 'raw empty html with attributes',
      markdown: '<a href="#anchor"></a>',
      expectedText: '',
    },
    {
      name: 'raw inline keyboard html',
      markdown: '<kbd>Ctrl</kbd>',
      expectedText: 'Ctrl',
    },
    {
      name: 'underline syntax',
      markdown: 'Use ++underlined text++ here.',
    },
    {
      name: 'delimiter-sensitive highlight and underline text',
      markdown: '<mark>a = b &lt; c</mark> <u>x + y &amp; z</u>',
      expected: '<mark>a = b &lt; c</mark> <u>x + y &amp; z</u>',
      expectedText: 'a = b < c x + y & z',
    },
    {
      name: 'html-sensitive highlight and underline text',
      markdown: '<mark>a &lt; b &amp; c</mark> <u>x &lt; y &amp; z</u>',
      expected: '<mark>a &lt; b &amp; c</mark> <u>x &lt; y &amp; z</u>',
      expectedText: 'a < b & c x < y & z',
    },
    {
      name: 'mermaid diagram',
      markdown: ['```mermaid', 'graph TD', '  A --> B', '```'].join('\n'),
    },
    {
      name: 'mermaid diagram with blank line',
      markdown: ['```mermaid', 'graph TD', '', '  A --> B', '```'].join('\n'),
    },
    {
      name: 'mermaid flow fence alias',
      markdown: ['```flow', 'flowchart TD', '  A --> B', '```'].join('\n'),
    },
    {
      name: 'mermaid flow fence alias without directive',
      markdown: ['```flow', 'A --> B', '```'].join('\n'),
    },
    {
      name: 'mermaid flowchart-v2 fence alias without directive',
      markdown: ['```flowchart-v2', 'A --> B', '```'].join('\n'),
    },
    {
      name: 'mermaid flow alias with frontmatter before missing directive',
      markdown: ['```flow', '---', 'title: Flow', '---', 'A --> B', '```'].join('\n'),
    },
    {
      name: 'mermaid flow fence alias with direction',
      markdown: ['```mermaid', 'flow LR', 'A --> B', '```'].join('\n'),
    },
    {
      name: 'mermaid sequence fence alias',
      markdown: ['```sequence', 'Alice->Bob: Hello', '```'].join('\n'),
    },
    {
      name: 'mermaid init directive before short sequence alias',
      markdown: [
        '```mermaid',
        '%%{init: {"theme": "default"}}%%',
        'sequence',
        'Alice->Bob: Hello',
        '```',
      ].join('\n'),
    },
    {
      name: 'mermaid comment before short flow alias',
      markdown: [
        '```mermaid',
        '%% keep this comment',
        'flow',
        'A --> B',
        '```',
      ].join('\n'),
    },
    {
      name: 'mermaid zenuml fence alias',
      markdown: [
        '```zenuml',
        'title Declare participant',
        'Bob',
        'Alice',
        'Alice->Bob: Hi Bob',
        '```',
      ].join('\n'),
    },
    {
      name: 'mermaid detector fence alias',
      markdown: ['```packet-beta', '0-7: "Source"', '```'].join('\n'),
    },
    {
      name: 'code block language alias',
      markdown: ['```JS', 'const value = 1;', '```'].join('\n'),
    },
    {
      name: 'video image syntax',
      markdown: '![video](https://example.com/video.mp4 "Demo video")',
      expected: '![video](https://example.com/video.mp4 "Demo video")',
    },
    {
      name: 'markdown image attrs with escaped text',
      markdown: '![A < B](image.png?a=1&b=2 "Title & More")',
      expected: '![A < B](image.png?a=1\\&b=2 "Title & More")',
      expectedText: 'A < BTitle & More',
    },
    {
      name: 'html image attrs with escaped text',
      markdown: '<img src="image.png?a=1&amp;b=2" alt="A &lt; B" width="40%" align="right" title="Title &amp; More" />',
      expected: '<img src="image.png?a=1&amp;b=2" alt="A &lt; B" width="40%" align="right" title="Title &amp; More" />',
      expectedText: 'A < B',
    },
    {
      name: 'html image single-quoted attrs and escaped quotes',
      markdown: '<img src=\'image one.png?a=1&amp;b=2\' alt=\'A &quot;quote&quot;\' width=\'50%\' align=\'left\' title=\'Title &#39;One&#39;\' />',
      expectedText: 'A "quote"',
    },
    {
      name: 'table of contents marker',
      markdown: ['[TOC]', '', '# Heading'].join('\n'),
    },
    {
      name: 'escaped table of contents marker',
      markdown: ['\\[TOC]', '', '# Heading'].join('\n'),
    },
    {
      name: 'definition list',
      markdown: ['Term', '', ': Definition'].join('\n'),
    },
    {
      name: 'escaped definition list marker',
      markdown: ['Term', '', '\\: Definition'].join('\n'),
    },
    {
      name: 'abbreviation definition and usage',
      markdown: ['*[HTML]: HyperText Markup Language', '', 'HTML demo'].join('\n'),
      expectedText: 'HTML demo',
    },
    {
      name: 'abbreviation definition preserves punctuation-heavy usage',
      markdown: ['*[C++]: C Plus Plus', '', 'C++ demo and C+++ suffix'].join('\n'),
      expectedText: 'C++ demo and C+++ suffix',
    },
    {
      name: 'escaped abbreviation definition',
      markdown: ['\\*[HTML]: HyperText Markup Language', '', 'HTML demo'].join('\n'),
    },
    {
      name: 'wiki links with target and alias forms',
      markdown: 'See [[Project Alpha]] and [[Project Beta|the beta note]].',
    },
    {
      name: 'escaped wiki link syntax',
      markdown: String.raw`Keep \[[Project Alpha]] literal.`,
    },
    {
      name: 'Obsidian image embed canonicalizes without changing lines',
      markdown: 'Before ![[assets/image.png|Local image]] after.',
      expected: 'Before ![Local image](assets/image.png) after.',
    },
    ...([0, 1, 2] as const).flatMap((blankLineCountBefore) =>
      ([0, 1, 2] as const).map((blankLineCountAfter) => ({
        name: `block alignment comment with ${blankLineCountBefore}/${blankLineCountAfter} surrounding blank lines`,
        markdown: [
          'Paragraph',
          ...Array.from({ length: blankLineCountBefore }, () => ''),
          '<!--align:center-->',
          ...Array.from({ length: blankLineCountAfter }, () => ''),
          '# Heading',
        ].join('\n'),
      })),
    ),
    {
      name: 'tight blockquote between heading and code',
      markdown: ['# Heading', '> Quote', '```code', 'code', '```'].join('\n'),
    },
    {
      name: 'tight callout between heading and code',
      markdown: ['# Heading', '> 💡 Callout', '```code', 'code', '```'].join('\n'),
    },
    {
      name: 'tight thematic break between heading and code',
      markdown: ['# Heading', '---', '```code', 'code', '```'].join('\n'),
    },
    {
      name: 'multiple non-dash thematic breaks do not become frontmatter during save',
      markdown: ['***', '', 'Body', '', '___', '', '# After'].join('\n'),
    },
    {
      name: 'tight table between heading and code',
      markdown: ['# Heading', '|A|B|', '|-|-|', '|1|2|', '```code', 'code', '```'].join('\n'),
    },
    {
      name: 'tight math block between heading and code',
      markdown: ['# Heading', '$$', 'x + y', '$$', '```code', 'code', '```'].join('\n'),
    },
    {
      name: 'tight footnote definition between heading and code',
      markdown: ['# Heading', '[^1]: Footnote', '```code', 'code', '```'].join('\n'),
    },
    {
      name: 'tight abbreviation definition between heading and code',
      markdown: ['# Heading', '*[HTML]: HyperText Markup Language', '```code', 'code', '```'].join('\n'),
    },
    {
      name: 'tight table of contents between heading and code',
      markdown: ['# Heading', '[TOC]', '```code', 'code', '```'].join('\n'),
    },
    {
      name: 'tight table of contents before unlabelled code',
      markdown: ['# Heading', '[TOC]', '```', 'code', '```'].join('\n'),
    },
    {
      name: 'ordinary paragraph stays tight before labelled code',
      markdown: ['# Heading', 'Body', '```code', 'code', '```'].join('\n'),
    },
    {
      name: 'ordinary paragraph stays tight after labelled code',
      markdown: ['# Heading', '```code', 'code', '```', 'Body'].join('\n'),
    },
    {
      name: 'tight video between heading and code',
      markdown: [
        '# Heading',
        '![video](https://example.com/video.mp4 "Demo")',
        '```code',
        'code',
        '```',
      ].join('\n'),
    },
    {
      name: 'authored image separator before labelled code',
      markdown: [
        '# Heading',
        '![alt](image.png)',
        '',
        '```code',
        'code',
        '```',
      ].join('\n'),
    },
    {
      name: 'tight mermaid between heading and code',
      markdown: ['# Heading', '```mermaid', 'graph TD', 'A --> B', '```', '```code', 'code', '```'].join('\n'),
    },
    {
      name: 'unlabelled fenced code stays tight between headings',
      markdown: ['# Heading', '```', 'code', '```', '## Next'].join('\n'),
    },
    {
      name: 'indented code stays source-stable before raw HTML',
      markdown: ['    indented code', '<div>Raw</div>', '', 'After'].join('\n'),
    },
    {
      name: 'equivalent inline and reference links keep their source occurrences',
      markdown: [
        'Read [Docs](https://example.test/docs) then [Docs][docs].',
        '',
        '[docs]: https://example.test/docs',
      ].join('\n'),
    },
    {
      name: 'equivalent plain URL and autolink keep their source occurrences',
      markdown: 'Plain https://example.test/docs then <https://example.test/docs>.',
    },
    {
      name: 'equivalent ATX and setext headings keep their source occurrences',
      markdown: ['## Same heading', '', 'Same heading', '------------'].join('\n'),
    },
    {
      name: 'fenced heading text does not consume a later setext source style',
      markdown: [
        '```md',
        '## Same heading',
        '```',
        '',
        'Same heading',
        '------------',
      ].join('\n'),
    },
    {
      name: 'equivalent spaced and compact blockquotes keep their source occurrences',
      markdown: ['> Same quote', '', '>Same quote'].join('\n'),
    },
    {
      name: 'raw HTML fence text does not hide a later real code fence',
      markdown: [
        '<pre>',
        '```',
        'raw text',
        '</pre>',
        '',
        '~~~~text',
        'actual code',
        '~~~~',
      ].join('\n'),
    },
    {
      name: 'display math fence text does not hide a later real code fence',
      markdown: [
        '$$',
        '```',
        'raw math text',
        '$$',
        '',
        '~~~~text',
        'actual code',
        '~~~~',
      ].join('\n'),
    },
  ])('keeps custom syntax stable and clean on reopen: $name', async (testCase) => {
    await expectStableMarkdownRoundTrip(
      testCase.markdown,
      'expected' in testCase ? testCase.expected : undefined,
      'expectedText' in testCase ? testCase.expectedText : undefined,
    );
  });

  const boundaryBlocks: BoundaryBlock[] = [
    { name: 'paragraph', lines: ['Body'] },
    { name: 'heading', lines: ['## Middle'] },
    { name: 'setext heading', lines: ['Setext heading', '--------------'] },
    { name: 'ordered list', lines: ['1. Ordered'] },
    { name: 'bullet list', lines: ['- Bullet'] },
    { name: 'task list', lines: ['- [ ] Task'] },
    { name: 'blockquote', lines: ['> Quote'] },
    { name: 'callout', lines: ['> 💡 Callout'] },
    { name: 'thematic break', lines: ['---'] },
    { name: 'table', lines: ['|A|B|', '|-|-|', '|1|2|'] },
    { name: 'fenced code', lines: ['```ts', 'const value = 1;', '```'] },
    {
      name: 'indented code',
      requiresPairSeparator: true,
      lines: ['    const value = 1;'],
    },
    { name: 'display math', lines: ['$$', 'x + y', '$$'] },
    { name: 'Mermaid', lines: ['```mermaid', 'graph TD', 'A --> B', '```'] },
    { name: 'footnote definition', lines: ['[^1]: Footnote'] },
    { name: 'reference definition', lines: ['[docs]: https://example.com "Docs"'] },
    { name: 'abbreviation definition', lines: ['*[HTML]: HyperText Markup Language'] },
    { name: 'definition list', lines: ['Term', '', ': Definition'] },
    { name: 'table of contents', lines: ['[TOC]'] },
    { name: 'video', lines: ['![video](https://example.com/video.mp4)'] },
    { name: 'image', lines: ['![alt](image.png)'] },
    { name: 'wiki link paragraph', lines: ['See [[Project Alpha]].'] },
    {
      name: 'Obsidian image embed',
      lines: ['![[assets/image.png|Local image]]'],
      expectedLines: ['![Local image](assets/image.png)'],
    },
    { name: 'raw HTML comment', lines: ['<!-- User comment -->'] },
    { name: 'HTML processing instruction', lines: ['<?note value?>'] },
    { name: 'HTML declaration', lines: ['<!doctype html>'] },
    { name: 'HTML CDATA', lines: ['<![CDATA[', 'a < b', ']]>'] },
    { name: 'closed raw pre HTML', lines: ['<pre>', 'raw', '</pre>'] },
    { name: 'closed raw style HTML', lines: ['<style>', '.demo {}', '</style>'] },
    { name: 'raw HTML', lines: ['<div>Raw</div>'], requiresSeparator: true },
  ];

  const pairwiseBoundaryCases = boundaryBlocks.flatMap((left) =>
    boundaryBlocks.flatMap((right) =>
      [0, 1, 2].flatMap((blankLineCount) => {
        const requiresSeparator = left.requiresSeparator
          || right.requiresSeparator
          || left.requiresPairSeparator
          || right.requiresPairSeparator
          || (left.name === 'table' && right.name === 'table');
        if (blankLineCount === 0 && requiresSeparator) return [];

        const blanks = Array.from({ length: blankLineCount }, () => '');
        const leftMarkdown = left.lines.join('\n');
        const rightMarkdown = right.lines.join('\n');
        return [{
          name: left.name + ' -> ' + right.name + ' with ' + blankLineCount + ' blank line(s)',
          independentParts: [leftMarkdown, rightMarkdown],
          markdown: [...left.lines, ...blanks, ...right.lines].join('\n'),
          expected: [
            ...(left.expectedLines ?? left.lines),
            ...blanks,
            ...(right.expectedLines ?? right.lines),
          ].join('\n'),
        }];
      })
    )
  );

  it(
    'preserves every ordered root-block pair with every valid 0/1/2-line boundary',
    { timeout: 300_000 },
    async () => {
      await expectStableMarkdownRoundTrips(pairwiseBoundaryCases);
    },
  );

  it.each(boundaryBlocks.filter(({ requiresSeparator }) => !requiresSeparator))(
    'does not invent a root blank line around tight $name input',
    async ({ lines, expectedLines = lines }) => {
      const markdown = ['# Before', ...lines, '```after', 'after', '```'].join('\n');
      const expected = ['# Before', ...expectedLines, '```after', 'after', '```'].join('\n');
      await expectStableMarkdownRoundTrip(markdown, expected);
    },
  );

  it.each(boundaryBlocks.filter(({ requiresSeparator }) => !requiresSeparator))(
    'does not invent a root blank line before an unlabelled code fence after tight $name input',
    async ({ lines, expectedLines = lines }) => {
      const markdown = ['# Before', ...lines, '```', 'after', '```'].join('\n');
      const expected = ['# Before', ...expectedLines, '```', 'after', '```'].join('\n');
      await expectStableMarkdownRoundTrip(markdown, expected);
    },
  );

  it.each(boundaryBlocks.filter(({ requiresSeparator }) => !requiresSeparator))(
    'does not invent a root blank line after an unlabelled code fence before tight $name input',
    async ({ lines, expectedLines = lines }) => {
      const markdown = ['```', 'before', '```', ...lines, '## After'].join('\n');
      const expected = ['```', 'before', '```', ...expectedLines, '## After'].join('\n');
      await expectStableMarkdownRoundTrip(markdown, expected);
    },
  );

  it.each(boundaryBlocks.flatMap((block) => [1, 2].map((blankLineCount) => ({
    ...block,
    blankLineCount,
  }))))(
    'preserves $blankLineCount authored root blank line(s) around $name',
    async ({ lines, expectedLines = lines, blankLineCount }) => {
      const blanks = Array.from({ length: blankLineCount }, () => '');
      const markdown = [
        '# Before',
        ...blanks,
        ...lines,
        ...blanks,
        '```after',
        'after',
        '```',
      ].join('\n');
      const expected = [
        '# Before',
        ...blanks,
        ...expectedLines,
        ...blanks,
        '```after',
        'after',
        '```',
      ].join('\n');
      await expectStableMarkdownRoundTrip(markdown, expected);
    },
  );

  it.each([0, 1, 2])(
    'preserves %s authored root blank line(s) after leading frontmatter',
    async (blankLineCount) => {
      const blanks = Array.from({ length: blankLineCount }, () => '');
      const markdown = [
        '---',
        'title: Demo',
        '---',
        ...blanks,
        '```after',
        'after',
        '```',
      ].join('\n');
      await expectStableMarkdownRoundTrip(markdown);
    },
  );

  it.each(
    [0, 1, 2].flatMap((blankLineCountBefore) =>
      [0, 1, 2].map((blankLineCountAfter) => ({
        blankLineCountAfter,
        blankLineCountBefore,
      }))
    )
  )(
    'preserves $blankLineCountBefore/$blankLineCountAfter authored blank lines around a middle unused reference definition',
    async ({ blankLineCountBefore, blankLineCountAfter }) => {
      const markdown = [
        '# Before',
        ...Array.from({ length: blankLineCountBefore }, () => ''),
        '[unused]: https://example.test/unused',
        ...Array.from({ length: blankLineCountAfter }, () => ''),
        '## After',
      ].join('\n');
      await expectStableMarkdownRoundTrip(markdown);
    },
  );

  it.each([0, 1, 2])(
    'preserves %s authored blank line(s) inside a definition list',
    async (blankLineCount) => {
      const blanks = Array.from({ length: blankLineCount }, () => '');
      const markdown = [
        '```',
        'before',
        '```',
        'Term',
        ...blanks,
        ': Definition',
        '## After',
      ].join('\n');
      await expectStableMarkdownRoundTrip(markdown);
    },
  );

  it.each(
    (['math', 'noembed', 'noscript', 'plaintext', 'svg', 'textarea', 'xmp'] as const)
      .flatMap((tagName) => [0, 1, 2].map((blankLineCount) => ({
        blankLineCount,
        tagName,
      })))
  )(
    'preserves $blankLineCount authored blockquote blank line(s) after nested $tagName html',
    async ({ blankLineCount, tagName }) => {
      const markdown = [
        `> <${tagName}>`,
        `> hidden ${tagName} source`,
        `> </${tagName}>`,
        ...Array.from({ length: blankLineCount }, () => '>'),
        '> # After raw html',
      ].join('\n');
      await expectStableMarkdownRoundTrip(markdown);
    },
  );

  it.each([
    {
      container: 'unordered list item',
      markdown: [
        '- <textarea>',
        '  hidden textarea source',
        '  </textarea>',
        '  # After raw html',
      ].join('\n'),
    },
    {
      container: 'ordered list blockquote',
      markdown: [
        '7. > <textarea>',
        '   > hidden textarea source',
        '   > </textarea>',
        '   > # After raw html',
      ].join('\n'),
    },
    {
      container: 'footnote definition',
      markdown: [
        'Footnote reference[^html].',
        '',
        '[^html]: <textarea>',
        '    hidden textarea source',
        '    </textarea>',
        '    # After raw html',
      ].join('\n'),
    },
    {
      container: 'definition list description',
      markdown: [
        'Term',
        ': <textarea>',
        '  hidden textarea source',
        '  </textarea>',
        '# After raw html',
      ].join('\n'),
    },
  ])('preserves raw html source inside $container', async ({ markdown }) => {
    await expectStableMarkdownRoundTrip(markdown);
  });

  it.each([
    {
      block: 'heading',
      markdown: '- # Nested heading',
    },
    {
      block: 'fenced code',
      markdown: ['- ```ts', '  nested code', '  ```'].join('\n'),
    },
    {
      block: 'display math',
      markdown: ['- $$', '  x + y', '  $$'].join('\n'),
    },
    {
      block: 'bracket display math',
      markdown: ['- \\[', '  x + y', '  \\]'].join('\n'),
    },
    {
      block: 'thematic break',
      markdown: '* ---',
    },
  ])('preserves a list marker tight to a first $block block', async ({ markdown }) => {
    await expectStableMarkdownRoundTrip(markdown);
  });

  it.each([
    {
      block: 'fenced code',
      lines: ['- ```ts', '  nested code', '  ```'],
    },
    {
      block: 'display math',
      lines: ['- $$', '  x + y', '  $$'],
    },
    {
      block: 'bracket display math',
      lines: ['- \\[', '  x + y', '  \\]'],
    },
    {
      block: 'raw HTML',
      lines: ['- <textarea>', '  nested raw HTML', '  </textarea>'],
    },
    {
      block: 'heading',
      lines: ['- # Nested heading'],
    },
  ].flatMap((testCase) => [0, 1, 2].map((blankLineCount) => ({
    ...testCase,
    blankLineCount,
  }))))(
    'preserves $blankLineCount blank line(s) after a list-first $block',
    async ({ blankLineCount, lines }) => {
      const markdown = [
        ...lines,
        ...Array.from({ length: blankLineCount }, () => ''),
        '[TOC]',
      ].join('\n');
      await expectStableMarkdownRoundTrip(markdown);
    },
  );

  it.each([
    {
      block: 'fenced code',
      lines: ['- ```ts', '  nested code', '  ```'],
    },
    {
      block: 'display math',
      lines: ['- $$', '  x + y', '  $$'],
    },
    {
      block: 'bracket display math',
      lines: ['- \\[', '  x + y', '  \\]'],
    },
    {
      block: 'heading',
      lines: ['- # Nested heading'],
    },
  ].flatMap((testCase) => [0, 1, 2].map((blankLineCount) => ({
    ...testCase,
    blankLineCount,
  }))))(
    'preserves $blankLineCount blank line(s) before a list-first $block after another list',
    async ({ blankLineCount, lines }) => {
      const markdown = [
        '* Parent',
        '  * Nested',
        ...Array.from({ length: blankLineCount }, () => ''),
        ...lines,
      ].join('\n');
      await expectStableMarkdownRoundTrip(markdown);
    },
  );

  it.each([0, 1, 2])(
    'preserves a leading alignment comment with %s authored blank line(s)',
    async (blankLineCount) => {
      const blanks = Array.from({ length: blankLineCount }, () => '');
      const markdown = [
        '<!--align:center-->',
        ...blanks,
        'Paragraph',
        '# Heading',
      ].join('\n');
      await expectStableMarkdownRoundTrip(markdown);
    },
  );

  it.each([0, 1, 2])(
    'preserves %s blank line(s) between list-contained and quoted fenced code',
    async (blankLineCount) => {
      const markdown = [
        '- ```ts',
        '  nested code',
        '  ```',
        ...Array.from({ length: blankLineCount }, () => ''),
        '> - ```md',
        '>   quoted code',
        '>   ```',
      ].join('\n');
      await expectStableMarkdownRoundTrip(markdown);
    },
  );

  it.each([0, 1, 2])(
    'preserves %s blank line(s) between a nested list and a quoted list',
    async (blankLineCount) => {
      const markdown = [
        '* Parent',
        '  * Nested',
        ...Array.from({ length: blankLineCount }, () => ''),
        '> - ```md',
        '>   quoted code',
        '>   ```',
      ].join('\n');
      await expectStableMarkdownRoundTrip(markdown);
    },
  );

  it.each([0, 1, 2])(
    'preserves %s blank line(s) between list raw HTML and a task list',
    async (blankLineCount) => {
      const markdown = [
        '- <textarea>',
        '  nested raw HTML',
        '  </textarea>',
        ...Array.from({ length: blankLineCount }, () => ''),
        '- [ ] Task',
        '- [x] Done',
      ].join('\n');
      await expectStableMarkdownRoundTrip(markdown);
    },
  );

  it('does not leak a rendered HTML boundary helper after raw HTML with fence-like text', async () => {
    const markdown = [
      '- \\[',
      '  x = y',
      '  \\]',
      '',
      '![video](https://example.test/video.mp4 "Video")',
      '<?note value?>',
      '',
      '',
      '- <textarea>',
      '  - protected html marker',
      '  ```not-a-fence',
      '  </textarea>',
      '',
      '<div>Raw HTML</div>',
      '',
      '7) Ordered',
      '8) Continued',
    ].join('\n');
    await expectStableMarkdownRoundTrip(markdown);
  });

  it('does not leak an image boundary placeholder before a thematic break', async () => {
    const markdown = [
      '***',
      '![Image](image.png "Title")',
      '',
      '***',
    ].join('\n');
    await expectStableMarkdownRoundTrip(markdown);
  });

  it('does not leak an image boundary placeholder before later protected blocks', async () => {
    const markdown = [
      '***',
      '![Image 501](image-501.png "Title 501")',
      '',
      '***',
      '',
      '',
      '- $$',
      '  x_503 = y_503',
      '  $$',
      '',
      '',
      'Paragraph 504 with **bold**, *emphasis*, `code`, and [link](https://example.test/504).',
      '',
      '',
      'Setext heading 505',
      '----------------',
      '',
      '',
      '- <textarea>',
      '  - protected html marker 506',
      '  ```not-a-fence',
      '  </textarea>',
      '',
      '',
      '````md',
      '> ````',
      'protected pseudo close 507',
      '````',
    ].join('\n');
    await expectStableMarkdownRoundTrip(markdown);
  });

  it('does not leak an image boundary placeholder before list display math', async () => {
    const markdown = [
      '***',
      '![Image](image.png "Title")',
      '',
      '***',
      '',
      '',
      '- $$',
      '  x = y',
      '  $$',
    ].join('\n');
    await expectStableMarkdownRoundTrip(markdown);
  });

  it('does not leak an image boundary placeholder before list raw HTML', async () => {
    const markdown = [
      '***',
      '![Image](image.png "Title")',
      '',
      '***',
      '',
      '',
      '- <textarea>',
      '  hidden',
      '  </textarea>',
    ].join('\n');
    await expectStableMarkdownRoundTrip(markdown);
  });

  it('does not leak an image boundary placeholder before a pseudo closing fence', async () => {
    const markdown = [
      '***',
      '![Image](image.png "Title")',
      '',
      '***',
      '',
      '',
      '````md',
      '> ````',
      'protected pseudo close',
      '````',
    ].join('\n');
    await expectStableMarkdownRoundTrip(markdown);
  });

  it('does not leak an image boundary placeholder before a setext heading', async () => {
    const markdown = [
      '***',
      '![Image](image.png "Title")',
      '',
      '***',
      '',
      '',
      'Setext heading',
      '----------------',
    ].join('\n');
    await expectStableMarkdownRoundTrip(markdown);
  });

  it.each([0, 1, 2])(
    'preserves an explicit left alignment comment with %s authored blank line(s)',
    async (blankLineCount) => {
      const blanks = Array.from({ length: blankLineCount }, () => '');
      const markdown = [
        'Paragraph',
        ...blanks,
        '<!--align:left-->',
        '# Heading',
      ].join('\n');
      await expectStableMarkdownRoundTrip(markdown);
    },
  );

  it.each([0, 1, 2])(
    'preserves %s authored blank line(s) around a nested alignment comment',
    async (blankLineCount) => {
      const blanks = Array.from({ length: blankLineCount }, () => '>');
      const markdown = [
        '> Paragraph',
        ...blanks,
        '> <!--align:right-->',
        ...blanks,
        '> # Heading',
      ].join('\n');
      await expectStableMarkdownRoundTrip(markdown);
    },
  );
});
