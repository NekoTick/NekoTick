import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIModel, Provider } from '@/lib/ai/types';
import { openaiClient } from '@/lib/ai/providers/openai';
import { useProviderModelActions } from './useProviderModelActions';

vi.mock('@/lib/ai/providers/openai', () => ({
  openaiClient: {
    getModelsWithEndpointDetection: vi.fn(),
  },
}));

const provider: Provider = {
  id: 'provider-1',
  name: 'Provider',
  type: 'newapi',
  apiHost: 'https://api.example.com',
  apiKey: 'sk-test',
  enabled: true,
  createdAt: 1,
  updatedAt: 1,
};

const model: AIModel = {
  id: 'provider-1::gpt-4o-mini',
  apiModelId: 'gpt-4o-mini',
  name: 'GPT-4o Mini',
  providerId: provider.id,
  enabled: true,
  createdAt: 1,
};

function renderModelActions(overrides: Partial<{
  provider: Provider | undefined;
  draft: { name: string; apiHost: string; apiKey: string; enabled: boolean };
  setFetchedModels: (models: string[]) => void;
  setProviderFetchedModels: (providerId: string, models: string[]) => void;
  updateProvider: (providerId: string, updates: Partial<Provider>) => void;
}> = {}) {
  const props = {
    provider,
    providerModels: [model],
    canUseConnectionActions: true,
    draft: {
      name: provider.name,
      apiHost: provider.apiHost,
      apiKey: provider.apiKey,
      enabled: provider.enabled,
    },
    addModel: vi.fn(),
    addModels: vi.fn(),
    deleteModel: vi.fn(),
    updateProvider: vi.fn(),
    setFetchedModels: vi.fn(),
    setProviderFetchedModels: vi.fn(),
    resetBenchmarkState: vi.fn(),
    ...overrides,
  };

  const hook = renderHook(
    (nextProps: typeof props) => useProviderModelActions(nextProps),
    { initialProps: props },
  );
  return { hook, props };
}

