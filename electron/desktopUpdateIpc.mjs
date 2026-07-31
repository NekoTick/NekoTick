import { spawn } from 'node:child_process';
import { readBoundedJsonResponse } from './boundedJsonResponse.mjs';
import {
  compareVersions,
  fetchUpdateManifest as fetchDesktopUpdateManifest,
  normalizeReleaseVersion,
} from './updateManifest.mjs';
import { deleteDownloadedUpdate, downloadUpdateAsset, normalizeDownloadedUpdateForOpen } from './updateDownload.mjs';
import { readTrustedDownloadedUpdateMetadata, writeTrustedDownloadedUpdateMetadata } from './updateMetadata.mjs';
import { resolveDesktopUpdatePolicy } from './updatePolicy.mjs';

const updateManifestUrl = (
  process.env.APP_UPDATE_MANIFEST_URL
  ?? 'https://vlaina.com/api/update/latest'
).trim();
const defaultDownloadUrl = (
  process.env.APP_DOWNLOAD_URL
  ?? 'https://vlaina.com/download'
).trim();
const updateManifestRetryDelaysMs = [300, 1000];

class UpdateManifestMismatchError extends Error {}

function launchWindowsUpdateInstaller(filePath, spawnImpl) {
  const child = spawnImpl(filePath, ['--updated'], {
    detached: true,
    stdio: 'ignore',
  });
  child.once('error', (error) => {
    console.error('[vlaina] Failed to launch the Windows update installer:', error);
  });
  child.unref();
}

