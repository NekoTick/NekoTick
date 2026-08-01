import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWindowManager } from '../../electron/windowManager.mjs';

type Listener = (...args: unknown[]) => void;

const hoisted = vi.hoisted(() => {
  const windows: MockBrowserWindow[] = [];
  let nextWindowId = 1;
  let userDataPath = '';

  class MockWebContents {
    id = nextWindowId * 10;
    listeners = new Map<string, Listener[]>();
    destroyed = false;
    send = vi.fn();
    setWindowOpenHandler = vi.fn();

    isDestroyed() {
      return this.destroyed;
    }

    once(eventName: string, listener: Listener) {
      const onceListener: Listener = (...args) => {
        this.removeListener(eventName, onceListener);
        listener(...args);
      };
      this.on(eventName, onceListener);
    }

    on(eventName: string, listener: Listener) {
      this.listeners.set(eventName, [...(this.listeners.get(eventName) ?? []), listener]);
    }

    removeListener(eventName: string, listener: Listener) {
      this.listeners.set(
        eventName,
        (this.listeners.get(eventName) ?? []).filter((item) => item !== listener),
      );
    }

    emit(eventName: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(eventName) ?? []) {
        listener(...args);
      }
    }
  }

  class MockBrowserWindow {
    id = nextWindowId++;
    webContents = new MockWebContents();
    listeners = new Map<string, Listener[]>();
    options: Record<string, unknown>;
    bounds = { width: 980, height: 640 };
    normalBounds = { width: 980, height: 640 };
    maximized = false;
    minimized = false;
    show = vi.fn();
    focus = vi.fn();
    close = vi.fn();
    reload = vi.fn();
    loadURL = vi.fn(async () => undefined);
    loadFile = vi.fn(async () => undefined);
    maximize = vi.fn(() => {
      this.maximized = true;
    });
    destroyed = false;

    constructor(options: Record<string, unknown> = {}) {
      this.options = options;
      this.bounds = {
        width: Number(options.width ?? 980),
        height: Number(options.height ?? 640),
      };
      this.normalBounds = { ...this.bounds };
      windows.push(this);
    }

    isDestroyed() {
      return this.destroyed;
    }

    once(eventName: string, listener: Listener) {
      const onceListener: Listener = (...args) => {
        this.removeListener(eventName, onceListener);
        listener(...args);
      };
      this.on(eventName, onceListener);
    }

    on(eventName: string, listener: Listener) {
      this.listeners.set(eventName, [...(this.listeners.get(eventName) ?? []), listener]);
    }

    removeListener(eventName: string, listener: Listener) {
      this.listeners.set(
        eventName,
        (this.listeners.get(eventName) ?? []).filter((item) => item !== listener),
      );
    }

    emit(eventName: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(eventName) ?? []) {
        listener(...args);
      }
    }

    getBounds() {
      return this.bounds;
    }

    getNormalBounds() {
      return this.normalBounds;
    }

    isMaximized() {
      return this.maximized;
    }

    isFullScreen() {
      return false;
    }

    isMinimized() {
      return this.minimized;
    }
  }

  return {
    MockBrowserWindow,
    windows,
    get userDataPath() {
      return userDataPath;
    },
    setUserDataPath(nextUserDataPath: string) {
      userDataPath = nextUserDataPath;
    },
    reset() {
      windows.length = 0;
      nextWindowId = 1;
    },
  };
});

vi.mock('electron', () => ({
  default: {
    app: {
      getPath: vi.fn(() => hoisted.userDataPath),
    },
    screen: {
      getPrimaryDisplay: vi.fn(() => ({
        workAreaSize: { width: 1600, height: 900 },
      })),
    },
    BrowserWindow: Object.assign(hoisted.MockBrowserWindow, {
      fromWebContents: vi.fn((webContents) =>
        hoisted.windows.find((window) => window.webContents === webContents) ?? null
      ),
      getAllWindows: vi.fn(() => hoisted.windows),
      getFocusedWindow: vi.fn(() => null),
    }),
  },
}));

