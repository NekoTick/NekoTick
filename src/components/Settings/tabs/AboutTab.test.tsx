import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openExternalHref } from '@/lib/navigation/externalLinks';
import {
  clearCachedDesktopUpdateInfo,
  readCachedDesktopUpdateInfo,
  writeCachedDesktopUpdateInfo,
} from '@/lib/desktop/updateStatus';
import { AboutTab } from './AboutTab';

const { electronBridgeMock, openExternalHrefMock } = vi.hoisted(() => ({
  electronBridgeMock: { current: undefined as unknown },
  openExternalHrefMock: vi.fn(),
}));

vi.mock('@/lib/electron/bridge', () => ({
  getElectronBridge: () => electronBridgeMock.current,
}));

vi.mock('@/lib/navigation/externalLinks', () => ({
  getExternalLinkProps: (href: string) => ({ href }),
  openExternalHref: openExternalHrefMock,
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    language: 'en',
    t: (key: string, values?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'common.check': 'Check',
        'common.checkFailed': 'Check failed',
        'common.checking': 'Checking',
        'common.open': 'Open',
        'settings.about.discord': 'Discord',
        'settings.about.github': 'GitHub',
        'settings.about.openDiscord': 'Open Discord',
        'settings.about.openGithub': 'Open GitHub',
        'settings.about.openPrivacyPolicy': 'Open privacy policy',
        'settings.about.openTermsOfService': 'Open terms of service',
        'settings.about.openSlack': 'Open Slack',
        'settings.about.openWebsite': 'Open website',
        'settings.about.legal': 'Legal',
        'settings.about.qqGroup': 'QQ group',
        'settings.about.slack': 'Slack',
        'settings.about.updateAction': 'Update',
        'settings.about.updateAvailable': `v${String(values?.version ?? '')} available`,
        'settings.about.updates': 'Updates',
        'settings.about.upToDate': 'Up to date',
        'settings.about.wechatGroup': 'WeChat group',
      };

      return messages[key] ?? String(values?.version ?? key);
    },
  }),
}));

vi.mock('@/stores/accountSession', () => ({
  useAccountSessionStore: (selector: (state: { isConnected: boolean }) => unknown) =>
    selector({ isConnected: false }),
}));

vi.mock('qrcode', () => ({
  toString: vi.fn().mockResolvedValue('<svg />'),
}));

