import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tryWriteTextToClipboardSynchronously, writeTextToClipboard } from './clipboard';

const electronBridgeMocks = vi.hoisted(() => ({
  getElectronBridge: vi.fn(() => null as any),
}));

vi.mock('@/lib/electron/bridge', () => ({
  getElectronBridge: electronBridgeMocks.getElectronBridge,
}));

describe('writeTextToClipboard', () => {
  const originalClipboard = navigator.clipboard;
  const originalExecCommand = document.execCommand;

  beforeEach(() => {
    electronBridgeMocks.getElectronBridge.mockReturnValue(null);
    document.body.innerHTML = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => true),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: originalExecCommand,
    });
  });

  it('removes the fallback textarea if focusing it fails', async () => {
    const focusSpy = vi.spyOn(HTMLTextAreaElement.prototype, 'focus').mockImplementationOnce(() => {
      throw new Error('focus failed');
    });

    await expect(writeTextToClipboard('copied text')).resolves.toBe(false);

    expect(focusSpy).toHaveBeenCalled();
    expect(document.execCommand).not.toHaveBeenCalled();
    expect(document.body.querySelector('textarea')).toBeNull();
  });

  it('leaves synchronous keyboard clipboard handling to native events outside Electron', () => {
    expect(tryWriteTextToClipboardSynchronously('new clipboard text')).toBe(false);
    expect(document.execCommand).not.toHaveBeenCalled();
    expect(document.body.querySelector('textarea')).toBeNull();
  });

  it('uses the synchronous desktop clipboard before DOM fallback paths', () => {
    const writeTextSync = vi.fn(() => true);
    electronBridgeMocks.getElectronBridge.mockReturnValue({
      platform: 'electron',
      clipboard: { writeTextSync },
    });

    expect(tryWriteTextToClipboardSynchronously('desktop clipboard text')).toBe(true);
    expect(writeTextSync).toHaveBeenCalledWith('desktop clipboard text');
    expect(document.execCommand).not.toHaveBeenCalled();
  });

  it('prefers the synchronous desktop clipboard for general copy actions', async () => {
    const writeTextSync = vi.fn(() => true);
    const writeText = vi.fn().mockResolvedValue(undefined);
    electronBridgeMocks.getElectronBridge.mockReturnValue({
      platform: 'electron',
      clipboard: { writeText, writeTextSync },
    });

    await expect(writeTextToClipboard('fresh desktop clipboard text')).resolves.toBe(true);
    expect(writeTextSync).toHaveBeenCalledWith('fresh desktop clipboard text');
    expect(writeText).not.toHaveBeenCalled();
    expect(document.execCommand).not.toHaveBeenCalled();
  });
});
