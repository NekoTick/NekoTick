import type { FilesystemPlugin } from '@capacitor/filesystem';
import type { SharePlugin } from '@capacitor/share';
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_NATIVE_SHARE_FILE_BYTES,
  clearMobileFileShareCache,
  createMobileFileShareHandler,
} from './nativeFileShare';

function createPlugins(canShare = true) {
  const mkdir = vi.fn().mockResolvedValue(undefined);
  const rmdir = vi.fn().mockResolvedValue(undefined);
  const writeFile = vi.fn().mockResolvedValue({ uri: 'cache://written' });
  const getUri = vi.fn().mockResolvedValue({ uri: 'file:///cache/shared-note.html' });
  const shareFile = vi.fn().mockResolvedValue({ activityType: 'test' });
  const filesystem = { getUri, mkdir, rmdir, writeFile } as unknown as FilesystemPlugin;
  const share = {
    canShare: vi.fn().mockResolvedValue({ value: canShare }),
    share: shareFile,
  } as unknown as SharePlugin;
  return { filesystem, getUri, mkdir, rmdir, share, shareFile, writeFile };
}

describe('mobile native file sharing', () => {
  it('writes binary data to cache and opens the system share sheet', async () => {
    const plugins = createPlugins();
    const handler = createMobileFileShareHandler(plugins.filesystem, plugins.share);

    await handler({
      data: new Uint8Array([112, 110, 103]),
      fileName: '../Shared: note.html',
      mimeType: 'text/html',
      title: 'Shared note',
    });

    expect(plugins.writeFile).toHaveBeenCalledWith(expect.objectContaining({
      data: 'cG5n',
      directory: 'CACHE',
      path: expect.stringMatching(/^vlaina-exports\/\d+-[a-z0-9]+-\.\.Shared note\.html$/),
      recursive: true,
    }));
    const path = plugins.writeFile.mock.calls[0]?.[0].path;
    expect(plugins.getUri).toHaveBeenCalledWith({ directory: 'CACHE', path });
    expect(plugins.shareFile).toHaveBeenCalledWith({
      dialogTitle: 'Shared note',
      files: ['file:///cache/shared-note.html'],
      title: 'Shared note',
    });
  });

  it('clears stale exports from a previous app run', async () => {
    const plugins = createPlugins();

    await clearMobileFileShareCache(plugins.filesystem);

    expect(plugins.mkdir).toHaveBeenCalledWith({
      directory: 'CACHE',
      path: 'vlaina-exports',
      recursive: true,
    });
    expect(plugins.rmdir).toHaveBeenCalledWith({
      directory: 'CACHE',
      path: 'vlaina-exports',
      recursive: true,
    });
  });

  it('supports Blob payloads', async () => {
    const plugins = createPlugins();
    const handler = createMobileFileShareHandler(plugins.filesystem, plugins.share);

    await handler({
      data: new Blob(['svg'], { type: 'image/svg+xml' }),
      fileName: 'board.svg',
      mimeType: 'image/svg+xml',
    });

    expect(plugins.writeFile).toHaveBeenCalledWith(expect.objectContaining({ data: 'c3Zn' }));
  });

  it('fails before writing when the device cannot share files', async () => {
    const plugins = createPlugins(false);
    const handler = createMobileFileShareHandler(plugins.filesystem, plugins.share);

    await expect(handler({
      data: new Uint8Array([1]),
      fileName: 'note.html',
      mimeType: 'text/html',
    })).rejects.toThrow('File sharing is not available on this device.');
    expect(plugins.writeFile).not.toHaveBeenCalled();
  });

  it('rejects oversized files before writing', async () => {
    const plugins = createPlugins();
    const handler = createMobileFileShareHandler(plugins.filesystem, plugins.share);

    await expect(handler({
      data: { byteLength: MAX_NATIVE_SHARE_FILE_BYTES + 1 } as Uint8Array,
      fileName: 'huge.bin',
      mimeType: 'application/octet-stream',
    })).rejects.toThrow('Native share file is too large.');
    expect(plugins.writeFile).not.toHaveBeenCalled();
  });
});
