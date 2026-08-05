import { describe, expect, it, vi } from 'vitest';
import { createMobileProviderSecretStore } from './mobileProviderSecretStore';

describe('mobileProviderSecretStore', () => {
  it('stores provider API keys under namespaced secure-storage keys', async () => {
    const storage = {
      getItem: vi.fn(async () => 'sk-stored'),
      setItem: vi.fn(async () => undefined),
      removeItem: vi.fn(async () => undefined),
    };
    const store = createMobileProviderSecretStore(storage);

    await expect(store.get('provider-1')).resolves.toBe('sk-stored');
    await store.set('provider-1', 'sk-new');
    await store.delete('provider-1');

    expect(storage.getItem).toHaveBeenCalledWith('vlaina.ai-provider.provider-1');
    expect(storage.setItem).toHaveBeenCalledWith('vlaina.ai-provider.provider-1', 'sk-new');
    expect(storage.removeItem).toHaveBeenCalledWith('vlaina.ai-provider.provider-1');
  });
});
