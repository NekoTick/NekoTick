import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearDiagnosticsLog,
  getDiagnosticsLogText,
} from '@/lib/diagnostics/diagnosticsLog';
import { MarkdownEditor } from './MarkdownEditor';
import { MarkdownSourceEditor } from './MarkdownSourceEditor';

type MockNotesState = {
  currentNote: { path: string; content: string } | null;
  currentNoteRevision: number;
  currentNoteDiskRevision: number;
  noteContentsCache: Map<string, { content: string; modifiedAt?: number | null }>;
  displayNames: Map<string, string>;
  openTabs: Array<{ path: string; name: string; isDirty: boolean }>;
  draftNotes: Record<string, { parentPath: string | null; name: string }>;
  noteMetadata: { notes: Record<string, Record<string, unknown>> } | null;
  notesPath: string;
  starredEntries: Array<{
    id: string;
    kind: 'note' | 'folder';
    notesRootPath: string;
    relativePath: string;
    addedAt: number;
  }>;
  isStarred: (path: string) => boolean;
  toggleStarred: ReturnType<typeof vi.fn>;
  uploadAsset: ReturnType<typeof vi.fn>;
  saveNote: ReturnType<typeof vi.fn<(options?: { explicit?: boolean }) => Promise<void>>>;
  getDisplayName: (path: string) => string;
  updateContent: (content: string) => void;
  isDirty: boolean;
};

const mocks = vi.hoisted(() => {
  const notesStoreListeners = new Set<() => void>();
  const notifyNotesStoreListeners = () => {
    for (const listener of notesStoreListeners) {
      listener();
    }
  };

  const notesState: MockNotesState = {
    currentNote: { path: 'alpha.md', content: '# Alpha\n\nInitial body' },
    currentNoteRevision: 0,
    currentNoteDiskRevision: 0,
    noteContentsCache: new Map(),
    displayNames: new Map([['alpha.md', 'alpha.md']]),
    openTabs: [{ path: 'alpha.md', name: 'alpha.md', isDirty: false }],
    draftNotes: {},
    noteMetadata: null,
    notesPath: '/notesRoot',
    starredEntries: [],
    isStarred: () => false,
    toggleStarred: vi.fn(),
    uploadAsset: vi.fn(),
    saveNote: vi.fn<(options?: { explicit?: boolean }) => Promise<void>>().mockResolvedValue(undefined),
    getDisplayName: (path: string) => path,
    updateContent: (content: string) => {
      if (notesState.currentNote) {
        notesState.currentNote = { ...notesState.currentNote, content };
      }
      notesState.isDirty = true;
    },
    isDirty: false,
  };

  return {
    notesStoreListeners,
    notifyNotesStoreListeners,
    notesState,
    milkdownRuntimeMode: {
      value: 'throw' as
        | 'throw'
        | 'never-ready'
        | 'live-dom-never-ready'
        | 'sync-failure'
        | 'creation-failure'
        | 'activation-failure',
    },
  };
});

vi.mock('@/stores/useNotesStore', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const subscribe = (listener: () => void) => {
    mocks.notesStoreListeners.add(listener);
    return () => {
      mocks.notesStoreListeners.delete(listener);
    };
  };

  return {
    useNotesStore: Object.assign(
      (selector: (state: MockNotesState) => unknown) => React.useSyncExternalStore(
        subscribe,
        () => selector(mocks.notesState),
        () => selector(mocks.notesState),
      ),
      {
        getState: () => mocks.notesState,
        subscribe,
        setState: (updater: Partial<MockNotesState> | ((state: MockNotesState) => Partial<MockNotesState>)) => {
          const patch = typeof updater === 'function' ? updater(mocks.notesState) : updater;
          Object.assign(mocks.notesState, patch);
          mocks.notifyNotesStoreListeners();
        },
      },
    ),
  };
});

vi.mock('@/stores/unified/useUnifiedStore', () => ({
  useUnifiedStore: (selector: (state: { data: { settings: { markdown: { body: { showLineNumbers: boolean } } } } }) => unknown) =>
    selector({ data: { settings: { markdown: { body: { showLineNumbers: false } } } } }),
}));

vi.mock('@/stores/uiSlice', () => ({
  useUIStore: Object.assign(
    (selector: (state: { notesPreviewTitle: null; universalPreviewTarget: null; universalPreviewIcon: undefined }) => unknown) =>
      selector({
        notesPreviewTitle: null,
        universalPreviewTarget: null,
        universalPreviewIcon: undefined,
      }),
    {
      getState: () => ({
        notesPreviewTitle: null,
        universalPreviewTarget: null,
        universalPreviewIcon: undefined,
      }),
      subscribe: () => () => {},
    },
  ),
}));

vi.mock('@/components/ui/overlay-scroll-area', async () => {
  const React = await import('react');
  return {
    OverlayScrollArea: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
      ({
        children,
        viewportClassName: _viewportClassName,
        draggingBodyClassName: _draggingBodyClassName,
        preserveWheelIntentKey: _preserveWheelIntentKey,
        scrollbarVariant: _scrollbarVariant,
        ...props
      }: React.HTMLAttributes<HTMLDivElement> & {
        viewportClassName?: string;
        draggingBodyClassName?: string;
        preserveWheelIntentKey?: string;
        scrollbarVariant?: string;
      }, ref) => (
        <div ref={ref} {...props}>
          {children}
        </div>
      ),
    ),
  };
});

