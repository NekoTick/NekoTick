import { create } from 'zustand';
import {
  loadUnifiedData,
  saveUnifiedData,
  type UnifiedData,
  type UnifiedSavePatch,
  type CustomIcon,
  type TimezoneInfo,
} from '@/lib/storage/unifiedStorage';

import { createSettingsActions } from './actions/settingsActions';
import { resolveMarkdownSettings } from './settings/markdownSettings';
import type { ItemColor } from '@/lib/colors';
import { 
  DEFAULT_SETTINGS,
} from '@/lib/config';
import type { UndoAction } from '../types';
import { isTemporarySession, isTemporarySessionId } from '@/lib/ai/temporaryChat';

export type {
  CustomIcon,
  TimezoneInfo,
};

export type { ItemColor };

interface UnifiedStoreState {
  data: UnifiedData;
  loaded: boolean;
  undoStack: UndoAction[];
}

interface UnifiedStoreActions {
  load: () => Promise<void>;
  reloadFromDisk: () => Promise<void>;

  setTimezone: (offset: number, city: string) => void;
  setMarkdownCodeBlockLineNumbers: (showLineNumbers: boolean) => void;
  setMarkdownBodyLineNumbers: (showLineNumbers: boolean) => void;
  setMarkdownTypewriterMode: (typewriterMode: boolean) => void;
  setMarkdownImportedThemeId: (importedThemeId: string | null) => void;
  setLastAppViewMode: (mode: 'notes' | 'chat', skipPersist?: boolean) => void;
  setLastChatSessionId: (sessionId: string | null, skipPersist?: boolean) => void;
  setColorMode: (mode: NonNullable<UnifiedData['settings']['ui']>['colorMode']) => void;
  setThemeId: (themeId: string) => void;
  setNotesChatFloatingSize: (size: NonNullable<UnifiedData['settings']['ui']>['notesChatFloatingSize']) => void;
  
  addCustomIcon: (icon: CustomIcon) => void;
  removeCustomIcon: (id: string) => Promise<void>;
  syncCustomIcons: () => Promise<void>;

  updateAIData: (updates: Partial<NonNullable<UnifiedData['ai']>>, skipPersist?: boolean) => void;
}

type UnifiedStore = UnifiedStoreState & UnifiedStoreActions;

function persist(data: UnifiedData, patch?: UnifiedSavePatch) {
  saveUnifiedData(data, patch);
}

const AI_PROVIDER_PERSISTENCE_KEYS = new Set<keyof NonNullable<UnifiedData['ai']>>([
  'providers',
  'models',
  'benchmarkResults',
  'fetchedModels',
  'deletedProviderIds',
]);

function getAIDataSavePatch(
  updateKeys: Array<keyof NonNullable<UnifiedData['ai']>>
): UnifiedSavePatch {
  const touchesProviders = updateKeys.some((key) => AI_PROVIDER_PERSISTENCE_KEYS.has(key));
  return {
    ai: {
      sessions: true,
      providers: touchesProviders || undefined,
    },
  };
}

export function retainLoadedSessionMessages(
  previousData: UnifiedData,
  nextData: UnifiedData,
): UnifiedData {
  const previousMessages = previousData.ai?.messages;
  const nextAI = nextData.ai;

  if (!previousMessages || !nextAI) {
    return nextData;
  }

  const persistedSessionIds = new Set(nextAI.sessions.map((session) => session.id));
  const previousTemporarySessions = previousData.ai?.sessions.filter(isTemporarySession) || [];
  const temporarySessionIds = new Set(previousTemporarySessions.map((session) => session.id));
  const retainedMessages = Object.fromEntries(
    Object.entries(previousMessages).filter(([sessionId]) =>
      persistedSessionIds.has(sessionId) ||
      temporarySessionIds.has(sessionId) ||
      isTemporarySessionId(sessionId)
    )
  );

  return {
    ...nextData,
    ai: {
      ...nextAI,
      sessions: [
        ...previousTemporarySessions,
        ...nextAI.sessions.filter((session) => !temporarySessionIds.has(session.id)),
      ],
      messages: retainedMessages,
    },
  };
}

function createDefaultAIData(): NonNullable<UnifiedData['ai']> {
  return {
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
  };
}

