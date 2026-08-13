import type { AIModel, ChatSession, Provider, ProviderBenchmarkRecord } from '@/lib/ai/types';
import type { UnifiedData } from './unifiedStorageTypes';

export interface UnifiedSavePatch {
  customIcons?: true;
  ai?: {
    sessions?: true;
    providers?: true;
  };
  settings?: {
    timezone?: UnifiedData['settings']['timezone'];
    markdown?: Omit<Partial<UnifiedData['settings']['markdown']>, 'body' | 'codeBlock'> & {
      codeBlock?: Partial<UnifiedData['settings']['markdown']['codeBlock']>;
      body?: Partial<NonNullable<UnifiedData['settings']['markdown']['body']>>;
      theme?: Partial<NonNullable<UnifiedData['settings']['markdown']['theme']>>;
    };
    ui?: Partial<NonNullable<UnifiedData['settings']['ui']>>;
  };
}

export interface UnifiedSaveRequest {
  data: UnifiedData;
  patch?: UnifiedSavePatch;
  persistAI: boolean;
  persistProviders: boolean;
}

export const MAIN_DATA_FILE = 'settings.json';
export const MAIN_DATA_BACKUP_FILE = 'settings.backup.json';
export const AI_SESSIONS_FILE_VERSION = 1;
export const AI_PROVIDER_FILE_VERSION = 1;
export const MAX_MAIN_DATA_BYTES = 2 * 1024 * 1024;
export const MAX_AI_SESSIONS_BYTES = 2 * 1024 * 1024;
export const MAX_AI_PROVIDER_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_AI_SESSION_RECORDS = 5000;
export const MAX_AI_ID_LIST_ENTRIES = 5000;
export const MAX_AI_PROVIDERS = 200;
export const MAX_AI_PROVIDER_MODELS = 2000;
export const MAX_AI_PROVIDER_FETCHED_MODELS = 2000;
export const MAX_AI_PROVIDER_BENCHMARK_ITEMS = 2000;
export const MAX_AI_PROVIDER_BENCHMARK_SCAN_ITEMS = 10_000;
export const MAX_BOUNDED_ID_LIST_SCAN_RECORDS = 10_000;
export const MAX_AI_SESSION_METADATA_SCAN_RECORDS = 10_000;
export const MAX_SETTINGS_TIMEZONE_CITY_CHARS = 512;
export const MAX_SETTINGS_UI_THEME_ID_CHARS = 512;
export const SETTINGS_NOTES_CHAT_FLOATING_MIN_WIDTH = 320;
export const SETTINGS_NOTES_CHAT_FLOATING_MIN_HEIGHT = 420;
export const SETTINGS_NOTES_CHAT_FLOATING_MAX_WIDTH = 760;
export const SETTINGS_NOTES_CHAT_FLOATING_MAX_HEIGHT = 920;
export const MAX_AI_SESSION_TITLE_CHARS = 4096;
export const MAX_AI_SESSION_MODEL_ID_CHARS = 4096;
export const MAX_AI_CUSTOM_SYSTEM_PROMPT_CHARS = 64 * 1024;
export const MAX_AI_PROVIDER_SAVE_SCAN_RECORDS = 10_000;
export const MAX_AI_MODEL_SAVE_SCAN_RECORDS = 20_000;
export const MAX_AI_FETCHED_MODEL_SAVE_SCAN_RECORDS = 10_000;
export const MAX_AI_MODEL_FIELD_CHARS = 4096;
export const MAX_AI_BENCHMARK_ERROR_CHARS = 4096;
export const MAX_AI_PROVIDER_FILE_SCAN_ENTRIES = 10_000;
export const MAX_AI_PROVIDER_STORAGE_CONCURRENCY = 10;
export const MAX_CUSTOM_ICONS = 2000;
export const MAX_CUSTOM_ICON_ID_CHARS = 4096;
export const MAX_CUSTOM_ICON_URL_CHARS = 4096;
export const MAX_CUSTOM_ICON_NAME_CHARS = 512;
export const MAX_DELETED_CUSTOM_ICON_IDS = 5000;
export const MAX_CUSTOM_ICON_RECORDS = 5000;
export const MAX_DELETED_CUSTOM_ICON_ID_RECORDS = 10_000;

export interface AISessionsFileData {
  sessions: ChatSession[];
  selectedModelId: string | null;
  unreadSessionIds: string[];
  currentSessionId: string | null;
  temporaryChatEnabled: boolean;
  customSystemPrompt: string;
  includeTimeContext: boolean;
  webSearchEnabled: boolean;
  providerIds: string[];
  deletedSessionIds: string[];
  deletedProviderIds: string[];
}

export interface AISessionsFile {
  version: typeof AI_SESSIONS_FILE_VERSION;
  updatedAt: number;
  data: AISessionsFileData;
}

export interface AIProviderFileData {
  provider: Provider;
  models: AIModel[];
  benchmarkResults?: ProviderBenchmarkRecord;
  fetchedModels: string[];
}

export interface AIProviderFile {
  version: typeof AI_PROVIDER_FILE_VERSION;
  providerId: string;
  updatedAt: number;
  data: AIProviderFileData;
}
