import {
  STORAGE_KEY_FONT_SIZE,
  STORAGE_KEY_NOTES_SIDEBAR_COLLAPSED,
} from '@/lib/config';
import {
  clampSidebarWidth,
  getDefaultSidebarWidth,
} from '@/lib/layout/sidebarWidth';
import { readWindowLaunchContext } from '@/lib/desktop/launchContext';
import { emitStorageAutoSyncEvent } from '@/lib/storage/storageAutoSync';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import {
  SYSTEM_LANGUAGE_PREFERENCE,
  normalizeAppLanguagePreference,
  type AppLanguagePreference,
} from '@/lib/i18n/languages';
import type { DesktopPlatformPreview } from '@/lib/desktop/platform';
import {
  NOTES_CHAT_FLOATING_DEFAULT_SIZE,
  NOTES_CHAT_FLOATING_MAX_SIZE,
  NOTES_CHAT_FLOATING_MIN_SIZE,
  UI_FONT_SIZE_DEFAULT,
  UI_FONT_SIZE_MAX,
  UI_FONT_SIZE_MIN,
  type AppViewMode,
  type ImageFilenameFormat,
  type ImageStorageMode,
  type NotesChatFloatingSize,
  type UIPreferenceState,
} from './uiSliceTypes';

export const STORAGE_KEY_SIDEBAR_WIDTH = 'vlaina_sidebar_width';
export const STORAGE_KEY_IMAGE_STORAGE_MODE = 'vlaina_image_storage_mode';
export const STORAGE_KEY_IMAGE_SUBFOLDER_NAME = 'vlaina_image_subfolder_name';
export const STORAGE_KEY_IMAGE_NOTES_ROOT_SUBFOLDER_NAME = 'vlaina_image_notesRoot_subfolder_name';
export const STORAGE_KEY_IMAGE_FILENAME_FORMAT = 'vlaina_image_filename_format';
export const STORAGE_KEY_LANGUAGE_PREFERENCE = 'vlaina-language-preference';
export const STORAGE_KEY_LAST_APP_VIEW_MODE = 'vlaina_last_app_view_mode';
export const STORAGE_KEY_NOTES_CHAT_PANEL_COLLAPSED = 'vlaina_notes_chat_panel_collapsed';
export const STORAGE_KEY_NOTES_CHAT_FLOATING_SIZE = 'vlaina_notes_chat_floating_size';

const MAX_UI_SCALAR_STORAGE_CHARS = 256;
export const MAX_IMAGE_SUBFOLDER_NAME_CHARS = 128;
const CONTROL_OR_BIDI_PATTERN = /[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/;
const UI_DECIMAL_STORAGE_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;

function loadScalarString(key: string): string | null {
  const saved = localStorage.getItem(key);
  if (saved !== null && saved.length > MAX_UI_SCALAR_STORAGE_CHARS) {
    return null;
  }
  return saved;
}

export function loadBoolean(key: string, defaultValue: boolean): boolean {
  try {
    const saved = loadScalarString(key);
    if (saved === 'true') return true;
    if (saved === 'false') return false;
  } catch {
  }
  return defaultValue;
}

export function saveString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
  }
}

function removeStorageItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
  }
}

function emitUIPreferencesSync(): void {
  emitStorageAutoSyncEvent({ kind: 'ui-preferences' });
}

export function savePreferenceString(key: string, value: string): void {
  saveString(key, value);
  emitUIPreferencesSync();
}

export function removePreferenceString(key: string): void {
  removeStorageItem(key);
  emitUIPreferencesSync();
}

function loadNumber(key: string, defaultValue: number): number {
  try {
    const saved = loadScalarString(key);
    if (saved !== null) {
      const trimmed = saved.trim();
      const parsed = UI_DECIMAL_STORAGE_PATTERN.test(trimmed) ? Number(trimmed) : Number.NaN;
      return Number.isFinite(parsed) ? parsed : defaultValue;
    }
  } catch {
  }
  return defaultValue;
}

function loadFontSize(): number {
  const value = loadNumber(STORAGE_KEY_FONT_SIZE, UI_FONT_SIZE_DEFAULT);
  if (!Number.isFinite(value)) {
    return UI_FONT_SIZE_DEFAULT;
  }
  return normalizeFontSize(value);
}

export function normalizeFontSize(fontSize: number): number {
  if (!Number.isFinite(fontSize)) {
    return UI_FONT_SIZE_DEFAULT;
  }
  return Math.max(UI_FONT_SIZE_MIN, Math.min(UI_FONT_SIZE_MAX, Math.round(fontSize)));
}

export function getStoredPreferenceString(key: string): string | null {
  try {
    return loadScalarString(key);
  } catch {
    return null;
  }
}

function loadImageStorageMode(): ImageStorageMode {
  try {
    const saved = loadScalarString(STORAGE_KEY_IMAGE_STORAGE_MODE);
    if (saved === 'notesRoot' || saved === 'notesRootSubfolder' || saved === 'currentFolder' || saved === 'subfolder') {
      return saved;
    }
  } catch {
  }
  return 'subfolder';
}

