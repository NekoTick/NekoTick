import { describe, expect, it, vi } from 'vitest';
import {
    extractLargestMarkdownFenceContent,
    isStandaloneFencedCodeBlock,
    looksLikeMarkdownForPaste,
    looksLikePlainTextWithOnlyBackslashHardBreakSignal,
    normalizeInterruptedOrderedListsForPaste,
    normalizeStandaloneThematicBreaksForPaste,
    parseStandaloneAtxHeading,
    parseStandaloneFencedCodeBlock,
} from './fencedCodePaste';

describe('isStandaloneFencedCodeBlock', () => {
    it('matches a basic fenced code block', () => {
        expect(isStandaloneFencedCodeBlock('```\n# ni\n```')).toBe(true);
    });

    it('matches fenced code block with language and windows line endings', () => {
        expect(isStandaloneFencedCodeBlock('```ts\r\nconst a = 1;\r\n```')).toBe(true);
    });

    it('matches fenced code blocks surrounded by blank lines without dropping code whitespace', () => {
        expect(parseStandaloneFencedCodeBlock('\n```txt\n  indented\n```\n')).toEqual({
            language: 'txt',
            code: '  indented',
        });
    });

    it('does not treat four-space-indented text as a standalone fenced code block', () => {
        expect(parseStandaloneFencedCodeBlock('    ```ts\nconst a = 1;\n    ```')).toBeNull();
    });

    it('matches tilde fenced code blocks', () => {
        expect(parseStandaloneFencedCodeBlock('~~~sequence\nAlice->Bob: Hi\n~~~')).toEqual({
            language: 'sequence',
            code: 'Alice->Bob: Hi',
        });
    });

    it('matches fences when the closing fence is longer than the opening fence', () => {
        expect(parseStandaloneFencedCodeBlock('```ts\nconst a = 1;\n````')).toEqual({
            language: 'ts',
            code: 'const a = 1;',
        });
    });

    it('extracts code content and language', () => {
        expect(parseStandaloneFencedCodeBlock('```md\n# ni \n```')).toEqual({
            language: 'md',
            code: '# ni ',
        });
    });

    it('uses the first info-string token as the fenced code language', () => {
        expect(parseStandaloneFencedCodeBlock('```ts title="Example"\nconst a = 1;\n```')).toEqual({
            language: 'ts',
            code: 'const a = 1;',
        });
    });

    it('rejects backtick fences with backticks in the info string', () => {
        expect(parseStandaloneFencedCodeBlock('```ts`\nconst a = 1;\n```')).toBeNull();
    });

    it('allows backticks in tilde fence info strings', () => {
        expect(parseStandaloneFencedCodeBlock('~~~lang`meta\nvalue\n~~~')).toEqual({
            language: 'lang`meta',
            code: 'value',
        });
    });

    it('does not match when fenced block is mixed with non-fence text', () => {
        expect(isStandaloneFencedCodeBlock('before\n```ts\nconst a = 1;\n```\nafter')).toBe(false);
    });

    it('does not treat multiple fenced code blocks as one standalone code block', () => {
        expect(parseStandaloneFencedCodeBlock([
            '```',
            'code',
            '```',
            '',
            '```',
            'code',
            '```',
        ].join('\n'))).toBeNull();
    });

    it('keeps shorter same-marker fence lines as code content', () => {
        expect(parseStandaloneFencedCodeBlock([
            '````ts',
            '```',
            'const value = 1;',
            '````',
        ].join('\n'))).toEqual({
            language: 'ts',
            code: ['```', 'const value = 1;'].join('\n'),
        });
    });

    it('does not match inline code fence text', () => {
        expect(isStandaloneFencedCodeBlock('```ts```')).toBe(false);
    });

    it('returns null for invalid fenced text', () => {
        expect(parseStandaloneFencedCodeBlock('before\n```ts\nconst a = 1;\n```')).toBeNull();
    });

    it('returns null when the closing fence is shorter or uses the wrong marker', () => {
        expect(parseStandaloneFencedCodeBlock('````ts\nconst a = 1;\n```')).toBeNull();
        expect(parseStandaloneFencedCodeBlock('```ts\nconst a = 1;\n~~~')).toBeNull();
    });
});

describe('parseStandaloneAtxHeading', () => {
    it('parses basic heading', () => {
        expect(parseStandaloneAtxHeading('# ni ')).toEqual({ level: 1, text: 'ni' });
    });

    it('parses trailing spaces and keeps text trimmed', () => {
        expect(parseStandaloneAtxHeading('# nii   ')).toEqual({ level: 1, text: 'nii' });
    });

    it('removes a valid closing sequence from standalone headings', () => {
        expect(parseStandaloneAtxHeading('### hello world ###')).toEqual({ level: 3, text: 'hello world' });
    });

    it('keeps hash characters that are part of the heading text', () => {
        expect(parseStandaloneAtxHeading('### issue #123')).toEqual({ level: 3, text: 'issue #123' });
    });

    it('parses single character heading', () => {
        expect(parseStandaloneAtxHeading('# i')).toEqual({ level: 1, text: 'i' });
    });

    it('parses heading with level and trailing newline', () => {
        expect(parseStandaloneAtxHeading('### hello world\n')).toEqual({ level: 3, text: 'hello world' });
    });

    it('does not parse multiline input', () => {
        expect(parseStandaloneAtxHeading('# a\nb')).toBeNull();
    });
});

