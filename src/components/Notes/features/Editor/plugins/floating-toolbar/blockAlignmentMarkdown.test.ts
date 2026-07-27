import { describe, expect, it } from 'vitest';
import {
  applyAlignmentCommentsToTree,
  extractTextAlignmentComment,
  getTextAlignmentComment,
  readMarkdownNodeAlignment,
} from './blockAlignmentMarkdown';

describe('blockAlignmentMarkdown', () => {
  it('extracts supported alignment comments', () => {
    expect(extractTextAlignmentComment('<!--align:left-->')).toBe('left');
    expect(extractTextAlignmentComment('<!-- align:center -->')).toBe('center');
    expect(extractTextAlignmentComment('<!--align:right-->')).toBe('right');
  });

  it('ignores unrelated html comments', () => {
    expect(extractTextAlignmentComment('<!--note:test-->')).toBeNull();
    expect(extractTextAlignmentComment('<div>test</div>')).toBeNull();
    expect(extractTextAlignmentComment(`${' '.repeat(129)}<!--align:center-->`)).toBeNull();
  });

  it('formats alignment comments consistently', () => {
    expect(getTextAlignmentComment('center')).toBe('<!--align:center-->');
  });

  it('defaults unknown node alignment to left', () => {
    expect(readMarkdownNodeAlignment(undefined)).toBe('left');
    expect(readMarkdownNodeAlignment({ align: 'nope' })).toBe('left');
    expect(readMarkdownNodeAlignment({ align: 'right' })).toBe('right');
  });

  it('applies alignment comments recursively inside nested blocks', () => {
    const tree: any = {
      type: 'root',
      children: [
        {
          type: 'blockquote',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', value: 'Nested' }],
            },
            {
              type: 'html',
              value: '<!--align:center-->',
            },
          ],
        },
      ],
    };

    applyAlignmentCommentsToTree(tree);

    expect(tree.children[0].children).toHaveLength(1);
    expect(tree.children[0].children[0].align).toBe('center');
  });

  it('records authored blank lines around an alignment comment', () => {
    const markdown = ['Paragraph', '', '<!--align:center-->', '', '', '# Heading'].join('\n');
    const commentStart = markdown.indexOf('<!--align:center-->');
    const commentEnd = commentStart + '<!--align:center-->'.length;
    const headingStart = markdown.indexOf('# Heading');
    const tree: any = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Paragraph' }],
          position: {
            start: { offset: 0 },
            end: { offset: 'Paragraph'.length },
          },
        },
        {
          type: 'html',
          value: '<!--align:center-->',
          position: {
            start: { offset: commentStart },
            end: { offset: commentEnd },
          },
        },
        {
          type: 'heading',
          children: [{ type: 'text', value: 'Heading' }],
          position: {
            start: { offset: headingStart },
            end: { offset: markdown.length },
          },
        },
      ],
    };

    applyAlignmentCommentsToTree(tree, markdown);

    expect(tree.children[0].data).toMatchObject({
      vlainaAlignmentBlankLineCountBefore: 1,
      vlainaAlignmentBlankLineCountAfter: 2,
      vlainaAlignmentCommentPlacement: 'after',
    });
  });

  it('applies a leading alignment comment to the next alignable block and removes it', () => {
    const tree: any = {
      type: 'root',
      children: [
        {
          type: 'html',
          value: '<!--align:right-->',
        },
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Hello' }],
        },
      ],
    };

    applyAlignmentCommentsToTree(tree);

    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].type).toBe('paragraph');
    expect(tree.children[0].align).toBe('right');
    expect(tree.children[0].data.vlainaAlignmentCommentPlacement).toBe('before');
  });

  it('keeps an alignment comment when no text block can consume it', () => {
    const tree: any = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Hello' }],
        },
        {
          type: 'html',
          value: '<!--align:center-->',
        },
        {
          type: 'html',
          value: '<!--align:right-->',
        },
      ],
    };

    applyAlignmentCommentsToTree(tree);

    expect(tree.children).toHaveLength(2);
    expect(tree.children[0].align).toBe('center');
    expect(tree.children[1]).toMatchObject({
      type: 'html',
      value: '<!--align:right-->',
    });
  });

  it('applies alignment comments inside list items without affecting sibling items', () => {
    const tree: any = {
      type: 'root',
      children: [
        {
          type: 'list',
          ordered: false,
          children: [
            {
              type: 'listItem',
              children: [
                {
                  type: 'paragraph',
                  children: [{ type: 'text', value: 'First item' }],
                },
                {
                  type: 'html',
                  value: '<!--align:right-->',
                },
              ],
            },
            {
              type: 'listItem',
              children: [
                {
                  type: 'paragraph',
                  children: [{ type: 'text', value: 'Second item' }],
                },
              ],
            },
          ],
        },
      ],
    };

    applyAlignmentCommentsToTree(tree);

    expect(tree.children[0].children[0].children).toHaveLength(1);
    expect(tree.children[0].children[0].children[0].align).toBe('right');
    expect(tree.children[0].children[1].children[0].align).toBeUndefined();
  });

  it('applies alignment comments inside task list paragraphs', () => {
    const tree: any = {
      type: 'root',
      children: [
        {
          type: 'list',
          ordered: false,
          children: [
            {
              type: 'listItem',
              checked: false,
              children: [
                {
                  type: 'paragraph',
                  children: [{ type: 'text', value: 'Todo item' }],
                },
                {
                  type: 'html',
                  value: '<!--align:center-->',
                },
              ],
            },
          ],
        },
      ],
    };

    applyAlignmentCommentsToTree(tree);

    expect(tree.children[0].children[0].children).toHaveLength(1);
    expect(tree.children[0].children[0].children[0].align).toBe('center');
  });

  it('applies alignment comments inside footnote definitions', () => {
    const tree: any = {
      type: 'root',
      children: [
        {
          type: 'footnoteDefinition',
          identifier: 'note-1',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', value: 'Footnote text' }],
            },
            {
              type: 'html',
              value: '<!--align:right-->',
            },
          ],
        },
      ],
    };

    applyAlignmentCommentsToTree(tree);

    expect(tree.children[0].children).toHaveLength(1);
    expect(tree.children[0].children[0].align).toBe('right');
  });

  it('does not let orphan comments align non-paragraph blocks', () => {
    const tree: any = {
      type: 'root',
      children: [
        {
          type: 'code',
          lang: 'ts',
          value: 'const x = 1;',
        },
        {
          type: 'html',
          value: '<!--align:center-->',
        },
      ],
    };

    applyAlignmentCommentsToTree(tree);

    expect(tree.children).toHaveLength(2);
    expect(tree.children[0].type).toBe('code');
    expect(tree.children[0].align).toBeUndefined();
    expect(tree.children[1]).toMatchObject({
      type: 'html',
      value: '<!--align:center-->',
    });
  });

  it('keeps alignment-looking text inside code nodes', () => {
    const tree: any = {
      type: 'root',
      children: [
        {
          type: 'code',
          lang: 'html',
          value: '<!--align:center-->',
        },
      ],
    };

    applyAlignmentCommentsToTree(tree);

    expect(tree.children).toEqual([
      {
        type: 'code',
        lang: 'html',
        value: '<!--align:center-->',
      },
    ]);
  });

  it('does not override an existing alignment and keeps the unconsumed comment', () => {
    const tree: any = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          align: 'center',
          children: [{ type: 'text', value: 'Keep me centered' }],
        },
        {
          type: 'html',
          value: '<!--align:right-->',
        },
      ],
    };

    applyAlignmentCommentsToTree(tree);

    expect(tree.children).toHaveLength(2);
    expect(tree.children[0].align).toBe('center');
    expect(tree.children[1]).toMatchObject({
      type: 'html',
      value: '<!--align:right-->',
    });
  });
});
