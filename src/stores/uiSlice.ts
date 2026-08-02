import { create } from 'zustand';
import {
  STORAGE_KEY_FONT_SIZE,
  STORAGE_KEY_NOTES_SIDEBAR_COLLAPSED,
} from '@/lib/config';
import { clampSidebarWidth } from '@/lib/layout/sidebarWidth';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import {
  clampNotesChatFloatingSize,
  getInitialAppViewMode,
  getStoredPreferenceString,
  loadUIPreferencesFromStorage,
  normalizeAppViewMode,
  normalizeDevPlatformPreview,
  normalizeFontSize,
  removePreferenceString,
  sanitizeImageSubfolderPreference,
  saveLastAppViewMode,
  savePreferenceString,
  saveString,
  STORAGE_KEY_IMAGE_FILENAME_FORMAT,
  STORAGE_KEY_IMAGE_NOTES_ROOT_SUBFOLDER_NAME,
  STORAGE_KEY_IMAGE_STORAGE_MODE,
  STORAGE_KEY_IMAGE_SUBFOLDER_NAME,
  STORAGE_KEY_LANGUAGE_PREFERENCE,
  STORAGE_KEY_LAST_APP_VIEW_MODE,
  STORAGE_KEY_NOTES_CHAT_FLOATING_SIZE,
  STORAGE_KEY_NOTES_CHAT_PANEL_COLLAPSED,
  STORAGE_KEY_SIDEBAR_WIDTH,
} from './uiPreferences';
import {
  NOTES_CHAT_FLOATING_DEFAULT_SIZE,
  UI_FONT_SIZE_DEFAULT,
  type UIStore,
} from './uiSliceTypes';

export {
  NOTES_CHAT_FLOATING_DEFAULT_SIZE,
  NOTES_CHAT_FLOATING_MAX_SIZE,
  NOTES_CHAT_FLOATING_MIN_SIZE,
  UI_FONT_SIZE_DEFAULT,
  UI_FONT_SIZE_MAX,
  UI_FONT_SIZE_MIN,
} from './uiSliceTypes';
export type {
  AppViewMode,
  ImageFilenameFormat,
  ImageStorageMode,
  NotesChatFloatingSize,
  NotesSidebarView,
} from './uiSliceTypes';

