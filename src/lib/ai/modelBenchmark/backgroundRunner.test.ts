import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIModel, Provider } from '../types';
import { refreshManagedBudgetIfNeeded } from '../managedBudgetRefresh';
import { backgroundBenchmarkRunner } from './backgroundRunner';
import { benchmarkModels } from './batch';

vi.mock('./batch', () => ({
  benchmarkModels: vi.fn(),
}));

vi.mock('../managedBudgetRefresh', () => ({
  refreshManagedBudgetIfNeeded: vi.fn(),
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

beforeEach(() => {
  backgroundBenchmarkRunner.clear(provider.id);
  backgroundBenchmarkRunner.clear('vlaina-managed');
  vi.mocked(refreshManagedBudgetIfNeeded).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('backgroundBenchmarkRunner', () => {
  it('keeps benchmark running independent of UI subscriptions', async () => {
    const mockedBenchmarkModels = vi.mocked(benchmarkModels);
    mockedBenchmarkModels.mockImplementation(async (_provider, models, options) => {
      options?.onProgress?.({
        modelId: models[0].id,
        completed: 1,
        total: models.length,
        result: { status: 'success', latency: 10, endpoint: 'chat' },
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      options?.onProgress?.({
        modelId: models[1].id,
        completed: 2,
        total: models.length,
        result: { status: 'success', latency: 12, endpoint: 'chat' },
      });
      return {
        [models[0].id]: { status: 'success', latency: 10, endpoint: 'chat' },
        [models[1].id]: { status: 'success', latency: 12, endpoint: 'chat' },
      };
    });

    const models = [createModel('m-1'), createModel('m-2')];
    const snapshots: Array<{ completed: number; running: boolean }> = [];
    const unsubscribe = backgroundBenchmarkRunner.subscribe(provider.id, (snapshot) => {
      snapshots.push({ completed: snapshot.completed, running: snapshot.isRunning });
    });

    const started = backgroundBenchmarkRunner.start(provider, models);
    expect(started).toBe(true);

    const runningSnapshot = backgroundBenchmarkRunner.getSnapshot(provider.id);
    expect(runningSnapshot?.isRunning).toBe(true);

    unsubscribe();

    await new Promise((resolve) => setTimeout(resolve, 30));

    const finalSnapshot = backgroundBenchmarkRunner.getSnapshot(provider.id);
    expect(finalSnapshot?.isRunning).toBe(false);
    expect(finalSnapshot?.overall).toBe('success');
    expect(finalSnapshot?.completed).toBe(2);
    expect(finalSnapshot?.items['m-1']?.status).toBe('success');
    expect(finalSnapshot?.items['m-2']?.status).toBe('success');
    expect(snapshots.length).toBeGreaterThan(0);
    expect(refreshManagedBudgetIfNeeded).not.toHaveBeenCalled();
  });

  it('refreshes managed budget once after a successful benchmark batch', async () => {
    const managedProvider = { ...provider, id: 'vlaina-managed' };
    const models = [
      { ...createModel('managed-1'), providerId: managedProvider.id },
      { ...createModel('managed-2'), providerId: managedProvider.id },
    ];
    vi.mocked(benchmarkModels).mockResolvedValue({
      'managed-1': { status: 'success', latency: 10, endpoint: 'chat' },
      'managed-2': { status: 'success', latency: 12, endpoint: 'chat' },
    });

    expect(backgroundBenchmarkRunner.start(managedProvider, models)).toBe(true);
    await vi.waitFor(() => {
      expect(backgroundBenchmarkRunner.getSnapshot(managedProvider.id)?.isRunning).toBe(false);
    });

    expect(refreshManagedBudgetIfNeeded).toHaveBeenCalledOnce();
    expect(refreshManagedBudgetIfNeeded).toHaveBeenCalledWith(managedProvider.id);
  });

  it('does not refresh managed budget when every benchmark request fails', async () => {
    const managedProvider = { ...provider, id: 'vlaina-managed' };
    const model = { ...createModel('managed-1'), providerId: managedProvider.id };
    vi.mocked(benchmarkModels).mockResolvedValue({
      [model.id]: { status: 'error', error: 'Unavailable', endpoint: 'chat' },
    });

    expect(backgroundBenchmarkRunner.start(managedProvider, [model])).toBe(true);
    await vi.waitFor(() => {
      expect(backgroundBenchmarkRunner.getSnapshot(managedProvider.id)?.isRunning).toBe(false);
    });

    expect(refreshManagedBudgetIfNeeded).not.toHaveBeenCalled();
  });

  it('aborts the active benchmark run when stopped', () => {
    const mockedBenchmarkModels = vi.mocked(benchmarkModels);
    let aborted = false;
    mockedBenchmarkModels.mockImplementation(
      async (_provider, _models, options) =>
        await new Promise((_, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(new Error('aborted'));
            },
            { once: true }
          );
        })
    );

    const models = [createModel('m-1')];
    const started = backgroundBenchmarkRunner.start(provider, models);

    expect(started).toBe(true);
    expect(aborted).toBe(false);

    backgroundBenchmarkRunner.stop(provider.id);

    expect(aborted).toBe(true);
    expect(backgroundBenchmarkRunner.getSnapshot(provider.id)).toBeNull();
  });

  it('does not let a stopped run clear or overwrite a newer run', async () => {
    const mockedBenchmarkModels = vi.mocked(benchmarkModels);
    let firstAbort: (() => void) | null = null;
    mockedBenchmarkModels
      .mockImplementationOnce(
        async (_provider, _models, options) =>
          await new Promise((_, reject) => {
            firstAbort = () => {
              options?.onProgress?.({
                modelId: 'm-old',
                completed: 1,
                total: 1,
                result: { status: 'error', error: 'old aborted', endpoint: 'chat' },
              });
              reject(new Error('old aborted'));
            };
            options?.signal?.addEventListener('abort', () => firstAbort?.(), { once: true });
          })
      )
      .mockResolvedValueOnce({
        'm-new': { status: 'success', latency: 9, endpoint: 'chat' },
      });

    expect(backgroundBenchmarkRunner.start(provider, [createModel('m-old')])).toBe(true);
    const firstRunId = backgroundBenchmarkRunner.getSnapshot(provider.id)?.runId;

    backgroundBenchmarkRunner.stop(provider.id);
    expect(backgroundBenchmarkRunner.start(provider, [createModel('m-new')])).toBe(true);

    await Promise.resolve();
    await Promise.resolve();

    const snapshot = backgroundBenchmarkRunner.getSnapshot(provider.id);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.runId).not.toBe(firstRunId);
    expect(snapshot?.isRunning).toBe(false);
    expect(snapshot?.overall).toBe('success');
    expect(snapshot?.items['m-new']?.status).toBe('success');
    expect(snapshot?.items['m-old']).toBeUndefined();
  });

  it('isolates snapshot listener failures from other subscribers', async () => {
    const mockedBenchmarkModels = vi.mocked(benchmarkModels);
    mockedBenchmarkModels.mockResolvedValue({
      'm-1': { status: 'success', latency: 10, endpoint: 'chat' },
    });
    const throwingListener = vi.fn(() => {
      throw new Error('listener failed');
    });
    const healthyListener = vi.fn();

    const unsubscribeThrowing = backgroundBenchmarkRunner.subscribe(provider.id, throwingListener);
    const unsubscribeHealthy = backgroundBenchmarkRunner.subscribe(provider.id, healthyListener);

    expect(() => backgroundBenchmarkRunner.start(provider, [createModel('m-1')])).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(throwingListener).toHaveBeenCalled();
    expect(healthyListener).toHaveBeenCalled();
    unsubscribeThrowing();
    unsubscribeHealthy();
  });
});
