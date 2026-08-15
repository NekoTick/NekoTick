import { describe, expect, it } from 'vitest';
import { parseSourceOutline } from './useSourceNotesOutline';

describe('parseSourceOutline', () => {
  it('collects editable Markdown headings and ignores fenced code', () => {
    const markdown = [
      '# Introduction',
      '',
      '## **Details**',
      '',
      '```md',
      '# Not a heading',
      '```',
      '',
      'Summary',
      '-------',
    ].join('\n');

    expect(parseSourceOutline(markdown)).toEqual([
      expect.objectContaining({ level: 1, text: 'Introduction', from: 0 }),
      expect.objectContaining({ level: 2, text: 'Details', from: markdown.indexOf('## **Details**') }),
      expect.objectContaining({ level: 2, text: 'Summary', from: markdown.indexOf('Summary') }),
    ]);
  });
});