describe('looksLikeMarkdownForPaste', () => {
    it('detects standalone toc shortcuts', () => {
        expect(looksLikeMarkdownForPaste('[toc]')).toBe(true);
        expect(looksLikeMarkdownForPaste('{:toc}')).toBe(true);
        expect(looksLikeMarkdownForPaste('  [TOC]  ')).toBe(true);
    });

    it('detects blockquote markdown', () => {
        expect(looksLikeMarkdownForPaste('> quote')).toBe(true);
    });

    it('detects ordered list markdown', () => {
        expect(looksLikeMarkdownForPaste('1. item')).toBe(true);
    });

    it('detects list markdown', () => {
        expect(looksLikeMarkdownForPaste('- item')).toBe(true);
    });

    it('detects markdown link syntax', () => {
        expect(looksLikeMarkdownForPaste('[OpenAI](https://openai.com)')).toBe(true);
    });

    it('detects table-like markdown row', () => {
        expect(looksLikeMarkdownForPaste('| a | b |')).toBe(true);
    });

    it('detects display math blocks', () => {
        expect(looksLikeMarkdownForPaste('$$\ndfsdf\n$$')).toBe(true);
    });

    it('detects bracket display math blocks', () => {
        expect(looksLikeMarkdownForPaste('\\[\nx^2\n\\]')).toBe(true);
        expect(looksLikeMarkdownForPaste('[\\\nx^2\\\n]')).toBe(true);
        expect(looksLikeMarkdownForPaste('[\nx^2\n]')).toBe(true);
    });

    it('detects inline math', () => {
        expect(looksLikeMarkdownForPaste('$x^2$')).toBe(true);
    });

    it('detects footnote markdown', () => {
        expect(looksLikeMarkdownForPaste('Footnote ref[^1].')).toBe(true);
        expect(looksLikeMarkdownForPaste('[^1]: Footnote body')).toBe(true);
    });

    it('detects definition list markdown', () => {
        expect(looksLikeMarkdownForPaste(['Term', ': Definition'].join('\n'))).toBe(true);
        expect(looksLikeMarkdownForPaste(['Term', '', ': Definition'].join('\n'))).toBe(true);
        expect(looksLikeMarkdownForPaste(['Term', '', '\\: Definition'].join('\n'))).toBe(false);
    });

    it('detects custom inline markdown marks', () => {
        expect(looksLikeMarkdownForPaste('==highlight==')).toBe(true);
        expect(looksLikeMarkdownForPaste('++underline++')).toBe(true);
        expect(looksLikeMarkdownForPaste('<sup>up</sup>')).toBe(true);
        expect(looksLikeMarkdownForPaste('<sub>down</sub>')).toBe(true);
        expect(looksLikeMarkdownForPaste('<mark>marked</mark>')).toBe(true);
        expect(looksLikeMarkdownForPaste('<span style="color: #123456">red</span>')).toBe(true);
    });

    it('detects inline markdown', () => {
        expect(looksLikeMarkdownForPaste('**bold** text')).toBe(true);
    });

    it('ignores plain text', () => {
        expect(looksLikeMarkdownForPaste('hello world')).toBe(false);
    });
});

describe('looksLikePlainTextWithOnlyBackslashHardBreakSignal', () => {
    it('detects plain text where trailing backslashes are the only markdown signal', () => {
        expect(looksLikePlainTextWithOnlyBackslashHardBreakSignal([
            '7）视图模式：支持大纲和文档列表视图，方便在不同段落和不同文件之间进行切换。\\',
            '8）跨平台：支持macOS、Windows和Linux系统。\\',
            '9）目前免费：这么好用的编辑器竟然是免费的。',
        ].join('\n'))).toBe(true);
    });

    it('does not capture structural markdown with trailing backslashes', () => {
        expect(looksLikePlainTextWithOnlyBackslashHardBreakSignal('- item\\\n- next')).toBe(false);
        expect(looksLikePlainTextWithOnlyBackslashHardBreakSignal('[link](https://example.com)\\\nnext')).toBe(false);
    });

    it('scans trailing backslash lines without splitting the whole text', () => {
        const splitSpy = vi.spyOn(String.prototype, 'split');

        expect(looksLikePlainTextWithOnlyBackslashHardBreakSignal(`plain\\\n${'x'.repeat(64 * 1024)}`)).toBe(true);
        expect(splitSpy).not.toHaveBeenCalled();

        splitSpy.mockRestore();
    });
});

