import { isNativeCapacitorRuntime } from '@/lib/account/capacitorRuntime';

export function isBlockedNativeProviderUrl(apiHost: string): boolean {
  const trimmed = apiHost.trim();
  if (!trimmed || !isNativeCapacitorRuntime()) return false;

  try {
    const url = new URL(trimmed);
    return url.protocol !== 'https:' || !url.hostname || Boolean(url.username || url.password);
  } catch {
    return true;
  }
}
