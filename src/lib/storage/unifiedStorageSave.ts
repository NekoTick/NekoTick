import { isTemporarySession } from '@/lib/ai/temporaryChat';
import { getStorageAdapter, joinPath } from '@/lib/storage/adapter';
import { getStorageBasePath } from './basePath';
import { isSafeChatSessionId, isSafeProviderId } from './unifiedStorageAI';
import { normalizeBoundedIdList } from './unifiedStorageCommon';
import { mergeCustomIconsForSafeSave, mergeSettingsForSafeSave, readExistingMainDataFile, serializeBoundedMainDataFile } from './unifiedStorageMainFiles';
import { sanitizeUnifiedData } from './unifiedStorageMainNormalize';
import { serializeBoundedAIProviderFile } from './unifiedStorageProviderFiles';
import { collectProviderModelsForSave, normalizeFetchedModelsForSave, normalizeProviderBenchmarkRecord, normalizeProvidersForSave } from './unifiedStorageProviderNormalize';
import { deleteProviderSecretsBestEffort, sanitizeProviderForDisk, syncProviderSecrets } from './unifiedStorageProviderSecrets';
import {
  MAIN_DATA_BACKUP_FILE,
  MAIN_DATA_FILE,
  MAX_AI_ID_LIST_ENTRIES,
  MAX_AI_PROVIDER_FILE_SCAN_ENTRIES,
  MAX_AI_PROVIDERS,
  type UnifiedSaveRequest
} from './unifiedStorageSaveTypes';
import { mergeSessionsForSafeSave, readExistingAISessionsFile, serializeBoundedAISessionsFile } from './unifiedStorageSessionFiles';
import type { DataFile, UnifiedData } from './unifiedStorageTypes';
import {
  getUnifiedSaveRequestDiagnosticDetails,
  getUnifiedStorageErrorDiagnosticDetails,
  logUnifiedStorageDiagnostic,
} from './unifiedStorageDiagnostics';

async function getBasePath(): Promise<string> {
  return getStorageBasePath();
}

export async function performSplitSave(request: UnifiedSaveRequest) {
  let stage = 'get-storage-adapter';
  let platform = 'unknown';

  try {
    await performSplitSaveInternal(request, (nextStage, nextPlatform) => {
      stage = nextStage;
      if (nextPlatform) platform = nextPlatform;
    });
  } catch (error) {
    logUnifiedStorageDiagnostic('stage-failed', {
      stage,
      platform,
      ...getUnifiedSaveRequestDiagnosticDetails(request),
      ...getUnifiedStorageErrorDiagnosticDetails(error),
    });
    throw error;
  }
}

