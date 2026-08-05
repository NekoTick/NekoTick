import { describe, expect, it } from 'vitest';
import { resolvePendingMarkdownUpdate, serializeEditorMarkdownSnapshot } from './pendingMarkdownUpdate';

describe('resolvePendingMarkdownUpdate', () => {
  it('replaces a stale markdown listener snapshot with the live editor doc', () => {
    const currentWithMetadata = [
      '---',
      'vlaina_cover: "@biva/2"',
      'vlaina_updated: "2026-05-06T08:40:49.601Z"',
      '---',
      '# 官网测试',
      '### strip',
      '',
      'dfdsfd',
      '',
      'r',
    ].join('\n');
    const stalePending = currentWithMetadata;
    const liveSerializedMarkdown = [
      '# 官网测试',
      '',
      '### strip',
      '',
      'dfdsfd',
      '',
      'rtgyhui',
    ].join('\n');

    const expected = [
      '---',
      'vlaina_cover: "@biva/2"',
      '---',
      '# 官网测试',
      '',
      '### strip',
      '',
      'dfdsfd',
      'rtgyhui',
    ].join('\n');

    expect(
      resolvePendingMarkdownUpdate({
        pendingMarkdown: stalePending,
        latestNoteContent: currentWithMetadata,
        liveSerializedMarkdown,
      }),
    ).toEqual({
      markdownToApply: expected,
      source: 'live-editor',
      liveMarkdown: expected,
    });
  });

  it('uses the live editor doc when pending still equals the latest note content', () => {
    const latestNoteContent = [
      '---',
      'vlaina_icon: "🫧"',
      'vlaina_updated: "2026-05-06T08:40:49.601Z"',
      '---',
      '# 官网测试',
      '### strip',
      '',
      'dfdsfd',
      '',
      '',
      'rtgyhui',
      '',
    ].join('\n');
    const liveSerializedMarkdown = [
      '# 官网测试',
      '',
      '### strip',
      '',
      'dfdsfd',
      '',
      'rtgyhui',
    ].join('\n');

    const expected = [
      '---',
      'vlaina_icon: "🫧"',
      '---',
      '# 官网测试',
      '',
      '### strip',
      '',
      'dfdsfd',
      'rtgyhui',
    ].join('\n');

    expect(
      resolvePendingMarkdownUpdate({
        pendingMarkdown: latestNoteContent,
        latestNoteContent,
        liveSerializedMarkdown,
      }),
    ).toEqual({
      markdownToApply: expected,
      source: 'live-editor',
      liveMarkdown: expected,
    });
  });

  it('normalizes live editor serialization before it reaches note state', () => {
    const latestNoteContent = [
      '---',
      'vlaina_cover: "@biva/2"',
      '---',
      'old body',
    ].join('\n');
    const liveSerializedMarkdown = [
      '\\==highlight==',
      '',
      '\\*[ABBR]: Full phrase',
      '',
      '[^1]: <br />',
      '',
      '| A | B |',
      '| - | - |',
      '| <br /> | <br /> |',
    ].join('\n');

    const expected = [
      '---',
      'vlaina_cover: "@biva/2"',
      '---',
      '\\==highlight==',
      '\\*[ABBR]: Full phrase',
      '',
      '[^1]:',
      '',
      '| A | B |',
      '| - | - |',
      '|   |   |',
    ].join('\n');

    expect(
      resolvePendingMarkdownUpdate({
        pendingMarkdown: latestNoteContent,
        latestNoteContent,
        liveSerializedMarkdown,
      }),
    ).toEqual({
      markdownToApply: expected,
      source: 'live-editor',
      liveMarkdown: expected,
    });
  });

  it('strips the automatic trailing newline from editor serialization', () => {
    expect(serializeEditorMarkdownSnapshot('1\n\n2\n', '1')).toBe('1\n2');
  });

  it('restores only serializer-added punctuation escapes from the reference note', () => {
    const reference = [
      'Intro',
      '2. item',
      '2) item',
      '2)item',
      '#tag',
      '##tag',
      '[label]',
      '[ label ]',
      'https:/example.test',
      '-: text',
      '-| text',
      '--text',
      '=text',
      '| text',
      'Dollar $ value',
      'Backtick ` value',
    ].join('\n');
    const serialized = [
      'Intro',
      '2\\. item',
      '2\\) item',
      '2\\)item',
      '\\#tag',
      '\\##tag',
      '\\[label]',
      '\\[ label ]',
      'https\\:/example.test',
      '\\-: text',
      '\\-| text',
      '\\--text',
      '\\=text',
      '\\| text',
      'Dollar \\$ value',
      'Backtick \\` value',
    ].join('\n');

    expect(serializeEditorMarkdownSnapshot(serialized, reference)).toBe(reference);
  });

  it('restores escapes after a reference-only line is removed', () => {
    const serialized = ['Header', '\\[label]'].join('\n');
    const reference = ['Header', 'removed reference line', '[label]'].join('\n');

    expect(serializeEditorMarkdownSnapshot(serialized, reference)).toBe('Header\n[label]');
  });

  it('preserves explicit reference escapes and escapes on edited lines', () => {
    expect(serializeEditorMarkdownSnapshot('Intro\n2\\. item', 'Intro\n2\\. item')).toBe(
      'Intro\n2\\. item'
    );
    expect(serializeEditorMarkdownSnapshot('left\\\\right', 'left\\\\right')).toBe(
      'left\\\\right'
    );
    expect(serializeEditorMarkdownSnapshot('Intro\n2\\. changed', 'Intro\n2. item')).toBe(
      'Intro\n2\\. changed'
    );
  });

  it('does not restore an authored escape over a structural formatting change', () => {
    expect(serializeEditorMarkdownSnapshot('# Heading', '\\# Heading')).toBe('# Heading');
    expect(serializeEditorMarkdownSnapshot('2. item', '2\\. item')).toBe('2. item');
    expect(serializeEditorMarkdownSnapshot('*literal*', '\\*literal\\*')).toBe('*literal*');
  });

  it('restores missing authored escapes beside serializer-preserved escapes', () => {
    const reference = [
      'Authored escapes:',
      'left\\!right left\\@right left\\_right left\\|right',
      '\\# literal heading',
    ].join('\n');
    const serialized = [
      'Authored escapes:',
      'left\\!right left@right left_right left\\|right',
      '\\# literal heading edited',
    ].join('\n');

    expect(serializeEditorMarkdownSnapshot(serialized, reference)).toBe([
      'Authored escapes:',
      'left\\!right left\\@right left\\_right left\\|right',
      '\\# literal heading edited',
    ].join('\n'));
  });

  it('keeps generated bracket math fences inside containers', () => {
    const serialized = ['> \\[', '> x + y', '> \\]'].join('\n');
    const reference = ['> [', '> x + y', '> ]'].join('\n');

    expect(serializeEditorMarkdownSnapshot(serialized, reference)).toBe(serialized);
  });

  it('keeps the structural separator before a definition list term', () => {
    const markdown = ['Paragraph before.', '', 'Term', '', ': Definition', ''].join('\n');

    expect(serializeEditorMarkdownSnapshot(markdown, '')).toBe(markdown.trimEnd());
  });

  it('preserves compact blockquote marker spacing from the reference note', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        ['> 引用', '>', '> > 嵌套引用', ''].join('\n'),
        ['>引用', '>>嵌套引用'].join('\n'),
      )
    ).toBe(['>引用', '>>嵌套引用'].join('\n'));
  });

  it('preserves thematic break marker style from the reference note', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        ['Before', '', '---', '', '---', '', 'After', ''].join('\n'),
        ['Before', '', '***', '', '___', '', 'After'].join('\n'),
      )
    ).toBe(['Before', '', '***', '', '___', '', 'After'].join('\n'));
  });

  it('restores leading thematic breaks before frontmatter-sensitive artifact cleanup', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        [
          '---',
          '<!--vlaina-markdown-blank-line-->',
          '---',
          '<!--vlaina-markdown-blank-line-->',
          'After',
          '',
        ].join('\n'),
        ['***', '', '***', '', 'After'].join('\n'),
      )
    ).toBe(['***', '', '***', '', 'After'].join('\n'));
  });

  it('preserves setext heading style from the reference note', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        ['# Alpha', '', 'Body', '', '## Beta', ''].join('\n'),
        ['Alpha', '=====', '', 'Body', '', 'Beta', '-----'].join('\n'),
      )
    ).toBe(['Alpha', '=====', '', 'Body', '', 'Beta', '-----'].join('\n'));
  });

  it('preserves closed atx heading style from the reference note', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        ['# Alpha', '', '### Gamma', ''].join('\n'),
        ['# Alpha #', '', '### Gamma ###'].join('\n'),
      )
    ).toBe(['# Alpha #', '', '### Gamma ###'].join('\n'));
  });

  it('preserves list marker style from the reference note', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        ['- star', '- plus', '- dash', '1. one', '2. two', '3. padded', ''].join('\n'),
        ['* star', '+ plus', '- dash', '1) one', '2) two', '03. padded'].join('\n'),
      )
    ).toBe(['* star', '+ plus', '- dash', '1) one', '2) two', '03. padded'].join('\n'));
  });

  it('does not restore list marker styles inside fenced code', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        ['- prose', '', '```', '- code', '```', ''].join('\n'),
        ['- prose', '', '```', '* code', '```'].join('\n'),
      )
    ).toBe(['- prose', '', '```', '- code', '```'].join('\n'));
  });

  it('preserves fenced code marker style from the reference note', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        ['```typescript', 'const value = 1;', '```', '', '```markdown', '- not a list', '```', ''].join('\n'),
        ['````ts', 'const value = 1;', '````', '', '~~~md', '- not a list', '~~~'].join('\n'),
      )
    ).toBe(['````ts', 'const value = 1;', '````', '', '~~~md', '- not a list', '~~~'].join('\n'));
  });

  it('preserves mermaid fence alias source without persisting generated directives', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        ['```mermaid', 'flowchart TD', 'A --> B', '```', ''].join('\n'),
        ['```flow', 'A --> B', '```'].join('\n'),
      )
    ).toBe(['```flow', 'A --> B', '```'].join('\n'));
  });

  it('preserves mermaid short directive source without persisting normalized directives', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        ['```mermaid', 'sequenceDiagram', 'Alice->Bob: Hello', '```', ''].join('\n'),
        ['```mermaid', 'sequence', 'Alice->Bob: Hello', '```'].join('\n'),
      )
    ).toBe(['```mermaid', 'sequence', 'Alice->Bob: Hello', '```'].join('\n'));
  });

  it('preserves tilde mermaid fence alias source', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        ['```mermaid', 'sequenceDiagram', 'Alice->Bob: Hello', '```', ''].join('\n'),
        ['~~~sequence', 'Alice->Bob: Hello', '~~~'].join('\n'),
      )
    ).toBe(['~~~sequence', 'Alice->Bob: Hello', '~~~'].join('\n'));
  });

  it('preserves mermaid alias source after frontmatter without injecting a directive', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        ['```mermaid', '---', 'title: Flow', '---', 'flowchart TD', 'A --> B', '```', ''].join('\n'),
        ['```flow', '---', 'title: Flow', '---', 'A --> B', '```'].join('\n'),
      )
    ).toBe(['```flow', '---', 'title: Flow', '---', 'A --> B', '```'].join('\n'));
  });

  it('preserves autolink marker style from the reference note', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        ['Visit https://example.com?a=1&b=2.', '', 'Tail', ''].join('\n'),
        ['Visit <https://example.com?a=1&b=2>.', '', 'Tail'].join('\n'),
      )
    ).toBe(['Visit <https://example.com?a=1&b=2>.', 'Tail'].join('\n'));
  });

  it('preserves same-email mailto markdown link style from the reference note', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        ['Email user@example.test for access.', ''].join('\n'),
        ['Email [user@example.test](mailto:user@example.test) for access.'].join('\n'),
      )
    ).toBe('Email [user@example.test](mailto:user@example.test) for access.');
  });

  it('preserves reference link style and definitions from the reference note', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        ['Read [Docs](https://example.com "Docs").', '', '', '', 'After', ''].join('\n'),
        ['Read [Docs][docs].', '', '[docs]: https://example.com "Docs"', '', '', 'After'].join('\n'),
      )
    ).toBe([
      'Read [Docs][docs].',
      '',
      '[docs]: https://example.com "Docs"',
      '',
      '',
      'After',
    ].join('\n'));
  });

  it('preserves reference links with escaped serialized query separators', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        ['Read [Docs](https://example.com?a=1\\&b=2 "Docs").', ''].join('\n'),
        ['Read [Docs][docs].', '', '[docs]: https://example.com?a=1&b=2 "Docs"'].join('\n'),
      )
    ).toBe(['Read [Docs][docs].', '', '[docs]: https://example.com?a=1&b=2 "Docs"'].join('\n'));
  });

  it('preserves unescaped query separators in inline links and images', () => {
    const reference = [
      '[Docs](https://example.test?a=1&b=2)',
      '![Image](image.png?a=1&b=2)',
    ].join('\n');
    const serialized = [
      '[Docs](https://example.test?a=1\\&b=2)',
      '![Image](image.png?a=1\\&b=2)',
    ].join('\n');

    expect(serializeEditorMarkdownSnapshot(serialized, reference)).toBe(reference);
  });

  it('preserves explicit link ampersand escapes per source occurrence', () => {
    const reference = [
      '[Plain](https://example.test?a=1&b=2)',
      '[Escaped](https://example.test?a=1\\&b=2)',
    ].join('\n');
    const serialized = [
      '[Plain](https://example.test?a=1\\&b=2)',
      '[Escaped](https://example.test?a=1\\&b=2)',
    ].join('\n');

    expect(serializeEditorMarkdownSnapshot(serialized, reference)).toBe(reference);
  });

  it('uses unescaped ampersands for new links without a source reference', () => {
    expect(
      serializeEditorMarkdownSnapshot('[Docs](https://example.test?a=1\\&b=2)', '')
    ).toBe('[Docs](https://example.test?a=1&b=2)');
  });

  it('does not rewrite link-like text inside fenced code', () => {
    const reference = ['```md', '[Docs](https://example.test?a=1&b=2)', '```'].join('\n');
    const serialized = ['```md', '[Docs](https://example.test?a=1\\&b=2)', '```'].join('\n');

    expect(serializeEditorMarkdownSnapshot(serialized, reference)).toBe(serialized);
  });

  it('preserves collapsed and shortcut reference link styles from the reference note', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        ['Read [Guide](https://example.com/guide "Guide") and [API](https://example.com/api).', ''].join('\n'),
        [
          'Read [Guide][] and [API].',
          '',
          '[guide]: https://example.com/guide "Guide"',
          '[api]: https://example.com/api',
        ].join('\n'),
      )
    ).toBe([
      'Read [Guide][] and [API].',
      '',
      '[guide]: https://example.com/guide "Guide"',
      '[api]: https://example.com/api',
    ].join('\n'));
  });

  it('preserves trailing reference definitions after list content', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        ['Read [Docs](https://example.com "Docs").', '', '- one', '', '- two', ''].join('\n'),
        ['Read [Docs][docs].', '', '- one', '', '- two', '', '[docs]: https://example.com "Docs"'].join('\n'),
      )
    ).toBe(['Read [Docs][docs].', '', '- one', '- two', '', '[docs]: https://example.com "Docs"'].join('\n'));
  });

  it('keeps bare autolinks bare when the reference note was bare', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        ['Visit https://example.com?a=1&b=2.', '', 'Email user@example.test.', ''].join('\n'),
        ['Visit https://example.com?a=1&b=2.', '', 'Email user@example.test.'].join('\n'),
      )
    ).toBe(['Visit https://example.com?a=1&b=2.', 'Email user@example.test.'].join('\n'));
  });

  it('does not restore autolink styles inside fenced code', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        ['https://example.com', '', '```', 'https://example.com', '```', ''].join('\n'),
        ['<https://example.com>', '', '```', '<https://example.com>', '```'].join('\n'),
      )
    ).toBe(['<https://example.com>', '', '```', 'https://example.com', '```'].join('\n'));
  });

  it('does not restore blockquote marker spacing inside fenced code', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        ['> prose', '', '```', '> code', '```', ''].join('\n'),
        ['>prose', '', '```', '>code', '```'].join('\n'),
      )
    ).toBe(['>prose', '', '```', '> code', '```'].join('\n'));
  });

  it('keeps one trailing newline for an editor-created terminal empty paragraph', () => {
    expect(serializeEditorMarkdownSnapshot('1\n\n2\n\n', '1')).toBe('1\n2\n');
  });

  it('preserves an explicit markdown blank line placeholder while compacting editor paragraph separators', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        [
          '1',
          '',
          '<!--vlaina-markdown-blank-line-->',
          '2',
          '',
          '3',
          '',
        ].join('\n'),
        '1',
      ),
    ).toBe(['1', '', '2', '3'].join('\n'));
  });

  it('preserves serializer paragraph separators inside list item indentation', () => {
    const markdown = [
      '- one',
      '',
      '  detail paragraph',
      '',
      '  second detail',
      '',
      '- two',
    ].join('\n');

    expect(serializeEditorMarkdownSnapshot(`${markdown}\n`, markdown)).toBe(markdown);
  });

  it('strips rendered HTML boundary helpers around one-line HTML image blocks before note state', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        [
          '<img src="./assets/demo.svg" alt="Demo" />',
          '',
          '<!--vlaina-rendered-html-boundary-blank-line-->',
          'After image.',
          '',
        ].join('\n'),
        '<img src="./assets/demo.svg" alt="Demo" />',
      ),
    ).toBe([
      '<img src="./assets/demo.svg" alt="Demo" />',
      '',
      'After image.',
    ].join('\n'));
  });

  it('normalizes leaked editor artifact comments out of display math before note state', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        [
          '$$',
          '<!--vlaina-markdown-blank-line-->',
          'hi',
          '<!--vlaina-rendered-html-boundary-blank-line-->',
          '<!--vlaina-markdown-tight-heading-->',
          '$$',
          '',
        ].join('\n'),
        '',
      ),
    ).toBe(['$$', 'hi', '$$'].join('\n'));
  });

  it('does not persist known editor-only markers from snapshot output', () => {
    const result = serializeEditorMarkdownSnapshot(
      [
        'Before',
        '<!--vlaina-markdown-blank-line-->',
        '<br data-vlaina-empty-line="true" />',
        '��VLAINA_LIST_GAP_SENTINEL��',
        '<br data-vlaina-user-br="true" />',
        '��VLAINA_USER_BR_SENTINEL��',
        '\u200B',
        '\u200B\u200C',
        '\u2800',
        'After',
        '',
      ].join('\n'),
      '',
    );

    expect(result).not.toMatch(
      /vlaina-markdown-|vlaina-rendered-html-boundary|data-vlaina|VLAINA_|\u200B|\u200C|\u2800|�/i,
    );
    expect(result).toContain('Before');
    expect(result).toContain('After');
  });

  it('preserves user-authored rendered HTML boundary comments outside helper positions', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        [
          'Before',
          '',
          '<!--vlaina-rendered-html-boundary-blank-line-->',
          'After',
          '',
        ].join('\n'),
        'Before',
      ),
    ).toBe([
      'Before',
      '',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      'After',
    ].join('\n'));
  });

  it('preserves editor-created empty paragraphs without keeping serializer separator blanks', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        [
          '1',
          '',
          '<br />',
          '',
          '2',
          '',
        ].join('\n'),
        '1',
      ),
    ).toBe(['1', '', '2'].join('\n'));
  });

  it('preserves multiple editor-created empty paragraphs without extra separator blanks', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        [
          '1',
          '',
          '<br />',
          '',
          '<br />',
          '',
          '2',
          '',
        ].join('\n'),
        '1',
      ),
    ).toBe(['1', '', '', '2'].join('\n'));
  });

  it('does not restore a reference blank line gap after the user fills it with text', () => {
    const referenceMarkdown = [
      '---',
      'vlaina_icon: value="hero"',
      '---',
      '1',
      '',
      '2',
    ].join('\n');

    expect(
      serializeEditorMarkdownSnapshot(
        [
          '1',
          '',
          'hi',
          '',
          '2',
          '',
        ].join('\n'),
        referenceMarkdown,
      ),
    ).toBe([
      '---',
      'vlaina_icon: value="hero"',
      '---',
      '1',
      'hi',
      '2',
    ].join('\n'));
  });

  it('does not reinsert a reference blank line gap around structural text', () => {
    const referenceMarkdown = [
      '---',
      'vlaina_icon: value="hero"',
      '---',
      '1',
      '',
      '2',
    ].join('\n');

    expect(
      serializeEditorMarkdownSnapshot(
        [
          '1',
          '#',
          '2',
          '',
        ].join('\n'),
        referenceMarkdown,
      ),
    ).toBe([
      '---',
      'vlaina_icon: value="hero"',
      '---',
      '1',
      '#',
      '2',
    ].join('\n'));
  });

  it('keeps Shift+Enter hard breaks as markdown hard breaks', () => {
    expect(serializeEditorMarkdownSnapshot('1\\\n2\n', '1')).toBe('1\\\n2');
  });

  it('preserves authored two-space hard break markers', () => {
    expect(serializeEditorMarkdownSnapshot('1\\\n2\n', '1  \n2')).toBe('1  \n2');
  });

  it('does not compact structural markdown blank lines', () => {
    expect(
      serializeEditorMarkdownSnapshot(
        [
          'Intro',
          '',
          '- one',
          '- two',
          '',
          '| A | B |',
          '| - | - |',
          '| 1 | 2 |',
          '',
        ].join('\n'),
        'Intro',
      ),
    ).toBe([
      'Intro',
      '',
      '- one',
      '- two',
      '',
      '| A | B |',
      '| - | - |',
      '| 1 | 2 |',
    ].join('\n'));
  });

  it('strips editor-only blank line comments and serializer space entities before note state', () => {
    const latestNoteContent = [
      '---',
      'vlaina_cover: "@biva/2"',
      '---',
      'old body',
    ].join('\n');
    const liveSerializedMarkdown = [
      '# Alpha',
      '<!--vlaina-markdown-blank-line-->',
      '&#x20; Pro:   \\$76.80 / year',
      '&#32 Max:   \\$191.90 / year',
    ].join('\n');

    const expected = [
      '---',
      'vlaina_cover: "@biva/2"',
      '---',
      '# Alpha',
      '',
      '  Pro:   \\$76.80 / year',
      ' Max:   \\$191.90 / year',
    ].join('\n');

    expect(
      resolvePendingMarkdownUpdate({
        pendingMarkdown: latestNoteContent,
        latestNoteContent,
        liveSerializedMarkdown,
      }),
    ).toEqual({
      markdownToApply: expected,
      source: 'live-editor',
      liveMarkdown: expected,
    });
  });

  it('keeps a real pending edit instead of replacing it with a stale live serialization', () => {
    const latestNoteContent = [
      '8. before',
      '10. after',
    ].join('\n');
    const pendingMarkdown = [
      '8. before',
      '9. <br />',
      '<br />',
      '10. after',
    ].join('\n');
    const liveSerializedMarkdown = latestNoteContent;

    expect(
      resolvePendingMarkdownUpdate({
        pendingMarkdown,
        latestNoteContent,
        liveSerializedMarkdown,
      }),
    ).toEqual({
      markdownToApply: pendingMarkdown,
      source: 'pending-markdown',
      liveMarkdown: latestNoteContent,
    });
  });

  it('restores bracket math fence style from the latest note when using live editor markdown', () => {
    const latestNoteContent = [
      'Before',
      '',
      '\\[',
      'x^2',
      '\\]',
      '',
      'After',
    ].join('\n');
    const pendingMarkdown = latestNoteContent;
    const liveSerializedMarkdown = [
      'Before',
      '',
      '$$',
      'x^2',
      '$$',
      '',
      'After edited',
    ].join('\n');
    const expected = [
      'Before',
      '',
      '\\[',
      'x^2',
      '\\]',
      '',
      'After edited',
    ].join('\n');

    expect(
      resolvePendingMarkdownUpdate({
        pendingMarkdown,
        latestNoteContent,
        liveSerializedMarkdown,
      }),
    ).toEqual({
      markdownToApply: expected,
      source: 'live-editor',
      liveMarkdown: expected,
    });
  });
});
