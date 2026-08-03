import { useEffect, useMemo, useRef, useState } from 'react';
import { backgroundBenchmarkRunner } from '@/lib/ai/healthCheck';
import type { AIModel, Provider, ProviderBenchmarkRecord } from '@/lib/ai/types';
import { toHealthStatusMap, useProviderBenchmarkSnapshot } from './useProviderBenchmarkSnapshot';
import { useProviderBenchmarkPersistence } from './useProviderBenchmarkPersistence';
import {
  areBenchmarkScopesEqual,
  buildBenchmarkActivityFlags,
  buildFetchedBenchmarkModels,
  getBenchmarkableModels,
  isSameBenchmarkRecord,
  mergeBenchmarkScopes,
  normalizeBenchmarkScopes,
  removeBenchmarkScope,
  resolveActiveBenchmarkScopes,
  resolveBenchmarkModelsForScopes,
  toPersistedItems,
  type BenchmarkScope,
} from './providerBenchmarkUtils';

export function useProviderBenchmark({
  provider,
  providerModels,
  availableFetchedModels,
  canUseConnectionActions,
  draft,
  benchmarkResults,
  setProviderBenchmarkResults,
}: {
  provider: Provider | undefined;
  providerModels: AIModel[];
  availableFetchedModels: string[];
  canUseConnectionActions: boolean;
  draft: { name: string; apiHost: string; apiKey: string; enabled: boolean };
  benchmarkResults: Record<string, ProviderBenchmarkRecord>;
  setProviderBenchmarkResults: (providerId: string, record: ProviderBenchmarkRecord) => void;
}) {
  const providerId = provider?.id;
  const [queuedBenchmarkModelIds, setQueuedBenchmarkModelIds] = useState<string[]>([]);
  const individualBenchmarkRunRef = useRef(false);
  const {
    healthStatus,
    setHealthStatus,
    isHealthChecking,
    setIsHealthChecking,
    healthCheckOverall,
    setHealthCheckOverall,
    benchmarkingModelIds,
    setBenchmarkingModelIds,
    activeBenchmarkScopes,
    setActiveBenchmarkScopes,
    queuedBenchmarkScopes,
    setQueuedBenchmarkScopes,
    activeBenchmarkScopesRef,
    benchmarkResultsRef,
  } = useProviderBenchmarkSnapshot({ providerId, benchmarkResults });

  const availableBenchmarkModels = useMemo(() => buildFetchedBenchmarkModels(provider, availableFetchedModels), [
    availableFetchedModels,
    provider,
  ]);
  const selectedBenchmarkModels = useMemo(() => providerModels, [providerModels]);
  const { selectedBenchmarkActive, availableBenchmarkActive, benchmarkAllActive } = useMemo(
    () => buildBenchmarkActivityFlags({ activeBenchmarkScopes, queuedBenchmarkScopes }),
    [activeBenchmarkScopes, queuedBenchmarkScopes]
  );
  const resolveScopedBenchmarkModels = (scopes: BenchmarkScope[]): AIModel[] =>
    resolveBenchmarkModelsForScopes({
      scopes,
      selectedBenchmarkModels,
      availableBenchmarkModels,
    });
  const getRunnableBenchmarkModels = (
    modelsToCheck: AIModel[],
    options?: { ignoreQueuedScopes?: BenchmarkScope[] }
  ) =>
    getBenchmarkableModels({
      modelsToCheck,
      isHealthChecking,
      benchmarkingModelIds,
      queuedBenchmarkScopes,
      selectedBenchmarkModels,
      availableBenchmarkModels,
      ignoreQueuedScopes: options?.ignoreQueuedScopes,
    });

  const canBenchmarkSelected =
    canUseConnectionActions && getRunnableBenchmarkModels(selectedBenchmarkModels).length > 0;
  const canBenchmarkAvailable =
    canUseConnectionActions && getRunnableBenchmarkModels(availableBenchmarkModels).length > 0;
  const canBenchmarkAll =
    canUseConnectionActions &&
    getRunnableBenchmarkModels([...selectedBenchmarkModels, ...availableBenchmarkModels]).length > 0;

  const syncActiveBenchmarkScopes = (scopes: BenchmarkScope[]) => {
    const normalizedScopes = normalizeBenchmarkScopes(scopes);
    if (areBenchmarkScopesEqual(activeBenchmarkScopesRef.current, normalizedScopes)) return;

    activeBenchmarkScopesRef.current = normalizedScopes;
    setActiveBenchmarkScopes(normalizedScopes);
  };

  const { persistBenchmarkHealthStatus, clearBenchmarkScopes } = useProviderBenchmarkPersistence({
    provider,
    benchmarkResultsRef,
    setProviderBenchmarkResults,
    setHealthStatus,
    setHealthCheckOverall,
    resolveScopedBenchmarkModels,
  });

  const buildTempProvider = (): Provider | null => {
    if (!provider) return null;
    return {
      ...provider,
      name: draft.name,
      apiHost: draft.apiHost,
      apiKey: draft.apiKey,
      enabled: draft.enabled,
      updatedAt: Date.now(),
    };
  };

  const startBenchmarkRun = (scopes: BenchmarkScope[]) => {
    if (!provider) return;

    const tempProvider = buildTempProvider();
    if (!tempProvider) return;

    const normalizedScopes = normalizeBenchmarkScopes(scopes);
    const nextModels = getRunnableBenchmarkModels(resolveScopedBenchmarkModels(normalizedScopes), {
      ignoreQueuedScopes: normalizedScopes,
    });
    if (nextModels.length === 0) return;

    clearBenchmarkScopes(normalizedScopes);
    individualBenchmarkRunRef.current = false;
    setBenchmarkingModelIds([]);
    syncActiveBenchmarkScopes(normalizedScopes);
    backgroundBenchmarkRunner.start(tempProvider, nextModels);
  };

  const stopBenchmarkRun = () => {
    if (!provider) return;

    individualBenchmarkRunRef.current = false;
    const nextRecord = persistBenchmarkHealthStatus(healthStatus);
    if (nextRecord) {
      setHealthStatus(toHealthStatusMap(nextRecord));
      setHealthCheckOverall(nextRecord.overall);
    }
    setIsHealthChecking(false);
    setBenchmarkingModelIds([]);
    setQueuedBenchmarkScopes([]);
    setQueuedBenchmarkModelIds([]);
    syncActiveBenchmarkScopes([]);
    backgroundBenchmarkRunner.stop(provider.id);
  };

  const cancelBenchmarkScope = (scope: Exclude<BenchmarkScope, 'all'>) => {
    if (!provider) return;

    const activeScopes = normalizeBenchmarkScopes(activeBenchmarkScopesRef.current);
    const queuedScopes = normalizeBenchmarkScopes(queuedBenchmarkScopes);
    const nextQueuedScopes = removeBenchmarkScope(queuedScopes, scope);
    const scopeIsRunning = activeScopes.includes(scope) || activeScopes.includes('all');

    if (!scopeIsRunning) {
      setQueuedBenchmarkScopes(nextQueuedScopes);
      return;
    }

    const nextActiveScopes = removeBenchmarkScope(activeScopes, scope);
    const nextRecord = persistBenchmarkHealthStatus(healthStatus);
    const persistedStatus = toHealthStatusMap(nextRecord || benchmarkResultsRef.current[provider.id]);
    const resumeModels = resolveScopedBenchmarkModels(nextActiveScopes).filter((model) => {
      const status = healthStatus[model.id];
      return !status || status.status === 'loading';
    });

    backgroundBenchmarkRunner.stop(provider.id);
    setHealthStatus(persistedStatus);
    setHealthCheckOverall(nextRecord?.overall || 'idle');
    setBenchmarkingModelIds([]);
    setQueuedBenchmarkScopes(nextQueuedScopes);

    if (nextActiveScopes.length === 0 || resumeModels.length === 0) {
      setIsHealthChecking(false);
      syncActiveBenchmarkScopes([]);
      return;
    }

    const tempProvider = buildTempProvider();
    if (!tempProvider) {
      setIsHealthChecking(false);
      syncActiveBenchmarkScopes([]);
      return;
    }

    setIsHealthChecking(true);
    setBenchmarkingModelIds(resumeModels.map((model) => model.id));
    syncActiveBenchmarkScopes(nextActiveScopes);
    backgroundBenchmarkRunner.start(tempProvider, resumeModels);
  };

  const queueOrStartBenchmark = (scope: BenchmarkScope) => {
    const nextModels = getRunnableBenchmarkModels(resolveScopedBenchmarkModels([scope]));
    if (nextModels.length === 0) return;

    if (backgroundBenchmarkRunner.getSnapshot(provider?.id || '')?.isRunning) {
      setQueuedBenchmarkScopes((prev) => mergeBenchmarkScopes(prev, scope));
      return;
    }

    setQueuedBenchmarkScopes([]);
    startBenchmarkRun([scope]);
  };

  const handleBenchmarkModels = async () => {
    if (selectedBenchmarkActive) {
      cancelBenchmarkScope('selected');
      return;
    }
    if (canBenchmarkSelected) queueOrStartBenchmark('selected');
  };

  const handleBenchmarkAvailableModels = async () => {
    if (availableBenchmarkActive) {
      cancelBenchmarkScope('available');
      return;
    }
    if (canBenchmarkAvailable) queueOrStartBenchmark('available');
  };

  const handleBenchmarkAllModels = async () => {
    if (benchmarkAllActive) {
      stopBenchmarkRun();
      return;
    }
    if (canBenchmarkAll) {
      setQueuedBenchmarkModelIds([]);
      queueOrStartBenchmark('all');
    }
  };

  const handleBenchmarkModel = async (modelId: string) => {
    if (!canUseConnectionActions || queuedBenchmarkModelIds.includes(modelId)) return;

    const model = [...selectedBenchmarkModels, ...availableBenchmarkModels]
      .find((candidate) => candidate.id === modelId);
    const tempProvider = buildTempProvider();
    if (!model || !tempProvider) return;

    if (backgroundBenchmarkRunner.getSnapshot(provider?.id || '')?.isRunning) {
      setQueuedBenchmarkModelIds((previous) => previous.includes(modelId) ? previous : [...previous, modelId]);
      return;
    }

    setQueuedBenchmarkScopes([]);
    individualBenchmarkRunRef.current = true;
    syncActiveBenchmarkScopes([]);
    backgroundBenchmarkRunner.start(tempProvider, [model]);
  };

  useEffect(() => {
    if (!provider || isHealthChecking || queuedBenchmarkScopes.length === 0) return;

    const nextScopes = queuedBenchmarkScopes;
    setQueuedBenchmarkScopes([]);
    startBenchmarkRun(nextScopes);
  }, [provider, isHealthChecking, queuedBenchmarkScopes, draft.name, draft.apiHost, draft.apiKey]);

  useEffect(() => {
    if (!provider || isHealthChecking || queuedBenchmarkModelIds.length === 0) return;
    if (backgroundBenchmarkRunner.getSnapshot(provider.id)?.isRunning) return;

    const queuedIds = new Set(queuedBenchmarkModelIds);
    const queuedModels = [...selectedBenchmarkModels, ...availableBenchmarkModels]
      .filter((model) => queuedIds.has(model.id));
    setQueuedBenchmarkModelIds([]);
    if (queuedModels.length === 0) return;

    const tempProvider = buildTempProvider();
    if (!tempProvider) return;
    individualBenchmarkRunRef.current = true;
    syncActiveBenchmarkScopes([]);
    backgroundBenchmarkRunner.start(tempProvider, queuedModels);
  }, [provider, isHealthChecking, queuedBenchmarkModelIds, selectedBenchmarkModels, availableBenchmarkModels, draft.name, draft.apiHost, draft.apiKey]);

  useEffect(() => {
    if (
      isHealthChecking ||
      queuedBenchmarkScopes.length > 0 ||
      queuedBenchmarkModelIds.length > 0 ||
      activeBenchmarkScopesRef.current.length === 0
    ) return;

    setActiveBenchmarkScopes([]);
    activeBenchmarkScopesRef.current = [];
  }, [isHealthChecking, queuedBenchmarkScopes, queuedBenchmarkModelIds]);

  useEffect(() => {
    if (!isHealthChecking) return;
    if (individualBenchmarkRunRef.current) {
      syncActiveBenchmarkScopes([]);
      return;
    }
    syncActiveBenchmarkScopes(resolveActiveBenchmarkScopes(benchmarkingModelIds, selectedBenchmarkModels, availableBenchmarkModels));
  }, [isHealthChecking, benchmarkingModelIds, selectedBenchmarkModels, availableBenchmarkModels]);

  useEffect(() => {
    if (!provider || isHealthChecking || Object.keys(healthStatus).length === 0) return;

    const persistedRecord = benchmarkResults[provider.id];
    if (!persistedRecord && !backgroundBenchmarkRunner.getSnapshot(provider.id)) return;
    const items = toPersistedItems(healthStatus);
    if (isSameBenchmarkRecord(persistedRecord, items, healthCheckOverall)) return;

    setProviderBenchmarkResults(provider.id, {
      items,
      overall: healthCheckOverall,
      updatedAt: Date.now(),
    });
  }, [provider, isHealthChecking, healthStatus, healthCheckOverall, benchmarkResults, setProviderBenchmarkResults]);

  const resetBenchmarkState = () => {
    individualBenchmarkRunRef.current = false;
    setHealthStatus({});
    setHealthCheckOverall('idle');
    setIsHealthChecking(false);
    setQueuedBenchmarkScopes([]);
    setQueuedBenchmarkModelIds([]);
    syncActiveBenchmarkScopes([]);
    if (provider) {
      backgroundBenchmarkRunner.stop(provider.id);
    }
  };

  return {
    healthStatus,
    isHealthChecking,
    healthCheckOverall,
    canBenchmarkSelected,
    canBenchmarkAvailable,
    canBenchmarkAll,
    benchmarkAllActive,
    benchmarkAllQueued: queuedBenchmarkScopes.includes('all'),
    selectedBenchmarkActive,
    availableBenchmarkActive,
    queuedBenchmarkModelIds,
    handleBenchmarkModels,
    handleBenchmarkAvailableModels,
    handleBenchmarkAllModels,
    handleBenchmarkModel,
    resetBenchmarkState,
  };
}
