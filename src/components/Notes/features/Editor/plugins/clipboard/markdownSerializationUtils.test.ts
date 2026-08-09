import { describe, expect, it, vi } from 'vitest';
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  remarkStringifyOptionsCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import {
  joinSerializedBlocks,
  normalizeGenericHtmlBlockClosingSpacing,
  normalizeAlternativeMathBlockFences,
  normalizeChineseOrderedListMarkers,
  normalizeCjkAtxHeadingMarkerSpaces,
  normalizeEscapedAngleBracketText,
  normalizeEscapedUrlSchemes,
  normalizeFullwidthMarkdownLineMarkers,
  normalizeFullwidthOrderedListDigits,
  normalizeFullwidthTablePipes,
  normalizeLenientMarkdownLineMarkers,
  normalizeMalformedTaskListMarkers,
  normalizeEditorStateMarkdownDocument,
  normalizeMarkdownAutolinkLiterals,
  normalizeMissingBlockquoteMarkerSpaces,
  normalizeMissingOrderedListMarkerSpaces,
  normalizeMissingUnorderedListMarkerSpaces,
  normalizeRedundantMarkdownEscapes,
  normalizeSerializedMarkdownBlock,
  normalizeSerializedMarkdownDocument,
  normalizeSerializedMarkdownSelection,
  normalizeUnicodeBulletListMarkers,
  restoreMathBlockFenceStylesFromReference,
  stripTrailingNewlines,
} from '@/lib/notes/markdown/markdownSerializationUtils';
import { normalizeSerializedListGapMarkerLines } from '@/lib/notes/markdown/markdownSerializationSentinels';
import { LIST_GAP_SENTINEL } from '@/lib/notes/markdown/markdownSerializationShared';
import { notesRemarkStringifyOptions } from '../../config/stringifyOptions';

describe('stripTrailingNewlines', () => {
  it('removes trailing newlines only', () => {
    expect(stripTrailingNewlines('abc\n\n')).toBe('abc');
    expect(stripTrailingNewlines('abc\nxyz')).toBe('abc\nxyz');
  });
});

describe('container-aware serialization scanners', () => {
  it('does not remove an authored blank line after leaving list-contained HTML', () => {
    const markdown = ['- <div>', '  content', 'Outside', '', '</div>'].join('\n');

    expect(normalizeGenericHtmlBlockClosingSpacing(markdown)).toBe(markdown);
  });

  it('normalizes a list-gap marker after leaving an unclosed list fence', () => {
    const serialized = [
      '- ```md',
      '  code',
      'Outside',
      '- \u2800',
      '  - Nested',
    ].join('\n');

    expect(normalizeSerializedListGapMarkerLines(serialized)).toBe([
      '- ```md',
      '  code',
      'Outside',
      LIST_GAP_SENTINEL,
      '  - Nested',
    ].join('\n'));
  });

  it('does not normalize list-gap-like code after a quote-prefixed pseudo close', () => {
    const serialized = [
      '```md',
      '> ```',
      '- \u2800',
      '  - Nested',
      '```',
    ].join('\n');

    expect(normalizeSerializedListGapMarkerLines(serialized)).toBe(serialized);
  });
});

describe('normalizeEscapedUrlSchemes', () => {
  it('keeps the same string when no escaped URL scheme is present', () => {
    const markdown = 'plain note text without escaped URL schemes';

    expect(normalizeEscapedUrlSchemes(markdown)).toBe(markdown);
  });

  it('removes markdown escaping from URL scheme separators', () => {
    expect(normalizeEscapedUrlSchemes('http\\://example.test:8317')).toBe(
      'http://example.test:8317'
    );
    expect(normalizeEscapedUrlSchemes('[site](https\\://example.com/a)')).toBe(
      '[site](https://example.com/a)'
    );
    expect(normalizeEscapedUrlSchemes('HTTPS\\://example.com/a')).toBe(
      'HTTPS://example.com/a'
    );
  });

  it('keeps escaped separators for unsupported URL schemes', () => {
    expect(normalizeEscapedUrlSchemes('javascript\\://alert(1)')).toBe(
      'javascript\\://alert(1)'
    );
    expect(normalizeEscapedUrlSchemes('file\\:///tmp/secret.png')).toBe(
      'file\\:///tmp/secret.png'
    );
  });

  it('does not remove escaped colons from ordinary text', () => {
    expect(normalizeEscapedUrlSchemes('label\\: value')).toBe('label\\: value');
  });
});

describe('normalizeAlternativeMathBlockFences', () => {
  it('converts bracket display math fences to dollar fences outside protected blocks', () => {
    expect(
      normalizeAlternativeMathBlockFences(['Before', '', '\\[', 'f=\\mu mg', '\\]', '', 'After'].join('\n'))
    ).toBe(['Before', '', '$$', 'f=\\mu mg', '$$', '', 'After'].join('\n'));
  });

  it('converts bracket-backslash display math fences from generated notes', () => {
    expect(
      normalizeAlternativeMathBlockFences(['摩擦力大小为', '', '[\\', 'f=\\mu mg\\', ']', '', '故加速度为'].join('\n'))
    ).toBe(['摩擦力大小为', '', '$$', 'f=\\mu mg', '$$', '', '故加速度为'].join('\n'));
  });

  it('converts escaped bracket display math fences with trailing opener backslashes', () => {
    expect(
      normalizeAlternativeMathBlockFences(['摩擦力大小为', '', '\\[\\', 'f=\\mu mg\\', ']', '', '\\\\[\\', 'a=\\frac{f}{m}=\\mu g\\', ']'].join('\n'))
    ).toBe(['摩擦力大小为', '', '$$', 'f=\\mu mg', '$$', '', '$$', 'a=\\frac{f}{m}=\\mu g', '$$'].join('\n'));
  });

  it('converts bracket-backslash display math when the bracket closer is on the formula line', () => {
    expect(
      normalizeAlternativeMathBlockFences(['[\\', 'a=\\frac{f}{m}=\\mu g]'].join('\n'))
    ).toBe(['$$', 'a=\\frac{f}{m}=\\mu g', '$$'].join('\n'));
  });

  it('converts bracket-only display math fences when the content looks like latex', () => {
    expect(
      normalizeAlternativeMathBlockFences(['摩擦力大小为', '', '[', 'f=\\mu mg', ']', '', '故加速度为'].join('\n'))
    ).toBe(['摩擦力大小为', '', '$$', 'f=\\mu mg', '$$', '', '故加速度为'].join('\n'));
  });

  it('converts bracket-only display math when a standard closer is on the formula line', () => {
    expect(
      normalizeAlternativeMathBlockFences(['[', 'a=\\frac{f}{m}=\\mu g\\]'].join('\n'))
    ).toBe(['$$', 'a=\\frac{f}{m}=\\mu g', '$$'].join('\n'));
  });

  it('keeps bracket-only blocks when the content does not look like latex', () => {
    const markdown = ['[', 'ordinary text', ']'].join('\n');

    expect(normalizeAlternativeMathBlockFences(markdown)).toBe(markdown);
  });

  it('does not mistake bracketed code-like text for generated math', () => {
    const markdown = ['[', 'config_value', ']'].join('\n');

    expect(normalizeAlternativeMathBlockFences(markdown)).toBe(markdown);
  });

  it('normalizes standalone same-line display math including blockquotes', () => {
    expect(normalizeAlternativeMathBlockFences('$$x^2$$')).toBe(['$$', 'x^2', '$$'].join('\n'));
    expect(normalizeAlternativeMathBlockFences('\\[x^2\\]')).toBe(['$$', 'x^2', '$$'].join('\n'));
    expect(normalizeAlternativeMathBlockFences('$$ x^2 $$')).toBe(['$$', 'x^2', '$$'].join('\n'));
    expect(normalizeAlternativeMathBlockFences('\\[ x^2 \\]')).toBe(['$$', 'x^2', '$$'].join('\n'));
    expect(normalizeAlternativeMathBlockFences('> $$x^2$$')).toBe(
      ['> $$', '> x^2', '> $$'].join('\n')
    );
  });

  it.each([
    {
      source: ['- \\[', '  x^2', '  \\]'],
      expected: ['- $$', '  x^2', '  $$'],
    },
    {
      source: ['7. \\[', '   x^2', '   \\]'],
      expected: ['7. $$', '   x^2', '   $$'],
    },
    {
      source: ['> - \\[', '>   x^2', '>   \\]'],
      expected: ['> - $$', '>   x^2', '>   $$'],
    },
  ])('normalizes list-contained bracket display math: $source', ({ expected, source }) => {
    expect(normalizeAlternativeMathBlockFences(source.join('\n'))).toBe(expected.join('\n'));
  });

  it('normalizes same-line and generated list-contained display math', () => {
    expect(normalizeAlternativeMathBlockFences('- \\[x^2\\]')).toBe(
      ['- $$', '  x^2', '  $$'].join('\n')
    );
    expect(normalizeAlternativeMathBlockFences([
      '- [\\',
      '  a=\\frac{f}{m}\\',
      '  ]',
    ].join('\n'))).toBe([
      '- $$',
      '  a=\\frac{f}{m}',
      '  $$',
    ].join('\n'));
  });

  it('does not convert alternative math fences inside fenced code', () => {
    const markdown = ['```md', '\\[', 'x^2', '\\]', '```'].join('\n');

    expect(normalizeAlternativeMathBlockFences(markdown)).toBe(markdown);
  });

  it('does not convert unmatched alternative math openers', () => {
    const markdown = ['Before', '', '\\[', 'x^2'].join('\n');

    expect(normalizeAlternativeMathBlockFences(markdown)).toBe(markdown);
  });
});

