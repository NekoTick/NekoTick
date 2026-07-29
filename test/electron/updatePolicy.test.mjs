import { describe, expect, it } from 'vitest';
import { resolveDesktopUpdatePolicy } from '../../electron/updatePolicy.mjs';

describe('desktop update policy', () => {
  it('enables local installers for direct Windows and macOS distributions', () => {
    const expectedPolicy = {
      distribution: 'direct',
      checkEnabled: true,
      backgroundDownloadEnabled: true,
      localInstallerEnabled: true,
      externalDownloadEnabled: true,
      cleanupDownloadedUpdatesEnabled: true,
    };

    expect(resolveDesktopUpdatePolicy({}, { platform: 'win32' })).toEqual(expectedPolicy);
    expect(resolveDesktopUpdatePolicy({}, { platform: 'darwin' })).toEqual(expectedPolicy);
  });

  it('uses release-page updates for direct Linux distributions', () => {
    expect(resolveDesktopUpdatePolicy({}, { platform: 'linux' })).toEqual({
      distribution: 'direct',
      checkEnabled: true,
      backgroundDownloadEnabled: false,
      localInstallerEnabled: false,
      externalDownloadEnabled: true,
      cleanupDownloadedUpdatesEnabled: true,
    });
  });

  it('uses release-page updates for Windows portable distributions', () => {
    expect(resolveDesktopUpdatePolicy({
      PORTABLE_EXECUTABLE_DIR: 'C:\\Apps\\vlaina',
    }, { platform: 'win32' })).toEqual({
      distribution: 'direct',
      checkEnabled: true,
      backgroundDownloadEnabled: false,
      localInstallerEnabled: false,
      externalDownloadEnabled: true,
      cleanupDownloadedUpdatesEnabled: true,
    });
  });

  it('disables self update flows for Microsoft Store distribution', () => {
    expect(resolveDesktopUpdatePolicy({ APP_DISTRIBUTION_CHANNEL: 'ms-store' })).toEqual({
      distribution: 'microsoft-store',
      checkEnabled: false,
      backgroundDownloadEnabled: false,
      localInstallerEnabled: false,
      externalDownloadEnabled: false,
      cleanupDownloadedUpdatesEnabled: true,
    });
  });

  it('detects Microsoft Store distribution from the Electron runtime', () => {
    expect(resolveDesktopUpdatePolicy({}, { windowsStore: true })).toMatchObject({
      distribution: 'microsoft-store',
      checkEnabled: false,
      backgroundDownloadEnabled: false,
      localInstallerEnabled: false,
    });
  });
});
