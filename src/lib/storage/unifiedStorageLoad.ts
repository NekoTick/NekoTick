import { getStorageAdapter, joinPath } from '@/lib/storage/adapter';
import type { ChatSession } from '@/lib/ai/types';
import { isTemporarySession } from '@/lib/ai/temporaryChat';
import { getStorageBasePath } from './basePath';
import {
  normalizeLoadedAIModels,
  normalizeLoadedAIProviders,
} from './unifiedStorageAI';
import { createDefaultUnifiedData, type DataFile, type UnifiedData } from './unifiedStorageTypes';
import {
  MAIN_DATA_BACKUP_FILE,
  MAIN_DATA_FILE,
  MAX_AI_PROVIDER_FILE_BYTES,
  MAX_AI_PROVIDER_STORAGE_CONCURRENCY,
  MAX_AI_SESSIONS_BYTES,
  MAX_MAIN_DATA_BYTES,
} from './unifiedStorageSaveTypes';
import { readBoundedTextFile, mapWithConcurrencyLimit } from './unifiedStorageCommon';
import { parseAISessionsFile } from './unifiedStorageSessionFiles';
import { parseAIProviderFile, serializeBoundedAIProviderFile } from './unifiedStorageProviderFiles';
import { sanitizeUnifiedData } from './unifiedStorageMainNormalize';
import { hydrateProvidersWithSecrets } from './unifiedStorageProviderSecrets';

async function getBasePath(): Promise<string> {
  return getStorageBasePath();
}