vi.mock('./EditorTopRightToolbar', () => ({
  EditorTopRightToolbar: ({
    currentNotePath,
    isSourceMode,
    onToggleSourceMode,
    showOutline,
    starred,
    toggleStarred,
  }: {
    currentNotePath?: string | null;
    isSourceMode?: boolean;
    onToggleSourceMode?: () => void;
    showOutline?: boolean;
    starred: boolean;
    toggleStarred: (path: string) => void;
  }) => (
    <>
      <span data-testid="outline-visibility">{showOutline ? 'visible' : 'hidden'}</span>
      <button
        type="button"
        aria-label={starred ? 'Unfavorite' : 'Add to Starred'}
        onClick={() => {
          if (currentNotePath) {
            toggleStarred(currentNotePath);
          }
        }}
      >
        {starred ? 'Unfavorite' : 'Add to Starred'}
      </button>
      {onToggleSourceMode ? (
        <button type="button" onClick={onToggleSourceMode}>
          {isSourceMode ? 'Switch to rendered mode' : 'Switch to source mode'}
        </button>
      ) : null}
    </>
  ),
}));

vi.mock('./NoteHeader', () => ({
  NoteHeader: () => <textarea aria-label="Note title" data-note-title-input="true" />,
}));

vi.mock('../Cover', () => ({
  CoverAddOverlay: () => null,
  NoteCoverCanvas: () => null,
  useNoteCoverController: () => ({
    cover: {
      url: null,
      positionX: 50,
      positionY: 50,
      height: undefined,
      scale: 1,
    },
    isPickerOpen: false,
    openCoverPicker: vi.fn(),
  }),
}));

vi.mock('@/hooks/useHeldPageScroll', () => ({
  useHeldPageScroll: vi.fn(),
}));

vi.mock('../Sidebar/sidebarSearchNavigation', () => ({
  getSidebarSearchNavigationPendingPath: () => null,
  isSidebarSearchNavigationPending: () => false,
  subscribeSidebarSearchNavigationPending: () => () => {},
}));

vi.mock('./find/useNoteEditorFind', () => ({
  useNoteEditorFind: () => ({
    query: '',
    setQuery: vi.fn(),
    isOpen: false,
    setOpen: vi.fn(),
    close: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    matchIndex: 0,
    matchCount: 0,
  }),
}));

vi.mock('./MilkdownEditorInner', () => ({
  MilkdownEditorRuntime: ({
    onEditorActivationFailure,
    onEditorContentSyncFailure,
    onEditorCreationFailure,
  }: {
    onEditorActivationFailure?: (error: unknown) => void;
    onEditorContentSyncFailure?: (error?: unknown) => void;
    onEditorCreationFailure?: (error: unknown) => void;
  }) => {
    useEffect(() => {
      if (mocks.milkdownRuntimeMode.value === 'sync-failure') {
        onEditorContentSyncFailure?.(new Error('Editor content synchronization failed'));
      }
      if (mocks.milkdownRuntimeMode.value === 'creation-failure') {
        onEditorCreationFailure?.(new Error('Editor creation failed'));
      }
      if (mocks.milkdownRuntimeMode.value === 'activation-failure') {
        onEditorActivationFailure?.(new Error('Editor activation failed'));
      }
    }, [onEditorActivationFailure, onEditorContentSyncFailure, onEditorCreationFailure]);

    if (mocks.milkdownRuntimeMode.value === 'throw') {
      throw new Error('Milkdown failed to create');
    }

    if (mocks.milkdownRuntimeMode.value === 'live-dom-never-ready') {
      return (
        <div className="milkdown">
          <div className="ProseMirror" data-testid="milkdown-live-dom" />
        </div>
      );
    }

    return <div data-testid="milkdown-never-ready" />;
  },
}));

