import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const MAX_DESKTOP_FS_WRITE_BYTES = 64 * 1024 * 1024;

interface PreloadFsApi {
  copyFile(sourcePath: string, targetPath: string, maxBytes?: number | null): Promise<unknown>;
  writeBinaryFile(filePath: string, bytes: Uint8Array | ArrayLike<number>): Promise<unknown>;
  writeTextFile(
    filePath: string,
    content: string,
    options?: { recursive?: boolean; append?: boolean; maxBytes?: number | null },
  ): Promise<unknown>;
  watch(
    filePath: string,
    callback: (payload: unknown) => void | Promise<void>,
    options?: { recursive?: boolean }
  ): Promise<() => Promise<void>>;
}

interface PreloadApi {
  app: {
    onOpenMarkdownFile(callback: (filePath: string) => void | Promise<void>): () => void;
  };
  fs: PreloadFsApi;
  aiProvider: {
    onRequestChunk(
      requestId: string,
      callback: (chunk: unknown, sequence: number) => void | Promise<void>,
    ): () => void;
  };
  computer?: {
    startCommand(requestId: string, request: Record<string, unknown>): Promise<unknown>;
    cancelCommand(requestId: string): Promise<unknown>;
    respondToApproval(requestId: string, decision: string): Promise<unknown>;
    onCommandEvent(requestId: string, callback: (payload: unknown) => void | Promise<void>): () => void;
  };
  account: {
    managedWebSearch(body: Record<string, unknown>, requestId?: string): Promise<unknown>;
    cancelManagedWebSearch(requestId: string): Promise<unknown>;
    onManagedStreamError(requestId: string, callback: (payload: unknown) => void | Promise<void>): () => void;
  };
}

async function loadPreloadApi(hostPlatform = 'linux'): Promise<{
  api: PreloadApi;
  fs: PreloadFsApi;
  ipcRenderer: {
    invoke: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    removeListener: ReturnType<typeof vi.fn>;
  };
}> {
  const exposed: Record<string, PreloadApi> = {};
  const ipcRenderer = {
    on: vi.fn(),
    invoke: vi.fn(async () => undefined),
    send: vi.fn(),
    removeListener: vi.fn(),
  };
  const contextBridge = {
    exposeInMainWorld: vi.fn((name: string, api: PreloadApi) => {
      exposed[name] = api;
    }),
  };
  const webUtils = {
    getPathForFile: vi.fn(),
  };
  const preloadPath = path.resolve(process.cwd(), 'electron/preload.bundle.cjs');
  const moduleCache = new Map<string, { exports: unknown }>();
  const loadLocalCommonJsModule = (filePath: string) => {
    const resolvedPath = path.resolve(filePath);
    const cached = moduleCache.get(resolvedPath);
    if (cached) {
      return cached.exports;
    }

    const module = { exports: {} };
    moduleCache.set(resolvedPath, module);
    const moduleCode = readFileSync(resolvedPath, 'utf8');
    const wrapped = `(function (require, module, exports) {\n${moduleCode}\n})`;
    const moduleRequire = (id: string) => {
      if (id === 'electron') {
        return { contextBridge, ipcRenderer, webUtils };
      }
      if (id.startsWith('./')) {
        return loadLocalCommonJsModule(path.resolve(path.dirname(resolvedPath), id));
      }
      throw new Error(`Unexpected preload require: ${id}`);
    };
    const factory = vm.runInContext(wrapped, context, { filename: resolvedPath });
    factory(moduleRequire, module, module.exports);
    return module.exports;
  };
  const code = await readFile(preloadPath, 'utf8');
  const context = vm.createContext({
    Buffer,
    console,
    process: { platform: hostPlatform },
    require: (id: string) => {
      if (id === 'electron') {
        return { contextBridge, ipcRenderer, webUtils };
      }
      if (id.startsWith('./')) {
        return loadLocalCommonJsModule(path.resolve(path.dirname(preloadPath), id));
      }
      throw new Error(`Unexpected preload require: ${id}`);
    },
  });

  vm.runInContext(code, context, { filename: preloadPath });

  const api = exposed.vlainaDesktop;
  if (!api) {
    throw new Error('Preload did not expose vlainaDesktop.');
  }

  return { api, fs: api.fs, ipcRenderer };
}