export const useUIStore = create<UIStore>()((set) => ({
  appViewMode: getInitialAppViewMode(),
  setAppViewMode: (mode) => {
    const next = normalizeAppViewMode(mode);
    saveLastAppViewMode(next);
    set({ appViewMode: next });
  },
  toggleAppViewMode: () => set((state) => {
    const next = state.appViewMode === 'chat' ? 'notes' : 'chat';
    saveLastAppViewMode(next);
    return { appViewMode: next };
  }),
  restoreLastAppViewMode: (mode) => set((state) => {
    if (state.appViewMode === 'lab' || state.appViewMode === 'whiteboard') return {};
    if (state.appViewMode === mode) return {};
    saveString(STORAGE_KEY_LAST_APP_VIEW_MODE, mode);
    return { appViewMode: mode };
  }),

  toggleSidebar: () => set((state) => {
    const next = !state.sidebarCollapsed;
    savePreferenceString(STORAGE_KEY_NOTES_SIDEBAR_COLLAPSED, String(next));
    return { sidebarCollapsed: next };
  }),
  setSidebarWidth: (width) => {
    const next = clampSidebarWidth(width);
    set((state) => {
      if (state.sidebarWidth === next) return state;
      savePreferenceString(STORAGE_KEY_SIDEBAR_WIDTH, String(next));
      return { sidebarWidth: next };
    });
  },
  layoutPanelDragging: false,
  setLayoutPanelDragging: (dragging) => set({ layoutPanelDragging: dragging }),
  layoutPanelTransitioning: false,
  layoutPanelTransitionSources: [],
  setLayoutPanelTransitioning: (source, transitioning) => set((state) => {
    const sourceActive = state.layoutPanelTransitionSources.includes(source);
    if (sourceActive === transitioning) return state;

    const layoutPanelTransitionSources = transitioning
      ? [...state.layoutPanelTransitionSources, source]
      : state.layoutPanelTransitionSources.filter((activeSource) => activeSource !== source);
    return {
      layoutPanelTransitionSources,
      layoutPanelTransitioning: layoutPanelTransitionSources.length > 0,
    };
  }),
  devPlatformPreview: 'system',
  setDevPlatformPreview: (platformPreview) =>
    set({ devPlatformPreview: normalizeDevPlatformPreview(platformPreview) }),
  toggleDevPlatformPreview: () =>
    set((state) => ({
      devPlatformPreview: normalizeDevPlatformPreview(
        state.devPlatformPreview === 'macos' ? 'system' : 'macos',
      ),
    })),
  sidebarHeaderHovered: false,
  setSidebarHeaderHovered: (hovered) => set({ sidebarHeaderHovered: hovered }),
  sidebarSearchOpen: false,
  setSidebarSearchOpen: (open) => set({ sidebarSearchOpen: open }),
  toggleSidebarSearch: () => set((state) => ({ sidebarSearchOpen: !state.sidebarSearchOpen })),
  chatSidebarSearchOpen: false,
  setChatSidebarSearchOpen: (open) => set({ chatSidebarSearchOpen: open }),
  toggleChatSidebarSearch: () =>
    set((state) => ({ chatSidebarSearchOpen: !state.chatSidebarSearchOpen })),
  notesSidebarView: 'workspace',
  setNotesSidebarView: (view) => set({ notesSidebarView: view }),
  ...loadUIPreferencesFromStorage(),
  setFontSizePreview: (fontSize) => set((state) => {
    const next = normalizeFontSize(fontSize);
    if (state.fontSize === next) {
      return state;
    }
    return { fontSize: next };
  }),
  setFontSize: (fontSize) => set((state) => {
    const next = normalizeFontSize(fontSize);
    if (state.fontSize === next) {
      const stored = getStoredPreferenceString(STORAGE_KEY_FONT_SIZE);
      if (stored === String(next) || (next === UI_FONT_SIZE_DEFAULT && stored === null)) {
        return state;
      }
      savePreferenceString(STORAGE_KEY_FONT_SIZE, String(next));
      return state;
    }
    savePreferenceString(STORAGE_KEY_FONT_SIZE, String(next));
    return { fontSize: next };
  }),
  resetFontSize: () => {
    removePreferenceString(STORAGE_KEY_FONT_SIZE);
    set({ fontSize: UI_FONT_SIZE_DEFAULT });
  },
  setLanguagePreference: (language) => {
    savePreferenceString(STORAGE_KEY_LANGUAGE_PREFERENCE, language);
    set({ languagePreference: language });
  },
  reloadPreferencesFromStorage: () => set(loadUIPreferencesFromStorage()),

  notesPreviewTitle: null,
  setNotesPreviewTitle: (path, title) => {
    if (path && title) {
      set({ notesPreviewTitle: { path, title } });
    } else {
      set({ notesPreviewTitle: null });
    }
  },
  notesSplitPanesActive: false,
  setNotesSplitPanesActive: (active) => set((state) => (
    state.notesSplitPanesActive === active ? state : { notesSplitPanesActive: active }
  )),

  drawerOpen: false,
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  toggleDrawer: () => set((state) => ({ drawerOpen: !state.drawerOpen })),

  universalPreviewTarget: null,
  universalPreviewIcon: null,
  universalPreviewColor: null,
  universalPreviewTone: null,
  universalPreviewIconSize: null,
  universalPreviewCover: null,

  setUniversalPreview: (targetId, { icon, color, tone, size, cover }) => set((state) => ({
    universalPreviewTarget: targetId,
    universalPreviewIcon: icon !== undefined ? icon : state.universalPreviewIcon,
    universalPreviewColor: color !== undefined ? color : state.universalPreviewColor,
    universalPreviewTone: tone !== undefined ? tone : state.universalPreviewTone,
    universalPreviewIconSize: size !== undefined ? size : state.universalPreviewIconSize,
    universalPreviewCover: cover !== undefined ? cover : state.universalPreviewCover,
  })),

  setImageStorageMode: (mode) => {
    savePreferenceString(STORAGE_KEY_IMAGE_STORAGE_MODE, mode);
    set({ imageStorageMode: mode });
  },
  setImageSubfolderName: (name) => {
    const sanitized = sanitizeImageSubfolderPreference(name) ?? 'assets';
    savePreferenceString(STORAGE_KEY_IMAGE_SUBFOLDER_NAME, sanitized);
    set({ imageSubfolderName: sanitized });
  },
  setImageNotesRootSubfolderName: (name) => {
    const sanitized = sanitizeImageSubfolderPreference(name) ?? 'assets';
    savePreferenceString(STORAGE_KEY_IMAGE_NOTES_ROOT_SUBFOLDER_NAME, sanitized);
    set({ imageNotesRootSubfolderName: sanitized });
  },
  setImageFilenameFormat: (format) => {
    savePreferenceString(STORAGE_KEY_IMAGE_FILENAME_FORMAT, format);
    set({ imageFilenameFormat: format });
  },

  setNotesChatPanelCollapsed: (collapsed) => {
    savePreferenceString(STORAGE_KEY_NOTES_CHAT_PANEL_COLLAPSED, String(collapsed));
    set({
      notesChatPanelCollapsed: collapsed,
      ...(collapsed ? {} : { notesChatFloatingOpen: false }),
    });
  },
  toggleNotesChatPanel: () =>
    set((state) => {
      const next = !state.notesChatPanelCollapsed;
      savePreferenceString(STORAGE_KEY_NOTES_CHAT_PANEL_COLLAPSED, String(next));
      return {
        notesChatPanelCollapsed: next,
        ...(next ? {} : { notesChatFloatingOpen: false }),
      };
    }),
  notesChatFloatingOpen: false,
  setNotesChatFloatingOpen: (open) => set({ notesChatFloatingOpen: open }),
  setNotesChatFloatingSize: (size) => {
    const next = clampNotesChatFloatingSize(size);
    set((state) => {
      if (
        state.notesChatFloatingSize.width === next.width &&
        state.notesChatFloatingSize.height === next.height
      ) {
        return state;
      }

      savePreferenceString(STORAGE_KEY_NOTES_CHAT_FLOATING_SIZE, JSON.stringify(next));
      useUnifiedStore.getState().setNotesChatFloatingSize(next);
      return { notesChatFloatingSize: next };
    });
  },
  restoreNotesChatFloatingSize: (size) => {
    const next = clampNotesChatFloatingSize(size);
    saveString(STORAGE_KEY_NOTES_CHAT_FLOATING_SIZE, JSON.stringify(next));
    set({ notesChatFloatingSize: next });
  },
  resetNotesChatFloatingSize: () => {
    removePreferenceString(STORAGE_KEY_NOTES_CHAT_FLOATING_SIZE);
    useUnifiedStore.getState().setNotesChatFloatingSize(NOTES_CHAT_FLOATING_DEFAULT_SIZE);
    set({ notesChatFloatingSize: NOTES_CHAT_FLOATING_DEFAULT_SIZE });
  },
  pendingNotesChatComposerInsert: null,
  queueNotesChatComposerInsert: (text, target = 'side-panel') => {
    const openFloating = target === 'floating';
    saveString(STORAGE_KEY_NOTES_CHAT_PANEL_COLLAPSED, openFloating ? 'true' : 'false');
    set({
      pendingNotesChatComposerInsert: {
        id: Date.now(),
        text,
      },
      notesChatPanelCollapsed: openFloating,
      notesChatFloatingOpen: openFloating,
    });
  },
  consumePendingNotesChatComposerInsert: (id) =>
    set((state) =>
      state.pendingNotesChatComposerInsert?.id === id
        ? { pendingNotesChatComposerInsert: null }
        : {}
    ),
}));
