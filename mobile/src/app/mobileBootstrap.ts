import { registerStorageAdapter } from '@/lib/storage/adapter';
import { registerNativeProviderSecretStore } from '@/lib/storage/unifiedStorageProviderSecrets';
import { CapacitorFilesystemAdapter } from '../storage/CapacitorFilesystemAdapter';
import { mobileProviderSecretStore } from '../storage/mobileProviderSecretStore';

export const MOBILE_DATA_ROOT = '/vlaina';
export const MOBILE_NOTES_ROOT = `${MOBILE_DATA_ROOT}/notes`;

export async function prepareMobileStorage(): Promise<void> {
  const adapter = new CapacitorFilesystemAdapter();
  registerStorageAdapter(adapter);
  registerNativeProviderSecretStore(mobileProviderSecretStore);
  await adapter.getBasePath();
  await adapter.mkdir(MOBILE_NOTES_ROOT, true);
}
