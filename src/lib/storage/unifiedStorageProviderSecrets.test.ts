import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Provider } from '@/lib/ai/types';
import {
  deleteProviderSecretsBestEffort,
  hydrateProvidersWithSecrets,
  registerNativeProviderSecretStore,
  sanitizeProviderForDisk,
  syncProviderSecrets,
  type ProviderSecretStore,
} from './unifiedStorageProviderSecrets';

function buildProvider(apiKey: string): Provider {
  return {
    id: 'provider-1',
    name: 'Provider',
    type: 'newapi',
    apiHost: 'https://api.example.test',
    apiKey,
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

function createStore(initialSecret: string | null = null): ProviderSecretStore & {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn(async () => initialSecret),
    set: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
}

beforeEach(() => {
  vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
});

afterEach(() => {
  registerNativeProviderSecretStore(null);
  vi.unstubAllGlobals();
});

describe('Capacitor provider secrets', () => {
  it('hydrates from secure storage when provider JSON is already sanitized', async () => {
    const store = createStore('sk-secure');
    registerNativeProviderSecretStore(store);

    await expect(hydrateProvidersWithSecrets([buildProvider('')])).resolves.toEqual([
      expect.objectContaining({ apiKey: 'sk-secure' }),
    ]);
  });

  it('migrates a plaintext key before requesting its removal from provider JSON', async () => {
    const store = createStore();
    const clearPlaintext = vi.fn(async () => undefined);
    registerNativeProviderSecretStore(store);

    const providers = await hydrateProvidersWithSecrets([buildProvider(' sk-legacy ')], clearPlaintext);

    expect(store.set).toHaveBeenCalledWith('provider-1', 'sk-legacy');
    expect(clearPlaintext).toHaveBeenCalledWith('provider-1');
    expect(providers[0]?.apiKey).toBe('sk-legacy');
  });

  it('keeps legacy plaintext when secure storage migration fails', async () => {
    const store = createStore();
    store.set.mockRejectedValue(new Error('keychain unavailable'));
    const clearPlaintext = vi.fn(async () => undefined);
    registerNativeProviderSecretStore(store);

    const providers = await hydrateProvidersWithSecrets([buildProvider('sk-legacy')], clearPlaintext);

    expect(clearPlaintext).not.toHaveBeenCalled();
    expect(providers[0]?.apiKey).toBe('sk-legacy');
  });

  it('syncs secure keys and strips them from native provider files', async () => {
    const store = createStore();
    registerNativeProviderSecretStore(store);
    const provider = buildProvider('sk-live');

    await syncProviderSecrets([provider]);

    expect(store.set).toHaveBeenCalledWith('provider-1', 'sk-live');
    expect(sanitizeProviderForDisk(provider).apiKey).toBe('');
  });

  it('deletes native secrets for removed providers', async () => {
    const store = createStore();
    registerNativeProviderSecretStore(store);
    const deleted = new Set<string>();

    await deleteProviderSecretsBestEffort(['provider-1'], deleted);

    expect(store.delete).toHaveBeenCalledWith('provider-1');
    expect(deleted).toEqual(new Set(['provider-1']));
  });

  it('preserves ordinary web storage behavior', async () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => false });
    const provider = buildProvider('sk-web');

    await expect(hydrateProvidersWithSecrets([provider])).resolves.toEqual([provider]);
    expect(sanitizeProviderForDisk(provider)).toBe(provider);
  });
});