function createHarness(options: {
  isDevelopment?: boolean;
  beforeRendererReload?: () => Promise<void>;
} = {}) {
  const manager = createWindowManager({
    rendererDevUrl: 'http://localhost:3000',
    appIconPath: 'icon.png',
    isDevelopment: () => options.isDevelopment ?? true,
    openExternalIfAllowed: vi.fn(),
    isTrustedRendererUrl: vi.fn(() => true),
    beforeRendererReload: options.beforeRendererReload,
  });

  return manager.createMainWindow() as unknown as InstanceType<typeof hoisted.MockBrowserWindow>;
}

function createIpcHarness() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const manager = createWindowManager({
    rendererDevUrl: 'http://localhost:3000',
    appIconPath: 'icon.png',
    isDevelopment: () => true,
    openExternalIfAllowed: vi.fn(),
    isTrustedRendererUrl: vi.fn(() => true),
  });

  manager.registerWindowIpc((name, handler) => {
    handlers.set(name, handler);
  });

  return { handlers };
}

describe('window manager reveal timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hoisted.reset();
    hoisted.setUserDataPath(fs.mkdtempSync(path.join(os.tmpdir(), 'vlaina-window-manager-test-')));
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(hoisted.userDataPath, { recursive: true, force: true });
    hoisted.setUserDataPath('');
  });

  it('waits for ready-to-show after the renderer reports startup ready', () => {
    const window = createHarness();

    window.webContents.emit('ipc-message', {}, 'desktop:startup-ready');
    expect(window.show).not.toHaveBeenCalled();

    window.emit('ready-to-show');

    expect(window.show).toHaveBeenCalledTimes(1);
    expect(window.focus).toHaveBeenCalledTimes(1);
  });

  it('keeps the did-finish-load fallback when ready-to-show is delayed', () => {
    const window = createHarness();

    window.webContents.emit('ipc-message', {}, 'desktop:startup-ready');
    window.webContents.emit('did-finish-load');
    vi.advanceTimersByTime(2999);
    expect(window.show).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(window.show).toHaveBeenCalledTimes(1);
  });

  it('reveals the window after a bounded fallback when startup ready never arrives', () => {
    const window = createHarness();

    window.webContents.emit('did-finish-load');
    vi.advanceTimersByTime(2999);
    expect(window.show).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(window.show).toHaveBeenCalledTimes(1);
    expect(window.focus).toHaveBeenCalledTimes(1);
  });

  it('reveals the window after a hard deadline when the renderer never finishes loading', () => {
    const window = createHarness();

    vi.advanceTimersByTime(9999);
    expect(window.show).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(window.show).toHaveBeenCalledTimes(1);
    expect(window.focus).toHaveBeenCalledTimes(1);
  });

  it('reveals user-created new windows immediately while renderer content loads', () => {
    const { handlers } = createIpcHarness();

    handlers.get('desktop:window:create')?.({}, { viewMode: 'chat' });
    const window = hoisted.windows[0];

    expect(window.show).toHaveBeenCalledTimes(1);
    expect(window.focus).toHaveBeenCalledTimes(1);
    expect(window.loadURL).toHaveBeenCalledWith('http://localhost:3000/?newWindow=true&viewMode=chat');
  });

  it('flushes recovery data before reloading a crashed production renderer', async () => {
    let finishFlush: (() => void) | undefined;
    const beforeRendererReload = vi.fn(() => new Promise<void>((resolve) => {
      finishFlush = resolve;
    }));
    const window = createHarness({ isDevelopment: false, beforeRendererReload });

    window.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
    await Promise.resolve();
    expect(beforeRendererReload).toHaveBeenCalledTimes(1);
    expect(window.reload).not.toHaveBeenCalled();

    finishFlush?.();
    await vi.waitFor(() => {
      expect(window.reload).toHaveBeenCalledTimes(1);
    });
  });

  it('passes notes root launch targets through the renderer URL', () => {
    const { handlers } = createIpcHarness();

    handlers.get('desktop:window:create')?.({}, {
      notesRootPath: '/notes-root/docs',
      notePath: 'readme.md',
      viewMode: 'notes',
    });

    const window = hoisted.windows[0];
    expect(window.loadURL).toHaveBeenCalledWith(
      'http://localhost:3000/?newWindow=true&notesRootPath=%2Fnotes-root%2Fdocs&notePath=readme.md&viewMode=notes',
    );
  });

  it('labels user-created windows as secondary even when no main window exists yet', () => {
    const { handlers } = createIpcHarness();

    handlers.get('desktop:window:create')?.({}, { viewMode: 'notes' });
    const window = hoisted.windows[0];

    expect(handlers.get('desktop:window:get-label')?.({ sender: window.webContents })).toBe('window-1');
  });

  it('persists resized bounds and restores them for the next manager instance', () => {
    const firstWindow = createHarness();
    firstWindow.bounds = { width: 1234, height: 777 };
    firstWindow.emit('resize');

    vi.advanceTimersByTime(250);
    const storeDir = path.join(hoisted.userDataPath, '.vlaina', 'app', 'window');
    const statePath = path.join(storeDir, 'state.json');
    expect(JSON.parse(fs.readFileSync(statePath, 'utf8'))).toMatchObject({
      bounds: { width: 1234, height: 777 },
      isMaximized: false,
    });
    expect(fs.readdirSync(storeDir).filter((name) => name.startsWith('state.json.tmp-'))).toEqual([]);

    const secondManager = createWindowManager({
      rendererDevUrl: 'http://localhost:3000',
      appIconPath: 'icon.png',
      isDevelopment: () => true,
      openExternalIfAllowed: vi.fn(),
      isTrustedRendererUrl: vi.fn(() => true),
    });
    const secondWindow = secondManager.createMainWindow() as unknown as InstanceType<typeof hoisted.MockBrowserWindow>;

    expect(secondWindow.options).toMatchObject({ width: 1234, height: 777 });
  });

  it('restores maximized windows after creating them at their saved normal bounds', () => {
    const statePath = path.join(hoisted.userDataPath, '.vlaina', 'app', 'window', 'state.json');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({
      bounds: { width: 1111, height: 700 },
      isMaximized: true,
    }));

    const window = createHarness();

    expect(window.options).toMatchObject({ width: 1111, height: 700 });
    expect(window.maximize).toHaveBeenCalledTimes(1);
  });

  it('ignores oversized stored window state on startup', () => {
    const statePath = path.join(hoisted.userDataPath, '.vlaina', 'app', 'window', 'state.json');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({
      bounds: { width: 1111, height: 700 },
      isMaximized: true,
      padding: 'x'.repeat(65 * 1024),
    }));

    const window = createHarness();

    expect(window.options).toMatchObject({ width: 980, height: 640 });
    expect(window.maximize).not.toHaveBeenCalled();
  });

  it('ignores stored window state that grows after stat', () => {
    const statePath = path.join(hoisted.userDataPath, '.vlaina', 'app', 'window', 'state.json');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({
      bounds: { width: 1111, height: 700 },
      isMaximized: true,
      padding: 'x'.repeat(65 * 1024),
    }));
    const actualStats = fs.statSync(statePath);
    const smallStats = Object.create(actualStats) as fs.Stats;
    Object.defineProperty(smallStats, 'size', { value: 1 });
    const statSpy = vi.spyOn(fs, 'statSync').mockReturnValueOnce(smallStats);

    const window = createHarness();

    expect(statSpy).toHaveBeenCalledWith(statePath);
    expect(window.options).toMatchObject({ width: 980, height: 640 });
    expect(window.maximize).not.toHaveBeenCalled();
  });

  it('ignores non-decimal stored window bounds on startup', () => {
    const statePath = path.join(hoisted.userDataPath, '.vlaina', 'app', 'window', 'state.json');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({
      bounds: { width: '1e3', height: '700' },
      isMaximized: true,
    }));

    const window = createHarness();

    expect(window.options).toMatchObject({ width: 980, height: 640 });
    expect(window.maximize).not.toHaveBeenCalled();
  });

  it('does not maximize secondary windows from the persisted main window state', () => {
    const statePath = path.join(hoisted.userDataPath, '.vlaina', 'app', 'window', 'state.json');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({
      bounds: { width: 1111, height: 700 },
      isMaximized: true,
    }));
    const { handlers } = createIpcHarness();

    handlers.get('desktop:window:create')?.({}, { viewMode: 'notes' });
    const window = hoisted.windows[0];

    expect(window.options).toMatchObject({ width: 1111, height: 700 });
    expect(window.maximize).not.toHaveBeenCalled();
  });

  it('caps restored bounds to the current display work area', () => {
    const statePath = path.join(hoisted.userDataPath, '.vlaina', 'app', 'window', 'state.json');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({
      bounds: { width: 3000, height: 2000 },
      isMaximized: false,
    }));

    const window = createHarness();

    expect(window.options).toMatchObject({ width: 1600, height: 900 });
  });

  it('persists normal bounds when a minimized window closes', () => {
    const window = createHarness();
    window.minimized = true;
    window.bounds = { width: 0, height: 0 };
    window.normalBounds = { width: 1180, height: 720 };

    window.emit('close', { preventDefault: vi.fn() });

    const secondManager = createWindowManager({
      rendererDevUrl: 'http://localhost:3000',
      appIconPath: 'icon.png',
      isDevelopment: () => true,
      openExternalIfAllowed: vi.fn(),
      isTrustedRendererUrl: vi.fn(() => true),
    });
    const restoredWindow = secondManager.createMainWindow() as unknown as InstanceType<typeof hoisted.MockBrowserWindow>;

    expect(restoredWindow.options).toMatchObject({ width: 1180, height: 720 });
  });

  it('does not let secondary window resizes overwrite the main restored bounds', () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const manager = createWindowManager({
      rendererDevUrl: 'http://localhost:3000',
      appIconPath: 'icon.png',
      isDevelopment: () => true,
      openExternalIfAllowed: vi.fn(),
      isTrustedRendererUrl: vi.fn(() => true),
    });
    manager.registerWindowIpc((name, handler) => {
      handlers.set(name, handler);
    });

    const mainWindow = manager.createMainWindow() as unknown as InstanceType<typeof hoisted.MockBrowserWindow>;
    mainWindow.bounds = { width: 1200, height: 760 };
    mainWindow.emit('resize');
    vi.advanceTimersByTime(250);

    handlers.get('desktop:window:create')?.({}, { viewMode: 'notes' });
    const secondaryWindow = hoisted.windows.at(-1) as InstanceType<typeof hoisted.MockBrowserWindow>;
    secondaryWindow.bounds = { width: 840, height: 620 };
    secondaryWindow.emit('resize');
    vi.advanceTimersByTime(250);

    const restoredManager = createWindowManager({
      rendererDevUrl: 'http://localhost:3000',
      appIconPath: 'icon.png',
      isDevelopment: () => true,
      openExternalIfAllowed: vi.fn(),
      isTrustedRendererUrl: vi.fn(() => true),
    });
    const restoredWindow = restoredManager.createMainWindow() as unknown as InstanceType<typeof hoisted.MockBrowserWindow>;

    expect(restoredWindow.options).toMatchObject({ width: 1200, height: 760 });
  });

  it('does not persist a secondary window created before the main window', () => {
    const { handlers } = createIpcHarness();

    handlers.get('desktop:window:create')?.({}, { viewMode: 'notes' });
    const secondaryWindow = hoisted.windows[0];
    secondaryWindow.bounds = { width: 1320, height: 820 };
    secondaryWindow.emit('resize');
    vi.advanceTimersByTime(250);

    const restoredManager = createWindowManager({
      rendererDevUrl: 'http://localhost:3000',
      appIconPath: 'icon.png',
      isDevelopment: () => true,
      openExternalIfAllowed: vi.fn(),
      isTrustedRendererUrl: vi.fn(() => true),
    });
    const restoredWindow = restoredManager.createMainWindow() as unknown as InstanceType<typeof hoisted.MockBrowserWindow>;

    expect(restoredWindow.options).toMatchObject({ width: 980, height: 640 });
  });
});
