import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  storage: {
    getBasePath: vi.fn(async () => '/appdata'),
    exists: vi.fn(async () => true),
    mkdir: vi.fn(async () => undefined),
    readFile: vi.fn(),
    stat: vi.fn(async () => ({ isFile: true, isDirectory: false, size: 1024 })),
    writeFile: vi.fn(async () => undefined),
    listDir: vi.fn(async () => []),
    deleteFile: vi.fn(async () => undefined),
  },
  joinPath: vi.fn(async (...parts: string[]) => parts.join('/')),
}));

vi.mock('@/lib/storage/adapter', () => ({
  getStorageAdapter: () => mocks.storage,
  joinPath: mocks.joinPath,
}));

import { loadUnifiedData } from './unifiedStorageLoad';
import { registerNativeProviderSecretStore } from './unifiedStorageProviderSecrets';

const mainFile = JSON.stringify({
  version: 2,
  lastModified: 1,
  data: {
    settings: {
      timezone: { offset: 480, city: 'Beijing' },
      markdown: { typewriterMode: false, codeBlock: { showLineNumbers: true } },
    },
    customIcons: [],
  },
});

const sessionsFile = JSON.stringify({
  version: 1,
  updatedAt: 1,
  data: {
    sessions: [],
    selectedModelId: null,
    unreadSessionIds: [],
    currentSessionId: null,
    temporaryChatEnabled: false,
    customSystemPrompt: '',
    includeTimeContext: true,
    webSearchEnabled: false,
    providerIds: ['provider-1'],
    deletedSessionIds: [],
    deletedProviderIds: [],
  },
});

const providerFile = JSON.stringify({
  version: 1,
  providerId: 'provider-1',
  updatedAt: 1,
  data: {
    provider: {
      id: 'provider-1',
      name: 'Provider',
      type: 'newapi',
      apiHost: 'https://api.example.test',
      apiKey: 'sk-legacy',
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    },
    models: [],
    benchmarkResults: {},
    fetchedModels: [],
  },
});

beforeEach(() => {
  vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
  mocks.storage.writeFile.mockClear();
  mocks.storage.readFile.mockImplementation(async (path: string) => {
    if (path.endsWith('/app/settings.json')) return mainFile;
    if (path.endsWith('/chat/sessions/index.json')) return sessionsFile;
    if (path.endsWith('/chat/providers/provider-1.json')) return providerFile;
    throw new Error(`Unexpected read: ${path}`);
  });
});

afterEach(() => {
  registerNativeProviderSecretStore(null);
  vi.unstubAllGlobals();
});

describe('unified storage mobile secret migration', () => {
  it('moves legacy plaintext API keys into secure storage and clears the provider file', async () => {
    const set = vi.fn(async () => undefined);
    registerNativeProviderSecretStore({
      get: vi.fn(async () => null),
      set,
      delete: vi.fn(async () => undefined),
    });

    const data = await loadUnifiedData();

    expect(set).toHaveBeenCalledWith('provider-1', 'sk-legacy');
    expect(data.ai?.providers[0]?.apiKey).toBe('sk-legacy');
    const migrationWrite = mocks.storage.writeFile.mock.calls.find(([path]) => (
      String(path).endsWith('/chat/providers/provider-1.json')
    ));
    expect(migrationWrite).toBeTruthy();
    expect(JSON.parse(String(migrationWrite?.[1])).data.provider.apiKey).toBe('');
    expect(String(migrationWrite?.[1])).not.toContain('sk-legacy');
  });
});
