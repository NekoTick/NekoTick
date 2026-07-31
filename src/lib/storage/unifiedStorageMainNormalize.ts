import { isSafeImportedMarkdownThemeId } from '@/lib/markdown/theme-compatibility/types';
import { isTemporarySessionId } from '@/lib/ai/temporaryChat';
import { isSafeChatSessionId } from './unifiedStorageAI';
import {
  createDefaultUnifiedData,
  type CustomIcon,
  type UnifiedData,
} from './unifiedStorageTypes';
import {
  MAX_CUSTOM_ICON_ID_CHARS,
  MAX_CUSTOM_ICON_NAME_CHARS,
  MAX_CUSTOM_ICON_RECORDS,
  MAX_CUSTOM_ICON_URL_CHARS,
  MAX_CUSTOM_ICONS,
  MAX_DELETED_CUSTOM_ICON_ID_RECORDS,
  MAX_DELETED_CUSTOM_ICON_IDS,
  MAX_SETTINGS_TIMEZONE_CITY_CHARS,
  MAX_SETTINGS_UI_THEME_ID_CHARS,
  SETTINGS_NOTES_CHAT_FLOATING_MAX_HEIGHT,
  SETTINGS_NOTES_CHAT_FLOATING_MAX_WIDTH,
  SETTINGS_NOTES_CHAT_FLOATING_MIN_HEIGHT,
  SETTINGS_NOTES_CHAT_FLOATING_MIN_WIDTH,
} from './unifiedStorageSaveTypes';
import { isRecord } from './unifiedStorageCommon';

export function normalizeSettingsNotesChatFloatingSize(
  value: unknown,
  fallback: NonNullable<UnifiedData['settings']['ui']>['notesChatFloatingSize'],
): NonNullable<UnifiedData['settings']['ui']>['notesChatFloatingSize'] {
  if (!isRecord(value)) {
    return fallback;
  }

  const { width, height } = value;
  if (typeof width !== 'number' || typeof height !== 'number') {
    return fallback;
  }
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return fallback;
  }

  return {
    width: Math.max(
      SETTINGS_NOTES_CHAT_FLOATING_MIN_WIDTH,
      Math.min(SETTINGS_NOTES_CHAT_FLOATING_MAX_WIDTH, Math.round(width))
    ),
    height: Math.max(
      SETTINGS_NOTES_CHAT_FLOATING_MIN_HEIGHT,
      Math.min(SETTINGS_NOTES_CHAT_FLOATING_MAX_HEIGHT, Math.round(height))
    ),
  };
}

export function sanitizeUnifiedData(data: UnifiedData): UnifiedData {
  const defaults = createDefaultUnifiedData();
  const settings = data.settings;
  const timezoneOffset = settings?.timezone?.offset;
  const timezoneCity = settings?.timezone?.city;
  const typewriterMode = settings?.markdown?.typewriterMode;
  const markdownTheme = settings?.markdown?.theme;
  const showBodyLineNumbers = settings?.markdown?.body?.showLineNumbers;
  const showLineNumbers = settings?.markdown?.codeBlock?.showLineNumbers;
  const lastAppViewMode = settings?.ui?.lastAppViewMode;
  const lastChatSessionId = settings?.ui?.lastChatSessionId;
  const colorMode = settings?.ui?.colorMode;
  const themeId = settings?.ui?.themeId;
  const notesChatFloatingSize = settings?.ui?.notesChatFloatingSize;

  return {
    settings: {
      timezone: {
        offset: Number.isFinite(timezoneOffset) ? timezoneOffset : defaults.settings.timezone.offset,
        city: typeof timezoneCity === 'string' && timezoneCity.trim().length > 0
          ? timezoneCity.slice(0, MAX_SETTINGS_TIMEZONE_CITY_CHARS)
          : defaults.settings.timezone.city,
      },
      markdown: {
        typewriterMode: typewriterMode === true,
        theme: {
          importedThemeId: typeof markdownTheme?.importedThemeId === 'string'
            && markdownTheme.importedThemeId.trim()
            && isSafeImportedMarkdownThemeId(markdownTheme.importedThemeId.trim())
            ? markdownTheme.importedThemeId.trim()
            : null,
        },
        body: {
          showLineNumbers: showBodyLineNumbers === true,
        },
        codeBlock: {
          showLineNumbers: showLineNumbers === true,
        },
      },
      ui: {
        lastAppViewMode: lastAppViewMode === 'chat' ? 'chat' : 'notes',
        ...(isSafeChatSessionId(lastChatSessionId) && !isTemporarySessionId(lastChatSessionId)
          ? { lastChatSessionId }
          : {}),
        colorMode: colorMode === 'light' || colorMode === 'dark' ? colorMode : 'system',
        themeId: typeof themeId === 'string' && themeId.trim().length > 0
          ? themeId.slice(0, MAX_SETTINGS_UI_THEME_ID_CHARS)
          : defaults.settings.ui?.themeId ?? 'default',
        notesChatFloatingSize: normalizeSettingsNotesChatFloatingSize(
          notesChatFloatingSize,
          defaults.settings.ui?.notesChatFloatingSize
        ),
      },
    },
    customIcons: normalizeCustomIconList(data.customIcons),
    deletedCustomIconIds: normalizeDeletedCustomIconIds(data.deletedCustomIconIds),
    ai: data.ai,
  };
}

export function normalizeBoundedCustomIconString(value: unknown, maxChars: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= maxChars ? value : null;
}

export function normalizeCustomIcon(value: unknown): CustomIcon | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeBoundedCustomIconString(value.id, MAX_CUSTOM_ICON_ID_CHARS);
  const url = normalizeBoundedCustomIconString(value.url, MAX_CUSTOM_ICON_URL_CHARS);
  const name = normalizeBoundedCustomIconString(value.name, MAX_CUSTOM_ICON_NAME_CHARS);
  const { createdAt } = value;
  if (!id || !url || !name || typeof createdAt !== 'number' || !Number.isFinite(createdAt)) {
    return null;
  }

  return { id, url, name, createdAt };
}

export function normalizeCustomIconList(value: unknown): CustomIcon[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const icons: CustomIcon[] = [];
  const seenIds = new Set<string>();
  const scanLimit = Math.min(value.length, MAX_CUSTOM_ICON_RECORDS);
  for (let index = 0; index < scanLimit && icons.length < MAX_CUSTOM_ICONS; index += 1) {
    const icon = normalizeCustomIcon(value[index]);
    if (!icon || seenIds.has(icon.id)) {
      continue;
    }
    seenIds.add(icon.id);
    icons.push(icon);
  }
  return icons;
}

export function normalizeDeletedCustomIconIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const ids: string[] = [];
  const seenIds = new Set<string>();
  const scanLimit = Math.min(value.length, MAX_DELETED_CUSTOM_ICON_ID_RECORDS);
  for (let index = 0; index < scanLimit && ids.length < MAX_DELETED_CUSTOM_ICON_IDS; index += 1) {
    const id = normalizeBoundedCustomIconString(value[index], MAX_CUSTOM_ICON_ID_CHARS);
    if (!id || seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);
    ids.push(id);
  }
  return ids;
}