export function sanitizeImageSubfolderPreference(name: string | null | undefined): string | null {
  const sanitized = (name || '').replace(/[<>:"/\\|?*]/g, '').trim();
  if (
    sanitized === '.' ||
    sanitized === '..' ||
    CONTROL_OR_BIDI_PATTERN.test(sanitized)
  ) {
    return null;
  }

  return sanitized.length > MAX_IMAGE_SUBFOLDER_NAME_CHARS ? null : sanitized;
}

function loadImageSubfolderName(): string {
  try {
    return sanitizeImageSubfolderPreference(loadScalarString(STORAGE_KEY_IMAGE_SUBFOLDER_NAME)) || 'assets';
  } catch {
  }
  return 'assets';
}

function loadImageNotesRootSubfolderName(): string {
  try {
    return sanitizeImageSubfolderPreference(loadScalarString(STORAGE_KEY_IMAGE_NOTES_ROOT_SUBFOLDER_NAME)) || 'assets';
  } catch {
  }
  return 'assets';
}

function loadImageFilenameFormat(): ImageFilenameFormat {
  try {
    const saved = loadScalarString(STORAGE_KEY_IMAGE_FILENAME_FORMAT);
    if (saved === 'original' || saved === 'timestamp' || saved === 'sequence') {
      return saved;
    }
  } catch {
  }
  return 'original';
}

function loadNotesChatPanelCollapsed(): boolean {
  return loadBoolean(STORAGE_KEY_NOTES_CHAT_PANEL_COLLAPSED, true);
}

export function clampNotesChatFloatingSize(size: NotesChatFloatingSize): NotesChatFloatingSize {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) {
    return { ...NOTES_CHAT_FLOATING_DEFAULT_SIZE };
  }
  return {
    width: Math.max(
      NOTES_CHAT_FLOATING_MIN_SIZE.width,
      Math.min(NOTES_CHAT_FLOATING_MAX_SIZE.width, Math.round(size.width))
    ),
    height: Math.max(
      NOTES_CHAT_FLOATING_MIN_SIZE.height,
      Math.min(NOTES_CHAT_FLOATING_MAX_SIZE.height, Math.round(size.height))
    ),
  };
}

function parseNotesChatFloatingSize(value: string | null): NotesChatFloatingSize | null {
  if (!value || value.length > MAX_UI_SCALAR_STORAGE_CHARS) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<NotesChatFloatingSize>;
    if (typeof parsed.width !== 'number' || typeof parsed.height !== 'number') {
      return null;
    }
    if (!Number.isFinite(parsed.width) || !Number.isFinite(parsed.height)) {
      return null;
    }
    return clampNotesChatFloatingSize({
      width: parsed.width,
      height: parsed.height,
    });
  } catch {
    return null;
  }
}

function loadNotesChatFloatingSize(): NotesChatFloatingSize {
  return parseNotesChatFloatingSize(loadScalarString(STORAGE_KEY_NOTES_CHAT_FLOATING_SIZE))
    ?? NOTES_CHAT_FLOATING_DEFAULT_SIZE;
}

function loadLastAppViewMode(): Extract<AppViewMode, 'notes' | 'chat' | 'whiteboard' | 'graph'> {
  try {
    const saved = loadScalarString(STORAGE_KEY_LAST_APP_VIEW_MODE);
    if (saved === 'notes' || saved === 'chat' || saved === 'whiteboard' || saved === 'graph') {
      return saved;
    }
  } catch {
  }
  return 'notes';
}

export function saveLastAppViewMode(mode: AppViewMode): void {
  if (mode !== 'notes' && mode !== 'chat' && mode !== 'whiteboard' && mode !== 'graph') return;
  saveString(STORAGE_KEY_LAST_APP_VIEW_MODE, mode);
  if (mode === 'notes' || mode === 'chat') useUnifiedStore.getState().setLastAppViewMode(mode, true);
}

function loadLanguagePreference(): AppLanguagePreference {
  try {
    const saved = loadScalarString(STORAGE_KEY_LANGUAGE_PREFERENCE);
    const normalized = normalizeAppLanguagePreference(saved);
    if (normalized) {
      return normalized;
    }
  } catch {
  }
  return SYSTEM_LANGUAGE_PREFERENCE;
}

export function getInitialAppViewMode(): AppViewMode {
  const launchViewMode = readWindowLaunchContext().viewMode;
  if (!import.meta.env.DEV && launchViewMode === 'lab') {
    return 'notes';
  }
  return launchViewMode ?? loadLastAppViewMode();
}

export function normalizeAppViewMode(mode: AppViewMode): AppViewMode {
  if (!import.meta.env.DEV && mode === 'lab') {
    return 'notes';
  }
  return mode;
}

export function normalizeDevPlatformPreview(platformPreview: DesktopPlatformPreview): DesktopPlatformPreview {
  if (!import.meta.env.DEV) return 'system';
  return platformPreview === 'macos' ? 'macos' : 'system';
}

export function loadUIPreferencesFromStorage(): UIPreferenceState {
  return {
    sidebarCollapsed: loadBoolean(STORAGE_KEY_NOTES_SIDEBAR_COLLAPSED, false),
    sidebarWidth: clampSidebarWidth(loadNumber(STORAGE_KEY_SIDEBAR_WIDTH, getDefaultSidebarWidth())),
    fontSize: loadFontSize(),
    languagePreference: loadLanguagePreference(),
    imageStorageMode: loadImageStorageMode(),
    imageSubfolderName: loadImageSubfolderName(),
    imageNotesRootSubfolderName: loadImageNotesRootSubfolderName(),
    imageFilenameFormat: loadImageFilenameFormat(),
    notesChatPanelCollapsed: loadNotesChatPanelCollapsed(),
    notesChatFloatingSize: loadNotesChatFloatingSize(),
  };
}
