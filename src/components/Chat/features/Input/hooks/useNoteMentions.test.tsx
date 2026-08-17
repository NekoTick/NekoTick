import { act, renderHook } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNoteMentions } from './useNoteMentions';
import { useNoteMentionState } from './useNoteMentionState';

const hoisted = vi.hoisted(() => {
  const loadFileTree = vi.fn();
  const storeRef: { state: any } = { state: null };
  const notesRootStoreRef: { state: any } = { state: null };
  let currentNotesRootPath: string | null = '/notesRoot';

  const useNotesStore = ((selector?: (state: any) => any) => {
    return selector ? selector(storeRef.state) : storeRef.state;
  }) as any;
  useNotesStore.getState = () => storeRef.state;

  const useNotesRootStore = ((selector?: (state: any) => any) => {
    return selector ? selector(notesRootStoreRef.state) : notesRootStoreRef.state;
  }) as any;
  useNotesRootStore.getState = () => notesRootStoreRef.state;

  return {
    loadFileTree,
    storeRef,
    useNotesStore,
    notesRootStoreRef,
    useNotesRootStore,
    getCurrentNotesRootPath: vi.fn(() => currentNotesRootPath),
    setCurrentNotesRootPath: vi.fn((path: string | null) => {
      currentNotesRootPath = path;
    }),
    resetCurrentNotesRootPath: (path: string | null) => {
      currentNotesRootPath = path;
    },
  };
});

vi.mock('@/stores/notes/useNotesStore', () => ({
  useNotesStore: hoisted.useNotesStore,
}));

vi.mock('@/stores/useNotesRootStore', () => ({
  useNotesRootStore: hoisted.useNotesRootStore,
}));

vi.mock('@/stores/notes/storage', () => ({
  getCurrentNotesRootPath: hoisted.getCurrentNotesRootPath,
  setCurrentNotesRootPath: hoisted.setCurrentNotesRootPath,
}));