describe('normalizeMarkdownAutolinkLiterals', () => {
  it('keeps the same string when no autolink literal is present', () => {
    const markdown = 'plain note text without markdown autolinks';

    expect(normalizeMarkdownAutolinkLiterals(markdown)).toBe(markdown);
  });

  it('unwraps markdown autolink URL literals outside protected content', () => {
    expect(
      normalizeMarkdownAutolinkLiterals('export GOOGLE_GEMINI_BASE_URL="<http://example.test:8317>"')
    ).toBe('export GOOGLE_GEMINI_BASE_URL="http://example.test:8317"');
    expect(normalizeMarkdownAutolinkLiterals('<HTTPS://example.test/path>')).toBe(
      'HTTPS://example.test/path'
    );
  });

  it('keeps angle-bracket URLs inside fenced code', () => {
    const markdown = ['```sh', 'curl <http://example.test:8317>', '```'].join('\n');

    expect(normalizeMarkdownAutolinkLiterals(markdown)).toBe(markdown);
  });
});

describe('normalizeEscapedAngleBracketText', () => {
  it('restores serializer-escaped literal less-than text outside protected content', () => {
    expect(normalizeEscapedAngleBracketText('\\<p>')).toBe('<p>');
    expect(normalizeEscapedAngleBracketText('\\</p>')).toBe('</p>');
    expect(normalizeEscapedAngleBracketText('Use \\<p> in text')).toBe('Use <p> in text');
    expect(normalizeEscapedAngleBracketText('1 \\< 2')).toBe('1 < 2');
  });

  it('keeps user-authored escaped backslashes before less-than text', () => {
    expect(normalizeEscapedAngleBracketText('\\\\<p>')).toBe('\\\\<p>');
  });

  it('does not restore escaped less-than text inside protected blocks', () => {
    const fenced = ['```md', '\\<p>', '```'].join('\n');
    const html = ['<pre>', '\\<p>', '</pre>'].join('\n');

    expect(normalizeEscapedAngleBracketText(fenced)).toBe(fenced);
    expect(normalizeEscapedAngleBracketText(html)).toBe(html);
  });
});

describe('normalizeRedundantMarkdownEscapes', () => {
  it('restores serializer-escaped plain punctuation outside protected content', () => {
    expect(normalizeRedundantMarkdownEscapes('h\\_i')).toBe('h_i');
    expect(normalizeRedundantMarkdownEscapes('foo\\_\\_bar')).toBe('foo__bar');
    expect(normalizeRedundantMarkdownEscapes('assets/2026-05-22\\_18-51-57.png')).toBe(
      'assets/2026-05-22_18-51-57.png'
    );
    expect(normalizeRedundantMarkdownEscapes('path\\_(x)')).toBe('path_(x)');
    expect(normalizeRedundantMarkdownEscapes('a\\*b and a \\* b')).toBe('a*b and a * b');
    expect(normalizeRedundantMarkdownEscapes('a\\[b]')).toBe('a[b]');
    expect(normalizeRedundantMarkdownEscapes('a\\~b')).toBe('a~b');
    expect(normalizeRedundantMarkdownEscapes('a\\`b')).toBe('a`b');
    expect(normalizeRedundantMarkdownEscapes('\\#tag')).toBe('#tag');
    expect(normalizeRedundantMarkdownEscapes('left\\$right')).toBe('left$right');
    expect(normalizeRedundantMarkdownEscapes('\\$value')).toBe('$value');
    expect(normalizeRedundantMarkdownEscapes('left\\$\\$right')).toBe('left$$right');
    expect(normalizeRedundantMarkdownEscapes('left\\&right')).toBe('left&right');
    expect(normalizeRedundantMarkdownEscapes('left\\@right')).toBe('left@right');
    expect(normalizeRedundantMarkdownEscapes('left \\[')).toBe('left [');
    expect(normalizeRedundantMarkdownEscapes('left \\_')).toBe('left _');
    expect(normalizeRedundantMarkdownEscapes('left\\*\\*right')).toBe('left**right');
    expect(normalizeRedundantMarkdownEscapes('left\\`\\`right')).toBe('left``right');
    expect(normalizeRedundantMarkdownEscapes('\\`value')).toBe('`value');
    expect(normalizeRedundantMarkdownEscapes('left\\~\\~right')).toBe('left~~right');
    expect(
      normalizeRedundantMarkdownEscapes('[Docs](https://example.test?a=1\\&b=2)')
    ).toBe('[Docs](https://example.test?a=1\\&b=2)');
    expect(
      normalizeRedundantMarkdownEscapes([
        'Dollar \\$ value',
        '',
        'Second dollar \\$ value',
        '',
        'Backtick \\` value',
        '',
        'Second backtick \\` value',
      ].join('\n'))
    ).toBe([
      'Dollar $ value',
      '',
      'Second dollar $ value',
      '',
      'Backtick ` value',
      '',
      'Second backtick ` value',
    ].join('\n'));
  });

  it('keeps syntax-protecting escaped underscores and protected content intact', () => {
    expect(normalizeRedundantMarkdownEscapes('\\_literal\\_')).toBe('\\_literal\\_');
    expect(normalizeRedundantMarkdownEscapes('\\*literal\\*')).toBe('\\*literal\\*');
    expect(normalizeRedundantMarkdownEscapes('\\_literal emphasis\\_')).toBe('\\_literal emphasis\\_');
    expect(normalizeRedundantMarkdownEscapes('\\*literal emphasis\\*')).toBe('\\*literal emphasis\\*');
    expect(normalizeRedundantMarkdownEscapes('\\*\\*literal strong text\\*\\*')).toBe(
      '\\*\\*literal strong text\\*\\*'
    );
    expect(normalizeRedundantMarkdownEscapes('H\\~two atoms\\~O')).toBe('H\\~two atoms\\~O');
    expect(normalizeRedundantMarkdownEscapes('H\\~2\\~O')).toBe('H\\~2\\~O');
    expect(normalizeRedundantMarkdownEscapes('\\`not code\\`')).toBe('\\`not code\\`');
    expect(normalizeRedundantMarkdownEscapes('\\[not a link]')).toBe('\\[not a link]');
    expect(normalizeRedundantMarkdownEscapes('\\# Heading')).toBe('\\# Heading');
    expect(normalizeRedundantMarkdownEscapes('\\$math\\$')).toBe('\\$math\\$');
    expect(normalizeRedundantMarkdownEscapes('\\&copy;')).toBe('\\&copy;');
    expect(normalizeRedundantMarkdownEscapes('user\\@example.test')).toBe('user\\@example.test');
    expect(normalizeRedundantMarkdownEscapes('\\*\\*literal\\*\\*')).toBe('\\*\\*literal\\*\\*');
    expect(normalizeRedundantMarkdownEscapes('\\`\\`code\\`\\`')).toBe('\\`\\`code\\`\\`');
    expect(normalizeRedundantMarkdownEscapes('\\~\\~strike\\~\\~')).toBe('\\~\\~strike\\~\\~');
    expect(normalizeRedundantMarkdownEscapes(['```md', 'h\\_i', '```'].join('\n'))).toBe(
      ['```md', 'h\\_i', '```'].join('\n')
    );
  });
});

describe('normalizeMissingOrderedListMarkerSpaces', () => {
  it('adds the missing marker space for consecutive ordered list lines', () => {
    expect(normalizeMissingOrderedListMarkerSpaces(['1.苹果', '2.香蕉', '3.橘子'].join('\n'))).toBe(
      ['1. 苹果', '2. 香蕉', '3. 橘子'].join('\n')
    );
    expect(normalizeMissingOrderedListMarkerSpaces(['1.1', '2.1'].join('\n'))).toBe(
      ['1. 1', '2. 1'].join('\n')
    );
    expect(normalizeMissingOrderedListMarkerSpaces(['>1.苹果', '>2.香蕉'].join('\n'))).toBe(
      ['> 1. 苹果', '> 2. 香蕉'].join('\n')
    );
    expect(normalizeMissingOrderedListMarkerSpaces(['> >1.苹果', '> >2.香蕉'].join('\n'))).toBe(
      ['> > 1. 苹果', '> > 2. 香蕉'].join('\n')
    );
  });

  it('adds the missing marker space when ordered list lines are separated by blanks', () => {
    expect(normalizeMissingOrderedListMarkerSpaces(['0.安装', '', '1.调用笔记', '', '2.切换笔记'].join('\n'))).toBe(
      ['0. 安装', '', '1. 调用笔记', '', '2. 切换笔记'].join('\n')
    );
  });

  it('does not rewrite a single decimal-like line', () => {
    expect(normalizeMissingOrderedListMarkerSpaces('版本 1.1')).toBe('版本 1.1');
    expect(normalizeMissingOrderedListMarkerSpaces('1.1')).toBe('1.1');
  });

  it('requires a consecutive ordered-list run', () => {
    expect(normalizeMissingOrderedListMarkerSpaces(['1.1', '3.1'].join('\n'))).toBe(
      ['1.1', '3.1'].join('\n')
    );
  });

  it('does not rewrite fenced code content', () => {
    const markdown = ['```md', '1.苹果', '2.香蕉', '```'].join('\n');

    expect(normalizeMissingOrderedListMarkerSpaces(markdown)).toBe(markdown);
  });
});

describe('normalizeMalformedTaskListMarkers', () => {
  it('canonicalizes unchecked task list markers with missing spaces', () => {
    expect(normalizeMalformedTaskListMarkers(['- [] fsedf', '-[] ', '-[ ]todo'].join('\n'))).toBe(
      ['- [ ] fsedf', '- [ ]', '- [ ] todo'].join('\n')
    );
  });

  it('canonicalizes checked task list markers with missing spaces', () => {
    expect(normalizeMalformedTaskListMarkers(['-[x]done', '*[X] done', '+ [x]done'].join('\n'))).toBe(
      ['- [x] done', '* [x] done', '+ [x] done'].join('\n')
    );
    expect(normalizeMalformedTaskListMarkers(['-［］任务', '－【√】完成', '＋［Ｘ］完成'].join('\n'))).toBe(
      ['- [ ] 任务', '- [x] 完成', '+ [x] 完成'].join('\n')
    );
  });

  it('canonicalizes ordered task list markers', () => {
    expect(normalizeMalformedTaskListMarkers(['1.[] first', '2.[x]second'].join('\n'))).toBe(
      ['1. [ ] first', '2. [x] second'].join('\n')
    );
    expect(normalizeMalformedTaskListMarkers(['>-[] first', '>- [x]second'].join('\n'))).toBe(
      ['> - [ ] first', '> - [x] second'].join('\n')
    );
  });

  it('does not rewrite non-task bracket text or fenced code content', () => {
    expect(normalizeMalformedTaskListMarkers('- [todo] keep')).toBe('- [todo] keep');

    const markdown = ['```md', '-[] task', '-[x] done', '```'].join('\n');
    expect(normalizeMalformedTaskListMarkers(markdown)).toBe(markdown);
  });
});

