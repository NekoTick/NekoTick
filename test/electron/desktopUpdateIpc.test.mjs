import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerDesktopUpdateIpc } from '../../electron/desktopUpdateIpc.mjs';

const originalDistributionChannel = process.env.APP_DISTRIBUTION_CHANNEL;
const digest = `sha256:${'c'.repeat(64)}`;

function currentPlatformAssetName(version) {
  if (process.platform === 'win32') {
    return `vlaina-${version}-windows-${process.arch}-setup.exe`;
  }
  if (process.platform === 'darwin') {
    return `vlaina-${version}-mac-${process.arch}.dmg`;
  }
  const arch = process.arch === 'x64' ? 'x86_64' : process.arch;
  return `vlaina-${version}-linux-${arch}.AppImage`;
}

function createManifestResponse(version = '1.1.0') {
  const name = currentPlatformAssetName(version);
  return new Response(JSON.stringify({
    tag_name: `v${version}`,
    html_url: `https://github.com/vladelaina/vlaina/releases/tag/v${version}`,
    assets: [{
      name,
      browser_download_url: `https://github.com/vladelaina/vlaina/releases/download/v${version}/${name}`,
      digest,
    }],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function createHarness({
  fetchImpl = vi.fn(async () => createManifestResponse()),
  platform = 'darwin',
  readTrustedDownloadedUpdateMetadataImpl = vi.fn(() => {
    throw new Error('No trusted downloaded update metadata.');
  }),
} = {}) {
  delete process.env.APP_DISTRIBUTION_CHANNEL;
  const handlers = new Map();
  const downloadUpdateAssetImpl = vi.fn().mockResolvedValue({
    filePath: '/updates/vlaina-installer',
    fileName: 'vlaina-installer',
    downloadedAt: '2026-07-18T00:00:00.000Z',
    sizeBytes: 10,
  });
  const normalizeDownloadedUpdateForOpenImpl = vi.fn().mockResolvedValue('/updates/vlaina-installer');
  const writeTrustedDownloadedUpdateMetadataImpl = vi.fn();
  const spawnedInstaller = { once: vi.fn(), unref: vi.fn() };
  const spawnImpl = vi.fn(() => spawnedInstaller);
  const shell = { openPath: vi.fn().mockResolvedValue('') };
  const app = {
    getVersion: () => '1.0.0',
    isPackaged: true,
    prependOnceListener: vi.fn(),
    quit: vi.fn(),
  };

  registerDesktopUpdateIpc({
    app,
    deleteDownloadedUpdateImpl: vi.fn(),
    downloadUpdateAssetImpl,
    fetchImpl,
    handleIpc: (channel, handler) => handlers.set(channel, handler),
    normalizeDownloadedUpdateForOpenImpl,
    platform,
    readTrustedDownloadedUpdateMetadataImpl,
    shell,
    spawnImpl,
    writeTrustedDownloadedUpdateMetadataImpl,
  });

  return {
    app,
    downloadUpdateAssetImpl,
    fetchImpl,
    handlers,
    normalizeDownloadedUpdateForOpenImpl,
    readTrustedDownloadedUpdateMetadataImpl,
    shell,
    spawnedInstaller,
    spawnImpl,
    writeTrustedDownloadedUpdateMetadataImpl,
  };
}

afterEach(() => {
  if (originalDistributionChannel === undefined) {
    delete process.env.APP_DISTRIBUTION_CHANNEL;
  } else {
    process.env.APP_DISTRIBUTION_CHANNEL = originalDistributionChannel;
  }
});

describe('desktop update IPC trust binding', () => {
  it('shares one manifest request across concurrent update checks', async () => {
    let resolveFetch;
    const fetchImpl = vi.fn(() => new Promise((resolve) => {
      resolveFetch = resolve;
    }));
    const harness = createHarness({ fetchImpl });

    const firstCheck = harness.handlers.get('desktop:update:check')();
    const secondCheck = harness.handlers.get('desktop:update:check')();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    resolveFetch(createManifestResponse());

    const [firstUpdateInfo, secondUpdateInfo] = await Promise.all([firstCheck, secondCheck]);
    expect(secondUpdateInfo).toEqual(firstUpdateInfo);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('downloads with main-process manifest data instead of renderer-owned fields', async () => {
    const harness = createHarness();
    const updateInfo = await harness.handlers.get('desktop:update:check')();

    await harness.handlers.get('desktop:update:download')(null, {
      ...updateInfo,
      releaseNotes: 'renderer replacement',
      downloadedFilePath: '/tmp/renderer-controlled',
    });

    expect(harness.downloadUpdateAssetImpl).toHaveBeenCalledWith(expect.objectContaining({
      updateInfo: expect.objectContaining({
        downloadUrl: updateInfo.downloadUrl,
        platformAssetSha256: 'c'.repeat(64),
        releaseNotes: '',
      }),
    }));
    expect(harness.downloadUpdateAssetImpl.mock.calls[0][0].updateInfo.downloadedFilePath).toBeUndefined();
    expect(harness.writeTrustedDownloadedUpdateMetadataImpl).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ platformAssetSha256: 'c'.repeat(64) }),
    );
  });

  it('rejects renderer update metadata that does not match the trusted manifest', async () => {
    const harness = createHarness();
    const updateInfo = await harness.handlers.get('desktop:update:check')();

    await expect(harness.handlers.get('desktop:update:download')(null, {
      ...updateInfo,
      downloadUrl: 'https://downloads.example.test/vlaina-malicious.exe',
    })).rejects.toThrow('does not match the trusted update manifest');

    expect(harness.downloadUpdateAssetImpl).not.toHaveBeenCalled();
  });

  it('opens only the installer derived from trusted manifest data', async () => {
    const harness = createHarness();
    const updateInfo = await harness.handlers.get('desktop:update:check')();

    await harness.handlers.get('desktop:update:open-downloaded')(null, {
      ...updateInfo,
      downloadedFilePath: '/tmp/renderer-controlled',
    });

    expect(harness.normalizeDownloadedUpdateForOpenImpl).toHaveBeenCalledWith(
      expect.any(Object),
      expect.not.objectContaining({ downloadedFilePath: '/tmp/renderer-controlled' }),
    );
    expect(harness.shell.openPath).toHaveBeenCalledWith('/updates/vlaina-installer');
  });

  it('finishes guarded macOS shutdown after opening a verified update image', async () => {
    const harness = createHarness({ platform: 'darwin' });
    const updateInfo = await harness.handlers.get('desktop:update:check')();

    await harness.handlers.get('desktop:update:open-downloaded')(null, updateInfo);

    expect(harness.shell.openPath).toHaveBeenCalledWith('/updates/vlaina-installer');
    expect(harness.app.prependOnceListener).toHaveBeenCalledWith('window-all-closed', expect.any(Function));
    expect(harness.app.quit).toHaveBeenCalledTimes(1);

    const finishQuitAfterClose = harness.app.prependOnceListener.mock.calls[0][1];
    finishQuitAfterClose();

    expect(harness.app.quit).toHaveBeenCalledTimes(2);
  });

  it('retries guarded macOS shutdown without reopening the update image', async () => {
    const harness = createHarness({ platform: 'darwin' });
    const updateInfo = await harness.handlers.get('desktop:update:check')();

    await harness.handlers.get('desktop:update:open-downloaded')(null, updateInfo);
    await harness.handlers.get('desktop:update:open-downloaded')(null, updateInfo);

    expect(harness.shell.openPath).toHaveBeenCalledTimes(1);
    expect(harness.app.prependOnceListener).toHaveBeenCalledTimes(1);
    expect(harness.app.quit).toHaveBeenCalledTimes(2);
  });

  it('waits for guarded window closure before launching a Windows update installer', async () => {
    const harness = createHarness({ platform: 'win32' });
    const updateInfo = await harness.handlers.get('desktop:update:check')();

    await harness.handlers.get('desktop:update:open-downloaded')(null, updateInfo);

    expect(harness.app.prependOnceListener).toHaveBeenCalledWith('window-all-closed', expect.any(Function));
    expect(harness.app.quit).toHaveBeenCalledTimes(1);
    expect(harness.spawnImpl).not.toHaveBeenCalled();
    expect(harness.shell.openPath).not.toHaveBeenCalled();

    const launchAfterClose = harness.app.prependOnceListener.mock.calls[0][1];
    launchAfterClose();

    expect(harness.spawnImpl).toHaveBeenCalledWith(
      '/updates/vlaina-installer',
      ['--updated'],
      { detached: true, stdio: 'ignore' },
    );
    expect(harness.spawnedInstaller.once).toHaveBeenCalledWith('error', expect.any(Function));
    expect(harness.spawnedInstaller.unref).toHaveBeenCalledTimes(1);
  });

  it('retries guarded Windows shutdown without scheduling a second installer', async () => {
    const harness = createHarness({ platform: 'win32' });
    const updateInfo = await harness.handlers.get('desktop:update:check')();

    await harness.handlers.get('desktop:update:open-downloaded')(null, updateInfo);
    await harness.handlers.get('desktop:update:open-downloaded')(null, updateInfo);

    expect(harness.app.prependOnceListener).toHaveBeenCalledTimes(1);
    expect(harness.app.quit).toHaveBeenCalledTimes(2);
    expect(harness.spawnImpl).not.toHaveBeenCalled();
  });

  it('rejects background downloads and local installer opens on Linux', async () => {
    const harness = createHarness({ platform: 'linux' });
    const updateInfo = await harness.handlers.get('desktop:update:check')();

    expect(updateInfo.updatePolicy).toMatchObject({
      backgroundDownloadEnabled: false,
      localInstallerEnabled: false,
      externalDownloadEnabled: true,
    });
    await expect(harness.handlers.get('desktop:update:download')(null, updateInfo))
      .rejects.toThrow('Background update downloads are disabled');
    await expect(harness.handlers.get('desktop:update:open-downloaded')(null, updateInfo))
      .rejects.toThrow('Opening downloaded update installers is disabled');
    expect(harness.downloadUpdateAssetImpl).not.toHaveBeenCalled();
    expect(harness.normalizeDownloadedUpdateForOpenImpl).not.toHaveBeenCalled();
    expect(harness.shell.openPath).not.toHaveBeenCalled();
  });

  it('can open a previously verified installer while the manifest service is offline', async () => {
    const version = '1.1.0';
    const platformAssetName = currentPlatformAssetName(version);
    const trustedMetadata = {
      latestVersion: version,
      platformAssetName,
      platformAssetSha256: 'c'.repeat(64),
      downloadUrl: `https://github.com/vladelaina/vlaina/releases/download/v${version}/${platformAssetName}`,
      hasPlatformAsset: true,
    };
    const readTrustedDownloadedUpdateMetadataImpl = vi.fn(() => trustedMetadata);
    const harness = createHarness({
      fetchImpl: vi.fn().mockRejectedValue(new Error('offline')),
      readTrustedDownloadedUpdateMetadataImpl,
    });

    await harness.handlers.get('desktop:update:open-downloaded')(null, trustedMetadata);

    expect(readTrustedDownloadedUpdateMetadataImpl).toHaveBeenCalled();
    expect(harness.normalizeDownloadedUpdateForOpenImpl).toHaveBeenCalledWith(
      expect.any(Object),
      trustedMetadata,
    );
    expect(harness.shell.openPath).toHaveBeenCalledWith('/updates/vlaina-installer');
  });

  it('does not open a cached installer when the online manifest has moved to another release', async () => {
    const version = '1.1.0';
    const platformAssetName = currentPlatformAssetName(version);
    const trustedMetadata = {
      latestVersion: version,
      platformAssetName,
      platformAssetSha256: 'c'.repeat(64),
      downloadUrl: `https://github.com/vladelaina/vlaina/releases/download/v${version}/${platformAssetName}`,
      hasPlatformAsset: true,
    };
    const readTrustedDownloadedUpdateMetadataImpl = vi.fn(() => trustedMetadata);
    const harness = createHarness({
      fetchImpl: vi.fn(async () => createManifestResponse('1.2.0')),
      readTrustedDownloadedUpdateMetadataImpl,
    });

    await expect(harness.handlers.get('desktop:update:open-downloaded')(null, trustedMetadata))
      .rejects.toThrow('does not match the trusted update manifest');

    expect(readTrustedDownloadedUpdateMetadataImpl).not.toHaveBeenCalled();
    expect(harness.normalizeDownloadedUpdateForOpenImpl).not.toHaveBeenCalled();
    expect(harness.shell.openPath).not.toHaveBeenCalled();
  });
});
