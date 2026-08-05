import { act, renderHook, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_NOTE_MENTION_SCAN_ITEMS,
  MAX_NOTE_MENTION_TITLE_CHARS,
} from '@/lib/ai/noteMentions';
import { MAX_CHAT_COMPOSER_INTERACTIVE_TEXT_CHARS } from '@/lib/ui/composerTextLimit';
import { useNoteMentionState } from './useNoteMentionState';
import { useNoteMentions } from './useNoteMentions';

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

function renderMentions(initialMessage: string) {
  return renderHook(() => {
    const [message, setMessage] = useState(initialMessage);
    const textareaRef = useRef<HTMLTextAreaElement>(document.createElement('textarea'));
    const controller = useNoteMentions({
      message,
      textareaRef,
      handleMessageChange: setMessage,
    });

    return { ...controller, message };
  });
}

describe('useNoteMentions folder candidates', () => {
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

  it('shows folders alongside note candidates for a bare mention trigger', () => {
    const { result } = renderMentions('@');

    act(() => {
      result.current.handleCaretChange(1);
    });

    expect(result.current.showMentionPicker).toBe(true);
    expect(result.current.currentPageCandidates.map((item) => item.title)).toEqual(['Today']);
    expect(result.current.currentPageCandidates[0]?.icon).toBe('✨');
    expect(result.current.folderCandidates.map((item) => item.title)).toEqual(['Projects/']);
    expect(result.current.linkedPageCandidates.map((item) => item.title)).toEqual([
      'Archive',
      'Plan',
      'Tomorrow',
    ]);
  });

  it('includes folders as mention candidates', () => {
    const { result } = renderMentions('@Proj');

    act(() => {
      result.current.handleCaretChange(5);
    });

    expect(result.current.showMentionPicker).toBe(true);
    expect(result.current.folderCandidates).toMatchObject([
      {
        path: 'Projects',
        title: 'Projects/',
        kind: 'folder',
      },
    ]);
  });

  it('restores typed folder mention text into a real mention reference', () => {
    const { result } = renderMentions('@Projects/ ');

    expect(result.current.noteMentions).toEqual([
      { path: 'Projects', title: 'Projects/', kind: 'folder' },
    ]);
    expect(result.current.mentionPreviewParts.some((part) =>
      part.type === 'mention' && part.mention?.kind === 'folder'
    )).toBe(true);
  });

  it('updates an existing mention when sync resolves its folder kind', async () => {
    const textarea = document.createElement('textarea');

    const { result, rerender } = renderHook(({ kind }: { kind: 'folder' | undefined }) => {
      const [message, setMessage] = useState('@Projects/ ');
      const textareaRef = useRef<HTMLTextAreaElement>(textarea);
      return useNoteMentionState({
        value: message,
        onValueChange: setMessage,
        textareaRef,
        syncMentions: ({ value }) =>
          value.includes('@Projects/')
            ? [{ path: 'Projects', title: 'Projects/', kind }]
            : [],
      });
    }, {
      initialProps: { kind: undefined as 'folder' | undefined },
    });

    await waitFor(() => {
      expect(result.current.mentions).toEqual([
        { path: 'Projects', title: 'Projects/', kind: undefined },
      ]);
    });

    rerender({ kind: 'folder' });

    await waitFor(() => {
      expect(result.current.mentions).toEqual([
        { path: 'Projects', title: 'Projects/', kind: 'folder' },
      ]);
    });
  });

  it('skips automatic mention work for oversized drafts but synchronizes on demand', () => {
    const oversizedValue = `@Projects/ ${'x'.repeat(MAX_CHAT_COMPOSER_INTERACTIVE_TEXT_CHARS)}`;
    const syncMentions = vi.fn(({ value }: { value: string }) => (
      value.includes('@Projects/')
        ? [{ path: 'Projects', title: 'Projects/', kind: 'folder' as const }]
        : []
    ));
    const textarea = document.createElement('textarea');
    const { result } = renderHook(() => {
      const textareaRef = useRef<HTMLTextAreaElement>(textarea);
      return useNoteMentionState({
        value: oversizedValue,
        onValueChange: vi.fn(),
        textareaRef,
        syncMentions,
      });
    });

    act(() => {
      result.current.restoreMentions([
        { path: 'Projects', title: 'Projects/', kind: 'folder' },
      ]);
    });

    expect(syncMentions).not.toHaveBeenCalled();
    expect(result.current.mentions).toEqual([
      { path: 'Projects', title: 'Projects/', kind: 'folder' },
    ]);
    expect(result.current.mentionPreviewParts).toEqual([]);

    let synchronizedMentions: ReturnType<typeof result.current.getSynchronizedMentions> = [];
    act(() => {
      synchronizedMentions = result.current.getSynchronizedMentions();
    });

    expect(syncMentions).toHaveBeenCalledOnce();
    expect(syncMentions).toHaveBeenCalledWith(expect.objectContaining({ value: oversizedValue }));
    expect(synchronizedMentions).toEqual([
      { path: 'Projects', title: 'Projects/', kind: 'folder' },
    ]);
  });

  it('keeps a dragged folder mention scoped to its exact path when folder names collide', async () => {
    hoisted.storeRef.state = {
      ...hoisted.storeRef.state,
      rootFolder: {
        children: [
          {
            isFolder: true,
            name: 'assets',
            path: 'assets',
            children: [],
          },
          {
            isFolder: true,
            name: 'docs',
            path: 'docs',
            children: [
              {
                isFolder: true,
                name: 'assets',
                path: 'docs/assets',
                children: [],
              },
            ],
          },
        ],
      },
    };
    const { result } = renderMentions('');

    act(() => {
      result.current.appendNoteMentions([
        { path: 'docs/assets', title: 'assets/', kind: 'folder' },
        { path: 'docs/plain.txt', title: 'Text', kind: 'note' },
        { path: 'file:///tmp/secret.md', title: 'File URL', kind: 'note' },
        { path: 'docs/.vlaina/config.md', title: 'Internal', kind: 'note' },
      ]);
    });

    await waitFor(() => {
      expect(result.current.noteMentions).toEqual([
        { path: 'docs/assets', title: 'assets/', kind: 'folder' },
      ]);
    });
  });

  it('ignores malformed restored mentions without dropping valid recalled mentions', async () => {
    const textarea = document.createElement('textarea');
    const { result } = renderHook(() => {
      const [message, setMessage] = useState('');
      const textareaRef = useRef<HTMLTextAreaElement>(textarea);
      return useNoteMentionState({
        value: message,
        onValueChange: setMessage,
        textareaRef,
        syncMentions: ({ mentions }) => mentions,
      });
    });

    act(() => {
      result.current.restoreMentions([
        { path: null, title: 'Broken' } as any,
        { path: ' docs/alpha.md ', title: null } as any,
        { path: 'docs/plain.txt', title: 'Text', kind: 'note' },
        { path: 'https://example.com/secret.md', title: 'Remote' },
        { path: 'docs/.vlaina/config.md', title: 'Internal' },
        { path: 'assets', title: 'assets/', kind: 'folder' },
        { path: 'docs/beta.md', title: ' Beta ' },
      ]);
    });

    await waitFor(() => {
      expect(result.current.mentions).toEqual([
        { path: 'docs/alpha.md', title: 'docs/alpha.md', kind: 'note' },
        { path: 'assets', title: 'assets/', kind: 'folder' },
        { path: 'docs/beta.md', title: 'Beta', kind: 'note' },
      ]);
    });
  });

  it('bounds restored mention state before preview rendering', async () => {
    const textarea = document.createElement('textarea');
    const { result } = renderHook(() => {
      const [message, setMessage] = useState('');
      const textareaRef = useRef<HTMLTextAreaElement>(textarea);
      return useNoteMentionState({
        value: message,
        onValueChange: setMessage,
        textareaRef,
        syncMentions: ({ mentions }) => mentions,
      });
    });

    act(() => {
      result.current.restoreMentions([
        ...Array.from({ length: MAX_NOTE_MENTION_SCAN_ITEMS }, (_value, index) => ({
          path: `docs/${index}.md`,
          title: index === 0 ? 'x'.repeat(MAX_NOTE_MENTION_TITLE_CHARS + 1) : `Note ${index}`,
          kind: 'note' as const,
        })),
        { path: 'docs/after-budget.md', title: 'AfterBudget', kind: 'note' },
      ]);
    });

    await waitFor(() => {
      expect(result.current.mentions).toHaveLength(MAX_NOTE_MENTION_SCAN_ITEMS);
      expect(result.current.mentions[0]?.title).toHaveLength(MAX_NOTE_MENTION_TITLE_CHARS);
      expect(result.current.mentions.some((mention) => mention.path === 'docs/after-budget.md')).toBe(false);
    });
  });

  it('bounds appended mention state and inserted labels', async () => {
    const textarea = document.createElement('textarea');
    const { result } = renderHook(() => {
      const [message, setMessage] = useState('');
      const textareaRef = useRef<HTMLTextAreaElement>(textarea);
      return {
        message,
        ...useNoteMentionState({
          value: message,
          onValueChange: setMessage,
          textareaRef,
          syncMentions: ({ mentions }) => mentions,
        }),
      };
    });

    act(() => {
      result.current.appendMentions([
        ...Array.from({ length: MAX_NOTE_MENTION_SCAN_ITEMS }, (_value, index) => ({
          path: `docs/${index}.md`,
          title: index === 0 ? 'y'.repeat(MAX_NOTE_MENTION_TITLE_CHARS + 1) : `Note ${index}`,
          kind: 'note' as const,
        })),
        { path: 'docs/after-budget.md', title: 'AfterBudget', kind: 'note' },
      ]);
    });

    await waitFor(() => {
      expect(result.current.mentions).toHaveLength(MAX_NOTE_MENTION_SCAN_ITEMS);
      expect(result.current.mentions[0]?.title).toHaveLength(MAX_NOTE_MENTION_TITLE_CHARS);
      expect(result.current.message).toContain(`@${'y'.repeat(MAX_NOTE_MENTION_TITLE_CHARS)}`);
      expect(result.current.message).not.toContain('AfterBudget');
    });
  });

  it('does not restore ambiguous typed folder mentions with duplicate titles', async () => {
    hoisted.storeRef.state = {
      ...hoisted.storeRef.state,
      rootFolder: {
        children: [
          {
            isFolder: true,
            name: 'assets',
            path: 'assets',
            children: [],
          },
          {
            isFolder: true,
            name: 'docs',
            path: 'docs',
            children: [
              {
                isFolder: true,
                name: 'assets',
                path: 'docs/assets',
                children: [],
              },
            ],
          },
        ],
      },
    };
    const { result } = renderMentions('@assets/ ');

    await waitFor(() => {
      expect(result.current.noteMentions).toEqual([]);
    });
  });

  it('keeps folder candidates visible when many files match first', () => {
    hoisted.storeRef.state = {
      ...hoisted.storeRef.state,
      rootFolder: {
        children: [
          ...Array.from({ length: 36 }, (_, index) => ({
            isFolder: false,
            path: `Match-${String(index).padStart(2, '0')}.md`,
          })),
          {
            isFolder: true,
            name: 'Match Folder',
            path: 'Match Folder',
            children: [],
          },
        ],
      },
      currentNote: null,
    };

    const { result } = renderMentions('@Match');

    act(() => {
      result.current.handleCaretChange(6);
    });

    expect(result.current.linkedPageCandidates).toHaveLength(30);
    expect(result.current.folderCandidates.map((item) => item.title)).toEqual(['Match Folder/']);
  });
});
