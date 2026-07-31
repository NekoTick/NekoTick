import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import electron from 'electron';
import {
  isPathInsideDirectory,
  openPathInFileManager,
  registerDesktopIpc,
  revealItemInFolder,
} from '../../electron/desktopIpc.mjs';

const MAX_DESKTOP_IPC_BODY_BYTES = 64 * 1024 * 1024;
const MAX_AI_PROVIDER_RESPONSE_BODY_BYTES = 64 * 1024 * 1024;
const MAX_AI_PROVIDER_RESPONSE_IPC_CHUNK_BYTES = 256 * 1024;
const MAX_CLIPBOARD_IMAGE_DATA_URL_BYTES = 10 * 1024 * 1024;

const hoisted = vi.hoisted(() => {
  const windows: any[] = [];
  const tempRoot = process.env.RUNNER_TEMP ?? process.env.TEMP ?? process.env.TMPDIR ?? '/tmp';
  let nextLoadFileResult: Promise<void> | void;
  let nextPrintToPDFResult: Promise<Uint8Array> | { byteLength: number } | Uint8Array = new Uint8Array([1, 2, 3]);
  const spawn = vi.fn(() => ({
    once: vi.fn(),
    unref: vi.fn(),
  }));

  class MockBrowserWindow {
    options: Record<string, unknown>;
    webContents: {
      on: ReturnType<typeof vi.fn>;
      printToPDF: ReturnType<typeof vi.fn>;
      session: { webRequest: { onBeforeRequest: ReturnType<typeof vi.fn> } };
      setWindowOpenHandler: ReturnType<typeof vi.fn>;
    };
    loadFile = vi.fn(async () => nextLoadFileResult);
    loadURL = vi.fn(async () => undefined);
    destroy = vi.fn(() => {
      this.destroyed = true;
    });
    destroyed = false;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      this.webContents = {
        on: vi.fn(),
        printToPDF: vi.fn(async () => nextPrintToPDFResult),
        session: {
          webRequest: {
            onBeforeRequest: vi.fn(),
          },
        },
        setWindowOpenHandler: vi.fn(),
      };
      windows.push(this);
    }

    isDestroyed() {
      return this.destroyed;
    }
  }

  return {
    MockBrowserWindow,
    resetLoadFileResult: () => {
      nextLoadFileResult = undefined;
    },
    resetPrintToPDFResult: () => {
      nextPrintToPDFResult = new Uint8Array([1, 2, 3]);
    },
    setLoadFileResult: (value: Promise<void>) => {
      nextLoadFileResult = value;
    },
    setPrintToPDFResult: (value: Promise<Uint8Array> | { byteLength: number } | Uint8Array) => {
      nextPrintToPDFResult = value;
    },
    spawn,
    tempRoot,
    windows,
  };
});

vi.mock('node:child_process', () => ({
  default: {
    spawn: hoisted.spawn,
  },
  spawn: hoisted.spawn,
}));

vi.mock('electron', () => ({
  default: {
    app: {
      getPath: vi.fn(() => hoisted.tempRoot),
    },
    BrowserWindow: hoisted.MockBrowserWindow,
    clipboard: {
      readImage: vi.fn(),
      writeText: vi.fn(),
      writeImage: vi.fn(),
    },
    nativeImage: {
      createFromDataURL: vi.fn(() => ({
        isEmpty: () => false,
      })),
    },
    dialog: {},
    shell: {
      openExternal: vi.fn(),
      openPath: vi.fn(),
      trashItem: vi.fn(),
      showItemInFolder: vi.fn(),
    },
  },
}));

function registerHarness() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const syncHandlers = new Map<string, (...args: unknown[]) => unknown>();

  registerDesktopIpc({
    handleIpc: (name: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(name, handler);
    },
    handleSyncIpc: (name: string, handler: (...args: unknown[]) => unknown) => {
      syncHandlers.set(name, handler);
    },
    normalizeExternalUrl: (url: string) => url,
    resolveTargetWindow: vi.fn(() => null),
    requireNonEmptyString: (value: string) => value,
    requireStringArray: (value: string[]) => value,
  });

  return { handlers, syncHandlers };
}

function createOversizedBase64Body() {
  const encodedLength = Math.ceil((MAX_DESKTOP_IPC_BODY_BYTES + 1) / 3) * 4;
  return `${'A'.repeat(encodedLength - 1)}=`;
}

function createOversizedClipboardImageDataUrl() {
  const encodedLength = Math.ceil((MAX_CLIPBOARD_IMAGE_DATA_URL_BYTES + 1) / 3) * 4;
  return `data:image/png;base64,${'A'.repeat(encodedLength - 1)}=`;
}

