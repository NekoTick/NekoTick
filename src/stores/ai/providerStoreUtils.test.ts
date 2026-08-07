import { describe, expect, it } from 'vitest';
import type { AIModel, Provider } from '@/lib/ai/types';
import {
  areModelExecutionContextsEqual,
  areModelsEqual,
  areProvidersEqual,
  chooseFallbackSelectedModelId,
  replaceProviderModels,
} from './providerStoreUtils';

function buildProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'provider-1',
    name: 'Provider',
    type: 'newapi',
    apiHost: 'https://api.example.com',
    apiKey: 'sk-test',
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function buildModel(overrides: Partial<AIModel> = {}): AIModel {
  return {
    id: 'model-1',
    apiModelId: 'model-1',
    name: 'Model 1',
    providerId: 'provider-1',
    enabled: true,
    createdAt: 1,
    ...overrides,
  };
}

describe('areProvidersEqual', () => {
  it('compares endpoint type changes', () => {
    expect(
      areProvidersEqual(
        [buildProvider({ endpointType: 'openai' })],
        [buildProvider({ endpointType: 'anthropic' })],
      ),
    ).toBe(false);
  });

  it('compares endpoint type check timestamps', () => {
    expect(
      areProvidersEqual(
        [buildProvider({ endpointType: 'openai', endpointTypeCheckedAt: 1 })],
        [buildProvider({ endpointType: 'openai', endpointTypeCheckedAt: 2 })],
      ),
    ).toBe(false);
  });
});

describe('chooseFallbackSelectedModelId', () => {
  it('skips disabled current, default, and first models', () => {
    expect(chooseFallbackSelectedModelId('model-current', [
      buildModel({ id: 'model-current', enabled: false }),
      buildModel({ id: 'model-default', isDefault: true, enabled: false }),
      buildModel({ id: 'model-enabled', apiModelId: 'model-enabled' }),
    ], 'provider-1')).toBe('model-enabled');
  });
});

describe('free model metadata', () => {
  it('updates provider models when the free flag changes', () => {
    const existing = buildModel({ isFree: false, pinned: true });
    const [updated] = replaceProviderModels([existing], 'provider-1', [
      buildModel({ isFree: true }),
    ]);

    expect(updated).not.toBe(existing);
    expect(updated).toMatchObject({ isFree: true, pinned: true });
  });

  it('participates in model and execution context equality', () => {
    const paid = buildModel({ isFree: false });
    const free = buildModel({ isFree: true });

    expect(areModelsEqual([paid], [free])).toBe(false);
    expect(areModelExecutionContextsEqual(paid, free)).toBe(false);
  });
});
