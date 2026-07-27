import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadNoteDocument, NoteWriteConflictError, saveNoteDocument } from './noteDocumentPersistence';
import { clearExpectedExternalChange, markExpectedExternalChange } from './externalChangeRegistry';
import { setCachedNoteContent } from './noteContentCache';

const MAX_NOTE_DOCUMENT_BYTES = 10 * 1024 * 1024;

const adapter = {
  platform: undefined as 'electron' | 'web' | undefined,
  readFile: vi.fn<(path: string, maxBytes?: number) => Promise<string>>(),
  writeFile: vi.fn<(path: string, content: string) => Promise<void>>(),
  writeFileIfUnchanged: vi.fn<(
    path: string,
    expectedContent: string | null,
    content: string,
  ) => Promise<boolean>>(),
  stat: vi.fn<
    (path: string) => Promise<{ isFile?: boolean; isDirectory?: boolean; modifiedAt?: number | null; size?: number | null } | null>
  >(),
};

vi.mock('@/lib/storage/adapter', () => ({
  getStorageAdapter: () => adapter,
  isAbsolutePath: (path: string) => path.startsWith('/'),
  joinPath: (...segments: string[]) => Promise.resolve(segments.join('/').replace(/\/+/g, '/')),
  normalizeAbsolutePath: (path: string) => {
    if (!path.startsWith('/')) return path;
    const parts: string[] = [];
    for (const part of path.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') {
        parts.pop();
        continue;
      }
      parts.push(part);
    }
    return `/${parts.join('/')}`;
  },
}));

vi.mock('./externalChangeRegistry', () => ({
  clearExpectedExternalChange: vi.fn(),
  markExpectedExternalChange: vi.fn(),
}));

