import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachWindowLifecycle } from '../electron/windowLifecycle.mjs';

describe('attachWindowLifecycle resize synchronization', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports proposed maximize bounds without mutating the root content view on Windows', () => {
    vi.useFakeTimers();
    let windowBounds = { x: 0, y: 0, width: 800, height: 600 };
    let maximized = false;
    const staleContentBounds = { x: 8, y: 31, width: 784, height: 561 };
    const viewBounds = { x: 0, y: 0, width: 784, height: 561 };
    const contentView = {
      getBounds: vi.fn(() => viewBounds),
      setBounds: vi.fn(),
    };
    const webContents = Object.assign(new EventEmitter(), {
      id: 1,
      invalidate: vi.fn(),
      isDestroyed: vi.fn(() => false),
      setWindowOpenHandler: vi.fn(),
    });
    const window = Object.assign(new EventEmitter(), {
      id: 1,
      contentView,
      webContents,
      getBounds: vi.fn(() => windowBounds),
      getContentBounds: vi.fn(() => staleContentBounds),
      isDestroyed: vi.fn(() => false),
      isFullScreen: vi.fn(() => false),
      isMaximized: vi.fn(() => maximized),
    });
    const safeSend = vi.fn();

    attachWindowLifecycle({
      window,
      closeApprovedWebContents: new Set(),
      readyToRevealWebContents: new Set(),
      windowLabels: new Map([[1, 'main']]),
      isUsableWindow: () => true,
      safeSend,
      loadRenderer: vi.fn(),
      isDevelopment: () => true,
      isTrustedRendererUrl: () => true,
      openExternalIfAllowed: vi.fn(),
      reportError: vi.fn(),
      beforeRendererReload: vi.fn(),
      getWindowLabel: () => 'main',
      shouldFocusOnReveal: () => false,
      onPersistedWindowState: vi.fn(),
      rendererDevUrl: 'http://127.0.0.1:3100',
      platform: 'win32',
    });

    windowBounds = { x: 0, y: 0, width: 1538, height: 1040 };
    maximized = true;
    window.emit('maximize');

    expect(contentView.setBounds).not.toHaveBeenCalled();
    expect(webContents.invalidate).not.toHaveBeenCalled();
    expect(safeSend).toHaveBeenCalledWith(
      window,
      'desktop:window:bounds-changed',
      expect.objectContaining({
        width: 1538,
        height: 1040,
        contentWidth: 1538,
        contentHeight: 1040,
      }),
    );

    window.emit('resize');

    expect(contentView.setBounds).not.toHaveBeenCalled();
    expect(webContents.invalidate).not.toHaveBeenCalled();

    window.emit('closed');
  });

  it('synchronizes a stale Linux root content view to the native window bounds', () => {
    vi.useFakeTimers();
    let windowBounds = { x: 16, y: 10, width: 1900, height: 1036 };
    const staleContentBounds = { x: 16, y: 10, width: 1900, height: 1036 };
    let viewBounds = { x: 0, y: 0, width: 1900, height: 1036 };
    const contentView = {
      getBounds: vi.fn(() => viewBounds),
      setBounds: vi.fn((bounds) => {
        viewBounds = bounds;
      }),
    };
    const webContents = Object.assign(new EventEmitter(), {
      id: 1,
      invalidate: vi.fn(),
      isDestroyed: vi.fn(() => false),
      setWindowOpenHandler: vi.fn(),
    });
    const window = Object.assign(new EventEmitter(), {
      id: 1,
      contentView,
      webContents,
      getBounds: vi.fn(() => windowBounds),
      getContentBounds: vi.fn(() => staleContentBounds),
      isDestroyed: vi.fn(() => false),
      isFullScreen: vi.fn(() => false),
      isMaximized: vi.fn(() => false),
    });
    const safeSend = vi.fn();

    attachWindowLifecycle({
      window,
      closeApprovedWebContents: new Set(),
      readyToRevealWebContents: new Set(),
      windowLabels: new Map([[1, 'main']]),
      isUsableWindow: () => true,
      safeSend,
      loadRenderer: vi.fn(),
      isDevelopment: () => true,
      isTrustedRendererUrl: () => true,
      openExternalIfAllowed: vi.fn(),
      reportError: vi.fn(),
      beforeRendererReload: vi.fn(),
      getWindowLabel: () => 'main',
      shouldFocusOnReveal: () => false,
      onPersistedWindowState: vi.fn(),
      rendererDevUrl: 'http://127.0.0.1:3100',
      platform: 'linux',
    });

    windowBounds = { x: 16, y: 10, width: 945, height: 1036 };
    window.emit('resize');
    window.emit('resize');

    expect(contentView.setBounds).toHaveBeenCalledOnce();
    expect(contentView.setBounds).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      width: 945,
      height: 1036,
    });
    expect(webContents.invalidate).not.toHaveBeenCalled();
    expect(safeSend).toHaveBeenCalledWith(
      window,
      'desktop:window:bounds-changed',
      expect.objectContaining({
        width: 945,
        height: 1036,
        contentWidth: 945,
        contentHeight: 1036,
      }),
    );

    window.emit('closed');
  });
});
