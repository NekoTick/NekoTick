import fs from 'node:fs';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupOldUpdateDownloads,
  deleteDownloadedUpdate,
  downloadUpdateAsset,
  normalizeDownloadedUpdateForOpen,
  normalizeDownloadedUpdatePath,
  normalizeUpdateAssetName,
} from '../../electron/updateDownload.mjs';

let temporaryRoot = '';

function createApp() {
  return {
    getPath(name) {
      if (name !== 'userData') throw new Error(`Unexpected app path: ${name}`);
      return temporaryRoot;
    },
    getVersion() {
      return '0.1.16';
    },
  };
}

function createUpdateInfo(overrides = {}) {
  return {
    currentVersion: '0.1.16',
    latestVersion: '0.1.17',
    updateAvailable: true,
    downloadUrl: 'https://github.com/vladelaina/vlaina/releases/download/v0.1.17/vlaina-0.1.17-linux-x86_64.AppImage',
    releaseUrl: 'https://github.com/vladelaina/vlaina/releases/tag/v0.1.17',
    platformAssetName: 'vlaina-0.1.17-linux-x86_64.AppImage',
    hasPlatformAsset: true,
    releaseNotes: '',
    publishedAt: '',
    ...overrides,
  };
}

function sha256Hex(bytes) {
  return crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

describe('desktop update downloads', () => {
  beforeEach(() => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vlaina-update-download-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(temporaryRoot, { force: true, recursive: true });
    temporaryRoot = '';
  });

  it('rejects unsafe update asset names', () => {
    expect(() => normalizeUpdateAssetName('../vlaina-0.1.17.exe')).toThrow('Update asset name is not allowed');
    expect(() => normalizeUpdateAssetName('other-0.1.17.exe')).toThrow('Update asset name is not allowed');
    expect(() => normalizeUpdateAssetName('vlaina-0.1.17-linux-x86_64.AppImage')).not.toThrow();
  });

  it('downloads a platform update asset to the app update directory', async () => {
    const bytes = [1, 2, 3];
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-length': '3' },
    }));

    const result = await downloadUpdateAsset({
      app: createApp(),
      updateInfo: createUpdateInfo({
        platformAssetSha256: sha256Hex(bytes),
      }),
      fetchImpl,
    });

    expect(result).toMatchObject({
      fileName: 'vlaina-0.1.17-linux-x86_64.AppImage',
      sizeBytes: 3,
    });
    expect(fs.readFileSync(result.filePath)).toEqual(Buffer.from([1, 2, 3]));
    expect(result.filePath).toContain(path.join('update-downloads', '0.1.17'));
    if (process.platform === 'linux') {
      expect(fs.statSync(result.filePath).mode & 0o111).not.toBe(0);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not mark downloaded Linux packages executable unless they are AppImages', async () => {
    const bytes = [1, 2, 3];
    const result = await downloadUpdateAsset({
      app: createApp(),
      updateInfo: createUpdateInfo({
        downloadUrl: 'https://github.com/vladelaina/vlaina/releases/download/v0.1.17/vlaina-0.1.17-linux-x64.deb',
        platformAssetName: 'vlaina-0.1.17-linux-x64.deb',
        platformAssetSha256: sha256Hex(bytes),
      }),
      fetchImpl: vi.fn().mockResolvedValue(new Response(new Uint8Array(bytes), {
        status: 200,
        headers: { 'content-length': '3' },
      })),
    });

    expect(fs.statSync(result.filePath).mode & 0o111).toBe(0);
  });

  it('surfaces asynchronous file stream errors without crashing the updater process', async () => {
    const stream = new EventEmitter();
    stream.write = vi.fn(() => {
      queueMicrotask(() => stream.emit('error', new Error('disk full')));
      return true;
    });
    stream.end = vi.fn();
    stream.destroy = vi.fn();
    vi.spyOn(fs, 'createWriteStream').mockReturnValue(stream);

    await expect(downloadUpdateAsset({
      app: createApp(),
      updateInfo: createUpdateInfo({
        platformAssetSha256: sha256Hex([1, 2, 3]),
      }),
      fetchImpl: vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-length': '3' },
      })),
    })).rejects.toThrow('disk full');

    expect(stream.destroy).toHaveBeenCalled();
  });

  it('times out when a file stream never drains', async () => {
    const stream = new EventEmitter();
    stream.write = vi.fn(() => false);
    stream.end = vi.fn();
    stream.destroy = vi.fn();
    vi.spyOn(fs, 'createWriteStream').mockReturnValue(stream);

    await expect(downloadUpdateAsset({
      app: createApp(),
      updateInfo: createUpdateInfo({
        platformAssetSha256: sha256Hex([1, 2, 3]),
      }),
      fetchImpl: vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-length': '3' },
      })),
    })).rejects.toThrow('Update download stalled while writing to disk');

    expect(stream.destroy).toHaveBeenCalled();
  });

  it('passes an abort signal to the update download request', async () => {
    const abortController = new AbortController();
    const bytes = [1];
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), {
      status: 200,
      headers: { 'content-length': '1' },
    }));

    await downloadUpdateAsset({
      app: createApp(),
      updateInfo: createUpdateInfo({
        platformAssetSha256: sha256Hex(bytes),
      }),
      fetchImpl,
      signal: abortController.signal,
    });

    expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
    const requestSignal = fetchImpl.mock.calls[0][1].signal;
    abortController.abort();
    expect(requestSignal.aborted).toBe(true);
  });

  it('times out when the update server never returns response headers', async () => {
    const fetchImpl = vi.fn(() => new Promise(() => {}));

    await expect(downloadUpdateAsset({
      app: createApp(),
      updateInfo: createUpdateInfo({
        platformAssetSha256: sha256Hex([1]),
      }),
      fetchImpl,
    })).rejects.toThrow('Update download timed out waiting for the server');
  });

  it('times out and cancels the response reader when download data stalls', async () => {
    const cancel = vi.fn(async () => undefined);
    const releaseLock = vi.fn();
    const reader = {
      cancel,
      read: vi.fn(() => new Promise(() => {})),
      releaseLock,
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      body: { getReader: () => reader },
      headers: new Headers(),
      ok: true,
      status: 200,
    });

    await expect(downloadUpdateAsset({
      app: createApp(),
      updateInfo: createUpdateInfo({
        platformAssetSha256: sha256Hex([1]),
      }),
      fetchImpl,
    })).rejects.toThrow('Update download stalled');

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing downloaded update asset', async () => {
    const app = createApp();
    const existingPath = path.join(
      temporaryRoot,
      'update-downloads',
      '0.1.17',
      'vlaina-0.1.17-linux-x86_64.AppImage'
    );
    fs.mkdirSync(path.dirname(existingPath), { recursive: true });
    fs.writeFileSync(existingPath, Buffer.from([4, 5]));

    const fetchImpl = vi.fn();
    const result = await downloadUpdateAsset({
      app,
      updateInfo: createUpdateInfo({
        platformAssetSha256: sha256Hex([4, 5]),
      }),
      fetchImpl,
    });

    expect(result.filePath).toBe(existingPath);
    expect(result.sizeBytes).toBe(2);
    if (process.platform === 'linux') {
      expect(fs.statSync(result.filePath).mode & 0o111).not.toBe(0);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('verifies an existing downloaded update asset before reusing it', async () => {
    const app = createApp();
    const existingBytes = [4, 5];
    const existingPath = path.join(
      temporaryRoot,
      'update-downloads',
      '0.1.17',
      'vlaina-0.1.17-linux-x86_64.AppImage'
    );
    fs.mkdirSync(path.dirname(existingPath), { recursive: true });
    fs.writeFileSync(existingPath, Buffer.from(existingBytes));

    const fetchImpl = vi.fn();
    const result = await downloadUpdateAsset({
      app,
      updateInfo: createUpdateInfo({
        platformAssetSha256: sha256Hex(existingBytes),
      }),
      fetchImpl,
    });

    expect(result.filePath).toBe(existingPath);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('replaces an existing downloaded update asset with a mismatched sha256', async () => {
    const app = createApp();
    const replacementBytes = [9, 9];
    const existingPath = path.join(
      temporaryRoot,
      'update-downloads',
      '0.1.17',
      'vlaina-0.1.17-linux-x86_64.AppImage'
    );
    fs.mkdirSync(path.dirname(existingPath), { recursive: true });
    fs.writeFileSync(existingPath, Buffer.from([4, 5]));

    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array(replacementBytes), {
      status: 200,
      headers: { 'content-length': String(replacementBytes.length) },
    }));
    const result = await downloadUpdateAsset({
      app,
      updateInfo: createUpdateInfo({
        platformAssetSha256: sha256Hex(replacementBytes),
      }),
      fetchImpl,
    });

    expect(result.filePath).toBe(existingPath);
    expect(fs.readFileSync(existingPath)).toEqual(Buffer.from(replacementBytes));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('cleans old update packages without deleting unfinished downloads for the current version', async () => {
    const app = createApp();
    const root = path.join(temporaryRoot, 'update-downloads');
    const oldVersionPath = path.join(root, '0.1.16');
    const currentVersionPath = path.join(root, '0.1.17');
    fs.mkdirSync(oldVersionPath, { recursive: true });
    fs.mkdirSync(currentVersionPath, { recursive: true });
    fs.writeFileSync(path.join(oldVersionPath, 'vlaina-0.1.16-linux-x86_64.AppImage'), Buffer.from([1]));
    fs.writeFileSync(path.join(currentVersionPath, 'stale.download'), Buffer.from([2]));
    fs.writeFileSync(path.join(root, 'root-stale.download'), Buffer.from([3]));

    cleanupOldUpdateDownloads(app, '0.1.17');

    expect(fs.existsSync(oldVersionPath)).toBe(false);
    expect(fs.existsSync(currentVersionPath)).toBe(true);
    expect(fs.existsSync(path.join(currentVersionPath, 'stale.download'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'root-stale.download'))).toBe(false);
  });

  it('resumes an unfinished update download with an HTTP range request', async () => {
    const app = createApp();
    const partialPath = path.join(
      temporaryRoot,
      'update-downloads',
      '0.1.17',
      'vlaina-0.1.17-linux-x86_64.AppImage.download'
    );
    fs.mkdirSync(path.dirname(partialPath), { recursive: true });
    fs.writeFileSync(partialPath, Buffer.from([1, 2]));

    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array([3, 4]), {
      status: 206,
      headers: {
        'content-length': '2',
        'content-range': 'bytes 2-3/4',
      },
    }));

    const result = await downloadUpdateAsset({
      app,
      updateInfo: createUpdateInfo({
        platformAssetSha256: sha256Hex([1, 2, 3, 4]),
      }),
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({
        range: 'bytes=2-',
      }),
    }));
    expect(fs.readFileSync(result.filePath)).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(fs.existsSync(partialPath)).toBe(false);
    expect(result.sizeBytes).toBe(4);
  });

  it('rejects and deletes a completed update download with a mismatched sha256', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-length': '3' },
    }));

    await expect(downloadUpdateAsset({
      app: createApp(),
      updateInfo: createUpdateInfo({
        platformAssetSha256: sha256Hex([9, 9, 9]),
      }),
      fetchImpl,
    })).rejects.toThrow('Downloaded update SHA-256 does not match');

    const finalPath = path.join(
      temporaryRoot,
      'update-downloads',
      '0.1.17',
      'vlaina-0.1.17-linux-x86_64.AppImage'
    );
    expect(fs.existsSync(finalPath)).toBe(false);
  });

  it('restarts an unfinished download when the server ignores range requests', async () => {
    const app = createApp();
    const partialPath = path.join(
      temporaryRoot,
      'update-downloads',
      '0.1.17',
      'vlaina-0.1.17-linux-x86_64.AppImage.download'
    );
    fs.mkdirSync(path.dirname(partialPath), { recursive: true });
    fs.writeFileSync(partialPath, Buffer.from([9, 9]));

    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-length': '3' },
    }));

    const result = await downloadUpdateAsset({
      app,
      updateInfo: createUpdateInfo({
        platformAssetSha256: sha256Hex([1, 2, 3]),
      }),
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({
        range: 'bytes=2-',
      }),
    }));
    expect(fs.readFileSync(result.filePath)).toEqual(Buffer.from([1, 2, 3]));
    expect(result.sizeBytes).toBe(3);
  });

  it('restarts an unfinished download when the content range does not match the local file', async () => {
    const app = createApp();
    const partialPath = path.join(
      temporaryRoot,
      'update-downloads',
      '0.1.17',
      'vlaina-0.1.17-linux-x86_64.AppImage.download'
    );
    fs.mkdirSync(path.dirname(partialPath), { recursive: true });
    fs.writeFileSync(partialPath, Buffer.from([8, 8]));

    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(new Uint8Array([9]), {
        status: 206,
        headers: {
          'content-length': '1',
          'content-range': 'bytes 0-0/3',
        },
      }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-length': '3' },
      }));

    const result = await downloadUpdateAsset({
      app,
      updateInfo: createUpdateInfo({
        platformAssetSha256: sha256Hex([1, 2, 3]),
      }),
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1].headers.range).toBe('bytes=2-');
    expect(fetchImpl.mock.calls[1][1].headers.range).toBeUndefined();
    expect(fs.readFileSync(result.filePath)).toEqual(Buffer.from([1, 2, 3]));
    expect(result.sizeBytes).toBe(3);
  });

  it('keeps an unfinished temporary download when the request is interrupted', async () => {
    const app = createApp();
    const partialPath = path.join(
      temporaryRoot,
      'update-downloads',
      '0.1.17',
      'vlaina-0.1.17-linux-x86_64.AppImage.download'
    );
    fs.mkdirSync(path.dirname(partialPath), { recursive: true });
    fs.writeFileSync(partialPath, Buffer.from([1, 2]));

    const fetchImpl = vi.fn().mockRejectedValue(new Error('network interrupted'));

    await expect(downloadUpdateAsset({
      app,
      updateInfo: createUpdateInfo({
        platformAssetSha256: sha256Hex([1, 2, 3]),
      }),
      fetchImpl,
    })).rejects.toThrow('network interrupted');

    expect(fs.readFileSync(partialPath)).toEqual(Buffer.from([1, 2]));
  });

  it('allows opening only downloaded vlaina update assets', () => {
    const app = createApp();
    const allowedPath = path.join(
      temporaryRoot,
      'update-downloads',
      '0.1.17',
      'vlaina-0.1.17-windows-x64-setup.exe'
    );
    fs.mkdirSync(path.dirname(allowedPath), { recursive: true });
    fs.writeFileSync(allowedPath, Buffer.from([1]));

    expect(normalizeDownloadedUpdatePath(app, allowedPath)).toBe(allowedPath);
    expect(() => normalizeDownloadedUpdatePath(app, path.join(temporaryRoot, 'secret.txt')))
      .toThrow('Downloaded update path is not allowed');
  });

  it('opens a downloaded update only when it matches the requested update and sha256', async () => {
    const app = createApp();
    const bytes = [7, 8, 9];
    const allowedPath = path.join(
      temporaryRoot,
      'update-downloads',
      '0.1.17',
      'vlaina-0.1.17-windows-x64-setup.exe'
    );
    fs.mkdirSync(path.dirname(allowedPath), { recursive: true });
    fs.writeFileSync(allowedPath, Buffer.from(bytes));

    await expect(normalizeDownloadedUpdateForOpen(app, createUpdateInfo({
      platformAssetName: 'vlaina-0.1.17-windows-x64-setup.exe',
      platformAssetSha256: sha256Hex(bytes),
      downloadedFilePath: allowedPath,
    }))).resolves.toBe(allowedPath);

    await expect(normalizeDownloadedUpdateForOpen(app, createUpdateInfo({
      platformAssetName: 'vlaina-0.1.17-windows-x64-setup.exe',
      platformAssetSha256: sha256Hex([0]),
      downloadedFilePath: allowedPath,
    }))).rejects.toThrow('Downloaded update SHA-256 does not match');
  });

  it('rejects downloads and local opens when release assets do not provide sha256', async () => {
    await expect(downloadUpdateAsset({
      app: createApp(),
      updateInfo: createUpdateInfo(),
      fetchImpl: vi.fn(),
    })).rejects.toThrow('Update asset SHA-256 is required');

    await expect(normalizeDownloadedUpdateForOpen(createApp(), createUpdateInfo()))
      .rejects.toThrow('Update asset SHA-256 is required');
  });

  it('deletes an allowed downloaded update asset and prunes empty version directories', () => {
    const app = createApp();
    const allowedPath = path.join(
      temporaryRoot,
      'update-downloads',
      '0.1.17',
      'vlaina-0.1.17-windows-x64-setup.exe'
    );
    fs.mkdirSync(path.dirname(allowedPath), { recursive: true });
    fs.writeFileSync(allowedPath, Buffer.from([1]));
    fs.writeFileSync(`${allowedPath}.download`, Buffer.from([2]));

    deleteDownloadedUpdate(app, allowedPath);

    expect(fs.existsSync(allowedPath)).toBe(false);
    expect(fs.existsSync(`${allowedPath}.download`)).toBe(false);
    expect(fs.existsSync(path.dirname(allowedPath))).toBe(false);
  });

  it('deletes all files for a stale update version', () => {
    const app = createApp();
    const versionPath = path.join(temporaryRoot, 'update-downloads', '0.1.17');
    fs.mkdirSync(versionPath, { recursive: true });
    fs.writeFileSync(path.join(versionPath, 'vlaina-0.1.17-linux-x86_64.AppImage'), Buffer.from([1]));
    fs.writeFileSync(path.join(versionPath, 'vlaina-0.1.17-linux-x86_64.AppImage.download'), Buffer.from([2]));

    deleteDownloadedUpdate(app, createUpdateInfo());

    expect(fs.existsSync(versionPath)).toBe(false);
  });

  it('rejects deleting paths outside the update downloads directory', () => {
    const app = createApp();
    const outsidePath = path.join(temporaryRoot, 'vlaina-0.1.17-windows-x64-setup.exe');
    fs.writeFileSync(outsidePath, Buffer.from([1]));

    expect(() => deleteDownloadedUpdate(app, outsidePath)).toThrow('Downloaded update path is not allowed');
    expect(fs.existsSync(outsidePath)).toBe(true);
  });
});
