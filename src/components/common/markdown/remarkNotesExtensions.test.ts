import { describe, expect, it } from 'vitest';
import {
  MAX_INLINE_HTML_CONTAINER_CHILDREN,
  remarkNotesInlineExtensions,
  type MdastNode,
} from './remarkNotesExtensions';
import { replaceUnderlineMarkdown } from './colorMarkdown';

function buildDeepTree(leafChildren: MdastNode[]): {
  leaf: MdastNode;
  tree: MdastNode;
} {
  const leaf: MdastNode = {
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

describe('remarkNotesInlineExtensions', () => {
  it('treats plain unclosed html block text as paragraph text', () => {
    const tree: MdastNode = {
      type: 'root',
      children: [
        { type: 'html', value: '<p>' },
        { type: 'html', value: '</p>' },
        { type: 'paragraph', children: [{ type: 'html', value: '<p>inline' }] },
        { type: 'html', value: '<div>literal' },
        { type: 'html', value: '<div>raw</div>' },
        { type: 'html', value: ['<div>', 'raw', '</div>'].join('\n') },
      ],
    };

    remarkNotesInlineExtensions()(tree);

    expect(tree.children?.[0]).toEqual({
      type: 'paragraph',
      children: [{ type: 'text', value: '<p>' }],
    });
    expect(tree.children?.[1]).toEqual({
      type: 'paragraph',
      children: [{ type: 'text', value: '</p>' }],
    });
    expect(tree.children?.[2]).toEqual({
      type: 'paragraph',
      children: [{ type: 'text', value: '<p>inline' }],
    });
    expect(tree.children?.[3]).toEqual({
      type: 'paragraph',
      children: [{ type: 'text', value: '<div>literal' }],
    });
    expect(tree.children?.[4]).toEqual({ type: 'html', value: '<div>raw</div>' });
    expect(tree.children?.[5]).toEqual({ type: 'html', value: ['<div>', 'raw', '</div>'].join('\n') });
  });

  it('treats empty paired html-like text as visible paragraph text', () => {
    const tree: MdastNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'html', value: '<a></a>' },
            { type: 'text', value: ' ' },
            { type: 'html', value: '<span>' },
            { type: 'html', value: '</span>' },
            { type: 'text', value: ' ' },
            { type: 'html', value: '<a href="#anchor"></a>' },
            { type: 'text', value: ' ' },
            { type: 'html', value: '<kbd>Ctrl</kbd>' },
          ],
        },
      ],
    };

    remarkNotesInlineExtensions()(tree);

    expect(tree.children?.[0].children).toEqual([
      { type: 'text', value: '<a></a>' },
      { type: 'text', value: ' ' },
      { type: 'text', value: '<span></span>' },
      { type: 'text', value: ' ' },
      { type: 'html', value: '<a href="#anchor"></a>' },
      { type: 'text', value: ' ' },
      { type: 'html', value: '<kbd>Ctrl</kbd>' },
    ]);
  });

  it('parses split inline color html with CSS declaration whitespace', () => {
    const tree: MdastNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'html', value: '<span style="font-weight: 600; color : #123456">' },
            { type: 'text', value: 'red' },
            { type: 'text', value: ' text' },
            { type: 'html', value: '</span>' },
            { type: 'text', value: ' ' },
            { type: 'html', value: '<mark style="border-radius: 2px; background-color : #ecf6ff">' },
            { type: 'text', value: 'marked' },
            { type: 'text', value: ' text' },
            { type: 'html', value: '</mark>' },
          ],
        },
      ],
    };

    remarkNotesInlineExtensions()(tree);

    const paragraph = tree.children?.[0];
    expect(paragraph?.children?.[0]).toMatchObject({
      type: 'textColor',
      color: '#123456',
      children: [
        { type: 'text', value: 'red' },
        { type: 'text', value: ' text' },
      ],
    });
    expect(paragraph?.children?.[2]).toMatchObject({
      type: 'bgColor',
      color: '#ecf6ff',
      children: [
        { type: 'text', value: 'marked' },
        { type: 'text', value: ' text' },
      ],
    });
  });

  it('parses inline color html around markdown links', () => {
    const tree: MdastNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'html', value: '<span style="color : #123456">' },
            {
              type: 'link',
              children: [{ type: 'text', value: 'Docs' }],
            },
            { type: 'html', value: '</span>' },
            { type: 'text', value: ' ' },
            { type: 'html', value: '<mark style="background-color : #ecf6ff">' },
            {
              type: 'link',
              children: [{ type: 'text', value: 'Safe' }],
            },
            { type: 'html', value: '</mark>' },
          ],
        },
      ],
    };

    remarkNotesInlineExtensions()(tree);

    const paragraph = tree.children?.[0];
    expect(paragraph?.children?.[0]).toMatchObject({
      type: 'textColor',
      color: '#123456',
      children: [
        {
          type: 'link',
          children: [{ type: 'text', value: 'Docs' }],
        },
      ],
    });
    expect(paragraph?.children?.[2]).toMatchObject({
      type: 'bgColor',
      color: '#ecf6ff',
      children: [
        {
          type: 'link',
          children: [{ type: 'text', value: 'Safe' }],
        },
      ],
    });
  });

  it('keeps nested raw html inside inline color containers as html', () => {
    const tree: MdastNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'html', value: '<span style="color : #123456">' },
            { type: 'text', value: '&lt;em&gt;nested&lt;/em&gt;' },
            { type: 'html', value: '</span>' },
          ],
        },
      ],
    };

    remarkNotesInlineExtensions()(tree);

    const paragraph = tree.children?.[0];
    expect(paragraph?.children).toEqual([
      { type: 'html', value: '<span style="color : #123456">' },
      { type: 'text', value: '&lt;em&gt;nested&lt;/em&gt;' },
      { type: 'html', value: '</span>' },
    ]);
  });

  it('keeps nested raw html inside simple inline html marks as html', () => {
    const children: MdastNode[] = [
      { type: 'html', value: '<mark><em>nested</em></mark>' },
      { type: 'text', value: ' ' },
      { type: 'html', value: '<sup>' },
      { type: 'text', value: '&lt;em&gt;encoded&lt;/em&gt;' },
      { type: 'html', value: '</sup>' },
    ];
    const tree: MdastNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [...children],
        },
      ],
    };

    remarkNotesInlineExtensions()(tree);

    expect(tree.children?.[0].children).toEqual(children);
  });

  it('keeps oversized simple inline html marks as html', () => {
    const children: MdastNode[] = [
      { type: 'html', value: `<mark>${'a'.repeat(9000)}</mark>` },
    ];
    const tree: MdastNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [...children],
        },
      ],
    };

    remarkNotesInlineExtensions()(tree);

    expect(tree.children?.[0].children).toEqual(children);
  });

  it('keeps source positions for later inline transforms after splitting text nodes', () => {
    const markdown = '==mark==\\^literal^ ++under++ ~sub~';
    const tree: MdastNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{
            type: 'text',
            value: '==mark==^literal^ ++under++ ~sub~',
            position: { start: { offset: 0 }, end: { offset: markdown.length } },
          }],
        },
      ],
    };

    remarkNotesInlineExtensions()(tree, { value: markdown });

    expect(tree.children?.[0].children).toMatchObject([
      {
        type: 'highlight',
        children: [{ type: 'text', value: 'mark' }],
      },
      { type: 'text', value: '^literal^ ' },
      {
        type: 'underline',
        children: [{ type: 'text', value: 'under' }],
      },
      { type: 'text', value: ' ' },
      {
        type: 'subscript',
        children: [{ type: 'text', value: 'sub' }],
      },
    ]);
  });

  it('passes source markdown to alignment blank-line preservation', () => {
    const markdown = ['Paragraph', '<!--align:center-->', '', '', '# Heading'].join('\n');
    const commentStart = markdown.indexOf('<!--align:center-->');
    const commentEnd = commentStart + '<!--align:center-->'.length;
    const headingStart = markdown.indexOf('# Heading');
    const tree: MdastNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Paragraph' }],
          position: { start: { offset: 0 }, end: { offset: 'Paragraph'.length } },
        },
        {
          type: 'html',
          value: '<!--align:center-->',
          position: { start: { offset: commentStart }, end: { offset: commentEnd } },
        },
        {
          type: 'heading',
          children: [{ type: 'text', value: 'Heading' }],
          position: { start: { offset: headingStart }, end: { offset: markdown.length } },
        },
      ],
    };

    remarkNotesInlineExtensions()(tree, { value: markdown });

    expect(tree.children?.[0].data).toMatchObject({
      vlainaAlignmentBlankLineCountBefore: 0,
      vlainaAlignmentBlankLineCountAfter: 2,
      vlainaAlignmentCommentPlacement: 'after',
    });
  });

  it('keeps source positions for inline transforms after abbreviation replacements', () => {
    const markdown = [
      '*[HTML]: HyperText Markup Language',
      '',
      'HTML ==mark==',
    ].join('\n');
    const usageOffset = markdown.indexOf('HTML ==mark==');
    const tree: MdastNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{
            type: 'text',
            value: '*[HTML]: HyperText Markup Language',
            position: { start: { offset: 0 }, end: { offset: 34 } },
          }],
        },
        {
          type: 'paragraph',
          children: [{
            type: 'text',
            value: 'HTML ==mark==',
            position: { start: { offset: usageOffset }, end: { offset: markdown.length } },
          }],
        },
      ],
    };

    remarkNotesInlineExtensions()(tree, { value: markdown });

    expect(tree.children?.[1].children).toMatchObject([
      {
        type: 'abbr',
        children: [{ type: 'text', value: 'HTML' }],
      },
      { type: 'text', value: ' ' },
      {
        type: 'highlight',
        children: [{ type: 'text', value: 'mark' }],
      },
    ]);
  });

  it('keeps source positions for inline transforms after definition-list prefixes', () => {
    const markdown = [
      'Term',
      '',
      ': ==mark==',
    ].join('\n');
    const tree: MdastNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{
            type: 'text',
            value: 'Term',
            position: { start: { offset: 0 }, end: { offset: 4 } },
          }],
        },
        {
          type: 'paragraph',
          children: [{
            type: 'text',
            value: ': ==mark==',
            position: { start: { offset: markdown.indexOf(':') }, end: { offset: markdown.length } },
          }],
        },
      ],
    };

    remarkNotesInlineExtensions()(tree, { value: markdown });

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
            children: [{
              type: 'highlight',
              children: [{ type: 'text', value: 'mark' }],
            }],
          }],
        },
      ],
    });
  });

  it('keeps source positions after stripping abbreviation definition lines', () => {
    const markdown = [
      '*[HTML]: HyperText Markup Language',
      'HTML ==mark==',
    ].join('\n');
    const tree: MdastNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{
            type: 'text',
            value: markdown,
            position: { start: { offset: 0 }, end: { offset: markdown.length } },
          }],
        },
      ],
    };

    remarkNotesInlineExtensions({ stripAbbrDefinitions: true })(tree, { value: markdown });

    expect(tree.children?.[0].children).toMatchObject([
      {
        type: 'abbr',
        children: [{ type: 'text', value: 'HTML' }],
      },
      { type: 'text', value: ' ' },
      {
        type: 'highlight',
        children: [{ type: 'text', value: 'mark' }],
      },
    ]);
  });

  it('keeps source positions for inline transforms after the underline plugin runs first', () => {
    const markdown = '++under++ ==mark==';
    const tree: MdastNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{
            type: 'text',
            value: markdown,
            position: { start: { offset: 0 }, end: { offset: markdown.length } },
          }],
        },
      ],
    };

    replaceUnderlineMarkdown(tree, markdown);
    remarkNotesInlineExtensions()(tree, { value: markdown });

    expect(tree.children?.[0].children).toMatchObject([
      {
        type: 'underline',
        children: [{ type: 'text', value: 'under' }],
      },
      { type: 'text', value: ' ' },
      {
        type: 'highlight',
        children: [{ type: 'text', value: 'mark' }],
      },
    ]);
  });

  it('keeps source positions for inline transforms after callout icon removal', () => {
    const markdown = '> 💡 ==mark==';
    const textOffset = markdown.indexOf('💡');
    const tree: MdastNode = {
      type: 'root',
      children: [
        {
          type: 'blockquote',
          children: [
            {
              type: 'paragraph',
              children: [{
                type: 'text',
                value: '💡 ==mark==',
                position: { start: { offset: textOffset }, end: { offset: markdown.length } },
              }],
            },
          ],
        },
      ],
    };

    remarkNotesInlineExtensions()(tree, { value: markdown });

    expect(tree.children?.[0]).toMatchObject({
      type: 'container',
      children: [
        {
          data: { hProperties: { className: ['callout-icon'] } },
          children: [{ type: 'text', value: '💡' }],
        },
        {
          data: { hProperties: { className: ['callout-content'] } },
          children: [{
            type: 'paragraph',
            children: [{
              type: 'highlight',
              children: [{ type: 'text', value: 'mark' }],
            }],
          }],
        },
      ],
    });
  });

  it('transforms bounded callout icon markers', () => {
    const tree: MdastNode = {
      type: 'root',
      children: [
        {
          type: 'blockquote',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', value: '[!callout-icon:img%3Aicons%2Fdemo.png] Body' }],
            },
          ],
        },
      ],
    };

    remarkNotesInlineExtensions()(tree);

    const callout = tree.children?.[0];
    expect(callout).toMatchObject({
      type: 'container',
      data: {
        hName: 'div',
        hProperties: {
          className: ['callout', 'callout-yellow'],
          dataType: 'callout',
        },
      },
    });
    expect(callout?.children?.[0]).toMatchObject({
      data: { hProperties: { className: ['callout-icon'] } },
      children: [{ type: 'text', value: 'img:icons/demo.png' }],
    });
    expect(callout?.children?.[1].children?.[0].children?.[0]).toMatchObject({
      type: 'text',
      value: 'Body',
    });
  });

  it('ignores oversized callout icon markers', () => {
    const oversizedMarker = `[!callout-icon:${'a'.repeat(4097)}] Body`;
    const tree: MdastNode = {
      type: 'root',
      children: [
        {
          type: 'blockquote',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', value: oversizedMarker }],
            },
          ],
        },
      ],
    };

    remarkNotesInlineExtensions()(tree);

    expect(tree.children?.[0]).toMatchObject({
      type: 'blockquote',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: oversizedMarker }],
        },
      ],
    });
  });

  it('keeps unclosed inline html containers from blocking valid sibling containers', () => {
    const unclosedSuperscriptTags = Array.from(
      { length: 500 },
      () => ({ type: 'html', value: '<sup>' } satisfies MdastNode),
    );
    const tree: MdastNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            ...unclosedSuperscriptTags,
            { type: 'text', value: 'plain' },
            { type: 'html', value: '<sub>' },
            { type: 'text', value: 'sub' },
            { type: 'html', value: '</sub>' },
          ],
        },
      ],
    };

    remarkNotesInlineExtensions()(tree);

    const paragraph = tree.children?.[0];
    expect(paragraph?.children?.slice(0, 500)).toEqual(unclosedSuperscriptTags);
    expect(paragraph?.children?.at(-1)).toMatchObject({
      type: 'subscript',
      children: [{ type: 'text', value: 'sub' }],
    });
  });

  it('keeps oversized inline html containers raw instead of scanning every sibling', () => {
    const longContent = Array.from(
      { length: MAX_INLINE_HTML_CONTAINER_CHILDREN + 1 },
      (_, index) => ({ type: 'text', value: `part-${index}` } satisfies MdastNode),
    );
    const tree: MdastNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'html', value: '<sup>' },
            ...longContent,
            { type: 'html', value: '</sup>' },
            { type: 'html', value: '<sub>' },
            { type: 'text', value: 'sub' },
            { type: 'html', value: '</sub>' },
          ],
        },
      ],
    };

    remarkNotesInlineExtensions()(tree);

    const paragraph = tree.children?.[0];
    expect(paragraph?.children?.[0]).toEqual({ type: 'html', value: '<sup>' });
    expect(paragraph?.children?.[MAX_INLINE_HTML_CONTAINER_CHILDREN + 2]).toEqual({
      type: 'html',
      value: '</sup>',
    });
    expect(paragraph?.children?.at(-1)).toMatchObject({
      type: 'subscript',
      children: [{ type: 'text', value: 'sub' }],
    });
  });

  it('skips inline transformations on over-deep trees', () => {
    const leafChildren: MdastNode[] = [{ type: 'text', value: 'plain ==marked== text' }];
    const { leaf, tree } = buildDeepTree(leafChildren);

    remarkNotesInlineExtensions()(tree);

    expect(leaf.children).toEqual(leafChildren);
  });
});
