import { describe, expect, it, vi } from 'vitest';
import { createTrustedIpc } from '../../electron/trustedIpc.mjs';

function createHarness() {
  const syncListeners = new Map<string, (event: any, ...args: unknown[]) => void>();
  const ipcMain = {
    handle: vi.fn(),
    on: vi.fn((channel: string, listener: (event: any, ...args: unknown[]) => void) => {
      syncListeners.set(channel, listener);
    }),
  };
  const trustedIpc = createTrustedIpc({
    BrowserWindow: { fromWebContents: vi.fn(() => null) },
    ipcMain,
    rendererDevUrl: 'http://127.0.0.1:4317',
    rendererFile: '/app/dist/index.html',
  });

  return { ...trustedIpc, syncListeners };
}

describe('trusted synchronous IPC', () => {
  it('returns a synchronous result to a trusted renderer', () => {
    const { handleSyncIpc, syncListeners } = createHarness();
    const listener = vi.fn(() => true);
    handleSyncIpc('desktop:test-sync', listener);
    const event = {
      senderFrame: { url: 'http://127.0.0.1:4317/notes' },
      returnValue: null,
    };

    syncListeners.get('desktop:test-sync')?.(event, 'payload');

    expect(listener).toHaveBeenCalledWith(event, 'payload');
    expect(event.returnValue).toBe(true);
  });

  it('rejects synchronous calls from an untrusted renderer without hanging it', () => {
    const { handleSyncIpc, syncListeners } = createHarness();
    const listener = vi.fn(() => true);
    handleSyncIpc('desktop:test-sync', listener);
    const event = {
      senderFrame: { url: 'https://untrusted.example.test/notes' },
      returnValue: null,
    };

    syncListeners.get('desktop:test-sync')?.(event, 'payload');

    expect(listener).not.toHaveBeenCalled();
    expect(event.returnValue).toBe(false);
  });
});
