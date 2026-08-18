import { describe, expect, it } from 'vitest';
import { getOutlineFallbackText } from '../../Sidebar/Outline/outlineUtils';
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

  it('preserves the full document outline across frontmatter and nested containers', () => {
    const markdown = [
      '---',
      'title: Frontmatter is not a heading',
      '---',
      '# Root',
      '',
      '- fenced example',
      '  ```markdown',
      '  # Not a heading',
      '  ```',
      '  ## List heading',
      '',
      '> ## Quote heading',
      '',
      'Reference[^outline].',
      '',
      '[^outline]: Footnote body',
      '    ### Footnote heading',
      '',
      '## Mermaid section after list fence',
      '',
      '```mermaid',
      'graph TD',
      '  A --> B',
      '```',
      '',
      '#',
    ].join('\n');

    expect(parseSourceOutline(markdown).map(({ level, text, from }) => ({ level, text, from }))).toEqual([
      { level: 1, text: 'Root', from: markdown.indexOf('# Root') },
      { level: 2, text: 'List heading', from: markdown.indexOf('## List heading') },
      { level: 2, text: 'Quote heading', from: markdown.indexOf('## Quote heading') },
      { level: 3, text: 'Footnote heading', from: markdown.indexOf('### Footnote heading') },
      {
        level: 2,
        text: 'Mermaid section after list fence',
        from: markdown.indexOf('## Mermaid section after list fence'),
      },
      { level: 1, text: getOutlineFallbackText(), from: markdown.lastIndexOf('#') },
    ]);
  });
});