describe('useProviderModelActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not write model fetch results after the request is superseded', async () => {
    let resolveFirst!: (value: { models: string[]; endpointType: 'openai' | 'anthropic' }) => void;
    const firstRequest = new Promise<{ models: string[]; endpointType: 'openai' | 'anthropic' }>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(openaiClient.getModelsWithEndpointDetection)
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce({ models: ['fresh-model'], endpointType: 'anthropic' });

    const setFetchedModels = vi.fn();
    const setProviderFetchedModels = vi.fn();
    const updateProvider = vi.fn();
    const { hook } = renderModelActions({
      setFetchedModels,
      setProviderFetchedModels,
      updateProvider,
    });

    await act(async () => {
      void hook.result.current.handleFetchModels();
      await Promise.resolve();
    });
    const firstSignal = vi.mocked(openaiClient.getModelsWithEndpointDetection).mock.calls[0]?.[1] as AbortSignal;

    await act(async () => {
      void hook.result.current.handleFetchModels();
      await Promise.resolve();
    });

    expect(firstSignal.aborted).toBe(true);
    await waitFor(() => {
      expect(setFetchedModels).toHaveBeenCalledWith(['fresh-model']);
    });
    expect(setProviderFetchedModels).toHaveBeenCalledTimes(1);
    expect(updateProvider).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({ models: ['stale-model'], endpointType: 'openai' });
      await firstRequest.catch(() => undefined);
      await Promise.resolve();
    });

    expect(setFetchedModels).toHaveBeenCalledTimes(1);
    expect(setProviderFetchedModels).toHaveBeenCalledWith(provider.id, ['fresh-model']);
    expect(updateProvider).toHaveBeenCalledWith(provider.id, {
      endpointType: 'anthropic',
      endpointTypeCheckedAt: expect.any(Number),
    });
  });

  it('does not write model fetch results after connection draft changes', async () => {
    let resolveFetch!: (value: { models: string[]; endpointType: 'openai' | 'anthropic' }) => void;
    const fetchRequest = new Promise<{ models: string[]; endpointType: 'openai' | 'anthropic' }>((resolve) => {
      resolveFetch = resolve;
    });
    vi.mocked(openaiClient.getModelsWithEndpointDetection).mockReturnValueOnce(fetchRequest);
    const setFetchedModels = vi.fn();
    const setProviderFetchedModels = vi.fn();
    const updateProvider = vi.fn();
    const { hook, props } = renderModelActions({
      setFetchedModels,
      setProviderFetchedModels,
      updateProvider,
    });

    await act(async () => {
      void hook.result.current.handleFetchModels();
      await Promise.resolve();
    });
    const signal = vi.mocked(openaiClient.getModelsWithEndpointDetection).mock.calls[0]?.[1] as AbortSignal;

    await act(async () => {
      hook.rerender({
        ...props,
        draft: {
          ...props.draft,
          apiHost: 'https://other.example.com',
        },
      });
      await Promise.resolve();
    });

    expect(signal.aborted).toBe(true);

    await act(async () => {
      resolveFetch({ models: ['late-model'], endpointType: 'openai' });
      await fetchRequest;
      await Promise.resolve();
    });

    expect(setFetchedModels).not.toHaveBeenCalled();
    expect(setProviderFetchedModels).not.toHaveBeenCalled();
    expect(updateProvider).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(hook.result.current.isFetchingModels).toBe(false);
    });
  });

  it('does not carry stale endpoint detection into model fetches after the API key changes', async () => {
    vi.mocked(openaiClient.getModelsWithEndpointDetection)
      .mockResolvedValueOnce({ models: ['claude-sonnet-4-5'], endpointType: 'anthropic' });
    const cachedProvider = {
      ...provider,
      endpointType: 'openai' as const,
      endpointTypeCheckedAt: 12,
    };
    const { hook } = renderModelActions({
      provider: cachedProvider,
      draft: {
        name: cachedProvider.name,
        apiHost: cachedProvider.apiHost,
        apiKey: 'sk-new',
        enabled: cachedProvider.enabled,
      },
    });

    await act(async () => {
      await hook.result.current.handleFetchModels();
    });

    expect(openaiClient.getModelsWithEndpointDetection).toHaveBeenCalledTimes(1);
    expect(openaiClient.getModelsWithEndpointDetection).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk-new',
        endpointType: undefined,
        endpointTypeCheckedAt: undefined,
      }),
      expect.any(AbortSignal),
    );
  });

  it.each([
    ['401 authentication', new Error('Failed to fetch OpenAI-compatible models: 401'), 'chat.error.authFailed'],
    ['403 authentication', new Error('Failed to fetch Anthropic models: 403'), 'chat.error.authFailed'],
    ['timeout', new Error('Model listing request timed out.'), 'chat.error.timeout'],
    ['connection', new Error('AI_PROVIDER_CONNECTION_FAILED'), 'chat.error.customProviderConnectionFailed'],
    ['upstream server', new Error('Failed to fetch OpenAI-compatible models: 503'), 'chat.error.customProviderConnectionFailed'],
    ['rate limit', new Error('Failed to fetch OpenAI-compatible models: 429'), 'chat.error.upstreamRateLimited'],
    ['oversized response', new Error('AI provider response body is too large.'), 'settings.ai.fetchModelsResponseTooLarge'],
    ['invalid response', new SyntaxError('Unexpected token in JSON'), 'settings.ai.fetchModelsInvalidResponse'],
    ['unknown failure', new Error('Unclassified model listing failure'), 'settings.ai.fetchModelsFailed'],
  ])('maps %s failures to a safe message key', async (_label, error, expectedKey) => {
    vi.mocked(openaiClient.getModelsWithEndpointDetection).mockRejectedValueOnce(error);
    const { hook } = renderModelActions();

    await act(async () => {
      await hook.result.current.handleFetchModels();
    });

    expect(hook.result.current.fetchError).toBe(expectedKey);
  });
});
