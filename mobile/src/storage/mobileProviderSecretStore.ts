import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import type { ProviderSecretStore } from '@/lib/storage/unifiedStorageProviderSecrets';

const PROVIDER_SECRET_PREFIX = 'vlaina.ai-provider.';

interface SecureStringStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function createMobileProviderSecretStore(storage: SecureStringStorage): ProviderSecretStore {
  const keyFor = (providerId: string) => `${PROVIDER_SECRET_PREFIX}${providerId}`;
  return {
    get: (providerId) => storage.getItem(keyFor(providerId)),
    set: (providerId, apiKey) => storage.setItem(keyFor(providerId), apiKey),
    delete: (providerId) => storage.removeItem(keyFor(providerId)),
  };
}

export const mobileProviderSecretStore = createMobileProviderSecretStore(SecureStorage);
