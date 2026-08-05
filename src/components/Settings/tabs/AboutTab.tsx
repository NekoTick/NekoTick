import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { getElectronBridge } from '@/lib/electron/bridge';
import type { ElectronUpdatePolicy } from '@/lib/electron/bridge';
import { openExternalHref } from '@/lib/navigation/externalLinks';
import { cn } from '@/lib/utils';
import { SettingsItem, SettingsSectionHeader } from '../components/SettingsControls';
import { useI18n } from '@/lib/i18n';
import { APP_VERSION } from '@/lib/appVersion';
import {
  canOpenDesktopUpdateExternalDownload,
  canOpenDesktopUpdateLocalInstaller,
  clearCachedDesktopUpdateInfo,
  type DesktopUpdateInfo,
  isDesktopUpdateNewerThanCurrent,
  readCachedDesktopUpdateInfo,
  UPDATE_INFO_CHANGED_EVENT,
  writeCachedDesktopUpdateInfo,
} from '@/lib/desktop/updateStatus';
import { clearStaleDesktopUpdateDownload, startDesktopUpdateDownload } from '@/lib/desktop/updateDownload';
import { useAccountSessionStore } from '@/stores/accountSession';
import { FeedbackTab } from './FeedbackTab';
import { themeIconTokens } from '@/styles/themeTokens';
import { settingsSelectedActionButtonClassName } from '../styles';
import type { CommunitySettings } from './aboutCommunitySettings';
import { AboutHero } from './AboutHero';
import { CommunityPills } from './AboutCommunityPills';
import { DeveloperNotePanel } from './AboutDeveloperNotePanel';
import { microsoftStoreUrl, privacyPolicyUrl, termsOfServiceUrl } from './aboutTabShared';

type UpdateStatus = 'idle' | 'checking' | 'current' | 'available' | 'error';
type UpdateInfo = DesktopUpdateInfo;

function readInitialUpdateState(): { status: UpdateStatus; updateInfo: UpdateInfo | null } {
  const cachedUpdateInfo = readCachedDesktopUpdateInfo();
  if (!cachedUpdateInfo || !isDesktopUpdateNewerThanCurrent(cachedUpdateInfo)) {
    return { status: 'idle', updateInfo: null };
  }

  return {
    status: cachedUpdateInfo.updateAvailable ? 'available' : 'current',
    updateInfo: cachedUpdateInfo,
  };
}

