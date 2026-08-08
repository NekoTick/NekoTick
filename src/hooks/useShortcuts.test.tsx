import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EDITOR_FIND_OPEN_EVENT } from '@/components/Notes/features/Editor/find/editorFindEvents';
import { NOTE_SOURCE_MODE_TOGGLE_EVENT } from '@/components/Notes/features/Editor/sourceMode/sourceModeEvents';
import { DELETE_CURRENT_NOTE_EVENT } from '@/components/Notes/noteDeleteEvents';
import { SIDEBAR_OPEN_SEARCH_EVENT } from '@/components/layout/sidebar/sidebarEvents';
import { useNotesStore } from '@/stores/useNotesStore';
import { useUIStore } from '@/stores/uiSlice';
import { useShortcuts } from './useShortcuts';

describe('useShortcuts', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({
      appViewMode: 'notes',
      notesSidebarView: 'workspace',
      drawerOpen: false,
    });
    useNotesStore.setState({
      pendingDeletedItems: [],
      restoreLastDeletedItem: vi.fn().mockResolvedValue(null),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches in-note find for Ctrl+F in notes mode', () => {
    const editorFindListener = vi.fn();
    const sidebarListener = vi.fn();
    window.addEventListener(EDITOR_FIND_OPEN_EVENT, editorFindListener);
    window.addEventListener(SIDEBAR_OPEN_SEARCH_EVENT, sidebarListener);

    try {
      renderHook(() => useShortcuts());

      const event = new KeyboardEvent('keydown', {
        key: 'f',
        code: 'KeyF',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(editorFindListener).toHaveBeenCalledTimes(1);
      expect(sidebarListener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(EDITOR_FIND_OPEN_EVENT, editorFindListener);
      window.removeEventListener(SIDEBAR_OPEN_SEARCH_EVENT, sidebarListener);
    }
  });

  it('dispatches sidebar search for Ctrl+Shift+F', () => {
    const editorFindListener = vi.fn();
    const sidebarListener = vi.fn();
    window.addEventListener(EDITOR_FIND_OPEN_EVENT, editorFindListener);
    window.addEventListener(SIDEBAR_OPEN_SEARCH_EVENT, sidebarListener);

    try {
      renderHook(() => useShortcuts());

      const event = new KeyboardEvent('keydown', {
        key: 'F',
        code: 'KeyF',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });

      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(sidebarListener).toHaveBeenCalledTimes(1);
      expect((sidebarListener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ scope: 'notes' });
      expect(editorFindListener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(EDITOR_FIND_OPEN_EVENT, editorFindListener);
      window.removeEventListener(SIDEBAR_OPEN_SEARCH_EVENT, sidebarListener);
    }
  });

  it('dispatches chat sidebar search when Ctrl+Shift+F starts inside a chat view', () => {
    const sidebarListener = vi.fn();
    window.addEventListener(SIDEBAR_OPEN_SEARCH_EVENT, sidebarListener);

    try {
      renderHook(() => useShortcuts());

      const chatView = document.createElement('div');
      chatView.setAttribute('data-chat-view-mode', 'embedded');
      document.body.appendChild(chatView);

      const event = new KeyboardEvent('keydown', {
        key: 'F',
        code: 'KeyF',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });

      chatView.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(sidebarListener).toHaveBeenCalledTimes(1);
      expect((sidebarListener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ scope: 'chat' });
      chatView.remove();
    } finally {
      window.removeEventListener(SIDEBAR_OPEN_SEARCH_EVENT, sidebarListener);
    }
  });

  it('dispatches Chat sidebar search from an editable Chat composer', () => {
    const sidebarListener = vi.fn();
    window.addEventListener(SIDEBAR_OPEN_SEARCH_EVENT, sidebarListener);

    try {
      renderHook(() => useShortcuts());
      const chatView = document.createElement('div');
      chatView.setAttribute('data-chat-view-mode', 'full');
      const textarea = document.createElement('textarea');
      chatView.appendChild(textarea);
      document.body.appendChild(chatView);

      const event = new KeyboardEvent('keydown', {
        key: 'F',
        code: 'KeyF',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      textarea.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(sidebarListener).toHaveBeenCalledTimes(1);
      expect((sidebarListener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ scope: 'chat' });
      chatView.remove();
    } finally {
      window.removeEventListener(SIDEBAR_OPEN_SEARCH_EVENT, sidebarListener);
      document.querySelector('[data-chat-view-mode]')?.remove();
    }
  });

  it('dispatches graph sidebar search in graph mode', () => {
    const sidebarListener = vi.fn();
    window.addEventListener(SIDEBAR_OPEN_SEARCH_EVENT, sidebarListener);

    try {
      useUIStore.setState({ appViewMode: 'graph' });
      renderHook(() => useShortcuts());

      const event = new KeyboardEvent('keydown', {
        key: 'F',
        code: 'KeyF',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });

      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(sidebarListener).toHaveBeenCalledTimes(1);
      expect((sidebarListener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ scope: 'graph' });
    } finally {
      window.removeEventListener(SIDEBAR_OPEN_SEARCH_EVENT, sidebarListener);
    }
  });

  it('dispatches only graph search for Ctrl+F in graph mode', () => {
    const editorFindListener = vi.fn();
    const sidebarListener = vi.fn();
    window.addEventListener(EDITOR_FIND_OPEN_EVENT, editorFindListener);
    window.addEventListener(SIDEBAR_OPEN_SEARCH_EVENT, sidebarListener);

    try {
      useUIStore.setState({ appViewMode: 'graph' });
      renderHook(() => useShortcuts());

      const event = new KeyboardEvent('keydown', {
        key: 'f',
        code: 'KeyF',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(sidebarListener).toHaveBeenCalledTimes(1);
      expect((sidebarListener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ scope: 'graph' });
      expect(editorFindListener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(EDITOR_FIND_OPEN_EVENT, editorFindListener);
      window.removeEventListener(SIDEBAR_OPEN_SEARCH_EVENT, sidebarListener);
    }
  });


  it('does not dispatch find shortcuts from inside a dialog', () => {
    const editorFindListener = vi.fn();
    const sidebarListener = vi.fn();
    window.addEventListener(EDITOR_FIND_OPEN_EVENT, editorFindListener);
    window.addEventListener(SIDEBAR_OPEN_SEARCH_EVENT, sidebarListener);

    try {
      renderHook(() => useShortcuts());

      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      const button = document.createElement('button');
      dialog.appendChild(button);
      document.body.appendChild(dialog);

      const findEvent = new KeyboardEvent('keydown', {
        key: 'f',
        code: 'KeyF',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      button.dispatchEvent(findEvent);

      const sidebarEvent = new KeyboardEvent('keydown', {
        key: 'F',
        code: 'KeyF',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      button.dispatchEvent(sidebarEvent);

      expect(findEvent.defaultPrevented).toBe(false);
      expect(sidebarEvent.defaultPrevented).toBe(false);
      expect(editorFindListener).not.toHaveBeenCalled();
      expect(sidebarListener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(EDITOR_FIND_OPEN_EVENT, editorFindListener);
      window.removeEventListener(SIDEBAR_OPEN_SEARCH_EVENT, sidebarListener);
    }
  });

  it('toggles settings from inside a dialog on Ctrl+,', () => {
    const toggleSettingsListener = vi.fn();
    window.addEventListener('toggle-settings', toggleSettingsListener);

    try {
      renderHook(() => useShortcuts());

      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      const button = document.createElement('button');
      dialog.appendChild(button);
      document.body.appendChild(dialog);

      const event = new KeyboardEvent('keydown', {
        key: ',',
        code: 'Comma',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      button.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(toggleSettingsListener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('toggle-settings', toggleSettingsListener);
      document.querySelector('[role="dialog"]')?.remove();
    }
  });

  it('does not open settings for Ctrl+/ on layouts where slash is emitted by the comma key', () => {
    const toggleSettingsListener = vi.fn();
    window.addEventListener('toggle-settings', toggleSettingsListener);

    try {
      renderHook(() => useShortcuts());

      const event = new KeyboardEvent('keydown', {
        key: '/',
        code: 'Comma',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(event);

      expect(toggleSettingsListener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('toggle-settings', toggleSettingsListener);
    }
  });


  it('dispatches delete current note for Ctrl+Shift+Backspace in notes mode', () => {
    const deleteListener = vi.fn();
    window.addEventListener(DELETE_CURRENT_NOTE_EVENT, deleteListener);

    try {
      renderHook(() => useShortcuts());

      const event = new KeyboardEvent('keydown', {
        key: 'Backspace',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });

      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(deleteListener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(DELETE_CURRENT_NOTE_EVENT, deleteListener);
    }
  });

  it('dispatches open markdown file for Ctrl+O in notes mode', () => {
    const openMarkdownListener = vi.fn();
    window.addEventListener('app-open-markdown-file', openMarkdownListener);

    try {
      renderHook(() => useShortcuts());

      const event = new KeyboardEvent('keydown', {
        key: 'o',
        code: 'KeyO',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(openMarkdownListener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('app-open-markdown-file', openMarkdownListener);
    }
  });

  it('dispatches note source mode toggle for Ctrl+/ outside editable controls', () => {
    const sourceModeListener = vi.fn();
    window.addEventListener(NOTE_SOURCE_MODE_TOGGLE_EVENT, sourceModeListener);

    try {
      renderHook(() => useShortcuts());

      const event = new KeyboardEvent('keydown', {
        key: '/',
        code: 'Slash',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(sourceModeListener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(NOTE_SOURCE_MODE_TOGGLE_EVENT, sourceModeListener);
    }
  });

  it('does not run global shortcuts from editable controls', async () => {
    const sourceModeListener = vi.fn();
    window.addEventListener(NOTE_SOURCE_MODE_TOGGLE_EVENT, sourceModeListener);

    try {
      renderHook(() => useShortcuts());

      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      const event = new KeyboardEvent('keydown', {
        key: '/',
        code: 'Slash',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      textarea.dispatchEvent(event);
      await Promise.resolve();

      expect(event.defaultPrevented).toBe(false);
      expect(sourceModeListener).not.toHaveBeenCalled();
      textarea.remove();
    } finally {
      window.removeEventListener(NOTE_SOURCE_MODE_TOGGLE_EVENT, sourceModeListener);
      document.querySelector('textarea')?.remove();
    }
  });

  it('restores the last pending deleted item for Ctrl+Z outside editable content', async () => {
    const restoreLastDeletedItem = vi.fn().mockResolvedValue('alpha.md');
    useNotesStore.setState({
      pendingDeletedItems: [{
        id: 'delete-1',
        kind: 'file',
        originalPath: 'alpha.md',
        originalFullPath: '/notesRoot/alpha.md',
        stagingPath: '/app/.vlaina/notes/notes-roots/notes-root-test/trash/delete-1/alpha.md',
        deletedAt: 1,
        previousCurrentNote: null,
        previousIsDirty: false,
        deletedStarredEntries: [],
        deletedMetadata: null,
      }],
      restoreLastDeletedItem,
    });

    renderHook(() => useShortcuts());

    const event = new KeyboardEvent('keydown', {
      key: 'z',
      code: 'KeyZ',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });

    window.dispatchEvent(event);
    await Promise.resolve();

    expect(event.defaultPrevented).toBe(true);
    expect(restoreLastDeletedItem).toHaveBeenCalledTimes(1);
  });

  it('does not steal Ctrl+Z from editor content', async () => {
    const restoreLastDeletedItem = vi.fn().mockResolvedValue('alpha.md');
    useNotesStore.setState({
      pendingDeletedItems: [{
        id: 'delete-1',
        kind: 'file',
        originalPath: 'alpha.md',
        originalFullPath: '/notesRoot/alpha.md',
        stagingPath: '/app/.vlaina/notes/notes-roots/notes-root-test/trash/delete-1/alpha.md',
        deletedAt: 1,
        previousCurrentNote: null,
        previousIsDirty: false,
        deletedStarredEntries: [],
        deletedMetadata: null,
      }],
      restoreLastDeletedItem,
    });

    try {
      renderHook(() => useShortcuts());

      const editor = document.createElement('div');
      editor.className = 'ProseMirror';
      editor.setAttribute('contenteditable', 'true');
      document.body.appendChild(editor);

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        code: 'KeyZ',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      editor.dispatchEvent(event);
      await Promise.resolve();

      expect(event.defaultPrevented).toBe(false);
      expect(restoreLastDeletedItem).not.toHaveBeenCalled();
    } finally {
      document.querySelector('.ProseMirror')?.remove();
    }
  });

  it('does not prevent Ctrl+Z when there is no deleted item to restore', async () => {
    const restoreLastDeletedItem = vi.fn().mockResolvedValue(null);
    useNotesStore.setState({
      pendingDeletedItems: [],
      restoreLastDeletedItem,
    });

    renderHook(() => useShortcuts());

    const event = new KeyboardEvent('keydown', {
      key: 'z',
      code: 'KeyZ',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });

    window.dispatchEvent(event);
    await Promise.resolve();

    expect(event.defaultPrevented).toBe(false);
    expect(restoreLastDeletedItem).not.toHaveBeenCalled();
  });

  it('does not run global shortcuts after an editor shortcut has handled the event', async () => {
    const toggleDrawer = vi.fn();
    useUIStore.setState({ toggleDrawer });

    renderHook(() => useShortcuts());

    const event = new KeyboardEvent('keydown', {
      key: 'd',
      code: 'KeyD',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();

    window.dispatchEvent(event);
    await Promise.resolve();

    expect(toggleDrawer).not.toHaveBeenCalled();
  });

  it('adjusts the appearance font size with Ctrl+wheel', () => {
    useUIStore.setState({ fontSize: 17 });

    renderHook(() => useShortcuts());

    vi.useFakeTimers();
    try {
      const zoomInEvent = new WheelEvent('wheel', {
        ctrlKey: true,
        deltaY: -80,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        window.dispatchEvent(zoomInEvent);
      });

      expect(zoomInEvent.defaultPrevented).toBe(true);
      expect(useUIStore.getState().fontSize).toBe(18);
      expect(localStorage.getItem('fontSize')).toBeNull();

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(localStorage.getItem('fontSize')).toBe('18');

      const zoomOutEvent = new WheelEvent('wheel', {
        ctrlKey: true,
        deltaY: 80,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        window.dispatchEvent(zoomOutEvent);
      });

      expect(zoomOutEvent.defaultPrevented).toBe(true);
      expect(useUIStore.getState().fontSize).toBe(17);
      expect(localStorage.getItem('fontSize')).toBe('18');

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(localStorage.getItem('fontSize')).toBe('17');

      const normalWheelEvent = new WheelEvent('wheel', {
        deltaY: -80,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        window.dispatchEvent(normalWheelEvent);
      });

      expect(normalWheelEvent.defaultPrevented).toBe(false);
      expect(useUIStore.getState().fontSize).toBe(17);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not adjust the appearance font size for Ctrl+wheel inside a dialog', () => {
    useUIStore.setState({ fontSize: 17 });
    renderHook(() => useShortcuts());

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const target = document.createElement('div');
    dialog.appendChild(target);
    document.body.appendChild(dialog);

    const event = new WheelEvent('wheel', {
      ctrlKey: true,
      deltaY: -80,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      target.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(useUIStore.getState().fontSize).toBe(17);
    dialog.remove();
  });

  it('creates a notes draft with Ctrl+Shift+T and leaves Ctrl+T free', async () => {
    const createNote = vi.fn().mockResolvedValue('draft:test');
    useNotesStore.setState({
      createNote,
      currentNote: { path: 'docs/current.md', content: '# current' },
      draftNotes: {},
    });

    renderHook(() => useShortcuts());

    const oldEvent = new KeyboardEvent('keydown', {
      key: 't',
      code: 'KeyT',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(oldEvent);
    await Promise.resolve();

    expect(oldEvent.defaultPrevented).toBe(false);
    expect(createNote).not.toHaveBeenCalled();

    const newEvent = new KeyboardEvent('keydown', {
      key: 'T',
      code: 'KeyT',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(newEvent);
    await Promise.resolve();

    expect(newEvent.defaultPrevented).toBe(true);
    expect(createNote).toHaveBeenCalledWith('docs', { asDraft: true });
  });

  it('keeps user-configured copy shortcuts from stealing editable copy', async () => {
    localStorage.setItem('vlaina-shortcuts', JSON.stringify([
      { id: 'toggleDrawer', keys: ['Ctrl', 'C'] },
    ]));
    const toggleDrawer = vi.fn();
    useUIStore.setState({ toggleDrawer });

    try {
      renderHook(() => useShortcuts());

      const editor = document.createElement('div');
      editor.className = 'ProseMirror';
      editor.setAttribute('contenteditable', 'true');
      document.body.appendChild(editor);

      const event = new KeyboardEvent('keydown', {
        key: 'c',
        code: 'KeyC',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      editor.dispatchEvent(event);
      await Promise.resolve();

      expect(event.defaultPrevented).toBe(false);
      expect(toggleDrawer).not.toHaveBeenCalled();
    } finally {
      document.querySelector('.ProseMirror')?.remove();
    }
  });

  it('does not dispatch in-note find outside notes mode', () => {
    useUIStore.setState({ appViewMode: 'chat' });
    const editorFindListener = vi.fn();
    window.addEventListener(EDITOR_FIND_OPEN_EVENT, editorFindListener);

    try {
      renderHook(() => useShortcuts());

      const event = new KeyboardEvent('keydown', {
        key: 'f',
        code: 'KeyF',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(editorFindListener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(EDITOR_FIND_OPEN_EVENT, editorFindListener);
    }
  });
});
