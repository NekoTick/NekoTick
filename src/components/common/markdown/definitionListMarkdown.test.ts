import { describe, expect, it } from 'vitest';
import { applyDefinitionListsToTree, type DefinitionListMdastNode } from './definitionListMarkdown';
import {
  MAX_MARKDOWN_AST_NODES,
  countMarkdownAstNodes,
} from './markdownAstBudget';

function paragraph(children: DefinitionListMdastNode[]): DefinitionListMdastNode {
  return {
    type: 'paragraph',
    children,
  };
}

function text(value: string): DefinitionListMdastNode {
  return {
    type: 'text',
    value,
  };
}

describe('definitionListMarkdown', () => {
  it('converts adjacent term and description paragraphs', () => {
    const tree: DefinitionListMdastNode = {
      type: 'root',
      children: [
        paragraph([text('Term')]),
        paragraph([text(': Definition')]),
      ],
    };

    applyDefinitionListsToTree(tree);

    expect(tree.children?.[0]).toMatchObject({
      type: 'definitionList',
      data: {
        hName: 'dl',
        hProperties: { className: ['definition-list'] },
      },
      children: [
        {
          type: 'definitionTerm',
          children: [{ type: 'text', value: 'Term' }],
        },
        {
          type: 'definitionDescription',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', value: 'Definition' }],
            },
          ],
        },
      ],
    });
    expect(
      tree.children?.[0].children?.[1].data?.vlainaDefinitionBlankLineCount
    ).toBe(1);
  });

  it('records a tight definition list with no source blank line', () => {
    const markdown = 'Term\n: Definition';
    const tree: DefinitionListMdastNode = {
      type: 'root',
      children: [paragraph([{
        ...text(markdown),
        position: {
          start: { offset: 0 },
          end: { offset: markdown.length },
        },
      }])],
    };

    applyDefinitionListsToTree(tree, markdown);

    expect(
      tree.children?.[0].children?.[1].data?.vlainaDefinitionBlankLineCount
    ).toBe(0);
  });

  it('converts a tight description that starts with multiline HTML', () => {
    const markdown = ['Term', ': <textarea>', '  raw', '  </textarea>'].join('\n');
    const prefix = 'Term\n: ';
    const tree: DefinitionListMdastNode = {
      type: 'root',
      children: [paragraph([
        {
          ...text(prefix),
          position: {
            start: { offset: 0 },
            end: { offset: prefix.length },
          },
        },
        { type: 'html', value: '<textarea>' },
        text('\nraw\n'),
        { type: 'html', value: '</textarea>' },
      ])],
    };

    applyDefinitionListsToTree(tree, markdown);

    expect(tree.children?.[0]).toMatchObject({
      type: 'definitionList',
      children: [
        {
          type: 'definitionTerm',
          children: [{ type: 'text', value: 'Term' }],
        },
        {
          type: 'definitionDescription',
          children: [{
            type: 'paragraph',
            children: [
              { type: 'html', value: '<textarea>' },
              { type: 'text', value: '\nraw\n' },
              { type: 'html', value: '</textarea>' },
            ],
          }],
        },
      ],
    });
  });

  it.each([1, 2])('records %s source blank line(s) inside a definition list', (blankLineCount) => {
    const separator = '\n'.repeat(blankLineCount + 1);
    const markdown = `Term${separator}: Definition`;
    const descriptionStart = 'Term'.length + separator.length;
    const tree: DefinitionListMdastNode = {
      type: 'root',
      children: [
        {
          ...paragraph([text('Term')]),
          position: {
            start: { offset: 0 },
            end: { offset: 'Term'.length },
          },
        },
        {
          ...paragraph([{
            ...text(': Definition'),
            position: {
              start: { offset: descriptionStart },
              end: { offset: markdown.length },
            },
          }]),
          position: {
            start: { offset: descriptionStart },
            end: { offset: markdown.length },
          },
        },
      ],
    };

    applyDefinitionListsToTree(tree, markdown);

    expect(
      tree.children?.[0].children?.[1].data?.vlainaDefinitionBlankLineCount
    ).toBe(blankLineCount);
  });

  it('recognizes description prefixes split across text nodes', () => {
    const tree: DefinitionListMdastNode = {
      type: 'root',
      children: [
        paragraph([text('Term')]),
        paragraph([text(':'), text(' Definition')]),
      ],
    };

    applyDefinitionListsToTree(tree);

    expect(tree.children?.[0].type).toBe('definitionList');
    expect(tree.children?.[0].children?.[1].children?.[0].children).toEqual([
      { type: 'text', value: '' },
      { type: 'text', value: 'Definition' },
    ]);
  });

  it('removes description marker whitespace split across text nodes', () => {
    const tree: DefinitionListMdastNode = {
      type: 'root',
      children: [
        paragraph([text('Term')]),
        paragraph([text('  :  '), text('Definition')]),
      ],
    };

    applyDefinitionListsToTree(tree);

    expect(tree.children?.[0]).toMatchObject({
      type: 'definitionList',
      children: [
        {
          type: 'definitionTerm',
          children: [{ type: 'text', value: 'Term' }],
        },
        {
          type: 'definitionDescription',
          children: [
            {
              type: 'paragraph',
              children: [
                { type: 'text', value: '' },
                { type: 'text', value: 'Definition' },
              ],
            },
          ],
        },
      ],
    });
  });

  it('does not convert oversized term paragraphs', () => {
    const longTerm = 'A'.repeat(80);
    const tree: DefinitionListMdastNode = {
      type: 'root',
      children: [
        paragraph([text(longTerm)]),
        paragraph([text(': Definition')]),
      ],
    };

    applyDefinitionListsToTree(tree);

    expect(tree.children).toEqual([
      paragraph([text(longTerm)]),
      paragraph([text(': Definition')]),
    ]);
  });

  it('does not create an inline-only term from multiline block HTML', () => {
    const term = paragraph([{ type: 'html', value: '<div>\nRaw\n</div>' }]);
    const description = paragraph([text(': Definition')]);
    const tree: DefinitionListMdastNode = {
      type: 'root',
      children: [term, description],
    };

    applyDefinitionListsToTree(tree);

    expect(tree.children).toEqual([term, description]);
  });

  it('does not split a combined definition whose term contains multiline block HTML', () => {
    const combined = paragraph([
      { type: 'html', value: '<div>\nRaw\n</div>' },
      text('\n: Definition'),
    ]);
    const tree: DefinitionListMdastNode = {
      type: 'root',
      children: [combined],
    };

    applyDefinitionListsToTree(tree);

    expect(tree.children).toEqual([combined]);
  });

  it('does not consume a preceding physical line as part of a combined term', () => {
    const combined = paragraph([
      text('Previous paragraph\n'),
      { type: 'strong', children: [text('Term')] },
      text('\n: Definition'),
    ]);
    const tree: DefinitionListMdastNode = {
      type: 'root',
      children: [combined],
    };

    applyDefinitionListsToTree(tree);

    expect(tree.children).toEqual([combined]);
  });

  it('preserves term and description paragraphs at the start of a list item', () => {
    const term = paragraph([text('Term')]);
    const description = paragraph([text(': Definition')]);
    const tree: DefinitionListMdastNode = {
      type: 'root',
      children: [{
        type: 'list',
        children: [{ type: 'listItem', children: [term, description] }],
      }],
    };

    applyDefinitionListsToTree(tree);

    expect(tree.children?.[0].children?.[0].children).toEqual([term, description]);
  });

  it('converts term and description paragraphs after the start of a list item', () => {
    const tree: DefinitionListMdastNode = {
      type: 'root',
      children: [{
        type: 'list',
        children: [{
          type: 'listItem',
          children: [
            paragraph([text('Item')]),
            paragraph([text('Term')]),
            paragraph([text(': Definition')]),
          ],
        }],
      }],
    };

    applyDefinitionListsToTree(tree);

    expect(tree.children?.[0].children?.[0].children?.[1].type).toBe('definitionList');
  });

  it('skips definition-list conversion when the AST growth budget is exhausted', () => {
    const term = paragraph([text('Term')]);
    const description = paragraph([text(': Definition')]);
    const tree: DefinitionListMdastNode = {
      type: 'root',
      children: [
        ...Array.from({ length: MAX_MARKDOWN_AST_NODES - 6 }, (_, index) => text(String(index))),
        term,
        description,
      ],
    };

    applyDefinitionListsToTree(tree);

    expect(tree.children?.at(-2)).toBe(term);
    expect(tree.children?.at(-1)).toBe(description);
    expect(countMarkdownAstNodes(tree)).toBeLessThanOrEqual(MAX_MARKDOWN_AST_NODES);
  });
});
