import { useCallback, useEffect, useMemo, useRef } from 'react';
import { desktopWindow } from '@/lib/desktop/window';
import { hasElectronDesktopBridge } from '@/lib/desktop/backend';
import { dispatchEditorFindOpenEvent } from '@/components/Notes/features/Editor/find/editorFindEvents';
import { dispatchNoteSourceModeToggleEvent } from '@/components/Notes/features/Editor/sourceMode/sourceModeEvents';
import { useNotesStore } from '@/stores/useNotesStore';
import { useUIStore as useAppUIStore } from '@/stores/uiSlice';
import { getShortcuts, getKeysFromEvent, matchShortcut, ShortcutScope, ShortcutHandler } from '@/lib/shortcuts';
import { shouldBlockBrowserReservedShortcut } from '@/lib/shortcuts/browserGuards';
import { isEventInsideDialog } from '@/lib/shortcuts/dialogGuards';
import {
  isEditableShortcutTarget,
  shouldSkipShortcutForEditableSystemShortcut,
} from '@/lib/shortcuts/editableGuards';
import { dispatchSidebarOpenSearchEvent } from '@/components/layout/sidebar/sidebarEvents';
import { resolveSiblingNoteParentPath } from '@/stores/notes/notePathState';
import { dispatchDeleteCurrentNoteEvent } from '@/components/Notes/noteDeleteEvents';
import { isOpenSettingsBinding } from '@/lib/shortcuts';

const FONT_SIZE_WHEEL_COMMIT_DELAY_MS = 180;

function resolveSidebarSearchScope(target: EventTarget | null, appViewMode: string): 'notes' | 'chat' | 'graph' {
  if (target instanceof Element && target.closest('[data-chat-view-mode]')) {
    return 'chat';
  }
  if (target instanceof Element && target.closest('[data-graph-view-mode]')) {
    return 'graph';
  }
  if (appViewMode === 'graph') {
    return 'graph';
  }
  return appViewMode === 'chat' ? 'chat' : 'notes';
}

interface UseShortcutsOptions {
  scope?: ShortcutScope;
  handlers?: Record<string, ShortcutHandler>;
}

