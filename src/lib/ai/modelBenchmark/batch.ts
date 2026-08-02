import type { AIModel, Provider } from '../types';
import { getUserFacingAIError } from '../errors';
import {
  DEFAULT_BENCHMARK_BATCH_DELAY_MS,
  DEFAULT_BENCHMARK_CONCURRENCY,
} from './constants';
import { checkModelHealth } from './singleModel';
import type { BenchmarkModelsOptions, BenchmarkResultMap, HealthCheckResult } from './types';

function normalizeConcurrency(value?: number): number {
  if (!value || !Number.isFinite(value)) {
    return DEFAULT_BENCHMARK_CONCURRENCY;
  }

  const rounded = Math.floor(value);
  return Math.min(Math.max(rounded, 1), 10);
}

function normalizeBatchDelay(value?: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_BENCHMARK_BATCH_DELAY_MS;
  }
  return Math.max(0, Math.floor(value));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, ms);

    const handleAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

export async function benchmarkModels(
  provider: Provider,
  models: AIModel[],
  options: BenchmarkModelsOptions = {}
): Promise<BenchmarkResultMap> {
  const resultMap: BenchmarkResultMap = {};
  const total = models.length;

  if (total === 0) {
    return resultMap;
  }

  const concurrency = normalizeConcurrency(options.concurrency);
  const batchDelayMs = normalizeBatchDelay(options.batchDelayMs);
  let completed = 0;

  for (let index = 0; index < models.length; index += concurrency) {
    if (options.signal?.aborted) {
      break;
    }

    const currentBatch = models.slice(index, index + concurrency);
    await Promise.all(
      currentBatch.map(async (model) => {
        if (options.signal?.aborted) {
          return;
        }

        let result: HealthCheckResult;
        try {
          result = await checkModelHealth(provider, model, {
            timeoutMs: options.timeoutMs,
            signal: options.signal,
          });
        } catch (error: unknown) {
          result = {
            status: 'error',
            error: getUserFacingAIError(error).message,
            endpoint: 'chat',
          };
        }

        if (options.signal?.aborted) {
          return;
        }

        resultMap[model.id] = result;
        completed += 1;
        options.onProgress?.({
          modelId: model.id,
          result,
          completed,
          total,
        });
      })
    );

    if (options.signal?.aborted) {
      break;
    }

    const hasMore = index + concurrency < models.length;
    if (hasMore && batchDelayMs > 0) {
      await sleep(batchDelayMs, options.signal);
    }
  }

  return resultMap;
}
