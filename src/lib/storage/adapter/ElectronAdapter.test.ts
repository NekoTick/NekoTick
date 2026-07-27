import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bridge: {
    fs: {
      readTextFile: vi.fn().mockResolvedValue('hello'),
      readBinaryFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2])),
      writeTextFile: vi.fn().mockResolvedValue(undefined),
      writeBinaryFile: vi.fn().mockResolvedValue(undefined),
      deleteFile: vi.fn().mockResolvedValue(undefined),
      deleteDir: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(true),
      mkdir: vi.fn().mockResolvedValue(undefined),
      listDir: vi.fn(),
      rename: vi.fn().mockResolvedValue(undefined),
      copyFile: vi.fn().mockResolvedValue(undefined),
      stat: vi.fn().mockResolvedValue({ path: '/tmp/a.md', name: 'a.md', isFile: true, isDirectory: false }),
    },
    path: {
      appDataDir: vi.fn().mockResolvedValue('/appdata'),
    },
  },
  getElectronBridge: vi.fn(),
}));

vi.mock('@/lib/electron/bridge', () => ({
  getElectronBridge: mocks.getElectronBridge,
}));

import {
  ElectronAdapter,
  MAX_ELECTRON_RECURSIVE_LIST_ENTRIES,
  MAX_ELECTRON_WRITE_BYTES,
} from './ElectronAdapter';

