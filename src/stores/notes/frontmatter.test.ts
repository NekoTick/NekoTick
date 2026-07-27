import { describe, expect, it } from 'vitest';
import {
  normalizeNoteMetadataEntry,
  readNoteMetadataFromMarkdown,
  stripUpdatedFrontmatter,
  stripManagedFrontmatter,
  updateNoteMetadataInMarkdown,
  writeNoteMetadataToMarkdown,
} from './frontmatter';

describe('note frontmatter metadata', () => {
  it('reads managed note metadata from leading yaml frontmatter', () => {
    const markdown = [
      '---',
      'vlaina_cover: "assets/monet.jpg" x=40 y=60 height=220 scale=1.3',
      'vlaina_icon: "🐱" size=84',
      'vlaina_created: "2026-04-15T01:02:03.000Z"',
      'vlaina_updated: "2026-04-16T01:02:03.000Z"',
      '---',
      '',
      '# Title',
    ].join('\n');

    expect(readNoteMetadataFromMarkdown(markdown)).toEqual({
      cover: {
        assetPath: 'assets/monet.jpg',
        positionX: 40,
        positionY: 60,
        height: 220,
        scale: 1.3,
      },
      icon: '🐱',
      iconSize: 84,
    });
  });

  it('reads managed cover layout from the inline cover frontmatter', () => {
    const markdown = [
      '---',
      'vlaina_cover: "assets/monet.jpg" x=40 y=60 height=220 scale=1.3',
      '---',
      '',
      '# Title',
    ].join('\n');

    expect(readNoteMetadataFromMarkdown(markdown)).toEqual({
      cover: {
        assetPath: 'assets/monet.jpg',
        positionX: 40,
        positionY: 60,
        height: 220,
        scale: 1.3,
      },
    });
  });

  it('reads managed cover and icon metadata from inline frontmatter values', () => {
    const markdown = [
      '---',
      'vlaina_cover: "assets/monet.jpg" x=40 y=60 height=220 scale=1.3',
      'vlaina_icon: "🐱" size=84',
      '---',
      '',
      '# Title',
    ].join('\n');

    expect(readNoteMetadataFromMarkdown(markdown)).toEqual({
      cover: {
        assetPath: 'assets/monet.jpg',
        positionX: 40,
        positionY: 60,
        height: 220,
        scale: 1.3,
      },
      icon: '🐱',
      iconSize: 84,
    });
  });

  it('normalizes hostile runtime icon sizes without coercion', () => {
    const hostileSize = {
      toString() {
        throw new Error('icon size coercion');
      },
    };

    expect(normalizeNoteMetadataEntry({
      icon: '🐱',
      iconSize: hostileSize as never,
    })).toEqual({
      icon: '🐱',
    });
  });

  it('keeps legacy cover paths with equals signs while dropping non-standard icon text', () => {
    const markdown = [
      '---',
      'vlaina_cover: "covers/cover=hero.webp"',
      'vlaina_icon: "size=84"',
      '---',
      '',
      '# Title',
    ].join('\n');

    expect(readNoteMetadataFromMarkdown(markdown)).toEqual({
      cover: {
        assetPath: 'covers/cover=hero.webp',
      },
    });
  });

  it('keeps quoted cover paths named like removed inline fields', () => {
    const markdown = [
      '---',
      'vlaina_cover: "asset=hero.webp"',
      'vlaina_icon: "value=sparkles"',
      '---',
      '',
      '# Title',
    ].join('\n');

    expect(readNoteMetadataFromMarkdown(markdown)).toEqual({
      cover: {
        assetPath: 'asset=hero.webp',
      },
    });
  });

  it('does not read removed asset/value inline prefixes as metadata', () => {
    const markdown = [
      '---',
      'vlaina_cover: asset="assets/monet.jpg" x=40 y=60 height=220 scale=1.3',
      'vlaina_icon: value="🐱" size=84',
      '---',
      '',
      '# Title',
    ].join('\n');

    expect(readNoteMetadataFromMarkdown(markdown)).toEqual({});
  });


  it('reads managed note metadata from frontmatter after a UTF-8 BOM', () => {
    const markdown = [
      '\uFEFF---',
      'vlaina_icon: "🐱"',
      'vlaina_updated: "2026-04-16T01:02:03.000Z"',
      '---',
      '',
      '# Title',
    ].join('\n');

    expect(readNoteMetadataFromMarkdown(markdown)).toEqual({
      icon: '🐱',
    });
  });

  it('ignores indented thematic breaks instead of treating them as frontmatter', () => {
    const markdown = [
      '    ---',
      '    vlaina_icon: "hidden"',
      '    ---',
      '',
      '# Body',
    ].join('\n');

    expect(readNoteMetadataFromMarkdown(markdown)).toEqual({});
    expect(stripManagedFrontmatter(markdown)).toBe(markdown);
    expect(
      writeNoteMetadataToMarkdown(markdown, {
        updatedAt: Date.parse('2026-04-16T00:00:00.000Z'),
      })
    ).toBe(markdown);
  });

  it('preserves user frontmatter and appends managed fields at the bottom', () => {
    const markdown = [
      '---',
      'title: Example',
      'aliases: ["demo"]',
      'icon: "old"',
      '---',
      '',
      '# Title',
    ].join('\n');

    expect(
      writeNoteMetadataToMarkdown(markdown, {
        icon: '🐱',
        iconSize: 84,
        updatedAt: Date.parse('2026-04-16T00:00:00.000Z'),
      })
    ).toBe(
      [
        '---',
        'title: Example',
        'aliases: ["demo"]',
        'icon: "old"',
        '',
        'vlaina_icon: "🐱" size=84',
        '---',
        '',
        '# Title',
      ].join('\n')
    );
  });

  it('writes managed cover metadata as one fused frontmatter field', () => {
    expect(
      writeNoteMetadataToMarkdown('# Title', {
        cover: {
          assetPath: 'assets/monet.jpg',
          positionX: 50,
          positionY: 50,
          height: 255,
          scale: 1,
        },
      })
    ).toBe(
      [
        '---',
        'vlaina_cover: "assets/monet.jpg" x=50 y=50 height=255 scale=1',
        '---',
        '',
        '# Title',
      ].join('\n')
    );
  });

  it('does not accumulate blank lines between user and managed frontmatter on repeated writes', () => {
    const markdown = [
      '---',
      'title: Example',
      '',
      '',
      'vlaina_cover: "assets/old.webp" height=220',
      'vlaina_icon: "🐱" size=84',
      '---',
      '',
      '# Title',
    ].join('\n');

    const first = updateNoteMetadataInMarkdown(markdown, {
      cover: {
        assetPath: 'assets/old.webp',
        height: 240,
      },
      icon: '🐱',
      iconSize: 90,
    }).content;
    const second = updateNoteMetadataInMarkdown(first, {
      cover: {
        assetPath: 'assets/old.webp',
        height: 260,
      },
      icon: '🐱',
      iconSize: 96,
    }).content;

    expect(first).toBe([
      '---',
      'title: Example',
      '',
      '',
      'vlaina_cover: "assets/old.webp" height=240',
      'vlaina_icon: "🐱" size=90',
      '---',
      '',
      '# Title',
    ].join('\n'));
    expect(second).toBe([
      '---',
      'title: Example',
      '',
      '',
      'vlaina_cover: "assets/old.webp" height=260',
      'vlaina_icon: "🐱" size=96',
      '---',
      '',
      '# Title',
    ].join('\n'));
  });

  it.each([1, 2, 3])(
    'preserves %s user-authored blank line(s) before the frontmatter closing delimiter',
    (blankLineCount) => {
      const markdown = [
        '---',
        'title: Example',
        ...Array.from({ length: blankLineCount }, () => ''),
        '---',
        '',
        '# Title',
      ].join('\n');

      expect(updateNoteMetadataInMarkdown(markdown, {}).content).toBe(markdown);
    },
  );

  it('keeps authored spacing stable while updating managed frontmatter', () => {
    const markdown = [
      '---',
      'title: Example',
      '',
      '',
      'vlaina_icon: "🐱" size=84',
      '---',
      '',
      '# Title',
    ].join('\n');

    const first = updateNoteMetadataInMarkdown(markdown, {
      icon: '🐱',
      iconSize: 90,
    }).content;
    const second = updateNoteMetadataInMarkdown(first, {
      icon: '🐱',
      iconSize: 96,
    }).content;

    expect(first).toBe(markdown.replace('size=84', 'size=90'));
    expect(second).toBe(markdown.replace('size=84', 'size=96'));
  });

  it('updates frontmatter after a UTF-8 BOM without duplicating it', () => {
    const markdown = [
      '\uFEFF---',
      'title: Example',
      '---',
      '',
      '# Title',
    ].join('\n');

    expect(
      writeNoteMetadataToMarkdown(markdown, {
        updatedAt: Date.parse('2026-04-16T00:00:00.000Z'),
      })
    ).toBe(
      ['---', 'title: Example', '---', '', '# Title'].join('\n')
    );
  });

  it('clamps managed cover numbers from untrusted frontmatter', () => {
    const markdown = [
      '---',
      'vlaina_cover: "assets/monet.jpg" x=-200 y=900 height=1000000 scale=999',
      '---',
      '',
      '# Title',
    ].join('\n');

    expect(readNoteMetadataFromMarkdown(markdown).cover).toEqual({
      assetPath: 'assets/monet.jpg',
      positionX: 0,
      positionY: 100,
      height: 500,
      scale: 10,
    });
  });

  it('ignores removed cover layout metadata from untrusted frontmatter', () => {
    const markdown = [
      '---',
      'vlaina_cover: "assets/monet.jpg"',
      'vlaina_cover_layout: x=-200 y=900 height=1000000 scale=999',
      '---',
      '',
      '# Title',
    ].join('\n');

    expect(readNoteMetadataFromMarkdown(markdown).cover).toEqual({
      assetPath: 'assets/monet.jpg',
    });
  });

  it('clamps managed fused cover layout numbers from untrusted frontmatter', () => {
    const markdown = [
      '---',
      'vlaina_cover: "assets/monet.jpg" x=-200 y=900 height=1000000 scale=999',
      '---',
      '',
      '# Title',
    ].join('\n');

    expect(readNoteMetadataFromMarkdown(markdown).cover).toEqual({
      assetPath: 'assets/monet.jpg',
      positionX: 0,
      positionY: 100,
      height: 500,
      scale: 10,
    });
  });

  it('ignores non-decimal managed inline numbers from untrusted frontmatter', () => {
    const fusedMarkdown = [
      '---',
      'vlaina_cover: "assets/monet.jpg" x=1e2 y=0x2 height=220 scale=1.3',
      'vlaina_icon: "🐱" size=8e1',
      '---',
      '',
      '# Title',
    ].join('\n');

    expect(readNoteMetadataFromMarkdown(fusedMarkdown)).toEqual({
      cover: {
        assetPath: 'assets/monet.jpg',
        height: 220,
        scale: 1.3,
      },
      icon: '🐱',
    });

    const removedLayoutMarkdown = [
      '---',
      'vlaina_cover: "assets/monet.jpg"',
      'vlaina_cover_layout: x=1e2 y=0x2 height=220 scale=1.3',
      '---',
      '',
      '# Title',
    ].join('\n');

    expect(readNoteMetadataFromMarkdown(removedLayoutMarkdown).cover).toEqual({
      assetPath: 'assets/monet.jpg',
    });
  });


  it('drops unsafe managed icon and cover strings from untrusted frontmatter', () => {
    const oversizedIcon = 'x'.repeat(4097);
    const oversizedCover = `${'a'.repeat(16 * 1024)}.png`;

    expect(readNoteMetadataFromMarkdown([
      '---',
      `vlaina_icon: "${oversizedIcon}"`,
      'vlaina_cover: "assets/\u202Ecod.exe.png"',
      '---',
      '# Title',
    ].join('\n'))).toEqual({});

    expect(readNoteMetadataFromMarkdown([
      '---',
      'vlaina_icon: "sparkles\u202E"',
      'vlaina_cover: "/etc/passwd"',
      '---',
      '# Title',
    ].join('\n'))).toEqual({});

    expect(readNoteMetadataFromMarkdown([
      '---',
      'vlaina_icon: "sparkles"',
      `vlaina_cover: "${oversizedCover}"`,
      '---',
      '# Title',
    ].join('\n'))).toEqual({});

    expect(readNoteMetadataFromMarkdown([
      '---',
      String.raw`vlaina_cover: "img\:assets/cover.webp"`,
      '---',
      '# Title',
    ].join('\n'))).toEqual({});

    expect(readNoteMetadataFromMarkdown([
      '---',
      String.raw`vlaina_cover: "data\:image/png;base64,aGk="`,
      '---',
      '# Title',
    ].join('\n'))).toEqual({});
  });

  it('drops managed cover paths inside internal folders while keeping user dot folders', () => {
    expect(readNoteMetadataFromMarkdown([
      '---',
      'vlaina_cover: ".vlaina/assets/cover.webp"',
      '---',
      '# Title',
    ].join('\n'))).toEqual({});

    expect(readNoteMetadataFromMarkdown([
      '---',
      'vlaina_cover: "docs/.git/cover.webp"',
      '---',
      '# Title',
    ].join('\n'))).toEqual({});

    expect(readNoteMetadataFromMarkdown([
      '---',
      'vlaina_cover: "%2evlaina/assets/cover.webp"',
      '---',
      '# Title',
    ].join('\n'))).toEqual({});

    expect(readNoteMetadataFromMarkdown([
      '---',
      'vlaina_cover: "docs%2f.git%2fcover.webp"',
      '---',
      '# Title',
    ].join('\n'))).toEqual({});

    expect(readNoteMetadataFromMarkdown([
      '---',
      'vlaina_cover: ".notes/assets/cover.webp"',
      '---',
      '# Title',
    ].join('\n'))).toEqual({
      cover: {
        assetPath: '.notes/assets/cover.webp',
      },
    });
  });

  it('keeps supported managed icon and cover string forms', () => {
    expect(readNoteMetadataFromMarkdown([
      '---',
      'vlaina_icon: " icon:common.sparkle:#ffcc00 "',
      'vlaina_cover: " @biva/1 "',
      '---',
      '# Title',
    ].join('\n'))).toEqual({
      icon: 'icon:common.sparkle:#ffcc00',
      cover: {
        assetPath: '@biva/1',
      },
    });

    expect(readNoteMetadataFromMarkdown([
      '---',
      'vlaina_icon: "assets/icons/demo.png"',
      'vlaina_cover: "assets/cover.webp"',
      '---',
      '# Title',
    ].join('\n'))).toEqual({
      icon: 'assets/icons/demo.png',
      cover: {
        assetPath: 'assets/cover.webp',
      },
    });
  });

  it('drops legacy img-scheme managed icon image paths', () => {
    expect(readNoteMetadataFromMarkdown([
      '---',
      'vlaina_icon: "img:assets/icons/demo.png"',
      '---',
      '# Title',
    ].join('\n'))).toEqual({});
  });

  it('drops non-standard managed icon text from frontmatter', () => {
    for (const icon of ['hello', 'emoji.file', 'size=84', 'icon:bad:name:extra']) {
      expect(readNoteMetadataFromMarkdown([
        '---',
        `vlaina_icon: "${icon}"`,
        '---',
        '# Title',
      ].join('\n'))).toEqual({});
    }
  });

  it('drops non-standard managed icon text from runtime metadata writes', () => {
    expect(normalizeNoteMetadataEntry({
      icon: 'sparkles',
      iconSize: 84,
    })).toEqual({});

    expect(writeNoteMetadataToMarkdown('# Title', {
      icon: 'sparkles',
      iconSize: 84,
    })).toBe('# Title');
  });

  it('round-trips escaped managed YAML string scalars', () => {
    const metadata = {
      icon: 'assets/quote " slash \\ icon.png',
      cover: {
        assetPath: 'assets/quote " slash \\ cover.webp',
      },
    };
    const written = writeNoteMetadataToMarkdown('# Title', metadata);

    expect(written).toContain('vlaina_icon: "assets/quote \\" slash \\\\ icon.png"');
    expect(written).toContain('vlaina_cover: "assets/quote \\" slash \\\\ cover.webp"');
    expect(readNoteMetadataFromMarkdown(written)).toEqual(metadata);
    expect(writeNoteMetadataToMarkdown(written, readNoteMetadataFromMarkdown(written))).toBe(written);
  });

  it('removes managed icon size when the note icon is removed', () => {
    const markdown = [
      '---',
      'vlaina_icon: "😃"',
      'vlaina_icon_size: 84',
      '---',
      '',
      '# Title',
    ].join('\n');

    const result = updateNoteMetadataInMarkdown(markdown, {
      icon: undefined,
    });

    expect(result.content).toBe('# Title');
    expect(result.metadata).toEqual({});
  });

  it('updates managed fields without dropping markdown body content', () => {
    const markdown = '# Title\n\nBody';

    const result = updateNoteMetadataInMarkdown(markdown, {
      createdAt: Date.parse('2026-04-15T00:00:00.000Z'),
      updatedAt: Date.parse('2026-04-16T00:00:00.000Z'),
    });

    expect(result.metadata).toEqual({});
    expect(result.content).toBe(markdown);
  });

  it('preserves an empty body separator after existing frontmatter', () => {
    const markdown = [
      '---',
      'vlaina_icon: "😃"',
      'vlaina_updated: "2026-04-15T00:00:00.000Z"',
      '---',
      '',
    ].join('\n');

    const result = updateNoteMetadataInMarkdown(markdown, {
      updatedAt: Date.parse('2026-04-16T00:00:00.000Z'),
    });

    expect(result.content).toBe(
      [
        '---',
        'vlaina_icon: "😃"',
        '---',
        '',
      ].join('\n')
    );
    expect(result.metadata).toEqual({ icon: '😃' });
  });

  it('strips hidden-only vlaina frontmatter from public markdown', () => {
    const markdown = [
      '---',
      'vlaina_cover: "@biva/1"',
      'vlaina_cover_x: 50',
      'vlaina_cover_y: 44.95904771244643',
      'vlaina_cover_height: 204',
      'vlaina_cover_scale: 1',
      'vlaina_created: "2026-04-19T16:30:35.881Z"',
      'vlaina_updated: "2026-04-22T13:18:03.350Z"',
      '---',
      '',
      '# Exported',
      'Visible body',
    ].join('\n');

    expect(stripManagedFrontmatter(markdown)).toBe('# Exported\nVisible body');
  });

  it('strips managed timestamp frontmatter for save conflict comparisons', () => {
    const markdown = [
      '---',
      'title: User title',
      'vlaina_created: 2026-04-15 08:00:00 +08:00',
      'vlaina_updated: 2026-04-16 08:00:00 +08:00',
      '---',
      '',
      '# Title',
    ].join('\n');

    expect(stripUpdatedFrontmatter(markdown)).toBe([
      '---',
      'title: User title',
      '---',
      '',
      '# Title',
    ].join('\n'));
  });

  it('preserves user frontmatter while stripping only top-level vlaina fields', () => {
    const markdown = [
      '---',
      'title: User title',
      'tags:',
      '  - project',
      'vlaina_cover: "@biva/1"',
      'nested:',
      '  vlaina_note: user nested value',
      '---',
      '# Exported',
    ].join('\n');

    expect(stripManagedFrontmatter(markdown)).toBe([
      '---',
      'title: User title',
      'tags:',
      '  - project',
      'nested:',
      '  vlaina_note: user nested value',
      '---',
      '# Exported',
    ].join('\n'));
  });

  it('ignores an unclosed oversized leading frontmatter candidate', () => {
    const markdown = [
      '---',
      ...Array.from({ length: 2050 }, (_, index) => `vlaina_icon: "hidden-${index}"`),
      '# Body',
    ].join('\n');

    expect(readNoteMetadataFromMarkdown(markdown)).toEqual({});
    expect(stripManagedFrontmatter(markdown)).toBe(markdown);
  });

  it('preserves an oversized unclosed frontmatter candidate when writing metadata', () => {
    const markdown = [
      '---',
      ...Array.from({ length: 2050 }, (_, index) => `line_${index}: value`),
      '# Body',
    ].join('\n');

    expect(
      writeNoteMetadataToMarkdown(markdown, {
        updatedAt: Date.parse('2026-04-16T00:00:00.000Z'),
      })
    ).toBe(markdown);
  });

  it('does not parse frontmatter that closes after the character budget', () => {
    const markdown = [
      '---',
      `vlaina_icon: "${'x'.repeat(256 * 1024)}"`,
      '---',
      '',
      '# Body',
    ].join('\n');

    expect(readNoteMetadataFromMarkdown(markdown)).toEqual({});
    expect(stripUpdatedFrontmatter(markdown)).toBe(markdown);
  });
});