describe('normalize lenient markdown line markers', () => {
  it('canonicalizes Chinese ordered list markers only for consecutive runs', () => {
    expect(normalizeChineseOrderedListMarkers(['1、苹果', '2、香蕉', '3）橘子'].join('\n'))).toBe(
      ['1. 苹果', '2. 香蕉', '3. 橘子'].join('\n')
    );
    expect(normalizeChineseOrderedListMarkers(['（1）苹果', '', '（2）香蕉'].join('\n'))).toBe(
      ['1. 苹果', '', '2. 香蕉'].join('\n')
    );
    expect(normalizeChineseOrderedListMarkers('1、不是列表')).toBe('1、不是列表');
    expect(normalizeChineseOrderedListMarkers(['7）普通段落', '8）普通段落'].join('\n'))).toBe(
      ['7）普通段落', '8）普通段落'].join('\n')
    );
  });

  it('canonicalizes unordered list markers without spaces only for consecutive runs', () => {
    expect(normalizeMissingUnorderedListMarkerSpaces(['-苹果', '-香蕉', '*橘子', '＋梨'].join('\n'))).toBe(
      ['- 苹果', '- 香蕉', '* 橘子', '+ 梨'].join('\n')
    );
    expect(normalizeMissingUnorderedListMarkerSpaces(['>-苹果', '>-香蕉'].join('\n'))).toBe(
      ['> - 苹果', '> - 香蕉'].join('\n')
    );
    expect(normalizeMissingUnorderedListMarkerSpaces('-苹果')).toBe('-苹果');
    expect(normalizeMissingUnorderedListMarkerSpaces('－普通破折号文本')).toBe('－普通破折号文本');
    expect(normalizeMissingUnorderedListMarkerSpaces(['-1', '-2'].join('\n'))).toBe(['-1', '-2'].join('\n'));
  });

  it('canonicalizes unicode bullet list markers only for consecutive runs', () => {
    expect(normalizeUnicodeBulletListMarkers(['• 苹果', '• 香蕉', '◦ 橘子'].join('\n'))).toBe(
      ['- 苹果', '- 香蕉', '- 橘子'].join('\n')
    );
    expect(normalizeUnicodeBulletListMarkers(['>• 苹果', '>• 香蕉'].join('\n'))).toBe(
      ['> - 苹果', '> - 香蕉'].join('\n')
    );
    expect(normalizeUnicodeBulletListMarkers('• 普通句子')).toBe('• 普通句子');
  });

  it('canonicalizes fullwidth line markers before other lenient rules', () => {
    expect(normalizeLenientMarkdownLineMarkers(['＃标题', '＞引用', '－苹果', '－香蕉'].join('\n'))).toBe(
      ['# 标题', '> 引用', '- 苹果', '- 香蕉'].join('\n')
    );
    expect(normalizeLenientMarkdownLineMarkers(['＞1.苹果', '＞2.香蕉', '＞-[] todo'].join('\n'))).toBe(
      ['> 1. 苹果', '> 2. 香蕉', '> - [ ] todo'].join('\n')
    );
    expect(normalizeFullwidthOrderedListDigits(['１．苹果', '２）香蕉', '（３）橘子'].join('\n'))).toBe(
      ['1．苹果', '2）香蕉', '（3）橘子'].join('\n')
    );
    expect(normalizeLenientMarkdownLineMarkers(['１．苹果', '２．香蕉', '３）橘子'].join('\n'))).toBe(
      ['1. 苹果', '2. 香蕉', '3. 橘子'].join('\n')
    );
    expect(normalizeLenientMarkdownLineMarkers(['＞１．苹果', '＞２．香蕉'].join('\n'))).toBe(
      ['> 1. 苹果', '> 2. 香蕉'].join('\n')
    );
    expect(normalizeFullwidthMarkdownLineMarkers('正文 ＃ 不动')).toBe('正文 ＃ 不动');
    expect(normalizeFullwidthMarkdownLineMarkers('－普通破折号文本')).toBe('－普通破折号文本');
  });

  it('canonicalizes fullwidth table pipes only for table-shaped runs', () => {
    expect(normalizeFullwidthTablePipes(['｜ A ｜ B ｜', '｜ --- ｜ --- ｜', '｜ 1 ｜ 2 ｜'].join('\n'))).toBe(
      ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n')
    );
    expect(normalizeFullwidthTablePipes('这不是｜表格｜文本')).toBe('这不是｜表格｜文本');
    expect(normalizeFullwidthTablePipes(['```md', '｜ A ｜ B ｜', '｜ --- ｜ --- ｜', '```'].join('\n'))).toBe(
      ['```md', '｜ A ｜ B ｜', '｜ --- ｜ --- ｜', '```'].join('\n')
    );
  });

  it('canonicalizes CJK headings and blockquotes without changing hashtags', () => {
    expect(normalizeCjkAtxHeadingMarkerSpaces(['#标题', '##二级标题'].join('\n'))).toBe(
      ['# 标题', '## 二级标题'].join('\n')
    );
    expect(normalizeCjkAtxHeadingMarkerSpaces('#todo')).toBe('#todo');
    expect(normalizeCjkAtxHeadingMarkerSpaces('#123')).toBe('#123');
    expect(normalizeMissingBlockquoteMarkerSpaces(['>引用', '> already'].join('\n'))).toBe(
      ['> 引用', '> already'].join('\n')
    );
  });

  it('does not rewrite lenient markers inside fenced code', () => {
    const markdown = ['```md', '1、苹果', '-苹果', '#标题', '＞引用', '```'].join('\n');

    expect(normalizeLenientMarkdownLineMarkers(markdown)).toBe(markdown);
  });
});

describe('restoreMathBlockFenceStylesFromReference', () => {
  it('keeps dollar math blocks when the reference used dollar fences', () => {
    const markdown = ['Before', '', '$$', 'x^2', '$$', '', 'After'].join('\n');

    expect(restoreMathBlockFenceStylesFromReference(markdown, markdown)).toBe(markdown);
  });

  it('restores short source fences after serialization avoids dollar-like content', () => {
    const serialized = ['$$$', '> $$', 'x^2', '$$$'].join('\n');
    const reference = ['$$', '> $$', 'x^2', '$$'].join('\n');

    expect(restoreMathBlockFenceStylesFromReference(serialized, reference)).toBe(reference);
  });

  it('preserves user-authored dollar opener and closer lengths', () => {
    const serialized = ['$$', 'x^2', '$$'].join('\n');
    const reference = ['$$$', 'x^2', '$$$$'].join('\n');

    expect(restoreMathBlockFenceStylesFromReference(serialized, reference)).toBe(reference);
  });

  it('restores standard bracket math fences from the reference document', () => {
    const serialized = ['Before', '', '$$', 'x^2', '$$', '', 'After'].join('\n');
    const reference = ['Before', '', '\\[', 'x^2', '\\]', '', 'After'].join('\n');

    expect(restoreMathBlockFenceStylesFromReference(serialized, reference)).toBe(reference);
  });

  it('restores list-contained multiline and same-line bracket math styles', () => {
    const serialized = ['- $$', '  x^2', '  $$'].join('\n');
    const multilineReference = ['- \\[', '  x^2', '  \\]'].join('\n');

    expect(restoreMathBlockFenceStylesFromReference(serialized, multilineReference))
      .toBe(multilineReference);
    expect(restoreMathBlockFenceStylesFromReference(serialized, '- \\[x^2\\]'))
      .toBe('- \\[x^2\\]');
  });

  it('restores malformed bracket-style references as canonical bracket fences', () => {
    const serialized = ['$$', 'a=\\frac{f}{m}=\\mu g', '$$'].join('\n');
    const reference = ['[\\', 'a=\\frac{f}{m}=\\mu g]'].join('\n');

    expect(restoreMathBlockFenceStylesFromReference(serialized, reference)).toBe(
      ['\\[', 'a=\\frac{f}{m}=\\mu g', '\\]'].join('\n')
    );
  });

  it('restores same-line display math styles when the formula remains one line', () => {
    const serialized = ['$$', 'x^2', '$$'].join('\n');

    expect(restoreMathBlockFenceStylesFromReference(serialized, '$$x^2$$')).toBe('$$x^2$$');
    expect(restoreMathBlockFenceStylesFromReference(serialized, '\\[x^2\\]')).toBe('\\[x^2\\]');
  });

  it('keeps multiline math when a same-line reference formula becomes multiline', () => {
    const serialized = ['$$', 'x^2', 'y^2', '$$'].join('\n');

    expect(restoreMathBlockFenceStylesFromReference(serialized, '$$x^2$$')).toBe(serialized);
  });

  it('matches reference styles by latex when a new math block is inserted before existing blocks', () => {
    const serialized = [
      '$$',
      'new = value',
      '$$',
      '',
      '$$',
      'x^2',
      '$$',
    ].join('\n');
    const reference = ['\\[', 'x^2', '\\]'].join('\n');

    expect(restoreMathBlockFenceStylesFromReference(serialized, reference)).toBe([
      '$$',
      'new = value',
      '$$',
      '',
      '\\[',
      'x^2',
      '\\]',
    ].join('\n'));
  });

  it('does not restore math fences inside fenced code', () => {
    const serialized = ['```md', '$$', 'x^2', '$$', '```'].join('\n');
    const reference = ['\\[', 'x^2', '\\]'].join('\n');

    expect(restoreMathBlockFenceStylesFromReference(serialized, reference)).toBe(serialized);
  });

  it('keeps repeated unmatched dollar math openers on a bounded restore path', () => {
    const serialized = [
      ...Array.from({ length: 500 }, (_value, index) => ['$$', `unclosed ${index}`].join('\n')),
      '$$',
      'x^2',
      '$$',
    ].join('\n');
    const reference = ['\\[', 'x^2', '\\]'].join('\n');

    expect(restoreMathBlockFenceStylesFromReference(serialized, reference)).toContain('\\[\nx^2\n\\]');
  });

  it('restores sparse math fences without allocating match slots for every line', () => {
    const originalArrayFrom = Array.from;
    const serialized = [
      'Before',
      ...Array.from({ length: 500 }, (_value, index) => `line ${index}`),
      '$$',
      'x^2',
      '$$',
      'After',
    ].join('\n');
    const reference = ['\\[', 'x^2', '\\]'].join('\n');

    const arrayFromSpy = vi.spyOn(Array, 'from').mockImplementation(((items: unknown, ...args: unknown[]) => {
      if (
        typeof items === 'object'
        && items !== null
        && 'length' in items
        && Number((items as { length: unknown }).length) > 100
      ) {
        throw new Error('unexpected dense line allocation');
      }
      return originalArrayFrom(items as Iterable<unknown> | ArrayLike<unknown>, ...(args as []));
    }) as typeof Array.from);

    try {
      expect(restoreMathBlockFenceStylesFromReference(serialized, reference)).toContain('\\[\nx^2\n\\]');
    } finally {
      arrayFromSpy.mockRestore();
    }
  });
});

