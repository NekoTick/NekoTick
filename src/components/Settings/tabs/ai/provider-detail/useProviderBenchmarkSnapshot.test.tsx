import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backgroundBenchmarkRunner } from '@/lib/ai/healthCheck';
import type { AIModel, Provider, ProviderBenchmarkRecord } from '@/lib/ai/types';
import { useProviderBenchmark } from './useProviderBenchmark';
import { useProviderBenchmarkSnapshot } from './useProviderBenchmarkSnapshot';

vi.mock('@/lib/ai/modelBenchmark/batch', () => ({
  benchmarkModels: vi.fn(() => new Promise(() => undefined)),
}));

const provider: Provider = {
  id: 'provider-1',
  name: 'Provider 1',
  type: 'newapi',
  apiHost: 'https://api.example.com',
  apiKey: 'sk-test',
  enabled: true,
  createdAt: 1,
  updatedAt: 1,
};

const model: AIModel = {
  id: 'provider-1::gpt-a',
  providerId: 'provider-1',
  apiModelId: 'gpt-a',
  name: 'GPT A',
  enabled: true,
  createdAt: 1,
};

function benchmarkRecord(status: 'success' | 'error', updatedAt: number): ProviderBenchmarkRecord {
  return {
    items: {
      [model.id]: {
        status,
        latency: status === 'success' ? 120 : undefined,
        error: status === 'error' ? 'failed' : undefined,
        checkedAt: updatedAt,
      },
    },
    overall: status,
    updatedAt,
  };
}

describe('useProviderBenchmarkSnapshot', () => {
  afterEach(() => {
    act(() => {
      backgroundBenchmarkRunner.clear(provider.id);
    });
  });

  it('applies externally synced benchmark results without switching providers', async () => {
    const initialResults = {
      [provider.id]: benchmarkRecord('success', 1),
    };
    const syncedResults = {
      [provider.id]: benchmarkRecord('error', 2),
    };

    let hook!: ReturnType<typeof renderHook<ReturnType<typeof useProviderBenchmarkSnapshot>, { benchmarkResults: Record<string, ProviderBenchmarkRecord> }>>;
    await act(async () => {
      hook = renderHook(
        ({ benchmarkResults }) => useProviderBenchmarkSnapshot({ providerId: provider.id, benchmarkResults }),
        { initialProps: { benchmarkResults: initialResults } }
      );
    });

    await waitFor(() => {
      expect(hook.result.current.healthStatus[model.id]).toMatchObject({ status: 'success', latency: 120 });
    });

    await act(async () => {
      hook.rerender({ benchmarkResults: syncedResults });
    });

    await waitFor(() => {
      expect(hook.result.current.healthStatus[model.id]).toMatchObject({ status: 'error', error: 'failed' });
      expect(hook.result.current.healthCheckOverall).toBe('error');
      expect(hook.result.current.isHealthChecking).toBe(false);
    });
  });

  it('keeps the active local benchmark snapshot while external persisted results change', async () => {
    let hook!: ReturnType<typeof renderHook<ReturnType<typeof useProviderBenchmarkSnapshot>, { benchmarkResults: Record<string, ProviderBenchmarkRecord> }>>;
    await act(async () => {
      hook = renderHook(
        ({ benchmarkResults }) => useProviderBenchmarkSnapshot({ providerId: provider.id, benchmarkResults }),
        {
          initialProps: {
            benchmarkResults: {
              [provider.id]: benchmarkRecord('success', 1),
            },
          },
        }
      );
    });

    act(() => {
      backgroundBenchmarkRunner.start(provider, [model]);
    });

    await act(async () => {
      hook.rerender({
        benchmarkResults: {
          [provider.id]: benchmarkRecord('error', 2),
        },
      });
    });

    await waitFor(() => {
      expect(hook.result.current.isHealthChecking).toBe(true);
      expect(hook.result.current.healthStatus[model.id]).toMatchObject({ status: 'loading' });
      expect(hook.result.current.benchmarkingModelIds).toEqual([model.id]);
    });
  });

  it('keeps local state stable when an equivalent results object is recreated', async () => {
    const initialRecord = benchmarkRecord('success', 1);
    const hook = renderHook(
      ({ benchmarkResults }) => useProviderBenchmarkSnapshot({ providerId: provider.id, benchmarkResults }),
      { initialProps: { benchmarkResults: { [provider.id]: initialRecord } } }
    );
    const initialHealthStatus = hook.result.current.healthStatus;
    const initialModelIds = hook.result.current.benchmarkingModelIds;

    await act(async () => {
      hook.rerender({ benchmarkResults: { [provider.id]: { ...initialRecord } } });
    });

    expect(hook.result.current.healthStatus).toBe(initialHealthStatus);
    expect(hook.result.current.benchmarkingModelIds).toBe(initialModelIds);
  });
});

describe('useProviderBenchmark persistence', () => {
  afterEach(() => {
    act(() => {
      backgroundBenchmarkRunner.clear(provider.id);
    });
  });

  it('does not restore benchmark results cleared with the provider connection state', async () => {
    const setProviderBenchmarkResults = vi.fn();
    const initialResults = { [provider.id]: benchmarkRecord('success', 1) };
    const hook = renderHook(
      ({ benchmarkResults }) => useProviderBenchmark({
        provider,
        providerModels: [model],
        availableFetchedModels: [],
        canUseConnectionActions: true,
        draft: {
          name: provider.name,
          apiHost: provider.apiHost,
          apiKey: provider.apiKey,
          enabled: provider.enabled,
        },
        benchmarkResults,
        setProviderBenchmarkResults,
      }),
      { initialProps: { benchmarkResults: initialResults as Record<string, ProviderBenchmarkRecord> } },
    );

    await act(async () => {
      hook.rerender({ benchmarkResults: {} });
    });

    await waitFor(() => {
      expect(hook.result.current.healthStatus).toEqual({});
    });
    expect(setProviderBenchmarkResults).not.toHaveBeenCalled();
  });
});
