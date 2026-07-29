import { isMicrosoftStoreRuntime } from './microsoftStoreIdentity.mjs';

const directUpdatePolicy = {
  distribution: 'direct',
  checkEnabled: true,
  backgroundDownloadEnabled: true,
  localInstallerEnabled: true,
  externalDownloadEnabled: true,
  cleanupDownloadedUpdatesEnabled: true,
};

const externalOnlyDirectUpdatePolicy = {
  ...directUpdatePolicy,
  backgroundDownloadEnabled: false,
  localInstallerEnabled: false,
};

const microsoftStoreUpdatePolicy = {
  distribution: 'microsoft-store',
  checkEnabled: false,
  backgroundDownloadEnabled: false,
  localInstallerEnabled: false,
  externalDownloadEnabled: false,
  cleanupDownloadedUpdatesEnabled: true,
};

function normalizeDistributionChannel(value) {
  const channel = String(value ?? '')
    .trim()
    .toLowerCase();

  if (!channel) return 'direct';
  if (channel === 'ms-store' || channel === 'microsoft' || channel === 'windows-store') {
    return 'microsoft-store';
  }
  if (channel === 'direct' || channel === 'github' || channel === 'website') {
    return 'direct';
  }
  return 'direct';
}

function isWindowsPortableRuntime(env, runtime) {
  if (runtime?.platform !== 'win32') return false;
  return [
    env.PORTABLE_EXECUTABLE_DIR,
    env.PORTABLE_EXECUTABLE_FILE,
    env.PORTABLE_EXECUTABLE_APP_FILENAME,
  ].some((value) => typeof value === 'string' && Boolean(value.trim()));
}

export function resolveDesktopUpdatePolicy(env = process.env, runtime = process) {
  const distribution = normalizeDistributionChannel(env.APP_DISTRIBUTION_CHANNEL);
  if (distribution === 'microsoft-store' || isMicrosoftStoreRuntime(runtime)) {
    return { ...microsoftStoreUpdatePolicy };
  }
  if (runtime?.platform === 'linux' || isWindowsPortableRuntime(env, runtime)) {
    return { ...externalOnlyDirectUpdatePolicy };
  }
  return { ...directUpdatePolicy };
}
