import { afterEach, describe, expect, it, vi } from 'vitest';
import { UPDATE_INFO_CACHE_KEY, type DesktopUpdateInfo } from './updateStatus';
import { clearStaleDesktopUpdateDownload, startDesktopUpdateDownload } from './updateDownload';

function createUpdateInfo(overrides: Partial<DesktopUpdateInfo> = {}): DesktopUpdateInfo {
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

describe('desktop update background download policy', () => {
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('does not start a background download when distribution policy disables it', () => {
    const updateApi = {
      check: vi.fn(),
      getPolicy: vi.fn(),
      download: vi.fn(),
      openDownloaded: vi.fn(),
      deleteDownloaded: vi.fn(),
    };

    startDesktopUpdateDownload(updateApi, createUpdateInfo({
      updatePolicy: {
        distribution: 'microsoft-store',
        checkEnabled: false,
        backgroundDownloadEnabled: false,
        localInstallerEnabled: false,
        externalDownloadEnabled: false,
        cleanupDownloadedUpdatesEnabled: true,
      },
    }));

    expect(updateApi.download).not.toHaveBeenCalled();
    expect(localStorage.getItem(UPDATE_INFO_CACHE_KEY)).toBeNull();
  });

  it('does not start a background download when the update asset has no sha256', () => {
    const updateApi = {
      check: vi.fn(),
      getPolicy: vi.fn(),
      download: vi.fn(),
      openDownloaded: vi.fn(),
      deleteDownloaded: vi.fn(),
    };

    startDesktopUpdateDownload(updateApi, createUpdateInfo());

    expect(updateApi.download).not.toHaveBeenCalled();
    expect(localStorage.getItem(UPDATE_INFO_CACHE_KEY)).toBeNull();
  });

  it('preserves downloaded installer metadata for the same update asset after a fresh check', async () => {
    const updateApi = {
      deleteDownloaded: vi.fn(),
    };
    const cachedUpdateInfo = createUpdateInfo({
      downloadState: 'downloaded',
      downloadedAt: '2026-06-01T00:00:00.000Z',
      downloadedFileName: 'vlaina-0.1.17-windows-x64-setup.exe',
      downloadedFilePath: 'C:\\Users\\tester\\AppData\\Roaming\\vlaina\\update-downloads\\0.1.17\\vlaina-0.1.17-windows-x64-setup.exe',
      platformAssetName: 'vlaina-0.1.17-windows-x64-setup.exe',
      platformAssetSha256: 'a'.repeat(64),
    });
    localStorage.setItem(UPDATE_INFO_CACHE_KEY, JSON.stringify(cachedUpdateInfo));

    const freshUpdateInfo = createUpdateInfo({
      platformAssetName: 'vlaina-0.1.17-windows-x64-setup.exe',
      platformAssetSha256: 'a'.repeat(64),
      releaseNotes: 'Fresh release notes.',
    });

    await expect(clearStaleDesktopUpdateDownload(updateApi, freshUpdateInfo, '0.1.16')).resolves.toMatchObject({
      releaseNotes: 'Fresh release notes.',
      downloadState: 'downloaded',
      downloadedAt: cachedUpdateInfo.downloadedAt,
      downloadedFileName: cachedUpdateInfo.downloadedFileName,
      downloadedFilePath: cachedUpdateInfo.downloadedFilePath,
    });
    expect(updateApi.deleteDownloaded).not.toHaveBeenCalled();
  });

  it('cleans the previous downloaded installer when the update asset changes', async () => {
    const updateApi = {
      deleteDownloaded: vi.fn(),
    };
    const cachedUpdateInfo = createUpdateInfo({
      downloadState: 'downloaded',
      downloadedFileName: 'vlaina-0.1.17-windows-x64-setup.exe',
      downloadedFilePath: 'C:\\Users\\tester\\AppData\\Roaming\\vlaina\\update-downloads\\0.1.17\\vlaina-0.1.17-windows-x64-setup.exe',
      platformAssetName: 'vlaina-0.1.17-windows-x64-setup.exe',
      platformAssetSha256: 'a'.repeat(64),
    });
    localStorage.setItem(UPDATE_INFO_CACHE_KEY, JSON.stringify(cachedUpdateInfo));

    const freshUpdateInfo = createUpdateInfo({
      platformAssetName: 'vlaina-0.1.17-windows-arm64-setup.exe',
      platformAssetSha256: 'b'.repeat(64),
    });

    await expect(clearStaleDesktopUpdateDownload(updateApi, freshUpdateInfo, '0.1.16')).resolves.toBe(freshUpdateInfo);
    expect(updateApi.deleteDownloaded).toHaveBeenCalledWith(expect.objectContaining(cachedUpdateInfo));
  });

  it('cleans the cached downloaded installer when a fresh check reports no update', async () => {
    const updateApi = {
      deleteDownloaded: vi.fn(),
    };
    const cachedUpdateInfo = createUpdateInfo({
      downloadState: 'downloaded',
      downloadedFilePath: 'C:\\Users\\tester\\AppData\\Roaming\\vlaina\\update-downloads\\0.1.17\\vlaina-0.1.17-windows-x64-setup.exe',
      platformAssetName: 'vlaina-0.1.17-windows-x64-setup.exe',
      platformAssetSha256: 'a'.repeat(64),
    });
    localStorage.setItem(UPDATE_INFO_CACHE_KEY, JSON.stringify(cachedUpdateInfo));

    const currentInfo = createUpdateInfo({
      latestVersion: '0.1.16',
      updateAvailable: false,
      platformAssetName: '',
      platformAssetSha256: '',
      hasPlatformAsset: false,
    });

    await expect(clearStaleDesktopUpdateDownload(updateApi, currentInfo, '0.1.16')).resolves.toBeNull();
    expect(updateApi.deleteDownloaded).toHaveBeenCalledWith(expect.objectContaining(cachedUpdateInfo));
  });
});
