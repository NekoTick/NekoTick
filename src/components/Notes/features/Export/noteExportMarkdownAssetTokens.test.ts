import { describe, expect, it } from 'vitest';
import {
  MAX_EXPORT_HTML_TAG_SCAN_RANGES,
  MAX_EXPORT_IGNORED_INLINE_RANGES,
  MAX_EXPORT_MARKDOWN_IMAGE_PART_SCAN_CHARS,
  MAX_EXPORT_MARKDOWN_HTML_BLOCK_RANGES,
  MAX_EXPORT_MARKDOWN_ASSET_TOKENS,
  findExportMarkdownAssetSourceTokens,
  findExportMarkdownAssetSourceTokensWithOptions,
} from './noteExportMarkdownAssetTokens';
import { MAX_EXPORT_HTML_TAG_END_SCAN_CHARS } from './noteExportMarkdownHtmlTokens';

describe('findExportMarkdownAssetSourceTokens', () => {
  it('extracts Obsidian image paths while preserving the full reference span', () => {
    const markdown = '![[1.png]]\n![[attachments/cover.png|Cover]]\n![[table.png\\|300]]';
    const tokens = findExportMarkdownAssetSourceTokens(markdown);

    expect(tokens.map((token) => ({
      src: token.src,
      referenceSource: token.referenceSource,
      referenceOffset: token.referenceOffset,
    }))).toEqual([
      { src: '1.png', referenceSource: '![[1.png]]', referenceOffset: 0 },
      {
        src: 'attachments/cover.png',
        referenceSource: '![[attachments/cover.png|Cover]]',
        referenceOffset: 11,
      },
      {
        src: 'table.png',
        referenceSource: '![[table.png\\|300]]',
        referenceOffset: 44,
      },
    ]);
  });

  it('ignores Obsidian image syntax in code and non-image embeds', () => {
    const markdown = [
      '`![[inline.png]]`',
      '```md',
      '![[fenced.png]]',
      '```',
      '![[notes/demo.md]]',
      '[linked ![[linked.png]]](https://example.test)',
      '![[visible.webp]]',
    ].join('\n');

    expect(findExportMarkdownAssetSourceTokens(markdown).map((token) => token.src)).toEqual([
      'visible.webp',
    ]);
  });

  it('keeps asset extraction correct after many ignored inline ranges', () => {
    const ignoredImages = Array.from(
      { length: 1500 },
      (_, index) => `\`![ignored ${index}](img:ignored-${index}.png) <img src="img:ignored-${index}.png">\``,
    );
    const markdown = [
      ...ignoredImages,
      '![real](img:real.png)',
      '<img src="img:real-html.png">',
    ].join('\n');

    expect(findExportMarkdownAssetSourceTokens(markdown).map((token) => token.lookupSrc)).toEqual([
      'img:real.png',
      'img:real-html.png',
    ]);
  });

  it('does not treat plain angle-bracket text as an HTML tag range', () => {
    const markdown = '< not html ![real](img:real.png) >';

    expect(findExportMarkdownAssetSourceTokens(markdown).map((token) => token.lookupSrc)).toEqual([
      'img:real.png',
    ]);
  });

  it('keeps raw HTML protection after invalid angle-bracket text', () => {
    const markdown = [
      '< not an html tag',
      '<pre>',
      '![hidden](img:hidden.png)',
      '</pre>',
      '![real](img:real.png)',
    ].join('\n');

    expect(findExportMarkdownAssetSourceTokens(markdown).map((token) => token.lookupSrc)).toEqual([
      'img:real.png',
    ]);
  });

  it('extracts destinations used by full, collapsed, and shortcut reference images', () => {
    const markdown = [
      '![full][cover]',
      '![collapsed][]',
      '![shortcut]',
      '[cover]: img:cover.png "Cover"',
      '[collapsed]: <assets/collapsed.webp>',
      '[shortcut]: img:shortcut.jpg',
    ].join('\n');

    expect(findExportMarkdownAssetSourceTokens(markdown).map((token) => token.lookupSrc)).toEqual([
      'img:cover.png',
      'assets/collapsed.webp',
      'img:shortcut.jpg',
    ]);
  });

  it('ignores reference image syntax and definitions inside protected content', () => {
    const markdown = [
      '`![inline][hidden]`',
      '[hidden]: img:hidden.png',
      '![real][visible]',
      '[visible]: img:visible.png',
    ].join('\n');

    expect(findExportMarkdownAssetSourceTokens(markdown).map((token) => token.lookupSrc)).toEqual([
      'img:visible.png',
    ]);
  });

  it('does not hide visible assets after angle-bracket text inside HTML attributes', () => {
    const markdown = [
      '<span data-example="<svg>"></span>',
      '![real](img:real.png)',
      '<img src="img:real-html.png">',
    ].join('\n');

    expect(findExportMarkdownAssetSourceTokens(markdown).map((token) => token.lookupSrc)).toEqual([
      'img:real.png',
      'img:real-html.png',
    ]);
  });

  it('ignores source srcset assets and markdown image syntax inside source GFM HTML blocks', () => {
    const markdown = [
      '<source srcset="img:hero.webp 1x">',
      '![hidden](img:hidden.png)',
      '',
      '![real](img:real.png)',
    ].join('\n');

    expect(findExportMarkdownAssetSourceTokens(markdown).map((token) => token.lookupSrc)).toEqual([
      'img:real.png',
    ]);
  });

  it('ignores markdown image syntax inside GFM type-7 HTML blocks', () => {
    const markdown = [
      '<custom-element>',
      '![hidden](img:hidden.png)',
      '</custom-element>',
      '',
      '![real](img:real.png)',
    ].join('\n');

    expect(findExportMarkdownAssetSourceTokens(markdown).map((token) => token.lookupSrc)).toEqual([
      'img:real.png',
    ]);
  });

  it('ignores markdown image syntax inside blockquote GFM type-7 HTML blocks', () => {
    const markdown = [
      '> <custom-element>',
      '> ![hidden](img:hidden.png)',
      '> </custom-element>',
      '>',
      '![real](img:real.png)',
    ].join('\n');

    expect(findExportMarkdownAssetSourceTokens(markdown).map((token) => token.lookupSrc)).toEqual([
      'img:real.png',
    ]);
  });

  it('ignores markdown image syntax inside non-tag GFM HTML blocks', () => {
    const markdown = [
      '<![CDATA[',
      '![hidden-cdata](img:hidden-cdata.png)',
      ']]>',
      '<?process ![hidden-processing](img:hidden-processing.png) ?>',
      '<!DOCTYPE ![hidden-declaration](img:hidden-declaration.png)>',
      '![real](img:real.png)',
    ].join('\n');

    expect(findExportMarkdownAssetSourceTokens(markdown).map((token) => token.lookupSrc)).toEqual([
      'img:real.png',
    ]);
  });

  it('does not spend the html tag scan budget on tags inside comments', () => {
    const ignoredCommentTags = Array.from(
      { length: MAX_EXPORT_HTML_TAG_SCAN_RANGES },
      (_, index) => `<img src="img:comment-${index}.png">`,
    ).join('');
    const markdown = [
      `<!-- ${ignoredCommentTags} -->`,
      '<img src="img:real-html.png">',
      '![real](img:real.png)',
    ].join('\n');

    expect(findExportMarkdownAssetSourceTokensWithOptions(markdown, {
      maxTokens: MAX_EXPORT_MARKDOWN_ASSET_TOKENS,
    }).map((token) => token.lookupSrc)).toEqual([
      'img:real-html.png',
      'img:real.png',
    ]);
  });

  it('does not spend the html tag scan budget on tags inside inline code', () => {
    const ignoredInlineTags = Array.from(
      { length: MAX_EXPORT_HTML_TAG_SCAN_RANGES },
      (_, index) => `\`<span data-example="${index}"></span>\``,
    );
    const markdown = [
      ...ignoredInlineTags,
      '<img src="img:real-html.png">',
      '![real](img:real.png)',
    ].join('\n');

    expect(findExportMarkdownAssetSourceTokensWithOptions(markdown, {
      maxTokens: MAX_EXPORT_MARKDOWN_ASSET_TOKENS,
    }).map((token) => token.lookupSrc)).toEqual([
      'img:real-html.png',
      'img:real.png',
    ]);
  });

  it('keeps nested raw text HTML contents ignored until the matching close tag', () => {
    const markdown = [
      '<svg>',
      '<svg><img src="img:hidden-inner.png"></svg>',
      '<img src="img:hidden-after-inner.png">',
      '</svg>',
      '<img src="img:real-html.png">',
    ].join('\n');

    expect(findExportMarkdownAssetSourceTokens(markdown).map((token) => token.lookupSrc)).toEqual([
      'img:real-html.png',
    ]);
  });

  it('bounds export asset extraction work when requested', () => {
    const markdown = Array.from(
      { length: MAX_EXPORT_MARKDOWN_ASSET_TOKENS + 1 },
      (_, index) => `![image ${index}](img:image-${index}.png)`,
    ).join('\n');

    const tokens = findExportMarkdownAssetSourceTokensWithOptions(markdown, {
      maxTokens: MAX_EXPORT_MARKDOWN_ASSET_TOKENS,
    });

    expect(tokens).toHaveLength(MAX_EXPORT_MARKDOWN_ASSET_TOKENS);
    expect(tokens.at(-1)?.lookupSrc).toBe(`img:image-${MAX_EXPORT_MARKDOWN_ASSET_TOKENS - 1}.png`);
  });

  it('bounds markdown image label scans while continuing after malformed images', () => {
    const markdown = [
      `![${'a'.repeat(MAX_EXPORT_MARKDOWN_IMAGE_PART_SCAN_CHARS + 1)}`,
      '![real](img:real.png)',
    ].join('\n');

    expect(findExportMarkdownAssetSourceTokens(markdown).map((token) => token.lookupSrc)).toEqual([
      'img:real.png',
    ]);
  });

  it('does not extract source srcset assets that export rendering drops', () => {
    const srcset = Array.from(
      { length: MAX_EXPORT_MARKDOWN_ASSET_TOKENS + 1 },
      (_, index) => `img:image-${index}.png 1x`,
    ).join(', ');
    const tokens = findExportMarkdownAssetSourceTokensWithOptions(`<source srcset="${srcset}">`, {
      maxTokens: MAX_EXPORT_MARKDOWN_ASSET_TOKENS,
    });

    expect(tokens).toEqual([]);
  });

  it('rejects oversized raw HTML image attributes before decoding src values', () => {
    const oversized = 'a'.repeat(16 * 1024 + 1);

    expect(findExportMarkdownAssetSourceTokens(`<img src="img:${oversized}.png">`)).toEqual([]);
    expect(findExportMarkdownAssetSourceTokens([
      `<img alt="${oversized}" src="img:hidden.png">`,
      '<img src="img:real.png">',
    ].join('\n')).map((token) => token.lookupSrc)).toEqual([
      'img:real.png',
    ]);
  });

  it('bounds raw HTML tag end scans while continuing markdown asset extraction', () => {
    const markdown = [
      `prefix <span data-value="![hidden](img:hidden.png) ${'a'.repeat(MAX_EXPORT_HTML_TAG_END_SCAN_CHARS + 1)}">`,
      '![real](img:real.png)',
    ].join('\n');

    expect(findExportMarkdownAssetSourceTokens(markdown).map((token) => token.lookupSrc)).toEqual([
      'img:real.png',
    ]);
  });

  it('stops markdown asset extraction after the html tag scan budget is exhausted', () => {
    const ignoredTags = Array.from(
      { length: MAX_EXPORT_HTML_TAG_SCAN_RANGES },
      (_, index) => `<span data-example="![hidden ${index}](img:hidden-${index}.png)">text</span>`,
    );
    const markdown = [
      ...ignoredTags,
      '<span data-example="![hidden after](img:hidden-after.png)">text</span>',
      '![after](img:after.png)',
    ].join('\n');

    expect(findExportMarkdownAssetSourceTokensWithOptions(markdown, {
      maxTokens: MAX_EXPORT_MARKDOWN_ASSET_TOKENS,
    })).toEqual([]);
  });

  it('protects remaining content after the ignored inline range budget is exhausted', () => {
    const ignoredInlineImages = Array.from(
      { length: MAX_EXPORT_IGNORED_INLINE_RANGES + 1 },
      (_, index) => `\`![ignored ${index}](img:ignored-${index}.png)\``,
    );
    const markdown = [
      ...ignoredInlineImages,
      '![after](img:after.png)',
      '<img src="img:after-html.png">',
    ].join('\n');

    expect(findExportMarkdownAssetSourceTokensWithOptions(markdown, {
      maxTokens: MAX_EXPORT_MARKDOWN_ASSET_TOKENS,
    })).toEqual([]);
  });

  it('protects remaining markdown after the html block range budget is exhausted', () => {
    const htmlBlocks = Array.from(
      { length: MAX_EXPORT_MARKDOWN_HTML_BLOCK_RANGES + 1 },
      (_, index) => [`<div data-index="${index}">`, `![hidden ${index}](img:hidden-${index}.png)`, '', ''].join('\n'),
    );
    const markdown = [
      ...htmlBlocks,
      '![after](img:after.png)',
      '<img src="img:after-html.png">',
    ].join('\n');

    expect(findExportMarkdownAssetSourceTokensWithOptions(markdown, {
      maxTokens: MAX_EXPORT_MARKDOWN_ASSET_TOKENS,
    })).toEqual([]);
  });
});