function normalizeUnifiedData(data: UnifiedData): UnifiedData {
  const normalized: UnifiedData = { ...data };
  const ai = normalized.ai;
  const settings = normalized.settings;

  normalized.settings = {
    timezone: {
      ...DEFAULT_SETTINGS.timezone,
      ...settings?.timezone,
    },
    markdown: resolveMarkdownSettings(settings?.markdown),
    ui: {
      ...DEFAULT_SETTINGS.ui,
      ...settings?.ui,
      lastAppViewMode: settings?.ui?.lastAppViewMode === 'chat' ? 'chat' : 'notes',
      lastChatSessionId: typeof settings?.ui?.lastChatSessionId === 'string' && !isTemporarySessionId(settings.ui.lastChatSessionId)
        ? settings.ui.lastChatSessionId
        : null,
      colorMode: settings?.ui?.colorMode === 'light' || settings?.ui?.colorMode === 'dark'
        ? settings.ui.colorMode
        : 'system',
      themeId: typeof settings?.ui?.themeId === 'string' && settings.ui.themeId.trim()
        ? settings.ui.themeId
        : DEFAULT_SETTINGS.ui.themeId,
      notesChatFloatingSize: settings?.ui?.notesChatFloatingSize || DEFAULT_SETTINGS.ui.notesChatFloatingSize,
    },
  };
  normalized.customIcons = normalized.customIcons || [];
  normalized.deletedCustomIconIds = normalized.deletedCustomIconIds || [];

  normalized.ai = ai
    ? {
        ...createDefaultAIData(),
        ...ai,
        benchmarkResults: ai.benchmarkResults || {},
        fetchedModels: ai.fetchedModels || {},
        customSystemPrompt: ai.customSystemPrompt || '',
        includeTimeContext: ai.includeTimeContext !== false,
        webSearchEnabled: ai.webSearchEnabled === true,
        unreadSessionIds: Array.isArray(ai.unreadSessionIds) ? ai.unreadSessionIds : [],
        temporaryChatEnabled: false,
      }
    : createDefaultAIData();

  return normalized;
}
const initialState: UnifiedStoreState = {
  data: {
    settings: { ...DEFAULT_SETTINGS },
    customIcons: [],
    deletedCustomIconIds: [],
    ai: createDefaultAIData(),
  },
  loaded: false,
  undoStack: [],
};

export const useUnifiedStore = create<UnifiedStore>((set, get) => {
  const settingsActions = createSettingsActions(set as any, persist);

  return {
    ...initialState,

    load: async () => {
      if (get().loaded) return;
      await get().reloadFromDisk();
    },

    reloadFromDisk: async () => {
      const previousData = get().data;
      const data = retainLoadedSessionMessages(
        previousData,
        normalizeUnifiedData(await loadUnifiedData())
      );
      set({ data, loaded: true });
    },

    addCustomIcon: (icon: CustomIcon) => {
      const state = get();
      const newData = {
        ...state.data,
        customIcons: [...(state.data.customIcons || []), icon],
        deletedCustomIconIds: (state.data.deletedCustomIconIds || []).filter(id => id !== icon.id),
      };
      set({ data: newData });
      persist(newData, { customIcons: true });
    },

    removeCustomIcon: async (id: string) => {
      const state = get();
      const removedIcon = (state.data.customIcons || []).find(i => i.id === id);
      const deletedIconIds = new Set(state.data.deletedCustomIconIds || []);
      deletedIconIds.add(id);
      const newData = {
        ...state.data,
        customIcons: (state.data.customIcons || []).filter(i => i.id !== id),
        deletedCustomIconIds: [...deletedIconIds],
      };
      set({ data: newData });
      persist(newData, { customIcons: true });

      if (removedIcon) {
        const { deleteGlobalIconAsset } = await import('@/lib/storage/assetStorage');
        await deleteGlobalIconAsset(removedIcon.id);
      }
    },

    syncCustomIcons: async () => {
      const { scanGlobalIcons } = await import('@/lib/storage/assetStorage');
      const scanned = await scanGlobalIcons();
      set(state => {
        const currentIcons = state.data.customIcons || [];
        const existingIds = new Set(currentIcons.map(i => i.id));
        const deletedIds = new Set(state.data.deletedCustomIconIds || []);
        
        const newIcons = scanned.filter(i => !existingIds.has(i.id) && !deletedIds.has(i.id));
        
        if (newIcons.length === 0) return {};
        
        const updatedIcons = [...currentIcons, ...newIcons];
        const newData = {
          ...state.data,
          customIcons: updatedIcons
        };
        
        persist(newData, { customIcons: true });
        return { data: newData };
      });
    },

    updateAIData: (updates, skipPersist = false) => {
        const state = get();
        const currentAI = state.data.ai || initialState.data.ai!;
        const updateKeys = Object.keys(updates) as Array<keyof NonNullable<UnifiedData['ai']>>;
        const hasChanges = updateKeys.some((key) => !Object.is(currentAI[key], updates[key]));
        if (!hasChanges) {
            return;
        }

        const newData = {
            ...state.data,
            ai: {
                ...currentAI,
                ...updates
            }
        };
        set({ data: newData });
        if (!skipPersist && updateKeys.length > 0) {
            persist(newData, getAIDataSavePatch(updateKeys));
        }
    },

    ...settingsActions,
  };
});

export { useUnifiedStore as useStore };
