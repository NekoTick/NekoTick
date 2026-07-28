import { describe, expect, it } from 'vitest';
import {
  normalizeSerializedMarkdownDocument,
  preserveMarkdownBlankLinesForEditor,
  preserveMarkdownBlankLinesForPaste,
} from '@/lib/notes/markdown/markdownSerializationUtils';
import {
  getFrontmatterFenceLanguage,
  getFrontmatterFenceMeta,
} from '../frontmatter/frontmatterMarkdown';

const LEGACY_EMPTY_LINE_PLACEHOLDER = '\u200B';
const MARKDOWN_BLANK_LINE_PLACEHOLDER = '<!--vlaina-markdown-blank-line-->';
const RENDERED_HTML_BOUNDARY_PLACEHOLDER = '<!--vlaina-rendered-html-boundary-blank-line-->';
const NON_PERSISTED_BLOCK_BOUNDARY_PLACEHOLDER = '<!--vlaina-markdown-tight-heading-->';

describe('preserveMarkdownBlankLinesForEditor editor input', () => {
  it('uses editor-only blocks for ordinary markdown blank lines', () => {
    expect(preserveMarkdownBlankLinesForEditor('1\n\n2')).toBe(
      ['1', MARKDOWN_BLANK_LINE_PLACEHOLDER, '2'].join('\n')
    );
  });

  it('uses one editor-only block for each leading markdown blank line', () => {
    expect(preserveMarkdownBlankLinesForEditor(['', 'Top'].join('\n'))).toBe(
      [MARKDOWN_BLANK_LINE_PLACEHOLDER, 'Top'].join('\n')
    );
    expect(preserveMarkdownBlankLinesForEditor(['', '', 'Top', '', 'Body'].join('\n'))).toBe(
      [
        MARKDOWN_BLANK_LINE_PLACEHOLDER,
        MARKDOWN_BLANK_LINE_PLACEHOLDER,
        'Top',
        MARKDOWN_BLANK_LINE_PLACEHOLDER,
        'Body',
      ].join('\n')
    );
  });

  it('distinguishes authored blank lines from parser-only separators on paste', () => {
    expect(preserveMarkdownBlankLinesForPaste(['# A', '', '# B'].join('\n'))).toBe(
      ['# A', MARKDOWN_BLANK_LINE_PLACEHOLDER, '# B'].join('\n')
    );
    expect(preserveMarkdownBlankLinesForPaste(['# A', '## B', '### C'].join('\n'))).toBe(
      ['# A', '', '## B', '', '### C'].join('\n')
    );
    expect(preserveMarkdownBlankLinesForPaste(['Text', '', '$$', 'x', '$$'].join('\n'))).toBe(
      ['Text', MARKDOWN_BLANK_LINE_PLACEHOLDER, '$$', 'x', '$$'].join('\n')
    );
  });

  it('leaves source-tight html boundaries for schema metadata preservation', () => {
    const markdown = ['Before', '<p>Fresh HTML</p>'].join('\n');

    expect(preserveMarkdownBlankLinesForEditor(markdown)).toBe(markdown);
  });

  it('does not insert a boundary marker before an html closing tag', () => {
    const markdown = ['Beta', '</div>'].join('\n');

    expect(preserveMarkdownBlankLinesForEditor(markdown)).toBe(markdown);
  });

  it('keeps every authored line in multi-blank paste runs as an editor-only block', () => {
    expect(preserveMarkdownBlankLinesForPaste(['# A', '', '', '# B'].join('\n'))).toBe(
      [
        '# A',
        MARKDOWN_BLANK_LINE_PLACEHOLDER,
        MARKDOWN_BLANK_LINE_PLACEHOLDER,
        '# B',
      ].join('\n')
    );
  });

  it.each([
    [['# Heading', '', '> Quote'], ['# Heading', MARKDOWN_BLANK_LINE_PLACEHOLDER, '> Quote']],
    [
      ['Body', '', '```code', 'code', '```'],
      ['Body', MARKDOWN_BLANK_LINE_PLACEHOLDER, '```code', 'code', '```'],
    ],
    [
      ['```code', 'code', '```', '', '# Heading'],
      ['```code', 'code', '```', MARKDOWN_BLANK_LINE_PLACEHOLDER, '# Heading'],
    ],
  ])('keeps a user paste blank line when compact serialization would omit it', (markdown, expected) => {
    expect(preserveMarkdownBlankLinesForPaste(markdown.join('\n'))).toBe(expected.join('\n'));
  });

  it.each([
    [
      ['# First', '', '## Second'],
      ['# First', MARKDOWN_BLANK_LINE_PLACEHOLDER, '## Second'],
    ],
    [
      ['```ts', 'first', '```', '', '```js', 'second', '```'],
      ['```ts', 'first', '```', MARKDOWN_BLANK_LINE_PLACEHOLDER, '```js', 'second', '```'],
    ],
  ])('keeps authored paste blank lines between serializer-tight blocks', (markdown, expected) => {
    expect(preserveMarkdownBlankLinesForPaste(markdown.join('\n'))).toBe(expected.join('\n'));
  });

  it('uses editor-only blank line blocks after leading frontmatter', () => {
    const markdown = [
      '---',
      'vlaina_icon: "note"',
      'vlaina_updated: "2026-05-05T03:12:51.625Z"',
      '---',
      '1',
      '',
      '2',
      '',
      '3',
      '',
      '4',
      '',
    ].join('\n');

    expect(preserveMarkdownBlankLinesForEditor(markdown)).toBe([
      '---',
      'vlaina_icon: "note"',
      'vlaina_updated: "2026-05-05T03:12:51.625Z"',
      '---',
      '1',
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
      '2',
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
      '3',
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
      '4',
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
    ].join('\n'));
  });

  it('preserves long body blank line runs as editor-visible blank lines', () => {
    const blankLineCount = 200;
    const blankRun = Array.from({ length: blankLineCount }, () => '').join('\n');
    const markdown = ['before', blankRun, 'after'].join('\n');
    const editorInput = preserveMarkdownBlankLinesForEditor(markdown);

    expect(editorInput.split('\n').filter((line) => line === MARKDOWN_BLANK_LINE_PLACEHOLDER))
      .toHaveLength(blankLineCount);
    expect(editorInput).toContain('before');
    expect(editorInput).toContain('after');
    expect(normalizeSerializedMarkdownDocument(editorInput)).toBe(markdown);
  });

  it('does not cap long blank line runs inside fenced code blocks', () => {
    const blankRun = Array.from({ length: 20 }, () => '').join('\n');
    const markdown = ['```', 'before', blankRun, 'after', '```'].join('\n');

    expect(preserveMarkdownBlankLinesForEditor(markdown)).toBe(markdown);
  });

  it('does not inject editor blank-line comments inside display math blocks', () => {
    const dollarMath = ['$$', '', 'hi', '', '$$'].join('\n');
    const bracketMath = ['\\[', '', 'x^2', '', '\\]'].join('\n');

    expect(preserveMarkdownBlankLinesForEditor(dollarMath)).toBe(dollarMath);
    expect(preserveMarkdownBlankLinesForEditor(bracketMath)).toBe(bracketMath);
  });

  it('keeps editor blank-line comments outside adjacent display math blocks', () => {
    const markdown = ['$$', 'hi', '$$', '', '$$', 'bye', '$$'].join('\n');

    expect(preserveMarkdownBlankLinesForEditor(markdown)).toBe([
      '$$',
      'hi',
      '$$',
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
      '$$',
      'bye',
      '$$',
    ].join('\n'));
  });

  it.each([1, 2])(
    'keeps %s editor blank-line placeholder(s) after list-contained display math',
    (blankLineCount) => {
      const markdown = [
        '- $$',
        '  x + y',
        '  $$',
        ...Array.from({ length: blankLineCount }, () => ''),
        '[TOC]',
      ].join('\n');

      expect(preserveMarkdownBlankLinesForEditor(markdown)).toBe([
        '- $$',
        '  x + y',
        '  $$',
        ...Array.from({ length: blankLineCount }, () => MARKDOWN_BLANK_LINE_PLACEHOLDER),
        '[TOC]',
      ].join('\n'));
    },
  );

  it('handles long blank line runs inside indented code blocks within the default test timeout', () => {
    const blankRun = Array.from({ length: 8_000 }, () => '').join('\n');
    const markdown = ['    before', blankRun, '    after', '', 'body'].join('\n');

    expect(normalizeSerializedMarkdownDocument(preserveMarkdownBlankLinesForEditor(markdown))).toBe(markdown);
  });

  it('does not expose internal user break markers in editor input', () => {
    expect(preserveMarkdownBlankLinesForEditor(['1', '<br />', '2'].join('\n'))).toBe(
      ['1\\', '2'].join('\n')
    );
  });

  it('uses one quote-scoped empty paragraph placeholder per authored blockquote blank line', () => {
    const placeholder = '<!--vlaina-markdown-blank-line-->';

    expect(preserveMarkdownBlankLinesForEditor([
      '> Alpha',
      '>',
      '>',
      '> Beta',
      '> >',
      '> > Gamma',
    ].join('\n'))).toBe([
      '> Alpha',
      `> ${placeholder}`,
      `> ${placeholder}`,
      '> Beta',
      `> > ${placeholder}`,
      '> > Gamma',
    ].join('\n'));
  });

  it('uses quote-scoped list gap items between blockquote list rows', () => {
    expect(preserveMarkdownBlankLinesForEditor([
      '> 1. parent',
      '>    1. child one',
      '>',
      '>    2. child two',
      '>',
      '> 2. next',
    ].join('\n'))).toBe([
      '> 1. parent',
      '>    1. child one',
      '>    - \u2800',
      '>    2. child two',
      '> - \u2800',
      '> 2. next',
    ].join('\n'));
  });

  it('expands terminal list item br tags into editor-reopenable hard breaks', () => {
    expect(preserveMarkdownBlankLinesForEditor('- 1<br />')).toBe(['- 1\\', '  <br />'].join('\n'));
    expect(preserveMarkdownBlankLinesForEditor('- [ ] 1<br />')).toBe(['- [ ] 1\\', '  <br />'].join('\n'));
    expect(preserveMarkdownBlankLinesForEditor('1. 1<br />')).toBe(['1. 1\\', '   <br />'].join('\n'));
    expect(preserveMarkdownBlankLinesForEditor('> - 1<br />')).toBe(['> - 1\\', '>   <br />'].join('\n'));
  });

  it('preserves source trailing backslashes before editor parsing', () => {
    const markdown = [
      '7）视图模式：支持大纲和文档列表视图，方便在不同段落和不同文件之间进行切换。\\',
      '8）跨平台：支持macOS、Windows和Linux系统。\\',
      '9）目前免费：这么好用的编辑器竟然是免费的。',
    ].join('\n');

    expect(preserveMarkdownBlankLinesForEditor(markdown)).toBe(markdown);
  });

  it('preserves paragraph trailing backslashes when the text contains inline markdown', () => {
    const markdown = '底线（-/=）方式（**不推荐**）：\\';

    expect(preserveMarkdownBlankLinesForEditor(markdown)).toBe(markdown);
  });

  it('escapes a standalone line-start backslash as literal text instead of a hard break', () => {
    expect(preserveMarkdownBlankLinesForEditor(['\\', '下一行'].join('\n'))).toBe(
      ['\\\\', NON_PERSISTED_BLOCK_BOUNDARY_PLACEHOLDER, '下一行'].join('\n')
    );
    expect(preserveMarkdownBlankLinesForEditor(['', '\\', '下一行'].join('\n'))).toBe(
      [MARKDOWN_BLANK_LINE_PLACEHOLDER, '\\\\', NON_PERSISTED_BLOCK_BOUNDARY_PLACEHOLDER, '下一行'].join('\n')
    );
  });

  it('preserves paragraph trailing backslashes inside mixed markdown documents', () => {
    const markdown = [
      '# Heading',
      '',
      '底线（-/=）方式（**不推荐**）：\\',
      '',
      '- item\\',
    ].join('\n');

    expect(preserveMarkdownBlankLinesForEditor(markdown)).toBe([
      '# Heading',
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
      '底线（-/=）方式（**不推荐**）：\\',
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
      '- item\\',
    ].join('\n'));
  });

  it('keeps structural markdown trailing backslashes as hard breaks', () => {
    const markdown = ['- item\\', '- next'].join('\n');

    expect(preserveMarkdownBlankLinesForEditor(markdown)).toBe(markdown);
  });

  it('does not add placeholders inside fenced code blocks', () => {
    const markdown = ['```ts', 'const a = 1;', '', 'const b = 2;', '```', '', 'after'].join('\n');
    const editorInput = preserveMarkdownBlankLinesForEditor(markdown);

    expect(editorInput).toContain(['```ts', 'const a = 1;', '', 'const b = 2;', '```'].join('\n'));
    expect(normalizeSerializedMarkdownDocument(editorInput)).toBe(markdown);
  });

  it('does not rewrite br-only lines inside fenced code blocks', () => {
    expect(
      preserveMarkdownBlankLinesForEditor(['```html', '<br />', '```'].join('\n'))
    ).toBe(['```html', '<br />', '```'].join('\n'));
  });

  it('does not rewrite internal user break sentinel text inside fenced code blocks', () => {
    const markdown = ['```txt', '\u0000VLAINA_USER_BR_SENTINEL\u0000', '```'].join('\n');

    expect(preserveMarkdownBlankLinesForEditor(markdown)).toBe(markdown);
  });

  it('does not rewrite list-like gaps inside fenced code blocks', () => {
    expect(
      preserveMarkdownBlankLinesForEditor(['```md', '- one', '', '- two', '```'].join('\n'))
    ).toBe(['```md', '- one', '', '- two', '```'].join('\n'));
  });

  it('uses visible editor-only placeholders for markdown blank lines between list items', () => {
    expect(
      preserveMarkdownBlankLinesForEditor(['- one', '', '', '- two'].join('\n'))
    ).toBe(
      [
        '- one',
        '- \u2800',
        '- \u2800',
        '- two',
      ].join('\n')
    );
    expect(
      preserveMarkdownBlankLinesForEditor(['-', '', '- filled'].join('\n'))
    ).toBe(['- <br />', '- \u2800', '- filled'].join('\n'));
    expect(
      preserveMarkdownBlankLinesForEditor(['1.', '', '2. filled'].join('\n'))
    ).toBe(['1. <br />', '- \u2800', '2. filled'].join('\n'));
  });

  it('uses visible editor-only placeholders between headings and top-level lists', () => {
    const headingBeforeList = ['# 1', '', '1. 1'].join('\n');
    const listBeforeHeading = ['1. 1', '', '# 2'].join('\n');

    expect(preserveMarkdownBlankLinesForEditor(headingBeforeList)).toBe(
      ['# 1', MARKDOWN_BLANK_LINE_PLACEHOLDER, '1. 1'].join('\n')
    );
    expect(normalizeSerializedMarkdownDocument(
      preserveMarkdownBlankLinesForEditor(headingBeforeList)
    )).toBe(headingBeforeList);

    expect(preserveMarkdownBlankLinesForEditor(listBeforeHeading)).toBe(
      ['1. 1', MARKDOWN_BLANK_LINE_PLACEHOLDER, '# 2'].join('\n')
    );
    expect(normalizeSerializedMarkdownDocument(
      preserveMarkdownBlankLinesForEditor(listBeforeHeading)
    )).toBe(listBeforeHeading);
  });

  it('uses plain bullet placeholders for task-list blank lines', () => {
    expect(
      preserveMarkdownBlankLinesForEditor(['- [ ] one', '', '- [ ] two'].join('\n'))
    ).toBe(
      [
        '- [ ] one',
        '- \u2800',
        '- [ ] two',
      ].join('\n')
    );
    expect(
      preserveMarkdownBlankLinesForEditor(['- [ ]', '', '- [x] done'].join('\n'))
    ).toBe(
      [
        '- [ ] <br />',
        '- \u2800',
        '- [x] done',
      ].join('\n')
    );
  });

  it.each([
    {
      name: 'bullet',
      markdown: ['- parent', '  - child', '', '- next'],
      expected: ['- parent', '  - child', '- \u2800', '- next'],
    },
    {
      name: 'task',
      markdown: ['- [ ] parent', '  - [x] child', '', '', '- [ ] next'],
      expected: ['- [ ] parent', '  - [x] child', '- \u2800', '- \u2800', '- [ ] next'],
    },
    {
      name: 'ordered',
      markdown: ['1. parent', '   1. child', '', '2. next'],
      expected: ['1. parent', '   1. child', '- \u2800', '2. next'],
    },
  ])('keeps every authored blank line from a nested $name item to its root sibling', ({
    markdown,
    expected,
  }) => {
    expect(preserveMarkdownBlankLinesForEditor(markdown.join('\n'))).toBe(expected.join('\n'));
  });

  it.each([
    {
      name: 'bullet',
      markdown: ['- parent', '', '  - child'],
      expected: ['- parent', '  - \u2800', '  - child'],
    },
    {
      name: 'ordered',
      markdown: ['1. parent', '', '', '   1. child'],
      expected: ['1. parent', '   - \u2800', '   - \u2800', '   1. child'],
    },
  ])('keeps every authored blank line from a $name parent to its nested child', ({
    markdown,
    expected,
  }) => {
    expect(preserveMarkdownBlankLinesForEditor(markdown.join('\n'))).toBe(expected.join('\n'));
  });

  it('finds a root task parent through indented detail lines after a nested child', () => {
    const markdown = [
      '- [ ] parent',
      '',
      '  details',
      '',
      '  - nested child',
      '',
      '- [x] next',
    ];

    expect(preserveMarkdownBlankLinesForEditor(markdown.join('\n'))).toBe([
      '- [ ] parent',
      '',
      '  details',
      '',
      '  - nested child',
      '- \u2800',
      '- [x] next',
    ].join('\n'));
  });

  it('does not treat a list inside a deeper blockquote as a nested child list', () => {
    expect(preserveMarkdownBlankLinesForEditor(['- root', '', '> - quoted'].join('\n'))).toBe([
      '- root',
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
      '> - quoted',
    ].join('\n'));
  });

  it('counts blank lines once between list raw HTML and a different list style', () => {
    const block = ['- <textarea>', '  hidden', '  </textarea>'];
    const next = ['- [ ] Task', '- [x] Done'];
    const oneBlank = [...block, '', ...next].join('\n');
    const twoBlanks = [...block, '', '', ...next].join('\n');

    expect(preserveMarkdownBlankLinesForEditor(oneBlank)).toBe(oneBlank);
    expect(preserveMarkdownBlankLinesForEditor(twoBlanks)).toBe([
      ...block,
      '',
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
      ...next,
    ].join('\n'));
    expect(normalizeSerializedMarkdownDocument(
      preserveMarkdownBlankLinesForEditor(twoBlanks)
    )).toBe(twoBlanks);
  });

  it.each([
    ['- plain', '- [ ] task'],
    ['- [ ] task', '- plain'],
    ['- bullet', '1. ordered'],
    ['1. ordered', '- bullet'],
    ['* parent\n  * nested', '- [ ] task'],
    ['* parent\n  * nested', '1. ordered'],
  ])('uses a standalone blank-line block between different list styles: %s -> %s', (before, after) => {
    expect(preserveMarkdownBlankLinesForEditor([before, '', after].join('\n'))).toBe([
      before,
      '',
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
      after,
    ].join('\n'));
  });

  it('does not rewrite content inside blockquote fenced code blocks', () => {
    const markdown = ['> ```md', '> - one', '>', '> - two', '> ```'].join('\n');

    expect(preserveMarkdownBlankLinesForEditor(markdown)).toBe(markdown);
  });

  it('does not rewrite content inside nested blockquote fenced code blocks', () => {
    const markdown = ['> > ```md', '> > - one', '> >', '> > - two', '> > ```'].join('\n');

    expect(preserveMarkdownBlankLinesForEditor(markdown)).toBe(markdown);
  });

  it('does not add placeholders inside normalized frontmatter fences', () => {
    const opening = `\`\`\`${getFrontmatterFenceLanguage()} ${getFrontmatterFenceMeta()}`;
    const markdown = [opening, 'title: Demo', '', 'summary: Test', '```', '', '# Heading'].join('\n');
    const editorInput = preserveMarkdownBlankLinesForEditor(markdown);

    expect(editorInput).toContain([opening, 'title: Demo', '', 'summary: Test', '```'].join('\n'));
    expect(normalizeSerializedMarkdownDocument(editorInput)).toBe(markdown);
  });

  it('uses editor-only blocks for image blank lines at serializer-tight boundaries', () => {
    const markdown = ['![alt](image.png)', '', '', '', '# Next'].join('\n');
    const editorInput = preserveMarkdownBlankLinesForEditor(markdown);

    expect(editorInput).toBe([
      '![alt](image.png)',
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
      '# Next',
    ].join('\n'));
    expect(normalizeSerializedMarkdownDocument(editorInput)).toBe(markdown);
  });

  it('uses an editor-only block for an image blank line before a paragraph', () => {
    const markdown = ['![alt](image.png)', '', 'Body'].join('\n');

    expect(preserveMarkdownBlankLinesForEditor(markdown)).toBe([
      '![alt](image.png)',
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
      'Body',
    ].join('\n'));
  });

  it('keeps the structural separator and uses editor-only blocks for extra blank lines after html image blocks', () => {
    const markdown = ['<img src="image.png" />', '', '', '', '# Next'].join('\n');
    const editorInput = preserveMarkdownBlankLinesForEditor(markdown);

    expect(editorInput).toBe([
      '<img src="image.png" />',
      '',
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
      '# Next',
    ].join('\n'));
    expect(normalizeSerializedMarkdownDocument(editorInput)).toBe(markdown);
  });

  it('keeps the structural separator after source html blocks', () => {
    const markdown = ['<source srcset="images/a.webp 1x">', '', '# Next'].join('\n');
    const editorInput = preserveMarkdownBlankLinesForEditor(markdown);

    expect(editorInput).toBe(markdown);
    expect(normalizeSerializedMarkdownDocument(editorInput)).toBe(markdown);
  });

  it('matches fenced code closers by marker and length', () => {
    const markdown = ['````', '```', '', 'code', '````', '', 'after'].join('\n');

    expect(normalizeSerializedMarkdownDocument(preserveMarkdownBlankLinesForEditor(markdown))).toBe(markdown);
  });

  it('does not close a fenced code block with a content line that only starts with a fence', () => {
    const markdown = ['```', '```still code', '', '```', '', 'after'].join('\n');

    expect(normalizeSerializedMarkdownDocument(preserveMarkdownBlankLinesForEditor(markdown))).toBe(markdown);
  });

  it('does not treat indented code as fenced code', () => {
    const markdown = ['    ```', '', 'after'].join('\n');

    expect(normalizeSerializedMarkdownDocument(preserveMarkdownBlankLinesForEditor(markdown))).toBe(markdown);
  });

  it('does not add placeholders inside indented code blocks', () => {
    const markdown = ['    line 1', '', '    line 2', '', 'after'].join('\n');
    const editorInput = preserveMarkdownBlankLinesForEditor(markdown);

    expect(editorInput).toContain(['    line 1', '', '    line 2'].join('\n'));
    expect(normalizeSerializedMarkdownDocument(editorInput)).toBe(markdown);
  });

  it('does not add placeholders inside tab-indented code blocks', () => {
    const markdown = ['\tline 1', '', '\tline 2', '', 'after'].join('\n');
    const editorInput = preserveMarkdownBlankLinesForEditor(markdown);

    expect(editorInput).toContain(['\tline 1', '', '\tline 2'].join('\n'));
    expect(normalizeSerializedMarkdownDocument(editorInput)).toBe(markdown);
  });

  it('detects indented code blocks after paragraph breaks', () => {
    const markdown = ['before', '', '    line 1', '', '    line 2'].join('\n');
    const editorInput = preserveMarkdownBlankLinesForEditor(markdown);

    expect(editorInput).toBe([
      'before',
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
      '    line 1',
      '',
      '    line 2',
    ].join('\n'));
    expect(normalizeSerializedMarkdownDocument(editorInput)).toBe(markdown);
  });

  it('exposes an authored blank line between indented code and a root list', () => {
    const markdown = ['    const value = 1;', '', '1. Ordered'].join('\n');

    expect(preserveMarkdownBlankLinesForEditor(markdown)).toBe([
      '    const value = 1;',
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
      '1. Ordered',
    ].join('\n'));
  });

  it('keeps structural blank lines before fenced code blocks', () => {
    const markdown = ['before', '', '```ts', 'const value = 1;', '```'].join('\n');

    expect(normalizeSerializedMarkdownDocument(preserveMarkdownBlankLinesForEditor(markdown))).toBe(markdown);
  });

  it('keeps structural blank lines before nested fenced code blocks', () => {
    const markdown = [
      '- item',
      '',
      '  detail',
      '',
      '  ```ts',
      '  const value = 1;',
      '  ```',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(preserveMarkdownBlankLinesForEditor(markdown))).toBe(markdown);
  });

  it('exposes a blank line between list-contained code and a quoted list', () => {
    const markdown = [
      '- ```ts',
      '  nested code',
      '  ```',
      '',
      '> - ```md',
      '>   quoted code',
      '>   ```',
    ].join('\n');
    const editorInput = preserveMarkdownBlankLinesForEditor(markdown);

    expect(editorInput).toContain([
      '  ```',
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
      '> - ```md',
    ].join('\n'));
    expect(normalizeSerializedMarkdownDocument(editorInput)).toBe(markdown);
  });

  it('keeps trailing document blank lines after indented text', () => {
    const markdown = ['    line', ''].join('\n');

    expect(normalizeSerializedMarkdownDocument(preserveMarkdownBlankLinesForEditor(markdown))).toBe(markdown);
  });

  it('does not rewrite placeholder-like text inside indented code blocks', () => {
    const markdown = [`    ${LEGACY_EMPTY_LINE_PLACEHOLDER}`, '', '    <br />', '', 'after'].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('does not treat backtick fences with backticks in the info string as fenced code', () => {
    const markdown = ['``` invalid ` info', '', 'after'].join('\n');

    expect(normalizeSerializedMarkdownDocument(preserveMarkdownBlankLinesForEditor(markdown))).toBe(markdown);
  });

  it('does not treat mixed backtick and tilde marker runs as fenced code', () => {
    const markdown = ['``~', '', 'after'].join('\n');

    expect(normalizeSerializedMarkdownDocument(preserveMarkdownBlankLinesForEditor(markdown))).toBe(markdown);
  });

  it('does not add placeholders inside raw html blocks that allow blank lines', () => {
    const markdown = ['<pre>', 'line 1', '', 'line 2', '</pre>', '', 'after'].join('\n');
    const editorInput = preserveMarkdownBlankLinesForEditor(markdown);

    expect(editorInput).toContain(['<pre>', 'line 1', '', 'line 2', '</pre>'].join('\n'));
    expect(normalizeSerializedMarkdownDocument(editorInput)).toBe(markdown);
  });

  it('does not start fenced code state inside raw html blocks', () => {
    const markdown = ['<pre>', '```', '', '```', '</pre>', '', 'after'].join('\n');

    expect(normalizeSerializedMarkdownDocument(preserveMarkdownBlankLinesForEditor(markdown))).toBe(markdown);
  });

  it('does not add placeholders inside blockquote raw html blocks', () => {
    const markdown = ['> <pre>', '>', '> </pre>'].join('\n');

    expect(preserveMarkdownBlankLinesForEditor(markdown)).toBe(markdown);
  });

  it('does not add placeholders inside markdown html comments', () => {
    const markdown = ['<!--', 'note', '', 'comment', '-->', '', 'after'].join('\n');
    const editorInput = preserveMarkdownBlankLinesForEditor(markdown);

    expect(editorInput).toContain(['<!--', 'note', '', 'comment', '-->'].join('\n'));
    expect(normalizeSerializedMarkdownDocument(editorInput)).toBe(markdown);
  });

  it.each([0, 1, 2])(
    'keeps %s authored blank line(s) around block alignment comments structural',
    (blankLineCount) => {
      const blanks = Array.from({ length: blankLineCount }, () => '');
      const markdown = [
        'Paragraph',
        ...blanks,
        '<!--align:center-->',
        ...blanks,
        '# Heading',
      ].join('\n');

      expect(preserveMarkdownBlankLinesForEditor(markdown)).toBe(markdown);
    },
  );

  it('does not add placeholders inside lowercase html declarations', () => {
    const markdown = ['<!doctype', '', 'html>', '', 'after'].join('\n');

    expect(normalizeSerializedMarkdownDocument(preserveMarkdownBlankLinesForEditor(markdown))).toBe(markdown);
  });

  it('keeps structural blank lines after one-line html blocks', () => {
    const markdown = ['<?note value?>', '', '<!doctype html>', '', 'after'].join('\n');

    expect(normalizeSerializedMarkdownDocument(preserveMarkdownBlankLinesForEditor(markdown))).toBe(markdown);
  });

  it('uses an editor-only blank line block after rendered one-line html blocks', () => {
    const markdown = ['<p align="center">HTML</p>', '', 'after'].join('\n');
    const editorInput = preserveMarkdownBlankLinesForEditor(markdown);

    expect(editorInput).toBe([
      '<p align="center">HTML</p>',
      '',
      RENDERED_HTML_BOUNDARY_PLACEHOLDER,
      'after',
    ].join('\n'));
    expect(normalizeSerializedMarkdownDocument(editorInput)).toBe(markdown);
  });

  it('uses an editor-only blank line block after rendered multi-line html blocks', () => {
    const markdown = [
      '<p align="center">',
      '  <img src="logo.png"><br>',
      'HTML',
      '</p>',
      '',
      'after',
    ].join('\n');
    const editorInput = preserveMarkdownBlankLinesForEditor(markdown);

    expect(editorInput).toBe([
      '<p align="center">',
      '  <img src="logo.png"><br>',
      'HTML',
      '</p>',
      '',
      RENDERED_HTML_BOUNDARY_PLACEHOLDER,
      'after',
    ].join('\n'));
    expect(normalizeSerializedMarkdownDocument(editorInput)).toBe(markdown);
  });

  it('keeps the parser terminator after non-editable html blocks', () => {
    const markdown = ['<svg>', '<text>hidden</text>', '</svg>', '', '# After'].join('\n');
    const editorInput = preserveMarkdownBlankLinesForEditor(markdown);

    expect(editorInput).toBe(markdown);
    expect(normalizeSerializedMarkdownDocument(editorInput)).toBe(markdown);
  });

  it.each(
    ['math', 'noembed', 'noscript', 'plaintext', 'svg', 'textarea', 'xmp'].flatMap((tagName) =>
      [0, 1, 2].map((blankLineCount) => ({ blankLineCount, tagName }))
    )
  )(
    'preserves $blankLineCount blank line(s) after blank-terminated <$tagName> html',
    ({ blankLineCount, tagName }) => {
      const markdown = [
        `<${tagName}>`,
        'hidden source',
        `</${tagName}>`,
        ...Array.from({ length: blankLineCount }, () => ''),
        '# After',
      ].join('\n');

      expect(normalizeSerializedMarkdownDocument(
        preserveMarkdownBlankLinesForEditor(markdown)
      )).toBe(markdown);
    },
  );

  it.each([
    ['multiline html', ['<div>', 'HTML', '</div>']],
    ['one-line html', ['<p align="center">HTML</p>']],
    ['html image', ['<img src="./assets/demo.svg" alt="Demo" />']],
    ['section html', ['<section>HTML</section>']],
  ])('does not duplicate rendered html boundary blocks on reopen: %s', (_label, htmlLines) => {
    const markdown = [
      ...htmlLines,
      '',
      RENDERED_HTML_BOUNDARY_PLACEHOLDER,
      'after',
    ].join('\n');

    expect(preserveMarkdownBlankLinesForEditor(markdown)).toBe(markdown);
  });

  it('strips editor-only blank line comments next to one-line html blocks on save', () => {
    const markdown = [
      '<p align="center">HTML</p>',
      '',
      RENDERED_HTML_BOUNDARY_PLACEHOLDER,
      'after',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe([
      '<p align="center">HTML</p>',
      '',
      'after',
    ].join('\n'));
  });

  it('round trips representative markdown through preserve and normalize', () => {
    const markdown = [
      '# Heading',
      '',
      'Paragraph with **strong** and [link](https://example.com).',
      '',
      '> Quote',
      '>',
      '> - [ ] task',
      '',
      '| a | b |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '```ts',
      'const value = 1;',
      '',
      'console.log(value);',
      '```',
      '',
      '<pre>',
      '',
      '</pre>',
      '',
      '    code line 1',
      '',
      '    code line 2',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(preserveMarkdownBlankLinesForEditor(markdown))).toBe(markdown);
  });
});
