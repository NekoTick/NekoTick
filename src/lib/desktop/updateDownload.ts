import type { ElectronUpdateApi } from '@/lib/electron/bridge';
import {
  canBackgroundDownloadDesktopUpdate,
  clearCachedDesktopUpdateInfo,
  type DesktopUpdateInfo,
  isDesktopUpdateNewerThanCurrent,
  markDesktopUpdateDownloaded,
  markDesktopUpdateDownloadFailed,
  markDesktopUpdateDownloadStarted,
  readCachedDesktopUpdateInfo,
} from './updateStatus';

function updateDownloadIdentity(updateInfo: DesktopUpdateInfo) {
  return [
    updateInfo.latestVersion,
    updateInfo.platformAssetName,
    updateInfo.platformAssetSha256,
    updateInfo.downloadUrl,
  ].join('\n');
}

function preserveDownloadedUpdateState(updateInfo: DesktopUpdateInfo, cachedUpdateInfo: DesktopUpdateInfo | null) {
  if (
    !cachedUpdateInfo ||
    cachedUpdateInfo.downloadState !== 'downloaded' ||
    !cachedUpdateInfo.downloadedFilePath ||
    updateDownloadIdentity(cachedUpdateInfo) !== updateDownloadIdentity(updateInfo)
  ) {
    return updateInfo;
  }

  const preservedUpdateInfo: DesktopUpdateInfo = {
    ...updateInfo,
    downloadState: 'downloaded',
    downloadedFilePath: cachedUpdateInfo.downloadedFilePath,
    downloadError: '',
  };
  if (cachedUpdateInfo.downloadedFileName) {
    preservedUpdateInfo.downloadedFileName = cachedUpdateInfo.downloadedFileName;
  }
  if (cachedUpdateInfo.downloadedAt) {
    preservedUpdateInfo.downloadedAt = cachedUpdateInfo.downloadedAt;
  }
  return preservedUpdateInfo;
}

export async function clearStaleDesktopUpdateDownload(
  updateApi: Partial<ElectronUpdateApi>,
  updateInfo: DesktopUpdateInfo,
  currentVersion?: string
) {
  const cachedUpdateInfo = readCachedDesktopUpdateInfo();
  const cachedDownloadedUpdate = (
    cachedUpdateInfo?.downloadState === 'downloaded' && cachedUpdateInfo.downloadedFilePath
  ) ? cachedUpdateInfo : null;

  if (isDesktopUpdateNewerThanCurrent(updateInfo, currentVersion)) {
    if (cachedDownloadedUpdate && updateDownloadIdentity(cachedDownloadedUpdate) === updateDownloadIdentity(updateInfo)) {
      return preserveDownloadedUpdateState(updateInfo, cachedDownloadedUpdate);
    }
    if (cachedDownloadedUpdate) {
      try {
        await updateApi.deleteDownloaded?.(cachedDownloadedUpdate);
      } catch {
      }
    }
    return updateInfo;
  }

  try {
    await updateApi.deleteDownloaded?.(cachedDownloadedUpdate ?? updateInfo);
  } catch {
    // Local cache cleanup should still proceed if the downloaded file is already gone.
  }
  clearCachedDesktopUpdateInfo();
  return null;
}

export function startDesktopUpdateDownload(updateApi: ElectronUpdateApi, updateInfo: DesktopUpdateInfo) {
  if (
    typeof updateApi.download !== 'function' ||
    !updateInfo.updateAvailable ||
    !updateInfo.hasPlatformAsset ||
    !updateInfo.platformAssetSha256 ||
    updateInfo.simulated ||
    updateInfo.downloadState === 'downloaded' ||
    !canBackgroundDownloadDesktopUpdate(updateInfo) ||
    !isDesktopUpdateNewerThanCurrent(updateInfo)
  ) {
    return;
  }

  const startedIdentity = updateDownloadIdentity(updateInfo);
  markDesktopUpdateDownloadStarted(updateInfo);
  void updateApi.download(updateInfo)
    .then((downloadResult) => {
      const cachedUpdateInfo = readCachedDesktopUpdateInfo();
      if (!cachedUpdateInfo || updateDownloadIdentity(cachedUpdateInfo) !== startedIdentity) {
        return;
      }
      markDesktopUpdateDownloaded(cachedUpdateInfo, downloadResult);
    })
    .catch((error) => {
      const cachedUpdateInfo = readCachedDesktopUpdateInfo();
      if (!cachedUpdateInfo || updateDownloadIdentity(cachedUpdateInfo) !== startedIdentity) {
        return;
      }
      markDesktopUpdateDownloadFailed(cachedUpdateInfo, error);
    });
}
