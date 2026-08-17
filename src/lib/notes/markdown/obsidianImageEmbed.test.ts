import { describe, expect, it } from 'vitest';
import {
  findObsidianImageEmbedSourceTokens,
  parseObsidianImageEmbedTarget,
} from './obsidianImageEmbed';

describe('Obsidian image embeds', () => {
  it('parses aliases, width aliases, dimensions, and supported image types', () => {
    expect(parseObsidianImageEmbedTarget('attachments/photo.png|Cover')).toMatchObject({
      src: 'attachments/photo.png',
      alt: 'Cover',
      obsidianEmbed: { alias: 'Cover', size: null, width: null, height: null },
    });
    expect(parseObsidianImageEmbedTarget('photo.png|300')).toMatchObject({
      alt: '',
      obsidianEmbed: { size: '300', width: '300px', height: null },
    });
    expect(parseObsidianImageEmbedTarget('photo.png|300x200')).toMatchObject({
      alt: '',
      obsidianEmbed: { size: '300x200', width: '300px', height: 200 },
    });
    expect(parseObsidianImageEmbedTarget(String.raw`photo.png\|300`)).toMatchObject({
      src: 'photo.png',
      obsidianEmbed: { size: '300', width: '300px' },
    });
    expect(parseObsidianImageEmbedTarget('favicon.ico')?.src).toBe('favicon.ico');
  });

  it('rejects non-images and unsafe image sources', () => {
    expect(parseObsidianImageEmbedTarget('notes/demo.md')).toBeNull();
    expect(parseObsidianImageEmbedTarget('http://127.0.0.1/private.png')).toBeNull();
  });

  it('returns path and embed spans while skipping protected and escaped syntax', () => {
    const content = [
      String.raw`\![[escaped.png]]`,
      '`![[inline.png]]`',
      '![[ attachments/photo.png | Cover ]]',
    ].join('\n');
    const inlineStart = content.indexOf('`');
    const tokens = findObsidianImageEmbedSourceTokens(content, [{
      start: inlineStart,
      end: content.indexOf('`', inlineStart + 1) + 1,
    }]);

    expect(tokens).toHaveLength(1);
    expect(content.slice(tokens[0]!.sourceStart, tokens[0]!.sourceEnd)).toBe('attachments/photo.png');
    expect(content.slice(tokens[0]!.embedStart, tokens[0]!.embedEnd)).toBe(
      '![[ attachments/photo.png | Cover ]]',
    );
  });

  it('does not treat image-like text inside Markdown links as an embed', () => {
    const content = [
      '[linked ![[hidden.png]]](https://example.test)',
      '[reference ![[hidden-too.png]]][target]',
      '![[visible.png]]',
    ].join('\n');

    expect(findObsidianImageEmbedSourceTokens(content).map((token) => token.target.src)).toEqual([
      'visible.png',
    ]);
  });

  it('locates the path without consuming a table-escaped alias separator', () => {
    const content = String.raw`| ![[assets/photo.png\|300]] |`;
    const token = findObsidianImageEmbedSourceTokens(content)[0];

    expect(content.slice(token?.sourceStart, token?.sourceEnd)).toBe('assets/photo.png');
    expect(token?.target.obsidianEmbed.size).toBe('300');
  });
});