export function registerDesktopUpdateIpc({
  app,
  deleteDownloadedUpdateImpl = deleteDownloadedUpdate,
  downloadUpdateAssetImpl = downloadUpdateAsset,
  fetchImpl,
  handleIpc,
  normalizeDownloadedUpdateForOpenImpl = normalizeDownloadedUpdateForOpen,
  platform = process.platform,
  readTrustedDownloadedUpdateMetadataImpl = readTrustedDownloadedUpdateMetadata,
  shell,
  spawnImpl = spawn,
  writeTrustedDownloadedUpdateMetadataImpl = writeTrustedDownloadedUpdateMetadata,
}) {
  const desktopUpdatePolicy = resolveDesktopUpdatePolicy(process.env, {
    platform,
    windowsStore: process.windowsStore,
  });
  let pendingMacUpdateImagePath = null;
  let pendingWindowsInstallerPath = null;
  let updateDownloadJob = null;
  let updateManifestJob = null;
  let trustedUpdateInfo = null;

  async function fetchUpdateManifest() {
    if (updateManifestJob) {
      return await updateManifestJob;
    }

    const promise = fetchDesktopUpdateManifest({
      manifestUrl: updateManifestUrl,
      defaultDownloadUrl,
      appVersion: app.getVersion(),
      fetchImpl,
      readJsonResponse: readBoundedJsonResponse,
      allowLocalManifestUrl: !app.isPackaged,
      retryDelaysMs: updateManifestRetryDelaysMs,
    });
    updateManifestJob = promise;
    try {
      return await promise;
    } finally {
      if (updateManifestJob === promise) {
        updateManifestJob = null;
      }
    }
  }

  function createUpdateInfo(manifest) {
    const currentVersion = app.getVersion();
    return {
      currentVersion,
      ...manifest,
      updateAvailable: compareVersions(manifest.latestVersion, currentVersion) > 0,
      updatePolicy: desktopUpdatePolicy,
    };
  }

  function updateRequestMatchesTrustedInfo(requestedUpdateInfo, candidate) {
    return (
      normalizeReleaseVersion(requestedUpdateInfo?.latestVersion) === candidate.latestVersion &&
      requestedUpdateInfo?.platformAssetName === candidate.platformAssetName &&
      requestedUpdateInfo?.platformAssetSha256 === candidate.platformAssetSha256 &&
      requestedUpdateInfo?.downloadUrl === candidate.downloadUrl
    );
  }

  async function resolveTrustedUpdateInfo(requestedUpdateInfo) {
    if (trustedUpdateInfo && updateRequestMatchesTrustedInfo(requestedUpdateInfo, trustedUpdateInfo)) {
      return trustedUpdateInfo;
    }

    const candidate = createUpdateInfo(await fetchUpdateManifest());
    trustedUpdateInfo = candidate;
    if (!updateRequestMatchesTrustedInfo(requestedUpdateInfo, candidate)) {
      throw new UpdateManifestMismatchError('Requested update does not match the trusted update manifest.');
    }
    return candidate;
  }

  handleIpc('desktop:update:check', async () => {
    const currentVersion = app.getVersion();
    if (!desktopUpdatePolicy.checkEnabled) {
      return {
        currentVersion,
        latestVersion: currentVersion,
        updateAvailable: false,
        downloadUrl: '',
        releaseUrl: '',
        platformAssetName: '',
        platformAssetSha256: '',
        hasPlatformAsset: false,
        releaseNotes: '',
        publishedAt: '',
        updatePolicy: desktopUpdatePolicy,
      };
    }

    const updateInfo = createUpdateInfo(await fetchUpdateManifest());
    trustedUpdateInfo = updateInfo;
    return updateInfo;
  });

  handleIpc('desktop:update:get-policy', async () => desktopUpdatePolicy);

  handleIpc('desktop:update:download', async (_event, requestedUpdateInfo) => {
    if (!desktopUpdatePolicy.backgroundDownloadEnabled) {
      throw new Error('Background update downloads are disabled for this distribution.');
    }
    const updateInfo = await resolveTrustedUpdateInfo(requestedUpdateInfo);
    if (!updateInfo?.hasPlatformAsset) {
      throw new Error('No platform update asset is available.');
    }
    if (!updateInfo?.platformAssetSha256) {
      throw new Error('Update asset SHA-256 is required.');
    }
    if (compareVersions(updateInfo.latestVersion, app.getVersion()) <= 0) {
      throw new Error('Update version is not newer than the current app version.');
    }

    const downloadKey = [
      updateInfo?.latestVersion,
      updateInfo?.platformAssetName,
      updateInfo?.platformAssetSha256,
      updateInfo?.downloadUrl,
    ].join('\n');

    if (updateDownloadJob) {
      if (updateDownloadJob.key === downloadKey) {
        return await updateDownloadJob.promise;
      }
      updateDownloadJob.controller.abort();
      await updateDownloadJob.promise.catch(() => {
      });
    }

    const controller = new AbortController();
    const promise = downloadUpdateAssetImpl({
      app,
      updateInfo,
      fetchImpl,
      signal: controller.signal,
    }).then((result) => {
      writeTrustedDownloadedUpdateMetadataImpl(app, updateInfo);
      return result;
    });
    updateDownloadJob = { key: downloadKey, promise, controller };

    try {
      return await promise;
    } finally {
      if (updateDownloadJob?.promise === promise) {
        updateDownloadJob = null;
      }
    }
  });

  handleIpc('desktop:update:open-downloaded', async (_event, requestedUpdateInfo) => {
    if (!desktopUpdatePolicy.localInstallerEnabled) {
      throw new Error('Opening downloaded update installers is disabled for this distribution.');
    }

    let updateInfo;
    try {
      updateInfo = await resolveTrustedUpdateInfo(requestedUpdateInfo);
    } catch (error) {
      if (error instanceof UpdateManifestMismatchError) {
        throw error;
      }
      updateInfo = readTrustedDownloadedUpdateMetadataImpl(app, requestedUpdateInfo);
    }
    if (compareVersions(updateInfo.latestVersion, app.getVersion()) <= 0) {
      throw new Error('Update version is not newer than the current app version.');
    }
    const normalizedPath = await normalizeDownloadedUpdateForOpenImpl(app, updateInfo);

    if (platform === 'win32') {
      if (pendingWindowsInstallerPath) {
        if (pendingWindowsInstallerPath !== normalizedPath) {
          throw new Error('Another Windows update installer is already pending.');
        }
        app.quit();
        return;
      }

      pendingWindowsInstallerPath = normalizedPath;
      app.prependOnceListener('window-all-closed', () => {
        const installerPath = pendingWindowsInstallerPath;
        pendingWindowsInstallerPath = null;
        try {
          launchWindowsUpdateInstaller(installerPath, spawnImpl);
        } catch (error) {
          console.error('[vlaina] Failed to launch the Windows update installer:', error);
        }
      });
      app.quit();
      return;
    }

    if (platform === 'darwin') {
      if (pendingMacUpdateImagePath) {
        if (pendingMacUpdateImagePath !== normalizedPath) {
          throw new Error('Another macOS update image is already pending.');
        }
        app.quit();
        return;
      }

      const result = await shell.openPath(normalizedPath);
      if (result) {
        throw new Error(result);
      }

      pendingMacUpdateImagePath = normalizedPath;
      app.prependOnceListener('window-all-closed', () => {
        pendingMacUpdateImagePath = null;
        app.quit();
      });
      app.quit();
      return;
    }

    const result = await shell.openPath(normalizedPath);
    if (result) {
      throw new Error(result);
    }
  });

  handleIpc('desktop:update:delete-downloaded', async (_event, updateInfoOrFilePath) => {
    if (!desktopUpdatePolicy.cleanupDownloadedUpdatesEnabled) {
      return;
    }
    deleteDownloadedUpdateImpl(app, updateInfoOrFilePath);
  });
}
