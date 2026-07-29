import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { normalizeHttpUrl } from './externalUrlPolicy.mjs';
import { writeResponseBodyToFile } from './updateDownloadStream.mjs';
import {
  cleanupOldUpdateDownloads,
  getUpdateDownloadRoot,
  getUpdateDownloadTarget,
  isPathInside,
  normalizeUpdateAssetName,
  normalizeUpdateVersion,
  removeEmptyParentDirectories,
  requireString,
  requireUpdateAssetSha256,
} from './updateDownloadPaths.mjs';

const updateDownloadIdleTimeoutMs = process.env.NODE_ENV === 'test' ? 20 : 30_000;
export { cleanupOldUpdateDownloads, getUpdateDownloadRoot, normalizeUpdateAssetName } from './updateDownloadPaths.mjs';

function withUpdateDownloadIdleTimeout(task, message, onTimeout = () => {}) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try {
        onTimeout();
      } catch {
      }
      reject(new Error(message));
    }, updateDownloadIdleTimeoutMs);
  });

  return Promise.race([task, timeout]).finally(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }
  });
}

function getExistingTemporaryDownloadSize(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size > 0 ? stat.size : 0;
  } catch {
    return 0;
  }
}

function createUpdateDownloadRequestOptions(app, resumeFromBytes = 0, signal) {
  const headers = {
    accept: 'application/octet-stream',
    'user-agent': `vlaina/${app.getVersion()} desktop-update-downloader`,
  };

  if (resumeFromBytes > 0) {
    headers.range = `bytes=${resumeFromBytes}-`;
  }

  return {
    cache: 'no-store',
    headers,
    signal,
  };
}

async function fetchUpdateDownloadResponse({
  app,
  downloadUrl,
  fetchImpl,
  resumeFromBytes = 0,
  signal,
}) {
  const timeoutController = new AbortController();
  const requestSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;
  return await withUpdateDownloadIdleTimeout(
    fetchImpl(downloadUrl, createUpdateDownloadRequestOptions(app, resumeFromBytes, requestSignal)),
    'Update download timed out waiting for the server.',
    () => timeoutController.abort(),
  );
}

function getContentRangeStart(response) {
  const contentRange = response.headers.get('content-range') ?? '';
  const match = contentRange.match(/^bytes\s+(\d+)-/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

async function calculateFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('close', resolve);
  });
  return hash.digest('hex');
}

async function verifyDownloadedUpdateSha256(filePath, expectedSha256) {
  if (!expectedSha256) return;
  const actualSha256 = await calculateFileSha256(filePath);
  if (actualSha256 !== expectedSha256) {
    throw new Error('Downloaded update SHA-256 does not match.');
  }
}