describe('normalizeSerializedMarkdownBlock', () => {
  function expectNoInternalClipboardArtifacts(text: string) {
    expect(text).not.toContain('\u0000');
    expect(text).not.toContain('�');
    expect(text).not.toMatch(/VLAINA_(?:LIST_GAP|USER_BR)_SENTINEL/);
    expect(text).not.toMatch(/data-vlaina-/);
  }

  it('converts standalone br tags to empty block text', () => {
    expect(normalizeSerializedMarkdownBlock('<br />')).toBe('');
    expect(normalizeSerializedMarkdownBlock('<br/>\n')).toBe('');
  });

  it('converts invisible editor blank-line placeholders to empty block text', () => {
    expect(normalizeSerializedMarkdownBlock('\u200B\n')).toBe('');
  });

  it('removes placeholder br tags from empty list items', () => {
    expect(normalizeSerializedMarkdownBlock('- [ ] <br />\n')).toBe('- [ ]');
    expect(normalizeSerializedMarkdownBlock('  - [x] <br />\n')).toBe('  - [x]');
  });

  it('removes placeholder br tags from empty table cells', () => {
    expect(
      normalizeSerializedMarkdownBlock('| a | b |\n| --- | --- |\n| 1 | <br /> |\n')
    ).toBe('| a | b |\n| --- | --- |\n| 1 |   |');
  });

  it('keeps normal markdown content', () => {
    expect(normalizeSerializedMarkdownBlock('# Title\n')).toBe('# Title');
  });

  it('restores escaped URL scheme separators in copied blocks', () => {
    expect(normalizeSerializedMarkdownBlock('http\\://example.test:8317\n')).toBe(
      'http://example.test:8317'
    );
  });

  it('restores escaped highlight syntax in copied blocks outside protected content', () => {
    expect(normalizeSerializedMarkdownBlock('\\==highlight==\n')).toBe('==highlight==');
    expect(
      normalizeSerializedMarkdownBlock(['```md', '\\==literal==', '```'].join('\n'))
    ).toBe(['```md', '\\==literal==', '```'].join('\n'));
  });

  it('restores serializer-escaped less-than text in copied blocks', () => {
    expect(normalizeSerializedMarkdownBlock('\\<p>\n')).toBe('<p>');
    expect(normalizeSerializedMarkdownBlock('Use \\<p> here\n')).toBe('Use <p> here');
  });

  it('does not collapse user-authored blank lines inside copied fenced code blocks', () => {
    const markdown = ['```txt', 'before', '', '', 'after', '```'].join('\n');

    expect(normalizeSerializedMarkdownBlock(markdown)).toBe(markdown);
  });

  it('converts internal user br placeholders in copied blocks', () => {
    expect(
      normalizeSerializedMarkdownBlock(['Line one', '<br data-vlaina-user-br="true" />', 'Line two'].join('\n'))
    ).toBe(['Line one\\', 'Line two'].join('\n'));
  });

  it('does not expose internal list gap sentinels in copied blocks', () => {
    const nulNormalized = normalizeSerializedMarkdownBlock('A\n\u0000VLAINA_LIST_GAP_SENTINEL\u0000\nB');
    const leakedNormalized = normalizeSerializedMarkdownBlock('A\n��VLAINA_LIST_GAP_SENTINEL��\nB');

    expect(nulNormalized).toBe('A\n\nB');
    expect(leakedNormalized).toBe('A\n\nB');
    expectNoInternalClipboardArtifacts(nulNormalized);
    expectNoInternalClipboardArtifacts(leakedNormalized);
  });

  it('does not expose internal user break sentinels in copied blocks', () => {
    const nulNormalized = normalizeSerializedMarkdownBlock('A\n\u0000VLAINA_USER_BR_SENTINEL\u0000\nB');
    const leakedNormalized = normalizeSerializedMarkdownBlock('A\n��VLAINA_USER_BR_SENTINEL��\nB');

    expect(nulNormalized).toBe('A\\\nB');
    expect(leakedNormalized).toBe('A\\\nB');
    expectNoInternalClipboardArtifacts(nulNormalized);
    expectNoInternalClipboardArtifacts(leakedNormalized);
  });

  it('does not treat user-authored sentinel-like block text as internal clipboard state', () => {
    expect(normalizeSerializedMarkdownBlock('VLAINA_LIST_GAP_SENTINEL')).toBe('VLAINA_LIST_GAP_SENTINEL');
    expect(normalizeSerializedMarkdownBlock('VLAINA_USER_BR_SENTINEL')).toBe('VLAINA_USER_BR_SENTINEL');
  });
});

