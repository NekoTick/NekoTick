import { describe, expect, it, vi } from 'vitest';
import {
  compareVersions,
  fetchUpdateManifest,
  normalizeReleaseAssets,
  normalizeUpdateManifest,
  selectCurrentPlatformAsset,
} from '../../electron/updateManifest.mjs';

describe('electron update manifest helpers', () => {
  it('compares release versions with prerelease and build metadata rules', () => {
    expect(compareVersions('v1.2.3', '1.2.2')).toBe(1);
    expect(compareVersions('1.2.3+build.2', '1.2.3+build.1')).toBe(0);
    expect(compareVersions('1.2.3', '1.2.3-beta.10')).toBe(1);
    expect(compareVersions('1.2.3-beta.10', '1.2.3-beta.2')).toBe(1);
    expect(compareVersions('1.2.3-beta.2', '1.2.3-beta.10')).toBe(-1);
  });

  it('normalizes GitHub releases and chooses the current platform asset', () => {
    expect(normalizeUpdateManifest({
      tag_name: 'v1.2.3',
      html_url: 'https://github.com/vladelaina/vlaina/releases/tag/v1.2.3',
      body: 'Release notes',
      published_at: '2026-06-24T00:00:00.000Z',
      assets: [
        {
          name: 'vlaina-1.2.3-linux-arm64.AppImage',
          browser_download_url: 'https://github.com/vladelaina/vlaina/releases/download/v1.2.3/vlaina-1.2.3-linux-arm64.AppImage',
        },
        {
          name: 'vlaina-1.2.3-linux-x86_64.AppImage',
          browser_download_url: 'https://github.com/vladelaina/vlaina/releases/download/v1.2.3/vlaina-1.2.3-linux-x86_64.AppImage',
          digest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      ],
    }, {
      defaultDownloadUrl: 'https://github.com/vladelaina/vlaina/releases/latest',
      platform: 'linux',
      arch: 'x64',
    })).toEqual({
      latestVersion: '1.2.3',
      downloadUrl: 'https://github.com/vladelaina/vlaina/releases/download/v1.2.3/vlaina-1.2.3-linux-x86_64.AppImage',
      releaseUrl: 'https://github.com/vladelaina/vlaina/releases/tag/v1.2.3',
      platformAssetName: 'vlaina-1.2.3-linux-x86_64.AppImage',
      platformAssetSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      hasPlatformAsset: true,
      releaseNotes: 'Release notes',
      publishedAt: '2026-06-24T00:00:00.000Z',
    });
  });

  it('selects accurate package URLs for each supported desktop platform and architecture', () => {
    const payload = {
      tag_name: 'v0.1.16',
      html_url: 'https://github.com/vladelaina/vlaina/releases/tag/v0.1.16',
      assets: [
        {
          name: 'vlaina-0.1.16-windows-x64-setup.exe',
          browser_download_url: 'https://github.com/vladelaina/vlaina/releases/download/v0.1.16/vlaina-0.1.16-windows-x64-setup.exe',
        },
        {
          name: 'vlaina-0.1.16-windows-x64-portable.exe',
          browser_download_url: 'https://github.com/vladelaina/vlaina/releases/download/v0.1.16/vlaina-0.1.16-windows-x64-portable.exe',
        },
        {
          name: 'vlaina-0.1.16-windows-arm64-setup.exe',
          browser_download_url: 'https://github.com/vladelaina/vlaina/releases/download/v0.1.16/vlaina-0.1.16-windows-arm64-setup.exe',
        },
        {
          name: 'vlaina-0.1.16-mac-x64.dmg',
          browser_download_url: 'https://github.com/vladelaina/vlaina/releases/download/v0.1.16/vlaina-0.1.16-mac-x64.dmg',
        },
        {
          name: 'vlaina-0.1.16-mac-arm64.zip',
          browser_download_url: 'https://github.com/vladelaina/vlaina/releases/download/v0.1.16/vlaina-0.1.16-mac-arm64.zip',
        },
        {
          name: 'vlaina-0.1.16-mac-arm64.dmg',
          browser_download_url: 'https://github.com/vladelaina/vlaina/releases/download/v0.1.16/vlaina-0.1.16-mac-arm64.dmg',
        },
        {
          name: 'vlaina-0.1.16-linux-x86_64.AppImage',
          browser_download_url: 'https://github.com/vladelaina/vlaina/releases/download/v0.1.16/vlaina-0.1.16-linux-x86_64.AppImage',
        },
        {
          name: 'vlaina-0.1.16-linux-x64.deb',
          browser_download_url: 'https://github.com/vladelaina/vlaina/releases/download/v0.1.16/vlaina-0.1.16-linux-x64.deb',
        },
        {
          name: 'vlaina-0.1.16-linux-arm64.tar.gz',
          browser_download_url: 'https://github.com/vladelaina/vlaina/releases/download/v0.1.16/vlaina-0.1.16-linux-arm64.tar.gz',
        },
        {
          name: 'vlaina-0.1.16-linux-arm64.AppImage',
          browser_download_url: 'https://github.com/vladelaina/vlaina/releases/download/v0.1.16/vlaina-0.1.16-linux-arm64.AppImage',
        },
      ],
    };
    const cases = [
      ['win32', 'x64', 'vlaina-0.1.16-windows-x64-setup.exe'],
      ['win32', 'arm64', 'vlaina-0.1.16-windows-arm64-setup.exe'],
      ['darwin', 'x64', 'vlaina-0.1.16-mac-x64.dmg'],
      ['darwin', 'arm64', 'vlaina-0.1.16-mac-arm64.dmg'],
      ['linux', 'x64', 'vlaina-0.1.16-linux-x86_64.AppImage'],
      ['linux', 'arm64', 'vlaina-0.1.16-linux-arm64.AppImage'],
    ];

    for (const [platform, arch, expectedAssetName] of cases) {
      const manifest = normalizeUpdateManifest(payload, {
        defaultDownloadUrl: 'https://github.com/vladelaina/vlaina/releases/latest',
        platform,
        arch,
      });

      expect(manifest).toMatchObject({
        latestVersion: '0.1.16',
        platformAssetName: expectedAssetName,
        platformAssetSha256: '',
        hasPlatformAsset: true,
        downloadUrl: `https://github.com/vladelaina/vlaina/releases/download/v0.1.16/${expectedAssetName}`,
      });
    }
  });

  it('does not select a known wrong-architecture platform asset', () => {
    const assets = normalizeReleaseAssets([
      {
        name: 'vlaina-1.2.3-linux-arm64.AppImage',
        browser_download_url: 'https://example.com/arm64.AppImage',
      },
    ]);

    expect(selectCurrentPlatformAsset(assets, { platform: 'linux', arch: 'x64' })).toBeNull();
  });

  it('does not select unrelated, wrong-platform, or wrong-version release assets', () => {
    const releaseUrl = 'https://github.com/vladelaina/vlaina/releases/tag/v1.2.3';
    expect(normalizeUpdateManifest({
      version: '1.2.3',
      downloadUrl: releaseUrl,
      assets: [
        {
          name: 'other-1.2.3-windows-x64-setup.exe',
          browser_download_url: 'https://example.com/other-1.2.3-windows-x64-setup.exe',
        },
        {
          name: 'vlaina-1.2.2-windows-x64-setup.exe',
          browser_download_url: 'https://example.com/vlaina-1.2.2-windows-x64-setup.exe',
        },
        {
          name: 'vlaina-1.2.3-linux-x64-setup.exe',
          browser_download_url: 'https://example.com/vlaina-1.2.3-linux-x64-setup.exe',
        },
      ],
    }, {
      defaultDownloadUrl: releaseUrl,
      platform: 'win32',
      arch: 'x64',
    })).toMatchObject({
      downloadUrl: releaseUrl,
      platformAssetName: '',
      hasPlatformAsset: false,
    });
  });

  it('rejects malformed release versions', () => {
    expect(() => normalizeUpdateManifest({
      version: 'next-release',
      downloadUrl: 'https://example.com/releases/latest',
    }, {
      defaultDownloadUrl: 'https://example.com/releases/latest',
      platform: 'linux',
      arch: 'x64',
    })).toThrow('latest version is invalid');
  });

  it('ignores malformed release assets without failing the whole update check', () => {
    expect(normalizeUpdateManifest({
      version: '1.2.3',
      downloadUrl: 'https://example.com/releases/latest',
      assets: [
        { name: 'vlaina-1.2.3-linux-x64.AppImage', browser_download_url: 'file:///tmp/app.AppImage' },
        { name: 'vlaina-1.2.3-linux-x64.AppImage', browser_download_url: 'https://example.com/app.AppImage' },
      ],
    }, {
      defaultDownloadUrl: 'https://example.com/releases/latest',
      platform: 'linux',
      arch: 'x64',
    }).downloadUrl).toBe('https://example.com/app.AppImage');
  });

  it('normalizes platform asset sha256 values from supported manifest fields', () => {
    expect(normalizeUpdateManifest({
      version: '1.2.3',
      downloadUrl: 'https://example.com/releases/latest',
      assets: [
        {
          name: 'vlaina-1.2.3-linux-x64.AppImage',
          downloadUrl: 'https://example.com/app.AppImage',
          sha256: 'SHA256:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        },
      ],
    }, {
      defaultDownloadUrl: 'https://example.com/releases/latest',
      platform: 'linux',
      arch: 'x64',
    }).platformAssetSha256).toBe('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  });

  it('fetches the manifest with bounded JSON parsing and updater headers', async () => {
    const response = { ok: true, status: 200 };
    const fetchImpl = vi.fn().mockResolvedValue(response);
    const readJsonResponse = vi.fn().mockResolvedValue({
      version: '1.2.3',
      downloadUrl: 'https://example.com/releases/latest',
    });

    await expect(fetchUpdateManifest({
      manifestUrl: 'https://example.com/update.json',
      defaultDownloadUrl: 'https://example.com/releases/latest',
      appVersion: '1.0.0',
      fetchImpl,
      readJsonResponse,
      timeoutMs: 1000,
    })).resolves.toMatchObject({
      latestVersion: '1.2.3',
      downloadUrl: 'https://example.com/releases/latest',
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/update.json', expect.objectContaining({
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'user-agent': 'vlaina/1.0.0 desktop-updater',
      },
    }));
    expect(readJsonResponse).toHaveBeenCalledWith(response, expect.objectContaining({
      tooLargeMessage: 'Update manifest response body is too large.',
    }));
  });

  it('keeps local update manifest URLs opt-in for development and e2e', async () => {
    const response = { ok: true, status: 200 };
    const fetchImpl = vi.fn().mockResolvedValue(response);
    const readJsonResponse = vi.fn().mockResolvedValue({
      version: '1.2.3',
      downloadUrl: 'https://example.com/releases/latest',
    });
    const input = {
      manifestUrl: 'http://127.0.0.1:3100/latest',
      defaultDownloadUrl: 'https://example.com/releases/latest',
      appVersion: '1.0.0',
      fetchImpl,
      readJsonResponse,
      timeoutMs: 1000,
    };

    await expect(fetchUpdateManifest(input)).rejects.toThrow('Local-network external URLs are not allowed');
    expect(fetchImpl).not.toHaveBeenCalled();

    await expect(fetchUpdateManifest({
      ...input,
      allowLocalManifestUrl: true,
    })).resolves.toMatchObject({
      latestVersion: '1.2.3',
    });

    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:3100/latest', expect.objectContaining({
      headers: expect.objectContaining({
        'user-agent': 'vlaina/1.0.0 desktop-updater',
      }),
    }));
  });

  it('surfaces HTTP update manifest failures', async () => {
    await expect(fetchUpdateManifest({
      manifestUrl: 'https://example.com/update.json',
      defaultDownloadUrl: 'https://example.com/releases/latest',
      appVersion: '1.0.0',
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 503 }),
      readJsonResponse: vi.fn(),
      timeoutMs: 1000,
    })).rejects.toThrow('Update manifest request failed: HTTP 503');
  });

  it('retries transient update manifest failures before returning a release', async () => {
    const firstResponse = { ok: false, status: 502 };
    const secondResponse = { ok: true, status: 200 };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse);
    const readJsonResponse = vi.fn().mockResolvedValue({
      version: '1.2.3',
      downloadUrl: 'https://example.com/releases/latest',
    });

    await expect(fetchUpdateManifest({
      manifestUrl: 'https://example.com/update.json',
      defaultDownloadUrl: 'https://example.com/releases/latest',
      appVersion: '1.0.0',
      fetchImpl,
      readJsonResponse,
      timeoutMs: 1000,
      retryDelaysMs: [0],
    })).resolves.toMatchObject({
      latestVersion: '1.2.3',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(readJsonResponse).toHaveBeenCalledWith(secondResponse, expect.objectContaining({
      tooLargeMessage: 'Update manifest response body is too large.',
    }));
  });
});