describe('saveNoteDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adapter.platform = undefined;
    adapter.writeFileIfUnchanged.mockResolvedValue(true);
  });

  it('rejects a save when another window writes after the disk check', async () => {
    adapter.stat.mockResolvedValue({ modifiedAt: 1, size: 4 });
    adapter.readFile.mockResolvedValue('ab');
    adapter.writeFileIfUnchanged.mockResolvedValue(false);
    const cache = setCachedNoteContent(new Map(), 'alpha.md', 'ab', 1, {
      updateBaseline: true,
      size: 2,
    });

    await expect(saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: { path: 'alpha.md', content: 'abcd啦啦啦' },
      cache,
    })).rejects.toBeInstanceOf(NoteWriteConflictError);

    expect(adapter.writeFile).not.toHaveBeenCalled();
    expect(clearExpectedExternalChange).toHaveBeenCalledWith('/notesRoot/alpha.md');
    expect(adapter.writeFileIfUnchanged).toHaveBeenCalledWith(
      '/notesRoot/alpha.md',
      'ab',
      'abcd啦啦啦',
    );
  });

  it('creates a new note only while the target path is still absent', async () => {
    adapter.stat
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ modifiedAt: 2, size: 13 });

    await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: { path: 'alpha.md', content: 'abcd啦啦啦' },
      cache: new Map(),
    });

    expect(adapter.writeFileIfUnchanged).toHaveBeenCalledWith(
      '/notesRoot/alpha.md',
      null,
      'abcd啦啦啦',
    );
    expect(adapter.writeFile).not.toHaveBeenCalled();
  });

  it('clears the expected change marker when a conditional write throws', async () => {
    adapter.stat.mockResolvedValue(null);
    adapter.writeFileIfUnchanged.mockRejectedValue(new Error('disk unavailable'));

    await expect(saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: { path: 'alpha.md', content: 'local content' },
      cache: new Map(),
    })).rejects.toThrow('disk unavailable');

    expect(clearExpectedExternalChange).toHaveBeenCalledWith('/notesRoot/alpha.md');
  });

  it('uses the original disk text as the conditional-write baseline after normalizing line endings', async () => {
    adapter.platform = 'electron';
    adapter.stat
      .mockResolvedValueOnce({ modifiedAt: 1, size: 10 })
      .mockResolvedValueOnce({ modifiedAt: 1, size: 10 })
      .mockResolvedValueOnce({ modifiedAt: 2, size: 15 });
    adapter.readFile.mockResolvedValue('\uFEFF# Alpha\r\n');

    const loaded = await loadNoteDocument({
      notesPath: '/notesRoot',
      path: 'alpha.md',
      cache: new Map(),
    });
    await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: { path: 'alpha.md', content: '# Alpha\n\nEdited' },
      cache: loaded.nextCache,
    });

    expect(loaded.content).toBe('# Alpha\n');
    expect(adapter.writeFileIfUnchanged).toHaveBeenCalledWith(
      '/notesRoot/alpha.md',
      '\uFEFF# Alpha\r\n',
      '# Alpha\n\nEdited',
    );
  });

  it('repairs a legacy normalized baseline when the disk only differs by line endings', async () => {
    adapter.platform = 'electron';
    adapter.stat
      .mockResolvedValueOnce({ modifiedAt: 1, size: 9 })
      .mockResolvedValueOnce({ modifiedAt: 2, size: 15 });
    adapter.readFile.mockResolvedValue('# Alpha\r\n');
    adapter.writeFileIfUnchanged
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const cache = setCachedNoteContent(new Map(), 'alpha.md', '# Alpha\n', 1, {
      updateBaseline: true,
      size: 9,
    });

    await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: { path: 'alpha.md', content: '# Alpha\n\nEdited' },
      cache,
    });

    expect(adapter.writeFileIfUnchanged).toHaveBeenNthCalledWith(
      1,
      '/notesRoot/alpha.md',
      '# Alpha\n',
      '# Alpha\n\nEdited',
    );
    expect(adapter.writeFileIfUnchanged).toHaveBeenNthCalledWith(
      2,
      '/notesRoot/alpha.md',
      '# Alpha\r\n',
      '# Alpha\n\nEdited',
    );
  });

  it('does not retry a rejected write when disk content differs beyond encoding', async () => {
    adapter.platform = 'electron';
    adapter.stat.mockResolvedValue({ modifiedAt: 1, size: 9 });
    adapter.readFile.mockResolvedValue('# Changed\n');
    adapter.writeFileIfUnchanged.mockResolvedValue(false);
    const cache = setCachedNoteContent(new Map(), 'alpha.md', '# Alpha\n', 1, {
      updateBaseline: true,
      size: 9,
    });

    await expect(saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: { path: 'alpha.md', content: '# Local edit\n' },
      cache,
    })).rejects.toMatchObject({
      name: 'NoteWriteConflictError',
      conflictReason: 'conditional-write-rejected',
    });

    expect(adapter.writeFileIfUnchanged).toHaveBeenCalledTimes(1);
  });

  it('refuses to overwrite an existing desktop note when its cache baseline is missing', async () => {
    adapter.platform = 'electron';
    adapter.stat.mockResolvedValue({ modifiedAt: 1, size: 2 });
    adapter.readFile.mockResolvedValue('disk content');

    await expect(saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: { path: 'alpha.md', content: 'local content' },
      cache: new Map(),
    })).rejects.toBeInstanceOf(NoteWriteConflictError);

    expect(adapter.writeFile).not.toHaveBeenCalled();
    expect(adapter.writeFileIfUnchanged).not.toHaveBeenCalled();
  });

  it('cleans managed timestamp frontmatter before saving markdown', async () => {
    adapter.writeFile.mockResolvedValue();
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    const result = await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: [
          '---',
          'vlaina_created: 2026-04-14 18:00:00 +08:00',
          '---',
          '',
          '# Alpha',
        ].join('\n'),
      },
      cache: new Map(),
    });

    expect(adapter.writeFile).toHaveBeenCalledWith(
      '/notesRoot/alpha.md',
      '# Alpha'
    );
    expect(result.metadata).toEqual({
      updatedAt: 123,
    });
    expect(result.modifiedAt).toBe(123);
  });

  it('preserves user-authored blank lines at the end of frontmatter when saving markdown', async () => {
    adapter.writeFile.mockResolvedValue();
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 64 });
    const content = [
      '---',
      'title: Blank Line Fidelity',
      '',
      '',
      '---',
      '',
      '# Alpha',
    ].join('\n');

    const result = await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: { path: 'alpha.md', content },
      cache: new Map(),
    });

    expect(adapter.writeFile).toHaveBeenCalledWith('/notesRoot/alpha.md', content);
    expect(result.content).toBe(content);
  });

  it('normalizes invalid modified timestamps after saving markdown', async () => {
    adapter.writeFile.mockResolvedValue();
    adapter.stat.mockResolvedValue({ modifiedAt: Number.NaN, size: 16 });

    const result = await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: '# Alpha',
      },
      cache: new Map(),
    });

    expect(result.modifiedAt).toBeNull();
    expect(result.nextCache.get('alpha.md')?.modifiedAt).toBeNull();
  });

  it('refreshes the expected external change marker after writing to cover delayed watch events', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
    adapter.writeFile.mockImplementation(async () => {
      vi.advanceTimersByTime(1500);
    });
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: '# Alpha',
      },
      cache: new Map(),
    });

    expect(markExpectedExternalChange).toHaveBeenCalledTimes(2);
    expect(markExpectedExternalChange).toHaveBeenNthCalledWith(1, '/notesRoot/alpha.md');
    expect(markExpectedExternalChange).toHaveBeenNthCalledWith(2, '/notesRoot/alpha.md');

    vi.useRealTimers();
  });

  it('cleans internal editor break markers before writing markdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
    adapter.writeFile.mockResolvedValue();
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    const result = await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: ['# Alpha', '<br data-vlaina-empty-line="true"/>', 'Body'].join('\n'),
      },
      cache: new Map(),
    });

    expect(adapter.writeFile).toHaveBeenCalledWith(
      '/notesRoot/alpha.md',
      ['# Alpha', '', 'Body'].join('\n')
    );
    expect(result.content).not.toContain('data-vlaina-empty-line');

    vi.useRealTimers();
  });

  it('cleans serialized editor-only markdown artifacts before writing markdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
    adapter.writeFile.mockResolvedValue();
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    const result = await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: [
          '# Alpha',
          '<!--vlaina-markdown-blank-line-->',
          '&#x20; Pro:   \\$76.80 / year',
          '&#32 Max:   \\$191.90 / year',
        ].join('\n'),
      },
      cache: new Map(),
    });

    const written = String(adapter.writeFile.mock.calls[0]?.[1] ?? '');
    expect(written).toBe([
      '# Alpha',
      '',
      '  Pro:   \\$76.80 / year',
      ' Max:   \\$191.90 / year',
    ].join('\n'));
    expect(written).not.toContain('vlaina-markdown-blank-line');
    expect(written).not.toContain('&#x20');
    expect(written).not.toContain('&#32');
    expect(result.content).toBe(written);

    vi.useRealTimers();
  });

  it('cleans rendered HTML boundary helpers before writing markdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
    adapter.writeFile.mockResolvedValue();
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    const result = await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: [
          '<img src="./assets/demo.svg" alt="Demo" />',
          '',
          '<!--vlaina-rendered-html-boundary-blank-line-->',
          'After image.',
        ].join('\n'),
      },
      cache: new Map(),
    });

    const expected = [
      '<img src="./assets/demo.svg" alt="Demo" />',
      '',
      'After image.',
    ].join('\n');
    const written = String(adapter.writeFile.mock.calls[0]?.[1] ?? '');
    expect(written).toBe(expected);
    expect(written).not.toContain('vlaina-rendered-html-boundary-blank-line');
    expect(result.content).toBe(expected);

    vi.useRealTimers();
  });

  it('preserves user-authored rendered HTML boundary comments outside helper positions when writing markdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
    adapter.writeFile.mockResolvedValue();
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    const content = [
      'Before',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      'After',
    ].join('\n');

    const result = await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content,
      },
      cache: new Map(),
    });

    expect(adapter.writeFile).toHaveBeenCalledWith('/notesRoot/alpha.md', content);
    expect(result.content).toBe(content);

    vi.useRealTimers();
  });

  it('converts internal user break markers to markdown hard breaks before writing markdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
    adapter.writeFile.mockResolvedValue();
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    const result = await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: ['Line one', '<br data-vlaina-user-br="true" />', 'Line two'].join('\n'),
      },
      cache: new Map(),
    });

    expect(adapter.writeFile).toHaveBeenCalledWith(
      '/notesRoot/alpha.md',
      [
        'Line one\\',
        'Line two',
      ].join('\n')
    );
    expect(result.content).not.toContain('data-vlaina-user-br');

    vi.useRealTimers();
  });

  it('preserves editor-state line breaks before writing markdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
    adapter.writeFile.mockResolvedValue();
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: ['1', '2', '', '3', '4'].join('\n'),
      },
      cache: new Map(),
    });

    expect(adapter.writeFile).toHaveBeenCalledWith(
      '/notesRoot/alpha.md',
      [
        '1',
        '2',
        '',
        '3',
        '4',
      ].join('\n')
    );

    vi.useRealTimers();
  });

  it('preserves long body and terminal blank line runs when saving markdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
    adapter.writeFile.mockResolvedValue();
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    const bodyBlankLineCount = 64;
    const terminalBlankLineCount = 32;
    const content = `${[
      '---',
      'title: Blank Lines',
      '---',
      '',
      '# Alpha',
      '',
      'Before long run',
      ...Array.from({ length: bodyBlankLineCount }, () => ''),
      'After long run',
    ].join('\n')}${'\n'.repeat(terminalBlankLineCount)}`;

    const result = await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content,
      },
      cache: new Map(),
    });

    expect(adapter.writeFile).toHaveBeenCalledWith('/notesRoot/alpha.md', content);
    expect(result.content).toBe(content);
    expect(result.nextCache.get('alpha.md')?.content).toBe(content);

    vi.useRealTimers();
  });

  it('preserves editor-created empty paragraph runs before writing markdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
    adapter.writeFile.mockResolvedValue();
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: ['before', '', '', 'after', '', '', '', 'tail'].join('\n'),
      },
      cache: new Map(),
    });

    expect(adapter.writeFile).toHaveBeenCalledWith(
      '/notesRoot/alpha.md',
      [
        'before',
        '',
        '',
        'after',
        '',
        '',
        '',
        'tail',
      ].join('\n')
    );

    vi.useRealTimers();
  });

  it('removes terminal list item br placeholders before writing markdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
    adapter.writeFile.mockResolvedValue();
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: '- 1<br />',
      },
      cache: new Map(),
    });

    expect(adapter.writeFile).toHaveBeenCalledWith(
      '/notesRoot/alpha.md',
      '- 1'
    );

    vi.useRealTimers();
  });

  it('writes ordered list empty items and br spacer lines as plain markdown blank lines', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
    adapter.writeFile.mockResolvedValue();
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: ['8. before', '9. <br />', '<br />', '10. after'].join('\n'),
      },
      cache: new Map(),
    });

    expect(adapter.writeFile).toHaveBeenCalledWith(
      '/notesRoot/alpha.md',
      [
        '8. before',
        '9.',
        '',
        '10. after',
      ].join('\n')
    );

    vi.useRealTimers();
  });

  it('writes multiple br spacer lines between list items as plain markdown blank lines', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
    adapter.writeFile.mockResolvedValue();
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: ['1. before', '<br />', '<br />', '<br />', '2. after'].join('\n'),
      },
      cache: new Map(),
    });

    expect(adapter.writeFile).toHaveBeenCalledWith(
      '/notesRoot/alpha.md',
      [
        '1. before',
        '',
        '',
        '',
        '2. after',
      ].join('\n')
    );

    vi.useRealTimers();
  });

  it('keeps frontmatter body separator when saving an empty body', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
    adapter.writeFile.mockResolvedValue();
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    const result = await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: [
          '---',
          'vlaina_icon: "😃"',
          'vlaina_updated: 2026-04-14 18:00:00 +08:00',
          '---',
          '',
        ].join('\n'),
      },
      cache: new Map(),
    });

    const expected = [
      '---',
      'vlaina_icon: "😃"',
      '---',
      '',
    ].join('\n');
    expect(adapter.writeFile).toHaveBeenCalledWith('/notesRoot/alpha.md', expected);
    expect(result.content).toBe(expected);

    vi.useRealTimers();
  });

  it('canonicalizes supported inline html text before writing markdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
    adapter.writeFile.mockResolvedValue();
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: '<sup>a < b & c</sup>',
      },
      cache: new Map(),
    });

    expect(adapter.writeFile).toHaveBeenCalledWith(
      '/notesRoot/alpha.md',
      '<sup>a &lt; b &amp; c</sup>'
    );

    vi.useRealTimers();
  });

  it('removes redundant serializer escapes from intraword underscores before writing markdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
    adapter.writeFile.mockResolvedValue();
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: 'h\\_i and foo\\_\\_bar',
      },
      cache: new Map(),
    });

    expect(adapter.writeFile).toHaveBeenCalledWith(
      '/notesRoot/alpha.md',
      'h_i and foo__bar'
    );

    vi.useRealTimers();
  });

  it('normalizes custom editor markdown syntax before writing markdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
    adapter.writeFile.mockResolvedValue();
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: [
          '\\==highlight==',
          '',
          '\\*[ABBR]: Full phrase',
          '',
          '[^1]: <br />',
          '',
          '| A | B |',
          '| - | - |',
          '| <br /> | <br /> |',
        ].join('\n'),
      },
      cache: new Map(),
    });

    expect(adapter.writeFile).toHaveBeenCalledWith(
      '/notesRoot/alpha.md',
      [
        '\\==highlight==',
        '',
        '\\*[ABBR]: Full phrase',
        '',
        '[^1]:',
        '',
        '| A | B |',
        '| - | - |',
        '|   |   |',
      ].join('\n')
    );

    vi.useRealTimers();
  });

  it('cleans internal editor break markers when loading markdown', async () => {
    adapter.readFile.mockResolvedValue(['# Alpha', '<br data-vlaina-empty-line="true"/>', 'Body'].join('\n'));
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    const result = await loadNoteDocument({
      notesPath: '/notesRoot',
      path: 'alpha.md',
      cache: new Map(),
    });

    expect(result.content).toBe(['# Alpha', '', 'Body'].join('\n'));
    expect(result.nextCache.get('alpha.md')?.content).toBe(['# Alpha', '', 'Body'].join('\n'));
  });

  it('uses the original disk markdown as the conditional-write baseline after load normalization', async () => {
    const diskContent = ['# Alpha', '<br data-vlaina-empty-line="true"/>', 'Body'].join('\n');
    adapter.platform = 'electron';
    adapter.readFile.mockResolvedValue(diskContent);
    adapter.stat
      .mockResolvedValueOnce({ modifiedAt: 123, size: diskContent.length })
      .mockResolvedValueOnce({ modifiedAt: 123, size: diskContent.length })
      .mockResolvedValueOnce({ modifiedAt: 124, size: diskContent.length + 8 });

    const loaded = await loadNoteDocument({
      notesPath: '/notesRoot',
      path: 'alpha.md',
      cache: new Map(),
    });
    const editedContent = `${loaded.content}\n\nEdited`;

    await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: { path: 'alpha.md', content: editedContent },
      cache: loaded.nextCache,
    });

    expect(adapter.writeFileIfUnchanged).toHaveBeenCalledWith(
      '/notesRoot/alpha.md',
      diskContent,
      editedContent,
    );
  });

  it('cleans serialized editor-only markdown artifacts when loading markdown', async () => {
    adapter.readFile.mockResolvedValue([
      '# Alpha',
      '<!--vlaina-markdown-blank-line-->',
      '&#x20; Pro:   \\$76.80 / year',
      '&#32 Max:   \\$191.90 / year',
    ].join('\n'));
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    const result = await loadNoteDocument({
      notesPath: '/notesRoot',
      path: 'alpha.md',
      cache: new Map(),
    });

    const expected = [
      '# Alpha',
      '',
      '  Pro:   \\$76.80 / year',
      ' Max:   \\$191.90 / year',
    ].join('\n');
    expect(result.content).toBe(expected);
    expect(result.content).not.toContain('vlaina-markdown-blank-line');
    expect(result.content).not.toContain('&#x20');
    expect(result.content).not.toContain('&#32');
    expect(result.nextCache.get('alpha.md')?.content).toBe(expected);
  });

  it('cleans rendered HTML boundary helpers when loading markdown', async () => {
    adapter.readFile.mockResolvedValue([
      '<img src="./assets/demo.svg" alt="Demo" />',
      '',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      'After image.',
    ].join('\n'));
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    const result = await loadNoteDocument({
      notesPath: '/notesRoot',
      path: 'alpha.md',
      cache: new Map(),
    });

    const expected = [
      '<img src="./assets/demo.svg" alt="Demo" />',
      '',
      'After image.',
    ].join('\n');
    expect(result.content).toBe(expected);
    expect(result.content).not.toContain('vlaina-rendered-html-boundary-blank-line');
    expect(result.nextCache.get('alpha.md')?.content).toBe(expected);
  });

  it('preserves user-authored rendered HTML boundary comments outside helper positions when loading markdown', async () => {
    const content = [
      'Before',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      'After',
    ].join('\n');
    adapter.readFile.mockResolvedValue(content);
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    const result = await loadNoteDocument({
      notesPath: '/notesRoot',
      path: 'alpha.md',
      cache: new Map(),
    });

    expect(result.content).toBe(content);
    expect(result.nextCache.get('alpha.md')?.content).toBe(content);
  });

  it('preserves markdown blank lines between list items when loading markdown', async () => {
    const markdown = ['- one', '', '', '', '- two'].join('\n');
    adapter.readFile.mockResolvedValue(markdown);
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    const result = await loadNoteDocument({
      notesPath: '/notesRoot',
      path: 'alpha.md',
      cache: new Map(),
    });

    expect(result.content).toBe(markdown);
    expect(result.nextCache.get('alpha.md')?.content).toBe(markdown);
  });

  it('preserves long body and terminal blank line runs when loading markdown', async () => {
    const bodyBlankLineCount = 64;
    const terminalBlankLineCount = 32;
    const markdown = `${[
      '# Alpha',
      '',
      'Before long run',
      ...Array.from({ length: bodyBlankLineCount }, () => ''),
      'After long run',
    ].join('\n')}${'\n'.repeat(terminalBlankLineCount)}`;
    adapter.readFile.mockResolvedValue(markdown);
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    const result = await loadNoteDocument({
      notesPath: '/notesRoot',
      path: 'alpha.md',
      cache: new Map(),
    });

    expect(result.content).toBe(markdown);
    expect(result.nextCache.get('alpha.md')?.content).toBe(markdown);
  });

  it('rejects loading relative paths that escape the notesRoot', async () => {
    await expect(loadNoteDocument({
      notesPath: '/notesRoot',
      path: '../secret.md',
      cache: new Map(),
    })).rejects.toThrow('Path must stay inside the opened folder.');

    expect(adapter.readFile).not.toHaveBeenCalled();
  });

  it('rejects loading oversized markdown files before reading content', async () => {
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 11 * 1024 * 1024 });

    await expect(loadNoteDocument({
      notesPath: '/notesRoot',
      path: 'huge.md',
      cache: new Map(),
    })).rejects.toThrow('Note file is too large to open.');

    expect(adapter.readFile).not.toHaveBeenCalled();
  });

  it('rejects loading markdown files with invalid negative stat sizes before reading content', async () => {
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: -1 });

    await expect(loadNoteDocument({
      notesPath: '/notesRoot',
      path: 'invalid-size.md',
      cache: new Map(),
    })).rejects.toThrow('Note file is too large to open.');

    expect(adapter.readFile).not.toHaveBeenCalled();
  });

  it('rejects saving when the target path is known to be a directory', async () => {
    adapter.stat.mockResolvedValue({ isDirectory: true, isFile: false, modifiedAt: 123, size: 0 });

    await expect(saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: '# Alpha',
      },
      cache: new Map(),
    })).rejects.toThrow('Note file is too large to open.');

    expect(adapter.writeFile).not.toHaveBeenCalled();
  });

  it('loads markdown files with bounded reads when stat has no size', async () => {
    adapter.stat.mockResolvedValue({ modifiedAt: 123 });
    adapter.readFile.mockResolvedValue('# Alpha');

    await expect(loadNoteDocument({
      notesPath: '/notesRoot',
      path: 'alpha.md',
      cache: new Map(),
    })).resolves.toMatchObject({
      content: '# Alpha',
      modifiedAt: 123,
      size: null,
    });

    expect(adapter.readFile).toHaveBeenCalledWith('/notesRoot/alpha.md', MAX_NOTE_DOCUMENT_BYTES);
  });

  it('normalizes invalid modified timestamps when loading markdown', async () => {
    adapter.stat.mockResolvedValue({ modifiedAt: Number.POSITIVE_INFINITY, size: 16 });
    adapter.readFile.mockResolvedValue('# Alpha');

    const result = await loadNoteDocument({
      notesPath: '/notesRoot',
      path: 'alpha.md',
      cache: new Map(),
    });

    expect(result.modifiedAt).toBeNull();
    expect(result.nextCache.get('alpha.md')?.modifiedAt).toBeNull();
  });

  it('rejects cached markdown that is too complex for the editor', async () => {
    await expect(loadNoteDocument({
      notesPath: '/notesRoot',
      path: 'many-lines.md',
      cache: new Map([
        ['many-lines.md', {
          content: `${'x\n'.repeat(120_001)}x`,
          modifiedAt: 123,
        }],
      ]),
    })).rejects.toThrow('Note file is too complex to open safely.');

    expect(adapter.readFile).not.toHaveBeenCalled();
  });

  it('rejects markdown with an extreme single line before normalization', async () => {
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 600 * 1024 });
    adapter.readFile.mockResolvedValue('x'.repeat(512 * 1024 + 1));

    await expect(loadNoteDocument({
      notesPath: '/notesRoot',
      path: 'long-line.md',
      cache: new Map(),
    })).rejects.toThrow('Note file is too complex to open safely.');
  });

  it('rejects externally changed disk markdown that is too complex before merge normalization', async () => {
    adapter.stat.mockResolvedValue({ modifiedAt: 200, size: 300 * 1024 });
    adapter.readFile.mockResolvedValue(`${'x\n'.repeat(120_001)}x`);

    await expect(saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: '# Local edit',
      },
      cache: new Map([
        ['alpha.md', {
          content: '# Cached baseline',
          modifiedAt: 100,
        }],
      ]),
    })).rejects.toThrow('Note file is too complex to open safely.');

    expect(adapter.writeFile).not.toHaveBeenCalled();
  });

  it('rejects final saved markdown that is too complex before writing', async () => {
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    await expect(saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: Array.from({ length: 120_001 }, () => 'x').join('\n'),
      },
      cache: new Map(),
    })).rejects.toThrow('Note file is too complex to open safely.');

    expect(adapter.writeFile).not.toHaveBeenCalled();
  });

  it('cleans internal user break markers when loading markdown', async () => {
    adapter.readFile.mockResolvedValue(['Line one', '<br data-vlaina-user-br="true" />', 'Line two'].join('\n'));
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });

    const result = await loadNoteDocument({
      notesPath: '/notesRoot',
      path: 'alpha.md',
      cache: new Map(),
    });

    expect(result.content).toBe(['Line one\\', 'Line two'].join('\n'));
    expect(result.nextCache.get('alpha.md')?.content).toBe(['Line one\\', 'Line two'].join('\n'));
  });

  it('cleans internal editor break markers from cached markdown', async () => {
    const cachedContent = ['# Alpha', '<br data-vlaina-empty-line="true" />', 'Body'].join('\n');
    adapter.stat.mockResolvedValue({ modifiedAt: 123, size: 16 });
    adapter.readFile.mockResolvedValue(cachedContent);
    const result = await loadNoteDocument({
      notesPath: '/notesRoot',
      path: 'alpha.md',
      cache: new Map([
        ['alpha.md', {
          content: cachedContent,
          modifiedAt: 123,
        }],
      ]),
    });

    expect(adapter.readFile).not.toHaveBeenCalled();
    expect(result.content).toBe(['# Alpha', '', 'Body'].join('\n'));
    expect(result.nextCache.get('alpha.md')?.content).toBe(['# Alpha', '', 'Body'].join('\n'));
    expect(result.modifiedAt).toBe(123);
  });

  it('normalizes absolute paths before reading and caching markdown', async () => {
    adapter.stat.mockResolvedValue({ modifiedAt: 321, size: 16 });
    adapter.readFile.mockResolvedValue('# External');

    const result = await loadNoteDocument({
      notesPath: '/notesRoot',
      path: '/external/docs/../note.md',
      cache: new Map(),
    });

    expect(adapter.stat).toHaveBeenCalledWith('/external/note.md');
    expect(adapter.readFile).toHaveBeenCalledWith('/external/note.md', MAX_NOTE_DOCUMENT_BYTES);
    expect(result.nextCache.has('/external/docs/../note.md')).toBe(false);
    expect(result.nextCache.get('/external/note.md')).toEqual({
      content: '# External',
      modifiedAt: 321,
    });
  });

  it('uses freshly prefetched cached markdown without another disk stat', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);

    const result = await loadNoteDocument({
      notesPath: '/notesRoot',
      path: 'alpha.md',
      cache: setCachedNoteContent(new Map(), 'alpha.md', '# Fresh', 100, {
        updateBaseline: true,
        freshUntil: 2000,
      }),
    });

    expect(adapter.stat).not.toHaveBeenCalled();
    expect(adapter.readFile).not.toHaveBeenCalled();
    expect(result.content).toBe('# Fresh');
    expect(result.modifiedAt).toBe(100);

    vi.useRealTimers();
  });

  it('revalidates cached markdown after the fresh prefetch window expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2500);
    adapter.stat.mockResolvedValue({ modifiedAt: 200, size: 16 });
    adapter.readFile.mockResolvedValue('# Updated after prefetch');

    const result = await loadNoteDocument({
      notesPath: '/notesRoot',
      path: 'alpha.md',
      cache: setCachedNoteContent(new Map(), 'alpha.md', '# Fresh but expired', 100, {
        updateBaseline: true,
        freshUntil: 2000,
      }),
    });

    expect(adapter.stat).toHaveBeenCalledWith('/notesRoot/alpha.md');
    expect(adapter.readFile).toHaveBeenCalledWith('/notesRoot/alpha.md', MAX_NOTE_DOCUMENT_BYTES);
    expect(result.content).toBe('# Updated after prefetch');
    expect(result.modifiedAt).toBe(200);

    vi.useRealTimers();
  });

  it('refreshes cached markdown when the disk modified timestamp changed before opening', async () => {
    adapter.stat.mockResolvedValue({ modifiedAt: 200, size: 16 });
    adapter.readFile.mockResolvedValue('# Updated by another window');

    const result = await loadNoteDocument({
      notesPath: '/notesRoot',
      path: 'alpha.md',
      cache: new Map([
        ['alpha.md', {
          content: '# Cached before external edit',
          modifiedAt: 100,
        }],
      ]),
    });

    expect(adapter.readFile).toHaveBeenCalledWith('/notesRoot/alpha.md', MAX_NOTE_DOCUMENT_BYTES);
    expect(result.content).toBe('# Updated by another window');
    expect(result.modifiedAt).toBe(200);
    expect(result.nextCache.get('alpha.md')).toEqual({
      content: '# Updated by another window',
      modifiedAt: 200,
    });
  });

  it('refreshes cached markdown when disk size changed with the same modified timestamp', async () => {
    adapter.stat.mockResolvedValue({ modifiedAt: 100, size: 32 });
    adapter.readFile.mockResolvedValue('# Updated by another window');

    const result = await loadNoteDocument({
      notesPath: '/notesRoot',
      path: 'alpha.md',
      cache: setCachedNoteContent(new Map(), 'alpha.md', '# Cached before external edit', 100, {
        updateBaseline: true,
        size: 8,
      }),
    });

    expect(adapter.readFile).toHaveBeenCalledWith('/notesRoot/alpha.md', MAX_NOTE_DOCUMENT_BYTES);
    expect(result.content).toBe('# Updated by another window');
    expect(result.modifiedAt).toBe(100);
    expect(result.size).toBe(32);
    expect(result.nextCache.get('alpha.md')?.size).toBe(32);
  });

  it('keeps dirty tab cached markdown even when disk changed before opening', async () => {
    adapter.stat.mockResolvedValue({ modifiedAt: 200, size: 16 });
    adapter.readFile.mockResolvedValue('# Updated by another window');

    const result = await loadNoteDocument({
      notesPath: '/notesRoot',
      path: 'alpha.md',
      cache: new Map([
        ['alpha.md', {
          content: '# Unsaved local tab edit',
          modifiedAt: 100,
        }],
      ]),
      allowStaleCachedContent: true,
    });

    expect(adapter.readFile).not.toHaveBeenCalled();
    expect(result.content).toBe('# Unsaved local tab edit');
    expect(result.modifiedAt).toBe(100);
  });

  it('refuses to overwrite a note that changed on disk after it was loaded', async () => {
    adapter.stat.mockResolvedValue({ modifiedAt: 200, size: 16 });
    adapter.readFile.mockResolvedValue('# External edit');

    await expect(saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: '# Local edit',
      },
      cache: new Map([['alpha.md', { content: '# Loaded', modifiedAt: 100 }]]),
    })).rejects.toBeInstanceOf(NoteWriteConflictError);

    expect(adapter.writeFile).not.toHaveBeenCalled();
  });

  it('refuses to overwrite a note whose disk size changed with the same modified timestamp', async () => {
    adapter.stat.mockResolvedValue({ modifiedAt: 100, size: 32 });
    adapter.readFile.mockResolvedValue('# External same timestamp edit');

    await expect(saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: '# Local edit',
      },
      cache: setCachedNoteContent(new Map(), 'alpha.md', '# Loaded', 100, {
        updateBaseline: true,
        size: 8,
      }),
    })).rejects.toBeInstanceOf(NoteWriteConflictError);

    expect(adapter.writeFile).not.toHaveBeenCalled();
  });

  it('checks changed disk markdown for conflict checks when stat has no size', async () => {
    adapter.stat.mockResolvedValue({ modifiedAt: 200 });
    adapter.readFile.mockResolvedValue('# External edit');

    await expect(saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: '# Local edit',
      },
      cache: new Map([['alpha.md', { content: '# Loaded', modifiedAt: 100 }]]),
    })).rejects.toBeInstanceOf(NoteWriteConflictError);

    expect(adapter.readFile).toHaveBeenCalledWith('/notesRoot/alpha.md', MAX_NOTE_DOCUMENT_BYTES);
    expect(adapter.writeFile).not.toHaveBeenCalled();
  });

  it('merges non-overlapping local and disk edits before saving', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
    adapter.stat
      .mockResolvedValueOnce({ modifiedAt: 200, size: 16 })
      .mockResolvedValueOnce({ modifiedAt: 201 });
    adapter.readFile.mockResolvedValue([
      '# Title',
      '',
      'Disk edit',
      '',
      'Shared ending',
    ].join('\n'));
    adapter.writeFile.mockResolvedValue();

    const result = await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: [
          '# Title',
          '',
          'Loaded middle',
          '',
          'Local ending',
        ].join('\n'),
      },
      cache: new Map([[
        'alpha.md',
        {
          content: [
            '# Title',
            '',
            'Loaded middle',
            '',
            'Shared ending',
          ].join('\n'),
          modifiedAt: 100,
        },
      ]]),
    });

    const expectedContent = [
      '# Title',
      '',
      'Disk edit',
      '',
      'Local ending',
    ].join('\n');
    expect(adapter.writeFileIfUnchanged).toHaveBeenCalledWith(
      '/notesRoot/alpha.md',
      [
        '# Title',
        '',
        'Disk edit',
        '',
        'Shared ending',
      ].join('\n'),
      expectedContent,
    );
    expect(result.content).toBe(expectedContent);
    expect(result.modifiedAt).toBe(201);

    vi.useRealTimers();
  });

  it('refuses to overwrite a note whose disk content changed with the same modified timestamp', async () => {
    adapter.stat.mockResolvedValue({ modifiedAt: 100, size: 16 });
    adapter.readFile.mockResolvedValue('# External same timestamp edit');
    let cache = setCachedNoteContent(new Map(), 'alpha.md', '# Loaded', 100, {
      updateBaseline: true,
    });
    cache = setCachedNoteContent(cache, 'alpha.md', '# Local edit', 100);

    await expect(saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: '# Local edit',
      },
      cache,
    })).rejects.toBeInstanceOf(NoteWriteConflictError);

    expect(adapter.writeFile).not.toHaveBeenCalled();
  });

  it('rejects saving relative paths that escape the notesRoot', async () => {
    await expect(saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: '../secret.md',
        content: '# Secret',
      },
      cache: new Map(),
    })).rejects.toThrow('Path must stay inside the opened folder.');

    expect(adapter.writeFile).not.toHaveBeenCalled();
  });

  it('normalizes absolute paths before saving and caching markdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
    adapter.stat
      .mockResolvedValueOnce({ modifiedAt: 100, size: 16 })
      .mockResolvedValueOnce({ modifiedAt: 101 });
    adapter.writeFile.mockResolvedValue();

    const result = await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: '/external/docs/../note.md',
        content: '# External',
      },
      cache: new Map(),
    });

    expect(adapter.writeFile).toHaveBeenCalledWith(
      '/external/note.md',
      '# External'
    );
    expect(result.nextCache.has('/external/docs/../note.md')).toBe(false);
    expect(result.nextCache.get('/external/note.md')?.content).toBe(result.content);

    vi.useRealTimers();
  });

  it('saves local edits when only the disk modified timestamp changed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
    adapter.stat
      .mockResolvedValueOnce({ modifiedAt: 200, size: 16 })
      .mockResolvedValueOnce({ modifiedAt: 201 });
    adapter.readFile.mockResolvedValue('# Loaded');
    adapter.writeFile.mockResolvedValue();

    const result = await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: '# Local edit',
      },
      cache: new Map([['alpha.md', { content: '# Loaded', modifiedAt: 100 }]]),
    });

    expect(adapter.writeFileIfUnchanged).toHaveBeenCalledWith(
      '/notesRoot/alpha.md',
      '# Loaded',
      '# Local edit'
    );
    expect(result.modifiedAt).toBe(201);
    expect(result.nextCache.get('alpha.md')).toEqual({
      content: result.content,
      modifiedAt: 201,
    });

    vi.useRealTimers();
  });

  it('saves local edits when the disk only changed the managed updated timestamp', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-17T10:00:00.000Z'));
    adapter.stat
      .mockResolvedValueOnce({ modifiedAt: 200, size: 16 })
      .mockResolvedValueOnce({ modifiedAt: 201 });
    adapter.readFile.mockResolvedValue([
      '---',
      'vlaina_updated: 2026-04-16 18:00:00 +08:00',
      '---',
      '',
      '# Loaded',
    ].join('\n'));
    adapter.writeFile.mockResolvedValue();

    const result = await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: [
          '---',
          'vlaina_updated: 2026-04-15 18:00:00 +08:00',
          '---',
          '',
          '# Local edit',
        ].join('\n'),
      },
      cache: new Map([[
        'alpha.md',
        {
          content: [
            '---',
            'vlaina_updated: 2026-04-15 18:00:00 +08:00',
            '---',
            '',
            '# Loaded',
          ].join('\n'),
          modifiedAt: 100,
        },
      ]]),
    });

    expect(adapter.writeFileIfUnchanged).toHaveBeenCalledWith(
      '/notesRoot/alpha.md',
      [
        '---',
        'vlaina_updated: 2026-04-16 18:00:00 +08:00',
        '---',
        '',
        '# Loaded',
      ].join('\n'),
      '# Local edit'
    );
    expect(result.modifiedAt).toBe(201);

    vi.useRealTimers();
  });

  it('cleans managed timestamp frontmatter when disk content otherwise matches', async () => {
    adapter.stat.mockResolvedValue({ modifiedAt: 200, size: 16 });
    adapter.readFile.mockResolvedValue([
      '---',
      'vlaina_updated: 2026-04-15 18:00:00 +08:00',
      '---',
      '',
      '# Loaded',
    ].join('\n'));

    const result = await saveNoteDocument({
      notesPath: '/notesRoot',
      currentNote: {
        path: 'alpha.md',
        content: [
          '---',
          'vlaina_updated: 2026-04-15 18:00:00 +08:00',
          '---',
          '',
          '# Loaded',
        ].join('\n'),
      },
      cache: new Map([['alpha.md', { content: '# Loaded', modifiedAt: 100 }]]),
    });

    expect(adapter.writeFileIfUnchanged).toHaveBeenCalledWith(
      '/notesRoot/alpha.md',
      [
        '---',
        'vlaina_updated: 2026-04-15 18:00:00 +08:00',
        '---',
        '',
        '# Loaded',
      ].join('\n'),
      '# Loaded',
    );
    expect(result.modifiedAt).toBe(200);
    expect(result.content).toBe('# Loaded');
    expect(result.nextCache.get('alpha.md')).toEqual({
      content: result.content,
      modifiedAt: 200,
    });
  });
});