describe('normalizeSerializedMarkdownDocument', () => {
  it('normalizes documents with pathological blank line runs within the default test timeout', () => {
    const blankRun = Array.from({ length: 12_000 }, () => '').join('\n');
    const markdown = ['---', 'title: Slow', '---', 'before', blankRun, 'after'].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toContain('after');
  });

  it('normalizes repeated empty placeholders within the default test timeout', () => {
    const placeholders = Array.from({ length: 12_000 }, () => '\u200B').join('\n');
    const markdown = ['before', placeholders, 'after'].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toContain('after');
  });

  it('converts invisible editor blank-line placeholders into markdown blank lines', () => {
    expect(normalizeSerializedMarkdownDocument('1\n\u200B\n2\n')).toBe('1\n\n2\n');
    expect(normalizeSerializedMarkdownDocument('- one\n\u200B\u200C\n- two\n')).toBe('- one\n\n- two\n');
  });

  it('preserves explicit editor blank-line comments after one-line html blocks', () => {
    expect(
      normalizeSerializedMarkdownDocument([
        'hi',
        '',
        '<p>Fresh middle HTML body</p>',
        '',
        '<!--vlaina-markdown-blank-line-->',
        '',
        '1',
      ].join('\n'))
    ).toBe([
      'hi',
      '',
      '<p>Fresh middle HTML body</p>',
      '',
      '',
      '1',
    ].join('\n'));
    expect(
      normalizeSerializedMarkdownDocument([
        'hi',
        '',
        '<div>h1</div>',
        '',
        '<!--vlaina-markdown-blank-line-->',
        '',
        '1',
      ].join('\n'))
    ).toBe(['hi', '', '<div>h1</div>', '', '', '1'].join('\n'));
  });

  it('preserves explicit editor empty-line placeholders after one-line html blocks', () => {
    expect(
      normalizeSerializedMarkdownDocument([
        'hi',
        '',
        '<p>Fresh middle HTML body</p>',
        '',
        '\u200B',
        '',
        '1',
      ].join('\n'))
    ).toBe(['hi', '', '<p>Fresh middle HTML body</p>', '', '', '1'].join('\n'));
  });

  it('preserves an explicit editor blank line after a list', () => {
    expect(
      normalizeSerializedMarkdownDocument([
        '15. Keep',
        '',
        '\u200B',
        '',
        'Body',
      ].join('\n'))
    ).toBe(['15. Keep', '', '', 'Body'].join('\n'));
  });

  it('strips editor rendered-boundary comments after multi-line html blocks', () => {
    expect(
      normalizeSerializedMarkdownDocument([
        '<p align="center">',
        '  <img src="logo.png"><br>',
        'HTML',
        '</p>',
        '',
        '<!--vlaina-rendered-html-boundary-blank-line-->',
        'after',
      ].join('\n'))
    ).toBe([
      '<p align="center">',
      '  <img src="logo.png"><br>',
      'HTML',
      '</p>',
      '',
        'after',
      ].join('\n'));
    expect(
      normalizeSerializedMarkdownDocument([
        'Before',
        '',
        '<div>',
        'Alpha',
        '',
        'Beta',
        '</div>',
        '',
        '<!--vlaina-rendered-html-boundary-blank-line-->',
        '',
        'After',
      ].join('\n'))
    ).toBe([
      'Before',
      '',
      '<div>',
      'Alpha',
      '',
      'Beta',
      '</div>',
      '',
      'After',
    ].join('\n'));
  });

  it('does not add missing ordered list marker spaces while normalizing persisted markdown', () => {
    expect(
      normalizeSerializedMarkdownDocument(['1.苹果', '2.香蕉', '3.橘子'].join('\n'))
    ).toBe(['1.苹果', '2.香蕉', '3.橘子'].join('\n'));
    expect(normalizeSerializedMarkdownDocument(['1.1', '2.1'].join('\n'))).toBe(
      ['1.1', '2.1'].join('\n')
    );
    expect(normalizeSerializedMarkdownDocument(['0.安装', '', '1.调用笔记'].join('\n'))).toBe(
      ['0.安装', '', '1.调用笔记'].join('\n')
    );
  });

  it('does not canonicalize malformed task list markers while normalizing persisted markdown', () => {
    expect(normalizeSerializedMarkdownDocument(['- [] fsedf', '-[] ', '-[x]done'].join('\n'))).toBe(
      ['- [] fsedf', '-[] ', '-[x]done'].join('\n')
    );
  });

  it('does not canonicalize common non-standard markdown markers while normalizing persisted markdown', () => {
    expect(normalizeSerializedMarkdownDocument(['1、苹果', '2、香蕉'].join('\n'))).toBe(
      ['1、苹果', '2、香蕉'].join('\n')
    );
    expect(normalizeSerializedMarkdownDocument(['-苹果', '-香蕉'].join('\n'))).toBe(
      ['-苹果', '-香蕉'].join('\n')
    );
    expect(normalizeSerializedMarkdownDocument(['#标题', '##子标题'].join('\n'))).toBe(
      ['#标题', '##子标题'].join('\n')
    );
    expect(normalizeSerializedMarkdownDocument(['>引用', '>>嵌套引用'].join('\n'))).toBe(
      ['>引用', '>>嵌套引用'].join('\n')
    );
    expect(normalizeSerializedMarkdownDocument(['＃标题', '＞引用'].join('\n'))).toBe(
      ['＃标题', '＞引用'].join('\n')
    );
    expect(normalizeSerializedMarkdownDocument('－普通破折号文本')).toBe('－普通破折号文本');
  });

  it('converts invisible blank placeholders next to internal user br placeholders', () => {
    expect(
      normalizeSerializedMarkdownDocument('A\n\u200B <br data-vlaina-user-br="true" />\n\u200B\nB')
    ).toBe('A\n\n\nB');
  });

  it('converts standalone br lines into markdown blank lines', () => {
    expect(
      normalizeSerializedMarkdownDocument('1\n<br data-vlaina-empty-line="true" />\n2\n')
    ).toBe('1\n\n2\n');
    expect(normalizeSerializedMarkdownDocument('<br data-vlaina-empty-line="true" />')).toBe('');
  });

  it('converts internal empty line placeholders with serialized html variants', () => {
    expect(
      normalizeSerializedMarkdownDocument('1\n<br data-vlaina-empty-line="true"/>\n2\n')
    ).toBe('1\n\n2\n');
    expect(
      normalizeSerializedMarkdownDocument(
        '1\n<br class="x" data-vlaina-empty-line=true></br>\n2\n'
      )
    ).toBe('1\n\n2\n');
    expect(
      normalizeSerializedMarkdownDocument('1\n<br date-vlaina-empty-line="true"/>\n2\n')
    ).toBe('1\n\n2\n');
    expect(
      normalizeSerializedMarkdownDocument('1\n<br date-vlainaempt-line="true"/>\n2\n')
    ).toBe('1\n\n2\n');
  });

  it('converts standalone br tags into markdown-native line breaks', () => {
    expect(normalizeSerializedMarkdownDocument('1\n<br />\n2\n')).toBe('1\\\n2\n');
    expect(normalizeSerializedMarkdownDocument('<br />')).toBe('');
    expect(normalizeSerializedMarkdownDocument('> <br />')).toBe('>');
    expect(
      normalizeSerializedMarkdownDocument('<br data-vlaina-blockquote-depth="2" data-vlaina-user-br="true" />')
    ).toBe('> >');
  });

  it('converts editor-created empty paragraph br lines into markdown blank lines', () => {
    expect(
      normalizeSerializedMarkdownDocument(['1', '', '2', '', '<br />', '', '3'].join('\n'))
    ).toBe(['1', '', '2', '', '', '3'].join('\n'));
    expect(
      normalizeSerializedMarkdownDocument(['1', '', '2', '<br />', '', '3'].join('\n'))
    ).toBe(['1', '', '2', '', '3'].join('\n'));
    expect(
      normalizeSerializedMarkdownDocument(['1', '', '2', '', '<br />', '3'].join('\n'))
    ).toBe(['1', '', '2', '', '3'].join('\n'));
  });

  it('converts indented editor-created br lines inside list items into markdown blank lines', () => {
    expect(
      normalizeSerializedMarkdownDocument(['- 1', '', '  <br />', '', '- 2'].join('\n'))
    ).toBe(['- 1', '', '- 2'].join('\n'));
    expect(
      normalizeSerializedMarkdownDocument(['- [ ] 1', '', '  <br />', '', '- [ ] 2'].join('\n'))
    ).toBe(['- [ ] 1', '', '- [ ] 2'].join('\n'));
    expect(
      normalizeSerializedMarkdownDocument(['1. 1', '', '   <br />', '', '2. 2'].join('\n'))
    ).toBe(['1. 1', '', '2. 2'].join('\n'));
  });

  it('converts unindented editor-created br lines between list items into markdown blank lines', () => {
    expect(
      normalizeSerializedMarkdownDocument(['- 1', '', '<br></br>', '', '- 2'].join('\n'))
    ).toBe(['- 1', '', '- 2'].join('\n'));
    expect(
      normalizeSerializedMarkdownDocument(['- [ ] 1', '', '<br />', '', '- [ ] 2'].join('\n'))
    ).toBe(['- [ ] 1', '', '- [ ] 2'].join('\n'));
    expect(
      normalizeSerializedMarkdownDocument(['1. 1', '', '<br />', '', '2. 2'].join('\n'))
    ).toBe(['1. 1', '', '2. 2'].join('\n'));
  });

  it('converts multiple editor-created br lines between list items into markdown blank lines', () => {
    expect(
      normalizeSerializedMarkdownDocument(['- 1', '', '<br />', '', '<br />', '', '<br />', '', '- 2'].join('\n'))
    ).toBe(['- 1', '', '', '', '- 2'].join('\n'));
    expect(
      normalizeSerializedMarkdownDocument(['1. 1', '', '<br />', '', '<br />', '', '2. 2'].join('\n'))
    ).toBe(['1. 1', '', '', '2. 2'].join('\n'));
  });

  it('preserves ordered list empty items serialized with br placeholders', () => {
    expect(
      normalizeSerializedMarkdownDocument(['8. before', '9. <br />', '<br />', '10. after'].join('\n'))
    ).toBe(['8. before', '9.', '', '10. after'].join('\n'));
  });

  it('converts internal user br placeholders with serialized html variants', () => {
    expect(
      normalizeSerializedMarkdownDocument('1\n<br data-vlaina-user-br="true"/>\n2\n')
    ).toBe('1\\\n2\n');
    expect(
      normalizeSerializedMarkdownDocument('1\n<br class="x" data-vlaina-user-br=true></br>\n2\n')
    ).toBe('1\\\n2\n');
    expect(
      normalizeSerializedMarkdownDocument('1\n<br date-vlaina-user-br="true"/>\n2\n')
    ).toBe('1\\\n2\n');
  });

  it('keeps ordinary paragraph line breaks as plain markdown newlines', () => {
    expect(
      normalizeSerializedMarkdownDocument(['1', '2', '', '3', '4'].join('\n'))
    ).toBe(['1', '2', '', '3', '4'].join('\n'));
  });

  it('does not turn ordinary slash-adjacent text lines into markdown hard breaks', () => {
    expect(
      normalizeSerializedMarkdownDocument(['hi', '/h', '1'].join('\n'))
    ).toBe(['hi', '/h', '1'].join('\n'));
    expect(
      normalizeSerializedMarkdownDocument(['hi', '/html', '1'].join('\n'))
    ).toBe(['hi', '/html', '1'].join('\n'));
    expect(
      normalizeSerializedMarkdownDocument(['hi', '/h1', '1'].join('\n'))
    ).toBe(['hi', '/h1', '1'].join('\n'));
    expect(
      normalizeSerializedMarkdownDocument(['hi', '/usr/bin', '1'].join('\n'))
    ).toBe(['hi', '/usr/bin', '1'].join('\n'));
  });

  it('keeps ordinary line breaks inside list-adjacent text as plain markdown newlines', () => {
    expect(
      normalizeSerializedMarkdownDocument(['- one', '  two', '- three'].join('\n'))
    ).toBe(['- one', '  two', '- three'].join('\n'));
    expect(
      normalizeSerializedMarkdownDocument(['1. one', '   two', '2. three'].join('\n'))
    ).toBe(['1. one', '   two', '2. three'].join('\n'));
    expect(
      normalizeSerializedMarkdownDocument(['- [ ] one', '  two', '- [ ] three'].join('\n'))
    ).toBe(['- [ ] one', '  two', '- [ ] three'].join('\n'));
  });

  it('does not convert structural markdown boundaries into hard breaks', () => {
    expect(
      normalizeSerializedMarkdownDocument(['# Title', 'Body', '', '- one', '- two'].join('\n'))
    ).toBe(['# Title', 'Body', '', '- one', '- two'].join('\n'));
    expect(
      normalizeSerializedMarkdownDocument(['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n'))
    ).toBe(['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n'));
  });

  it('keeps large plain paragraph documents on the fast normalization path', () => {
    const paragraph = 'This is a long plain paragraph for large markdown open performance. '.repeat(200);
    const markdown = [
      '# Large Plain Document',
      '',
      ...Array.from({ length: 90 }, (_value, index) => `Paragraph ${index}. ${paragraph}`),
    ].join('\n\n');

    expect(markdown.length).toBeGreaterThan(1_000_000);
    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('keeps large documents with empty atx headings unchanged', () => {
    const paragraph = 'This is a long plain paragraph for large markdown normalization. '.repeat(200);
    const markdown = [
      '#',
      '',
      ...Array.from({ length: 90 }, (_value, index) => `Paragraph ${index}. ${paragraph}`),
    ].join('\n\n');

    expect(markdown.length).toBeGreaterThan(1_000_000);
    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('does not add hard breaks to large documents with soft line breaks', () => {
    const paragraph = 'This is a long plain paragraph for large markdown normalization. '.repeat(200);
    const markdown = [
      '# Large Soft Break Document',
      '',
      ...Array.from({ length: 45 }, (_value, index) => `Paragraph ${index}. ${paragraph}\ncontinued ${index}. ${paragraph}`),
    ].join('\n\n');

    expect(markdown.length).toBeGreaterThan(1_000_000);
    expect(normalizeSerializedMarkdownDocument(markdown)).toContain('\ncontinued 0.');
    expect(normalizeSerializedMarkdownDocument(markdown)).not.toContain('\\\ncontinued 0.');
  });

  it('does not fast-path large documents with setext heading markers', () => {
    const paragraph = 'This is a long plain paragraph for large markdown normalization. '.repeat(200);
    const markdown = [
      'Large Setext Document\n===',
      '',
      ...Array.from({ length: 90 }, (_value, index) => `Paragraph ${index}. ${paragraph}`),
    ].join('\n\n');

    expect(markdown.length).toBeGreaterThan(1_000_000);
    expect(normalizeSerializedMarkdownDocument(markdown)).toContain('Large Setext Document\n===');
  });

  it('keeps empty atx headings without adding closing markers', () => {
    expect(
      normalizeSerializedMarkdownDocument(['#', '##', '', 'Body'].join('\n'))
    ).toBe(['#', '##', '', 'Body'].join('\n'));
    expect(
      normalizeSerializedMarkdownDocument(['   ###   ', '', 'Body'].join('\n'))
    ).toBe(['   ###   ', '', 'Body'].join('\n'));
  });

  it('does not canonicalize empty atx-like markers inside fenced code', () => {
    const markdown = ['```md', '#', '##', '```'].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('keeps empty atx headings on the editor-state persistence path', () => {
    expect(
      normalizeEditorStateMarkdownDocument(['#', '##', '', 'Body'].join('\n'))
    ).toBe(['#', '##', '', 'Body'].join('\n'));

    const fenced = ['```md', '#', '##', '```'].join('\n');
    expect(normalizeEditorStateMarkdownDocument(fenced)).toBe(fenced);
  });

  it('does not convert leading frontmatter line breaks into hard breaks', () => {
    expect(
      normalizeSerializedMarkdownDocument(['---', 'title: Alpha', 'tags: test', '---', '', 'Line one', 'Line two'].join('\n'))
    ).toBe(['---', 'title: Alpha', 'tags: test', '---', '', 'Line one', 'Line two'].join('\n'));
  });

  it('keeps editor-state paragraph line breaks as plain newlines for persistence', () => {
    expect(
      normalizeEditorStateMarkdownDocument(['---', 'title: Alpha', 'tags: test', '---', '', 'Line one', 'Line two'].join('\n'))
    ).toBe(['---', 'title: Alpha', 'tags: test', '---', '', 'Line one', 'Line two'].join('\n'));
  });

  it('keeps editor-state user-authored structural blank lines unchanged', () => {
    expect(
      normalizeEditorStateMarkdownDocument(['- one', '', '- two'].join('\n'))
    ).toBe(['- one', '', '- two'].join('\n'));
    expect(
      normalizeEditorStateMarkdownDocument(['# Alpha', '', '## Beta'].join('\n'))
    ).toBe(['# Alpha', '', '## Beta'].join('\n'));
    expect(
      normalizeEditorStateMarkdownDocument(['1', '', '2'].join('\n'))
    ).toBe(['1', '', '2'].join('\n'));
  });

  it('keeps user-authored punctuation escapes on the editor-state persistence path', () => {
    const punctuation = [
      '!', '"', '#', '$', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/', ':',
      ';', '<', '=', '>', '?', '@', '[', ']', '^', '_', '`', '{', '|', '}', '~',
    ];
    const markdown = [
      ...punctuation.map((marker) => `left\\${marker}right`),
      'left\\\\right',
      'Use \\<p and https\\://example.test/path',
    ].join('\n');

    expect(normalizeEditorStateMarkdownDocument(markdown)).toBe(markdown);
  });

  it('preserves long body and terminal blank line runs during document normalization', () => {
    const bodyBlankLineCount = 64;
    const terminalBlankLineCount = 32;
    const markdown = `${[
      '---',
      'title: Blank Lines',
      '---',
      '',
      '# Blank Lines',
      '',
      'Before long run',
      ...Array.from({ length: bodyBlankLineCount }, () => ''),
      'After long run',
    ].join('\n')}${'\n'.repeat(terminalBlankLineCount)}`;

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
    expect(normalizeEditorStateMarkdownDocument(markdown)).toBe(markdown);
  });

  it('normalizes serializer space entities before persistence', () => {
    expect(
      normalizeSerializedMarkdownDocument(
        [
          '&#x20; Pro:   \\$76.80 / year',
          '&#32; Max:   \\$191.90 / year',
          '> &#x20; quoted',
          '- &#x20; list item',
          '1. &#32; ordered item',
        ].join('\n')
      )
    ).toBe(
      [
        '  Pro:   \\$76.80 / year',
        '  Max:   \\$191.90 / year',
        '>   quoted',
        '-   list item',
        '1.   ordered item',
      ].join('\n')
    );
  });

  it('keeps serializer-like space entities inside protected content', () => {
    const fenced = ['```md', '&#x20; literal', '```'].join('\n');
    const frontmatter = ['---', 'title: "&#x20; literal"', '---', '', 'Body'].join('\n');
    const html = ['<pre>', '&#x20; literal', '</pre>'].join('\n');

    expect(normalizeSerializedMarkdownDocument(fenced)).toBe(fenced);
    expect(normalizeSerializedMarkdownDocument(frontmatter)).toBe(frontmatter);
    expect(normalizeSerializedMarkdownDocument(html)).toBe(html);
  });

  it('does not convert display math block line breaks into hard breaks', () => {
    expect(
      normalizeSerializedMarkdownDocument(['Before', '', '$$', 'a = b', 'c = d', '$$', '', 'After'].join('\n'))
    ).toBe(['Before', '', '$$', 'a = b', 'c = d', '$$', '', 'After'].join('\n'));
  });

  it('does not globally rewrite bracket display math fences before editor parsing', () => {
    const markdown = ['Before', '', '\\[', 'x^2', '\\]', '', 'After'].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('does not convert escaped bracket display math fence lines into hard breaks', () => {
    const markdown = ['Before', '', '\\[\\', 'x^2\\', ']', '', 'After'].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('keeps long bracket-only display math blocks on a bounded soft-break scan path', () => {
    const markdown = [
      'Before',
      '',
      '[',
      'plain text ]',
      ...Array.from({ length: 500 }, (_value, index) => `line ${index} ]`),
      'x^2',
      ']',
      '',
      'After',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('restores escaped URL scheme separators in persisted markdown', () => {
    expect(normalizeSerializedMarkdownDocument('http\\://example.test:8317')).toBe(
      'http://example.test:8317'
    );
    expect(normalizeSerializedMarkdownDocument('javascript\\://alert(1)')).toBe(
      'javascript\\://alert(1)'
    );
  });

  it('restores serializer-escaped less-than text in persisted markdown', () => {
    expect(normalizeSerializedMarkdownDocument('\\<p>')).toBe('<p>');
    expect(normalizeSerializedMarkdownDocument('\\</p>')).toBe('</p>');
    expect(normalizeSerializedMarkdownDocument('Use \\<p> in text')).toBe('Use <p> in text');
    expect(normalizeSerializedMarkdownDocument(['```md', '\\<p>', '```'].join('\n'))).toBe(
      ['```md', '\\<p>', '```'].join('\n')
    );
  });

  it('restores serializer-escaped intraword underscores in persisted markdown', () => {
    expect(normalizeSerializedMarkdownDocument('h\\_i')).toBe('h_i');
    expect(normalizeSerializedMarkdownDocument('foo\\_\\_bar')).toBe('foo__bar');
    expect(normalizeSerializedMarkdownDocument('path\\_(x)')).toBe('path_(x)');
    expect(normalizeSerializedMarkdownDocument(['```md', 'h\\_i', '```'].join('\n'))).toBe(
      ['```md', 'h\\_i', '```'].join('\n')
    );
  });

  it('persists editor-authored html-like paragraph text without serializer backslashes', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
        ctx.update(remarkStringifyOptionsCtx, (prev) => ({
          ...prev,
          ...notesRemarkStringifyOptions,
        }));
      })
      .use(commonmark);

    await editor.create();
    try {
      const view = editor.ctx.get(editorViewCtx);
      const schema = view.state.schema;
      const paragraph = schema.nodes.paragraph.create(null, schema.text('<p>'));
      const doc = schema.nodes.doc.create(null, [paragraph]);
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content));

      const serializer = editor.ctx.get(serializerCtx);
      const serialized = serializer(view.state.doc);

      expect(serialized.trim()).toBe('\\<p>');
      expect(stripTrailingNewlines(normalizeSerializedMarkdownDocument(serialized))).toBe('<p>');
    } finally {
      await editor.destroy();
    }
  });

  it('normalizes serializer spacing around editor-authored one-line html blocks', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
        ctx.update(remarkStringifyOptionsCtx, (prev) => ({
          ...prev,
          ...notesRemarkStringifyOptions,
        }));
      })
      .use(commonmark);

    await editor.create();
    try {
      const view = editor.ctx.get(editorViewCtx);
      const schema = view.state.schema;
      const paragraph = schema.nodes.paragraph;
      const htmlBlock = schema.nodes.html_block;
      const doc = schema.nodes.doc.create(null, [
        paragraph.create(null, schema.text('hi')),
        htmlBlock.create({ value: '<p>Fresh middle HTML body</p>' }),
        paragraph.create(null, schema.text('1')),
      ]);
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content));

      const serializer = editor.ctx.get(serializerCtx);
      const serialized = serializer(view.state.doc);

      expect(stripTrailingNewlines(normalizeSerializedMarkdownDocument(serialized))).toBe(
        ['hi', '', '<p>Fresh middle HTML body</p>', '', '1'].join('\n')
      );
    } finally {
      await editor.destroy();
    }
  });

  it('persists editor-authored intraword underscores without serializer backslashes', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
        ctx.update(remarkStringifyOptionsCtx, (prev) => ({
          ...prev,
          ...notesRemarkStringifyOptions,
        }));
      })
      .use(commonmark);

    await editor.create();
    try {
      const view = editor.ctx.get(editorViewCtx);
      const schema = view.state.schema;
      const paragraph = schema.nodes.paragraph.create(null, schema.text('h_i and foo__bar'));
      const doc = schema.nodes.doc.create(null, [paragraph]);
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content));

      const serializer = editor.ctx.get(serializerCtx);
      const serialized = serializer(view.state.doc);

      expect(serialized.trim()).toBe('h\\_i and foo\\_\\_bar');
      expect(stripTrailingNewlines(normalizeSerializedMarkdownDocument(serialized))).toBe('h_i and foo__bar');
    } finally {
      await editor.destroy();
    }
  });

  it('unwraps markdown autolink URL literals in persisted markdown', () => {
    expect(
      normalizeSerializedMarkdownDocument('export GOOGLE_GEMINI_BASE_URL="<http://example.test:8317>"')
    ).toBe('export GOOGLE_GEMINI_BASE_URL="http://example.test:8317"');
    expect(normalizeSerializedMarkdownDocument('<http://example.test:8317>')).toBe(
      'http://example.test:8317'
    );
    expect(normalizeSerializedMarkdownDocument('<HTTPS://example.test:8317>')).toBe(
      'HTTPS://example.test:8317'
    );
  });

  it('persists mailto links as plain emails when the label is the same email', () => {
    expect(
      normalizeSerializedMarkdownDocument('[v.lad.el.a.ina@gmail.com](mailto:v.lad.el.a.ina@gmail.com)')
    ).toBe('v.lad.el.a.ina@gmail.com');
    expect(
      normalizeSerializedMarkdownDocument('[USER@EXAMPLE.TEST](MAILTO:user@example.test)')
    ).toBe('USER@EXAMPLE.TEST');
    expect(normalizeSerializedMarkdownDocument('[mail](mailto:v.lad.el.a.ina@gmail.com)')).toBe(
      '[mail](mailto:v.lad.el.a.ina@gmail.com)'
    );
  });

  it('does not rewrite escaped URL scheme separators inside fenced code', () => {
    const markdown = ['```txt', 'http\\://example.test:8317', '```'].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
    expect(normalizeEscapedUrlSchemes(markdown)).toBe(markdown);
  });

  it('converts internal blockquote br placeholders with serialized html variants', () => {
    expect(
      normalizeSerializedMarkdownDocument(
        '<br class="x" data-vlaina-user-br=true data-vlaina-blockquote-depth=2></br>'
      )
    ).toBe('> >');
    expect(
      normalizeSerializedMarkdownDocument(
        '<br date-vlaina-blockquote-depth="2" date-vlaina-user-br="true"/>'
      )
    ).toBe('> >');
  });

  it('does not rewrite user text that resembles internal sentinels', () => {
    expect(normalizeSerializedMarkdownDocument('VLAINA_LIST_GAP_SENTINEL')).toBe(
      'VLAINA_LIST_GAP_SENTINEL'
    );
    expect(normalizeSerializedMarkdownDocument('VLAINA_USER_BR_SENTINEL')).toBe(
      'VLAINA_USER_BR_SENTINEL'
    );
  });

  it('does not persist leaked internal sentinel artifacts', () => {
    const listGapNormalized = normalizeSerializedMarkdownDocument('A\n��VLAINA_LIST_GAP_SENTINEL��\nB');
    const userBreakNormalized = normalizeSerializedMarkdownDocument('A\n��VLAINA_USER_BR_SENTINEL��\nB');

    expect(listGapNormalized).toBe('A\n\nB');
    expect(userBreakNormalized).toBe('A\\\nB');
    expect(listGapNormalized).not.toContain('�');
    expect(userBreakNormalized).not.toContain('�');
    expect(listGapNormalized).not.toMatch(/VLAINA_(?:LIST_GAP|USER_BR)_SENTINEL/);
    expect(userBreakNormalized).not.toMatch(/VLAINA_(?:LIST_GAP|USER_BR)_SENTINEL/);
  });

  it('converts internal list gap placeholders back to markdown blank lines', () => {
    expect(
      normalizeSerializedMarkdownDocument('- one\n\u2800\n- two\n')
    ).toBe('- one\n\n- two\n');
    expect(
      normalizeSerializedMarkdownDocument('- parent\n    - \u2800\n    - child\n')
    ).toBe('- parent\n\n    - child\n');
    expect(
      normalizeSerializedMarkdownDocument('- parent\n    - \\\u2800\n    - child\n')
    ).toBe('- parent\n\n    - child\n');
    expect(
      normalizeSerializedMarkdownDocument('> 1. parent\n>    - \u2800\n>    1. child\n')
    ).toBe('> 1. parent\n>\n>    1. child\n');
    expect(
      normalizeSerializedMarkdownDocument('- one\n<br data-vlaina-list-gap="true"/>\n- two\n')
    ).toBe('- one\n\n- two\n');
    expect(
      normalizeSerializedMarkdownDocument(
        '- one\n<br class="x" data-vlaina-list-gap=true></br>\n- two\n'
      )
    ).toBe('- one\n\n- two\n');
    expect(
      normalizeSerializedMarkdownDocument('- one\n<br date-vlaina-list-gap="true"/>\n- two\n')
    ).toBe('- one\n\n- two\n');
    expect(
      normalizeSerializedMarkdownDocument('- one\n<br date-vlainalist-gap="true"/>\n- two\n')
    ).toBe('- one\n\n- two\n');
  });

  it('normalizes editable list gap placeholders across long blank runs', () => {
    const markdown = [
      '- before',
      ...Array.from({ length: 500 }, () => ''),
      '- \u2800',
      ...Array.from({ length: 500 }, () => ''),
      '- after',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe('- before\n\n- after');
  });

  it('does not rewrite placeholder-like text inside fenced code', () => {
    const markdown = [
      '```md',
      '<br data-vlaina-empty-line="true" />',
      '- [ ] <br />',
      '- \u2800',
      '- one',
      '',
      '- two',
      '```',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('does not unescape markdown punctuation inside fenced code', () => {
    const markdown = ['```md', '\\*literal\\*', '```'].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('escapes supported inline html text before persistence', () => {
    expect(
      normalizeSerializedMarkdownDocument(
        '<sup>a < b & c</sup> <mark>h = i</mark> <u>x + y</u> <mark style="background-color: #fff">x > y</mark>'
      )
    ).toBe(
      '<sup>a &lt; b &amp; c</sup> <mark>h = i</mark> <u>x + y</u> <mark style="background-color: #fff">x &gt; y</mark>'
    );
  });

  it('escapes generic inline html text before persistence', () => {
    expect(
      normalizeSerializedMarkdownDocument('<span data-note="keep">plain < text & value</span> <kbd>Ctrl & A</kbd>')
    ).toBe('<span data-note="keep">plain &lt; text &amp; value</span> <kbd>Ctrl &amp; A</kbd>');
  });

  it('keeps nested generic inline html tags intact', () => {
    expect(
      normalizeSerializedMarkdownDocument('<span data-note="keep"><em>plain</em></span>')
    ).toBe('<span data-note="keep"><em>plain</em></span>');
  });

  it('keeps nested supported inline html tags intact', () => {
    expect(
      normalizeSerializedMarkdownDocument(
        '<span style="color: #123456"><em>nested</em></span> <mark style="background-color: #fff"><strong>bold</strong></mark>'
      )
    ).toBe(
      '<span style="color: #123456"><em>nested</em></span> <mark style="background-color: #fff"><strong>bold</strong></mark>'
    );
  });

  it('canonicalizes strong text before inline code when the editor cannot keep the mark boundary stable', () => {
    expect(normalizeSerializedMarkdownDocument('Use **bold with `code`** here.')).toBe(
      'Use **bold with** `code` here.'
    );
  });

  it('does not add blank blockquote lines between adjacent callout list items while normalizing persisted markdown', () => {
    expect(
      normalizeSerializedMarkdownDocument(['> 💡 Callout title', '>', '> - First item', '> - Second item'].join('\n'))
    ).toBe(['> 💡 Callout title', '>', '> - First item', '> - Second item'].join('\n'));
  });

  it('does not canonicalize thematic break variants while normalizing persisted markdown', () => {
    expect(normalizeSerializedMarkdownDocument(['before', '', '***', '', 'after'].join('\n'))).toBe(
      ['before', '', '***', '', 'after'].join('\n')
    );
    expect(normalizeSerializedMarkdownDocument(['before', '', '___', '', 'after'].join('\n'))).toBe(
      ['before', '', '___', '', 'after'].join('\n')
    );
  });

  it('does not canonicalize a single bullet marker as a thematic break', () => {
    expect(normalizeSerializedMarkdownDocument('-')).toBe('-');
    expect(normalizeSerializedMarkdownDocument(['- parent', '  -'].join('\n'))).toBe(
      ['- parent', '  -'].join('\n')
    );
  });

  it('does not rewrite custom inline html text inside fenced code', () => {
    const markdown = ['```html', '<sup>a < b & c</sup>', '```'].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('does not rewrite placeholder-like text inside raw html blocks', () => {
    const markdown = ['<pre>', '<br data-vlaina-empty-line="true" />', '</pre>'].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('does not rewrite placeholder-like text inside generic html blocks', () => {
    const markdown = ['<div>', '<br data-vlaina-empty-line="true" />', '</div>'].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('removes serializer-added spacing before generic html block closing tags', () => {
    expect(
      normalizeSerializedMarkdownDocument(['<div>', 'Alpha', '', 'Beta', '', '</div>'].join('\n'))
    ).toBe(['<div>', 'Alpha', '', 'Beta', '</div>'].join('\n'));
  });

  it('does not remove generic html closing spacing inside leading frontmatter', () => {
    const markdown = [
      '---',
      'snippet: |',
      '  <div>',
      '  Alpha',
      '',
      '  </div>',
      '---',
      '',
      'Body',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('does not remove generic html closing spacing inside fenced code', () => {
    const markdown = [
      '```html',
      '<div>',
      'Alpha',
      '',
      '</div>',
      '```',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('does not rewrite placeholder-like text inside blockquote fenced code', () => {
    const markdown = [
      '> ```md',
      '> <br data-vlaina-empty-line="true" />',
      '> - [ ] <br />',
      '> ```',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('does not rewrite placeholder-like text inside blockquote raw html blocks', () => {
    const markdown = [
      '> <pre>',
      '> <br data-vlaina-empty-line="true" />',
      '> </pre>',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('does not rewrite placeholder-like text inside nested blockquote protected blocks', () => {
    const markdown = [
      '> > ```md',
      '> > <br data-vlaina-empty-line="true" />',
      '> > - [ ] <br />',
      '> > ```',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe(markdown);
  });

  it('removes placeholder br tags from persisted empty task items and table cells', () => {
    expect(normalizeSerializedMarkdownDocument('- [ ] <br />\n')).toBe('- [ ]\n');
    expect(
      normalizeSerializedMarkdownDocument('| a | b |\n| --- | --- |\n| <br /> | 2 |\n')
    ).toBe('| a | b |\n| --- | --- |\n|   | 2 |\n');
  });

  it('removes placeholder br tags from persisted empty footnote definitions and all table cells', () => {
    expect(normalizeSerializedMarkdownDocument('[^1]: <br />\n')).toBe('[^1]:\n');
    expect(
      normalizeSerializedMarkdownDocument('| <br /> | <br /> |\n| --- | --- |\n| <br /> | 2 |\n')
    ).toBe('|   |   |\n| --- | --- |\n|   | 2 |\n');
  });

  it('keeps escaped abbreviation definition syntax literal in persisted markdown', () => {
    expect(normalizeSerializedMarkdownDocument('\\*\\[HTML]: HyperText Markup Language\n')).toBe(
      '\\*\\[HTML]: HyperText Markup Language\n'
    );
    expect(normalizeSerializedMarkdownDocument('\\*[HTML]: HyperText Markup Language\n')).toBe(
      '\\*[HTML]: HyperText Markup Language\n'
    );
    expect(
      normalizeSerializedMarkdownDocument(['```md', '\\*\\[HTML]: literal', '```'].join('\n'))
    ).toBe(['```md', '\\*\\[HTML]: literal', '```'].join('\n'));
  });

  it('keeps escaped highlight syntax literal in persisted markdown', () => {
    expect(normalizeSerializedMarkdownDocument('\\==highlight==\n')).toBe('\\==highlight==\n');
    expect(
      normalizeSerializedMarkdownDocument(['```md', '\\==literal==', '```'].join('\n'))
    ).toBe(['```md', '\\==literal==', '```'].join('\n'));
  });
});

describe('normalizeSerializedMarkdownSelection', () => {
  function expectNoInternalClipboardArtifacts(text: string) {
    expect(text).not.toContain('\u0000');
    expect(text).not.toContain('�');
    expect(text).not.toMatch(/VLAINA_(?:LIST_GAP|USER_BR)_SENTINEL/);
    expect(text).not.toMatch(/data-vlaina-/);
  }

  it('converts standalone br tags to single newline', () => {
    expect(normalizeSerializedMarkdownSelection('<br />')).toBe('\n');
  });

  it('converts standalone invisible blank-line placeholders to single newline', () => {
    expect(normalizeSerializedMarkdownSelection('\u200B\n')).toBe('\n');
  });

  it('converts marked standalone br placeholders to single newline', () => {
    expect(normalizeSerializedMarkdownSelection('<br data-vlaina-empty-line="true" />')).toBe('\n');
    expect(normalizeSerializedMarkdownSelection('<br data-vlaina-empty-line="true"/>')).toBe('\n');
  });

  it('converts internal user br placeholders in copied selections', () => {
    expect(
      normalizeSerializedMarkdownSelection(['Line one', '<br data-vlaina-user-br="true" />', 'Line two'].join('\n'))
    ).toBe(['Line one\\', 'Line two'].join('\n'));
  });

  it('keeps blockquote user br placeholders when normalizing selections', () => {
    expect(
      normalizeSerializedMarkdownSelection(
        '<br data-vlaina-blockquote-depth="2" data-vlaina-user-br="true" />'
      )
    ).toBe('> > <br />');
  });

  it('removes placeholder br tags from copied empty task items', () => {
    expect(
      normalizeSerializedMarkdownSelection('- [ ] todo\n  - [ ] 1\n    - [ ] <br />\n')
    ).toBe('- [ ] todo\n  - [ ] 1\n    - [ ]');
  });

  it('removes placeholder br tags from copied empty table cells', () => {
    expect(
      normalizeSerializedMarkdownSelection('| a | b |\n| --- | --- |\n| <br /> | 2 |\n')
    ).toBe('| a | b |\n| --- | --- |\n|   | 2 |');
  });

  it('keeps normal markdown content', () => {
    expect(normalizeSerializedMarkdownSelection('- [ ] task\n')).toBe('- [ ] task');
  });

  it('restores escaped highlight syntax in copied selections', () => {
    expect(normalizeSerializedMarkdownSelection('\\==highlight==\n')).toBe('==highlight==');
  });

  it('restores escaped URL scheme separators in copied selections', () => {
    expect(normalizeSerializedMarkdownSelection('http\\://example.test:8317\n')).toBe(
      'http://example.test:8317'
    );
    expect(normalizeSerializedMarkdownSelection('file\\:///tmp/secret.png\n')).toBe(
      'file\\:///tmp/secret.png'
    );
  });

  it('restores serializer-escaped less-than text in copied selections', () => {
    expect(normalizeSerializedMarkdownSelection('\\<p>\n')).toBe('<p>');
    expect(normalizeSerializedMarkdownSelection('Use \\<p> here\n')).toBe('Use <p> here');
  });

  it('unwraps markdown autolink URL literals in copied selections', () => {
    expect(
      normalizeSerializedMarkdownSelection('export GOOGLE_GEMINI_BASE_URL="<http://example.test:8317>"')
    ).toBe('export GOOGLE_GEMINI_BASE_URL="http://example.test:8317"');
  });

  it('does not collapse user-authored blank lines inside selected fenced code blocks', () => {
    const markdown = ['```txt', 'before', '', '', 'after', '```'].join('\n');

    expect(normalizeSerializedMarkdownSelection(markdown)).toBe(markdown);
  });

  it('does not expose internal list gap sentinels in copied selections', () => {
    const nulNormalized = normalizeSerializedMarkdownSelection('A\n\u0000VLAINA_LIST_GAP_SENTINEL\u0000\nB');
    const leakedNormalized = normalizeSerializedMarkdownSelection('A\n��VLAINA_LIST_GAP_SENTINEL��\nB');

    expect(nulNormalized).toBe('A\n\nB');
    expect(leakedNormalized).toBe('A\n\nB');
    expectNoInternalClipboardArtifacts(nulNormalized);
    expectNoInternalClipboardArtifacts(leakedNormalized);
  });

  it('does not expose internal user break sentinels in copied selections', () => {
    const nulNormalized = normalizeSerializedMarkdownSelection('A\n\u0000VLAINA_USER_BR_SENTINEL\u0000\nB');
    const leakedNormalized = normalizeSerializedMarkdownSelection('A\n��VLAINA_USER_BR_SENTINEL��\nB');

    expect(nulNormalized).toBe('A\\\nB');
    expect(leakedNormalized).toBe('A\\\nB');
    expectNoInternalClipboardArtifacts(nulNormalized);
    expectNoInternalClipboardArtifacts(leakedNormalized);
  });

  it('does not treat user-authored sentinel-like text as internal clipboard state', () => {
    expect(normalizeSerializedMarkdownSelection('VLAINA_LIST_GAP_SENTINEL')).toBe('VLAINA_LIST_GAP_SENTINEL');
    expect(normalizeSerializedMarkdownSelection('VLAINA_USER_BR_SENTINEL')).toBe('VLAINA_USER_BR_SENTINEL');
  });
});

describe('joinSerializedBlocks', () => {
  it('returns newline for single empty copied block', () => {
    expect(joinSerializedBlocks([''])).toBe('\n');
  });

  it('preserves empty gaps between non-empty blocks', () => {
    expect(joinSerializedBlocks(['A', '', 'B'])).toBe('A\n\nB');
  });

  it('uses blank lines between non-list markdown blocks', () => {
    expect(joinSerializedBlocks(['# Title', 'Body'])).toBe('# Title\n\nBody');
  });

  it('keeps adjacent list items tightly joined', () => {
    expect(joinSerializedBlocks(['- first', '- second'])).toBe('- first\n- second');
    expect(joinSerializedBlocks(['1) first', '2) second'])).toBe('1) first\n2) second');
  });
});