describe('preload filesystem budgets', () => {
  it('exposes managed web search only through the authenticated account bridge', async () => {
    const { api, ipcRenderer } = await loadPreloadApi();
    const body = { action: 'search', query: 'latest news' };

    await api.account.managedWebSearch(body, 'managed-web-search-1');
    await api.account.cancelManagedWebSearch('managed-web-search-1');

    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(
      1,
      'desktop:managed:web-search',
      'managed-web-search-1',
      body,
    );
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(
      2,
      'desktop:managed:web-search:cancel',
      'managed-web-search-1',
    );
    expect(api).not.toHaveProperty('webSearch');
  });

  it('forwards the fixed Git API through dedicated IPC channels', async () => {
    const { api, ipcRenderer } = await loadPreloadApi();
    const commitOptions = {
      message: 'Update notes',
      paths: ['docs/note.md'],
    };

    await api.git.status('/repo');
    await api.git.fetch('/repo');
    await api.git.workingDiff('/repo', ['docs/note.md']);
    await api.git.history('/repo', 25);
    await api.git.commitDiff('/repo', '0123456789abcdef');
    await api.git.commit('/repo', commitOptions);
    await api.git.pull('/repo');
    await api.git.push('/repo');

    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(1, 'desktop:git:status', '/repo');
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(2, 'desktop:git:fetch', '/repo');
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(
      3,
      'desktop:git:working-diff',
      '/repo',
      ['docs/note.md'],
    );
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(4, 'desktop:git:history', '/repo', 25);
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(
      5,
      'desktop:git:commit-diff',
      '/repo',
      '0123456789abcdef',
    );
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(
      6,
      'desktop:git:commit',
      '/repo',
      commitOptions,
    );
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(7, 'desktop:git:pull', '/repo');
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(8, 'desktop:git:push', '/repo');
  });

  it('bounds pending open markdown events before listeners register', async () => {
    const { api, ipcRenderer } = await loadPreloadApi();
    const openHandler = ipcRenderer.on.mock.calls.find(
      ([channel]) => channel === 'desktop:app:open-markdown-file',
    )?.[1];
    if (typeof openHandler !== 'function') {
      throw new Error('open markdown handler was not registered.');
    }

    openHandler({}, '/tmp/ignored.txt');
    openHandler({}, `/tmp/${'x'.repeat(8192)}.md`);
    for (let index = 0; index < 40; index += 1) {
      openHandler({}, `/tmp/note-${index}.md`);
    }

    const callback = vi.fn();
    const dispose = api.app.onOpenMarkdownFile(callback);

    expect(callback).toHaveBeenCalledTimes(32);
    expect(callback.mock.calls[0]?.[0]).toBe('/tmp/note-8.md');
    expect(callback.mock.calls[31]?.[0]).toBe('/tmp/note-39.md');

    openHandler({}, '/tmp/live.markdown');
    openHandler({}, '/tmp/live.txt');
    expect(callback).toHaveBeenCalledTimes(33);
    expect(callback.mock.calls[32]?.[0]).toBe('/tmp/live.markdown');

    dispose();
  });

  it('rejects oversized binary writes before materializing arrays or sending IPC', async () => {
    const { fs, ipcRenderer } = await loadPreloadApi();
    const oversizedBytes = {
      length: MAX_DESKTOP_FS_WRITE_BYTES + 1,
      [Symbol.iterator]: function* iterator() {
        throw new Error('Oversized payload should not be iterated.');
      },
    } as ArrayLike<number>;

    expect(() => fs.writeBinaryFile('/tmp/huge.bin', oversizedBytes)).toThrow(
      'Desktop content is too large to write.',
    );
    expect(ipcRenderer.invoke).not.toHaveBeenCalled();
  });

  it('forwards small filesystem writes with normalized payloads', async () => {
    const { fs, ipcRenderer } = await loadPreloadApi();

    await fs.writeBinaryFile('/tmp/image.bin', new Uint8Array([1, 2, 3]));
    await fs.writeTextFile('/tmp/note.md', 'hello', { append: true });

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      'desktop:fs:write-binary',
      '/tmp/image.bin',
      new Uint8Array([1, 2, 3]),
    );
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      'desktop:fs:write-text',
      '/tmp/note.md',
      'hello',
      { append: true },
    );
  });

  it('forwards explicit unbounded text writes to the desktop filesystem handler', async () => {
    const { fs, ipcRenderer } = await loadPreloadApi();

    await fs.writeTextFile('/tmp/board.json', 'content', { maxBytes: null, recursive: true });
    await fs.copyFile('/tmp/board.json', '/tmp/board.json.bak', null);

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      'desktop:fs:write-text',
      '/tmp/board.json',
      'content',
      { maxBytes: null, recursive: true },
    );
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      'desktop:fs:copy-file',
      '/tmp/board.json',
      '/tmp/board.json.bak',
      null,
    );
  });

  it('normalizes binary writes without trusting custom iterators', async () => {
    const { fs, ipcRenderer } = await loadPreloadApi();
    const bytes = {
      0: 7,
      length: 1,
      [Symbol.iterator]: function* iterator() {
        throw new Error('Binary payload iterator should not be used.');
      },
    } as ArrayLike<number>;

    await fs.writeBinaryFile('/tmp/one.bin', bytes);

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      'desktop:fs:write-binary',
      '/tmp/one.bin',
      [7],
    );
  });

  it('rejects object request ids and text writes without coercion', async () => {
    const { api, fs, ipcRenderer } = await loadPreloadApi();
    let stringReads = 0;
    const throwingValue = {
      toString() {
        stringReads += 1;
        throw new Error('Unexpected preload coercion');
      },
    };

    expect(() => api.aiProvider.onRequestChunk(throwingValue as never, () => undefined)).toThrow(
      'AI provider request id must contain only safe channel characters.',
    );
    expect(() => fs.writeTextFile('/tmp/note.md', throwingValue as never)).toThrow(
      'Desktop text content must be a primitive value.',
    );
    expect(stringReads).toBe(0);
    expect(ipcRenderer.invoke).not.toHaveBeenCalled();
  });

  it('does not return rejected watch callback promises to ipc listeners', async () => {
    const { fs, ipcRenderer } = await loadPreloadApi();
    ipcRenderer.invoke.mockResolvedValueOnce('watch-safe-id');
    const callback = vi.fn(async () => {
      throw new Error('watch callback failed');
    });

    const unwatch = await fs.watch('/tmp/notesRoot', callback, { recursive: true });
    const handler = ipcRenderer.on.mock.calls.find(
      ([channel]) => channel === 'desktop:fs:watch:watch-safe-id',
    )?.[1];
    if (typeof handler !== 'function') {
      throw new Error('watch handler was not registered.');
    }

    expect(handler({}, { paths: ['/tmp/notesRoot/a.md'] })).toBeUndefined();
    await Promise.resolve();
    expect(callback).toHaveBeenCalledWith({ paths: ['/tmp/notesRoot/a.md'] });

    await unwatch();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('desktop:fs:watch:watch-safe-id', handler);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith('desktop:fs:unwatch', 'watch-safe-id');
  });

  it('does not surface rejected stream callbacks through ipc listeners', async () => {
    const { api, ipcRenderer } = await loadPreloadApi();
    const chunkCallback = vi.fn(() => {
      throw new Error('chunk callback failed');
    });
    const errorCallback = vi.fn(async () => {
      throw new Error('stream error callback failed');
    });

    const disposeChunk = api.aiProvider.onRequestChunk('request-1', chunkCallback);
    const disposeError = api.account.onManagedStreamError('stream-1', errorCallback);
    const chunkHandler = ipcRenderer.on.mock.calls.find(
      ([channel]) => channel === 'desktop:ai-provider:request:request-1:chunk',
    )?.[1];
    const errorHandler = ipcRenderer.on.mock.calls.find(
      ([channel]) => channel === 'desktop:managed:stream:stream-1:error',
    )?.[1];
    if (typeof chunkHandler !== 'function' || typeof errorHandler !== 'function') {
      throw new Error('stream handlers were not registered.');
    }

    const bytes = Uint8Array.from([1, 2, 3]);
    expect(chunkHandler({}, { bytes, sequence: 7 })).toBeUndefined();
    expect(errorHandler({}, { message: 'failed' })).toBeUndefined();
    await Promise.resolve();
    expect(chunkCallback).toHaveBeenCalledWith(bytes, 7);
    expect(errorCallback).toHaveBeenCalledWith({ message: 'failed' });

    disposeChunk();
    disposeError();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      'desktop:ai-provider:request:request-1:chunk',
      chunkHandler,
    );
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      'desktop:managed:stream:stream-1:error',
      errorHandler,
    );
  });

  it('exposes computer command IPC through safe request-scoped channels', async () => {
    const { api, ipcRenderer } = await loadPreloadApi();
    const computer = api.computer;
    if (!computer) {
      throw new Error('Expected computer command API on Linux.');
    }
    const callback = vi.fn(async () => {
      throw new Error('command callback failed');
    });
    const dispose = computer.onCommandEvent('command-1', callback);
    const handler = ipcRenderer.on.mock.calls.find(
      ([channel]) => channel === 'desktop:computer-command:command-1:event',
    )?.[1];
    if (typeof handler !== 'function') {
      throw new Error('computer command handler was not registered.');
    }

    await computer.startCommand('command-1', { command: 'printf ok' });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      'desktop:computer-command:start',
      'command-1',
      { command: 'printf ok' },
    );
    await computer.respondToApproval('command-1', 'run_once');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      'desktop:computer-command:approve',
      'command-1',
      'run_once',
    );
    expect(handler({}, { type: 'started' })).toBeUndefined();
    await Promise.resolve();
    expect(callback).toHaveBeenCalledWith({ type: 'started' });

    expect(() => computer.onCommandEvent('../unsafe', () => undefined)).toThrow(
      'Computer command request id must contain only safe channel characters.',
    );
    dispose();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      'desktop:computer-command:command-1:event',
      handler,
    );
  });

  it('does not expose computer commands on unsupported host platforms', async () => {
    const { api } = await loadPreloadApi('win32');

    expect(api.computer).toBeUndefined();
  });
});
