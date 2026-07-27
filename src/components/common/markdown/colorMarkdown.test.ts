import { describe, expect, it } from 'vitest';
import {
  MAX_INLINE_COLOR_HTML_CHARS,
  replaceInlineColorHtmlMark,
  replaceUnderlineMarkdown,
  type ColorMarkdownMdastNode,
} from './colorMarkdown';
import {
  MAX_MARKDOWN_AST_NODES,
  countMarkdownAstNodes,
} from './markdownAstBudget';

function buildDeepTree(leafChildren: ColorMarkdownMdastNode[]): {
  leaf: ColorMarkdownMdastNode;
  tree: ColorMarkdownMdastNode;
} {
  const leaf: ColorMarkdownMdastNode = {
    type: 'paragraph',
    children: leafChildren,
  };
  let current = leaf;

  for (let index = 0; index < 205; index += 1) {
    current = {
      type: 'container',
      children: [current],
    };
  }

  return {
    leaf,
    tree: {
      type: 'root',
      children: [current],
    },
  };
}

describe('colorMarkdown', () => {
  it('parses inline color html marks', () => {
    const tree: ColorMarkdownMdastNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'html', value: '<span style="font-weight: 600; color: #123456">text</span>' }],
        },
      ],
    };

    replaceInlineColorHtmlMark(tree);

    expect(tree.children?.[0].children?.[0]).toMatchObject({
      type: 'textColor',
      color: '#123456',
      children: [{ type: 'text', value: 'text' }],
    });
  });

  it('parses underline markdown', () => {
    const tree: ColorMarkdownMdastNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'plain ++underlined++ text' }],
        },
      ],
    };

    replaceUnderlineMarkdown(tree);

    expect(tree.children?.[0].children).toEqual([
      { type: 'text', value: 'plain ' },
      {
        type: 'underline',
        children: [{ type: 'text', value: 'underlined' }],
        data: { hName: 'u', hProperties: { className: ['underline'] } },
      },
      { type: 'text', value: ' text' },
    ]);
  });

  it('does not parse plus operators as underline delimiters', () => {
    const text = { type: 'text', value: 'C++ demo and C+++ suffix; C++ and C++.' };
    const tree: ColorMarkdownMdastNode = {
      type: 'root',
      children: [{ type: 'paragraph', children: [text] }],
    };

    replaceUnderlineMarkdown(tree);

    expect(tree.children?.[0].children).toEqual([text]);
  });

  it('skips inline color html conversion on over-deep trees', () => {
    const leafChildren = [{ type: 'html', value: '<mark style="background-color: #abcdef">text</mark>' }];
    const { leaf, tree } = buildDeepTree(leafChildren);

    replaceInlineColorHtmlMark(tree);

    expect(leaf.children).toEqual(leafChildren);
  });

  it('skips overlong inline color html conversion', () => {
    const value = `<span style="color: #123456">${'a'.repeat(MAX_INLINE_COLOR_HTML_CHARS)}</span>`;
    const tree: ColorMarkdownMdastNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'html', value }],
        },
      ],
    };

    replaceInlineColorHtmlMark(tree);

    expect(tree.children?.[0].children).toEqual([{ type: 'html', value }]);
  });

  it('skips overlong inline color style declarations', () => {
    const value = `<span style="${'a'.repeat(1100)}; color: #123456">text</span>`;
    const tree: ColorMarkdownMdastNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'html', value }],
        },
      ],
    };

    replaceInlineColorHtmlMark(tree);

    expect(tree.children?.[0].children).toEqual([{ type: 'html', value }]);
  });

  it('skips underline conversion on over-deep trees', () => {
    const leafChildren = [{ type: 'text', value: '++underlined++' }];
    const { leaf, tree } = buildDeepTree(leafChildren);

    replaceUnderlineMarkdown(tree);

    expect(leaf.children).toEqual(leafChildren);
  });

  it('skips underline expansion when the AST growth budget is exhausted', () => {
    const target = { type: 'text', value: '++a++ ++a++ ++a++ ++a++ ++a++' };
    const tree: ColorMarkdownMdastNode = {
      type: 'root',
      children: [{
        type: 'paragraph',
        children: [
          ...Array.from({ length: MAX_MARKDOWN_AST_NODES - 8 }, (_, index) => ({
            type: 'text',
            value: String(index),
          })),
          target,
        ],
      }],
    };

    replaceUnderlineMarkdown(tree);

    expect(tree.children?.[0].children?.at(-1)).toBe(target);
    expect(countMarkdownAstNodes(tree)).toBeLessThanOrEqual(MAX_MARKDOWN_AST_NODES);
  });
});