export function useShortcuts(options: UseShortcutsOptions = {}) {
  const { scope = 'global', handlers: extraHandlers = {} } = options;
  const shortcutTargetRef = useRef<EventTarget | null>(null);
  const modifierKeyHeldRef = useRef(false);
  const toggleDrawer = useAppUIStore((state) => state.toggleDrawer);
  const appViewMode = useAppUIStore((state) => state.appViewMode);
  const toggleAppViewMode = useAppUIStore((state) => state.toggleAppViewMode);
  const toggleSidebar = useAppUIStore((state) => state.toggleSidebar);
  const notesSidebarView = useAppUIStore((state) => state.notesSidebarView);
  const setNotesSidebarView = useAppUIStore((state) => state.setNotesSidebarView);
  const fontSize = useAppUIStore((state) => state.fontSize);
  const setFontSizePreview = useAppUIStore((state) => state.setFontSizePreview);
  const setFontSize = useAppUIStore((state) => state.setFontSize);
  const resetFontSize = useAppUIStore((state) => state.resetFontSize);
  const pendingFontSizeCommitTimerRef = useRef<number | null>(null);
  const pendingFontSizeCommitRef = useRef(fontSize);
  const cancelScheduledFontSizeCommit = useCallback(() => {
    if (pendingFontSizeCommitTimerRef.current === null) return;
    window.clearTimeout(pendingFontSizeCommitTimerRef.current);
    pendingFontSizeCommitTimerRef.current = null;
  }, []);
  const flushScheduledFontSizeCommit = useCallback(() => {
    if (pendingFontSizeCommitTimerRef.current === null) return;
    window.clearTimeout(pendingFontSizeCommitTimerRef.current);
    pendingFontSizeCommitTimerRef.current = null;
    setFontSize(pendingFontSizeCommitRef.current);
  }, [setFontSize]);
  const createNote = useNotesStore((state) => state.createNote);
  const currentNotePath = useNotesStore((state) => state.currentNote?.path);
  const saveNote = useNotesStore((state) => state.saveNote);
  const restoreLastDeletedItem = useNotesStore((state) => state.restoreLastDeletedItem);

  const builtinHandlers = useMemo<Record<string, ShortcutHandler>>(() => ({
    toggleAppViewMode,
    toggleSidebar,
    toggleNotesSidebarView: () => {
      setNotesSidebarView(notesSidebarView === 'workspace' ? 'outline' : 'workspace');
    },
    sidebarSearch: () => {
      dispatchSidebarOpenSearchEvent(resolveSidebarSearchScope(shortcutTargetRef.current, appViewMode));
    },
    editorFind: () => {
      dispatchEditorFindOpenEvent();
    },
    toggleNoteSourceMode: () => {
      dispatchNoteSourceModeToggleEvent();
    },
    'open-settings': () => {
      window.dispatchEvent(new Event('toggle-settings'));
    },
    newWindow: async () => {
      await desktopWindow.create({ viewMode: appViewMode });
    },
    newTab: () => {
      const folderPath = resolveSiblingNoteParentPath(
        useNotesStore.getState().draftNotes,
        currentNotePath,
      );
      createNote(folderPath, { asDraft: true });
    },
    openMarkdownFile: () => {
      window.dispatchEvent(new Event('app-open-markdown-file'));
    },
    saveNote: async () => {
      await saveNote({ explicit: true });
    },
    deleteCurrentNote: () => {
      dispatchDeleteCurrentNoteEvent();
    },
    toggleDrawer,
  }), [toggleAppViewMode, toggleSidebar, setNotesSidebarView, notesSidebarView, createNote, currentNotePath, saveNote, toggleDrawer, appViewMode]);

  const handlers = useMemo(() => ({
    ...builtinHandlers,
    ...extraHandlers,
  }), [builtinHandlers, extraHandlers]);

  useEffect(() => {
    return () => {
      flushScheduledFontSizeCommit();
    };
  }, [flushScheduledFontSizeCommit]);

  useEffect(() => {
    const scheduleFontSizeCommit = (next: number) => {
      pendingFontSizeCommitRef.current = next;
      if (pendingFontSizeCommitTimerRef.current !== null) {
        window.clearTimeout(pendingFontSizeCommitTimerRef.current);
      }
      pendingFontSizeCommitTimerRef.current = window.setTimeout(() => {
        pendingFontSizeCommitTimerRef.current = null;
        setFontSize(pendingFontSizeCommitRef.current);
      }, FONT_SIZE_WHEEL_COMMIT_DELAY_MS);
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.defaultPrevented) {
        return;
      }
      if ((!e.ctrlKey && !e.metaKey) || e.deltaY === 0) {
        return;
      }
      if (isEventInsideDialog(e.target)) {
        e.preventDefault();
        return;
      }

      e.preventDefault();
      const currentFontSize = useAppUIStore.getState().fontSize;
      setFontSizePreview(currentFontSize + (e.deltaY < 0 ? 1 : -1));
      scheduleFontSizeCommit(useAppUIStore.getState().fontSize);
    };

    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.defaultPrevented) {
        return;
      }
      if (e.isComposing) {
        return;
      }

      if (e.key === 'F11') {
        e.preventDefault();
        await desktopWindow.toggleFullscreen();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        await handlers.newWindow?.();
        return;
      }

      if (hasElectronDesktopBridge() && shouldBlockBrowserReservedShortcut(e)) {
        e.preventDefault();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey) {
        if (e.key === '9') {
          e.preventDefault();
          cancelScheduledFontSizeCommit();
          resetFontSize();
          return;
        }

        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          cancelScheduledFontSizeCommit();
          setFontSize(fontSize + 1);
          return;
        }

        if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          cancelScheduledFontSizeCommit();
          setFontSize(fontSize - 1);
          return;
        }
      }

      if (isEventInsideDialog(e.target)) {
        if (isOpenSettingsBinding(e)) {
          e.preventDefault();
          await handlers['open-settings']?.();
        }
        return;
      }

      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === 'f' &&
        e.target instanceof Element &&
        e.target.closest('[data-chat-view-mode]')
      ) {
        e.preventDefault();
        dispatchSidebarOpenSearchEvent('chat');
        return;
      }

      if (
        appViewMode === 'notes' &&
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === 'z' &&
        !isEditableShortcutTarget(e.target) &&
        useNotesStore.getState().pendingDeletedItems.length > 0
      ) {
        e.preventDefault();
        await restoreLastDeletedItem();
        return;
      }

      if (
        appViewMode === 'graph' &&
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === 'f' &&
        !isEditableShortcutTarget(e.target)
      ) {
        e.preventDefault();
        dispatchSidebarOpenSearchEvent('graph');
        return;
      }

      if (shouldSkipShortcutForEditableSystemShortcut(e)) {
        return;
      }

      if (isEditableShortcutTarget(e.target)) {
        return;
      }
      
      const pressedKeys = getKeysFromEvent(e);
      if (pressedKeys.length < 2) return;
      
      const shortcuts = getShortcuts();
      
      for (const shortcut of shortcuts) {
        const shortcutScope = shortcut.scope || 'global';
        if (scope !== 'global' && shortcutScope !== 'global' && shortcutScope !== scope) continue;
        if (shortcutScope === 'notes' && appViewMode !== 'notes') continue;
        if (shortcutScope === 'chat' && appViewMode !== 'chat') continue;
        if (shortcut.id === 'open-settings' && !isOpenSettingsBinding(e)) continue;
        
        if (matchShortcut(pressedKeys, shortcut)) {
          const handler = handlers[shortcut.id];
          if (!handler) continue;
          e.preventDefault();
          shortcutTargetRef.current = e.target;
          try {
            await handler();
          } finally {
            shortcutTargetRef.current = null;
          }
          break;
        }
      }
    };

    let modifierWheelListenerActive = false;
    const modifierWheelListenerOptions: AddEventListenerOptions = { passive: false };
    const enableModifierWheelListener = () => {
      if (modifierWheelListenerActive) return;
      modifierWheelListenerActive = true;
      window.addEventListener('wheel', handleWheel, modifierWheelListenerOptions);
    };
    const disableModifierWheelListener = () => {
      if (!modifierWheelListenerActive) return;
      modifierWheelListenerActive = false;
      window.removeEventListener('wheel', handleWheel, modifierWheelListenerOptions);
    };
    const handleModifierKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.key === 'Control' || event.key === 'Meta') {
        modifierKeyHeldRef.current = true;
        enableModifierWheelListener();
      }
    };
    const handleModifierKeyUp = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        modifierKeyHeldRef.current = false;
        disableModifierWheelListener();
      }
    };
    const handleWindowBlur = () => {
      modifierKeyHeldRef.current = false;
      disableModifierWheelListener();
    };

    window.addEventListener('keydown', handleModifierKeyDown, true);
    window.addEventListener('keyup', handleModifierKeyUp, true);
    window.addEventListener('blur', handleWindowBlur);
    if (modifierKeyHeldRef.current) {
      enableModifierWheelListener();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      if (modifierWheelListenerActive) {
        window.removeEventListener('wheel', handleWheel, modifierWheelListenerOptions);
        modifierWheelListenerActive = false;
      }
      window.removeEventListener('keydown', handleModifierKeyDown, true);
      window.removeEventListener('keyup', handleModifierKeyUp, true);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    scope,
    appViewMode,
    handlers,
    restoreLastDeletedItem,
    fontSize,
    resetFontSize,
    setFontSize,
    setFontSizePreview,
    cancelScheduledFontSizeCommit,
  ]);
}