async function performSplitSaveInternal(
  request: UnifiedSaveRequest,
  setStage: (stage: string, platform?: string) => void,
) {
  const storage = getStorageAdapter();
  setStage('resolve-storage-paths', storage.platform);
  const base = await getBasePath();

  const configDir = await joinPath(base, '.vlaina');
  const appDir = await joinPath(configDir, 'app');
  const chatDir = await joinPath(configDir, 'chat');
  const providersDir = await joinPath(chatDir, 'providers');
  const sessionFilesDir = await joinPath(chatDir, 'sessions');

  const mainPath = await joinPath(appDir, MAIN_DATA_FILE);
  const mainBackupPath = await joinPath(appDir, MAIN_DATA_BACKUP_FILE);
  const sessionsPath = await joinPath(sessionFilesDir, 'index.json');

  const requiredDirectories = request.persistAI
    ? request.persistProviders
      ? [appDir, chatDir, providersDir, sessionFilesDir]
      : [appDir, chatDir, sessionFilesDir]
    : [appDir];

  setStage('ensure-storage-directories');
  for (const directory of requiredDirectories) {
    if (!(await storage.exists(directory))) {
      await storage.mkdir(directory, true);
    }
  }

  setStage('read-main-data');
  const sanitizedData = sanitizeUnifiedData(request.data);
  const existingMainData = await readExistingMainDataFile(storage, mainPath);
  setStage('prepare-main-data');
  const mergedCustomIconData = mergeCustomIconsForSafeSave(sanitizedData, existingMainData);
  const dataForMainFile: UnifiedData = {
    ...sanitizedData,
    settings: mergeSettingsForSafeSave(
      sanitizedData.settings,
      existingMainData?.settings,
      request.patch,
    ),
    ...mergedCustomIconData,
  };
  const { ai, ...mainPart } = dataForMainFile;

  const mainFile: DataFile = {
    version: 2,
    lastModified: Date.now(),
    data: mainPart as UnifiedData
  };
  const mainPayload = serializeBoundedMainDataFile(mainFile);
  setStage('write-main-data');
  await storage.writeFile(mainPath, mainPayload);
  setStage('write-main-backup');
  await storage.writeFile(mainBackupPath, mainPayload);

  if (request.persistAI && ai) {
    setStage('prepare-provider-data');
    const requestedPersistedProviders = normalizeProvidersForSave(ai.providers);
    const incomingDeletedProviderIds = new Set(
      normalizeBoundedIdList(ai.deletedProviderIds, isSafeProviderId, MAX_AI_ID_LIST_ENTRIES)
    );

    setStage('read-ai-sessions');
    const existingSessionsData = await readExistingAISessionsFile(storage, sessionsPath);
    setStage('prepare-ai-data');
    const tombstonedProviderIds = new Set([
      ...(existingSessionsData?.deletedProviderIds || []),
      ...incomingDeletedProviderIds,
    ].filter(isSafeProviderId));
    const persistedProviders = requestedPersistedProviders.filter(
      (provider) => !tombstonedProviderIds.has(provider.id)
    );
    const persistedProviderIds = new Set(persistedProviders.map((provider) => provider.id));
    const deletedProviderSecrets = new Set<string>();
    if (request.persistProviders) {
      setStage('sync-provider-secrets');
      await syncProviderSecrets(persistedProviders);
      setStage('delete-provider-secrets');
      await deleteProviderSecretsBestEffort(incomingDeletedProviderIds, deletedProviderSecrets);
    }

    const incomingPersistedSessions = ai.sessions.filter((session) => !isTemporarySession(session));
    setStage('merge-ai-sessions');
    const mergedSessions = await mergeSessionsForSafeSave(
      incomingPersistedSessions,
      existingSessionsData,
      sessionFilesDir,
    );
    const persistedSessions = mergedSessions.sessions;
    const persistedSessionIds = new Set(persistedSessions.map((session) => session.id));
    const mergedProviderIds = request.persistProviders
      ? Array.from(new Set([
        ...persistedProviders.map((provider) => provider.id),
        ...(existingSessionsData?.providerIds || []),
      ]))
        .filter((providerId) => isSafeProviderId(providerId) && !tombstonedProviderIds.has(providerId))
        .slice(0, MAX_AI_PROVIDERS)
      : (existingSessionsData?.providerIds || [])
        .filter((providerId) => isSafeProviderId(providerId) && !tombstonedProviderIds.has(providerId))
        .slice(0, MAX_AI_PROVIDERS);
    const activeProviderIds = new Set(mergedProviderIds);
    const deletedProviderIds = Array.from(tombstonedProviderIds).filter(
      (providerId) => !activeProviderIds.has(providerId)
    );
    const modelsByProvider = collectProviderModelsForSave(ai.models, persistedProviderIds);
    const activeModelIds = new Set(
      Array.from(modelsByProvider.values()).flat().map((model) => model.id)
    );

    const sessionsData = {
      sessions: persistedSessions,
      selectedModelId: request.persistProviders && ai.selectedModelId && activeModelIds.has(ai.selectedModelId)
        ? ai.selectedModelId
        : request.persistProviders ? null : ai.selectedModelId,
      unreadSessionIds: normalizeBoundedIdList(ai.unreadSessionIds, isSafeChatSessionId, MAX_AI_ID_LIST_ENTRIES)
        .filter((sessionId) => persistedSessionIds.has(sessionId)),
      currentSessionId: ai.currentSessionId && persistedSessionIds.has(ai.currentSessionId)
        ? ai.currentSessionId
        : null,
      temporaryChatEnabled: false,
      customSystemPrompt: ai.customSystemPrompt || '',
      includeTimeContext: ai.includeTimeContext !== false,
      webSearchEnabled: ai.webSearchEnabled === true,
      providerIds: mergedProviderIds,
      deletedSessionIds: mergedSessions.deletedSessionIds,
      deletedProviderIds,
    };
    setStage('write-ai-sessions');
    await storage.writeFile(sessionsPath, serializeBoundedAISessionsFile(sessionsData));

    if (!request.persistProviders) {
      return;
    }

    setStage('write-provider-files');
    for (const provider of persistedProviders) {
      const pModels = modelsByProvider.get(provider.id) || [];
      const pData = {
        provider: sanitizeProviderForDisk(provider),
        models: pModels,
        benchmarkResults: normalizeProviderBenchmarkRecord(ai.benchmarkResults?.[provider.id]),
        fetchedModels: normalizeFetchedModelsForSave(ai.fetchedModels?.[provider.id])
      };
      const pPath = await joinPath(providersDir, `${provider.id}.json`);
      await storage.writeFile(pPath, serializeBoundedAIProviderFile(provider.id, pData));
    }

    setStage('cleanup-provider-files');
    const providerEntries = await storage.listDir(providersDir).catch(() => []);
    for (
      let entryIndex = 0;
      entryIndex < providerEntries.length && entryIndex < MAX_AI_PROVIDER_FILE_SCAN_ENTRIES;
      entryIndex += 1
    ) {
      const entry = providerEntries[entryIndex];
      if (!entry.isFile || !entry.name.endsWith('.json')) {
        continue;
      }
      const providerId = entry.name.slice(0, -5);
      if (activeProviderIds.has(providerId) || !deletedProviderIds.includes(providerId)) {
        continue;
      }
      try {
        await deleteProviderSecretsBestEffort([providerId], deletedProviderSecrets);
        await storage.deleteFile(entry.path);
      } catch (error) {
      }
    }

  }
}