describe('MarkdownEditor source fallback', () => {
  beforeEach(() => {
    clearDiagnosticsLog();
    delete (window as Window & { vlainaDesktop?: unknown }).vlainaDesktop;
    mocks.notesState.currentNote = { path: 'alpha.md', content: '# Alpha\n\nInitial body' };
    mocks.notesState.currentNoteRevision = 0;
    mocks.notesState.currentNoteDiskRevision = 0;
    mocks.notesState.noteContentsCache = new Map();
    mocks.notesState.displayNames = new Map([['alpha.md', 'alpha.md']]);
    mocks.notesState.openTabs = [{ path: 'alpha.md', name: 'alpha.md', isDirty: false }];
    mocks.notesState.draftNotes = {};
    mocks.notesState.noteMetadata = null;
    mocks.notesState.notesPath = '/notesRoot';
    mocks.notesState.starredEntries = [];
    mocks.notesState.isDirty = false;
    mocks.notesState.toggleStarred.mockClear();
    mocks.notesState.uploadAsset.mockReset();
    mocks.notesState.saveNote.mockClear();
    mocks.milkdownRuntimeMode.value = 'throw';
  });

  afterEach(() => {
    vi.useRealTimers();
    clearDiagnosticsLog();
    delete (window as Window & { vlainaDesktop?: unknown }).vlainaDesktop;
  });

  it('uses the configured markdown font size in source mode', () => {
    render(
      <MarkdownSourceEditor
        currentNotePath="alpha.md"
        showBodyLineNumbers={false}
        saveNote={mocks.notesState.saveNote}
        mode="source"
      />,
    );

    const sourceEditor = screen.getByLabelText('Markdown source editor');
    expect(sourceEditor).toHaveClass('text-[length:var(--vlaina-markdown-font-body-size)]');
    expect(sourceEditor).toHaveClass('leading-[var(--vlaina-markdown-line-height-body)]');
    expect(sourceEditor).toHaveAttribute('data-native-caret-overlay-disabled', 'true');
    expect(sourceEditor.closest('[data-vlaina-markdown-font-size-surface="true"]')).toBeInstanceOf(HTMLElement);
  });

  it('centers the body layout container with the note header at wide widths', async () => {
    render(<MarkdownEditor />);

    const sourceRoot = (await screen.findByLabelText('Markdown source editor'))
      .closest('[data-note-content-root="true"]');

    expect(sourceRoot?.parentElement).toHaveClass('flex', 'flex-col', 'items-center');
    expect(sourceRoot?.parentElement?.parentElement).toHaveClass(
      'translate-x-[var(--vlaina-window-resize-content-compensation-x)]',
    );
  });

  it('focuses the source textarea when source mode opens', () => {
    render(
      <MarkdownSourceEditor
        currentNotePath="alpha.md"
        showBodyLineNumbers={false}
        saveNote={mocks.notesState.saveNote}
        mode="source"
      />,
    );

    expect(document.activeElement).toBe(screen.getByLabelText('Markdown source editor'));
  });

  it('focuses the open note at its initial position when returning to notes', async () => {
    const { rerender } = render(<MarkdownEditor active />);

    await screen.findByLabelText('Markdown source editor');
    const outsideButton = document.createElement('button');
    document.body.appendChild(outsideButton);
    outsideButton.focus();
    expect(document.activeElement).toBe(outsideButton);

    rerender(<MarkdownEditor active={false} />);
    rerender(<MarkdownEditor active />);

    await waitFor(() => {
      expect(screen.getByLabelText('Markdown source editor')).toHaveFocus();
    });
    const returnedSourceEditor = screen.getByLabelText('Markdown source editor') as HTMLTextAreaElement;
    expect(returnedSourceEditor.selectionStart).toBe('# Alpha'.length);
    expect(returnedSourceEditor.selectionEnd).toBe('# Alpha'.length);

    outsideButton.remove();
  });

  it('uploads a pasted image in source mode without inserting companion clipboard text', async () => {
    const file = new File(['image'], 'source shot.png', { type: 'image/png' });
    mocks.notesState.uploadAsset.mockResolvedValue({
      success: true,
      path: './assets/source-shot.png',
      isDuplicate: false,
    });
    render(
      <MarkdownSourceEditor
        currentNotePath="alpha.md"
        showBodyLineNumbers={false}
        saveNote={mocks.notesState.saveNote}
        mode="source"
      />,
    );

    const sourceEditor = screen.getByLabelText('Markdown source editor') as HTMLTextAreaElement;
    const selectionStart = sourceEditor.value.indexOf('Initial');
    sourceEditor.setSelectionRange(selectionStart, selectionStart + 'Initial'.length);
    const pasteEvent = createEvent.paste(sourceEditor, {
      clipboardData: {
        items: [
          { kind: 'string', type: 'text/plain', getAsFile: () => null },
          { kind: 'file', type: 'image/png', getAsFile: () => file },
        ],
        files: [file],
        types: ['text/plain', 'text/html', 'Files'],
        getData: (type: string) => type === 'text/html'
          ? '<a href="https://example.test/companion"><img src="blob:https://example.test/copied"></a>'
          : '[https://example.test/companion](https://example.test/companion)\n\n\u200Bhttps://example.test/companion',
      },
    });

    fireEvent(sourceEditor, pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(sourceEditor.value).toBe(
        '# Alpha\n\n![source-shot](<./assets/source-shot.png>) body',
      );
    });
    expect(mocks.notesState.currentNote?.content).toBe(
      '# Alpha\n\n![source-shot](<./assets/source-shot.png>) body',
    );
    expect(sourceEditor.value).not.toContain('example.test/companion');
    expect(sourceEditor.value).not.toContain('\u200B');
    expect(sourceEditor.selectionStart).toBe(
      selectionStart + '![source-shot](<./assets/source-shot.png>)'.length,
    );
    expect(sourceEditor.selectionEnd).toBe(sourceEditor.selectionStart);
    expect(mocks.notesState.uploadAsset).toHaveBeenCalledTimes(1);
    expect(mocks.notesState.uploadAsset).toHaveBeenCalledWith(file, 'alpha.md');
  });

  it('uses clipboard files when source-mode clipboard items contain only companion text', async () => {
    const file = new File(['image'], 'files-only.png', { type: 'image/png' });
    mocks.notesState.uploadAsset.mockResolvedValue({
      success: true,
      path: './assets/files-only.png',
      isDuplicate: false,
    });
    render(
      <MarkdownSourceEditor
        currentNotePath="alpha.md"
        showBodyLineNumbers={false}
        saveNote={mocks.notesState.saveNote}
        mode="fallback"
      />,
    );

    const sourceEditor = screen.getByLabelText('Markdown source editor') as HTMLTextAreaElement;
    sourceEditor.setSelectionRange(sourceEditor.value.length, sourceEditor.value.length);
    const pasteEvent = createEvent.paste(sourceEditor, {
      clipboardData: {
        items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
        files: [file],
        types: ['text/plain', 'Files'],
        getData: () => 'https://example.test/companion',
      },
    });

    fireEvent(sourceEditor, pasteEvent);

    await waitFor(() => {
      expect(sourceEditor.value).toBe(
        '# Alpha\n\nInitial body![files-only](<./assets/files-only.png>)',
      );
    });
    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(sourceEditor.value).not.toContain('example.test');
    expect(mocks.notesState.uploadAsset).toHaveBeenCalledTimes(1);
  });

  it('inserts multiple source images once in order with only the required separator', async () => {
    const first = new File(['one'], 'one.png', { type: 'image/png' });
    const second = new File(['two'], 'two.png', { type: 'image/png' });
    mocks.notesState.uploadAsset
      .mockResolvedValueOnce({ success: true, path: './assets/one.png', isDuplicate: false })
      .mockResolvedValueOnce({ success: true, path: './assets/two.png', isDuplicate: false });
    render(
      <MarkdownSourceEditor
        currentNotePath="alpha.md"
        showBodyLineNumbers={false}
        saveNote={mocks.notesState.saveNote}
        mode="source"
      />,
    );
    const sourceEditor = screen.getByLabelText('Markdown source editor') as HTMLTextAreaElement;
    sourceEditor.setSelectionRange('# Alpha'.length, '# Alpha'.length);
    fireEvent.paste(sourceEditor, {
      clipboardData: {
        items: [
          { kind: 'file', type: first.type, getAsFile: () => first },
          { kind: 'file', type: second.type, getAsFile: () => second },
        ],
        files: [first, second],
        getData: () => 'https://example.test/companion',
      },
    });

    const inserted = '![one](<./assets/one.png>)\n![two](<./assets/two.png>)';
    await waitFor(() => {
      expect(sourceEditor.value).toBe(`# Alpha${inserted}\n\nInitial body`);
    });
    expect(sourceEditor.value.match(/\.\/assets\/one\.png/g)).toHaveLength(1);
    expect(sourceEditor.value.match(/\.\/assets\/two\.png/g)).toHaveLength(1);
    expect(sourceEditor.value.slice('# Alpha'.length, '# Alpha'.length + inserted.length)).toBe(inserted);
    expect(mocks.notesState.uploadAsset.mock.calls.map(([file]) => file)).toEqual([first, second]);
  });

  it('uploads a dropped image in source mode without inserting drag companion text', async () => {
    const file = new File(['image'], 'dropped.png', { type: 'image/png' });
    mocks.notesState.uploadAsset.mockResolvedValue({
      success: true,
      path: './assets/dropped.png',
      isDuplicate: false,
    });
    render(
      <MarkdownSourceEditor
        currentNotePath="alpha.md"
        showBodyLineNumbers={false}
        saveNote={mocks.notesState.saveNote}
        mode="source"
      />,
    );
    const sourceEditor = screen.getByLabelText('Markdown source editor') as HTMLTextAreaElement;
    sourceEditor.setSelectionRange(sourceEditor.value.length, sourceEditor.value.length);
    const dropEvent = createEvent.drop(sourceEditor, {
      dataTransfer: {
        items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
        files: [file],
        getData: () => 'https://example.test/companion',
      },
    });

    fireEvent(sourceEditor, dropEvent);

    expect(dropEvent.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(sourceEditor.value).toBe(
        '# Alpha\n\nInitial body![dropped](<./assets/dropped.png>)',
      );
    });
    expect(sourceEditor.value).not.toContain('example.test');
  });

  it('does not overwrite source edits made while an image upload is pending', async () => {
    let resolveUpload: (value: { success: true; path: string; isDuplicate: false }) => void = () => undefined;
    const file = new File(['image'], 'pending.png', { type: 'image/png' });
    mocks.notesState.uploadAsset.mockReturnValue(new Promise((resolve) => {
      resolveUpload = resolve;
    }));
    render(
      <MarkdownSourceEditor
        currentNotePath="alpha.md"
        showBodyLineNumbers={false}
        saveNote={mocks.notesState.saveNote}
        mode="source"
      />,
    );
    const sourceEditor = screen.getByLabelText('Markdown source editor') as HTMLTextAreaElement;
    sourceEditor.setSelectionRange(sourceEditor.value.length, sourceEditor.value.length);
    fireEvent.paste(sourceEditor, {
      clipboardData: {
        items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
        files: [file],
        getData: () => '',
      },
    });
    await Promise.resolve();

    fireEvent.change(sourceEditor, { target: { value: '# Alpha\n\nUser kept typing' } });
    resolveUpload({ success: true, path: './assets/pending.png', isDuplicate: false });
    await act(async () => {
      await Promise.resolve();
    });

    expect(sourceEditor.value).toBe('# Alpha\n\nUser kept typing');
    expect(sourceEditor.value).not.toContain('pending.png');
  });

  it('inserts normalized image-only HTML once in source mode and leaves ordinary URLs native', () => {
    render(
      <MarkdownSourceEditor
        currentNotePath="alpha.md"
        showBodyLineNumbers={false}
        saveNote={mocks.notesState.saveNote}
        mode="source"
      />,
    );

    const sourceEditor = screen.getByLabelText('Markdown source editor') as HTMLTextAreaElement;
    sourceEditor.setSelectionRange(sourceEditor.value.length, sourceEditor.value.length);
    const imagePasteEvent = createEvent.paste(sourceEditor, {
      clipboardData: {
        items: [],
        files: [],
        types: ['text/plain', 'text/html'],
        getData: (type: string) => type === 'text/html'
          ? '\u200B<a href="https://example.test/companion"><img src="https://images.example.test/copied.png" alt="Copied" onerror="bad()"></a>\u200B'
          : 'https://example.test/companion',
      },
    });

    fireEvent(sourceEditor, imagePasteEvent);

    expect(imagePasteEvent.defaultPrevented).toBe(true);
    expect(sourceEditor.value).toBe(
      '# Alpha\n\nInitial body<img src="https://images.example.test/copied.png" alt="Copied">',
    );
    expect(sourceEditor.value.match(/<img /g)).toHaveLength(1);
    expect(sourceEditor.value).not.toContain('onerror');
    expect(sourceEditor.value).not.toContain('example.test/companion');
    expect(sourceEditor.value).not.toContain('\u200B');

    const urlPasteEvent = createEvent.paste(sourceEditor, {
      clipboardData: {
        items: [],
        files: [],
        types: ['text/plain'],
        getData: () => 'https://example.test/plain',
      },
    });
    fireEvent(sourceEditor, urlPasteEvent);

    expect(urlPasteEvent.defaultPrevented).toBe(false);
  });

  it('does not delete the source selection when image-only HTML is invalid after sanitizing', () => {
    render(
      <MarkdownSourceEditor
        currentNotePath="alpha.md"
        showBodyLineNumbers={false}
        saveNote={mocks.notesState.saveNote}
        mode="source"
      />,
    );

    const sourceEditor = screen.getByLabelText('Markdown source editor') as HTMLTextAreaElement;
    const selectionStart = sourceEditor.value.indexOf('Initial');
    const selectionEnd = selectionStart + 'Initial'.length;
    sourceEditor.setSelectionRange(selectionStart, selectionEnd);
    const pasteEvent = createEvent.paste(sourceEditor, {
      clipboardData: {
        items: [],
        files: [],
        types: ['text/plain', 'text/html'],
        getData: (type: string) => type === 'text/html'
          ? '<img src="javascript:alert(1)" onerror="alert(2)">'
          : 'https://example.test/companion',
      },
    });

    fireEvent(sourceEditor, pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(sourceEditor.value).toBe('# Alpha\n\nInitial body');
    expect(sourceEditor.selectionStart).toBe(selectionStart);
    expect(sourceEditor.selectionEnd).toBe(selectionEnd);
    expect(mocks.notesState.currentNote?.content).toBe('# Alpha\n\nInitial body');
  });

  it('uploads native clipboard pixels when a source textarea exposes only image HTML', async () => {
    const imageDataUrl = `data:image/png;base64,${btoa('native image')}`;
    (window as any).vlainaDesktop = {
      platform: 'electron',
      clipboard: {
        writeText: vi.fn(),
        readImage: vi.fn().mockResolvedValue(imageDataUrl),
      },
    };
    mocks.notesState.uploadAsset.mockResolvedValue({
      success: true,
      path: './assets/native-image.png',
      isDuplicate: false,
    });
    render(
      <MarkdownSourceEditor
        currentNotePath="alpha.md"
        showBodyLineNumbers={false}
        saveNote={mocks.notesState.saveNote}
        mode="source"
      />,
    );

    const sourceEditor = screen.getByLabelText('Markdown source editor') as HTMLTextAreaElement;
    sourceEditor.setSelectionRange(sourceEditor.value.length, sourceEditor.value.length);
    const pasteEvent = createEvent.paste(sourceEditor, {
      clipboardData: {
        items: [
          { kind: 'string', type: 'text/plain', getAsFile: () => null },
          { kind: 'string', type: 'text/html', getAsFile: () => null },
        ],
        files: [],
        types: ['text/plain', 'text/html'],
        getData: (type: string) => type === 'text/html'
          ? '<a href="https://example.test/source"><img src="https://images.example.test/copied.png"></a>'
          : 'https://example.test/source',
      },
    });

    fireEvent(sourceEditor, pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(sourceEditor.value).toBe(
        '# Alpha\n\nInitial body![native-image](<./assets/native-image.png>)',
      );
    });
    expect(sourceEditor.value).not.toContain('example.test');
    const uploadedFile = mocks.notesState.uploadAsset.mock.calls[0]?.[0] as File;
    expect(uploadedFile).toBeInstanceOf(File);
    expect(uploadedFile.name).toBe('image.png');
    expect(uploadedFile.type).toBe('image/png');
    expect(await uploadedFile.text()).toBe('native image');
  });

  it('does not use stale desktop clipboard pixels for an image-only HTML drop', () => {
    const readImage = vi.fn().mockResolvedValue(`data:image/png;base64,${btoa('stale image')}`);
    (window as any).vlainaDesktop = {
      platform: 'electron',
      clipboard: {
        writeText: vi.fn(),
        readImage,
      },
    };
    render(
      <MarkdownSourceEditor
        currentNotePath="alpha.md"
        showBodyLineNumbers={false}
        saveNote={mocks.notesState.saveNote}
        mode="source"
      />,
    );

    const sourceEditor = screen.getByLabelText('Markdown source editor') as HTMLTextAreaElement;
    sourceEditor.setSelectionRange(sourceEditor.value.length, sourceEditor.value.length);
    const dropEvent = createEvent.drop(sourceEditor, {
      dataTransfer: {
        items: [],
        files: [],
        types: ['text/html'],
        getData: (type: string) => type === 'text/html'
          ? '<a href="https://example.test/source"><img src="https://images.example.test/dropped.png"></a>'
          : '',
      },
    });

    fireEvent(sourceEditor, dropEvent);

    expect(dropEvent.defaultPrevented).toBe(true);
    expect(sourceEditor.value).toBe(
      '# Alpha\n\nInitial body<img src="https://images.example.test/dropped.png">',
    );
    expect(readImage).not.toHaveBeenCalled();
    expect(mocks.notesState.uploadAsset).not.toHaveBeenCalled();
  });

  it('does not insert an uploaded source image after the active note changes', async () => {
    let resolveUpload: (value: { success: true; path: string; isDuplicate: false }) => void = () => undefined;
    const file = new File(['image'], 'stale.png', { type: 'image/png' });
    mocks.notesState.uploadAsset.mockReturnValue(new Promise((resolve) => {
      resolveUpload = resolve;
    }));
    render(
      <MarkdownSourceEditor
        currentNotePath="alpha.md"
        showBodyLineNumbers={false}
        saveNote={mocks.notesState.saveNote}
        mode="source"
      />,
    );

    const sourceEditor = screen.getByLabelText('Markdown source editor') as HTMLTextAreaElement;
    const pasteEvent = createEvent.paste(sourceEditor, {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        files: [file],
        types: ['Files'],
        getData: () => '',
      },
    });
    fireEvent(sourceEditor, pasteEvent);
    await Promise.resolve();

    mocks.notesState.currentNote = { path: 'beta.md', content: '# Beta' };
    resolveUpload({ success: true, path: './assets/stale.png', isDuplicate: false });
    await act(async () => {
      await Promise.resolve();
    });

    expect(sourceEditor.value).toBe('# Alpha\n\nInitial body');
    expect(mocks.notesState.currentNote).toEqual({ path: 'beta.md', content: '# Beta' });
  });

  it('keeps markdown editable when the Milkdown runtime throws during render', async () => {
    render(<MarkdownEditor />);

    const sourceEditor = await screen.findByLabelText('Markdown source editor');
    expect(sourceEditor).toHaveValue('# Alpha\n\nInitial body');
    expect(JSON.parse(getDiagnosticsLogText()).entries).toContainEqual(expect.objectContaining({
      channel: 'notes-editor',
      event: 'failure-render-error',
      details: expect.objectContaining({
        reason: 'render-error',
        errorMessage: 'Milkdown failed to create',
      }),
    }));

    fireEvent.change(sourceEditor, { target: { value: '# Alpha\n\nEdited body' } });

    await waitFor(() => {
      expect(mocks.notesState.currentNote?.content).toBe('# Alpha\n\nEdited body');
    });
    expect(mocks.notesState.isDirty).toBe(true);

    fireEvent.blur(sourceEditor);
    await waitFor(() => {
      expect(mocks.notesState.saveNote).toHaveBeenCalledWith({
        explicit: false,
        throwOnError: true,
      });
    });
  });

  it('retries a transient source editor autosave failure', async () => {
    vi.useFakeTimers();
    mocks.notesState.saveNote
      .mockRejectedValueOnce(new Error('disk busy'))
      .mockResolvedValueOnce(undefined);
    render(
      <MarkdownSourceEditor
        currentNotePath="alpha.md"
        showBodyLineNumbers={false}
        saveNote={mocks.notesState.saveNote}
        mode="fallback"
      />,
    );

    fireEvent.change(screen.getByLabelText('Markdown source editor'), {
      target: { value: '# Alpha\n\nEdited body' },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(mocks.notesState.saveNote).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(mocks.notesState.saveNote).toHaveBeenCalledTimes(2);
  });

  it('resumes autosave when a source editor mounts for a dirty note', async () => {
    vi.useFakeTimers();
    mocks.notesState.isDirty = true;
    render(
      <MarkdownSourceEditor
        currentNotePath="alpha.md"
        showBodyLineNumbers={false}
        saveNote={mocks.notesState.saveNote}
        mode="fallback"
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(mocks.notesState.saveNote).toHaveBeenCalledWith({
      explicit: false,
      throwOnError: true,
    });
  });

  it('retries the rendered editor in one action after a render error fallback', async () => {
    const onEditorModeChange = vi.fn();
    render(<MarkdownEditor onEditorModeChange={onEditorModeChange} />);

    const fallbackEditor = await screen.findByLabelText('Markdown source editor');
    expect(fallbackEditor.closest('[data-note-source-fallback="true"]')).toBeInstanceOf(HTMLElement);
    expect(screen.getByText('Failed to update view')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(onEditorModeChange).toHaveBeenLastCalledWith('fallback');
    mocks.milkdownRuntimeMode.value = 'live-dom-never-ready';

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByTestId('milkdown-live-dom')).toBeInTheDocument();
    expect(screen.queryByLabelText('Markdown source editor')).toBeNull();
    expect(onEditorModeChange).toHaveBeenLastCalledWith('rendered');
  });

  it('retries the rendered editor after switching away from a note that triggered the fallback', async () => {
    mocks.milkdownRuntimeMode.value = 'sync-failure';
    const { rerender } = render(<MarkdownEditor />);

    expect(await screen.findByLabelText('Markdown source editor')).toBeInTheDocument();
    mocks.milkdownRuntimeMode.value = 'live-dom-never-ready';
    mocks.notesState.currentNote = { path: 'beta.md', content: '# Beta' };
    mocks.notesState.openTabs = [{ path: 'beta.md', name: 'beta.md', isDirty: false }];
    rerender(<MarkdownEditor />);

    expect(await screen.findByTestId('milkdown-live-dom')).toBeInTheDocument();
    expect(screen.queryByLabelText('Markdown source editor')).toBeNull();

    mocks.notesState.currentNote = { path: 'alpha.md', content: '# Alpha\n\nInitial body' };
    mocks.notesState.openTabs = [{ path: 'alpha.md', name: 'alpha.md', isDirty: false }];
    rerender(<MarkdownEditor />);

    expect(await screen.findByTestId('milkdown-live-dom')).toBeInTheDocument();
    expect(screen.queryByLabelText('Markdown source editor')).toBeNull();
  });

  it('keeps markdown editable when the Milkdown runtime mounts but never becomes ready', async () => {
    vi.useFakeTimers();
    mocks.milkdownRuntimeMode.value = 'never-ready';

    render(<MarkdownEditor />);

    await act(async () => {});
    expect(screen.getByTestId('milkdown-never-ready')).toBeInstanceOf(HTMLElement);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    const sourceEditor = screen.getByLabelText('Markdown source editor');
    expect(sourceEditor).toHaveValue('# Alpha\n\nInitial body');
    expect(JSON.parse(getDiagnosticsLogText()).entries).toContainEqual(expect.objectContaining({
      channel: 'notes-editor',
      event: 'failure-init-timeout',
      details: expect.objectContaining({
        reason: 'init-timeout',
        contentLength: '# Alpha\n\nInitial body'.length,
        diskRevision: 0,
      }),
    }));

    mocks.milkdownRuntimeMode.value = 'live-dom-never-ready';
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(screen.getByTestId('milkdown-live-dom')).toBeInTheDocument();
    expect(screen.queryByLabelText('Markdown source editor')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(screen.getByLabelText('Markdown source editor')).toHaveValue('# Alpha\n\nInitial body');
    expect(screen.queryByTestId('milkdown-live-dom')).toBeNull();
  });

  it('immediately falls back to source editing after content synchronization repeatedly fails', async () => {
    mocks.milkdownRuntimeMode.value = 'sync-failure';

    render(<MarkdownEditor />);

    const sourceEditor = await screen.findByLabelText('Markdown source editor');
    expect(sourceEditor).toHaveValue('# Alpha\n\nInitial body');
    expect(sourceEditor.closest('[data-note-source-fallback="true"]')).toBeInstanceOf(HTMLElement);
    expect(JSON.parse(getDiagnosticsLogText()).entries).toContainEqual(expect.objectContaining({
      channel: 'notes-editor',
      event: 'failure-content-sync',
      details: expect.objectContaining({
        reason: 'content-sync',
        errorMessage: 'Editor content synchronization failed',
      }),
    }));

    mocks.milkdownRuntimeMode.value = 'live-dom-never-ready';
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(screen.getByTestId('milkdown-live-dom')).toBeInTheDocument();
    expect(screen.queryByLabelText('Markdown source editor')).toBeNull();
  });

  it.each([
    ['creation-failure', 'creation-error', 'Editor creation failed'],
    ['activation-failure', 'activation-error', 'Editor activation failed'],
  ] as const)('falls back after an asynchronous editor %s callback', async (mode, reason, message) => {
    mocks.milkdownRuntimeMode.value = mode;

    render(<MarkdownEditor />);

    const sourceEditor = await screen.findByLabelText('Markdown source editor');
    expect(sourceEditor).toHaveValue('# Alpha\n\nInitial body');
    expect(sourceEditor.closest('[data-note-source-fallback="true"]')).toBeInstanceOf(HTMLElement);
    expect(JSON.parse(getDiagnosticsLogText()).entries).toContainEqual(expect.objectContaining({
      channel: 'notes-editor',
      event: `failure-${reason}`,
      details: expect.objectContaining({
        reason,
        errorMessage: message,
      }),
    }));
  });

  it('does not treat a live ProseMirror DOM as proof that note content synchronized', async () => {
    vi.useFakeTimers();
    mocks.milkdownRuntimeMode.value = 'live-dom-never-ready';

    render(<MarkdownEditor />);

    await act(async () => {});
    expect(screen.getByTestId('milkdown-live-dom')).toBeInstanceOf(HTMLElement);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    const sourceEditor = screen.getByLabelText('Markdown source editor');
    expect(sourceEditor).toHaveValue('# Alpha\n\nInitial body');
    expect(screen.queryByTestId('milkdown-live-dom')).toBeNull();
  });

  it('focuses the title when clicking the editor shell for an empty untitled draft', () => {
    mocks.milkdownRuntimeMode.value = 'live-dom-never-ready';
    mocks.notesState.currentNote = { path: 'draft:test', content: '#' };
    mocks.notesState.openTabs = [{ path: 'draft:test', name: 'Untitled', isDirty: false }];
    mocks.notesState.draftNotes = { 'draft:test': { parentPath: null, name: '' } };
    mocks.notesState.noteMetadata = { notes: {} };

    render(<MarkdownEditor />);

    const titleInput = screen.getByLabelText('Note title');
    const shell = document.querySelector('[data-note-toolbar-root="true"]');
    expect(shell).toBeInstanceOf(HTMLElement);

    fireEvent.click(shell as HTMLElement);

    expect(document.activeElement).toBe(titleInput);
  });

  it('focuses the title when an empty untitled draft source fallback receives a body click', async () => {
    mocks.notesState.currentNote = { path: 'draft:test', content: '#' };
    mocks.notesState.openTabs = [{ path: 'draft:test', name: 'Untitled', isDirty: false }];
    mocks.notesState.draftNotes = { 'draft:test': { parentPath: null, name: '' } };
    mocks.notesState.noteMetadata = { notes: {} };

    render(<MarkdownEditor />);

    const titleInput = screen.getByLabelText('Note title');
    const sourceEditor = await screen.findByLabelText('Markdown source editor');
    const mouseDown = createEvent.mouseDown(sourceEditor, { button: 0 });

    fireEvent(sourceEditor, mouseDown);

    expect(mouseDown.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(titleInput);
  });

  it('refreshes the toolbar starred state when the starred registry changes', async () => {
    render(<MarkdownEditor />);

    expect(await screen.findByRole('button', { name: 'Add to Starred' })).toBeInTheDocument();

    act(() => {
      mocks.notesState.starredEntries = [{
        id: 'starred-alpha',
        kind: 'note',
        notesRootPath: '/notesRoot',
        relativePath: 'alpha.md',
        addedAt: 1,
      }];
      mocks.notifyNotesStoreListeners();
    });

    expect(screen.getByRole('button', { name: 'Unfavorite' })).toBeInTheDocument();

    act(() => {
      mocks.notesState.starredEntries = [];
      mocks.notifyNotesStoreListeners();
    });

    expect(screen.getByRole('button', { name: 'Add to Starred' })).toBeInTheDocument();
  });

  it('cancels pending fallback autosaves when switching notes', async () => {
    vi.useFakeTimers();

    const { rerender } = render(<MarkdownEditor />);

    await act(async () => {});
    const sourceEditor = screen.getByLabelText('Markdown source editor');
    fireEvent.change(sourceEditor, { target: { value: '# Alpha\n\nEdited body' } });

    mocks.notesState.currentNote = { path: 'beta.md', content: '# Beta\n\nInitial body' };
    mocks.notesState.openTabs = [{ path: 'beta.md', name: 'beta.md', isDirty: false }];
    mocks.notesState.isDirty = false;
    rerender(<MarkdownEditor />);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(mocks.notesState.saveNote).not.toHaveBeenCalled();
  });

  it('does not flush composing fallback pinyin when the source editor unmounts before compositionend', async () => {
    const { unmount } = render(<MarkdownEditor />);

    const sourceEditor = await screen.findByLabelText('Markdown source editor');
    fireEvent.compositionStart(sourceEditor);
    fireEvent.change(sourceEditor, { target: { value: '# Alpha\n\nnihao' } });

    expect(mocks.notesState.currentNote?.content).toBe('# Alpha\n\nInitial body');

    unmount();

    expect(mocks.notesState.currentNote?.content).toBe('# Alpha\n\nInitial body');
    expect(mocks.notesState.isDirty).toBe(false);
  });

  it('commits fallback Chinese text after compositionend', async () => {
    const previewListener = vi.fn();
    window.addEventListener('editor:note-markdown-preview', previewListener);
    render(<MarkdownEditor />);

    const sourceEditor = await screen.findByLabelText('Markdown source editor');
    fireEvent.compositionStart(sourceEditor);
    fireEvent.change(sourceEditor, { target: { value: '# Alpha\n\nnihao' } });

    expect(mocks.notesState.currentNote?.content).toBe('# Alpha\n\nInitial body');

    fireEvent.compositionEnd(sourceEditor, { target: { value: '# Alpha\n\n你好' } });

    await waitFor(() => {
      expect(mocks.notesState.currentNote?.content).toBe('# Alpha\n\n你好');
    });
    expect(mocks.notesState.isDirty).toBe(true);
    expect(previewListener).toHaveBeenCalledWith(expect.objectContaining({
      detail: { path: 'alpha.md', content: '# Alpha\n\n你好' },
    }));
    window.removeEventListener('editor:note-markdown-preview', previewListener);
  });

  it('does not apply a stale source-mode frame commit after an external reload changes the note', () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        rafCallbacks.push(callback);
        return rafCallbacks.length;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);
    const { unmount } = render(
      <MarkdownSourceEditor
        currentNotePath="alpha.md"
        showBodyLineNumbers={false}
        saveNote={mocks.notesState.saveNote}
        mode="source"
      />,
    );

    const sourceEditor = screen.getByLabelText('Markdown source editor');
    fireEvent.change(sourceEditor, { target: { value: '# Alpha\n\nLocal source edit' } });
    expect(mocks.notesState.currentNote?.content).toBe('# Alpha\n\nInitial body');

    mocks.notesState.currentNote = { path: 'alpha.md', content: '# External\n\nDisk reload' };
    mocks.notesState.isDirty = false;

    act(() => {
      const pendingCallbacks = [...rafCallbacks];
      rafCallbacks.length = 0;
      for (const callback of pendingCallbacks) {
        callback(16);
      }
    });

    expect(mocks.notesState.currentNote).toEqual({
      path: 'alpha.md',
      content: '# External\n\nDisk reload',
    });
    expect(mocks.notesState.isDirty).toBe(false);

    unmount();
    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });

  it('preserves the focused source selection during an external content refresh', () => {
    render(
      <MarkdownSourceEditor
        currentNotePath="alpha.md"
        showBodyLineNumbers={false}
        saveNote={mocks.notesState.saveNote}
        mode="source"
      />,
    );

    const sourceEditor = screen.getByLabelText('Markdown source editor') as HTMLTextAreaElement;
    sourceEditor.setSelectionRange(3, 8, 'backward');

    act(() => {
      mocks.notesState.currentNote = { path: 'alpha.md', content: '# Alpha refreshed\n\nExternal body' };
      mocks.notifyNotesStoreListeners();
    });

    expect(sourceEditor).toHaveValue('# Alpha refreshed\n\nExternal body');
    expect(sourceEditor.selectionStart).toBe(3);
    expect(sourceEditor.selectionEnd).toBe(8);
    expect(sourceEditor.selectionDirection).toBe('backward');
  });

  it('does not flush a stale source-mode draft while unmounting after an external reload', () => {
    const { unmount } = render(
      <MarkdownSourceEditor
        currentNotePath="alpha.md"
        showBodyLineNumbers={false}
        saveNote={mocks.notesState.saveNote}
        mode="source"
      />,
    );

    const sourceEditor = screen.getByLabelText('Markdown source editor');
    fireEvent.change(sourceEditor, { target: { value: '# Alpha\n\nLocal source edit' } });
    expect(mocks.notesState.currentNote?.content).toBe('# Alpha\n\nInitial body');

    mocks.notesState.currentNote = { path: 'alpha.md', content: '# External\n\nDisk reload' };
    mocks.notesState.isDirty = false;

    unmount();

    expect(mocks.notesState.currentNote).toEqual({
      path: 'alpha.md',
      content: '# External\n\nDisk reload',
    });
    expect(mocks.notesState.isDirty).toBe(false);
  });
});
