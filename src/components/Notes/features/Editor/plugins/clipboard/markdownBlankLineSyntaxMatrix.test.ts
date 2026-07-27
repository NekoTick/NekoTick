import { describe, it } from 'vitest';
import { expectStableMarkdownRoundTrip } from './markdownRoundTripTestUtils';

const lines = (value: readonly string[]) => value.join('\n');

describe('markdown blank line syntax matrix', () => {
  it.each([
    {
      name: 'paragraphs keep one empty paragraph',
      markdown: lines(['Alpha', '', 'Beta', '', '', 'Gamma']),
    },
    {
      name: 'headings keep authored blank paragraph between sections',
      markdown: lines(['# Alpha', '', 'Body', '', '', '## Beta', '', 'Tail']),
    },
    {
      name: 'closed atx headings keep closing marker',
      markdown: lines(['# Alpha #', '', '### Gamma ###']),
    },
    {
      name: 'setext headings keep surrounding blank lines',
      markdown: lines(['Alpha', '=====', '', 'Body', '', '', 'Beta', '-----', '', 'Tail']),
    },
    {
      name: 'thematic breaks keep surrounding blank lines',
      markdown: lines(['Before', '', '---', '', '', 'After']),
      expected: lines(['Before', '', '---', '', '', 'After']),
    },
    {
      name: 'thematic break marker variants keep authored marker',
      markdown: lines(['Before', '', '***', '', '___', '', 'After']),
    },
    {
      name: 'bullet list gaps reopen and persist as markdown blank lines',
      markdown: lines(['- one', '', '- two', '', '', '- three']),
    },
    {
      name: 'task list gaps reopen and persist as markdown blank lines',
      markdown: lines(['- [ ] one', '', '- [x] two', '', '', '- [ ] three']),
    },
    {
      name: 'ordered list gaps keep numbering stable',
      markdown: lines(['1. one', '', '2. two', '', '', '3. three']),
    },
    {
      name: 'ordered list gaps preserve non-one start numbers',
      markdown: lines(['8. eight', '', '9. nine', '', '', '10. ten']),
    },
    {
      name: 'ordered list markers keep padded numbers',
      markdown: lines(['01. one', '02. two']),
    },
    {
      name: 'parenthesized ordered list gaps canonicalize and keep blank lines',
      markdown: lines(['1) one', '', '2) two', '', '', '3) three']),
    },
    {
      name: 'malformed ordered list gaps keep missing marker spaces',
      markdown: lines(['0.安装', '', '1.调用笔记', '', '2.完成']),
    },
    {
      name: 'paragraph marker-like text keeps missing marker spaces',
      markdown: lines(['#标题', '##子标题', '', '-苹果', '-香蕉', '', '-[x]done', '-[] todo']),
    },
    {
      name: 'blockquote markers keep missing marker spaces',
      markdown: lines(['>引用', '>>嵌套引用']),
    },
    {
      name: 'nested bullet list gaps keep nested structure',
      markdown: lines(['- parent', '  - child one', '', '  - child two', '', '- next']),
    },
    {
      name: 'nested task list gaps keep nested checkboxes',
      markdown: lines(['- parent', '  - [ ] child one', '', '  - [x] child two', '', '- next']),
    },
    {
      name: 'nested ordered list gaps keep nested numbering',
      markdown: lines(['1. parent', '   1. child one', '', '   2. child two', '', '2. next']),
    },
    {
      name: 'mixed list gaps keep authored blank lines per level',
      markdown: lines(['- parent', '  1. child one', '', '  2. child two', '', '- next']),
    },
    {
      name: 'mixed bullet markers keep list gaps editable',
      markdown: lines(['* star', '', '+ plus', '', '- dash']),
    },
    {
      name: 'task and bullet boundaries preserve authored blank line',
      markdown: lines(['- [ ] task', '', '- plain', '', '- [x] done']),
    },
    {
      name: 'ordered and task boundaries preserve authored blank line',
      markdown: lines(['1. step', '', '- [ ] task', '', '2. next']),
    },
    {
      name: 'plain bullet before task list preserves authored blank line',
      markdown: lines(['- plain', '', '- [ ] task']),
    },
    {
      name: 'task list before plain bullet preserves authored blank line',
      markdown: lines(['- [x] task', '', '* plain']),
    },
    {
      name: 'bullet and ordered list boundaries preserve authored blank lines',
      markdown: lines(['- bullet', '', '1. ordered', '', '* next bullet']),
    },
    {
      name: 'empty bullet item followed by content stays editable',
      markdown: lines(['-', '', '- filled']),
    },
    {
      name: 'empty ordered item followed by content stays editable',
      markdown: lines(['1.', '', '2. filled']),
    },
    {
      name: 'empty task item followed by checked task stays editable',
      markdown: lines(['- [ ]', '', '- [x] done']),
    },
    {
      name: 'multiple list gap blanks are capped but not lost',
      markdown: lines(['- one', '', '', '', '- two']),
    },
    {
      name: 'list gap before nested list keeps child attached',
      markdown: lines(['- parent', '', '  - child', '', '- next']),
    },
    {
      name: 'nested list gap before parent sibling keeps hierarchy',
      markdown: lines(['- parent', '  - child', '', '', '- next']),
    },
    {
      name: 'ordered nested list after loose parent keeps numbering',
      markdown: lines(['1. parent', '', '   1. child', '', '2. next']),
    },
    {
      name: 'task list nested paragraph then sibling keeps blanks',
      markdown: lines(['- [ ] parent', '', '  details', '', '  - [ ] child', '', '- [ ] next']),
    },
    {
      name: 'deep nested list gaps do not leak placeholders',
      markdown: lines([
        '- root',
        '  - child',
        '    - grandchild one',
        '',
        '    - grandchild two',
        '',
        '  - sibling child',
        '',
        '- next root',
      ]),
    },
    {
      name: 'list item details keep internal blank paragraphs',
      markdown: lines(['- one', '', '  detail paragraph', '', '  second detail', '', '- two']),
    },
    {
      name: 'task list item details keep blank paragraphs and checkbox state',
      markdown: lines(['- [ ] one', '', '  detail paragraph', '', '  - nested child', '', '- [x] two']),
    },
    {
      name: 'list gaps around thematic break do not become editable list gaps',
      markdown: lines(['- one', '', '---', '', '- two']),
      expected: lines(['- one', '', '---', '', '- two']),
    },
    {
      name: 'loose list item details do not become placeholder list gaps',
      markdown: lines(['- one', '', '  paragraph detail', '', '  - nested child', '', '- two']),
    },
    {
      name: 'blockquote paragraph blanks stay blockquote blanks',
      markdown: lines(['> Alpha', '>', '> Beta', '>', '>', '> Gamma']),
    },
    {
      name: 'blockquote bullet list blanks stay editable',
      markdown: lines(['> - one', '>', '> - two', '>', '>', '> - three']),
    },
    {
      name: 'nested blockquote list blanks stay editable',
      markdown: lines(['> > - one', '> >', '> > - two', '> >', '> >', '> > - three']),
    },
    {
      name: 'blockquote task list blanks stay editable',
      markdown: lines(['> - [ ] one', '>', '> - [x] two', '>', '>', '> - [ ] three']),
    },
    {
      name: 'blockquote nested ordered blanks stay scoped',
      markdown: lines(['> 1. parent', '>    1. child one', '>', '>    2. child two', '>', '> 2. next']),
    },
    {
      name: 'blockquote mixed task and ordered gaps stay scoped',
      markdown: lines(['> - [ ] task', '>', '> 1. ordered', '>', '> - [x] done']),
      expected: lines(['> - [ ] task', '>', '> 1. ordered', '>', '> - [x] done']),
    },
    {
      name: 'blockquote empty list item stays editable',
      markdown: lines(['> -', '>', '> - filled']),
      expected: lines(['> -', '>', '> - filled']),
    },
    {
      name: 'blockquote malformed list markers keep blanks through canonicalization',
      markdown: lines(['> 1.第一项', '>', '> 2.第二项', '>', '>', '> 3.第三项']),
    },
    {
      name: 'blockquote code fence keeps internal blank line',
      markdown: lines(['> ```ts', '> const a = 1;', '>', '> const b = 2;', '> ```', '>', '> after']),
    },
    {
      name: 'fenced code keeps internal blank lines',
      markdown: lines(['Before', '', '```ts', 'const a = 1;', '', 'const b = 2;', '```', '', 'After']),
    },
    {
      name: 'long fenced code markers keep authored length',
      markdown: lines(['Before', '', '````ts', 'const a = 1;', '````', '', 'After']),
    },
    {
      name: 'tilde fenced code keeps internal blank lines',
      markdown: lines(['Before', '', '~~~md', '- not a list', '', '- still code', '~~~', '', 'After']),
    },
    {
      name: 'language alias fenced code keeps surrounding blanks',
      markdown: lines(['Before', '', '```JS', 'const value = 1;', '```', '', '', 'After']),
    },
    {
      name: 'indented code keeps internal blank lines',
      markdown: lines(['Before', '', '    const a = 1;', '', '    const b = 2;', '', 'After']),
    },
    {
      name: 'table keeps surrounding blank lines',
      markdown: lines(['Before', '', '| A | B |', '| --- | --- |', '| 1 | 2 |', '', '', 'After']),
      expected: lines(['Before', '', '|A|B|', '|-|-|', '|1|2|', '', '', 'After']),
    },
    {
      name: 'table cells keep inline markdown without creating blank placeholders',
      markdown: lines([
        'Before',
        '',
        '| A | B |',
        '| --- | --- |',
        '| **bold** | [link](https://example.com?a=1&b=2) |',
        '',
        'After',
      ]),
      expected: lines([
        'Before',
        '',
        '|A|B|',
        '|-|-|',
        '|**bold**|[link](https://example.com?a=1\\&b=2)|',
        '',
        'After',
      ]),
    },
    {
      name: 'table alignment keeps surrounding blank lines',
      markdown: lines(['Before', '', '| Left | Right |', '| :--- | ---: |', '| a | b |', '', '', 'After']),
      expected: lines(['Before', '', '|Left|Right|', '|:-|-:|', '|a|b|', '', '', 'After']),
    },
    {
      name: 'table followed by list keeps only authored boundaries',
      markdown: lines(['| A | B |', '| --- | --- |', '| 1 | 2 |', '', '- one', '', '- two']),
      expected: lines(['|A|B|', '|-|-|', '|1|2|', '', '- one', '', '- two']),
    },
    {
      name: 'frontmatter keeps body blank lines',
      markdown: lines(['---', 'title: Demo', '---', 'Alpha', '', '', 'Beta']),
    },
    {
      name: 'frontmatter with metadata keeps body blanks after normalization',
      markdown: lines(['---', 'title: Demo', 'vlaina_icon: note', '---', 'Alpha', '', '', 'Beta']),
    },
    {
      name: 'frontmatter followed by list gaps keeps body blanks',
      markdown: lines(['---', 'title: Demo', 'tags:', '  - one', '---', '- one', '', '- two', '', 'Tail']),
      expected: lines(['---', 'title: Demo', 'tags:', '  - one', '---', '- one', '', '- two', '', 'Tail']),
    },
    {
      name: 'math block keeps surrounding blank lines',
      markdown: lines(['Before', '', '$$', 'a = b', '$$', '', '', 'After']),
    },
    {
      name: 'math block keeps internal blank lines',
      markdown: lines(['Before', '', '$$', 'a = b', '', 'c = d', '$$', '', 'After']),
    },
    {
      name: 'bracket math keeps surrounding blank lines',
      markdown: lines(['Before', '', '\\[', 'a = b', '\\]', '', '', 'After']),
    },
    {
      name: 'generated bracket math normalizes without dropping body blanks',
      markdown: lines(['Before', '', '[', 'a = b', ']', '', '', 'After']),
      expected: lines(['Before', '', '\\[', 'a = b', '\\]', '', '', 'After']),
    },
    {
      name: 'callout keeps blank body paragraphs',
      markdown: lines(['> 💡 Title', '>', '> Alpha', '>', '>', '> Beta']),
    },
    {
      name: 'callout list blank lines persist as blockquote list blanks',
      markdown: lines(['> 💡 Title', '>', '> - one', '>', '> - two', '>', '>', '> - three']),
    },
    {
      name: 'callout mixed list blanks preserve editable boundaries',
      markdown: lines(['> 💡 Title', '>', '> 1. one', '>', '> - [ ] task', '>', '> 2. two']),
      expected: lines(['> 💡 Title', '>', '> 1. one', '>', '> - [ ] task', '>', '> 2. two']),
    },
    {
      name: 'callout nested task list and code keep blank boundaries',
      markdown: lines([
        '> 💡 Title',
        '>',
        '> - [ ] one',
        '>',
        '> - [x] two',
        '>',
        '> ```ts',
        '> const value = 1;',
        '> ```',
      ]),
      expected: lines([
        '> 💡 Title',
        '>',
        '> - [ ] one',
        '>',
        '> - [x] two',
        '>',
        '> ```ts',
        '> const value = 1;',
        '> ```',
      ]),
    },
    {
      name: 'callout table keeps blank boundaries',
      markdown: lines([
        '> 💡 Title',
        '>',
        '> | A | B |',
        '> | --- | --- |',
        '> | 1 | 2 |',
        '>',
        '> Tail',
      ]),
      expected: lines([
        '> 💡 Title',
        '>',
        '> |A|B|',
        '> |-|-|',
        '> |1|2|',
        '>',
        '> Tail',
      ]),
    },
    {
      name: 'callout math keeps internal and surrounding blanks',
      markdown: lines(['> 💡 Title', '>', '> $$', '> a = b', '>', '> c = d', '> $$', '>', '> Tail']),
    },
    {
      name: 'footnote keeps nested blank paragraphs',
      markdown: lines(['Footnote ref[^note].', '', '[^note]: Alpha', '', '    Beta', '', '    Gamma']),
    },
    {
      name: 'footnote keeps nested list blank lines',
      markdown: lines(['Footnote ref[^note].', '', '[^note]: Alpha', '', '    - one', '', '    - two']),
    },
    {
      name: 'footnote keeps nested task list blank lines',
      markdown: lines(['Footnote ref[^note].', '', '[^note]: Alpha', '', '    - [ ] one', '', '    - [x] two']),
    },
    {
      name: 'footnote keeps mixed nested list blank lines',
      markdown: lines(['Footnote ref[^note].', '', '[^note]: Alpha', '', '    1. one', '', '    - [ ] two', '', '    2. three']),
    },
    {
      name: 'mermaid keeps internal blank lines',
      markdown: lines(['Before', '', '```mermaid', 'graph TD', '', '  A --> B', '```', '', 'After']),
    },
    {
      name: 'mermaid alias preserves source without dropping blanks',
      markdown: lines(['Before', '', '```flow', 'A --> B', '', 'B --> C', '```', '', 'After']),
    },
    {
      name: 'mermaid frontmatter alias keeps internal blanks',
      markdown: lines(['Before', '', '```flow', '---', 'title: Flow', '---', '', 'A --> B', '```', '', 'After']),
    },
    {
      name: 'toc keeps surrounding blank lines',
      markdown: lines(['[TOC]', '', '', '# Heading']),
    },
    {
      name: 'image keeps surrounding blank lines',
      markdown: lines(['Before', '', '![Alt text](image.png "Title")', '', '', 'After']),
    },
    {
      name: 'video image syntax keeps surrounding blank lines',
      markdown: lines(['Before', '', '![video](https://example.com/video.mp4 "Demo")', '', '', 'After']),
      expected: lines(['Before', '', '![video](https://example.com/video.mp4 "Demo")', '', '', 'After']),
    },
    {
      name: 'raw html block keeps internal blank lines',
      markdown: lines(['Before', '', '<div>', 'Alpha', '', 'Beta', '</div>', '', 'After']),
    },
    {
      name: 'raw pre html keeps list-like blank lines protected',
      markdown: lines(['Before', '', '<pre>', '- not a list', '', '- still pre', '</pre>', '', 'After']),
    },
    {
      name: 'raw script html keeps markdown-like blank lines protected',
      markdown: lines(['Before', '', '<script>', 'const text = "- item";', '', 'console.log(text);', '</script>', '', 'After']),
    },
    {
      name: 'html block between list items stays structural not list gap',
      markdown: lines(['- one', '', '<div>note</div>', '', '- two']),
      expected: lines(['- one', '', '<div>note</div>', '', '- two']),
    },
    {
      name: 'tight paragraph before html keeps zero authored blank lines',
      markdown: lines(['Before', '<p>Fresh HTML</p>']),
    },
    {
      name: 'html comment keeps surrounding blank lines',
      markdown: lines(['Before', '', '<!-- note -->', '', '', 'After']),
      expected: lines(['Before', '', '<!-- note -->', '', '', 'After']),
    },
    {
      name: 'alignment comments keep authored blank lines',
      markdown: lines(['Alpha', '', '<!--align:center-->', '', '', '# Beta', '<!--align:right-->', '', 'Tail']),
    },
    {
      name: 'alignment comments around lists do not disturb list blanks',
      markdown: lines(['<!--align:center-->', '', '- one', '', '- two', '', '<!--align:left-->', '', 'Tail']),
    },
    {
      name: 'abbreviation definition keeps surrounding blanks',
      markdown: lines(['Alpha HTML.', '', '*[HTML]: HyperText Markup Language', '', '', 'Beta']),
    },
    {
      name: 'reference definition keeps surrounding blanks',
      markdown: lines(['Read [Docs][docs].', '', '[docs]: https://example.com "Docs"', '', '', 'After']),
    },
    {
      name: 'autolinks keep blank paragraphs around them',
      markdown: lines(['Alpha', '', '<https://example.com?a=1&b=2>', '', '', '<user@example.com>', '', 'Tail']),
    },
    {
      name: 'markdown links keep blank paragraphs around them',
      markdown: lines(['Alpha', '', '[Docs](https://example.com?a=1&b=2 "Title")', '', '', 'Tail']),
      expected: lines(['Alpha', '', '[Docs](https://example.com?a=1\\&b=2 "Title")', '', '', 'Tail']),
    },
    {
      name: 'reference link followed by list gap keeps both constructs',
      markdown: lines(['Read [Docs][docs].', '', '- one', '', '- two', '', '[docs]: https://example.com "Docs"']),
    },
    {
      name: 'inline marks around blank paragraphs stay stable',
      markdown: lines(['**Bold** and ==mark==.', '', '', 'Use ++underline++ and H~2~O.']),
    },
    {
      name: 'gfm strikethrough and html inline marks keep blank paragraphs',
      markdown: lines(['~~Gone~~ and <kbd>Ctrl</kbd>.', '', '', '<mark>Marked</mark> then <sup>2</sup>.']),
      expected: lines(['~~Gone~~ and <kbd>Ctrl</kbd>.', '', '', '==Marked== then ^2^.']),
    },
    {
      name: 'custom color html marks keep blank paragraphs',
      markdown: lines([
        '<span style="color: #123456">red &lt; blue</span>',
        '',
        '',
        '<mark style="background-color: #ecf6ff">marked &amp; safe</mark>',
      ]),
      expected: lines([
        '<span style="color: #123456">red &lt; blue</span>',
        '',
        '',
        '<mark style="background-color: #ecf6ff">marked &amp; safe</mark>',
      ]),
    },
    {
      name: 'definition-like paragraphs keep ordinary blank boundaries',
      markdown: lines(['Term', '', ': definition text', '', '', 'Next term']),
      expected: lines(['Term', '', ': definition text', '', '', 'Next term']),
    },
    {
      name: 'hard breaks do not become structural blank lines',
      markdown: lines(['Alpha\\', 'Beta', '', '', 'Gamma']),
    },
  ])('keeps blank lines stable with $name', async ({ markdown, expected }) => {
    await expectStableMarkdownRoundTrip(markdown, expected ?? markdown);
  });
});
