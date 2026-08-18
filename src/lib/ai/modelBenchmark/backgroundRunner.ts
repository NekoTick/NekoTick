import type { AIModel, Provider } from '../types';
import { refreshManagedBudgetIfNeeded } from '../managedBudgetRefresh';
import { isManagedProviderId } from '../managedService';
import { benchmarkModels } from './batch';

export interface BenchmarkItemState {
  status: 'loading' | 'success' | 'error';
  latency?: number;
  error?: string;
}

export interface ProviderBenchmarkSnapshot {
  providerId: string;
  isRunning: boolean;
  overall: 'idle' | 'success' | 'error';
  total: number;
  completed: number;
  items: Record<string, BenchmarkItemState>;
  startedAt: number;
  finishedAt?: number;
  runId: number;
}

type SnapshotListener = (snapshot: ProviderBenchmarkSnapshot) => void;

class BackgroundBenchmarkRunner {
  private snapshots = new Map<string, ProviderBenchmarkSnapshot>();
  private listeners = new Map<string, Set<SnapshotListener>>();
  private abortControllers = new Map<string, AbortController>();
  private nextRunId = 1;

  getSnapshot(providerId: string): ProviderBenchmarkSnapshot | null {
    return this.snapshots.get(providerId) ?? null;
  }

  subscribe(providerId: string, listener: SnapshotListener): () => void {
    const listeners = this.listeners.get(providerId) ?? new Set<SnapshotListener>();
    listeners.add(listener);
    this.listeners.set(providerId, listeners);

    const snapshot = this.snapshots.get(providerId);
    if (snapshot) {
      this.notifyListener(listener, snapshot);
    }

    return () => {
      const current = this.listeners.get(providerId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(providerId);
      }
    };
  }

  clear(providerId: string): void {
    const controller = this.abortControllers.get(providerId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(providerId);
    }
    this.snapshots.delete(providerId);
    const listeners = this.listeners.get(providerId);
    if (!listeners || listeners.size === 0) {
      return;
    }
    const emptySnapshot: ProviderBenchmarkSnapshot = {
      providerId,
      isRunning: false,
      overall: 'idle',
      total: 0,
      completed: 0,
      items: {},
      startedAt: Date.now(),
      finishedAt: Date.now(),
      runId: this.nextRunId++,
    };
    this.notifyListeners(providerId, emptySnapshot);
  }

  stop(providerId: string): void {
    this.clear(providerId);
  }

  start(provider: Provider, models: AIModel[]): boolean {
    if (models.length === 0) {
      return false;
    }

    const existing = this.snapshots.get(provider.id);
    if (existing?.isRunning) {
      return false;
    }

    const runId = this.nextRunId++;
    const startedAt = Date.now();
    const abortController = new AbortController();
    const items: Record<string, BenchmarkItemState> = {};
    for (const model of models) {
      items[model.id] = { status: 'loading' };
    }

    this.abortControllers.set(provider.id, abortController);

    this.setSnapshot(provider.id, {
      providerId: provider.id,
      isRunning: true,
      overall: 'idle',
      total: models.length,
      completed: 0,
      items,
      startedAt,
      runId,
    });

    void this.run(provider, models, runId, abortController);
    return true;
  }

  private setSnapshot(providerId: string, snapshot: ProviderBenchmarkSnapshot): void {
    this.snapshots.set(providerId, snapshot);
    this.notifyListeners(providerId, snapshot);
  }

  private notifyListener(listener: SnapshotListener, snapshot: ProviderBenchmarkSnapshot): void {
    try {
      listener(snapshot);
    } catch {
    }
  }

  private notifyListeners(providerId: string, snapshot: ProviderBenchmarkSnapshot): void {
    const listeners = this.listeners.get(providerId);
    if (!listeners || listeners.size === 0) {
      return;
    }
    for (const listener of listeners) {
      this.notifyListener(listener, snapshot);
    }
  }

  private patchSnapshot(
    providerId: string,
    runId: number,
    patch: Partial<ProviderBenchmarkSnapshot>
  ): ProviderBenchmarkSnapshot | null {
    const current = this.snapshots.get(providerId);
    if (!current || current.runId !== runId) {
      return null;
    }
    const next = { ...current, ...patch };
    this.setSnapshot(providerId, next);
    return next;
  }

  private async run(
    provider: Provider,
    models: AIModel[],
    runId: number,
    abortController: AbortController
  ): Promise<void> {
    try {
      const results = await benchmarkModels(provider, models, {
        signal: abortController.signal,
        onProgress: ({ modelId, result, completed }) => {
          const current = this.snapshots.get(provider.id);
          if (!current || current.runId !== runId) {
            return;
          }

          this.patchSnapshot(provider.id, runId, {
            completed,
            items: {
              ...current.items,
              [modelId]: {
                status: result.status,
                latency: result.latency,
                error: result.error,
              },
            },
          });
        },
      });

      const hasError = Object.values(results).some((result) => result.status === 'error');
      const hasSuccess = Object.values(results).some((result) => result.status === 'success');
      if (isManagedProviderId(provider.id) && hasSuccess) {
        refreshManagedBudgetIfNeeded(provider.id);
      }
      const current = this.snapshots.get(provider.id);
      if (!current || current.runId !== runId) {
        return;
      }
      const finalItems = { ...current.items };
      for (const model of models) {
        const result = results[model.id];
        if (!result) {
          continue;
        }
        finalItems[model.id] = {
          status: result.status,
          latency: result.latency,
          error: result.error,
        };
      }
      this.patchSnapshot(provider.id, runId, {
        isRunning: false,
        overall: hasError ? 'error' : 'success',
        completed: models.length,
        items: finalItems,
        finishedAt: Date.now(),
      });
    } catch {
      const current = this.snapshots.get(provider.id);
      if (!current || current.runId !== runId) {
        return;
      }
      this.patchSnapshot(provider.id, runId, {
        isRunning: false,
        overall: 'error',
        finishedAt: Date.now(),
      });
    } finally {
      const currentController = this.abortControllers.get(provider.id);
      if (currentController === abortController) {
        this.abortControllers.delete(provider.id);
      }
    }
  }
}

export const backgroundBenchmarkRunner = new BackgroundBenchmarkRunner();
