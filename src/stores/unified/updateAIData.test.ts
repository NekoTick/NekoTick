import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedData } from '@/lib/storage/unifiedStorage';

const mocks = vi.hoisted(() => ({
  loadUnifiedData: vi.fn(),
  saveUnifiedData: vi.fn(),
  deleteGlobalIconAsset: vi.fn(),
  scanGlobalIcons: vi.fn(),
}));

vi.mock('@/lib/storage/unifiedStorage', () => ({
  loadUnifiedData: mocks.loadUnifiedData,
  saveUnifiedData: mocks.saveUnifiedData,
}));

vi.mock('@/lib/storage/assetStorage', () => ({
  deleteGlobalIconAsset: mocks.deleteGlobalIconAsset,
  scanGlobalIcons: mocks.scanGlobalIcons,
}));

import { useUnifiedStore } from './useUnifiedStore';

function createData(): UnifiedData {
  return {
    settings: {
      timezone: { offset: 8, city: 'Beijing' },
      markdown: {
        typewriterMode: false,
        theme: {
          importedThemeId: null,
        },
        body: { showLineNumbers: false },
        codeBlock: { showLineNumbers: true },
      },
      ui: {
        lastAppViewMode: 'notes',
        colorMode: 'system',
        themeId: 'default',
        notesChatFloatingSize: { width: 420, height: 640 },
      },
    },
    customIcons: [],
    deletedCustomIconIds: [],
    ai: {
      providers: [],
      models: [],
      benchmarkResults: {},
      fetchedModels: {},
      sessions: [],
      messages: {},
      unreadSessionIds: [],
      selectedModelId: null,
      currentSessionId: null,
      temporaryChatEnabled: false,
      customSystemPrompt: '',
      includeTimeContext: true,
      webSearchEnabled: false,
    },
  };
}

describe('updateAIData', () => {
  beforeEach(() => {
    useUnifiedStore.setState({
      data: createData(),
      loaded: true,
      undoStack: [],
    });
    mocks.loadUnifiedData.mockResolvedValue(createData());
    mocks.saveUnifiedData.mockReset();
    mocks.deleteGlobalIconAsset.mockReset();
    mocks.scanGlobalIcons.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not persist unchanged AI fields', () => {
    useUnifiedStore.getState().updateAIData({
      selectedModelId: null,
      customSystemPrompt: '',
      includeTimeContext: true,
      webSearchEnabled: false,
    });

    expect(mocks.saveUnifiedData).not.toHaveBeenCalled();
  });

  it('persists session-scoped AI fields without provider persistence', () => {
    useUnifiedStore.getState().updateAIData({
      selectedModelId: 'provider:model',
    });

    expect(useUnifiedStore.getState().data.ai?.selectedModelId).toBe('provider:model');
    expect(mocks.saveUnifiedData).toHaveBeenCalledTimes(1);
    expect(mocks.saveUnifiedData).toHaveBeenCalledWith(expect.objectContaining({
      ai: expect.objectContaining({
        selectedModelId: 'provider:model',
      }),
    }), { ai: { sessions: true, providers: undefined } });
  });

  it('persists provider-scoped AI fields with provider persistence', () => {
    useUnifiedStore.getState().updateAIData({
      providers: [{
        id: 'provider-1',
        name: 'Provider',
        type: 'newapi',
        apiHost: 'https://example.com',
        apiKey: 'sk-test',
        enabled: true,
        createdAt: 1,
        updatedAt: 1,
      }],
    });

    expect(mocks.saveUnifiedData).toHaveBeenCalledTimes(1);
    expect(mocks.saveUnifiedData).toHaveBeenCalledWith(expect.objectContaining({
      ai: expect.objectContaining({
        providers: [expect.objectContaining({ id: 'provider-1' })],
      }),
    }), { ai: { sessions: true, providers: true } });
  });

  it('updates state without persisting when requested', () => {
    useUnifiedStore.getState().updateAIData({
      webSearchEnabled: true,
    }, true);

    expect(useUnifiedStore.getState().data.ai?.webSearchEnabled).toBe(true);
    expect(mocks.saveUnifiedData).not.toHaveBeenCalled();
  });

  it('persists custom icons with an app-only patch', () => {
    useUnifiedStore.getState().addCustomIcon({
      id: 'icon-1',
      name: 'Icon',
      url: 'vlaina://asset/global-icons/icon-1.png',
      createdAt: 1,
    });

    expect(useUnifiedStore.getState().data.customIcons).toHaveLength(1);
    expect(mocks.saveUnifiedData).toHaveBeenCalledTimes(1);
    expect(mocks.saveUnifiedData).toHaveBeenCalledWith(expect.objectContaining({
      customIcons: [expect.objectContaining({ id: 'icon-1' })],
    }), { customIcons: true });
  });
});
