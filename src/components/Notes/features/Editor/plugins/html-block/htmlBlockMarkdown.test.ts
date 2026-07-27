import { describe, expect, it } from 'vitest';
import {
  markSourceTightHtmlBoundaries,
  SOURCE_HTML_BLANK_LINE_COUNT_AFTER_ATTR,
  SOURCE_TIGHT_HTML_BEFORE_ATTR,
} from './htmlBlockMarkdown';

function htmlNodeAt(markdown: string, value: string) {
  return {
    type: 'html',
    value,
    position: {
      end: { offset: markdown.indexOf(value) + value.length },
      start: { offset: markdown.indexOf(value) },
    },
    data: undefined as Record<string, unknown> | undefined,
  };
}

describe('source HTML boundaries', () => {
  it('marks a source-tight root HTML block', () => {
    const markdown = ['```md', 'code', '```', '<div>HTML</div>'].join('\n');
    const html = htmlNodeAt(markdown, '<div>HTML</div>');
    const tree = { type: 'root', children: [html] };

    markSourceTightHtmlBoundaries(tree, markdown);

    expect(html.data).toEqual({ [SOURCE_TIGHT_HTML_BEFORE_ATTR]: true });
  });

  it.each([1, 2])('does not mark HTML after %s authored blank line(s)', (blankLineCount) => {
    const markdown = ['Before', ...Array.from({ length: blankLineCount }, () => ''), '<div>HTML</div>'].join('\n');
    const html = htmlNodeAt(markdown, '<div>HTML</div>');
    const tree = { type: 'root', children: [html] };

    markSourceTightHtmlBoundaries(tree, markdown);

    expect(html.data).toBeUndefined();
  });

  it.each([0, 1, 2])('records %s authored blank line(s) after HTML', (blankLineCount) => {
    const value = '<textarea>HTML</textarea>';
    const markdown = [value, ...Array.from({ length: blankLineCount }, () => ''), '# After'].join('\n');
    const html = htmlNodeAt(markdown, value);

    markSourceTightHtmlBoundaries({ type: 'root', children: [html] }, markdown);

    expect(html.data?.[SOURCE_HTML_BLANK_LINE_COUNT_AFTER_ATTR]).toBe(blankLineCount);
  });

  it.each([0, 1, 2])('records %s authored blockquote blank line(s) after HTML', (blankLineCount) => {
    const value = ['<textarea>', 'HTML', '</textarea>'].join('\n');
    const lines = [
      '> <textarea>',
      '> HTML',
      '> </textarea>',
      ...Array.from({ length: blankLineCount }, () => '>'),
      '> # After',
    ];
    const markdown = lines.join('\n');
    const html = {
      type: 'html',
      value,
      position: {
        end: { offset: markdown.indexOf('> </textarea>') + '> </textarea>'.length },
        start: { offset: markdown.indexOf('<textarea>') },
      },
      data: undefined as Record<string, unknown> | undefined,
    };

    markSourceTightHtmlBoundaries({
      type: 'root',
      children: [{ type: 'blockquote', children: [html] }],
    }, markdown);

    expect(html.data?.[SOURCE_HTML_BLANK_LINE_COUNT_AFTER_ATTR]).toBe(blankLineCount);
  });
});
