import type { Provider } from '@/lib/ai/types';
import { isNativeCapacitorRuntime } from '@/lib/account/capacitorRuntime';
import { hasElectronDesktopBridge } from '@/lib/desktop/backend';
import { isSafeProviderId } from './unifiedStorageAI';
import { showStorageToast, getAIProviderSecretCommands } from './unifiedStorageNotifications';
import {
  MAX_AI_PROVIDER_STORAGE_CONCURRENCY,
} from './unifiedStorageSaveTypes';
import { mapWithConcurrencyLimit } from './unifiedStorageCommon';

let hasShownSecretLoadFailureToast = false;

export interface ProviderSecretStore {
  get(providerId: string): Promise<string | null>;
  set(providerId: string, apiKey: string): Promise<void>;
  delete(providerId: string): Promise<void>;
}

let nativeProviderSecretStore: ProviderSecretStore | null = null;

export function registerNativeProviderSecretStore(store: ProviderSecretStore | null): void {
  nativeProviderSecretStore = store;
}

function hasProtectedProviderSecretStorage(): boolean {
  return hasElectronDesktopBridge() || isNativeCapacitorRuntime();
}

async function getProviderSecretCommands() {
  if (hasElectronDesktopBridge()) {
    return getAIProviderSecretCommands();
  }

  if (!isNativeCapacitorRuntime() || !nativeProviderSecretStore) {
    throw new Error('Native provider secret storage is not available.');
  }

  const store = nativeProviderSecretStore;
  return {
    async getProviderSecrets(providerIds: string[]): Promise<Record<string, string>> {
      const entries = await mapWithConcurrencyLimit(
        providerIds,
        MAX_AI_PROVIDER_STORAGE_CONCURRENCY,
        async (providerId) => [providerId, await store.get(providerId)] as const,
      );
      return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => (
        typeof entry[1] === 'string'
      )));
    },
    setProviderSecret: (providerId: string, apiKey: string) => store.set(providerId, apiKey),
    deleteProviderSecret: (providerId: string) => store.delete(providerId),
  };
}

function showSecretStorageFailure(): void {
  if (hasShownSecretLoadFailureToast) {
    return;
  }
  hasShownSecretLoadFailureToast = true;
  showStorageToast('storage.keychainUnavailable', 'error', 6000);
}

export async function hydrateProvidersWithSecrets(
  providers: Provider[],
  clearMigratedPlaintext?: (providerId: string) => Promise<void>,
): Promise<Provider[]> {
  if (!hasProtectedProviderSecretStorage() || providers.length === 0) {
    return providers;
  }

  let secretMap: Record<string, string> = {};
  let aiProviderSecretCommands: Awaited<ReturnType<typeof getProviderSecretCommands>> | null = null;
  try {
    aiProviderSecretCommands = await getProviderSecretCommands();
    secretMap = await aiProviderSecretCommands.getProviderSecrets(providers.map((provider) => provider.id));
    hasShownSecretLoadFailureToast = false;
  } catch {
    showSecretStorageFailure();
  }

  if (isNativeCapacitorRuntime()) {
    for (const provider of providers) {
      const plaintextApiKey = provider.apiKey?.trim() || '';
      if (!plaintextApiKey) {
        continue;
      }
      secretMap[provider.id] = plaintextApiKey;
      if (!aiProviderSecretCommands) {
        continue;
      }
      try {
        await aiProviderSecretCommands.setProviderSecret(provider.id, plaintextApiKey);
      } catch {
        showSecretStorageFailure();
        continue;
      }
      if (clearMigratedPlaintext) {
        try {
          await clearMigratedPlaintext(provider.id);
        } catch {
          showStorageToast('storage.saveFailed', 'error', 6000);
        }
      }
    }
  }

  return providers.map((provider) => {
      const storedSecret = secretMap[provider.id]?.trim() || '';
      return storedSecret ? { ...provider, apiKey: storedSecret } : { ...provider, apiKey: '' };
    });
}

export function sanitizeProviderForDisk(provider: Provider): Provider {
  if (!hasProtectedProviderSecretStorage()) {
    return provider;
  }

  if (!provider.apiKey) {
    return provider;
  }

  return {
    ...provider,
    apiKey: '',
  };
}

export async function syncProviderSecrets(providers: Provider[]): Promise<void> {
  if (!hasProtectedProviderSecretStorage()) {
    return;
  }

  const aiProviderSecretCommands = await getProviderSecretCommands();
  await mapWithConcurrencyLimit(
    providers,
    MAX_AI_PROVIDER_STORAGE_CONCURRENCY,
    async (provider) => {
      const apiKey = provider.apiKey?.trim() || '';
      if (apiKey) {
        await aiProviderSecretCommands.setProviderSecret(provider.id, apiKey);
      } else {
        await aiProviderSecretCommands.deleteProviderSecret(provider.id);
      }
    }
  );
}

export async function deleteProviderSecretsBestEffort(
  providerIds: Iterable<string>,
  deletedProviderSecrets: Set<string>,
): Promise<void> {
  if (!hasProtectedProviderSecretStorage()) {
    return;
  }

  const safeProviderIds = Array.from(new Set(providerIds))
    .filter((providerId) => isSafeProviderId(providerId) && !deletedProviderSecrets.has(providerId));
  if (safeProviderIds.length === 0) {
    return;
  }

  const aiProviderSecretCommands = await getProviderSecretCommands();
  await mapWithConcurrencyLimit(
    safeProviderIds,
    MAX_AI_PROVIDER_STORAGE_CONCURRENCY,
    async (providerId) => {
      try {
        await aiProviderSecretCommands.deleteProviderSecret(providerId);
        deletedProviderSecrets.add(providerId);
      } catch {
      }
    }
  );
}