describe('desktop export ipc', () => {
  afterEach(() => {
    hoisted.resetLoadFileResult();
    hoisted.resetPrintToPDFResult();
  });

  it.each(['darwin', 'win32'] as const)(
    'uses the native shell reveal behavior on %s',
    async (platform) => {
      const shellImpl = {
        openPath: vi.fn(),
        showItemInFolder: vi.fn(),
      };
      const spawnDetached = vi.fn();

      await revealItemInFolder('/notesRoot/docs/readme.md', {
        platform,
        shellImpl,
        spawnDetached,
      });

      expect(shellImpl.showItemInFolder).toHaveBeenCalledWith('/notesRoot/docs/readme.md');
      expect(spawnDetached).not.toHaveBeenCalled();
    },
  );

  it('uses freedesktop DBus reveal once on Linux when available', async () => {
    const child = {
      once: vi.fn(),
      unref: vi.fn(),
    };
    const spawnDetached = vi.fn(() => child);
    const shellImpl = {
      openPath: vi.fn(),
      showItemInFolder: vi.fn(),
    };

    await revealItemInFolder('/notesRoot/docs/readme.md', {
      platform: 'linux',
      shellImpl,
      spawnDetached,
      envPath: '/usr/bin',
      exists: (candidatePath: string) =>
        candidatePath === '/usr/bin/gdbus' || candidatePath === '/usr/bin/nautilus',
    });

    expect(spawnDetached).toHaveBeenCalledTimes(1);
    expect(spawnDetached).toHaveBeenCalledWith(
      '/usr/bin/gdbus',
      [
        'call',
        '--session',
        '--dest',
        'org.freedesktop.FileManager1',
        '--object-path',
        '/org/freedesktop/FileManager1',
        '--method',
        'org.freedesktop.FileManager1.ShowItems',
        "['file:///notesRoot/docs/readme.md']",
        '',
      ],
      {
        detached: true,
        stdio: 'ignore',
      },
    );
    expect(child.unref).toHaveBeenCalledTimes(1);
    expect(shellImpl.showItemInFolder).not.toHaveBeenCalled();
  });

  it('falls back to a file manager selection command when DBus reveal fails', async () => {
    const firstHandlers = new Map<string, (...args: unknown[]) => void>();
    const firstChild = {
      once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        firstHandlers.set(event, handler);
        return firstChild;
      }),
      unref: vi.fn(),
    };
    const secondChild = {
      once: vi.fn(),
      unref: vi.fn(),
    };
    const spawnDetached = vi.fn()
      .mockReturnValueOnce(firstChild)
      .mockReturnValueOnce(secondChild);

    await revealItemInFolder('/notesRoot/docs/readme.md', {
      platform: 'linux',
      shellImpl: { openPath: vi.fn(), showItemInFolder: vi.fn() },
      spawnDetached,
      envPath: '/usr/bin',
      exists: (candidatePath: string) =>
        candidatePath === '/usr/bin/gdbus' || candidatePath === '/usr/bin/nautilus',
    });

    expect(spawnDetached).toHaveBeenCalledTimes(1);
    firstHandlers.get('exit')?.(1);

    expect(spawnDetached).toHaveBeenCalledTimes(2);
    expect(spawnDetached).toHaveBeenNthCalledWith(
      2,
      '/usr/bin/nautilus',
      ['--select', '/notesRoot/docs/readme.md'],
      { detached: true, stdio: 'ignore' },
    );
  });

  it('reveals the selected file in a new file manager window on Linux', async () => {
    const child = {
      once: vi.fn(),
      unref: vi.fn(),
    };
    const spawnDetached = vi.fn(() => child);
    const shellImpl = {
      openPath: vi.fn(),
      showItemInFolder: vi.fn(),
    };

    const options = {
      platform: 'linux',
      shellImpl,
      spawnDetached,
      envPath: '/usr/bin',
      exists: (candidatePath: string) => candidatePath === '/usr/bin/nautilus',
    } as const;
    await revealItemInFolder('/notesRoot/docs/readme.md', options);
    await revealItemInFolder('/notesRoot/docs/readme.md', options);

    expect(spawnDetached).toHaveBeenCalledTimes(2);
    expect(spawnDetached).toHaveBeenNthCalledWith(
      1,
      '/usr/bin/nautilus',
      ['--select', '/notesRoot/docs/readme.md'],
      {
        detached: true,
        stdio: 'ignore',
      },
    );
    expect(spawnDetached).toHaveBeenNthCalledWith(
      2,
      '/usr/bin/nautilus',
      ['--select', '/notesRoot/docs/readme.md'],
      {
        detached: true,
        stdio: 'ignore',
      },
    );
    expect(child.unref).toHaveBeenCalledTimes(2);
    expect(shellImpl.showItemInFolder).not.toHaveBeenCalled();
  });

  it('falls back to opening the containing folder when Linux file reveal exits unsuccessfully', async () => {
    const firstHandlers = new Map<string, (...args: unknown[]) => void>();
    const firstChild = {
      once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        firstHandlers.set(event, handler);
        return firstChild;
      }),
      unref: vi.fn(),
    };
    const secondChild = {
      once: vi.fn(),
      unref: vi.fn(),
    };
    const spawnDetached = vi
      .fn()
      .mockReturnValueOnce(firstChild)
      .mockReturnValueOnce(secondChild);
    const shellImpl = {
      openPath: vi.fn(),
      showItemInFolder: vi.fn(),
    };

    await revealItemInFolder('/notesRoot/docs/readme.md', {
      platform: 'linux',
      shellImpl,
      spawnDetached,
      envPath: '/usr/bin',
      exists: (candidatePath: string) => candidatePath === '/usr/bin/nautilus',
    });

    firstHandlers.get('exit')?.(1);

    expect(spawnDetached).toHaveBeenCalledTimes(2);
    expect(spawnDetached).toHaveBeenNthCalledWith(
      1,
      '/usr/bin/nautilus',
      ['--select', '/notesRoot/docs/readme.md'],
      {
        detached: true,
        stdio: 'ignore',
      },
    );
    expect(spawnDetached).toHaveBeenNthCalledWith(
      2,
      '/usr/bin/nautilus',
      ['--new-window', '/notesRoot/docs'],
      {
        detached: true,
        stdio: 'ignore',
      },
    );
    expect(shellImpl.openPath).not.toHaveBeenCalled();
  });

  it('falls back to xdg-open when Linux directory opening exits unsuccessfully', async () => {
    const firstHandlers = new Map<string, (...args: unknown[]) => void>();
    const firstChild = {
      once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        firstHandlers.set(event, handler);
        return firstChild;
      }),
      unref: vi.fn(),
    };
    const secondHandlers = new Map<string, (...args: unknown[]) => void>();
    const secondChild = {
      once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        secondHandlers.set(event, handler);
        return secondChild;
      }),
      unref: vi.fn(),
    };
    const thirdChild = {
      once: vi.fn(),
      unref: vi.fn(),
    };
    const spawnDetached = vi
      .fn()
      .mockReturnValueOnce(firstChild)
      .mockReturnValueOnce(secondChild)
      .mockReturnValueOnce(thirdChild);
    const shellImpl = {
      openPath: vi.fn(),
      showItemInFolder: vi.fn(),
    };

    await revealItemInFolder('/notesRoot/docs/readme.md', {
      platform: 'linux',
      shellImpl,
      spawnDetached,
      envPath: '/usr/bin',
      exists: (candidatePath: string) => candidatePath === '/usr/bin/nautilus',
    });

    firstHandlers.get('exit')?.(1);
    secondHandlers.get('exit')?.(1);

    expect(spawnDetached).toHaveBeenCalledTimes(3);
    expect(spawnDetached).toHaveBeenNthCalledWith(
      1,
      '/usr/bin/nautilus',
      ['--select', '/notesRoot/docs/readme.md'],
      {
        detached: true,
        stdio: 'ignore',
      },
    );
    expect(spawnDetached).toHaveBeenNthCalledWith(
      2,
      '/usr/bin/nautilus',
      ['--new-window', '/notesRoot/docs'],
      {
        detached: true,
        stdio: 'ignore',
      },
    );
    expect(spawnDetached).toHaveBeenNthCalledWith(
      3,
      'xdg-open',
      ['/notesRoot/docs'],
      {
        detached: true,
        stdio: 'ignore',
      },
    );
    expect(shellImpl.openPath).not.toHaveBeenCalled();
  });

  it('opens the containing folder on Linux when no supported file manager is available', async () => {
    const child = {
      once: vi.fn(),
      unref: vi.fn(),
    };
    const spawnDetached = vi.fn(() => child);
    const shellImpl = {
      openPath: vi.fn(),
      showItemInFolder: vi.fn(),
    };

    await revealItemInFolder('/notesRoot/docs/readme.md', {
      platform: 'linux',
      shellImpl,
      spawnDetached,
      envPath: '/usr/bin',
      exists: () => false,
    });

    expect(spawnDetached).toHaveBeenCalledWith('xdg-open', ['/notesRoot/docs'], {
      detached: true,
      stdio: 'ignore',
    });
    expect(shellImpl.showItemInFolder).not.toHaveBeenCalled();
  });

  it('detects attempts to move a directory into its own child path', () => {
    expect(isPathInsideDirectory('/notesRoot/docs', '/notesRoot/docs/nested')).toBe(true);
    expect(isPathInsideDirectory('/notesRoot/docs', '/notesRoot/docs')).toBe(false);
    expect(isPathInsideDirectory('/notesRoot/docs', '/notesRoot/docs-archive')).toBe(false);
    expect(isPathInsideDirectory('/notesRoot/docs', '/notesRoot/other')).toBe(false);
  });

  it('writes text to the native clipboard synchronously', () => {
    const { syncHandlers } = registerHarness();

    expect(syncHandlers.get('desktop:clipboard:write-text-sync')?.({}, 'fresh clipboard text')).toBe(true);
    expect(electron.clipboard.writeText).toHaveBeenCalledWith('fresh clipboard text');
  });

  it('writes data URL images to the native clipboard', async () => {
    const { handlers } = registerHarness();
    const imageDataUrl = 'data:image/png;base64,eA==';

    await handlers.get('desktop:clipboard:write-image')?.({}, imageDataUrl);

    expect(electron.nativeImage.createFromDataURL).toHaveBeenCalledWith(imageDataUrl);
    expect(electron.clipboard.writeImage).toHaveBeenCalledTimes(1);
  });

  it('reads bounded native clipboard images as PNG data URLs', async () => {
    const { handlers } = registerHarness();
    const pngBytes = Buffer.from([1, 2, 3, 4]);
    vi.mocked(electron.clipboard.readImage).mockReturnValueOnce({
      isEmpty: () => false,
      toPNG: () => pngBytes,
    } as Electron.NativeImage);

    await expect(handlers.get('desktop:clipboard:read-image')?.({})).resolves.toBe(
      `data:image/png;base64,${pngBytes.toString('base64')}`,
    );
  });

  it('returns null for an empty native clipboard image', async () => {
    const { handlers } = registerHarness();
    vi.mocked(electron.clipboard.readImage).mockReturnValueOnce({
      isEmpty: () => true,
    } as Electron.NativeImage);

    await expect(handlers.get('desktop:clipboard:read-image')?.({})).resolves.toBeNull();
  });

  it('rejects oversized native clipboard images before base64 encoding', async () => {
    const { handlers } = registerHarness();
    vi.mocked(electron.clipboard.readImage).mockReturnValueOnce({
      isEmpty: () => false,
      toPNG: () => Buffer.alloc(MAX_CLIPBOARD_IMAGE_DATA_URL_BYTES + 1),
    } as Electron.NativeImage);

    await expect(
      handlers.get('desktop:clipboard:read-image')?.({}),
    ).rejects.toThrow('Clipboard image is too large.');
  });

  it('rejects oversized clipboard image data URLs before native decoding', async () => {
    const { handlers } = registerHarness();
    vi.mocked(electron.nativeImage.createFromDataURL).mockClear();

    await expect(
      handlers.get('desktop:clipboard:write-image')?.({}, createOversizedClipboardImageDataUrl()),
    ).rejects.toThrow('Clipboard image data URL is too large.');

    expect(electron.nativeImage.createFromDataURL).not.toHaveBeenCalled();
  });

  it('opens directories on Linux with an explicit file manager command', async () => {
    const child = {
      once: vi.fn(),
      unref: vi.fn(),
    };
    const spawnDetached = vi.fn(() => child);
    const shellImpl = {
      openPath: vi.fn(),
      showItemInFolder: vi.fn(),
    };

    await openPathInFileManager('/notesRoot/.vlaina/app/themes', {
      platform: 'linux',
      shellImpl,
      spawnDetached,
      envPath: '/usr/bin',
      exists: (candidatePath: string) => candidatePath === '/usr/bin/nautilus',
    });

    expect(spawnDetached).toHaveBeenCalledWith('/usr/bin/nautilus', ['--new-window', '/notesRoot/.vlaina/app/themes'], {
      detached: true,
      stdio: 'ignore',
    });
    expect(shellImpl.openPath).not.toHaveBeenCalled();
    expect(child.unref).toHaveBeenCalledTimes(1);
  });

  it('requests a new Dolphin window when opening directories on Linux', async () => {
    const child = {
      once: vi.fn(),
      unref: vi.fn(),
    };
    const spawnDetached = vi.fn(() => child);
    const shellImpl = {
      openPath: vi.fn(),
      showItemInFolder: vi.fn(),
    };

    await openPathInFileManager('/notesRoot', {
      platform: 'linux',
      shellImpl,
      spawnDetached,
      envPath: '/usr/bin',
      exists: (candidatePath: string) => candidatePath === '/usr/bin/dolphin',
    });

    expect(spawnDetached).toHaveBeenCalledWith('/usr/bin/dolphin', ['--new-window', '/notesRoot'], {
      detached: true,
      stdio: 'ignore',
    });
    expect(shellImpl.openPath).not.toHaveBeenCalled();
  });

  it('uses the native shell open path behavior outside Linux', async () => {
    const shellImpl = {
      openPath: vi.fn().mockResolvedValue(''),
      showItemInFolder: vi.fn(),
    };

    await openPathInFileManager('/notesRoot/.vlaina/app/themes', {
      platform: 'darwin',
      shellImpl,
      spawnDetached: vi.fn(),
    });

    expect(shellImpl.openPath).toHaveBeenCalledWith('/notesRoot/.vlaina/app/themes');
  });

  it('surfaces native shell open path errors outside Linux', async () => {
    const shellImpl = {
      openPath: vi.fn().mockResolvedValue('Cannot open path'),
      showItemInFolder: vi.fn(),
    };

    await expect(openPathInFileManager('/notesRoot/.vlaina/app/themes', {
      platform: 'darwin',
      shellImpl,
      spawnDetached: vi.fn(),
    })).rejects.toThrow('Cannot open path');
  });

  it('rejects invalid AI provider request headers before fetch', async () => {
    const { handlers } = registerHarness();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const hostileHeaderValue = {
      toString() {
        throw new Error('header coercion');
      },
    };

    await expect(
      handlers.get('desktop:ai-provider:request:start')?.(
        { sender: { isDestroyed: () => false, send: vi.fn() } },
        'request-headers',
        {
          url: 'https://api.example.com/v1/chat/completions',
          method: 'POST',
          headers: {
            'Authorization\nInjected': 'Bearer token',
          },
        },
      ),
    ).rejects.toThrow('Invalid AI provider request header');

    await expect(
      handlers.get('desktop:ai-provider:request:start')?.(
        { sender: { isDestroyed: () => false, send: vi.fn() } },
        'request-header-value',
        {
          url: 'https://api.example.com/v1/chat/completions',
          method: 'POST',
          headers: {
            Authorization: 'Bearer token\r\nInjected: value',
          },
        },
      ),
    ).rejects.toThrow('Invalid AI provider request header value');

    await expect(
      handlers.get('desktop:ai-provider:request:start')?.(
        { sender: { isDestroyed: () => false, send: vi.fn() } },
        'request-long-header',
        {
          url: 'https://api.example.com/v1/chat/completions',
          method: 'POST',
          headers: {
            ['X'.repeat(257)]: 'value',
          },
        },
      ),
    ).rejects.toThrow('Invalid AI provider request header');

    await expect(
      handlers.get('desktop:ai-provider:request:start')?.(
        { sender: { isDestroyed: () => false, send: vi.fn() } },
        'request-long-header-value',
        {
          url: 'https://api.example.com/v1/chat/completions',
          method: 'POST',
          headers: {
            Authorization: 'x'.repeat((16 * 1024) + 1),
          },
        },
      ),
    ).rejects.toThrow('Invalid AI provider request header value');

    await expect(
      handlers.get('desktop:ai-provider:request:start')?.(
        { sender: { isDestroyed: () => false, send: vi.fn() } },
        'request-hostile-header-value',
        {
          url: 'https://api.example.com/v1/chat/completions',
          method: 'POST',
          headers: {
            Authorization: hostileHeaderValue,
          },
        },
      ),
    ).rejects.toThrow('Invalid AI provider request header value');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unsafe AI provider request URLs before fetch', async () => {
    const { handlers } = registerHarness();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const sender = { isDestroyed: () => false, send: vi.fn() };
    const startRequest = handlers.get('desktop:ai-provider:request:start');

    await expect(startRequest?.({ sender }, 'request-ambiguous-url', {
      url: 'https:api.example.com/v1/chat/completions',
      method: 'POST',
    })).rejects.toThrow('AI provider request URL is not supported.');

    await expect(startRequest?.({ sender }, 'request-credential-url', {
      url: 'https://user:pass@api.example.com/v1/chat/completions',
      method: 'POST',
    })).rejects.toThrow('AI provider request URL is not supported.');

    await expect(startRequest?.({ sender }, 'request-backslash-url', {
      url: 'https://api.example.com\\@internal.test/v1/chat/completions',
      method: 'POST',
    })).rejects.toThrow('AI provider request URL is not supported.');

    await expect(startRequest?.({ sender }, 'request-bidi-url', {
      url: 'https://api.example.com/\u202Ecod.exe',
      method: 'POST',
    })).rejects.toThrow('AI provider request URL is not supported.');

    await expect(startRequest?.({ sender }, 'request-oversized-url', {
      url: ' '.repeat(4097),
      method: 'POST',
    })).rejects.toThrow('AI provider request URL is not supported.');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unsafe AI provider request ids before opening stream channels', async () => {
    const { handlers } = registerHarness();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const hostileRequestId = {
      toString() {
        throw new Error('request id coercion');
      },
    };

    await expect(
      handlers.get('desktop:ai-provider:request:start')?.(
        { sender: { isDestroyed: () => false, send: vi.fn() } },
        'request\nother',
        { url: 'https://api.example.com/v1/chat/completions', method: 'POST' },
      ),
    ).rejects.toThrow('safe channel characters');

    await expect(
      handlers.get('desktop:ai-provider:request:start')?.(
        { sender: { isDestroyed: () => false, send: vi.fn() } },
        hostileRequestId,
        { url: 'https://api.example.com/v1/chat/completions', method: 'POST' },
      ),
    ).rejects.toThrow('safe channel characters');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes base64 AI provider request bodies to fetch as bytes', async () => {
    const { handlers } = registerHarness();
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const sender = {
      isDestroyed: () => false,
      send: vi.fn(),
    };

    await handlers.get('desktop:ai-provider:request:start')?.(
      { sender },
      'request-bytes',
      {
        url: 'https://api.example.com/v1/images/edits',
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data; boundary=test' },
        bodyBase64: Buffer.from('multipart-body').toString('base64'),
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/images/edits',
      expect.objectContaining({
        body: Buffer.from('multipart-body'),
      }),
    );
  });

  it('rejects oversized base64 AI provider request bodies before fetch', async () => {
    const { handlers } = registerHarness();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      handlers.get('desktop:ai-provider:request:start')?.(
        { sender: { isDestroyed: () => false, send: vi.fn() } },
        'request-oversized-base64',
        {
          url: 'https://api.example.com/v1/images/edits',
          method: 'POST',
          bodyBase64: createOversizedBase64Body(),
        },
      ),
    ).rejects.toThrow('AI provider request body is too large.');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects oversized text AI provider request bodies before fetch', async () => {
    const { handlers } = registerHarness();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const hostileBody = {
      toString() {
        throw new Error('body coercion');
      },
    };
    const hostileMethod = {
      toString() {
        throw new Error('method coercion');
      },
    };

    await expect(
      handlers.get('desktop:ai-provider:request:start')?.(
        { sender: { isDestroyed: () => false, send: vi.fn() } },
        'request-oversized-text',
        {
          url: 'https://api.example.com/v1/chat/completions',
          method: 'POST',
          body: '€'.repeat(Math.floor(MAX_DESKTOP_IPC_BODY_BYTES / 3) + 1),
        },
      ),
    ).rejects.toThrow('AI provider request body is too large.');

    await expect(
      handlers.get('desktop:ai-provider:request:start')?.(
        { sender: { isDestroyed: () => false, send: vi.fn() } },
        'request-hostile-body',
        {
          url: 'https://api.example.com/v1/chat/completions',
          method: 'POST',
          body: hostileBody,
        },
      ),
    ).rejects.toThrow('Invalid AI provider request body.');

    await expect(
      handlers.get('desktop:ai-provider:request:start')?.(
        { sender: { isDestroyed: () => false, send: vi.fn() } },
        'request-hostile-method',
        {
          url: 'https://api.example.com/v1/chat/completions',
          method: hostileMethod,
        },
      ),
    ).rejects.toThrow('Unsupported AI provider request method');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('splits large AI provider response chunks before forwarding them over IPC', async () => {
    const { handlers } = registerHarness();
    const responseChunk = new Uint8Array(MAX_AI_PROVIDER_RESPONSE_IPC_CHUNK_BYTES + 3);
    responseChunk.set([1, 2, 3], MAX_AI_PROVIDER_RESPONSE_IPC_CHUNK_BYTES);
    const fetchMock = vi.fn(async () => new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(responseChunk);
          controller.close();
        },
      }),
      { status: 200, statusText: 'OK' },
    ));
    vi.stubGlobal('fetch', fetchMock);
    const sender = {
      isDestroyed: () => false,
      send: vi.fn(),
    };

    await expect(handlers.get('desktop:ai-provider:request:start')?.(
      { sender },
      'request-large-response-chunk',
      {
        url: 'https://api.example.com/v1/chat/completions',
        method: 'POST',
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [] }),
      },
    )).resolves.toMatchObject({
      status: 200,
      statusText: 'OK',
    });

    await vi.waitFor(() => expect(sender.send.mock.calls.some(
      ([channel]) => channel === 'desktop:ai-provider:request:request-large-response-chunk:done',
    )).toBe(true));
    const forwardedChunks = sender.send.mock.calls
      .filter(([channel]) => channel === 'desktop:ai-provider:request:request-large-response-chunk:chunk')
      .map(([, payload]) => payload);

    expect(forwardedChunks).toHaveLength(2);
    expect(forwardedChunks[0]).toHaveLength(MAX_AI_PROVIDER_RESPONSE_IPC_CHUNK_BYTES);
    expect(forwardedChunks[1]).toEqual([1, 2, 3]);
  });

  it('stops AI provider response streams when the total body exceeds the limit', async () => {
    const { handlers } = registerHarness();
    const reader = {
      read: vi.fn()
        .mockResolvedValueOnce({
          done: false,
          value: { byteLength: MAX_AI_PROVIDER_RESPONSE_BODY_BYTES + 1 },
        })
        .mockResolvedValueOnce({ done: true }),
      cancel: vi.fn(async () => undefined),
      releaseLock: vi.fn(),
    };
    const fetchMock = vi.fn(async () => ({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      body: {
        getReader: () => reader,
      },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const sender = {
      isDestroyed: () => false,
      send: vi.fn(),
    };

    await expect(handlers.get('desktop:ai-provider:request:start')?.(
      { sender },
      'request-oversized-response',
      {
        url: 'https://api.example.com/v1/chat/completions',
        method: 'POST',
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [] }),
      },
    )).resolves.toMatchObject({
      status: 200,
      statusText: 'OK',
    });

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith(
      'desktop:ai-provider:request:request-oversized-response:error',
      { message: 'AI provider response body is too large.' },
    ));
    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('retries quickly failed AI provider transport requests once', async () => {
    vi.useFakeTimers();
    try {
      const { handlers } = registerHarness();
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(new Response('{}', { status: 200, statusText: 'OK' }));
      vi.stubGlobal('fetch', fetchMock);
      const sender = {
        isDestroyed: () => false,
        send: vi.fn(),
      };

      const request = handlers.get('desktop:ai-provider:request:start')?.(
        { sender },
        'request-retry',
        {
          url: 'https://api.example.com/v1/images/generations',
          method: 'POST',
          body: JSON.stringify({ model: 'gpt-image-1', prompt: 'test' }),
        },
      ) as Promise<unknown> | undefined;

      await vi.advanceTimersByTimeAsync(300);

      await expect(request).resolves.toMatchObject({
        status: 200,
        statusText: 'OK',
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries abort-shaped AI provider transport failures when the request was not cancelled', async () => {
    vi.useFakeTimers();
    try {
      const { handlers } = registerHarness();
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new DOMException('upstream reset', 'AbortError'))
        .mockResolvedValueOnce(new Response('{}', { status: 200, statusText: 'OK' }));
      vi.stubGlobal('fetch', fetchMock);
      const sender = {
        isDestroyed: () => false,
        send: vi.fn(),
      };

      const request = handlers.get('desktop:ai-provider:request:start')?.(
        { sender },
        'request-abort-shaped-retry',
        {
          url: 'https://api.example.com/v1/chat/completions',
          method: 'POST',
          body: JSON.stringify({ model: 'gpt-4o-mini', messages: [] }),
        },
      ) as Promise<unknown> | undefined;

      await vi.advanceTimersByTimeAsync(300);

      await expect(request).resolves.toMatchObject({
        status: 200,
        statusText: 'OK',
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces a clear custom provider retry hint after transport retries fail', async () => {
    vi.useFakeTimers();
    try {
      const { handlers } = registerHarness();
      const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
      vi.stubGlobal('fetch', fetchMock);
      const sender = {
        isDestroyed: () => false,
        send: vi.fn(),
      };

      const request = handlers.get('desktop:ai-provider:request:start')?.(
        { sender },
        'request-retry-fail',
        {
          url: 'https://api.example.com/v1/images/generations',
          method: 'POST',
          body: JSON.stringify({ model: 'gpt-image-1', prompt: 'test' }),
        },
      ) as Promise<unknown> | undefined;
      request?.catch(() => undefined);

      await vi.advanceTimersByTimeAsync(300);

      await expect(request).rejects.toThrow('连接到自定义渠道失败，可能是上游或网络瞬时不可达，可重试。');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry slower AI provider transport failures', async () => {
    vi.useFakeTimers();
    try {
      const { handlers } = registerHarness();
      const fetchMock = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2100));
        throw new TypeError('fetch failed');
      });
      vi.stubGlobal('fetch', fetchMock);
      const sender = {
        isDestroyed: () => false,
        send: vi.fn(),
      };

      const request = handlers.get('desktop:ai-provider:request:start')?.(
        { sender },
        'request-slow-fail',
        {
          url: 'https://api.example.com/v1/images/generations',
          method: 'POST',
          body: JSON.stringify({ model: 'gpt-image-1', prompt: 'test' }),
        },
      ) as Promise<unknown> | undefined;
      request?.catch(() => undefined);

      await vi.advanceTimersByTimeAsync(2100);

      await expect(request).rejects.toThrow('连接到自定义渠道失败，可能是上游或网络瞬时不可达，可重试。');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects AI provider request start promptly when fetch ignores cancellation', async () => {
    const { handlers } = registerHarness();
    const fetchMock = vi.fn((_url, init) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return new Promise(() => undefined);
    });
    vi.stubGlobal('fetch', fetchMock);
    const sender = {
      isDestroyed: () => false,
      send: vi.fn(),
    };

    const request = handlers.get('desktop:ai-provider:request:start')?.(
      { sender },
      'request-ignores-abort',
      { url: 'https://api.example.com/v1/chat/completions', method: 'POST' },
    ) as Promise<unknown> | undefined;
    request?.catch(() => undefined);

    await Promise.resolve();
    await handlers.get('desktop:ai-provider:request:cancel')?.({}, 'request-ignores-abort');

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('does not let an old AI provider stream cleanup or abort event affect a newer request with the same id', async () => {
    const { handlers } = registerHarness();
    const signals: AbortSignal[] = [];
    const cancelFirstStream = vi.fn();
    const firstStream = new ReadableStream<Uint8Array>({
      start() {
      },
      cancel() {
        cancelFirstStream();
      },
    });
    const secondStream = new ReadableStream<Uint8Array>({
      start() {
      },
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (_url: string, init: RequestInit) => {
        signals.push(init.signal as AbortSignal);
        return new Response(firstStream);
      })
      .mockImplementationOnce(async (_url: string, init: RequestInit) => {
        signals.push(init.signal as AbortSignal);
        return new Response(secondStream);
      });
    vi.stubGlobal('fetch', fetchMock);
    const sender = {
      isDestroyed: () => false,
      send: vi.fn(),
    };

    await handlers.get('desktop:ai-provider:request:start')?.(
      { sender },
      'request-1',
      { url: 'https://api.example.com/v1/chat/completions', method: 'POST' },
    );
    await handlers.get('desktop:ai-provider:request:start')?.(
      { sender },
      'request-1',
      { url: 'https://api.example.com/v1/chat/completions', method: 'POST' },
    );
    await Promise.resolve();
    await Promise.resolve();

    await handlers.get('desktop:ai-provider:request:cancel')?.({}, 'request-1');

    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(true);
    expect(cancelFirstStream).toHaveBeenCalledTimes(1);
    expect(sender.send).not.toHaveBeenCalledWith(
      'desktop:ai-provider:request:request-1:error',
      { message: 'Aborted' },
    );
  });

  it('does not emit stale AI provider reader failures after cancellation', async () => {
    const { handlers } = registerHarness();
    let rejectRead: ((error: Error) => void) | undefined;
    let resolveReadStarted: (() => void) | undefined;
    const readStarted = new Promise<void>((resolve) => {
      resolveReadStarted = resolve;
    });
    const reader = {
      read: vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>((_resolve, reject) => {
        rejectRead = reject;
        resolveReadStarted?.();
      })),
      cancel: vi.fn(async () => {
        rejectRead?.(new Error('native reader failed after abort'));
      }),
      releaseLock: vi.fn(),
    };
    const fetchMock = vi.fn(async () => ({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      body: {
        getReader: () => reader,
      },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const sender = {
      isDestroyed: () => false,
      send: vi.fn(),
    };

    await handlers.get('desktop:ai-provider:request:start')?.(
      { sender },
      'request-reader-abort',
      { url: 'https://api.example.com/v1/chat/completions', method: 'POST' },
    );
    await readStarted;
    await handlers.get('desktop:ai-provider:request:cancel')?.({}, 'request-reader-abort');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sender.send).not.toHaveBeenCalledWith(
      'desktop:ai-provider:request:request-reader-abort:error',
      { message: 'Aborted' },
    );
    expect(sender.send).not.toHaveBeenCalledWith(
      'desktop:ai-provider:request:request-reader-abort:error',
      { message: 'native reader failed after abort' },
    );
  });

  it('releases AI provider stream readers promptly when read and cancel both ignore abort', async () => {
    const { handlers } = registerHarness();
    const fakeReader = {
      read: vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined)),
      cancel: vi.fn(() => new Promise<void>(() => undefined)),
      releaseLock: vi.fn(),
    };
    const fetchMock = vi.fn(async () => ({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      body: {
        getReader: () => fakeReader,
      },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const sender = {
      isDestroyed: () => false,
      send: vi.fn(),
    };

    await handlers.get('desktop:ai-provider:request:start')?.(
      { sender },
      'request-reader-hangs',
      { url: 'https://api.example.com/v1/chat/completions', method: 'POST' },
    );
    await vi.waitFor(() => expect(fakeReader.read).toHaveBeenCalled());
    await handlers.get('desktop:ai-provider:request:cancel')?.({}, 'request-reader-hangs');

    await vi.waitFor(() => expect(fakeReader.releaseLock).toHaveBeenCalledTimes(1));
    expect(fakeReader.cancel).toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalledWith(
      'desktop:ai-provider:request:request-reader-hangs:error',
      { message: 'Aborted' },
    );
  });

  it('renders PDF HTML through a temporary file instead of a data URL', async () => {
    hoisted.windows.length = 0;
    hoisted.resetPrintToPDFResult();
    const { handlers } = registerHarness();

    await expect(
      handlers.get('desktop:export:html-to-pdf')?.({}, '<!doctype html><html><body>Export</body></html>', {
        pageSize: 'A4',
      }),
    ).resolves.toEqual(new Uint8Array([1, 2, 3]));

    const win = hoisted.windows[0];
    expect(win.options.webPreferences).toMatchObject({
      contextIsolation: true,
      javascript: false,
      nodeIntegration: false,
      sandbox: true,
    });
    expect(String((win.options.webPreferences as Record<string, unknown>).partition)).toMatch(/^vlaina-export-/);
    expect(win.loadFile).toHaveBeenCalledTimes(1);
    const loadedFilePath = String(win.loadFile.mock.calls[0]?.[0]);
    expect(path.basename(loadedFilePath)).toBe('export.html');
    expect(path.basename(path.dirname(loadedFilePath))).toMatch(/^vlaina-export-/);
    expect(path.dirname(path.dirname(loadedFilePath))).toBe(path.resolve(hoisted.tempRoot));
    expect(win.loadURL).not.toHaveBeenCalled();
    expect(win.webContents.printToPDF).toHaveBeenCalledWith({
      landscape: false,
      pageSize: 'A4',
      printBackground: true,
      margins: {
        marginType: 'custom',
        top: 0.4,
        bottom: 0.45,
        left: 0.45,
        right: 0.45,
      },
    });
    expect(win.destroy).toHaveBeenCalledTimes(1);
  });

  it('times out and destroys the hidden PDF window when document loading stalls', async () => {
    hoisted.windows.length = 0;
    hoisted.setLoadFileResult(new Promise<void>(() => {}));
    const { handlers } = registerHarness();

    await expect(
      handlers.get('desktop:export:html-to-pdf')?.({}, '<!doctype html><html><body>Export</body></html>', {}),
    ).rejects.toThrow('Timed out loading PDF export HTML');

    expect(hoisted.windows[0].destroy).toHaveBeenCalledTimes(1);
  });

  it('times out and destroys the hidden PDF window when PDF generation stalls', async () => {
    hoisted.windows.length = 0;
    hoisted.setPrintToPDFResult(new Promise<Uint8Array>(() => {}));
    const { handlers } = registerHarness();

    await expect(
      handlers.get('desktop:export:html-to-pdf')?.({}, '<!doctype html><html><body>Export</body></html>', {}),
    ).rejects.toThrow('Timed out generating PDF export');

    expect(hoisted.windows[0].destroy).toHaveBeenCalledTimes(1);
  });

  it('blocks PDF export windows from loading local files or remote resources', async () => {
    hoisted.windows.length = 0;
    hoisted.resetPrintToPDFResult();
    const { handlers } = registerHarness();

    await handlers.get('desktop:export:html-to-pdf')?.(
      {},
      '<!doctype html><html><body><img src="file:///home/alice/secret.png"><img src="https://example.com/pixel.png"></body></html>',
      { pageSize: 'A4' },
    );

    const win = hoisted.windows[0];
    const loadedFilePath = String(win.loadFile.mock.calls[0]?.[0]);
    const requestListener = win.webContents.session.webRequest.onBeforeRequest.mock.calls[0]?.[1];
    expect(win.webContents.session.webRequest.onBeforeRequest).toHaveBeenCalledWith(
      { urls: ['file://*/*', 'http://*/*', 'https://*/*'] },
      expect.any(Function),
    );
    const windowOpenHandler = win.webContents.setWindowOpenHandler.mock.calls[0]?.[0];
    expect(windowOpenHandler({ url: 'https://example.com' })).toEqual({
      action: 'deny',
    });

    const allowDocument = vi.fn();
    requestListener({ url: pathToFileURL(loadedFilePath).toString() }, allowDocument);
    expect(allowDocument).toHaveBeenCalledWith({ cancel: false });

    const blockLocal = vi.fn();
    requestListener({ url: 'file:///home/alice/secret.png' }, blockLocal);
    expect(blockLocal).toHaveBeenCalledWith({ cancel: true });

    const blockRemote = vi.fn();
    requestListener({ url: 'https://example.com/pixel.png' }, blockRemote);
    expect(blockRemote).toHaveBeenCalledWith({ cancel: true });
  });

  it('rejects oversized PDF export HTML before creating a render window', async () => {
    hoisted.windows.length = 0;
    const byteLengthSpy = vi.spyOn(Buffer, 'byteLength').mockReturnValueOnce(MAX_DESKTOP_IPC_BODY_BYTES + 1);
    const { handlers } = registerHarness();

    try {
      await expect(
        handlers.get('desktop:export:html-to-pdf')?.({}, '<!doctype html><html></html>', {
          pageSize: 'A4',
        }),
      ).rejects.toThrow('PDF export HTML is too large.');
    } finally {
      byteLengthSpy.mockRestore();
    }

    expect(hoisted.windows).toHaveLength(0);
  });

  it('rejects oversized PDF export output before materializing the IPC response', async () => {
    hoisted.windows.length = 0;
    hoisted.setPrintToPDFResult({ byteLength: MAX_DESKTOP_IPC_BODY_BYTES + 1 });
    const { handlers } = registerHarness();

    try {
      await expect(
        handlers.get('desktop:export:html-to-pdf')?.({}, '<!doctype html><html><body>Export</body></html>', {
          pageSize: 'A4',
        }),
      ).rejects.toThrow('PDF export output is too large.');
    } finally {
      hoisted.resetPrintToPDFResult();
    }

    const win = hoisted.windows[0];
    expect(win.loadFile).toHaveBeenCalledTimes(1);
    expect(win.destroy).toHaveBeenCalledTimes(1);
  });
});