describe('extractLargestMarkdownFenceContent', () => {
    it('extracts content from a standalone markdown fence', () => {
        expect(extractLargestMarkdownFenceContent('```markdown\n# Title\n- item\n```')).toBe('# Title\n- item');
    });

    it('extracts the largest markdown fence from mixed prose', () => {
        const value = [
            'intro',
            '```markdown',
            '# Main',
            '```python',
            'print(1)',
            '```',
            '```',
            'tail',
        ].join('\n');

        expect(extractLargestMarkdownFenceContent(value)).toBe('# Main\n```python\nprint(1)\n```');
    });

    it('returns null when markdown fence is missing', () => {
        expect(extractLargestMarkdownFenceContent('```ts\nconst a = 1;\n```')).toBeNull();
    });

    it('scans many unclosed markdown fence openings linearly', () => {
        const lines = Array.from(
            { length: 10_000 },
            (_value, index) => `\`\`\`markdown\n# Draft ${index}`
        );

        expect(extractLargestMarkdownFenceContent(lines.join('\n'))).toBeNull();
    });
});

describe('normalizeInterruptedOrderedListsForPaste', () => {
    const parserBoundary = '';

    it('separates a paragraph from a following ordered list that starts after 1', () => {
        expect(normalizeInterruptedOrderedListsForPaste([
            '`mindmap支持是否完整`',
            '3. 表格看看是否需要调整大小',
            '4. ',
            '5. 斜杠工具栏',
        ].join('\n'))).toBe([
            '`mindmap支持是否完整`',
            parserBoundary,
            '3. 表格看看是否需要调整大小',
            '4. ',
            '5. 斜杠工具栏',
        ].join('\n'));
    });

    it('does not split an existing ordered list after an indented child item', () => {
        expect(normalizeInterruptedOrderedListsForPaste([
            '`mindmap支持是否完整`',
            '3. 表格看看是否需要调整大小',
            '11. 这个merger表格根本用不了',
            '    1. 在他下面弄个反斜杠直接消失了',
            '12. 自动生成的目录部分的高度需要调整',
        ].join('\n'))).toBe([
            '`mindmap支持是否完整`',
            parserBoundary,
            '3. 表格看看是否需要调整大小',
            '11. 这个merger表格根本用不了',
            '    1. 在他下面弄个反斜杠直接消失了',
            '12. 自动生成的目录部分的高度需要调整',
        ].join('\n'));
    });

    it('recognizes an indented child item as part of an interrupted ordered list', () => {
        expect(normalizeInterruptedOrderedListsForPaste([
            '`mindmap支持是否完整`',
            '3. 这个merger表格根本用不了',
            '    1. 在他下面弄个反斜杠直接消失了',
        ].join('\n'))).toBe([
            '`mindmap支持是否完整`',
            parserBoundary,
            '3. 这个merger表格根本用不了',
            '    1. 在他下面弄个反斜杠直接消失了',
        ].join('\n'));
    });

    it('does not rewrite ordered-list-looking lines inside fenced code', () => {
        const value = ['```md', '`mindmap`', '3. inside code', '4. still code', '```'].join('\n');
        expect(normalizeInterruptedOrderedListsForPaste(value)).toBe(value);
    });

    it.each([
        ['list', ['- ```md', '  paragraph', '  3. inside code', '  4. still code', '  ```']],
        ['blockquote', ['> ```md', '> paragraph', '> 3. inside code', '> 4. still code', '> ```']],
    ])('does not rewrite ordered-list-looking lines inside %s-contained fenced code', (_name, lines) => {
        const value = lines.join('\n');
        expect(normalizeInterruptedOrderedListsForPaste(value)).toBe(value);
    });
});

describe('normalizeStandaloneThematicBreaksForPaste', () => {
    it('does not add blank lines around thematic-break-like input', () => {
        expect(normalizeStandaloneThematicBreaksForPaste('---\n测试\n---')).toBe('---\n测试\n---');
    });

    it('keeps a setext heading underline unchanged', () => {
        expect(normalizeStandaloneThematicBreaksForPaste('Title\n---')).toBe('Title\n---');
    });

    it('keeps a long hyphen underline as a setext heading marker', () => {
        expect(normalizeStandaloneThematicBreaksForPaste([
            'Setext Heading Level Two Sentinel',
            '---------------------------------',
        ].join('\n'))).toBe([
            'Setext Heading Level Two Sentinel',
            '---------------------------------',
        ].join('\n'));
    });

    it('keeps existing blank-line-separated thematic breaks unchanged', () => {
        expect(normalizeStandaloneThematicBreaksForPaste('---\n\nBody\n\n---')).toBe('---\n\nBody\n\n---');
    });

    it('does not rewrite thematic-break-like lines inside fenced code', () => {
        const value = ['```md', 'alpha', '---', 'beta', '```', '---', 'tail'].join('\n');
        expect(normalizeStandaloneThematicBreaksForPaste(value)).toBe(value);
    });
});
