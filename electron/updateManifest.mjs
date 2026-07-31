import { normalizeHttpUrl } from './externalUrlPolicy.mjs';
import { normalizeReleaseVersion } from './updateManifestVersion.mjs';

export { compareVersions, normalizeReleaseVersion } from './updateManifestVersion.mjs';

const knownArchAliases = ['x64', 'x86_64', 'amd64', 'arm64', 'aarch64', 'ia32', 'x86'];
const validReleaseVersionPattern = /^\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
}

function splitReleaseAssetNameParts(name) {
  return String(name ?? '')
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(Boolean);
}

export function getCurrentAssetArchAliases(arch = process.arch) {
  if (arch === 'x64') return ['x64', 'x86_64', 'amd64'];
  if (arch === 'arm64') return ['arm64', 'aarch64'];
  if (arch === 'ia32') return ['ia32', 'x86'];
  return [arch];
}

function releaseAssetPartsIncludeAny(parts, aliases) {
  return aliases.some((alias) => parts.includes(alias));
}

function normalizeAssetSha256(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase().replace(/^sha256:/, '');
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : '';
}

function isRetryableUpdateManifestStatus(status) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeReleaseAssets(rawAssets) {
  if (!Array.isArray(rawAssets)) {
    return [];
  }

  return rawAssets
    .map((asset) => {
      if (!asset || typeof asset !== 'object') {
        return null;
      }

      const name = typeof asset.name === 'string' ? asset.name : '';
      const downloadUrl = typeof asset.browser_download_url === 'string'
        ? asset.browser_download_url
        : typeof asset.downloadUrl === 'string'
          ? asset.downloadUrl
          : '';

      if (!name || !downloadUrl) {
        return null;
      }

      try {
        return {
          name,
          downloadUrl: normalizeHttpUrl(downloadUrl, 'Release asset URL'),
          sha256: normalizeAssetSha256(
            asset.sha256 ?? asset.checksum ?? asset.digest
          ),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function getCurrentPlatformAssetPriority(platform = process.platform) {
  if (platform === 'win32') {
    return [
      (name) => name.endsWith('.exe') && name.includes('setup') && !name.includes('portable'),
      (name) => name.endsWith('.exe') && !name.includes('portable'),
      (name) => name.endsWith('.exe'),
    ];
  }

  if (platform === 'darwin') {
    return [
      (name) => name.endsWith('.dmg'),
      (name) => name.endsWith('.zip'),
    ];
  }

  if (platform === 'linux') {
    return [
      (name) => name.endsWith('.appimage'),
      (name) => name.endsWith('.deb'),
      (name) => name.endsWith('.tar.gz'),
    ];
  }

  return [];
}

function getCurrentPlatformAssetMarker(platform = process.platform) {
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'mac';
  if (platform === 'linux') return 'linux';
  return '';
}

export function selectCurrentPlatformAsset(assets, {
  platform = process.platform,
  arch = process.arch,
} = {}) {
  const platformPriority = getCurrentPlatformAssetPriority(platform);
  const platformMarker = getCurrentPlatformAssetMarker(platform);
  const normalizedAssets = assets.map((asset) => ({
    ...asset,
    normalizedName: asset.name.toLowerCase(),
    nameParts: splitReleaseAssetNameParts(asset.name),
  }));
  const platformAssets = normalizedAssets.filter((asset) =>
    asset.nameParts.includes(platformMarker) &&
    platformPriority.some((matchesAsset) => matchesAsset(asset.normalizedName))
  );
  const currentArchAliases = getCurrentAssetArchAliases(arch);
  const currentArchAssets = platformAssets.filter((asset) =>
    releaseAssetPartsIncludeAny(asset.nameParts, currentArchAliases)
  );
  const platformAssetsWithKnownArch = platformAssets.filter((asset) =>
    releaseAssetPartsIncludeAny(asset.nameParts, knownArchAliases)
  );
  const candidateAssets = currentArchAssets.length > 0
    ? currentArchAssets
    : platformAssetsWithKnownArch.length > 0
      ? []
      : platformAssets;

  for (const matchesAsset of platformPriority) {
    const match = candidateAssets.find((asset) => matchesAsset(asset.normalizedName));
    if (match) {
      return {
        name: match.name,
        downloadUrl: match.downloadUrl,
        sha256: match.sha256 ?? '',
      };
    }
  }

  return null;
}

export function normalizeUpdateManifest(payload, {
  defaultDownloadUrl,
  platform = process.platform,
  arch = process.arch,
} = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Update manifest must be a JSON object.');
  }

  const latestVersion = requireNonEmptyString(
    payload.version ?? payload.tag_name,
    'latest version'
  ).trim();
  const normalizedLatestVersion = normalizeReleaseVersion(latestVersion);
  if (!validReleaseVersionPattern.test(normalizedLatestVersion)) {
    throw new Error('latest version is invalid.');
  }
  const releaseUrl = normalizeHttpUrl(
    payload.downloadUrl ?? payload.html_url ?? defaultDownloadUrl,
    'Download URL'
  );
  const releaseAssetPrefix = `vlaina-${normalizedLatestVersion.toLowerCase()}-`;
  const assets = normalizeReleaseAssets(payload.assets).filter((asset) =>
    asset.name.toLowerCase().startsWith(releaseAssetPrefix)
  );
  const platformAsset = selectCurrentPlatformAsset(assets, { platform, arch });
  const releaseNotes = typeof payload.releaseNotes === 'string'
    ? payload.releaseNotes
    : typeof payload.body === 'string'
      ? payload.body
      : '';
  const publishedAt = typeof payload.publishedAt === 'string'
    ? payload.publishedAt
    : typeof payload.published_at === 'string'
      ? payload.published_at
      : '';

  return {
    latestVersion: normalizedLatestVersion,
    downloadUrl: platformAsset?.downloadUrl ?? releaseUrl,
    releaseUrl,
    platformAssetName: platformAsset?.name ?? '',
    platformAssetSha256: platformAsset?.sha256 ?? '',
    hasPlatformAsset: Boolean(platformAsset),
    releaseNotes,
    publishedAt,
  };
}

export async function fetchUpdateManifest({
  manifestUrl,
  defaultDownloadUrl,
  appVersion,
  fetchImpl = fetch,
  readJsonResponse,
  timeoutMs = 8000,
  allowLocalManifestUrl = false,
  retryDelaysMs = [],
}) {
  if (typeof readJsonResponse !== 'function') {
    throw new Error('Update manifest JSON reader must be provided.');
  }

  const normalizedManifestUrl = normalizeHttpUrl(manifestUrl, 'Update manifest URL', {
    allowLocalNetwork: allowLocalManifestUrl,
  });

  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(normalizedManifestUrl, {
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'user-agent': `vlaina/${appVersion} desktop-updater`,
        },
      });

      if (!response.ok) {
        throw new Error(`Update manifest request failed: HTTP ${response.status}`, {
          cause: { retryable: isRetryableUpdateManifestStatus(response.status) },
        });
      }

      return normalizeUpdateManifest(await readJsonResponse(response, {
        signal: controller.signal,
        tooLargeMessage: 'Update manifest response body is too large.',
      }), { defaultDownloadUrl });
    } catch (error) {
      const retryDelayMs = retryDelaysMs[attempt];
      const retryable = error?.cause?.retryable === true || error?.name === 'AbortError' || error instanceof TypeError;
      if (retryDelayMs == null || !retryable) {
        throw error;
      }
      await delay(retryDelayMs);
    } finally {
      clearTimeout(timeout);
    }
  }
}