export function AboutTab({ community }: { community: CommunitySettings }) {
  const { t } = useI18n();
  const isAccountConnected = useAccountSessionStore((state) => state.isConnected);
  const [status, setStatus] = useState<UpdateStatus>(() => readInitialUpdateState().status);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(() => readInitialUpdateState().updateInfo);
  const [currentVersion, setCurrentVersion] = useState('');
  const [updatePolicy, setUpdatePolicy] = useState<ElectronUpdatePolicy | null>(null);

  useEffect(() => {
    const bridge = getElectronBridge();
    if (!bridge?.app) {
      return;
    }

    void bridge.update?.getPolicy?.().then((policy) => {
      setUpdatePolicy(policy);
      const cachedUpdateInfo = readCachedDesktopUpdateInfo();
      if (policy.distribution === 'microsoft-store') {
        if (cachedUpdateInfo) {
          void bridge.update?.deleteDownloaded?.(cachedUpdateInfo).catch(() => undefined);
        }
        clearCachedDesktopUpdateInfo();
        setUpdateInfo(null);
        setStatus('idle');
        return;
      }

      if (cachedUpdateInfo) {
        const currentPolicyUpdateInfo = { ...cachedUpdateInfo, updatePolicy: policy };
        writeCachedDesktopUpdateInfo(currentPolicyUpdateInfo);
        setUpdateInfo(currentPolicyUpdateInfo);
      }
    }).catch(() => undefined);

    void bridge.app.getVersion().then((version) => {
      setCurrentVersion(version);
      const cachedUpdateInfo = readCachedDesktopUpdateInfo();
      if (cachedUpdateInfo && bridge.update) {
        void clearStaleDesktopUpdateDownload(bridge.update, cachedUpdateInfo, version);
      }
    }).catch(() => {
      setCurrentVersion('');
    });
  }, []);

  useEffect(() => {
    const applyCachedUpdateInfo = () => {
      const cachedUpdateInfo = readCachedDesktopUpdateInfo();
      const freshUpdateInfo = cachedUpdateInfo && isDesktopUpdateNewerThanCurrent(cachedUpdateInfo, currentVersion || APP_VERSION)
        ? cachedUpdateInfo
        : null;
      setUpdateInfo(freshUpdateInfo);
      setStatus(freshUpdateInfo
        ? freshUpdateInfo.updateAvailable ? 'available' : 'current'
        : 'idle');
    };

    window.addEventListener(UPDATE_INFO_CHANGED_EVENT, applyCachedUpdateInfo);
    return () => {
      window.removeEventListener(UPDATE_INFO_CHANGED_EVENT, applyCachedUpdateInfo);
    };
  }, [currentVersion]);

  const checkForUpdates = useCallback(async () => {
    const bridge = getElectronBridge();
    if (!bridge?.update) {
      setStatus('error');
      return;
    }

    setStatus('checking');

    try {
      const policy = updatePolicy ?? await bridge.update.getPolicy?.();
      if (policy?.distribution === 'microsoft-store') {
        clearCachedDesktopUpdateInfo();
        setUpdateInfo(null);
        setStatus('idle');
        await openExternalHref(microsoftStoreUrl);
        return;
      }

      const checkedInfo = await bridge.update.check();
      const nextInfo = policy ? { ...checkedInfo, updatePolicy: policy } : checkedInfo;
      const freshUpdateInfo = await clearStaleDesktopUpdateDownload(
        bridge.update,
        nextInfo,
        currentVersion || nextInfo.currentVersion || APP_VERSION
      );
      if (!freshUpdateInfo) {
        setUpdateInfo(null);
        setStatus('current');
        return;
      }
      setUpdateInfo(freshUpdateInfo);
      setStatus('available');
      writeCachedDesktopUpdateInfo(freshUpdateInfo);
      startDesktopUpdateDownload(bridge.update, freshUpdateInfo);
    } catch {
      setStatus(updateInfo ? 'available' : 'error');
    }
  }, [currentVersion, updateInfo, updatePolicy]);

  const hasUpdate = status === 'available' && Boolean(updateInfo);

  const openUpdateDownload = useCallback(async () => {
    if (!hasUpdate || !updateInfo || (!updateInfo.downloadUrl && !updateInfo.releaseUrl)) return;
    const bridge = getElectronBridge();
    let effectiveUpdateInfo = updateInfo;
    let effectiveUpdatePolicy = updatePolicy;
    if (!effectiveUpdatePolicy && bridge?.update?.getPolicy) {
      try {
        effectiveUpdatePolicy = await bridge.update.getPolicy();
        setUpdatePolicy(effectiveUpdatePolicy);
      } catch {
      }
    }
    if (effectiveUpdatePolicy) {
      effectiveUpdateInfo = { ...updateInfo, updatePolicy: effectiveUpdatePolicy };
    }

    const localInstallerEnabled = canOpenDesktopUpdateLocalInstaller(effectiveUpdateInfo);
    const externalDownloadUrl = localInstallerEnabled
      ? effectiveUpdateInfo.downloadUrl
      : effectiveUpdateInfo.releaseUrl || effectiveUpdateInfo.downloadUrl;
    if (
      localInstallerEnabled &&
      effectiveUpdateInfo.downloadState === 'downloaded' &&
      effectiveUpdateInfo.platformAssetSha256 &&
      effectiveUpdateInfo.downloadedFilePath
    ) {
      if (bridge?.update?.openDownloaded) {
        try {
          await bridge.update.openDownloaded(effectiveUpdateInfo);
          return;
        } catch {
        }
      }
    }
    if (externalDownloadUrl && canOpenDesktopUpdateExternalDownload(effectiveUpdateInfo)) {
      void openExternalHref(externalDownloadUrl);
    }
  }, [hasUpdate, updateInfo, updatePolicy]);

  const statusLabel = (() => {
    if (status === 'checking') return t('common.checking');
    if (status === 'available' && updateInfo) return t('settings.about.updateAvailable', { version: updateInfo.latestVersion });
    if (status === 'current') return t('settings.about.upToDate');
    if (status === 'error') return t('common.checkFailed');
    return '';
  })();

  return (
    <div className="space-y-8" data-settings-tab-panel="about">
      <AboutHero version={currentVersion || APP_VERSION} />

      <div data-settings-desktop-only="updates">
        <SettingsSectionHeader>{t('settings.about.updates')}</SettingsSectionHeader>
        <SettingsItem
          title={t('settings.about.updates')}
          description={statusLabel || undefined}
          className="hover:!shadow-[var(--vlaina-shadow-raised-soft)]"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={checkForUpdates}
              disabled={status === 'checking'}
              className="inline-flex h-10 min-w-0 items-center gap-2 rounded-full bg-[var(--vlaina-color-setting-field)] px-4 text-[var(--vlaina-font-13)] font-medium text-[var(--vlaina-sidebar-notes-text)] transition-colors hover:bg-[var(--vlaina-sidebar-row-selected-bg)] hover:text-[var(--vlaina-sidebar-row-selected-text)] hover:shadow-[var(--vlaina-shadow-selection-soft)] disabled:cursor-not-allowed disabled:opacity-[var(--vlaina-opacity-60)]"
            >
              <RefreshCw size={themeIconTokens.sizeSidebar} className={cn(status === 'checking' && 'animate-spin')} />
              {t('common.check')}
            </button>
            {hasUpdate ? (
              <button
                type="button"
                onClick={openUpdateDownload}
                className={settingsSelectedActionButtonClassName}
              >
                <ExternalLink size={themeIconTokens.sizeSidebar} />
                {t('settings.about.updateAction')}
              </button>
            ) : null}
          </div>
        </SettingsItem>
      </div>

      <CommunityPills community={community} />

      {isAccountConnected ? <FeedbackTab compact /> : null}

      <div>
        <SettingsSectionHeader>{t('settings.about.legal')}</SettingsSectionHeader>
        <SettingsItem title={t('settings.about.openPrivacyPolicy')} className="hover:!shadow-[var(--vlaina-shadow-raised-soft)]">
          <button
            type="button"
            onClick={() => void openExternalHref(privacyPolicyUrl)}
            className="inline-flex h-10 min-w-0 items-center gap-2 rounded-full bg-[var(--vlaina-color-setting-field)] px-4 text-[var(--vlaina-font-13)] font-medium text-[var(--vlaina-sidebar-notes-text)] transition-colors hover:bg-[var(--vlaina-sidebar-row-selected-bg)] hover:text-[var(--vlaina-sidebar-row-selected-text)] hover:shadow-[var(--vlaina-shadow-selection-soft)]"
          >
            <ExternalLink size={themeIconTokens.sizeSidebar} />
            {t('common.open')}
          </button>
        </SettingsItem>
        <SettingsItem title={t('settings.about.openTermsOfService')} className="hover:!shadow-[var(--vlaina-shadow-raised-soft)]">
          <button
            type="button"
            onClick={() => void openExternalHref(termsOfServiceUrl)}
            className="inline-flex h-10 min-w-0 items-center gap-2 rounded-full bg-[var(--vlaina-color-setting-field)] px-4 text-[var(--vlaina-font-13)] font-medium text-[var(--vlaina-sidebar-notes-text)] transition-colors hover:bg-[var(--vlaina-sidebar-row-selected-bg)] hover:text-[var(--vlaina-sidebar-row-selected-text)] hover:shadow-[var(--vlaina-shadow-selection-soft)]"
          >
            <ExternalLink size={themeIconTokens.sizeSidebar} />
            {t('common.open')}
          </button>
        </SettingsItem>
      </div>

      <DeveloperNotePanel />
    </div>
  );
}
