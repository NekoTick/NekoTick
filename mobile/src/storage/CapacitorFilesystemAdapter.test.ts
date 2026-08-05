import type { FilesystemPlugin } from '@capacitor/filesystem';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CapacitorFilesystemAdapter, MAX_CAPACITOR_FILE_BYTES } from './CapacitorFilesystemAdapter';

interface StoredEntry {
  type: 'directory' | 'file';
  data?: string;
  size: number;
}

function createFilesystemMock() {
  const entries = new Map<string, StoredEntry>([
    ['vlaina', { type: 'directory', size: 0 }],
  ]);
  const normalize = (path: string) => path.replace(/\/+$/, '');
  const readFile = vi.fn(async ({ path, encoding }: { path: string; encoding?: string }) => {
    const entry = entries.get(normalize(path));
    if (!entry || entry.type !== 'file') throw new Error('not found');
    return { data: encoding ? entry.data ?? '' : entry.data ?? '' };
  });
  const writeFile = vi.fn(async ({ path, data, encoding }: { path: string; data: string; encoding?: string }) => {
    entries.set(normalize(path), {
      type: 'file',
      data,
      size: encoding ? new TextEncoder().encode(data).byteLength : Math.floor(data.length * 0.75),
    });
    return { uri: `file://${path}` };
  });
  const appendFile = vi.fn(async ({ path, data }: { path: string; data: string }) => {
    const key = normalize(path);
    const existing = entries.get(key);
    entries.set(key, {
      type: 'file',
      data: `${existing?.data ?? ''}${data}`,
      size: (existing?.size ?? 0) + data.length,
    });
  });
  const mkdir = vi.fn(async ({ path, recursive }: { path: string; recursive?: boolean }) => {
    const parts = normalize(path).split('/');
    const start = recursive ? 1 : parts.length;
    for (let length = start; length <= parts.length; length += 1) {
      entries.set(parts.slice(0, length).join('/'), { type: 'directory', size: 0 });
    }
  });
  const stat = vi.fn(async ({ path }: { path: string }) => {
    const entry = entries.get(normalize(path));
    if (!entry) throw new Error('not found');
    return {
      name: normalize(path).split('/').pop() ?? '',
      type: entry.type,
      size: entry.size,
      ctime: 1,
      mtime: 2,
      uri: `file://${path}`,
    };
  });
  const readdir = vi.fn(async ({ path }: { path: string }) => {
    const parent = `${normalize(path)}/`;
    const files = [...entries.entries()]
      .filter(([entryPath]) => entryPath.startsWith(parent) && !entryPath.slice(parent.length).includes('/'))
      .map(([entryPath, entry]) => ({
        name: entryPath.slice(parent.length),
        type: entry.type,
        size: entry.size,
        ctime: 1,
        mtime: 2,
        uri: `file://${entryPath}`,
      }));
    return { files };
  });
  const renameEntry = async ({ from, to }: { from: string; to: string }) => {
    const source = normalize(from);
    const destination = normalize(to);
    const entry = entries.get(source);
    if (!entry) throw new Error('source not found');
    if (entries.has(destination)) throw new Error('destination exists');
    entries.set(destination, { ...entry });
    entries.delete(source);
  };
  const copyEntry = async ({ from, to }: { from: string; to: string }) => {
    const source = entries.get(normalize(from));
    const destination = normalize(to);
    if (!source) throw new Error('source not found');
    if (entries.has(destination)) throw new Error('destination exists');
    entries.set(destination, { ...source });
  };
  const rename = vi.fn(renameEntry);
  const copy = vi.fn(copyEntry);
  const plugin = {
    readFile,
    writeFile,
    appendFile,
    mkdir,
    stat,
    readdir,
    deleteFile: vi.fn(async ({ path }: { path: string }) => { entries.delete(normalize(path)); }),
    rmdir: vi.fn(async ({ path }: { path: string }) => { entries.delete(normalize(path)); }),
    rename,
    copy,
    getUri: vi.fn(async ({ path }: { path: string }) => ({ uri: `file://${path}` })),
  } as unknown as FilesystemPlugin;
  return { entries, plugin, readFile, rename, renameEntry, writeFile };
}

describe('CapacitorFilesystemAdapter', () => {
  let mock: ReturnType<typeof createFilesystemMock>;
  let adapter: CapacitorFilesystemAdapter;

  beforeEach(() => {
    mock = createFilesystemMock();
    adapter = new CapacitorFilesystemAdapter(mock.plugin);
  });

  it('writes, reads, stats, and recursively lists private text files', async () => {
    await adapter.writeFile('/vlaina/notes/daily/today.md', '# Today', { recursive: true });

    await expect(adapter.readFile('/vlaina/notes/daily/today.md')).resolves.toBe('# Today');
    await expect(adapter.stat('/vlaina/notes/daily/today.md')).resolves.toMatchObject({
      path: '/vlaina/notes/daily/today.md',
      isFile: true,
      size: 7,
    });
    await expect(adapter.listDir('/vlaina', { recursive: true })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/vlaina/notes', isDirectory: true }),
        expect.objectContaining({ path: '/vlaina/notes/daily/today.md', isFile: true }),
      ]),
    );
  });

  it('serializes conditional writes so only one matching update wins', async () => {
    await adapter.writeFile('/vlaina/note.md', 'before', { recursive: true });

    const results = await Promise.all([
      adapter.writeFileIfUnchanged('/vlaina/note.md', 'before', 'first'),
      adapter.writeFileIfUnchanged('/vlaina/note.md', 'before', 'second'),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    await expect(adapter.readFile('/vlaina/note.md')).resolves.toBe('first');
  });

  it('rejects oversized files before crossing the native read bridge', async () => {
    mock.entries.set('vlaina/large.bin', {
      type: 'file',
      data: '',
      size: MAX_CAPACITOR_FILE_BYTES + 1,
    });

    await expect(adapter.readBinaryFile('/vlaina/large.bin')).rejects.toThrow(/too large/i);
    expect(mock.readFile).not.toHaveBeenCalled();
  });

  it('supports repeated recoverable replacements when native operations do not overwrite', async () => {
    const board = '/vlaina/board.json';
    const backup = `${board}.bak`;
    await adapter.writeFile(board, 'first');

    await adapter.writeFile(`${board}.first.tmp`, 'second');
    await adapter.copyFile(board, backup);
    await adapter.rename(`${board}.first.tmp`, board);

    await adapter.writeFile(`${board}.second.tmp`, 'third');
    await adapter.copyFile(board, backup);
    await adapter.rename(`${board}.second.tmp`, board);

    await expect(adapter.readFile(board)).resolves.toBe('third');
    await expect(adapter.readFile(backup)).resolves.toBe('second');
    expect([...mock.entries.keys()].filter((path) => path.includes('.previous'))).toEqual([]);
  });

  it('restores the destination when a native replacement move fails', async () => {
    const source = '/vlaina/new.json';
    const destination = '/vlaina/current.json';
    await adapter.writeFile(source, 'new');
    await adapter.writeFile(destination, 'current');
    mock.rename.mockImplementation(async (options) => {
      if (options.from === 'vlaina/new.json' && options.to === 'vlaina/current.json') {
        throw new Error('move failed');
      }
      await mock.renameEntry(options);
    });

    await expect(adapter.rename(source, destination)).rejects.toThrow('move failed');
    await expect(adapter.readFile(source)).resolves.toBe('new');
    await expect(adapter.readFile(destination)).resolves.toBe('current');
    expect([...mock.entries.keys()].filter((path) => path.includes('.previous'))).toEqual([]);
  });
});
