import { DEFAULT_SETTINGS } from '@/lib/config';
import type { AppLanguagePreference } from '@/lib/i18n/languages';
import type { DesktopPlatformPreview } from '@/lib/desktop/platform';

export const UI_FONT_SIZE_DEFAULT = 17;
export const UI_FONT_SIZE_MIN = 14;
export const UI_FONT_SIZE_MAX = 120;

export type AppViewMode = 'notes' | 'chat' | 'whiteboard' | 'graph' | 'lab';
export type NotesSidebarView = 'workspace' | 'outline';

export type ImageStorageMode = 'notesRoot' | 'notesRootSubfolder' | 'currentFolder' | 'subfolder';

export type ImageFilenameFormat = 'original' | 'timestamp' | 'sequence';

export interface NotesChatFloatingSize {
  width: number;
  height: number;
}

export const NOTES_CHAT_FLOATING_DEFAULT_SIZE: NotesChatFloatingSize = {
  ...DEFAULT_SETTINGS.ui.notesChatFloatingSize,
};

export const NOTES_CHAT_FLOATING_MIN_SIZE: NotesChatFloatingSize = {
  width: 320,
  height: 420,
};

export const NOTES_CHAT_FLOATING_MAX_SIZE: NotesChatFloatingSize = {
  width: 760,
  height: 920,
};

export interface PendingNotesChatComposerInsert {
  id: number;
  text: string;
}

export type NotesChatComposerInsertTarget = 'side-panel' | 'floating';
export type LayoutPanelTransitionSource = 'shell-sidebar' | 'docked-chat';

export interface UIStore {
  appViewMode: AppViewMode;
  setAppViewMode: (mode: AppViewMode) => void;
  toggleAppViewMode: () => void;
  restoreLastAppViewMode: (mode: 'notes' | 'chat') => void;

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  layoutPanelDragging: boolean;
  setLayoutPanelDragging: (dragging: boolean) => void;
  layoutPanelTransitioning: boolean;
  layoutPanelTransitionSources: LayoutPanelTransitionSource[];
  setLayoutPanelTransitioning: (
    source: LayoutPanelTransitionSource,
    transitioning: boolean,
  ) => void;
  devPlatformPreview: DesktopPlatformPreview;
  setDevPlatformPreview: (platformPreview: DesktopPlatformPreview) => void;
  toggleDevPlatformPreview: () => void;

  sidebarHeaderHovered: boolean;
  setSidebarHeaderHovered: (hovered: boolean) => void;
  sidebarSearchOpen: boolean;
  setSidebarSearchOpen: (open: boolean) => void;
  toggleSidebarSearch: () => void;
  chatSidebarSearchOpen: boolean;
  setChatSidebarSearchOpen: (open: boolean) => void;
  toggleChatSidebarSearch: () => void;
  notesSidebarView: NotesSidebarView;
  setNotesSidebarView: (view: NotesSidebarView) => void;
  fontSize: number;
  setFontSizePreview: (fontSize: number) => void;
  setFontSize: (fontSize: number) => void;
  resetFontSize: () => void;
  languagePreference: AppLanguagePreference;
  setLanguagePreference: (language: AppLanguagePreference) => void;
  reloadPreferencesFromStorage: () => void;

  notesPreviewTitle: { path: string; title: string } | null;
  setNotesPreviewTitle: (path: string | null, title: string | null) => void;
  notesSplitPanesActive: boolean;
  setNotesSplitPanesActive: (active: boolean) => void;

  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  toggleDrawer: () => void;

  universalPreviewTarget: string | null;
  universalPreviewIcon: string | null;
  universalPreviewColor: string | null;
  universalPreviewTone: number | null;
  universalPreviewIconSize: number | null;
  universalPreviewCover: string | null;

  setUniversalPreview: (targetId: string | null, state: {
    icon?: string | null;
    color?: string | null;
    tone?: number | null;
    size?: number | null;
    cover?: string | null;
  }) => void;

  imageStorageMode: ImageStorageMode;
  imageSubfolderName: string;
  setImageStorageMode: (mode: ImageStorageMode) => void;
  setImageSubfolderName: (name: string) => void;
  imageNotesRootSubfolderName: string;
  setImageNotesRootSubfolderName: (name: string) => void;
  imageFilenameFormat: ImageFilenameFormat;
  setImageFilenameFormat: (format: ImageFilenameFormat) => void;

  notesChatPanelCollapsed: boolean;
  setNotesChatPanelCollapsed: (collapsed: boolean) => void;
  toggleNotesChatPanel: () => void;
  notesChatFloatingOpen: boolean;
  setNotesChatFloatingOpen: (open: boolean) => void;
  notesChatFloatingSize: NotesChatFloatingSize;
  setNotesChatFloatingSize: (size: NotesChatFloatingSize) => void;
  restoreNotesChatFloatingSize: (size: NotesChatFloatingSize) => void;
  resetNotesChatFloatingSize: () => void;
  pendingNotesChatComposerInsert: PendingNotesChatComposerInsert | null;
  queueNotesChatComposerInsert: (text: string, target?: NotesChatComposerInsertTarget) => void;
  consumePendingNotesChatComposerInsert: (id: number) => void;
}

export type UIPreferenceState = Pick<
  UIStore,
  | 'sidebarCollapsed'
  | 'sidebarWidth'
  | 'fontSize'
  | 'languagePreference'
  | 'imageStorageMode'
  | 'imageSubfolderName'
  | 'imageNotesRootSubfolderName'
  | 'imageFilenameFormat'
  | 'notesChatPanelCollapsed'
  | 'notesChatFloatingSize'
>;