export async function loadUnifiedData(): Promise<UnifiedData> {
  try {
    const storage = getStorageAdapter();
    const base = await getBasePath();
    const configDir = await joinPath(base, '.vlaina');
    const appDir = await joinPath(configDir, 'app');
    const chatDir = await joinPath(configDir, 'chat');
    const mainPath = await joinPath(appDir, MAIN_DATA_FILE);
    const mainBackupPath = await joinPath(appDir, MAIN_DATA_BACKUP_FILE);
    const sessionFilesDir = await joinPath(chatDir, 'sessions');
    const sessionsPath = await joinPath(sessionFilesDir, 'index.json');
    const providersDir = await joinPath(chatDir, 'providers');
    const loadedProviderDataById = new Map<string, NonNullable<ReturnType<typeof parseAIProviderFile>>>();

    let combinedData = createDefaultUnifiedData();

    const loadMainDataFromPath = async (path: string): Promise<UnifiedData | null> => {
      if (!(await storage.exists(path))) {
        return null;
      }

      try {
        const content = await readBoundedTextFile(storage, path, MAX_MAIN_DATA_BYTES);
        if (content === null) {
          return null;
        }
        const parsed = JSON.parse(content) as DataFile;
        if (parsed.version === 2 && parsed.data) {
          return parsed.data;
        }
        return null;
      } catch (error) {
        return null;
      }
    };

    const loadedMainData = await loadMainDataFromPath(mainPath);
    if (loadedMainData) {
      combinedData = sanitizeUnifiedData({ ...combinedData, ...loadedMainData });
    } else {
      const loadedBackupData = await loadMainDataFromPath(mainBackupPath);
      if (loadedBackupData) {
        combinedData = sanitizeUnifiedData({ ...combinedData, ...loadedBackupData });
      }
    }

    combinedData.ai = {
        providers: [],
        models: [],
        benchmarkResults: {},
        fetchedModels: {},
        sessions: [],
        unreadSessionIds: [],
        selectedModelId: null,
        currentSessionId: null,
        temporaryChatEnabled: false,
        customSystemPrompt: '',
        includeTimeContext: true,
        webSearchEnabled: false,
        computerUseEnabled: false,
        deletedProviderIds: [],
        deletedSessionIds: [],
        messages: {}
    };

    let providerIds: string[] = [];
    if (await storage.exists(sessionsPath)) {
        try {
            const content = await readBoundedTextFile(storage, sessionsPath, MAX_AI_SESSIONS_BYTES);
            if (content === null) {
              throw new Error('AI sessions file size is unavailable or too large');
            }
            const parsedSessionsData: unknown = JSON.parse(content);
            const sessionsData = parseAISessionsFile(parsedSessionsData);
            if (!sessionsData) {
              console.warn('[Storage] Ignoring invalid AI sessions file:', sessionsPath);
            } else {
              const loadedSessions = Array.isArray(sessionsData.sessions) ? sessionsData.sessions : [];
              const aiData = combinedData.ai;
              aiData.sessions = loadedSessions.filter((session: ChatSession) => !isTemporarySession(session));
              aiData.selectedModelId = sessionsData.selectedModelId;
              const currentSessionId = sessionsData.currentSessionId;
              const hasCurrentSession = currentSessionId
                ? aiData.sessions.some((session) => session.id === currentSessionId)
                : false;
              const unreadSessionIds = sessionsData.unreadSessionIds;
              aiData.currentSessionId = hasCurrentSession ? currentSessionId : null;
              aiData.unreadSessionIds = unreadSessionIds.filter((sessionId: string) =>
                aiData.sessions.some((session) => session.id === sessionId)
              );
              aiData.temporaryChatEnabled = false;
              aiData.customSystemPrompt = sessionsData.customSystemPrompt;
              aiData.includeTimeContext = sessionsData.includeTimeContext;
              aiData.webSearchEnabled = sessionsData.webSearchEnabled;
              aiData.computerUseEnabled = sessionsData.computerUseEnabled;
              aiData.deletedSessionIds = sessionsData.deletedSessionIds;
              aiData.deletedProviderIds = sessionsData.deletedProviderIds;
              providerIds = sessionsData.providerIds;
            }
        } catch {
            console.warn('[Storage] Ignoring invalid AI sessions file:', sessionsPath);
        }
    }

    if (providerIds.length > 0) {
        const loadedProviders = await mapWithConcurrencyLimit(
          providerIds,
          MAX_AI_PROVIDER_STORAGE_CONCURRENCY,
          async (id) => {
            const pPath = await joinPath(providersDir, `${id}.json`);
            if (await storage.exists(pPath)) {
                try {
                    const content = await readBoundedTextFile(storage, pPath, MAX_AI_PROVIDER_FILE_BYTES);
                    if (content === null) {
                      return null;
                    }
                    const parsedProviderData: unknown = JSON.parse(content);
                    return parseAIProviderFile(id, parsedProviderData);
                } catch (error) {
                    return null;
                }
            }
            return null;
          },
        );

        loadedProviders.forEach((p, index) => {
            const providerId = providerIds[index];
            if (p) {
                loadedProviderDataById.set(providerId, p);
                combinedData.ai!.providers.push(p.provider);
                if (Array.isArray(p.models)) {
                    combinedData.ai!.models.push(...p.models);
                }
                if (p.benchmarkResults) {
                    combinedData.ai!.benchmarkResults![providerId] = p.benchmarkResults;
                }
                if (p.fetchedModels.length > 0) {
                    combinedData.ai!.fetchedModels![providerId] = p.fetchedModels;
                }
            }
        });
    }

    combinedData.ai.providers = normalizeLoadedAIProviders(combinedData.ai.providers);
    combinedData.ai.providers = await hydrateProvidersWithSecrets(
      combinedData.ai.providers,
      async (providerId) => {
        const providerData = loadedProviderDataById.get(providerId);
        if (!providerData) {
          return;
        }
        const providerPath = await joinPath(providersDir, `${providerId}.json`);
        await storage.writeFile(providerPath, serializeBoundedAIProviderFile(providerId, {
          ...providerData,
          provider: { ...providerData.provider, apiKey: '' },
        }));
      },
    );

    const normalizedAI = normalizeLoadedAIModels(
      combinedData.ai.providers,
      combinedData.ai.models,
      combinedData.ai.selectedModelId,
      combinedData.ai.sessions
    );
    combinedData.ai.models = normalizedAI.models;
    combinedData.ai.selectedModelId = normalizedAI.selectedModelId;
    combinedData.ai.sessions = normalizedAI.sessions;

    return sanitizeUnifiedData(combinedData);
  } catch (error) {
    return createDefaultUnifiedData();
  }
}