export async function downloadUpdateAsset({
  app,
  updateInfo,
  fetchImpl,
  signal,
}) {
  if (!updateInfo?.hasPlatformAsset) {
    throw new Error('No platform update asset is available.');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('Update download fetch implementation is required.');
  }

  const downloadUrl = normalizeHttpUrl(updateInfo.downloadUrl, 'Update download URL');
  const expectedSha256 = requireUpdateAssetSha256(updateInfo.platformAssetSha256);
  const target = getUpdateDownloadTarget(app, updateInfo);

  cleanupOldUpdateDownloads(app, target.version);
  fs.mkdirSync(target.directoryPath, { recursive: true });
  if (fs.existsSync(target.filePath)) {
    const stat = fs.statSync(target.filePath);
    if (stat.isFile() && stat.size > 0) {
      try {
        await verifyDownloadedUpdateSha256(target.filePath, expectedSha256);
        return {
          filePath: target.filePath,
          fileName: target.assetName,
          downloadedAt: stat.mtime.toISOString(),
          sizeBytes: stat.size,
        };
      } catch {
        fs.rmSync(target.filePath, { force: true });
        fs.rmSync(target.temporaryFilePath, { force: true });
      }
    }
  }

  let resumeFromBytes = getExistingTemporaryDownloadSize(target.temporaryFilePath);
  let response = await fetchUpdateDownloadResponse({
    app,
    downloadUrl,
    fetchImpl,
    resumeFromBytes,
    signal,
  });

  if (resumeFromBytes > 0 && response.status === 416) {
    fs.rmSync(target.temporaryFilePath, { force: true });
    resumeFromBytes = 0;
    response = await fetchUpdateDownloadResponse({
      app,
      downloadUrl,
      fetchImpl,
      resumeFromBytes,
      signal,
    });
  } else if (resumeFromBytes > 0 && response.status === 206 && getContentRangeStart(response) !== resumeFromBytes) {
    fs.rmSync(target.temporaryFilePath, { force: true });
    resumeFromBytes = 0;
    response = await fetchUpdateDownloadResponse({
      app,
      downloadUrl,
      fetchImpl,
      resumeFromBytes,
      signal,
    });
  } else if (resumeFromBytes > 0 && response.status !== 206) {
    fs.rmSync(target.temporaryFilePath, { force: true });
    resumeFromBytes = 0;
  }

  if (!response.ok) {
    throw new Error(`Update download failed: HTTP ${response.status}`);
  }

  try {
    const sizeBytes = await writeResponseBodyToFile(response, target.temporaryFilePath, {
      append: resumeFromBytes > 0 && response.status === 206,
      existingBytes: resumeFromBytes,
    });
    fs.renameSync(target.temporaryFilePath, target.filePath);
    if (process.platform === 'linux' && target.assetName.toLowerCase().endsWith('.appimage')) {
      fs.chmodSync(target.filePath, 0o755);
    }
    try {
      await verifyDownloadedUpdateSha256(target.filePath, expectedSha256);
    } catch (error) {
      fs.rmSync(target.filePath, { force: true });
      throw error;
    }
    const stat = fs.statSync(target.filePath);
    return {
      filePath: target.filePath,
      fileName: target.assetName,
      downloadedAt: stat.mtime.toISOString(),
      sizeBytes,
    };
  } catch (error) {
    throw error;
  }
}

export function normalizeDownloadedUpdatePath(app, filePath) {
  const root = getUpdateDownloadRoot(app);
  const resolvedPath = path.resolve(requireString(filePath, 'Downloaded update path'));
  if (!isPathInside(root, resolvedPath)) {
    throw new Error('Downloaded update path is not allowed.');
  }
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) {
    throw new Error('Downloaded update path is not a file.');
  }
  normalizeUpdateAssetName(path.basename(resolvedPath));
  return resolvedPath;
}

export async function normalizeDownloadedUpdateForOpen(app, updateInfo) {
  if (!updateInfo?.hasPlatformAsset) {
    throw new Error('No platform update asset is available.');
  }

  const expectedSha256 = requireUpdateAssetSha256(updateInfo.platformAssetSha256);
  const target = getUpdateDownloadTarget(app, updateInfo);
  const resolvedDownloadedPath = typeof updateInfo.downloadedFilePath === 'string' && updateInfo.downloadedFilePath.trim()
    ? path.resolve(updateInfo.downloadedFilePath)
    : '';
  if (resolvedDownloadedPath && resolvedDownloadedPath !== target.filePath) {
    throw new Error('Downloaded update path does not match the requested update.');
  }

  const stat = fs.statSync(target.filePath);
  if (!stat.isFile() || stat.size <= 0) {
    throw new Error('Downloaded update path is not a file.');
  }
  await verifyDownloadedUpdateSha256(target.filePath, expectedSha256);
  return target.filePath;
}

export function deleteDownloadedUpdate(app, updateInfoOrFilePath) {
  const root = getUpdateDownloadRoot(app);

  if (typeof updateInfoOrFilePath === 'string') {
    const resolvedPath = path.resolve(requireString(updateInfoOrFilePath, 'Downloaded update path'));
    if (!isPathInside(root, resolvedPath)) {
      throw new Error('Downloaded update path is not allowed.');
    }
    normalizeUpdateAssetName(path.basename(resolvedPath));
    fs.rmSync(resolvedPath, { force: true });
    fs.rmSync(`${resolvedPath}.download`, { force: true });
    removeEmptyParentDirectories(root, path.dirname(resolvedPath));
    return;
  }

  const version = normalizeUpdateVersion(updateInfoOrFilePath?.latestVersion);
  const directoryPath = path.join(root, version);
  if (!isPathInside(root, directoryPath)) {
    throw new Error('Downloaded update path is not allowed.');
  }
  fs.rmSync(directoryPath, { force: true, recursive: true });
}
