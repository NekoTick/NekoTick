import type { UnifiedData } from '@/lib/storage/unifiedStorage';
import type { UnifiedSavePatch } from '@/lib/storage/unifiedStorage';
import { createMarkdownSettingsActions } from './markdownSettingsActions';
import { DEFAULT_SETTINGS } from '@/lib/config';
import {
  MAX_SETTINGS_TIMEZONE_CITY_CHARS,
  MAX_SETTINGS_UI_THEME_ID_CHARS,
} from '@/lib/storage/unifiedStorage';
import { normalizeSettingsNotesChatFloatingSize } from '@/lib/storage/unifiedStorageMainNormalize';

type SetState = (fn: (state: { 
  data: UnifiedData; 
}) => Partial<{ 
  data: UnifiedData; 
}>) => void;

type Persist = (data: UnifiedData, patch?: UnifiedSavePatch) => void;

export function createSettingsActions(set: SetState, persist: Persist) {
  return {
    setTimezone: (offset: number, city: string) => {
      set((state) => {
        const trimmedCity = city.trim();
        const timezone = {
          offset: Number.isFinite(offset)
            ? Math.max(-12, Math.min(14, offset))
            : DEFAULT_SETTINGS.timezone.offset,
          city: (trimmedCity || DEFAULT_SETTINGS.timezone.city)
            .slice(0, MAX_SETTINGS_TIMEZONE_CITY_CHARS),
        };
        if (
          state.data.settings.timezone?.offset === timezone.offset &&
          state.data.settings.timezone?.city === timezone.city
        ) {
          return {};
        }

        const newData = {
          ...state.data,
          settings: {
            ...state.data.settings,
            timezone,
          },
        };
        persist(newData, {
          settings: {
            timezone: newData.settings.timezone,
          },
        });
        return { data: newData };
      });
    },

    setLastAppViewMode: (mode: 'notes' | 'chat', skipPersist = false) => {
      set((state) => {
        if (state.data.settings.ui?.lastAppViewMode === mode) {
          return {};
        }

        const newData = {
          ...state.data,
          settings: {
            ...state.data.settings,
            ui: {
              ...state.data.settings.ui,
              lastAppViewMode: mode,
            },
          },
        };
        if (!skipPersist) {
          persist(newData, {
            settings: {
              ui: {
                lastAppViewMode: mode,
              },
            },
          });
        }
        return { data: newData };
      });
    },

    setLastChatSessionId: (sessionId: string | null, skipPersist = false) => {
      const normalizedSessionId = typeof sessionId === 'string' && sessionId.trim()
        ? sessionId.trim()
        : null;

      set((state) => {
        if ((state.data.settings.ui?.lastChatSessionId ?? null) === normalizedSessionId) {
          return {};
        }

        const newData = {
          ...state.data,
          settings: {
            ...state.data.settings,
            ui: {
              ...state.data.settings.ui,
              lastChatSessionId: normalizedSessionId,
            },
          },
        };
        if (!skipPersist) {
          persist(newData, {
            settings: {
              ui: {
                lastChatSessionId: normalizedSessionId,
              },
            },
          });
        }
        return { data: newData };
      });
    },

    setColorMode: (mode: NonNullable<UnifiedData['settings']['ui']>['colorMode']) => {
      const colorMode: NonNullable<UnifiedData['settings']['ui']>['colorMode'] =
        mode === 'light' || mode === 'dark' ? mode : 'system';
      set((state) => {
        if (state.data.settings.ui?.colorMode === colorMode) {
          return {};
        }

        const newData = {
          ...state.data,
          settings: {
            ...state.data.settings,
            ui: {
              ...state.data.settings.ui,
              colorMode,
            },
          },
        };
        persist(newData, {
          settings: {
            ui: {
              colorMode,
            },
          },
        });
        return { data: newData };
      });
    },

    setThemeId: (themeId: string) => {
      const normalizedThemeId = themeId.trim().slice(0, MAX_SETTINGS_UI_THEME_ID_CHARS) || 'default';
      set((state) => {
        if (state.data.settings.ui?.themeId === normalizedThemeId) {
          return {};
        }

        const newData = {
          ...state.data,
          settings: {
            ...state.data.settings,
            ui: {
              ...state.data.settings.ui,
              themeId: normalizedThemeId,
            },
          },
        };
        persist(newData, {
          settings: {
            ui: {
              themeId: normalizedThemeId,
            },
          },
        });
        return { data: newData };
      });
    },

    setNotesChatFloatingSize: (size: NonNullable<UnifiedData['settings']['ui']>['notesChatFloatingSize']) => {
      if (!size) {
        return;
      }

      const normalizedSize = normalizeSettingsNotesChatFloatingSize(
        size,
        { ...DEFAULT_SETTINGS.ui.notesChatFloatingSize },
      ) ?? { ...DEFAULT_SETTINGS.ui.notesChatFloatingSize };

      set((state) => {
        const current = state.data.settings.ui?.notesChatFloatingSize;
        if (current?.width === normalizedSize.width && current?.height === normalizedSize.height) {
          return {};
        }

        const newData = {
          ...state.data,
          settings: {
            ...state.data.settings,
            ui: {
              ...state.data.settings.ui,
              notesChatFloatingSize: normalizedSize,
            },
          },
        };
        persist(newData, {
          settings: {
            ui: {
              notesChatFloatingSize: normalizedSize,
            },
          },
        });
        return { data: newData };
      });
    },

    ...createMarkdownSettingsActions(set, persist),
  };
}
