import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  electronJoin: vi.fn().mockResolvedValue('C:\\data\\vlaina'),
  electronToFileUrl: vi.fn().mockResolvedValue('file:///C:/data/vlaina/theme.css'),
  electronCtor: vi.fn(),
  webCtor: vi.fn(),
}));

vi.mock('./ElectronAdapter', () => ({
  ElectronAdapter: class MockElectronAdapter {
    constructor() {
      mocks.electronCtor();
    }
  },
}));

vi.mock('./WebAdapter', () => ({
  WebAdapter: class MockWebAdapter {
    constructor() {
      mocks.webCtor();
    }
  },
}));

import {
  getPlatform,
  getStorageAdapter,
  isCapacitor,
  isElectron,
  isWeb,
  joinPath,
  registerStorageAdapter,
  resetStorageAdapter,
  toFileUrl,
  type StorageAdapter,
} from './index';

describe('storage adapter index', () => {
  beforeEach(() => {
    resetStorageAdapter();
    mocks.electronCtor.mockClear();
    mocks.webCtor.mockClear();
    mocks.electronJoin.mockClear();
    mocks.electronToFileUrl.mockClear();
    delete (window as any).vlainaDesktop;
  });

  afterEach(() => {
    resetStorageAdapter();
  });

  it('uses the web platform and adapter by default', () => {
    expect(getPlatform()).toBe('web');
    expect(isWeb()).toBe(true);
    expect(isElectron()).toBe(false);

    const adapter = getStorageAdapter();
    expect(adapter).toBeInstanceOf(Object);
    expect(mocks.webCtor).toHaveBeenCalledTimes(1);
    expect(mocks.electronCtor).not.toHaveBeenCalled();
  });

  it('uses the electron platform and caches the adapter instance when the bridge exists', () => {
    (window as any).vlainaDesktop = { platform: 'electron' };

    expect(getPlatform()).toBe('electron');
    expect(isElectron()).toBe(true);

    const first = getStorageAdapter();
    const second = getStorageAdapter();

    expect(first).toBe(second);
    expect(mocks.electronCtor).toHaveBeenCalledTimes(1);
    expect(mocks.webCtor).not.toHaveBeenCalled();
  });

  it('stays on the web adapter when the desktop bridge key exists but is not a valid electron bridge', () => {
    (window as any).vlainaDesktop = {};

    expect(getPlatform()).toBe('web');
    expect(isElectron()).toBe(false);

    getStorageAdapter();

    expect(mocks.webCtor).toHaveBeenCalledTimes(1);
    expect(mocks.electronCtor).not.toHaveBeenCalled();
  });

  it('routes joinPath through the electron path bridge in electron runtime', async () => {
    (window as any).vlainaDesktop = {
      platform: 'electron',
      path: {
        join: mocks.electronJoin,
        toFileUrl: mocks.electronToFileUrl,
      },
    };

    await expect(joinPath('C:\\data', 'vlaina')).resolves.toBe('C:\\data\\vlaina');
    expect(mocks.electronJoin).toHaveBeenCalledWith('C:\\data', 'vlaina');
  });

  it('routes toFileUrl through the electron path bridge in electron runtime', async () => {
    (window as any).vlainaDesktop = {
      platform: 'electron',
      path: {
        toFileUrl: mocks.electronToFileUrl,
      },
    };

    await expect(toFileUrl('C:\\data\\vlaina\\theme.css')).resolves.toBe('file:///C:/data/vlaina/theme.css');
    expect(mocks.electronToFileUrl).toHaveBeenCalledWith('C:\\data\\vlaina\\theme.css');
  });

  it('falls back to simple path joining on web', async () => {
    await expect(joinPath('/data', 'vlaina', 'chat')).resolves.toBe('/data/vlaina/chat');
  });

  it('leaves file paths unchanged on web when converting to file URLs', async () => {
    await expect(toFileUrl('/data/vlaina/theme.css')).resolves.toBe('/data/vlaina/theme.css');
  });

  it('uses an explicitly registered Capacitor adapter before platform detection', async () => {
    const mobileToFileUrl = vi.fn().mockResolvedValue('https://localhost/_capacitor_file_/theme.css');
    const adapter = {
      platform: 'capacitor',
      toFileUrl: mobileToFileUrl,
    } as unknown as StorageAdapter;

    registerStorageAdapter(adapter);

    expect(getPlatform()).toBe('capacitor');
    expect(isCapacitor()).toBe(true);
    expect(isWeb()).toBe(false);
    expect(getStorageAdapter()).toBe(adapter);
    await expect(toFileUrl('/vlaina/theme.css')).resolves.toContain('_capacitor_file_');
    expect(mobileToFileUrl).toHaveBeenCalledWith('/vlaina/theme.css');
  });
});
