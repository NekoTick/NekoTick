import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getDefaultSidebarWidth,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from '@/lib/layout/sidebarWidth';
import { DEFAULT_SETTINGS } from '@/lib/config';
import {
  NOTES_CHAT_FLOATING_DEFAULT_SIZE,
  NOTES_CHAT_FLOATING_MAX_SIZE,
  NOTES_CHAT_FLOATING_MIN_SIZE,
  UI_FONT_SIZE_DEFAULT,
  useUIStore,
} from './uiSlice';
import { useUnifiedStore } from './unified/useUnifiedStore';
import { useAIUIStore } from './ai/chatState';

describe('uiSlice', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({
      appViewMode: 'notes',
      sidebarCollapsed: false,
      sidebarWidth: 280,
      layoutPanelTransitioning: false,
      layoutPanelTransitionSources: [],
      devPlatformPreview: 'system',
      sidebarHeaderHovered: false,
      sidebarSearchOpen: false,
      chatSidebarSearchOpen: false,
      notesSidebarView: 'workspace',
      fontSize: 17,
      languagePreference: 'system',
      notesPreviewTitle: null,
      notesSplitPanesActive: false,
      drawerOpen: false,
      universalPreviewTarget: null,
      universalPreviewIcon: null,
      universalPreviewColor: null,
      universalPreviewTone: null,
      universalPreviewIconSize: null,
      imageStorageMode: 'subfolder',
      imageSubfolderName: 'assets',
      imageNotesRootSubfolderName: 'assets',
      imageFilenameFormat: 'original',
      notesChatPanelCollapsed: false,
      notesChatFloatingOpen: false,
      notesChatFloatingSize: NOTES_CHAT_FLOATING_DEFAULT_SIZE,
      pendingNotesChatComposerInsert: null,
    });
    useUnifiedStore.setState({
      data: {
        settings: {
          timezone: { offset: 8, city: 'Beijing' },
          markdown: {
            typewriterMode: false,
            codeBlock: { showLineNumbers: true },
          },
          ui: {
            lastAppViewMode: 'notes',
            colorMode: 'system',
            themeId: 'default',
            notesChatFloatingSize: NOTES_CHAT_FLOATING_DEFAULT_SIZE,
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
      },
      loaded: false,
      undoStack: [],
    });
    useAIUIStore.setState({
      generatingSessions: {},
      unreadSessions: {},
      error: null,
      currentSessionId: null,
      temporaryChatEnabled: false,
      selectionInitialized: false,
      temporaryReturnSessionId: null,
      authPromptSessionId: null,
    });
  });

  it('keeps layout transitions active until every source completes', () => {
    const { setLayoutPanelTransitioning } = useUIStore.getState();

    setLayoutPanelTransitioning('shell-sidebar', true);
    setLayoutPanelTransitioning('docked-chat', true);
    setLayoutPanelTransitioning('shell-sidebar', false);

    expect(useUIStore.getState()).toMatchObject({
      layoutPanelTransitioning: true,
      layoutPanelTransitionSources: ['docked-chat'],
    });

    setLayoutPanelTransitioning('docked-chat', false);

    expect(useUIStore.getState()).toMatchObject({
      layoutPanelTransitioning: false,
      layoutPanelTransitionSources: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets app view mode within the supported module set', () => {
    const setLastAppViewMode = vi.spyOn(useUnifiedStore.getState(), 'setLastAppViewMode');

    useUIStore.getState().setAppViewMode('chat');
    expect(useUIStore.getState().appViewMode).toBe('chat');
    expect(localStorage.getItem('vlaina_last_app_view_mode')).toBe('chat');
    expect(useUnifiedStore.getState().data.settings.ui?.lastAppViewMode).toBe('chat');
    expect(setLastAppViewMode).toHaveBeenLastCalledWith('chat', true);

    useUIStore.getState().setAppViewMode('whiteboard');
    expect(useUIStore.getState().appViewMode).toBe('whiteboard');
    expect(localStorage.getItem('vlaina_last_app_view_mode')).toBe('whiteboard');
    expect(useUnifiedStore.getState().data.settings.ui?.lastAppViewMode).toBe('chat');

    useUIStore.getState().setAppViewMode('lab');
    expect(useUIStore.getState().appViewMode).toBe('lab');
    expect(localStorage.getItem('vlaina_last_app_view_mode')).toBe('whiteboard');
    expect(useUnifiedStore.getState().data.settings.ui?.lastAppViewMode).toBe('chat');
  });

  it('persists appearance mode and theme settings in unified settings', () => {
    expect(DEFAULT_SETTINGS.ui.colorMode).toBe('system');

    useUnifiedStore.getState().setColorMode('dark');
    useUnifiedStore.getState().setThemeId('default');

    expect(useUnifiedStore.getState().data.settings.ui).toMatchObject({
      colorMode: 'dark',
      themeId: 'default',
    });

    useUnifiedStore.getState().setColorMode('light');

    expect(useUnifiedStore.getState().data.settings.ui?.colorMode).toBe('light');

    useUnifiedStore.getState().setColorMode('system');

    expect(useUnifiedStore.getState().data.settings.ui?.colorMode).toBe('system');
  });

  it('toggles app view mode between notes and chat', () => {
    useUIStore.getState().toggleAppViewMode();
    expect(useUIStore.getState().appViewMode).toBe('chat');
    expect(localStorage.getItem('vlaina_last_app_view_mode')).toBe('chat');
    expect(useUnifiedStore.getState().data.settings.ui?.lastAppViewMode).toBe('chat');

    useUIStore.getState().toggleAppViewMode();
    expect(useUIStore.getState().appViewMode).toBe('notes');
    expect(localStorage.getItem('vlaina_last_app_view_mode')).toBe('notes');
    expect(useUnifiedStore.getState().data.settings.ui?.lastAppViewMode).toBe('notes');
  });

  it('keeps temporary chat in memory when switching between chat and notes', () => {
    const temporarySessionId = 'temp-session-view-switch';
    useUnifiedStore.setState((state) => ({
      data: {
        ...state.data,
        ai: {
          ...state.data.ai!,
          sessions: [{
            id: temporarySessionId,
            title: 'Temporary Chat',
            modelId: 'model-1',
            createdAt: 1,
            updatedAt: 1,
          }],
          messages: {
            [temporarySessionId]: [{
              id: 'msg-1',
              role: 'user',
              content: 'temporary message',
              modelId: 'model-1',
              timestamp: 1,
              versions: [{
                content: 'temporary message',
                createdAt: 1,
                kind: 'original',
                subsequentMessages: [],
              }],
              currentVersionIndex: 0,
            }],
          },
        },
      },
    }));
    useAIUIStore.getState().setChatSelection({
      currentSessionId: temporarySessionId,
      temporaryChatEnabled: true,
    });

    useUIStore.getState().setAppViewMode('chat');
    useUIStore.getState().setAppViewMode('notes');
    useUIStore.getState().setAppViewMode('chat');

    expect(useAIUIStore.getState().currentSessionId).toBe(temporarySessionId);
    expect(useAIUIStore.getState().temporaryChatEnabled).toBe(true);
    expect(useUnifiedStore.getState().data.ai?.messages[temporarySessionId]).toHaveLength(1);
  });

  it('initializes app view mode from the last stored notes or chat view', async () => {
    localStorage.setItem('vlaina_last_app_view_mode', 'chat');
    vi.resetModules();

    const { useUIStore: freshUIStore } = await import('./uiSlice');

    expect(freshUIStore.getState().appViewMode).toBe('chat');
  });

  it('restores last app view mode after unified config loads', () => {
    useUIStore.setState({ appViewMode: 'notes' });
    useUIStore.getState().restoreLastAppViewMode('chat');

    expect(useUIStore.getState().appViewMode).toBe('chat');
    expect(localStorage.getItem('vlaina_last_app_view_mode')).toBe('chat');
  });

  it('tracks notes sidebar view independently from app view mode', () => {
    useUIStore.getState().setNotesSidebarView('outline');
    expect(useUIStore.getState().notesSidebarView).toBe('outline');
    expect(useUIStore.getState().appViewMode).toBe('notes');
  });

  it('keeps notes and chat sidebar search state independent', () => {
    useUIStore.getState().setChatSidebarSearchOpen(true);

    expect(useUIStore.getState().chatSidebarSearchOpen).toBe(true);
    expect(useUIStore.getState().sidebarSearchOpen).toBe(false);

    useUIStore.getState().setSidebarSearchOpen(true);
    useUIStore.getState().toggleChatSidebarSearch();

    expect(useUIStore.getState().sidebarSearchOpen).toBe(true);
    expect(useUIStore.getState().chatSidebarSearchOpen).toBe(false);
  });

  it('persists the selected language preference', () => {
    useUIStore.getState().setLanguagePreference('zh-CN');

    expect(useUIStore.getState().languagePreference).toBe('zh-CN');
    expect(localStorage.getItem('vlaina-language-preference')).toBe('zh-CN');
  });

  it('reloads local settings preferences from storage for external window sync', () => {
    localStorage.setItem('vlaina-notes-sidebar-collapsed', 'true');
    localStorage.setItem('vlaina_sidebar_width', '360');
    localStorage.setItem('fontSize', '18');
    localStorage.setItem('vlaina-language-preference', 'zh-CN');
    localStorage.setItem('vlaina_image_storage_mode', 'notesRootSubfolder');
    localStorage.setItem('vlaina_image_subfolder_name', 'inline-assets');
    localStorage.setItem('vlaina_image_notesRoot_subfolder_name', 'notes-root-assets');
    localStorage.setItem('vlaina_image_filename_format', 'sequence');
    localStorage.setItem('vlaina_notes_chat_panel_collapsed', 'true');
    localStorage.setItem('vlaina_notes_chat_floating_size', JSON.stringify({ width: 512, height: 720 }));

    useUIStore.getState().reloadPreferencesFromStorage();

    expect(useUIStore.getState()).toMatchObject({
      sidebarCollapsed: true,
      sidebarWidth: 360,
      fontSize: 18,
      languagePreference: 'zh-CN',
      imageStorageMode: 'notesRootSubfolder',
      imageSubfolderName: 'inline-assets',
      imageNotesRootSubfolderName: 'notes-root-assets',
      imageFilenameFormat: 'sequence',
      notesChatPanelCollapsed: true,
      notesChatFloatingSize: { width: 512, height: 720 },
    });
  });

  it('clamps the sidebar width to the view switch minimum', () => {
    useUIStore.getState().setSidebarWidth(SIDEBAR_MIN_WIDTH - 1);

    expect(useUIStore.getState().sidebarWidth).toBe(SIDEBAR_MIN_WIDTH);
    expect(localStorage.getItem('vlaina_sidebar_width')).toBe(String(SIDEBAR_MIN_WIDTH));

    localStorage.setItem('vlaina_sidebar_width', String(SIDEBAR_MIN_WIDTH - 24));
    useUIStore.getState().reloadPreferencesFromStorage();

    expect(useUIStore.getState().sidebarWidth).toBe(SIDEBAR_MIN_WIDTH);
  });

  it('clamps the sidebar width to the supported maximum', () => {
    useUIStore.getState().setSidebarWidth(SIDEBAR_MAX_WIDTH + 1);

    expect(useUIStore.getState().sidebarWidth).toBe(SIDEBAR_MAX_WIDTH);
    expect(localStorage.getItem('vlaina_sidebar_width')).toBe(String(SIDEBAR_MAX_WIDTH));
  });

  it('does not persist unchanged sidebar width values', () => {
    const setItemSpy = vi.spyOn(localStorage, 'setItem');
    const listener = vi.fn();
    const unsubscribe = useUIStore.subscribe(listener);
    useUIStore.getState().setSidebarWidth(280);
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('ignores non-decimal numeric UI preferences loaded from storage', () => {
    localStorage.setItem('vlaina_sidebar_width', '1e3');
    localStorage.setItem('fontSize', '18px');

    useUIStore.getState().reloadPreferencesFromStorage();

    expect(useUIStore.getState().sidebarWidth).toBe(getDefaultSidebarWidth());
    expect(useUIStore.getState().fontSize).toBe(UI_FONT_SIZE_DEFAULT);
  });

  it('resets the appearance font size to the default markdown body size', () => {
    useUIStore.getState().setFontSize(14);
    expect(localStorage.getItem('fontSize')).toBe('14');

    useUIStore.getState().resetFontSize();

    expect(useUIStore.getState().fontSize).toBe(17);
    expect(localStorage.getItem('fontSize')).toBeNull();
  });

  it('clamps the appearance font size to the supported preview range', () => {
    useUIStore.getState().setFontSize(8);
    expect(useUIStore.getState().fontSize).toBe(14);

    useUIStore.getState().setFontSize(160);
    expect(useUIStore.getState().fontSize).toBe(120);
  });

  it('previews appearance font size through UI state without persisting it', () => {
    useUIStore.getState().setFontSizePreview(20);

    expect(useUIStore.getState().fontSize).toBe(20);
    expect(localStorage.getItem('fontSize')).toBeNull();
  });

  it('persists a font size commit after a transient preview', () => {
    useUIStore.getState().setFontSizePreview(20);
    useUIStore.getState().setFontSize(20);

    expect(useUIStore.getState().fontSize).toBe(20);
    expect(localStorage.getItem('fontSize')).toBe('20');
  });

  it('does not persist or broadcast unchanged appearance font size values', () => {
    const setItemSpy = vi.spyOn(localStorage, 'setItem');

    useUIStore.getState().setFontSize(17);

    expect(useUIStore.getState().fontSize).toBe(17);
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('updates UI state even when localStorage writes fail', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => {
      useUIStore.getState().toggleSidebar();
      useUIStore.getState().setLanguagePreference('zh-CN');
      useUIStore.getState().setImageStorageMode('notesRoot');
      useUIStore.getState().queueNotesChatComposerInsert('Selected text');
    }).not.toThrow();

    expect(useUIStore.getState()).toMatchObject({
      sidebarCollapsed: true,
      languagePreference: 'zh-CN',
      imageStorageMode: 'notesRoot',
      notesChatPanelCollapsed: false,
    });
    expect(useUIStore.getState().pendingNotesChatComposerInsert?.text).toBe('Selected text');
  });

  it('stores universal preview fields incrementally', () => {
    useUIStore.getState().setUniversalPreview('note-1', {
      icon: 'emoji.book',
      color: 'blue',
      tone: 2,
    });

    useUIStore.getState().setUniversalPreview('note-1', {
      size: 20,
      cover: 'covers/preview.webp',
    });

    expect(useUIStore.getState()).toMatchObject({
      universalPreviewTarget: 'note-1',
      universalPreviewIcon: 'emoji.book',
      universalPreviewColor: 'blue',
      universalPreviewTone: 2,
      universalPreviewIconSize: 20,
      universalPreviewCover: 'covers/preview.webp',
    });
  });

  it('toggles the development platform preview without persisting it', () => {
    useUIStore.getState().toggleDevPlatformPreview();

    expect(useUIStore.getState().devPlatformPreview).toBe('macos');
    expect(localStorage.getItem('vlaina_dev_platform_preview')).toBeNull();

    useUIStore.getState().setDevPlatformPreview('system');

    expect(useUIStore.getState().devPlatformPreview).toBe('system');
  });

  it('sanitizes image folder names before persisting', () => {
    useUIStore.getState().setImageSubfolderName('assets:/notes*');
    useUIStore.getState().setImageNotesRootSubfolderName('notesRoot<>images');

    expect(useUIStore.getState().imageSubfolderName).toBe('assetsnotes');
    expect(useUIStore.getState().imageNotesRootSubfolderName).toBe('notesRootimages');
  });

  it('falls back for unsafe image folder names before persisting', () => {
    useUIStore.getState().setImageSubfolderName('..');
    useUIStore.getState().setImageNotesRootSubfolderName('notesRoot\u202Eimages');

    expect(useUIStore.getState().imageSubfolderName).toBe('assets');
    expect(useUIStore.getState().imageNotesRootSubfolderName).toBe('assets');
    expect(localStorage.getItem('vlaina_image_subfolder_name')).toBe('assets');
    expect(localStorage.getItem('vlaina_image_notesRoot_subfolder_name')).toBe('assets');
  });

  it('sanitizes image folder names loaded from storage', () => {
    localStorage.setItem('vlaina_image_subfolder_name', 'assets:/notes*');
    localStorage.setItem('vlaina_image_notesRoot_subfolder_name', 'notesRoot<>images');

    useUIStore.getState().reloadPreferencesFromStorage();

    expect(useUIStore.getState().imageSubfolderName).toBe('assetsnotes');
    expect(useUIStore.getState().imageNotesRootSubfolderName).toBe('notesRootimages');
  });

  it('falls back for unsafe image folder names loaded from storage', () => {
    localStorage.setItem('vlaina_image_subfolder_name', '.');
    localStorage.setItem('vlaina_image_notesRoot_subfolder_name', 'notesRoot\u0000images');

    useUIStore.getState().reloadPreferencesFromStorage();

    expect(useUIStore.getState().imageSubfolderName).toBe('assets');
    expect(useUIStore.getState().imageNotesRootSubfolderName).toBe('assets');
  });

  it('falls back when image folder names loaded from storage are oversized', () => {
    localStorage.setItem('vlaina_image_subfolder_name', 'a'.repeat(129));
    localStorage.setItem('vlaina_image_notesRoot_subfolder_name', 'b'.repeat(129));

    useUIStore.getState().reloadPreferencesFromStorage();

    expect(useUIStore.getState().imageSubfolderName).toBe('assets');
    expect(useUIStore.getState().imageNotesRootSubfolderName).toBe('assets');
  });

  it('ignores oversized scalar preferences loaded from storage', () => {
    localStorage.setItem('vlaina_sidebar_width', '9'.repeat(1024));
    localStorage.setItem('vlaina_image_storage_mode', 'notesRoot'.repeat(128));
    localStorage.setItem('vlaina_image_filename_format', 'timestamp'.repeat(128));
    localStorage.setItem('vlaina_last_app_view_mode', 'chat'.repeat(128));

    useUIStore.getState().reloadPreferencesFromStorage();

    expect(useUIStore.getState().sidebarWidth).toBeGreaterThan(0);
    expect(useUIStore.getState().imageStorageMode).toBe('subfolder');
    expect(useUIStore.getState().imageFilenameFormat).toBe('original');
  });

  it('opens the notes chat panel and queues a composer insert request', () => {
    useUIStore.getState().setNotesChatPanelCollapsed(true);
    useUIStore.getState().setNotesChatFloatingOpen(true);
    useUIStore.getState().queueNotesChatComposerInsert('Selected text');

    const state = useUIStore.getState();
    expect(state.notesChatPanelCollapsed).toBe(false);
    expect(state.notesChatFloatingOpen).toBe(false);
    expect(state.pendingNotesChatComposerInsert?.text).toBe('Selected text');
  });

  it('opens the floating notes chat when queuing a floating composer insert request', () => {
    useUIStore.getState().setNotesChatPanelCollapsed(false);
    useUIStore.getState().setNotesChatFloatingOpen(false);
    useUIStore.getState().queueNotesChatComposerInsert('Selected text', 'floating');

    const state = useUIStore.getState();
    expect(state.notesChatPanelCollapsed).toBe(true);
    expect(state.notesChatFloatingOpen).toBe(true);
    expect(state.pendingNotesChatComposerInsert?.text).toBe('Selected text');
    expect(localStorage.getItem('vlaina_notes_chat_panel_collapsed')).toBe('true');
  });

  it('closes the notes chat floating panel when the side panel opens', () => {
    useUIStore.getState().setNotesChatPanelCollapsed(true);
    useUIStore.getState().setNotesChatFloatingOpen(true);

    useUIStore.getState().setNotesChatPanelCollapsed(false);

    expect(useUIStore.getState().notesChatPanelCollapsed).toBe(false);
    expect(useUIStore.getState().notesChatFloatingOpen).toBe(false);
  });

  it('persists and resets the notes floating chat size', () => {
    useUIStore.getState().setNotesChatFloatingSize({ width: 512.2, height: 720.8 });

    expect(useUIStore.getState().notesChatFloatingSize).toEqual({ width: 512, height: 721 });
    expect(localStorage.getItem('vlaina_notes_chat_floating_size')).toBe(JSON.stringify({ width: 512, height: 721 }));
    expect(useUnifiedStore.getState().data.settings.ui?.notesChatFloatingSize).toEqual({ width: 512, height: 721 });

    useUIStore.getState().setNotesChatFloatingSize({
      width: NOTES_CHAT_FLOATING_MAX_SIZE.width + 100,
      height: NOTES_CHAT_FLOATING_MIN_SIZE.height - 100,
    });

    expect(useUIStore.getState().notesChatFloatingSize).toEqual({
      width: NOTES_CHAT_FLOATING_MAX_SIZE.width,
      height: NOTES_CHAT_FLOATING_MIN_SIZE.height,
    });

    useUIStore.getState().resetNotesChatFloatingSize();

    expect(useUIStore.getState().notesChatFloatingSize).toEqual(NOTES_CHAT_FLOATING_DEFAULT_SIZE);
    expect(localStorage.getItem('vlaina_notes_chat_floating_size')).toBeNull();
    expect(useUnifiedStore.getState().data.settings.ui?.notesChatFloatingSize).toEqual(NOTES_CHAT_FLOATING_DEFAULT_SIZE);
  });

  it('does not persist unchanged notes floating chat size updates', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const setUnifiedFloatingSizeSpy = vi.spyOn(useUnifiedStore.getState(), 'setNotesChatFloatingSize');

    useUIStore.getState().setNotesChatFloatingSize(NOTES_CHAT_FLOATING_DEFAULT_SIZE);

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(setUnifiedFloatingSizeSpy).not.toHaveBeenCalled();
  });

  it('consumes only the matching pending composer insert request', () => {
    useUIStore.getState().queueNotesChatComposerInsert('Selected text');
    const requestId = useUIStore.getState().pendingNotesChatComposerInsert?.id;

    useUIStore.getState().consumePendingNotesChatComposerInsert(-1);
    expect(useUIStore.getState().pendingNotesChatComposerInsert).not.toBeNull();

    useUIStore.getState().consumePendingNotesChatComposerInsert(requestId!);
    expect(useUIStore.getState().pendingNotesChatComposerInsert).toBeNull();
  });
});