describe('useNoteMentions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    hoisted.loadFileTree.mockReset();
    hoisted.getCurrentNotesRootPath.mockClear();
    hoisted.setCurrentNotesRootPath.mockClear();
    hoisted.resetCurrentNotesRootPath('/notesRoot');
    hoisted.notesRootStoreRef.state = {
      currentNotesRoot: { path: '/notesRoot' },
    };
    hoisted.storeRef.state = {
      rootFolder: {
        children: [
          { isFolder: false, path: 'Today.md' },
          {
            isFolder: true,
            name: 'Projects',
            path: 'Projects',
            children: [
              { isFolder: false, path: 'Projects/Plan.md' },
            ],
          },
          { isFolder: false, path: 'Tomorrow.md' },
          { isFolder: false, path: 'Archive.md' },
        ],
      },
      currentNote: { path: 'Today.md' },
      notesPath: '/notesRoot',
      starredEntries: [],
      isLoading: false,
      loadFileTree: hoisted.loadFileTree,
      getDisplayName: (path: string) => (
        path.split('/').pop()?.replace(/\.md$/, '') ?? path.replace(/\.md$/, '')
      ),
      getNoteIcon: (path: string) => (path === 'Today.md' ? '✨' : undefined),
    };

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  it('surfaces current-page candidates ahead of linked pages', () => {
    const { result } = renderHook(() => {
      const [message, setMessage] = useState('@To');
      const textareaRef = useRef<HTMLTextAreaElement>(document.createElement('textarea'));
      const controller = useNoteMentions({
        message,
        textareaRef,
        handleMessageChange: setMessage,
      });

      return { ...controller, message };
    });

    act(() => {
      result.current.handleCaretChange(3);
    });

    expect(result.current.showMentionPicker).toBe(true);
    expect(result.current.currentPageCandidates.map((item) => item.title)).toEqual(['Today']);
    expect(result.current.folderCandidates.map((item) => item.title)).toEqual([]);
    expect(result.current.linkedPageCandidates.map((item) => item.title)).toEqual(['Tomorrow']);
  });

  it('coalesces textarea scroll state updates into one animation frame', () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    const requestAnimationFrameMock = vi.mocked(window.requestAnimationFrame);
    requestAnimationFrameMock.mockImplementation((callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    const textarea = document.createElement('textarea');
    const { result } = renderHook(() => {
      const textareaRef = useRef<HTMLTextAreaElement>(textarea);
      return useNoteMentionState({
        value: '',
        onValueChange: vi.fn(),
        textareaRef,
        syncMentions: ({ mentions }) => mentions,
      });
    });
    requestAnimationFrameMock.mockClear();

    act(() => {
      result.current.setTextareaScrollTop(10);
      result.current.setTextareaScrollTop(20);
      result.current.setTextareaScrollTop(30);
    });

    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);
    expect(result.current.textareaScrollTop).toBe(0);
    act(() => {
      frameCallbacks[0]?.(0);
    });
    expect(result.current.textareaScrollTop).toBe(30);
  });

  it('loads the note tree for mentions even before notesPath is initialized', () => {
    hoisted.storeRef.state = {
      ...hoisted.storeRef.state,
      rootFolder: null,
      notesPath: '',
      isLoading: false,
    };

    const { result } = renderHook(() => {
      const [message, setMessage] = useState('@');
      const textareaRef = useRef<HTMLTextAreaElement>(document.createElement('textarea'));
      const controller = useNoteMentions({
        message,
        textareaRef,
        handleMessageChange: setMessage,
      });

      return { ...controller, message };
    });

    act(() => {
      result.current.handleCaretChange(1);
    });

    expect(result.current.showMentionPicker).toBe(true);
    expect(result.current.mentionPickerStatus).toBe('loading');
    expect(hoisted.loadFileTree).toHaveBeenCalledTimes(1);
  });

  it('ignores note tree load failures while opening mentions', async () => {
    hoisted.loadFileTree.mockRejectedValueOnce(new Error('load failed'));
    hoisted.storeRef.state = {
      ...hoisted.storeRef.state,
      rootFolder: null,
      notesPath: '',
      isLoading: false,
    };

    const { result } = renderHook(() => {
      const [message, setMessage] = useState('@');
      const textareaRef = useRef<HTMLTextAreaElement>(document.createElement('textarea'));
      const controller = useNoteMentions({
        message,
        textareaRef,
        handleMessageChange: setMessage,
      });

      return { ...controller, message };
    });

    act(() => {
      result.current.handleCaretChange(1);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.showMentionPicker).toBe(true);
    expect(result.current.mentionPickerStatus).toBe('loading');
    expect(hoisted.loadFileTree).toHaveBeenCalledTimes(1);
  });

  it('keeps a bare mention trigger quiet when no opened folder is available', () => {
    hoisted.resetCurrentNotesRootPath(null);
    hoisted.notesRootStoreRef.state = {
      currentNotesRoot: null,
    };
    hoisted.storeRef.state = {
      ...hoisted.storeRef.state,
      rootFolder: null,
      notesPath: '',
      isLoading: false,
    };

    const { result } = renderHook(() => {
      const [message, setMessage] = useState('@');
      const textareaRef = useRef<HTMLTextAreaElement>(document.createElement('textarea'));
      const controller = useNoteMentions({
        message,
        textareaRef,
        handleMessageChange: setMessage,
      });

      return { ...controller, message };
    });

    act(() => {
      result.current.handleCaretChange(1);
    });

    expect(result.current.showMentionPicker).toBe(false);
    expect(result.current.mentionPickerStatus).toBeNull();
    expect(hoisted.loadFileTree).not.toHaveBeenCalled();
  });

  it('keeps a bare mention trigger quiet when there are no candidate notes', () => {
    hoisted.storeRef.state = {
      ...hoisted.storeRef.state,
      rootFolder: { children: [] },
    };

    const { result } = renderHook(() => {
      const [message, setMessage] = useState('@');
      const textareaRef = useRef<HTMLTextAreaElement>(document.createElement('textarea'));
      const controller = useNoteMentions({
        message,
        textareaRef,
        handleMessageChange: setMessage,
      });

      return { ...controller, message };
    });

    act(() => {
      result.current.handleCaretChange(1);
    });

    expect(result.current.showMentionPicker).toBe(false);
    expect(result.current.mentionPickerStatus).toBeNull();
  });

  it('hides the mention picker when no notes match', () => {
    const { result } = renderHook(() => {
      const [message, setMessage] = useState('@missing');
      const textareaRef = useRef<HTMLTextAreaElement>(document.createElement('textarea'));
      const controller = useNoteMentions({
        message,
        textareaRef,
        handleMessageChange: setMessage,
      });

      return { ...controller, message };
    });

    act(() => {
      result.current.handleCaretChange(8);
    });

    expect(result.current.showMentionPicker).toBe(false);
    expect(result.current.mentionPickerStatus).toBe('empty');
    expect(result.current.currentPageCandidates).toEqual([]);
    expect(result.current.linkedPageCandidates).toEqual([]);
  });

  it('keeps the mention picker visible when the app window loses focus', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);

    const { result } = renderHook(() => {
      const [message, setMessage] = useState('@');
      const textareaRef = useRef<HTMLTextAreaElement>(document.createElement('textarea'));
      const controller = useNoteMentions({
        message,
        textareaRef,
        handleMessageChange: setMessage,
      });

      return { ...controller, message };
    });

    act(() => {
      result.current.handleCaretChange(1);
    });

    expect(result.current.showMentionPicker).toBe(true);

    act(() => {
      result.current.handleCaretBlur();
    });

    expect(result.current.showMentionPicker).toBe(true);
  });

  it('includes starred notes from other notes-roots as mention candidates', () => {
    hoisted.storeRef.state = {
      ...hoisted.storeRef.state,
      rootFolder: null,
      starredEntries: [
        {
          id: 'starred-external',
          kind: 'note',
          notesRootPath: '/other-notesRoot',
          relativePath: 'refs/External.md',
          addedAt: 1,
        },
      ],
    };

    const { result } = renderHook(() => {
      const [message, setMessage] = useState('@Ext');
      const textareaRef = useRef<HTMLTextAreaElement>(document.createElement('textarea'));
      const controller = useNoteMentions({
        message,
        textareaRef,
        handleMessageChange: setMessage,
      });

      return { ...controller, message };
    });

    act(() => {
      result.current.handleCaretChange(4);
    });

    expect(result.current.showMentionPicker).toBe(true);
    expect(result.current.linkedPageCandidates).toMatchObject([
      {
        path: '/other-notesRoot/refs/External.md',
        title: 'External',
        isCurrent: false,
        notePath: 'refs/External.md',
        notesRootPath: '/other-notesRoot',
      },
    ]);
  });

  it('does not expose stale starred mention candidates inside internal folders', () => {
    hoisted.storeRef.state = {
      ...hoisted.storeRef.state,
      rootFolder: null,
      starredEntries: [
        {
          id: 'starred-dot-note',
          kind: 'note',
          notesRootPath: '/notesRoot',
          relativePath: '.notes/Daily.md',
          addedAt: 1,
        },
        {
          id: 'starred-internal-relative',
          kind: 'note',
          notesRootPath: '/notesRoot',
          relativePath: '.git/config.md',
          addedAt: 2,
        },
        {
          id: 'starred-internal-notesRoot',
          kind: 'note',
          notesRootPath: '/other-notesRoot/.vlaina',
          relativePath: 'workspace.md',
          addedAt: 3,
        },
      ],
    };

    const { result } = renderHook(() => {
      const [message, setMessage] = useState('@');
      const textareaRef = useRef<HTMLTextAreaElement>(document.createElement('textarea'));
      const controller = useNoteMentions({
        message,
        textareaRef,
        handleMessageChange: setMessage,
      });

      return { ...controller, message };
    });

    act(() => {
      result.current.handleCaretChange(1);
    });

    expect(result.current.linkedPageCandidates.map((candidate) => candidate.path)).toEqual([
      '.notes/Daily.md',
    ]);
  });

  it('does not repeatedly reload the note tree for the same mention trigger', () => {
    hoisted.storeRef.state = {
      ...hoisted.storeRef.state,
      rootFolder: null,
      notesPath: '',
      isLoading: false,
    };

    const { result, rerender } = renderHook(() => {
      const [message, setMessage] = useState('@');
      const textareaRef = useRef<HTMLTextAreaElement>(document.createElement('textarea'));
      const controller = useNoteMentions({
        message,
        textareaRef,
        handleMessageChange: setMessage,
      });

      return { ...controller, message };
    });

    act(() => {
      result.current.handleCaretChange(1);
    });

    hoisted.storeRef.state = {
      ...hoisted.storeRef.state,
      isLoading: true,
    };
    rerender();

    hoisted.storeRef.state = {
      ...hoisted.storeRef.state,
      isLoading: false,
    };
    rerender();

    expect(hoisted.loadFileTree).toHaveBeenCalledTimes(1);
    expect(result.current.mentionPickerStatus).toBeNull();
  });

  it('applies the active candidate on Enter', () => {
    const { result } = renderHook(() => {
      const [message, setMessage] = useState('@To');
      const textareaRef = useRef<HTMLTextAreaElement>(document.createElement('textarea'));
      const controller = useNoteMentions({
        message,
        textareaRef,
        handleMessageChange: setMessage,
      });

      return { ...controller, message };
    });

    act(() => {
      result.current.handleCaretChange(3);
    });

    act(() => {
      const handled = result.current.handleMentionKeyDown({
        key: 'Enter',
        shiftKey: false,
        currentTarget: { selectionStart: 3, selectionEnd: 3 },
        preventDefault: vi.fn(),
      } as any);
      expect(handled).toBe(true);
    });

    expect(result.current.message).toBe('@Today ');
    expect(result.current.mentionPreviewParts.some((part) => part.type === 'mention')).toBe(true);
  });

  it('does not apply a mention candidate on composing Enter', () => {
    const preventDefault = vi.fn();
    const { result } = renderHook(() => {
      const [message, setMessage] = useState('@To');
      const textareaRef = useRef<HTMLTextAreaElement>(document.createElement('textarea'));
      const controller = useNoteMentions({
        message,
        textareaRef,
        handleMessageChange: setMessage,
      });

      return { ...controller, message };
    });

    act(() => {
      result.current.handleCaretChange(3);
    });

    act(() => {
      const handled = result.current.handleMentionKeyDown({
        key: 'Enter',
        shiftKey: false,
        nativeEvent: { isComposing: true },
        currentTarget: { selectionStart: 3, selectionEnd: 3 },
        preventDefault,
      } as any);
      expect(handled).toBe(false);
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(result.current.message).toBe('@To');
    expect(result.current.mentionPreviewParts.some((part) => part.type === 'mention')).toBe(false);
  });

  it('removes a mention token on Backspace when the caret is inside it', () => {
    const { result } = renderHook(() => {
      const [message, setMessage] = useState('@To');
      const textareaRef = useRef<HTMLTextAreaElement>(document.createElement('textarea'));
      const controller = useNoteMentions({
        message,
        textareaRef,
        handleMessageChange: setMessage,
      });

      return { ...controller, message };
    });

    act(() => {
      result.current.handleCaretChange(3);
    });

    act(() => {
      result.current.applyMentionCandidate({
        path: 'Today.md',
        title: 'Today',
        kind: 'note',
        isCurrent: true,
      });
    });

    act(() => {
      const handled = result.current.handleMentionKeyDown({
        key: 'Backspace',
        currentTarget: { selectionStart: 2, selectionEnd: 2 },
        preventDefault: vi.fn(),
      } as any);
      expect(handled).toBe(true);
    });

    expect(result.current.message).toBe('');
    expect(result.current.mentionPreviewParts.some((part) => part.type === 'mention')).toBe(false);
  });

  it('removes a mention token on Delete when the caret is inside it', () => {
    const { result } = renderHook(() => {
      const [message, setMessage] = useState('@To');
      const textareaRef = useRef<HTMLTextAreaElement>(document.createElement('textarea'));
      const controller = useNoteMentions({
        message,
        textareaRef,
        handleMessageChange: setMessage,
      });

      return { ...controller, message };
    });

    act(() => {
      result.current.handleCaretChange(3);
    });

    act(() => {
      result.current.applyMentionCandidate({
        path: 'Today.md',
        title: 'Today',
        kind: 'note',
        isCurrent: true,
      });
    });

    act(() => {
      const handled = result.current.handleMentionKeyDown({
        key: 'Delete',
        currentTarget: { selectionStart: 2, selectionEnd: 2 },
        preventDefault: vi.fn(),
      } as any);
      expect(handled).toBe(true);
    });

    expect(result.current.message).toBe('');
    expect(result.current.mentionPreviewParts.some((part) => part.type === 'mention')).toBe(false);
  });

  it('keeps the caret outside a mention token when the caret moves inside it', () => {
    const textarea = document.createElement('textarea');
    const { result } = renderHook(() => {
      const [message, setMessage] = useState('@To');
      const textareaRef = useRef<HTMLTextAreaElement>(textarea);
      const controller = useNoteMentions({
        message,
        textareaRef,
        handleMessageChange: setMessage,
      });

      return { ...controller, message };
    });

    act(() => {
      result.current.handleCaretChange(3);
    });

    act(() => {
      result.current.applyMentionCandidate({
        path: 'Today.md',
        title: 'Today',
        kind: 'note',
        isCurrent: true,
      });
    });

    textarea.value = result.current.message;

    act(() => {
      result.current.handleCaretChange(2);
    });

    expect(result.current.message).toBe('@Today ');
    expect(result.current.showMentionPicker).toBe(false);
    expect(textarea.selectionStart).toBe(7);
    expect(textarea.selectionEnd).toBe(7);
  });

  it('jumps over mention tokens with horizontal arrow keys', () => {
    const textarea = document.createElement('textarea');
    const { result } = renderHook(() => {
      const [message, setMessage] = useState('@To');
      const textareaRef = useRef<HTMLTextAreaElement>(textarea);
      const controller = useNoteMentions({
        message,
        textareaRef,
        handleMessageChange: setMessage,
      });

      return { ...controller, message };
    });

    act(() => {
      result.current.handleCaretChange(3);
    });

    act(() => {
      result.current.applyMentionCandidate({
        path: 'Today.md',
        title: 'Today',
        kind: 'note',
        isCurrent: true,
      });
    });

    textarea.value = result.current.message;
    textarea.setSelectionRange(7, 7);

    act(() => {
      const handled = result.current.handleMentionKeyDown({
        key: 'ArrowLeft',
        currentTarget: textarea,
        preventDefault: vi.fn(),
      } as any);
      expect(handled).toBe(true);
    });

    expect(textarea.selectionStart).toBe(0);
    expect(textarea.selectionEnd).toBe(0);

    act(() => {
      const handled = result.current.handleMentionKeyDown({
        key: 'ArrowRight',
        currentTarget: textarea,
        preventDefault: vi.fn(),
      } as any);
      expect(handled).toBe(true);
    });

    expect(textarea.selectionStart).toBe(7);
    expect(textarea.selectionEnd).toBe(7);
  });

  it('does not intercept modified horizontal arrow keys', () => {
    const textarea = document.createElement('textarea');
    const { result } = renderHook(() => {
      const [message, setMessage] = useState('@To');
      const textareaRef = useRef<HTMLTextAreaElement>(textarea);
      const controller = useNoteMentions({
        message,
        textareaRef,
        handleMessageChange: setMessage,
      });

      return { ...controller, message };
    });

    act(() => {
      result.current.handleCaretChange(3);
    });

    act(() => {
      result.current.applyMentionCandidate({
        path: 'Today.md',
        title: 'Today',
        kind: 'note',
        isCurrent: true,
      });
    });

    textarea.value = result.current.message;
    textarea.setSelectionRange(7, 7);

    const preventDefault = vi.fn();
    act(() => {
      const handled = result.current.handleMentionKeyDown({
        key: 'ArrowLeft',
        shiftKey: true,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        currentTarget: textarea,
        preventDefault,
      } as any);
      expect(handled).toBe(false);
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(textarea.selectionStart).toBe(7);
    expect(textarea.selectionEnd).toBe(7);
  });

  it('moves the active mention candidate with arrow keys', () => {
    const { result } = renderHook(() => {
      const [message, setMessage] = useState('@');
      const textareaRef = useRef<HTMLTextAreaElement>(document.createElement('textarea'));
      const controller = useNoteMentions({
        message,
        textareaRef,
        handleMessageChange: setMessage,
      });

      return { ...controller, message };
    });

    act(() => {
      result.current.handleCaretChange(1);
    });

    expect(result.current.activeCandidatePath).toBe('Today.md');

    act(() => {
      const handled = result.current.handleMentionKeyDown({
        key: 'ArrowDown',
        currentTarget: { selectionStart: 1, selectionEnd: 1 },
        preventDefault: vi.fn(),
      } as any);
      expect(handled).toBe(true);
    });

    expect(result.current.activeCandidatePath).toBe('Archive.md');

    act(() => {
      const handled = result.current.handleMentionKeyDown({
        key: 'Enter',
        shiftKey: false,
        currentTarget: { selectionStart: 1, selectionEnd: 1 },
        preventDefault: vi.fn(),
      } as any);
      expect(handled).toBe(true);
    });

    expect(result.current.message).toBe('@Archive ');
    expect(result.current.noteMentions).toEqual([
      { path: 'Archive.md', title: 'Archive', kind: 'note' },
    ]);
  });

  it('removes a mention token on Backspace from its trailing insertion space', () => {
    const { result } = renderHook(() => {
      const [message, setMessage] = useState('@To');
      const textareaRef = useRef<HTMLTextAreaElement>(document.createElement('textarea'));
      const controller = useNoteMentions({
        message,
        textareaRef,
        handleMessageChange: setMessage,
      });

      return { ...controller, message };
    });

    act(() => {
      result.current.handleCaretChange(3);
    });

    act(() => {
      result.current.applyMentionCandidate({
        path: 'Today.md',
        title: 'Today',
        kind: 'note',
        isCurrent: true,
      });
    });

    expect(result.current.message).toBe('@Today ');

    act(() => {
      const handled = result.current.handleMentionKeyDown({
        key: 'Backspace',
        currentTarget: { selectionStart: 7, selectionEnd: 7 },
        preventDefault: vi.fn(),
      } as any);
      expect(handled).toBe(true);
    });

    expect(result.current.message).toBe('');
    expect(result.current.showMentionPicker).toBe(false);
    expect(result.current.mentionPreviewParts.some((part) => part.type === 'mention')).toBe(false);
  });
});