describe('AboutTab community QR pills', () => {
  afterEach(() => {
    cleanup();
    clearCachedDesktopUpdateInfo();
    electronBridgeMock.current = undefined;
    vi.clearAllMocks();
  });

  it('shows only one community QR panel when moving between QQ and WeChat', () => {
    const { container } = render(
      <AboutTab
        community={{
          qqGroupNumber: '123456',
          qqQrCodeText: 'qq-code',
          wechatQrCodeText: 'wechat-code',
        }}
      />,
    );

    const qqPill = screen.getByRole('button', { name: 'QQ group' }).closest('[data-community-qr-pill="qq"]');
    const wechatPill = screen.getByRole('button', { name: 'WeChat group' }).closest('[data-community-qr-pill="wechat"]');
    const qqPanel = container.querySelector('[data-community-qr-panel="qq"]');
    const wechatPanel = container.querySelector('[data-community-qr-panel="wechat"]');

    expect(qqPill).not.toBeNull();
    expect(wechatPill).not.toBeNull();
    expect(qqPanel).not.toBeNull();
    expect(wechatPanel).not.toBeNull();

    fireEvent.mouseEnter(qqPill as Element);

    expect(qqPanel).toHaveClass('opacity-[var(--vlaina-opacity-100)]');
    expect(wechatPanel).not.toHaveClass('opacity-[var(--vlaina-opacity-100)]');
    expect(screen.getByRole('button', { name: 'QQ group' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'WeChat group' })).toHaveAttribute('aria-expanded', 'false');

    fireEvent.mouseEnter(wechatPill as Element);

    expect(qqPanel).not.toHaveClass('opacity-[var(--vlaina-opacity-100)]');
    expect(wechatPanel).toHaveClass('opacity-[var(--vlaina-opacity-100)]');
    expect(screen.getByRole('button', { name: 'QQ group' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'WeChat group' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens the support email from the about community pills', () => {
    render(
      <AboutTab
        community={{
          qqGroupNumber: '123456',
          qqQrCodeText: 'qq-code',
          wechatQrCodeText: 'wechat-code',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'hi@vlaina.com' }));

    expect(openExternalHref).toHaveBeenCalledWith('mailto:hi@vlaina.com');
  });

  it('opens Discord and Slack through vlaina redirect links', () => {
    render(
      <AboutTab
        community={{
          qqGroupNumber: '123456',
          qqQrCodeText: 'qq-code',
          wechatQrCodeText: 'wechat-code',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Discord' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Slack' }));

    expect(openExternalHref).toHaveBeenCalledWith('https://vlaina.com/r/discord');
    expect(openExternalHref).toHaveBeenCalledWith('https://vlaina.com/r/slack');
  });

  it('opens the privacy policy and terms from the legal section', () => {
    render(
      <AboutTab
        community={{
          qqGroupNumber: '123456',
          qqQrCodeText: 'qq-code',
          wechatQrCodeText: 'wechat-code',
        }}
      />,
    );

    const legalButtons = screen.getAllByRole('button', { name: 'Open' });
    fireEvent.click(legalButtons[0]);
    fireEvent.click(legalButtons[1]);

    expect(openExternalHref).toHaveBeenCalledWith('https://github.com/vladelaina/vlaina/blob/main/PRIVACY.md');
    expect(openExternalHref).toHaveBeenCalledWith('https://github.com/vladelaina/vlaina/blob/main/TERMS.md');
  });

  it('opens the platform-specific update package URL returned by the desktop updater', async () => {
    const downloadUrl = 'https://github.com/vladelaina/vlaina/releases/download/v99.99.99/vlaina-99.99.99-linux-x86_64.AppImage';
    electronBridgeMock.current = {
      app: {
        getVersion: vi.fn().mockResolvedValue('0.1.16'),
      },
      update: {
        check: vi.fn().mockResolvedValue({
          currentVersion: '0.1.16',
          latestVersion: '99.99.99',
          updateAvailable: true,
          downloadUrl,
          releaseUrl: 'https://github.com/vladelaina/vlaina/releases/tag/v99.99.99',
          platformAssetName: 'vlaina-99.99.99-linux-x86_64.AppImage',
          hasPlatformAsset: true,
          releaseNotes: 'Release notes',
          publishedAt: '2026-06-26T00:00:00.000Z',
        }),
      },
    };

    render(
      <AboutTab
        community={{
          qqGroupNumber: '123456',
          qqQrCodeText: 'qq-code',
          wechatQrCodeText: 'wechat-code',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    const updateButton = await screen.findByRole('button', { name: 'Update' });
    expect(updateButton).not.toHaveAttribute('title');
    expect(updateButton.className).toContain('bg-[var(--vlaina-sidebar-row-selected-bg)]');
    expect(updateButton.className).toContain('text-[var(--vlaina-sidebar-row-selected-text)]');
    expect(updateButton.className).toContain('shadow-[var(--vlaina-shadow-selection-soft)]');
    expect(updateButton.className).not.toContain('border');

    fireEvent.click(updateButton);

    await waitFor(() => {
      expect(openExternalHrefMock).toHaveBeenCalledWith(downloadUrl);
    });
  });

  it('opens Microsoft Store instead of checking direct-distribution updates for Store builds', async () => {
    const check = vi.fn();
    const deleteDownloaded = vi.fn().mockResolvedValue(undefined);
    writeCachedDesktopUpdateInfo({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      downloadUrl: 'https://downloads.example.test/vlaina-1.1.0.exe',
      releaseUrl: 'https://releases.example.test/v1.1.0',
      platformAssetName: 'vlaina-1.1.0.exe',
      hasPlatformAsset: true,
      releaseNotes: '',
      publishedAt: '2026-07-19T00:00:00.000Z',
    });
    electronBridgeMock.current = {
      app: {
        getVersion: vi.fn().mockResolvedValue('1.0.0'),
      },
      update: {
        check,
        deleteDownloaded,
        getPolicy: vi.fn().mockResolvedValue({
          distribution: 'microsoft-store',
          checkEnabled: false,
          backgroundDownloadEnabled: false,
          localInstallerEnabled: false,
          externalDownloadEnabled: false,
          cleanupDownloadedUpdatesEnabled: true,
        }),
      },
    };

    render(
      <AboutTab
        community={{
          qqGroupNumber: '123456',
          qqQrCodeText: 'qq-code',
          wechatQrCodeText: 'wechat-code',
        }}
      />,
    );

    await waitFor(() => expect(readCachedDesktopUpdateInfo()).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    await waitFor(() => {
      expect(openExternalHrefMock).toHaveBeenCalledWith('https://apps.microsoft.com/detail/9NLX8NHXQ49X');
    });
    expect(check).not.toHaveBeenCalled();
    expect(deleteDownloaded).toHaveBeenCalled();
  });

  it('restores an available update from the cached desktop updater result', async () => {
    const downloadUrl = 'https://github.com/vladelaina/vlaina/releases/download/v99.99.99/vlaina-99.99.99-linux-x86_64.AppImage';
    writeCachedDesktopUpdateInfo({
      currentVersion: '0.1.16',
      latestVersion: '99.99.99',
      updateAvailable: true,
      downloadUrl,
      releaseUrl: 'https://github.com/vladelaina/vlaina/releases/tag/v99.99.99',
      platformAssetName: 'vlaina-99.99.99-linux-x86_64.AppImage',
      platformAssetSha256: 'a'.repeat(64),
      hasPlatformAsset: true,
      releaseNotes: 'Release notes',
      publishedAt: '2026-06-27T00:00:00.000Z',
    });

    render(
      <AboutTab
        community={{
          qqGroupNumber: '123456',
          qqQrCodeText: 'qq-code',
          wechatQrCodeText: 'wechat-code',
        }}
      />,
    );

    expect(await screen.findByText('v99.99.99 available')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => {
      expect(openExternalHrefMock).toHaveBeenCalledWith(downloadUrl);
    });
  });

  it('opens the downloaded installer when the update package is already cached', async () => {
    const openDownloaded = vi.fn().mockResolvedValue(undefined);
    const downloadUrl = 'https://github.com/vladelaina/vlaina/releases/download/v99.99.99/vlaina-99.99.99-linux-x86_64.AppImage';
    const downloadedFilePath = '/tmp/vlaina/update-downloads/99.99.99/vlaina-99.99.99-linux-x86_64.AppImage';
    electronBridgeMock.current = {
      update: {
        openDownloaded,
      },
    };
    writeCachedDesktopUpdateInfo({
      currentVersion: '0.1.16',
      latestVersion: '99.99.99',
      updateAvailable: true,
      downloadUrl,
      releaseUrl: 'https://github.com/vladelaina/vlaina/releases/tag/v99.99.99',
      platformAssetName: 'vlaina-99.99.99-linux-x86_64.AppImage',
      platformAssetSha256: 'a'.repeat(64),
      hasPlatformAsset: true,
      releaseNotes: 'Release notes',
      publishedAt: '2026-06-27T00:00:00.000Z',
      downloadState: 'downloaded',
      downloadedFilePath,
      downloadedFileName: 'vlaina-99.99.99-linux-x86_64.AppImage',
      downloadedAt: '2026-06-27T00:00:00.000Z',
    });

    render(
      <AboutTab
        community={{
          qqGroupNumber: '123456',
          qqQrCodeText: 'qq-code',
          wechatQrCodeText: 'wechat-code',
        }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Update' }));

    await waitFor(() => {
      expect(openDownloaded).toHaveBeenCalledWith(expect.objectContaining({
        latestVersion: '99.99.99',
        platformAssetName: 'vlaina-99.99.99-linux-x86_64.AppImage',
        platformAssetSha256: 'a'.repeat(64),
        downloadedFilePath,
      }));
    });
    expect(openExternalHrefMock).not.toHaveBeenCalledWith(downloadUrl);
  });

  it('falls back to the GitHub download URL while the background update is still downloading', async () => {
    const openDownloaded = vi.fn().mockResolvedValue(undefined);
    const downloadUrl = 'https://github.com/vladelaina/vlaina/releases/download/v99.99.99/vlaina-99.99.99-linux-x86_64.AppImage';
    electronBridgeMock.current = {
      app: {
        getVersion: vi.fn().mockResolvedValue('0.1.16'),
      },
      update: {
        openDownloaded,
      },
    };
    writeCachedDesktopUpdateInfo({
      currentVersion: '0.1.16',
      latestVersion: '99.99.99',
      updateAvailable: true,
      downloadUrl,
      releaseUrl: 'https://github.com/vladelaina/vlaina/releases/tag/v99.99.99',
      platformAssetName: 'vlaina-99.99.99-linux-x86_64.AppImage',
      hasPlatformAsset: true,
      releaseNotes: 'Release notes',
      publishedAt: '2026-06-27T00:00:00.000Z',
      downloadState: 'downloading',
    });

    render(
      <AboutTab
        community={{
          qqGroupNumber: '123456',
          qqQrCodeText: 'qq-code',
          wechatQrCodeText: 'wechat-code',
        }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Update' }));

    await waitFor(() => {
      expect(openExternalHrefMock).toHaveBeenCalledWith(downloadUrl);
    });
    expect(openDownloaded).not.toHaveBeenCalled();
  });

  it('clears a cached auto-downloaded update when the current app version is already current', async () => {
    const deleteDownloaded = vi.fn().mockResolvedValue(undefined);
    const downloadUrl = 'https://github.com/vladelaina/vlaina/releases/download/v0.1.17/vlaina-0.1.17-linux-x86_64.AppImage';
    const downloadedFilePath = '/tmp/vlaina/update-downloads/0.1.17/vlaina-0.1.17-linux-x86_64.AppImage';
    electronBridgeMock.current = {
      app: {
        getVersion: vi.fn().mockResolvedValue('0.1.17'),
      },
      update: {
        deleteDownloaded,
      },
    };
    const cachedUpdateInfo = {
      currentVersion: '0.1.16',
      latestVersion: '0.1.17',
      updateAvailable: true,
      downloadUrl,
      releaseUrl: 'https://github.com/vladelaina/vlaina/releases/tag/v0.1.17',
      platformAssetName: 'vlaina-0.1.17-linux-x86_64.AppImage',
      hasPlatformAsset: true,
      releaseNotes: 'Release notes',
      publishedAt: '2026-06-27T00:00:00.000Z',
      downloadState: 'downloaded' as const,
      downloadedFilePath,
      downloadedFileName: 'vlaina-0.1.17-linux-x86_64.AppImage',
      downloadedAt: '2026-06-27T00:00:00.000Z',
    };
    writeCachedDesktopUpdateInfo(cachedUpdateInfo);

    render(
      <AboutTab
        community={{
          qqGroupNumber: '123456',
          qqQrCodeText: 'qq-code',
          wechatQrCodeText: 'wechat-code',
        }}
      />,
    );

    await waitFor(() => {
      expect(deleteDownloaded).toHaveBeenCalledWith(expect.objectContaining(cachedUpdateInfo));
    });
    await waitFor(() => {
      expect(readCachedDesktopUpdateInfo()).toBeNull();
    });
  });
});
