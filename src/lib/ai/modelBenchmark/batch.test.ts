import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AIModel, Provider } from '../types';
import { MANAGED_PROVIDER_ID } from '../managed/constants';
import { benchmarkModels } from './batch';
import { checkModelHealth } from './singleModel';

vi.mock('./singleModel', () => ({
  checkModelHealth: vi.fn(),
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

function createModel(id: string): AIModel {
  return {
    id,
    apiModelId: id,
    name: id,
    providerId: provider.id,
    enabled: true,
    createdAt: 1,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('benchmarkModels', () => {
  it('reports progress for each model and returns final result map', async () => {
    const mockedCheckModelHealth = vi.mocked(checkModelHealth);
    mockedCheckModelHealth.mockImplementation(async (_, model) => {
      const delayMs = model.id === 'm-1' ? 30 : model.id === 'm-2' ? 10 : 5;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return {
        status: 'success',
        latency: delayMs,
        endpoint: 'chat',
      };
    });

    const models = [createModel('m-1'), createModel('m-2'), createModel('m-3')];
    const progress: string[] = [];

    const resultMap = await benchmarkModels(provider, models, {
      concurrency: 2,
      batchDelayMs: 0,
      onProgress: ({ modelId }) => {
        progress.push(modelId);
      },
    });

    expect(progress).toHaveLength(3);
    expect(new Set(progress)).toEqual(new Set(['m-1', 'm-2', 'm-3']));
    expect(resultMap['m-1']?.status).toBe('success');
    expect(resultMap['m-2']?.status).toBe('success');
    expect(resultMap['m-3']?.status).toBe('success');
  });

  it('forwards abort signals to single-model checks', async () => {
    const mockedCheckModelHealth = vi.mocked(checkModelHealth);
    const controller = new AbortController();

    mockedCheckModelHealth.mockResolvedValue({
      status: 'success',
      latency: 10,
      endpoint: 'chat',
    });

    await benchmarkModels(provider, [createModel('m-1')], {
      signal: controller.signal,
      batchDelayMs: 0,
    });

    expect(mockedCheckModelHealth).toHaveBeenCalledWith(
      provider,
      expect.objectContaining({ id: 'm-1' }),
      expect.objectContaining({ signal: controller.signal })
    );
  });

  it('stops waiting between batches when aborted during the batch delay', async () => {
    vi.useFakeTimers();
    const mockedCheckModelHealth = vi.mocked(checkModelHealth);
    mockedCheckModelHealth.mockClear();
    const controller = new AbortController();
    mockedCheckModelHealth.mockResolvedValue({
      status: 'success',
      latency: 10,
      endpoint: 'chat',
    });

    const pending = benchmarkModels(provider, [createModel('m-1'), createModel('m-2')], {
      concurrency: 1,
      batchDelayMs: 60_000,
      signal: controller.signal,
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(mockedCheckModelHealth).toHaveBeenCalledTimes(1);
    controller.abort();

    await expect(pending).resolves.toEqual({
      'm-1': {
        status: 'success',
        latency: 10,
        endpoint: 'chat',
      },
    });
    expect(mockedCheckModelHealth).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('does not publish progress or results when aborted after a model check resolves', async () => {
    const mockedCheckModelHealth = vi.mocked(checkModelHealth);
    const controller = new AbortController();
    const onProgress = vi.fn();
    mockedCheckModelHealth.mockImplementation(async () => {
      controller.abort();
      return {
        status: 'success',
        latency: 10,
        endpoint: 'chat',
      };
    });

    const resultMap = await benchmarkModels(provider, [createModel('m-1')], {
      signal: controller.signal,
      batchDelayMs: 0,
      onProgress,
    });

    expect(resultMap).toEqual({});
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('keeps managed machine error handling when a model check unexpectedly rejects', async () => {
    vi.mocked(checkModelHealth).mockRejectedValue(new Error('UPSTREAM_UNAVAILABLE'));

    const result = await benchmarkModels(
      { ...provider, id: MANAGED_PROVIDER_ID },
      [createModel('m-1')],
      { batchDelayMs: 0 },
    );

    expect(result['m-1']).toMatchObject({
      status: 'error',
      error: '๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~',
    });
  });
});