describe('ElectronAdapter', () => {
  beforeEach(() => {
    mocks.getElectronBridge.mockReturnValue(mocks.bridge);
    for (const group of [mocks.bridge.fs, mocks.bridge.path]) {
      for (const value of Object.values(group)) {
        if (typeof value === 'function' && 'mockClear' in value) {
          value.mockClear();
        }
      }
    }
  });

  it('delegates basic fs operations through the electron bridge', async () => {
    const adapter = new ElectronAdapter();

    await expect(adapter.readFile('/tmp/a.md')).resolves.toBe('hello');
    await expect(adapter.readBinaryFile('/tmp/a.bin')).resolves.toEqual(new Uint8Array([1, 2]));
    await adapter.writeFile('/tmp/a.md', '# note', { recursive: true });
    await adapter.deleteFile('/tmp/a.md');
    await adapter.deleteDir('/tmp/dir', true);
    await expect(adapter.exists('/tmp/a.md')).resolves.toBe(true);
    await adapter.mkdir('/tmp/dir', true);
    await adapter.rename('/tmp/a.md', '/tmp/b.md');
    await adapter.copyFile('/tmp/b.md', '/tmp/c.md');
    await expect(adapter.stat('/tmp/c.md')).resolves.toMatchObject({ name: 'a.md' });

    expect(mocks.bridge.fs.writeTextFile).toHaveBeenCalledWith('/tmp/a.md', '# note', { recursive: true });
    expect(mocks.bridge.fs.deleteFile).toHaveBeenCalledWith('/tmp/a.md');
    expect(mocks.bridge.fs.deleteDir).toHaveBeenCalledWith('/tmp/dir', true);
    expect(mocks.bridge.fs.mkdir).toHaveBeenCalledWith('/tmp/dir', true);
    expect(mocks.bridge.fs.rename).toHaveBeenCalledWith('/tmp/a.md', '/tmp/b.md');
    expect(mocks.bridge.fs.copyFile).toHaveBeenCalledWith('/tmp/b.md', '/tmp/c.md');
  });

  it('delegates optional binary read byte limits through the electron bridge', async () => {
    const adapter = new ElectronAdapter();

    await expect(adapter.readBinaryFile('/tmp/a.bin', 2)).resolves.toEqual(new Uint8Array([1, 2]));

    expect(mocks.bridge.fs.readBinaryFile).toHaveBeenCalledWith('/tmp/a.bin', 2);
  });

  it('delegates optional text read byte limits through the electron bridge', async () => {
    const adapter = new ElectronAdapter();

    await expect(adapter.readFile('/tmp/a.md', 2)).resolves.toBe('hello');

    expect(mocks.bridge.fs.readTextFile).toHaveBeenCalledWith('/tmp/a.md', 2);
  });

  it('delegates explicit unbounded text reads and writes through the electron bridge', async () => {
    const adapter = new ElectronAdapter();

    await expect(adapter.readFile('/tmp/board.json', null)).resolves.toBe('hello');
    await adapter.writeFile('/tmp/board.json', 'content', {
      byteLength: MAX_ELECTRON_WRITE_BYTES + 1,
      maxBytes: null,
      recursive: true,
    });
    await adapter.copyFile('/tmp/board.json', '/tmp/board.json.bak', null);

    expect(mocks.bridge.fs.readTextFile).toHaveBeenCalledWith('/tmp/board.json', null);
    expect(mocks.bridge.fs.writeTextFile).toHaveBeenCalledWith('/tmp/board.json', 'content', {
      maxBytes: null,
      recursive: true,
    });
    expect(mocks.bridge.fs.copyFile).toHaveBeenCalledWith(
      '/tmp/board.json',
      '/tmp/board.json.bak',
      null,
    );
  });

  it('creates parent directories before recursive binary writes', async () => {
    const adapter = new ElectronAdapter();

    await adapter.writeBinaryFile('/tmp/assets/image.png', new Uint8Array([7, 8]), { recursive: true });

    expect(mocks.bridge.fs.mkdir).toHaveBeenCalledWith('/tmp/assets', true);
    expect(mocks.bridge.fs.writeBinaryFile).toHaveBeenCalledWith('/tmp/assets/image.png', new Uint8Array([7, 8]));
  });

  it('rejects oversized binary writes before creating directories or sending IPC payloads', async () => {
    const adapter = new ElectronAdapter();
    const oversized = { byteLength: MAX_ELECTRON_WRITE_BYTES + 1 } as Uint8Array;

    await expect(adapter.writeBinaryFile('/tmp/assets/large.bin', oversized, { recursive: true }))
      .rejects.toThrow('Electron file content is too large to write.');

    expect(mocks.bridge.fs.mkdir).not.toHaveBeenCalled();
    expect(mocks.bridge.fs.writeBinaryFile).not.toHaveBeenCalled();
  });

  it('rejects oversized text writes before sending IPC payloads', async () => {
    const adapter = new ElectronAdapter();
    const oversized = 'x'.repeat(MAX_ELECTRON_WRITE_BYTES + 1);

    await expect(adapter.writeFile('/tmp/assets/large.md', oversized, { recursive: true }))
      .rejects.toThrow('Electron file content is too large to write.');

    expect(mocks.bridge.fs.mkdir).not.toHaveBeenCalled();
    expect(mocks.bridge.fs.writeTextFile).not.toHaveBeenCalled();
  });

  it('filters hidden entries by default and walks directories recursively when requested', async () => {
    mocks.bridge.fs.listDir.mockImplementation(async (path: string) => {
      if (path === '/notesRoot') {
        return [
          { name: '.hidden', path: '/notesRoot/.hidden', isDirectory: false, isFile: true },
          { name: '.notes', path: '/notesRoot/.notes', isDirectory: true, isFile: false },
          { name: 'docs', path: '/notesRoot/docs', isDirectory: true, isFile: false },
          { name: 'a.md', path: '/notesRoot/a.md', isDirectory: false, isFile: true },
        ];
      }

      if (path === '/notesRoot/.notes') {
        return [
          { name: 'hidden-note.md', path: '/notesRoot/.notes/hidden-note.md', isDirectory: false, isFile: true },
        ];
      }

      if (path === '/notesRoot/docs') {
        return [
          { name: 'b.md', path: '/notesRoot/docs/b.md', isDirectory: false, isFile: true },
        ];
      }

      return [];
    });

    const adapter = new ElectronAdapter();

    await expect(adapter.listDir('/notesRoot')).resolves.toEqual([
      { name: 'docs', path: '/notesRoot/docs', isDirectory: true, isFile: false },
      { name: 'a.md', path: '/notesRoot/a.md', isDirectory: false, isFile: true },
    ]);

    await expect(adapter.listDir('/notesRoot', { includeHidden: true })).resolves.toEqual([
      { name: '.hidden', path: '/notesRoot/.hidden', isDirectory: false, isFile: true },
      { name: '.notes', path: '/notesRoot/.notes', isDirectory: true, isFile: false },
      { name: 'docs', path: '/notesRoot/docs', isDirectory: true, isFile: false },
      { name: 'a.md', path: '/notesRoot/a.md', isDirectory: false, isFile: true },
    ]);

    await adapter.listDir('/notesRoot', { maxEntries: 256 });
    expect(mocks.bridge.fs.listDir).toHaveBeenLastCalledWith('/notesRoot', 256);

    await expect(adapter.listDir('/notesRoot', { recursive: true })).resolves.toEqual([
      { name: 'docs', path: '/notesRoot/docs', isDirectory: true, isFile: false },
      { name: 'b.md', path: '/notesRoot/docs/b.md', isDirectory: false, isFile: true },
      { name: 'a.md', path: '/notesRoot/a.md', isDirectory: false, isFile: true },
    ]);

    await expect(adapter.listDir('/notesRoot', { recursive: true, includeHidden: true })).resolves.toEqual([
      { name: '.hidden', path: '/notesRoot/.hidden', isDirectory: false, isFile: true },
      { name: '.notes', path: '/notesRoot/.notes', isDirectory: true, isFile: false },
      { name: 'hidden-note.md', path: '/notesRoot/.notes/hidden-note.md', isDirectory: false, isFile: true },
      { name: 'docs', path: '/notesRoot/docs', isDirectory: true, isFile: false },
      { name: 'b.md', path: '/notesRoot/docs/b.md', isDirectory: false, isFile: true },
      { name: 'a.md', path: '/notesRoot/a.md', isDirectory: false, isFile: true },
    ]);
  });

  it('walks recursive directories sequentially to avoid burst filesystem IPC calls', async () => {
    let activeChildCalls = 0;
    let maxActiveChildCalls = 0;
    mocks.bridge.fs.listDir.mockImplementation(async (path: string) => {
      if (path === '/notesRoot') {
        return Array.from({ length: 4 }, (_, index) => ({
          name: `dir-${index}`,
          path: `/notesRoot/dir-${index}`,
          isDirectory: true,
          isFile: false,
        }));
      }

      if (path.startsWith('/notesRoot/dir-')) {
        activeChildCalls += 1;
        maxActiveChildCalls = Math.max(maxActiveChildCalls, activeChildCalls);
        await new Promise((resolve) => setTimeout(resolve, 0));
        activeChildCalls -= 1;
        return [
          {
            name: 'note.md',
            path: `${path}/note.md`,
            isDirectory: false,
            isFile: true,
          },
        ];
      }

      return [];
    });

    const adapter = new ElectronAdapter();

    await expect(adapter.listDir('/notesRoot', { recursive: true })).resolves.toHaveLength(8);
    expect(maxActiveChildCalls).toBe(1);
  });

  it('stops recursive directory walking at the scan entry limit', async () => {
    mocks.bridge.fs.listDir.mockImplementation(async (path: string) => {
      if (path === '/notesRoot') {
        return Array.from({ length: MAX_ELECTRON_RECURSIVE_LIST_ENTRIES + 1 }, (_, index) => ({
          name: `dir-${index}`,
          path: `/notesRoot/dir-${index}`,
          isDirectory: true,
          isFile: false,
        }));
      }

      return [
        {
          name: 'note.md',
          path: `${path}/note.md`,
          isDirectory: false,
          isFile: true,
        },
      ];
    });

    const adapter = new ElectronAdapter();

    await expect(adapter.listDir('/notesRoot', { recursive: true })).resolves.toHaveLength(
      MAX_ELECTRON_RECURSIVE_LIST_ENTRIES,
    );
    expect(mocks.bridge.fs.listDir).toHaveBeenCalledTimes(1);
  });

  it('caches the electron app data base path', async () => {
    const adapter = new ElectronAdapter();

    await expect(adapter.getBasePath()).resolves.toBe('/appdata');
    await expect(adapter.getBasePath()).resolves.toBe('/appdata');

    expect(mocks.bridge.path.appDataDir).toHaveBeenCalledTimes(1);
  });

  it('throws a clear error when the electron bridge is unavailable', async () => {
    mocks.getElectronBridge.mockReturnValue(null as never);
    const adapter = new ElectronAdapter();

    await expect(adapter.readFile('/tmp/a.md')).rejects.toThrow('Electron fs bridge is not available.');
    await expect(adapter.getBasePath()).rejects.toThrow('Electron path bridge is not available.');
  });
});
