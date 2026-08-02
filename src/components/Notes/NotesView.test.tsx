import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchDeleteCurrentNoteEvent } from '@/components/Notes/noteDeleteEvents';
import { NOTE_SOURCE_MODE_TOGGLE_EVENT } from '@/components/Notes/features/Editor/sourceMode/sourceModeEvents';
import { EDITOR_FIND_OPEN_EVENT } from '@/components/Notes/features/Editor/find/editorFindEvents';
import { dispatchNotesTabSplitDrag } from '@/components/Notes/features/Split/notesSplitDragEvents';
import { matchesShortcutBinding } from '@/lib/shortcuts';
import { messageDialog } from '@/lib/storage/dialog';
import { NATIVE_CARET_OVERLAY_REFRESH_EVENT } from '@/hooks/useNativeCaretOverlay';
import { openStoredNotePath } from '@/stores/notes/openNotePath';
import {
  runOpenNewChatShortcut,
  runTemporaryChatWelcomeShortcut,
} from '@/components/Chat/features/Temporary/temporaryChatCommands';
import { NotesView } from './NotesView';
import { useAbsoluteNoteExternalRenameSync } from './hooks/useAbsoluteNoteExternalRenameSync';
import { useCurrentNotesRootExternalPathSync } from './hooks/useCurrentNotesRootExternalPathSync';
import { useNotesExternalSync } from './hooks/useNotesExternalSync';

type MockNotesState = {
  currentNote: { path: string; content: string } | null;
  noteMetadata: { notes: Record<string, Record<string, unknown>> } | null;
  noteContentsCache: Map<string, { content: string; modifiedAt: number | null }>;
  loadFileTree: ReturnType<typeof vi.fn>;
  openTabs: Array<{ path: string; name: string; isDirty: boolean }>;
  recentlyClosedTabs: Array<{
    tab: { path: string; name: string; isDirty: boolean };
    index: number;
  }>;
  closeTab: ReturnType<typeof vi.fn>;
  reopenClosedTab: ReturnType<typeof vi.fn>;
  createNote: ReturnType<typeof vi.fn>;
  openNote: ReturnType<typeof vi.fn>;
  prefetchNote: ReturnType<typeof vi.fn>;
  deleteNote: ReturnType<typeof vi.fn>;
  loadStarred: ReturnType<typeof vi.fn>;
  starredEntries: unknown[];
  toggleStarred: ReturnType<typeof vi.fn>;
  loadMetadata: ReturnType<typeof vi.fn>;
  loadAssets: ReturnType<typeof vi.fn>;
  saveNote: ReturnType<typeof vi.fn>;
  cleanupAssetTempFiles: ReturnType<typeof vi.fn>;
  clearAssetUrlCache: ReturnType<typeof vi.fn>;
  cancelNoteContentScan: ReturnType<typeof vi.fn>;
  revealFolder: ReturnType<typeof vi.fn>;
  isDirty: boolean;
  pendingStarredNavigation: {
    notesRootPath: string;
    kind: 'note' | 'folder';
    relativePath: string;
    openInNewTab?: boolean;
    skipWorkspaceRestore?: boolean;
  } | null;
  setPendingStarredNavigation: ReturnType<typeof vi.fn>;
  notesPath: string;
  rootFolder: {
    id: string;
    name: string;
    path: string;
    isFolder: true;
    children: unknown[];
    expanded: boolean;
  } | null;
  rootFolderPath: string | null;
  draftNotes: Record<string, { parentPath: string | null; name: string }>;
  isLoading: boolean;
  openNoteByAbsolutePath: ReturnType<typeof vi.fn>;
  adoptAbsoluteNoteIntoNotesRoot: ReturnType<typeof vi.fn>;
  pendingDraftDiscardPath: string | null;
  cancelPendingDraftDiscard: ReturnType<typeof vi.fn>;
  confirmPendingDraftDiscard: ReturnType<typeof vi.fn>;
  getDisplayName: ReturnType<typeof vi.fn>;
  error: string | null;
};

const mocks = vi.hoisted(() => {
  const notesState: MockNotesState = {
    currentNote: null,
    noteMetadata: null,
    noteContentsCache: new Map(),
    loadFileTree: vi.fn().mockResolvedValue(undefined),
    openTabs: [],
    recentlyClosedTabs: [],
    closeTab: vi.fn(),
    reopenClosedTab: vi.fn().mockResolvedValue(undefined),
    createNote: vi.fn().mockResolvedValue('draft:test'),
    openNote: vi.fn().mockResolvedValue(undefined),
    prefetchNote: vi.fn().mockResolvedValue(undefined),
    deleteNote: vi.fn().mockResolvedValue(undefined),
    loadStarred: vi.fn().mockResolvedValue(undefined),
    starredEntries: [],
    toggleStarred: vi.fn(),
    loadMetadata: vi.fn().mockResolvedValue(undefined),
    loadAssets: vi.fn().mockResolvedValue(undefined),
    saveNote: vi.fn().mockResolvedValue(undefined),
    cleanupAssetTempFiles: vi.fn().mockResolvedValue(undefined),
    clearAssetUrlCache: vi.fn(),
    cancelNoteContentScan: vi.fn(),
    revealFolder: vi.fn(),
    isDirty: false,
    pendingStarredNavigation: null,
    setPendingStarredNavigation: vi.fn(),
    notesPath: '/notesRoot',
    rootFolder: {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true,
      children: [],
      expanded: true,
    },
    rootFolderPath: '/notesRoot',
    draftNotes: {},
    isLoading: false,
    openNoteByAbsolutePath: vi.fn().mockResolvedValue(undefined),
    adoptAbsoluteNoteIntoNotesRoot: vi.fn().mockReturnValue(false),
    pendingDraftDiscardPath: null,
    cancelPendingDraftDiscard: vi.fn(),
    confirmPendingDraftDiscard: vi.fn(),
    getDisplayName: vi.fn((path: string) => path.split('/').pop() || path),
    error: null,
  };

  const notesRootState = {
    currentNotesRoot: { path: '/notesRoot' } as { path: string } | null,
    hasInitialized: true,
    openNotesRoot: vi.fn(),
  };

  const uiState = {
    sidebarWidth: 320,
    notesChatPanelCollapsed: true,
    setNotesChatPanelCollapsed: vi.fn(),
    toggleNotesChatPanel: vi.fn(),
    notesChatFloatingOpen: false,
    setNotesChatFloatingOpen: vi.fn(),
    notesChatFloatingSize: { width: 420, height: 680 },
    setNotesChatFloatingSize: vi.fn(),
    resetNotesChatFloatingSize: vi.fn(),
    notesSplitPanesActive: false,
    setNotesSplitPanesActive: vi.fn(),
    setLayoutPanelDragging: vi.fn(),
    setLayoutPanelTransitioning: vi.fn(),
    setAppViewMode: vi.fn(),
    setNotesSidebarView: vi.fn(),
    universalPreviewTarget: null as string | null,
    universalPreviewIcon: null as string | null,
    universalPreviewColor: null as string | null,
    universalPreviewTone: null as number | null,
    notesPreviewTitle: null as { path: string; title: string } | null,
    setNotesPreviewTitle: vi.fn((path: string | null, title: string | null) => {
      uiState.notesPreviewTitle = path && title ? { path, title } : null;
    }),
    languagePreference: 'en',
  };

  const storageState = {
    stat: vi.fn(),
  };

  const toastState = {
    addToast: vi.fn(),
  };

  const editorViewRegistry = {
    getCurrentEditorNotePath: vi.fn(() => notesState.currentNote?.path ?? null),
    getCurrentEditorView: vi.fn(),
  };

  const sidebarDiscussion = {
    canOpenSidebarDiscussionForSelection: vi.fn(),
    openSidebarDiscussionForSelection: vi.fn(),
  };

  return {
    notesState,
    notesRootState,
    uiState,
    storageState,
    toastState,
    editorViewRegistry,
    sidebarDiscussion,
  };
});

vi.mock('@/stores/notes/useNotesStore', () => ({
  useNotesStore: Object.assign(
    (selector: (state: MockNotesState) => unknown) => selector(mocks.notesState),
    {
      getState: () => mocks.notesState,
      setState: (partial: Partial<MockNotesState>) => {
        Object.assign(mocks.notesState, partial);
      },
      subscribe: () => () => undefined,
    },
  ),
}));

vi.mock('@/stores/useNotesStore', () => ({
  useNotesStore: Object.assign(
    (selector: (state: MockNotesState) => unknown) => selector(mocks.notesState),
    {
      getState: () => mocks.notesState,
      setState: (partial: Partial<MockNotesState>) => {
        Object.assign(mocks.notesState, partial);
      },
      subscribe: () => () => undefined,
    },
  ),
}));

vi.mock('@/stores/useNotesRootStore', () => ({
  useNotesRootStore: Object.assign(
    (selector?: (state: typeof mocks.notesRootState) => unknown) =>
      selector ? selector(mocks.notesRootState) : mocks.notesRootState,
    {
      getState: () => mocks.notesRootState,
    },
  ),
}));

vi.mock('@/stores/unified/useUnifiedStore', () => ({
  useUnifiedStore: Object.assign(
    (selector: (state: { loaded: boolean; data: { settings: { markdown: {}; ui: {} } } }) => unknown) =>
      selector({ loaded: true, data: { settings: { markdown: {}, ui: {} } } }),
    {
      getState: () => ({ loaded: true, data: { settings: { markdown: {}, ui: {} } } }),
    },
  ),
}));

vi.mock('@/stores/uiSlice', () => ({
  NOTES_CHAT_FLOATING_DEFAULT_SIZE: { width: 420, height: 680 },
  NOTES_CHAT_FLOATING_MIN_SIZE: { width: 320, height: 420 },
  NOTES_CHAT_FLOATING_MAX_SIZE: { width: 760, height: 920 },
  useUIStore: Object.assign(
    (selector: (state: typeof mocks.uiState) => unknown) => selector(mocks.uiState),
    {
      getState: () => mocks.uiState,
      subscribe: () => () => undefined,
    },
  ),
}));

vi.mock('@/stores/useToastStore', () => ({
  useToastStore: (selector: (state: typeof mocks.toastState) => unknown) => selector(mocks.toastState),
}));

vi.mock('@/lib/desktop/window', () => ({
  desktopWindow: {
    setResizable: vi.fn().mockResolvedValue(undefined),
  },
}));

const openMarkdownFileListeners = new Set<(path: string) => void>();

function dispatchDesktopOpenMarkdownFile(path: string) {
  for (const listener of openMarkdownFileListeners) {
    listener(path);
  }
}

vi.mock('@/lib/desktop/shortcuts', () => ({
  onDesktopOpenMarkdownFileShortcut: vi.fn(() => () => {}),
  onDesktopOpenMarkdownFile: vi.fn((callback: (path: string) => void) => {
    openMarkdownFileListeners.add(callback);
    return () => openMarkdownFileListeners.delete(callback);
  }),
}));

vi.mock('@/lib/storage/adapter', async () => {
  const actual = await vi.importActual<typeof import('@/lib/storage/adapter')>('@/lib/storage/adapter');
  return {
    ...actual,
    getStorageAdapter: () => ({
      stat: mocks.storageState.stat,
    }),
  };
});

vi.mock('@/lib/storage/dialog', () => ({
  openDialog: vi.fn(),
  messageDialog: vi.fn(),
}));

vi.mock('@/lib/notes/openMarkdownFileText', () => ({
  OPEN_MARKDOWN_FILE_ACTION: 'Open Markdown File',
}));

vi.mock('./features/OpenTarget/openTargetSelection', () => ({
  getSingleOpenSelection: vi.fn(),
  isSupportedMarkdownSelection: vi.fn((path: string) => /\.(?:md|markdown|mdown|mkd)$/i.test(path)),
  resolveOpenNoteTarget: vi.fn((path: string) => ({
    notesRootPath: '/notesRoot',
    notePath: path.split('/').pop() || path,
  })),
}));

vi.mock('@/lib/shortcuts', () => ({
  getShortcutKeys: vi.fn(() => ['Ctrl', '/']),
  matchesShortcutBinding: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/ui/composerFocusRegistry', () => ({
  focusComposerInput: vi.fn().mockReturnValue(false),
}));

vi.mock('@/components/layout/ResizablePanel', () => ({
  ResizablePanel: ({
    children,
    className,
    defaultWidth,
    minWidth,
    maxWidth,
    storageKey,
    onWidthChange,
  }: {
    children: ReactNode;
    className?: string;
    defaultWidth?: number;
    minWidth?: number;
    maxWidth?: number;
    storageKey?: string;
    onWidthChange?: (width: number) => void;
  }) => (
    <div
      data-testid="resizable-panel"
      className={className}
      data-default-width={defaultWidth}
      data-min-width={minWidth}
      data-max-width={maxWidth}
      data-storage-key={storageKey}
    >
      <button
        type="button"
        data-testid="resizable-panel-width-change"
        onClick={() => onWidthChange?.(480)}
      />
      {children}
    </div>
  ),
}));

vi.mock('@/components/Notes/features/FileTree/hooks/externalDragPreview', () => ({
  createExternalDragPreview: () => ({
    updatePaths: vi.fn(),
    updatePosition: vi.fn(),
    dispose: vi.fn(),
  }),
}));

vi.mock('@/components/common/ModuleShortcutsDialog', () => ({
  ModuleShortcutsDialog: () => null,
}));

vi.mock('@/components/Chat/ChatView', () => ({
  ChatView: ({ active }: { active?: boolean }) => (
    <div data-testid="embedded-chat-view" data-active={String(active)} />
  ),
}));

vi.mock('@/lib/desktop/launchContext', () => ({
  readWindowLaunchContext: vi.fn(() => ({})),
}));

vi.mock('./features/Editor', () => ({
  MarkdownEditor: ({ active }: { active?: boolean }) => {
    const hasRenderableNote = Boolean(mocks.notesState.currentNote?.path);
    if (!hasRenderableNote) {
      return <div data-testid="markdown-editor-shell" />;
    }

    const path = mocks.notesState.currentNote?.path ?? '';
    return (
      <div>
        <textarea
          data-testid="note-title-input"
          data-note-title-input="true"
          defaultValue={mocks.notesState.draftNotes[path]?.name ?? path}
        />
        {active ? <div data-testid="markdown-editor" /> : <div data-testid="markdown-editor-shell" />}
      </div>
    );
  },
}));

vi.mock('./features/Editor/preloadMarkdownEditor', () => ({
  preloadMarkdownEditor: vi.fn(async () => ({
    MarkdownEditor: ({ active }: { active?: boolean }) => {
      const hasRenderableNote = Boolean(mocks.notesState.currentNote?.path);
      if (!hasRenderableNote) {
        return <div data-testid="markdown-editor-shell" />;
      }

      const path = mocks.notesState.currentNote?.path ?? '';
      return (
        <div>
          <textarea
            data-testid="note-title-input"
            data-note-title-input="true"
            defaultValue={mocks.notesState.draftNotes[path]?.name ?? path}
          />
          {active ? <div data-testid="markdown-editor" /> : <div data-testid="markdown-editor-shell" />}
        </div>
      );
    },
  })),
}));

vi.mock('@/hooks/useModuleShortcutsDialog', () => ({
  useModuleShortcutsDialog: vi.fn(),
}));

vi.mock('@/components/Chat/features/Temporary/temporaryChatCommands', () => ({
  runOpenNewChatShortcut: vi.fn(),
  runTemporaryChatWelcomeShortcut: vi.fn(),
}));

vi.mock('@/components/Notes/features/Editor/utils/editorViewRegistry', () => ({
  getCurrentEditorNotePath: mocks.editorViewRegistry.getCurrentEditorNotePath,
  getCurrentEditorView: mocks.editorViewRegistry.getCurrentEditorView,
}));

vi.mock('@/components/Notes/features/Editor/plugins/floating-toolbar/ai/sidebarDiscussion', () => ({
  canOpenSidebarDiscussionForSelection: mocks.sidebarDiscussion.canOpenSidebarDiscussionForSelection,
  openSidebarDiscussionForSelection: mocks.sidebarDiscussion.openSidebarDiscussionForSelection,
}));

vi.mock('./hooks/useCurrentNotesRootExternalPathSync', () => ({
  useCurrentNotesRootExternalPathSync: vi.fn(),
}));

vi.mock('./hooks/useNotesExternalSync', () => ({
  useNotesExternalSync: vi.fn(),
}));

vi.mock('./hooks/useAbsoluteNoteExternalRenameSync', () => ({
  useAbsoluteNoteExternalRenameSync: vi.fn(),
}));

vi.mock('@/stores/notes/openNotePath', () => ({
  openStoredNotePath: vi.fn(),
}));


vi.mock('@/components/Notes/features/FileTree/components/TreeItemDeleteDialog', () => ({
  TreeItemDeleteDialog: ({ open, itemLabel, onConfirm }: { open: boolean; itemLabel: string; onConfirm: () => void }) =>
    open ? (
      <div>
        <span data-testid="delete-note-label">{itemLabel}</span>
        <button type="button" onClick={onConfirm}>Confirm Delete Note</button>
      </div>
    ) : null,
}));

const notesState = mocks.notesState;
const uiState = mocks.uiState;
const shortcutMatchesMock = vi.mocked(matchesShortcutBinding);
const originalElementsFromPoint = document.elementsFromPoint;

function createDropFile(path: string, exposePath = true) {
  const file = new File([''], path.split('/').pop() || 'dropped-item');
  if (exposePath) {
    Object.defineProperty(file, 'path', {
      value: path,
      configurable: true,
    });
  }
  return file as File & { path: string };
}

function dispatchWindowDragEventWithFiles(
  type: 'dragenter' | 'dragover' | 'dragleave' | 'drop',
  files: File[],
  types: string[] = files.length > 0 ? ['Files'] : [],
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      files,
      types,
    },
    configurable: true,
  });
  fireEvent(window, event);
}

function dispatchWindowDragEvent(
  type: 'dragenter' | 'dragover' | 'dragleave' | 'drop',
  paths: string[] = [],
  types: string[] = paths.length > 0 ? ['Files'] : [],
) {
  dispatchWindowDragEventWithFiles(type, paths.map((path) => createDropFile(path)), types);
}

function mockSplitDropRootRect(rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>) {
  const dropRoot = document.querySelector('[data-notes-split-drop-root="true"]') as HTMLElement | null;
  expect(dropRoot).not.toBeNull();
  mockElementRect(dropRoot as HTMLElement, rect);
}

function mockElementRect(element: HTMLElement, rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    ...rect,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  } as DOMRect);
}

function mockElementsFromPoint(elements: Element[]) {
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: vi.fn(() => elements),
  });
}

async function waitForNotesRootInitializationEffects() {
  await waitFor(() => {
    expect(notesState.loadFileTree).toHaveBeenCalled();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe('NotesView', () => {
  beforeEach(() => {
    delete (window as Window & { vlainaDesktop?: unknown }).vlainaDesktop;
    mocks.notesRootState.currentNotesRoot = { path: '/notesRoot' };
    mocks.notesRootState.hasInitialized = true;
    notesState.currentNote = null;
    notesState.noteMetadata = null;
    notesState.noteContentsCache = new Map();
    notesState.openTabs = [];
    notesState.recentlyClosedTabs = [];
    notesState.draftNotes = {};
    notesState.notesPath = '/notesRoot';
    notesState.isLoading = false;
    notesState.pendingStarredNavigation = null;
    notesState.error = null;
    notesState.rootFolder = {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true,
      children: [],
      expanded: true,
    };
    notesState.rootFolderPath = '/notesRoot';
    notesState.openNote.mockImplementation(async (path: string) => {
      notesState.currentNote = { path, content: '' };
    });
    notesState.openNoteByAbsolutePath.mockImplementation(async (path: string) => {
      notesState.currentNote = { path, content: '' };
    });
    notesState.adoptAbsoluteNoteIntoNotesRoot.mockReturnValue(false);
    mocks.notesRootState.openNotesRoot.mockResolvedValue(true);
    mocks.storageState.stat.mockReset();
    shortcutMatchesMock.mockReset();
    shortcutMatchesMock.mockReturnValue(false);
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: originalElementsFromPoint,
    });

    notesState.loadFileTree.mockClear();
    notesState.closeTab.mockClear();
    notesState.reopenClosedTab.mockClear();
    notesState.createNote.mockClear();
    notesState.openNote.mockClear();
    notesState.prefetchNote.mockClear();
    notesState.deleteNote.mockClear();
    notesState.loadStarred.mockClear();
    notesState.starredEntries = [];
    notesState.toggleStarred.mockClear();
    notesState.loadMetadata.mockClear();
    notesState.loadAssets.mockClear();
    notesState.saveNote.mockClear();
    notesState.cleanupAssetTempFiles.mockClear();
    notesState.clearAssetUrlCache.mockClear();
    notesState.cancelNoteContentScan.mockClear();
    notesState.revealFolder.mockClear();
    notesState.setPendingStarredNavigation.mockClear();
    notesState.openNoteByAbsolutePath.mockClear();
    notesState.adoptAbsoluteNoteIntoNotesRoot.mockClear();
    notesState.cancelPendingDraftDiscard.mockClear();
    notesState.confirmPendingDraftDiscard.mockClear();
    notesState.getDisplayName.mockClear();
    mocks.toastState.addToast.mockClear();
    mocks.editorViewRegistry.getCurrentEditorNotePath.mockReset();
    mocks.editorViewRegistry.getCurrentEditorNotePath.mockImplementation(
      () => notesState.currentNote?.path ?? null,
    );
    mocks.editorViewRegistry.getCurrentEditorView.mockReset();
    mocks.sidebarDiscussion.canOpenSidebarDiscussionForSelection.mockReset();
    mocks.sidebarDiscussion.openSidebarDiscussionForSelection.mockReset();
    mocks.notesRootState.openNotesRoot.mockClear();
    openMarkdownFileListeners.clear();
    vi.mocked(messageDialog).mockReset();
    vi.mocked(useAbsoluteNoteExternalRenameSync).mockClear();
    vi.mocked(useCurrentNotesRootExternalPathSync).mockClear();
    vi.mocked(useNotesExternalSync).mockClear();
    vi.mocked(openStoredNotePath).mockReset();
    vi.mocked(runOpenNewChatShortcut).mockClear();
    vi.mocked(runTemporaryChatWelcomeShortcut).mockClear();

    uiState.setNotesChatPanelCollapsed.mockClear();
    uiState.toggleNotesChatPanel.mockClear();
    uiState.notesChatPanelCollapsed = true;
    uiState.notesChatFloatingOpen = false;
    uiState.setNotesChatFloatingOpen.mockClear();
    uiState.notesChatFloatingSize = { width: 420, height: 680 };
    uiState.setNotesChatFloatingSize.mockClear();
    uiState.resetNotesChatFloatingSize.mockClear();
    uiState.notesSplitPanesActive = false;
    uiState.setNotesSplitPanesActive.mockClear();
    uiState.setLayoutPanelDragging.mockClear();
    uiState.setLayoutPanelTransitioning.mockClear();
    uiState.setAppViewMode.mockClear();
    uiState.setNotesSidebarView.mockClear();
    uiState.universalPreviewTarget = null;
    uiState.universalPreviewIcon = null;
    uiState.universalPreviewColor = null;
    uiState.universalPreviewTone = null;
    uiState.notesPreviewTitle = null;
    uiState.setNotesPreviewTitle.mockClear();
    uiState.languagePreference = 'en';
  });

  it('shows notes store errors as toast messages', async () => {
    notesState.error = 'Save the note before closing it.';

    render(<NotesView />);

    await waitFor(() => {
      expect(mocks.toastState.addToast).toHaveBeenCalledWith(
        'Failed to save changes securely. Please try again.',
        'error',
        4500,
      );
    });
  });

  it('disables external note sync hooks while inactive', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };
    notesState.openTabs = [{ path: 'docs/alpha.md', name: 'alpha', isDirty: false }];

    render(<NotesView active={false} />);
    await waitForNotesRootInitializationEffects();

    expect(useCurrentNotesRootExternalPathSync).toHaveBeenCalledWith(null);
    expect(useNotesExternalSync).toHaveBeenCalledWith(null, '');
    expect(useAbsoluteNoteExternalRenameSync).toHaveBeenCalledWith(undefined);
  });

  it('passes inactive state through to the markdown editor', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };
    notesState.openTabs = [{ path: 'docs/alpha.md', name: 'alpha', isDirty: false }];

    render(<NotesView active={false} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByTestId('markdown-editor')).toBeNull();
    expect(screen.getByTestId('markdown-editor-shell')).toBeInTheDocument();
  });

  it('opens a split preview when a dragged tab is dropped on an editor edge', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# Alpha' };
    notesState.openTabs = [
      { path: 'docs/alpha.md', name: 'alpha', isDirty: false },
      { path: 'docs/beta.md', name: 'beta', isDirty: false },
    ];
    notesState.noteContentsCache = new Map([
      ['docs/beta.md', { content: '# Beta\n\nBeta body', modifiedAt: 1 }],
    ]);
    notesState.noteMetadata = {
      notes: {
        'docs/alpha.md': { icon: '✨' },
        'docs/beta.md': { icon: '🌲' },
      },
    };
    uiState.notesChatPanelCollapsed = false;

    render(<NotesView />);
    mockSplitDropRootRect({
      left: 0,
      right: 1000,
      top: 0,
      bottom: 800,
      width: 1000,
      height: 800,
    });

    await act(async () => {
      dispatchNotesTabSplitDrag({
        phase: 'move',
        path: 'docs/beta.md',
        clientX: 980,
        clientY: 400,
      });
      await Promise.resolve();
    });

    const dropOverlay = document.querySelector('[data-notes-split-drop-overlay="right"]');
    expect(dropOverlay).toBeInTheDocument();
    expect(dropOverlay?.firstElementChild?.className).toContain('bg-[var(--vlaina-color-editor-block-selection-drag-box)]');

    await act(async () => {
      dispatchNotesTabSplitDrag({
        phase: 'end',
        path: 'docs/beta.md',
        clientX: 980,
        clientY: 400,
      });
      await Promise.resolve();
    });

    expect(document.querySelector('[data-notes-split-drop-overlay="right"]')).toBeNull();
    expect(document.querySelector('[data-notes-split-layout="right"]')).toBeInTheDocument();
    expect(document.querySelector('[data-notes-split-preview-pane="true"]')).toBeInTheDocument();
    expect(screen.getByText('Beta body')).toBeInTheDocument();

    const betaPane = document.querySelector('[data-notes-split-leaf-path="docs/beta.md"] [data-notes-split-preview-pane="true"]') as HTMLElement | null;
    const starButton = betaPane?.querySelector<HTMLButtonElement>('button[aria-label="Add Star"]') ?? null;
    const chatButton = betaPane?.querySelector<HTMLButtonElement>('button[aria-label="Right Chat"]') ?? null;
    const chromeChatButton = betaPane?.querySelector<HTMLButtonElement>('[data-notes-split-pane-chrome="true"] button[aria-label="Right Chat"]') ?? null;
    expect(starButton).not.toBeNull();
    expect(chatButton).not.toBeNull();
    expect(chromeChatButton).not.toBeNull();
    expect(chatButton).toBe(chromeChatButton);
    expect(betaPane?.querySelector('button[aria-label="More"]')).not.toBeNull();
    const primaryChrome = document.querySelector('[data-notes-split-pane="primary"] [data-notes-split-pane-chrome="true"]') as HTMLElement | null;
    const primaryPane = document.querySelector('[data-notes-split-pane="primary"]') as HTMLElement | null;
    expect(betaPane?.querySelector('[data-notes-split-pane-chrome="true"] [data-notes-split-pane-icon="true"]')?.textContent).toBe('🌲');
    expect(primaryChrome?.querySelector('[data-notes-split-pane-icon="true"]')?.textContent).toBe('✨');
    expect(primaryChrome?.querySelector('button[aria-label="Add Star"]')).not.toBeNull();
    expect(primaryChrome?.querySelector('button[aria-label="Right Chat"]')).not.toBeNull();
    expect(primaryChrome?.querySelector('button[aria-label="More"]')).not.toBeNull();
    expect(primaryChrome?.querySelector('button[aria-label="Close"]')).not.toBeNull();
    expect(primaryPane?.querySelector('button[aria-label="Right Chat"]')).toBe(primaryChrome?.querySelector('button[aria-label="Right Chat"]'));
    expect(uiState.setNotesSplitPanesActive).toHaveBeenCalledWith(true);

    fireEvent.click(starButton as HTMLButtonElement);
    expect(notesState.toggleStarred).toHaveBeenCalledWith('docs/beta.md');

    await act(async () => {
      fireEvent.click(chatButton as HTMLButtonElement);
      await Promise.resolve();
    });
    expect(openStoredNotePath).toHaveBeenCalledWith('docs/beta.md', expect.any(Object));
    expect(uiState.setNotesChatFloatingOpen).not.toHaveBeenCalled();
  });

  it('clears the split preview when its tab closes', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# Alpha' };
    notesState.openTabs = [
      { path: 'docs/alpha.md', name: 'alpha', isDirty: false },
      { path: 'docs/beta.md', name: 'beta', isDirty: false },
    ];
    notesState.noteContentsCache = new Map([
      ['docs/beta.md', { content: '# Beta', modifiedAt: 1 }],
    ]);

    const { rerender } = render(<NotesView />);
    mockSplitDropRootRect({
      left: 0,
      right: 1000,
      top: 0,
      bottom: 800,
      width: 1000,
      height: 800,
    });

    await act(async () => {
      dispatchNotesTabSplitDrag({
        phase: 'end',
        path: 'docs/beta.md',
        clientX: 980,
        clientY: 400,
      });
      await Promise.resolve();
    });
    expect(document.querySelector('[data-notes-split-preview-pane="true"]')).toBeInTheDocument();

    notesState.openTabs = [{ path: 'docs/alpha.md', name: 'alpha', isDirty: false }];
    rerender(<NotesView />);

    await waitFor(() => {
      expect(document.querySelector('[data-notes-split-preview-pane="true"]')).toBeNull();
    });
  });

  it('splits the current tab by activating another open tab as the primary editor', async () => {
    notesState.currentNote = { path: 'docs/beta.md', content: '# Beta\n\nBeta active body' };
    notesState.openTabs = [
      { path: 'docs/alpha.md', name: 'alpha', isDirty: false },
      { path: 'docs/beta.md', name: 'beta', isDirty: false },
    ];
    notesState.noteContentsCache = new Map([
      ['docs/alpha.md', { content: '# Alpha', modifiedAt: 1 }],
      ['docs/beta.md', { content: '# Beta\n\nBeta active body', modifiedAt: 1 }],
    ]);
    vi.mocked(openStoredNotePath).mockImplementation(async (path) => {
      notesState.currentNote = {
        path,
        content: notesState.noteContentsCache.get(path)?.content ?? '',
      };
    });

    render(<NotesView />);
    mockSplitDropRootRect({
      left: 0,
      right: 1000,
      top: 0,
      bottom: 800,
      width: 1000,
      height: 800,
    });

    await act(async () => {
      dispatchNotesTabSplitDrag({
        phase: 'end',
        path: 'docs/beta.md',
        clientX: 980,
        clientY: 400,
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(openStoredNotePath).toHaveBeenCalledWith('docs/alpha.md', expect.any(Object));
      expect(document.querySelector('[data-notes-split-layout="right"]')).toBeInTheDocument();
    });
    expect(screen.getByText('Beta active body')).toBeInTheDocument();
  });

  it('can split an existing preview pane to show multiple previews', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# Alpha' };
    notesState.openTabs = [
      { path: 'docs/alpha.md', name: 'alpha', isDirty: false },
      { path: 'docs/beta.md', name: 'beta', isDirty: false },
      { path: 'docs/gamma.md', name: 'gamma', isDirty: false },
    ];
    notesState.noteContentsCache = new Map([
      ['docs/beta.md', { content: '# Beta\n\nBeta body', modifiedAt: 1 }],
      ['docs/gamma.md', { content: '# Gamma\n\nGamma body', modifiedAt: 1 }],
    ]);

    render(<NotesView />);
    mockSplitDropRootRect({
      left: 0,
      right: 1000,
      top: 0,
      bottom: 800,
      width: 1000,
      height: 800,
    });

    await act(async () => {
      dispatchNotesTabSplitDrag({
        phase: 'end',
        path: 'docs/beta.md',
        clientX: 980,
        clientY: 400,
      });
      await Promise.resolve();
    });

    const betaLeaf = document.querySelector('[data-notes-split-leaf-path="docs/beta.md"]') as HTMLElement | null;
    expect(betaLeaf).not.toBeNull();
    mockElementRect(betaLeaf as HTMLElement, {
      left: 500,
      right: 1000,
      top: 0,
      bottom: 800,
      width: 500,
      height: 800,
    });
    mockElementsFromPoint([betaLeaf as HTMLElement]);

    await act(async () => {
      dispatchNotesTabSplitDrag({
        phase: 'end',
        path: 'docs/gamma.md',
        clientX: 740,
        clientY: 790,
      });
      await Promise.resolve();
    });

    expect(document.querySelectorAll('[data-notes-split-preview-pane="true"]')).toHaveLength(2);
    expect(document.querySelector('[data-notes-split-layout="bottom"]')).toBeInTheDocument();
    expect(screen.getByText('Beta body')).toBeInTheDocument();
    expect(screen.getByText('Gamma body')).toBeInTheDocument();
  });

  it('activates a split preview in place without closing the pane', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# Alpha\n\nAlpha active body' };
    notesState.openTabs = [
      { path: 'docs/alpha.md', name: 'alpha', isDirty: false },
      { path: 'docs/beta.md', name: 'beta', isDirty: false },
    ];
    notesState.noteContentsCache = new Map([
      ['docs/alpha.md', { content: '# Alpha\n\nAlpha active body', modifiedAt: 1 }],
      ['docs/beta.md', { content: '# Beta\n\nBeta body', modifiedAt: 1 }],
    ]);
    vi.mocked(openStoredNotePath).mockImplementation(async (path) => {
      notesState.currentNote = {
        path,
        content: notesState.noteContentsCache.get(path)?.content ?? '',
      };
    });

    render(<NotesView />);
    mockSplitDropRootRect({
      left: 0,
      right: 1000,
      top: 0,
      bottom: 800,
      width: 1000,
      height: 800,
    });

    await act(async () => {
      dispatchNotesTabSplitDrag({
        phase: 'end',
        path: 'docs/beta.md',
        clientX: 980,
        clientY: 400,
      });
      await Promise.resolve();
    });

    fireEvent.click(screen.getByText('Beta body'));

    await waitFor(() => {
      expect(openStoredNotePath).toHaveBeenCalledWith('docs/beta.md', expect.any(Object));
      expect(document.querySelector('[data-notes-split-leaf-path="docs/beta.md"] [data-notes-split-pane="primary"]')).toBeInTheDocument();
      expect(document.querySelector('[data-notes-split-leaf-id="primary"][data-notes-split-leaf-path="docs/alpha.md"] [data-notes-split-preview-pane="true"]')).toBeInTheDocument();
    });
    expect(document.querySelectorAll('[data-notes-split-preview-pane="true"]')).toHaveLength(1);
  });

  it('opens a sidebar note split after prefetching the preview content', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# Alpha' };
    notesState.openTabs = [{ path: 'docs/alpha.md', name: 'alpha', isDirty: false }];
    notesState.prefetchNote.mockImplementation(async (path: string) => {
      notesState.noteContentsCache = new Map(notesState.noteContentsCache).set(path, {
        content: '# Gamma\n\nGamma sidebar body',
        modifiedAt: 1,
      });
    });

    render(<NotesView />);
    mockSplitDropRootRect({
      left: 0,
      right: 1000,
      top: 0,
      bottom: 800,
      width: 1000,
      height: 800,
    });

    await act(async () => {
      dispatchNotesTabSplitDrag({
        phase: 'end',
        source: 'sidebar',
        path: 'docs/gamma.md',
        clientX: 980,
        clientY: 400,
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(notesState.prefetchNote).toHaveBeenCalledWith('docs/gamma.md');
      expect(screen.getByText('Gamma sidebar body')).toBeInTheDocument();
    });
    expect(document.querySelector('[data-notes-split-preview-pane="true"]')).toBeInTheDocument();
  });

  it('keeps split panes stable when activating a sidebar preview', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# Alpha\n\nAlpha body' };
    notesState.openTabs = [{ path: 'docs/alpha.md', name: 'alpha', isDirty: false }];
    notesState.noteContentsCache = new Map([
      ['docs/alpha.md', { content: '# Alpha\n\nAlpha body', modifiedAt: 1 }],
    ]);
    notesState.prefetchNote.mockImplementation(async (path: string) => {
      notesState.noteContentsCache = new Map(notesState.noteContentsCache).set(path, {
        content: '# Gamma\n\nGamma sidebar body',
        modifiedAt: 1,
      });
    });
    vi.mocked(openStoredNotePath).mockImplementation(async (path) => {
      notesState.currentNote = {
        path,
        content: notesState.noteContentsCache.get(path)?.content ?? '',
      };
      notesState.openTabs = [{ path, name: path.split('/').pop() ?? path, isDirty: false }];
    });

    render(<NotesView />);
    mockSplitDropRootRect({
      left: 0,
      right: 1000,
      top: 0,
      bottom: 800,
      width: 1000,
      height: 800,
    });

    await act(async () => {
      dispatchNotesTabSplitDrag({
        phase: 'end',
        source: 'sidebar',
        path: 'docs/gamma.md',
        clientX: 980,
        clientY: 400,
      });
      await Promise.resolve();
    });

    fireEvent.click(screen.getByText('Gamma sidebar body'));

    await waitFor(() => {
      expect(document.querySelector('[data-notes-split-leaf-path="docs/gamma.md"] [data-notes-split-pane="primary"]')).toBeInTheDocument();
      expect(document.querySelector('[data-notes-split-leaf-id="primary"][data-notes-split-leaf-path="docs/alpha.md"] [data-notes-split-preview-pane="true"]')).toBeInTheDocument();
    });
    expect(document.querySelectorAll('[data-notes-split-preview-pane="true"]')).toHaveLength(1);
  });

  it('resizes split panes by dragging the divider', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# Alpha' };
    notesState.openTabs = [
      { path: 'docs/alpha.md', name: 'alpha', isDirty: false },
      { path: 'docs/beta.md', name: 'beta', isDirty: false },
    ];
    notesState.noteContentsCache = new Map([
      ['docs/beta.md', { content: '# Beta', modifiedAt: 1 }],
    ]);

    render(<NotesView />);
    mockSplitDropRootRect({
      left: 0,
      right: 1000,
      top: 0,
      bottom: 800,
      width: 1000,
      height: 800,
    });

    await act(async () => {
      dispatchNotesTabSplitDrag({
        phase: 'end',
        path: 'docs/beta.md',
        clientX: 980,
        clientY: 400,
      });
      await Promise.resolve();
    });

    const divider = document.querySelector('[data-notes-split-divider="horizontal"]') as HTMLElement | null;
    expect(divider).not.toBeNull();
    const layout = divider?.parentElement as HTMLElement;
    mockElementRect(layout, {
      left: 0,
      right: 1000,
      top: 0,
      bottom: 800,
      width: 1000,
      height: 800,
    });

    fireEvent.pointerDown(divider as HTMLElement, {
      clientX: 800,
      clientY: 400,
      button: 0,
      pointerId: 1,
    });

    expect(layout.style.gridTemplateColumns).toContain('0.8fr');
    expect(uiState.setLayoutPanelDragging).toHaveBeenCalledWith(true);

    fireEvent.pointerUp(document, {
      clientX: 800,
      clientY: 400,
      pointerId: 1,
    });

    expect(uiState.setLayoutPanelDragging).toHaveBeenCalledWith(false);
  });

  it('ignores blank-workspace drops while inactive', async () => {
    mocks.storageState.stat.mockResolvedValue({
      name: 'alpha.md',
      path: '/notesRoot/alpha.md',
      isDirectory: false,
      isFile: true,
    });

    render(<NotesView active={false} />);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      dispatchWindowDragEvent('dragenter', ['/notesRoot/alpha.md']);
      dispatchWindowDragEvent('drop', ['/notesRoot/alpha.md']);
      await Promise.resolve();
    });

    expect(screen.queryByTestId('blank-workspace-drop-overlay')).toBeNull();
    expect(notesState.openNote).not.toHaveBeenCalled();
    expect(mocks.notesRootState.openNotesRoot).not.toHaveBeenCalled();
  });

  it('creates a note when the workspace starts blank', async () => {
    render(<NotesView />);

    expect(screen.queryByTestId('markdown-editor')).toBeNull();
    expect(screen.queryByTestId('blank-workspace-drop-overlay')).toBeNull();
    expect(notesState.createNote).not.toHaveBeenCalled();
    expect(notesState.openNote).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(notesState.createNote).toHaveBeenCalledTimes(1);
    });
    expect(notesState.createNote).toHaveBeenCalledWith(undefined, { asDraft: true });
  });

  it('focuses the empty untitled draft title when returning from chat to notes', async () => {
    notesState.currentNote = { path: 'draft:blank', content: '' };
    notesState.openTabs = [{ path: 'draft:blank', name: '', isDirty: false }];
    notesState.draftNotes = {
      'draft:blank': { parentPath: null, name: '' },
    };

    const { rerender } = render(<NotesView active />);

    const titleInput = await screen.findByTestId('note-title-input');
    const outsideButton = document.createElement('button');
    document.body.appendChild(outsideButton);
    outsideButton.focus();
    expect(document.activeElement).toBe(outsideButton);

    rerender(<NotesView active={false} />);
    rerender(<NotesView active />);

    await waitFor(() => {
      expect(document.activeElement).toBe(titleInput);
    });

    document.body.removeChild(outsideButton);
  });

  it('does not create an untitled draft when the opened notesRoot already has files', async () => {
    notesState.rootFolder = {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true,
      children: [
        {
          id: 'docs/alpha.md',
          name: 'alpha.md',
          path: 'docs/alpha.md',
          isFolder: false,
        },
      ],
      expanded: true,
    };

    render(<NotesView />);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(notesState.createNote).not.toHaveBeenCalled();
  });

  it('does not create an untitled draft while opening a populated notesRoot from no notesRoot', async () => {
    mocks.notesRootState.currentNotesRoot = null;
    notesState.notesPath = '';
    notesState.rootFolder = null;
    notesState.rootFolderPath = null;

    const { rerender } = render(<NotesView />);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(notesState.createNote).toHaveBeenCalledWith(undefined, { asDraft: true });
    notesState.createNote.mockClear();

    mocks.notesRootState.currentNotesRoot = { path: '/notesRoot' };
    notesState.notesPath = '/notesRoot';
    notesState.isLoading = true;
    notesState.rootFolder = null;
    notesState.rootFolderPath = null;
    rerender(<NotesView />);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(notesState.createNote).not.toHaveBeenCalled();

    notesState.isLoading = false;
    notesState.rootFolder = {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true,
      children: [
        {
          id: 'dfds.md',
          name: 'dfds',
          path: 'dfds.md',
          isFolder: false,
        },
      ],
      expanded: true,
    };
    notesState.rootFolderPath = '/notesRoot';
    rerender(<NotesView />);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(notesState.createNote).not.toHaveBeenCalled();
  });

  it('does not create an untitled draft from a preserved previous-notesRoot sidebar tree', async () => {
    mocks.notesRootState.currentNotesRoot = { path: '/notes-root-next' };
    notesState.notesPath = '/notes-root-next';
    notesState.rootFolderPath = '/notes-root-old';
    notesState.rootFolder = {
      id: '',
      name: 'Old notes',
      path: '',
      isFolder: true,
      children: [],
      expanded: true,
    };

    const { rerender } = render(<NotesView />);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(notesState.createNote).not.toHaveBeenCalled();

    notesState.rootFolderPath = '/notes-root-next';
    notesState.rootFolder = {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true,
      children: [
        {
          id: 'existing.md',
          name: 'existing',
          path: 'existing.md',
          isFolder: false,
        },
      ],
      expanded: true,
    };
    rerender(<NotesView />);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(notesState.createNote).not.toHaveBeenCalled();
  });

  it('does not create an untitled draft while the opened folder path has not reached the notes store', async () => {
    notesState.notesPath = '';
    mocks.notesRootState.currentNotesRoot = { path: '/notesRoot' };

    render(<NotesView />);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(notesState.createNote).not.toHaveBeenCalled();
    expect(notesState.notesPath).toBe('');
  });

  it('reveals the pending starred note path before opening it in the workspace', async () => {
    notesState.currentNote = { path: '/external/notesRoot/docs/alpha.md', content: '# alpha' };
    notesState.openTabs = [
      { path: '/external/notesRoot/docs/alpha.md', name: 'alpha', isDirty: false },
    ];
    notesState.pendingStarredNavigation = {
      notesRootPath: '/notesRoot',
      kind: 'note',
      relativePath: 'docs/alpha.md',
      skipWorkspaceRestore: true,
    };

    const { rerender } = render(<NotesView />);

    await waitFor(() => {
      expect(notesState.setPendingStarredNavigation).toHaveBeenCalledWith(null);
      expect(notesState.revealFolder).toHaveBeenCalledWith('docs/alpha.md');
      expect(notesState.openNote).toHaveBeenCalledWith('docs/alpha.md', false);
    });
    expect(notesState.setPendingStarredNavigation.mock.invocationCallOrder[0]).toBeLessThan(
      notesState.revealFolder.mock.invocationCallOrder[0]
    );
    expect(notesState.revealFolder.mock.invocationCallOrder[0]).toBeLessThan(
      notesState.openNote.mock.invocationCallOrder[0]
    );

    notesState.rootFolder = {
      ...notesState.rootFolder!,
      children: [...notesState.rootFolder!.children],
    };
    rerender(<NotesView />);

    expect(notesState.setPendingStarredNavigation).toHaveBeenCalledTimes(1);
    expect(notesState.revealFolder).toHaveBeenCalledTimes(1);
    expect(notesState.openNote).toHaveBeenCalledTimes(1);
  });

  it('waits for the opened folder tree before consuming pending starred navigation', async () => {
    notesState.currentNote = { path: '/external/notesRoot/docs/alpha.md', content: '# alpha' };
    notesState.openTabs = [
      { path: '/external/notesRoot/docs/alpha.md', name: 'alpha', isDirty: false },
    ];
    notesState.pendingStarredNavigation = {
      notesRootPath: '/notesRoot',
      kind: 'note',
      relativePath: 'docs/alpha.md',
      skipWorkspaceRestore: true,
    };
    notesState.rootFolderPath = '/old-notesRoot';

    const { rerender } = render(<NotesView />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(notesState.setPendingStarredNavigation).not.toHaveBeenCalled();
    expect(notesState.openNote).not.toHaveBeenCalled();

    notesState.rootFolderPath = '/notesRoot';
    notesState.rootFolder = {
      ...notesState.rootFolder!,
      children: [...notesState.rootFolder!.children],
    };
    rerender(<NotesView />);

    await waitFor(() => {
      expect(notesState.setPendingStarredNavigation).toHaveBeenCalledWith(null);
      expect(notesState.openNote).toHaveBeenCalledWith('docs/alpha.md', false);
    });
  });

  it('creates an editable draft when switching from a populated notesRoot to an empty notesRoot', async () => {
    mocks.notesRootState.currentNotesRoot = { path: '/notes-root-a' };
    notesState.notesPath = '/notes-root-a';
    notesState.rootFolderPath = '/notes-root-a';
    notesState.currentNote = { path: 'alpha.md', content: '# alpha' };
    notesState.openTabs = [{ path: 'alpha.md', name: 'alpha', isDirty: false }];

    const { rerender } = render(<NotesView />);

    await act(async () => {
      await Promise.resolve();
    });

    notesState.createNote.mockClear();
    mocks.notesRootState.currentNotesRoot = { path: '/notes-root-b' };
    notesState.notesPath = '/notes-root-b';
    notesState.currentNote = null;
    notesState.openTabs = [];
    notesState.rootFolder = {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true,
      children: [],
      expanded: true,
    };
    notesState.rootFolderPath = '/notes-root-b';
    rerender(<NotesView />);

    await waitFor(() => {
      expect(notesState.createNote).toHaveBeenCalledTimes(1);
    });
    expect(notesState.createNote).toHaveBeenCalledWith(undefined, { asDraft: true });
  });

  it('creates a fresh editable note instead of opening an existing draft automatically', async () => {
    notesState.draftNotes = {
      'draft:existing': {
        parentPath: null,
        name: '',
      },
    };

    render(<NotesView />);

    expect(screen.queryByTestId('markdown-editor')).toBeNull();
    expect(notesState.openNote).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(notesState.createNote).toHaveBeenCalledTimes(1);
    });
  });

  it('creates an in-memory scratch draft when the workspace starts blank without an open folder', async () => {
    mocks.notesRootState.currentNotesRoot = null;
    mocks.notesRootState.hasInitialized = true;

    render(<NotesView />);

    expect(screen.queryByTestId('markdown-editor')).toBeNull();

    await waitFor(() => {
      expect(notesState.createNote).toHaveBeenCalledTimes(1);
    });
    expect(notesState.createNote).toHaveBeenCalledWith(undefined, { asDraft: true });
  });

  it('waits for notesRoot store initialization before creating a blank no-notesRoot scratch draft', async () => {
    mocks.notesRootState.currentNotesRoot = null;
    mocks.notesRootState.hasInitialized = false;
    notesState.notesPath = '';
    notesState.rootFolder = null;
    notesState.rootFolderPath = null;

    const { rerender } = render(<NotesView />);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(notesState.createNote).not.toHaveBeenCalled();

    mocks.notesRootState.hasInitialized = true;
    rerender(<NotesView />);

    await waitFor(() => {
      expect(notesState.createNote).toHaveBeenCalledWith(undefined, { asDraft: true });
    });
  });

  it('does not create a transient draft while a previous notesRoot is still hydrating', async () => {
    mocks.notesRootState.currentNotesRoot = null;
    mocks.notesRootState.hasInitialized = false;
    notesState.notesPath = '';
    notesState.rootFolder = null;
    notesState.rootFolderPath = null;

    const { rerender } = render(<NotesView />);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(notesState.createNote).not.toHaveBeenCalled();

    mocks.notesRootState.currentNotesRoot = { path: '/notesRoot' };
    mocks.notesRootState.hasInitialized = true;
    notesState.notesPath = '/notesRoot';
    notesState.currentNote = { path: 'docs/restored.md', content: '# restored' };
    notesState.openTabs = [{ path: 'docs/restored.md', name: 'restored', isDirty: false }];
    notesState.rootFolder = {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true,
      children: [
        {
          id: 'docs/restored.md',
          name: 'restored',
          path: 'docs/restored.md',
          isFolder: false,
        },
      ],
      expanded: true,
    };
    notesState.rootFolderPath = '/notesRoot';
    rerender(<NotesView />);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(notesState.createNote).not.toHaveBeenCalled();
  });

  it('does not create an untitled note while the previous workspace note is restoring', async () => {
    notesState.isLoading = true;

    const { rerender } = render(<NotesView />);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(notesState.createNote).not.toHaveBeenCalled();

    notesState.isLoading = false;
    notesState.currentNote = { path: 'docs/restored.md', content: '# restored' };
    notesState.openTabs = [{ path: 'docs/restored.md', name: 'restored', isDirty: false }];
    rerender(<NotesView />);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(notesState.createNote).not.toHaveBeenCalled();
  });

  it('does not create an untitled draft while notesRoot initialization restores over a stale root folder', async () => {
    let resolveLoadFileTree: (() => void) | null = null;
    notesState.loadFileTree.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveLoadFileTree = resolve;
    }));

    const { rerender } = render(<NotesView />);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(notesState.createNote).not.toHaveBeenCalled();

    notesState.currentNote = { path: 'docs/restored.md', content: '# restored' };
    notesState.openTabs = [{ path: 'docs/restored.md', name: 'restored', isDirty: false }];

    await act(async () => {
      resolveLoadFileTree?.();
      await Promise.resolve();
    });
    rerender(<NotesView />);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(notesState.createNote).not.toHaveBeenCalled();
  });

  it('does not recreate a blank note after the user closes the last tab', async () => {
    notesState.currentNote = { path: 'draft:blank', content: '' };
    notesState.openTabs = [{ path: 'draft:blank', name: '', isDirty: false }];
    notesState.draftNotes = {
      'draft:blank': { parentPath: null, name: '' },
    };

    const { rerender } = render(<NotesView />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(notesState.createNote).not.toHaveBeenCalled();

    notesState.currentNote = null;
    notesState.openTabs = [];
    notesState.draftNotes = {};
    rerender(<NotesView />);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(notesState.createNote).not.toHaveBeenCalled();
  });

  it('creates a draft when a blank workspace only has stale recently closed tabs', async () => {
    notesState.currentNote = null;
    notesState.openTabs = [];
    notesState.recentlyClosedTabs = [
      {
        tab: { path: 'alpha.md', name: 'alpha', isDirty: false },
        index: 0,
      },
    ];

    render(<NotesView />);

    await waitFor(() => {
      expect(notesState.createNote).toHaveBeenCalledWith(undefined, { asDraft: true });
    });
  });

  it('does not create an untitled note after an opened workspace becomes empty', async () => {
    notesState.currentNote = { path: 'alpha.md', content: '# alpha' };
    notesState.openTabs = [{ path: 'alpha.md', name: 'alpha', isDirty: false }];

    const { rerender } = render(<NotesView />);

    notesState.createNote.mockClear();
    notesState.currentNote = null;
    notesState.openTabs = [];
    rerender(<NotesView />);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(notesState.createNote).not.toHaveBeenCalled();
  });

  it('opens a dropped folder when the workspace is blank', async () => {
    mocks.storageState.stat.mockResolvedValue({
      name: 'dropped-notesRoot',
      path: '/dropped-notesRoot',
      isDirectory: true,
      isFile: false,
    });

    render(<NotesView />);

    await act(async () => {
      dispatchWindowDragEvent('dragenter', ['/dropped-notesRoot']);
    });

    expect(screen.getByTestId('blank-workspace-drop-overlay')).toBeInTheDocument();

    await act(async () => {
      dispatchWindowDragEvent('drop', ['/dropped-notesRoot']);
    });

    await waitFor(() => {
      expect(mocks.notesRootState.openNotesRoot).toHaveBeenCalledWith('/dropped-notesRoot');
    });

    await waitFor(() => {
      expect(screen.queryByTestId('blank-workspace-drop-overlay')).toBeNull();
    });
  });

  it('opens a dropped markdown file when the workspace is blank', async () => {
    mocks.storageState.stat.mockResolvedValue({
      name: 'alpha.md',
      path: '/notesRoot/alpha.md',
      isDirectory: false,
      isFile: true,
    });

    render(<NotesView />);

    await act(async () => {
      dispatchWindowDragEvent('drop', ['/notesRoot/alpha.md']);
    });

    await waitFor(() => {
      expect(notesState.openNote).toHaveBeenCalledWith('alpha.md');
    });
  });

  it('opens a dropped .markdown file when the workspace is blank', async () => {
    mocks.storageState.stat.mockResolvedValue({
      name: 'alpha.markdown',
      path: '/notesRoot/alpha.markdown',
      isDirectory: false,
      isFile: true,
    });

    render(<NotesView />);

    await act(async () => {
      dispatchWindowDragEvent('drop', ['/notesRoot/alpha.markdown']);
    });

    await waitFor(() => {
      expect(notesState.openNote).toHaveBeenCalledWith('alpha.markdown');
    });
  });

  it('rejects a dropped folder when authorization returns a relative path', async () => {
    mocks.storageState.stat.mockResolvedValue({
      name: 'docs',
      path: 'relative/docs',
      isDirectory: true,
      isFile: false,
    });

    render(<NotesView />);

    await act(async () => {
      dispatchWindowDragEvent('drop', ['/tmp/docs']);
    });

    await waitFor(() => {
      expect(messageDialog).toHaveBeenCalled();
    });
    expect(mocks.notesRootState.openNotesRoot).not.toHaveBeenCalled();
  });

  it('opens a markdown file from the Electron file association event', async () => {
    const authorizePath = vi.fn().mockResolvedValue({
      name: 'alpha.md',
      path: '/notesRoot/alpha.md',
      isDirectory: false,
      isFile: true,
    });
    (window as any).vlainaDesktop = {
      platform: 'electron',
      dragDrop: { authorizePath },
    };

    render(<NotesView />);

    await act(async () => {
      dispatchDesktopOpenMarkdownFile('/notesRoot/alpha.md');
    });

    await waitFor(() => {
      expect(authorizePath).toHaveBeenCalledWith('/notesRoot/alpha.md');
      expect(notesState.openNote).toHaveBeenCalledWith('alpha.md');
    });
    expect(notesState.openNoteByAbsolutePath).not.toHaveBeenCalledWith('/notesRoot/alpha.md');
  });

  it('opens a dropped markdown file after opening its notesRoot from a new workspace', async () => {
    mocks.notesRootState.currentNotesRoot = null;
    notesState.notesPath = '';
    notesState.rootFolder = null;
    notesState.rootFolderPath = null;
    mocks.storageState.stat.mockResolvedValue({
      name: 'alpha.md',
      path: '/notesRoot/alpha.md',
      isDirectory: false,
      isFile: true,
    });
    mocks.notesRootState.openNotesRoot.mockImplementation(async (path: string) => {
      mocks.notesRootState.currentNotesRoot = { path };
      notesState.notesPath = path;
      return true;
    });

    const { rerender } = render(<NotesView />);

    await act(async () => {
      dispatchWindowDragEvent('drop', ['/notesRoot/alpha.md']);
    });

    await waitFor(() => {
      expect(mocks.notesRootState.openNotesRoot).toHaveBeenCalledWith('/notesRoot', undefined, {
        preserveSidebarTree: false,
      });
    });

    rerender(<NotesView />);

    await waitFor(() => {
      expect(notesState.openNote).toHaveBeenCalledWith('alpha.md');
      expect(notesState.loadFileTree).toHaveBeenCalledWith(true);
    });
  });

  it('accepts a blank-workspace file drag before Electron exposes file paths', async () => {
    mocks.storageState.stat.mockResolvedValue({
      name: 'alpha.md',
      path: '/notesRoot/alpha.md',
      isDirectory: false,
      isFile: true,
    });

    render(<NotesView />);

    await act(async () => {
      dispatchWindowDragEvent('dragenter', [], ['Files']);
    });

    expect(screen.getByTestId('blank-workspace-drop-overlay')).toBeInTheDocument();

    await act(async () => {
      dispatchWindowDragEvent('drop', ['/notesRoot/alpha.md']);
    });

    await waitFor(() => {
      expect(notesState.openNote).toHaveBeenCalledWith('alpha.md');
    });
  });

  it('opens a dropped markdown file through Electron file path resolution', async () => {
    const getPathForFile = vi.fn((file: File) => `/notesRoot/${file.name}`);
    const authorizePath = vi.fn(async (path: string) => ({
      name: 'alpha.md',
      path,
      isDirectory: false,
      isFile: true,
    }));
    (window as any).vlainaDesktop = {
      platform: 'electron',
      dragDrop: { getPathForFile, authorizePath },
    };
    mocks.storageState.stat.mockResolvedValue({
      name: 'alpha.md',
      path: '/notesRoot/alpha.md',
      isDirectory: false,
      isFile: true,
    });

    render(<NotesView />);

    const file = createDropFile('/notesRoot/alpha.md', false);
    await act(async () => {
      dispatchWindowDragEventWithFiles('drop', [file]);
    });

    await waitFor(() => {
      expect(getPathForFile).toHaveBeenCalledWith(file);
      expect(authorizePath).toHaveBeenCalledWith('/notesRoot/alpha.md');
      expect(notesState.openNote).toHaveBeenCalledWith('alpha.md');
    });
  });

  it('opens the authorized path for dropped markdown files when Electron normalizes it', async () => {
    const getPathForFile = vi.fn(() => '/tmp/link.md');
    const authorizePath = vi.fn(async () => ({
      name: 'canonical.md',
      path: '/notesRoot/canonical.md',
      isDirectory: false,
      isFile: true,
    }));
    (window as any).vlainaDesktop = {
      platform: 'electron',
      dragDrop: { getPathForFile, authorizePath },
    };

    render(<NotesView />);

    const file = createDropFile('/tmp/link.md', false);
    await act(async () => {
      dispatchWindowDragEventWithFiles('drop', [file]);
    });

    await waitFor(() => {
      expect(getPathForFile).toHaveBeenCalledWith(file);
      expect(authorizePath).toHaveBeenCalledWith('/tmp/link.md');
      expect(notesState.openNote).toHaveBeenCalledWith('canonical.md');
      expect(notesState.openNote).not.toHaveBeenCalledWith('link.md');
    });
  });


  it('cycles to the next note in tree order when only one note tab is open', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };
    notesState.openTabs = [{ path: 'docs/alpha.md', name: 'alpha', isDirty: false }];
    notesState.rootFolder = {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true,
      expanded: true,
      children: [
        {
          id: 'docs',
          name: 'docs',
          path: 'docs',
          isFolder: true,
          expanded: true,
          children: [
            { id: 'docs/alpha.md', name: 'alpha', path: 'docs/alpha.md', isFolder: false },
            { id: 'docs/beta.md', name: 'beta', path: 'docs/beta.md', isFolder: false },
          ],
        },
      ],
    };
    shortcutMatchesMock.mockImplementation((event, binding) => binding === 'nextNoteTab' && event.key === 'Tab' && event.ctrlKey && !event.shiftKey);

    render(<NotesView />);

    fireEvent.keyDown(document, { key: 'Tab', ctrlKey: true });

    await waitFor(() => {
      expect(notesState.revealFolder).toHaveBeenCalledWith('docs/beta.md');
      expect(notesState.openNote).toHaveBeenCalledWith('docs/beta.md');
    });
  });

  it('cycles to the previous note in tree order when only one note tab is open', async () => {
    notesState.currentNote = { path: 'docs/beta.md', content: '# beta' };
    notesState.openTabs = [{ path: 'docs/beta.md', name: 'beta', isDirty: false }];
    notesState.rootFolder = {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true,
      expanded: true,
      children: [
        {
          id: 'docs',
          name: 'docs',
          path: 'docs',
          isFolder: true,
          expanded: true,
          children: [
            { id: 'docs/alpha.md', name: 'alpha', path: 'docs/alpha.md', isFolder: false },
            { id: 'docs/beta.md', name: 'beta', path: 'docs/beta.md', isFolder: false },
          ],
        },
      ],
    };
    shortcutMatchesMock.mockImplementation((event, binding) => binding === 'previousNoteTab' && event.key === 'Tab' && event.ctrlKey && event.shiftKey);

    render(<NotesView />);

    fireEvent.keyDown(document, { key: 'Tab', ctrlKey: true, shiftKey: true });

    await waitFor(() => {
      expect(notesState.revealFolder).toHaveBeenCalledWith('docs/alpha.md');
      expect(notesState.openNote).toHaveBeenCalledWith('docs/alpha.md');
    });
  });

  it('quotes the current editor selection to chat on Ctrl+L', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };
    const editorView = {
      state: {
        selection: {
          empty: false,
        },
      },
    };
    mocks.editorViewRegistry.getCurrentEditorView.mockReturnValue(editorView);
    mocks.sidebarDiscussion.canOpenSidebarDiscussionForSelection.mockReturnValue(true);
    shortcutMatchesMock.mockImplementation((event, binding) => (
      binding === 'toggleEmbeddedChat' && event.key.toLowerCase() === 'l' && event.ctrlKey
    ));

    render(<NotesView />);
    await waitForNotesRootInitializationEffects();

    const event = new KeyboardEvent('keydown', {
      key: 'l',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(mocks.sidebarDiscussion.openSidebarDiscussionForSelection).toHaveBeenCalledWith(editorView);
    expect(uiState.toggleNotesChatPanel).not.toHaveBeenCalled();
  });

  it('opens the floating notes chat on Ctrl+L when there is no editor selection', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };
    mocks.editorViewRegistry.getCurrentEditorView.mockReturnValue({
      state: {
        selection: {
          empty: true,
        },
      },
    });
    shortcutMatchesMock.mockImplementation((event, binding) => (
      binding === 'toggleEmbeddedChat' && event.key.toLowerCase() === 'l' && event.ctrlKey
    ));

    render(<NotesView />);
    await waitForNotesRootInitializationEffects();

    const event = new KeyboardEvent('keydown', {
      key: 'l',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(uiState.setNotesChatPanelCollapsed).toHaveBeenCalledWith(true);
    expect(uiState.setNotesChatFloatingOpen).toHaveBeenCalledWith(true);
    expect(uiState.toggleNotesChatPanel).not.toHaveBeenCalled();
    expect(mocks.sidebarDiscussion.openSidebarDiscussionForSelection).not.toHaveBeenCalled();
  });

  it('quotes the current block selection to chat on Ctrl+L', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };
    const editorView = {
      state: {
        selection: {
          empty: true,
        },
      },
    };
    mocks.editorViewRegistry.getCurrentEditorView.mockReturnValue(editorView);
    mocks.sidebarDiscussion.canOpenSidebarDiscussionForSelection.mockReturnValue(true);
    shortcutMatchesMock.mockImplementation((event, binding) => (
      binding === 'toggleEmbeddedChat' && event.key.toLowerCase() === 'l' && event.ctrlKey
    ));

    render(<NotesView />);
    await waitForNotesRootInitializationEffects();

    const event = new KeyboardEvent('keydown', {
      key: 'l',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(mocks.sidebarDiscussion.openSidebarDiscussionForSelection).toHaveBeenCalledWith(editorView);
    expect(uiState.toggleNotesChatPanel).not.toHaveBeenCalled();
  });

  it('uses the saved size for the floating notes chat panel', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };
    uiState.notesChatFloatingOpen = true;
    uiState.notesChatFloatingSize = { width: 512, height: 720 };

    render(<NotesView />);
    await waitForNotesRootInitializationEffects();

    const panel = document.querySelector('[data-notes-chat-floating="true"]') as HTMLElement;
    expect(panel).toBeInTheDocument();
    expect(panel.style.width).toBe('512px');
    expect(panel.style.height).toBe('720px');
    expect(document.querySelector('[data-notes-chat-floating-resize-handle="left"]')).toBeInTheDocument();
    expect(document.querySelector('[data-notes-chat-floating-resize-handle="top"]')).toBeInTheDocument();
    expect(document.querySelector('[data-notes-chat-floating-resize-handle="top-left"]')).toBeInTheDocument();
  });

  it('keeps the floating chat mounted and inactive while it is closed', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };

    const { rerender } = render(<NotesView />);
    await waitForNotesRootInitializationEffects();

    const chatView = await screen.findByTestId('embedded-chat-view');
    const floatingShell = chatView.parentElement;
    expect(chatView).toHaveAttribute('data-active', 'false');
    expect(floatingShell).toHaveAttribute('aria-hidden', 'true');
    expect(floatingShell).toHaveAttribute('inert');
    expect(floatingShell).not.toHaveClass('hidden');
    expect(floatingShell).toHaveClass('invisible');
    expect(document.querySelector('[data-notes-chat-floating="true"]')).toBeNull();

    uiState.notesChatFloatingOpen = true;
    rerender(<NotesView />);

    expect(screen.getByTestId('embedded-chat-view')).toBe(chatView);
    expect(chatView).toHaveAttribute('data-active', 'true');
    expect(floatingShell).not.toHaveAttribute('inert');
    expect(floatingShell).not.toHaveClass('invisible');
    expect(document.querySelector('[data-notes-chat-floating="true"]')).toBeInTheDocument();
  });

  it('opens a new chat from the floating notes chat panel without docking it', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };
    uiState.notesChatFloatingOpen = true;
    shortcutMatchesMock.mockImplementation((event, binding) => (
      binding === 'openNewChat' &&
      event.key.toLowerCase() === 'o' &&
      event.ctrlKey &&
      event.shiftKey
    ));

    render(<NotesView />);
    await waitForNotesRootInitializationEffects();

    const event = new KeyboardEvent('keydown', {
      key: 'O',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    screen.getByTestId('embedded-chat-view').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(runOpenNewChatShortcut).toHaveBeenCalledTimes(1);
    expect(uiState.setNotesChatPanelCollapsed).not.toHaveBeenCalled();
    expect(uiState.setNotesChatFloatingOpen).not.toHaveBeenCalled();
  });

  it('opens a temporary chat from the floating notes chat panel without docking it', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };
    uiState.notesChatFloatingOpen = true;
    shortcutMatchesMock.mockImplementation((event, binding) => (
      binding === 'toggleTemporaryChatWelcome' &&
      event.key.toLowerCase() === 'j' &&
      event.ctrlKey &&
      event.shiftKey
    ));

    render(<NotesView />);
    await waitForNotesRootInitializationEffects();

    const event = new KeyboardEvent('keydown', {
      key: 'J',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    screen.getByTestId('embedded-chat-view').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(runTemporaryChatWelcomeShortcut).toHaveBeenCalledTimes(1);
    expect(uiState.setNotesChatPanelCollapsed).not.toHaveBeenCalled();
    expect(uiState.setNotesChatFloatingOpen).not.toHaveBeenCalled();
  });

  it('opens the notes chat side panel as a docked resizable panel', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };
    uiState.notesChatPanelCollapsed = false;
    uiState.notesChatFloatingOpen = false;

    const { rerender } = render(<NotesView />);
    await waitForNotesRootInitializationEffects();

    const resizablePanel = screen.getByTestId('resizable-panel');
    expect(resizablePanel).toHaveAttribute('data-storage-key', 'vlaina_notes_chat_panel_width_v2');
    expect(resizablePanel).toHaveAttribute('data-default-width', '320');
    expect(document.querySelector('[data-notes-chat-panel="true"]')).toBeInTheDocument();
    expect(document.querySelector('[data-notes-chat-floating="true"]')).toBeNull();
    expect(uiState.setLayoutPanelTransitioning).toHaveBeenCalledWith('docked-chat', true);

    uiState.setLayoutPanelTransitioning.mockClear();
    uiState.notesChatPanelCollapsed = true;
    rerender(<NotesView />);

    expect(uiState.setLayoutPanelTransitioning).toHaveBeenCalledWith('docked-chat', true);
    expect(document.querySelector('[data-notes-chat-panel-motion="true"]')).toHaveAttribute('inert');
    expect(screen.getAllByTestId('embedded-chat-view')).toHaveLength(1);
  });

  it('refreshes the native caret overlay after docked chat panel width changes', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };
    uiState.notesChatPanelCollapsed = false;
    uiState.notesChatFloatingOpen = false;
    const refreshListener = vi.fn();
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
    document.addEventListener(NATIVE_CARET_OVERLAY_REFRESH_EVENT, refreshListener);

    try {
      render(<NotesView />);
      await waitForNotesRootInitializationEffects();
      refreshListener.mockClear();
      requestAnimationFrameSpy.mockClear();

      fireEvent.click(screen.getByTestId('resizable-panel-width-change'));

      expect(requestAnimationFrameSpy).toHaveBeenCalled();
      expect(refreshListener).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener(NATIVE_CARET_OVERLAY_REFRESH_EVENT, refreshListener);
    }
  });

  it('resizes floating notes chat from the left, top, and top-left handles', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };
    uiState.notesChatFloatingOpen = true;
    uiState.notesChatFloatingSize = { width: 420, height: 680 };

    render(<NotesView />);
    await waitForNotesRootInitializationEffects();

    const leftHandle = document.querySelector('[data-notes-chat-floating-resize-handle="left"]') as HTMLElement;
    fireEvent.pointerDown(leftHandle, { clientX: 600, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 540, clientY: 300 });

    expect(uiState.setNotesChatFloatingSize).not.toHaveBeenCalled();

    fireEvent.pointerUp(window);

    expect(uiState.setLayoutPanelDragging).toHaveBeenCalledWith(true);
    expect(uiState.setNotesChatFloatingSize).toHaveBeenCalledWith({ width: 480, height: 680 });
    expect(uiState.setLayoutPanelDragging).toHaveBeenLastCalledWith(false);

    uiState.setNotesChatFloatingSize.mockClear();
    uiState.setLayoutPanelDragging.mockClear();

    const topHandle = document.querySelector('[data-notes-chat-floating-resize-handle="top"]') as HTMLElement;
    fireEvent.pointerDown(topHandle, { clientX: 500, clientY: 600 });
    fireEvent.pointerMove(window, { clientX: 500, clientY: 560 });

    expect(uiState.setNotesChatFloatingSize).not.toHaveBeenCalled();

    fireEvent.pointerUp(window);

    expect(uiState.setLayoutPanelDragging).toHaveBeenCalledWith(true);
    expect(uiState.setNotesChatFloatingSize).toHaveBeenCalledWith({ width: 420, height: 720 });
    expect(uiState.setLayoutPanelDragging).toHaveBeenLastCalledWith(false);

    uiState.setNotesChatFloatingSize.mockClear();
    uiState.setLayoutPanelDragging.mockClear();

    const topLeftHandle = document.querySelector('[data-notes-chat-floating-resize-handle="top-left"]') as HTMLElement;
    fireEvent.pointerDown(topLeftHandle, { clientX: 600, clientY: 600 });
    fireEvent.pointerMove(window, { clientX: 570, clientY: 570 });

    expect(uiState.setNotesChatFloatingSize).not.toHaveBeenCalled();

    fireEvent.pointerUp(window);

    expect(uiState.setLayoutPanelDragging).toHaveBeenCalledWith(true);
    expect(uiState.setNotesChatFloatingSize).toHaveBeenCalledWith({ width: 450, height: 710 });
    expect(uiState.setLayoutPanelDragging).toHaveBeenLastCalledWith(false);
  });

  it('resets floating notes chat size when double-clicking resize handles', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };
    uiState.notesChatFloatingOpen = true;

    render(<NotesView />);
    await waitForNotesRootInitializationEffects();

    fireEvent.doubleClick(document.querySelector('[data-notes-chat-floating-resize-handle="left"]') as HTMLElement);
    fireEvent.doubleClick(document.querySelector('[data-notes-chat-floating-resize-handle="top"]') as HTMLElement);
    fireEvent.doubleClick(document.querySelector('[data-notes-chat-floating-resize-handle="top-left"]') as HTMLElement);

    expect(uiState.resetNotesChatFloatingSize).toHaveBeenCalledTimes(3);
  });

  it('closes the open side chat panel on Ctrl+L', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };
    uiState.notesChatPanelCollapsed = false;
    const editorView = {
      state: {
        selection: {
          empty: false,
        },
      },
    };
    mocks.editorViewRegistry.getCurrentEditorView.mockReturnValue(editorView);
    shortcutMatchesMock.mockImplementation((event, binding) => (
      binding === 'toggleEmbeddedChat' && event.key.toLowerCase() === 'l' && event.ctrlKey
    ));

    render(<NotesView />);
    await waitForNotesRootInitializationEffects();

    const event = new KeyboardEvent('keydown', {
      key: 'l',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(uiState.setNotesChatPanelCollapsed).toHaveBeenCalledWith(true);
    expect(uiState.setNotesChatFloatingOpen).not.toHaveBeenCalled();
    expect(uiState.toggleNotesChatPanel).not.toHaveBeenCalled();
    expect(mocks.sidebarDiscussion.openSidebarDiscussionForSelection).not.toHaveBeenCalled();
  });

  it('closes the floating notes chat on Ctrl+L when it is already open', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };
    uiState.notesChatPanelCollapsed = true;
    uiState.notesChatFloatingOpen = true;
    mocks.editorViewRegistry.getCurrentEditorView.mockReturnValue({
      state: {
        selection: {
          empty: false,
        },
      },
    });
    shortcutMatchesMock.mockImplementation((event, binding) => (
      binding === 'toggleEmbeddedChat' && event.key.toLowerCase() === 'l' && event.ctrlKey
    ));

    render(<NotesView />);
    await waitForNotesRootInitializationEffects();

    const event = new KeyboardEvent('keydown', {
      key: 'l',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(uiState.setNotesChatFloatingOpen).toHaveBeenCalledWith(false);
    expect(uiState.setNotesChatPanelCollapsed).not.toHaveBeenCalled();
    expect(uiState.toggleNotesChatPanel).not.toHaveBeenCalled();
    expect(mocks.sidebarDiscussion.openSidebarDiscussionForSelection).not.toHaveBeenCalled();
  });

  it('does not cycle notes on Ctrl+Tab from inside a dialog', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };
    notesState.openTabs = [{ path: 'docs/alpha.md', name: 'alpha', isDirty: false }];
    notesState.rootFolder = {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true,
      expanded: true,
      children: [
        {
          id: 'docs',
          name: 'docs',
          path: 'docs',
          isFolder: true,
          expanded: true,
          children: [
            { id: 'docs/alpha.md', name: 'alpha', path: 'docs/alpha.md', isFolder: false },
            { id: 'docs/beta.md', name: 'beta', path: 'docs/beta.md', isFolder: false },
          ],
        },
      ],
    };
    shortcutMatchesMock.mockImplementation((event, binding) => binding === 'nextNoteTab' && event.key === 'Tab' && event.ctrlKey && !event.shiftKey);

    render(<NotesView />);
    await waitForNotesRootInitializationEffects();
    notesState.openNote.mockClear();
    notesState.revealFolder.mockClear();

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    dialog.appendChild(button);
    document.body.appendChild(dialog);

    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(notesState.revealFolder).not.toHaveBeenCalled();
    expect(notesState.openNote).not.toHaveBeenCalled();
  });

  it('does not let notes shortcuts steal editable copy', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };
    shortcutMatchesMock.mockImplementation((event, binding) => (
      binding === 'toggleEmbeddedChat' && event.key.toLowerCase() === 'c' && event.ctrlKey
    ));

    render(<NotesView />);
    await waitForNotesRootInitializationEffects();

    const editor = document.createElement('div');
    editor.className = 'ProseMirror';
    editor.setAttribute('contenteditable', 'true');
    document.body.appendChild(editor);

    try {
      const event = new KeyboardEvent('keydown', {
        key: 'c',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      editor.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(uiState.toggleNotesChatPanel).not.toHaveBeenCalled();
      expect(mocks.sidebarDiscussion.openSidebarDiscussionForSelection).not.toHaveBeenCalled();
    } finally {
      editor.remove();
    }
  });

  it('does not run notes view shortcuts from editable note controls', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };
    shortcutMatchesMock.mockImplementation((event, binding) => (
      binding === 'toggleNoteSourceMode' && event.key === '/' && event.ctrlKey
    ));
    const sourceModeListener = vi.fn();
    window.addEventListener(NOTE_SOURCE_MODE_TOGGLE_EVENT, sourceModeListener);

    render(<NotesView />);
    await waitForNotesRootInitializationEffects();

    const titleInput = document.createElement('textarea');
    titleInput.setAttribute('data-note-title-input', 'true');
    document.body.appendChild(titleInput);

    try {
      const event = new KeyboardEvent('keydown', {
        key: '/',
        code: 'Slash',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      titleInput.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(sourceModeListener).not.toHaveBeenCalled();
    } finally {
      titleInput.remove();
      window.removeEventListener(NOTE_SOURCE_MODE_TOGGLE_EVENT, sourceModeListener);
    }
  });

  it('toggles source mode from the editable note body', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };
    shortcutMatchesMock.mockImplementation((event, binding) => (
      binding === 'toggleNoteSourceMode' && event.key === '/' && event.ctrlKey
    ));
    const sourceModeListener = vi.fn();
    window.addEventListener(NOTE_SOURCE_MODE_TOGGLE_EVENT, sourceModeListener);

    render(<NotesView />);
    await waitForNotesRootInitializationEffects();

    const editorRoot = document.createElement('div');
    editorRoot.setAttribute('data-note-content-root', 'true');
    const editor = document.createElement('div');
    editor.className = 'ProseMirror';
    editor.setAttribute('contenteditable', 'true');
    editorRoot.appendChild(editor);
    document.body.appendChild(editorRoot);

    try {
      const event = new KeyboardEvent('keydown', {
        key: '/',
        code: 'Slash',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      editor.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(sourceModeListener).toHaveBeenCalledTimes(1);
    } finally {
      editorRoot.remove();
      window.removeEventListener(NOTE_SOURCE_MODE_TOGGLE_EVENT, sourceModeListener);
    }
  });

  it('opens note find from the editable note body', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };
    shortcutMatchesMock.mockImplementation((event, binding) => (
      binding === 'editorFind' && event.key.toLowerCase() === 'f' && event.ctrlKey
    ));
    const editorFindListener = vi.fn();
    window.addEventListener(EDITOR_FIND_OPEN_EVENT, editorFindListener);

    render(<NotesView />);
    await waitForNotesRootInitializationEffects();

    const editorRoot = document.createElement('div');
    editorRoot.setAttribute('data-note-content-root', 'true');
    const sourceEditor = document.createElement('textarea');
    sourceEditor.setAttribute('data-note-source-editor', 'true');
    editorRoot.appendChild(sourceEditor);
    document.body.appendChild(editorRoot);

    try {
      const event = new KeyboardEvent('keydown', {
        key: 'f',
        code: 'KeyF',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      sourceEditor.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(editorFindListener).toHaveBeenCalledTimes(1);
    } finally {
      editorRoot.remove();
      window.removeEventListener(EDITOR_FIND_OPEN_EVENT, editorFindListener);
    }
  });

  it('saves from the editable note body without stealing native editing shortcuts', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };
    shortcutMatchesMock.mockImplementation((event, binding) => (
      binding === 'saveNote' && event.key.toLowerCase() === 's' && event.ctrlKey
    ));
    notesState.saveNote.mockResolvedValue(undefined);

    render(<NotesView />);
    await waitForNotesRootInitializationEffects();

    const editorRoot = document.createElement('div');
    editorRoot.setAttribute('data-note-content-root', 'true');
    const sourceEditor = document.createElement('textarea');
    editorRoot.appendChild(sourceEditor);
    document.body.appendChild(editorRoot);

    try {
      const event = new KeyboardEvent('keydown', {
        key: 's',
        code: 'KeyS',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      sourceEditor.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(notesState.saveNote).toHaveBeenCalledWith({ explicit: true });
    } finally {
      editorRoot.remove();
    }
  });

  it('reopens the last closed tab on Ctrl+Alt+T', async () => {
    notesState.currentNote = { path: 'docs/current.md', content: '# current' };
    shortcutMatchesMock.mockImplementation((event, binding) => (
      binding === 'reopenClosedTab' && event.key.toLowerCase() === 't' && event.ctrlKey && event.altKey
    ));

    render(<NotesView />);

    fireEvent.keyDown(document, { key: 'T', ctrlKey: true, altKey: true });

    await waitFor(() => {
      expect(notesState.reopenClosedTab).toHaveBeenCalledTimes(1);
    });
  });

  it('dispatches source mode toggle on Ctrl+/', async () => {
    notesState.currentNote = { path: 'docs/current.md', content: '# current' };
    shortcutMatchesMock.mockImplementation((event, binding) => (
      binding === 'toggleNoteSourceMode' && event.key === '/' && event.ctrlKey && !event.shiftKey
    ));
    const sourceModeListener = vi.fn();
    window.addEventListener(NOTE_SOURCE_MODE_TOGGLE_EVENT, sourceModeListener);

    try {
      render(<NotesView />);
      await waitForNotesRootInitializationEffects();

      const event = new KeyboardEvent('keydown', {
        key: '/',
        code: 'Slash',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(sourceModeListener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(NOTE_SOURCE_MODE_TOGGLE_EVENT, sourceModeListener);
    }
  });

  it('opens the delete dialog for the current note and confirms deletion', async () => {
    notesState.currentNote = { path: 'docs/alpha.md', content: '# alpha' };

    render(<NotesView />);

    await act(async () => {
      dispatchDeleteCurrentNoteEvent();
    });

    expect(await screen.findByTestId('delete-note-label')).toHaveTextContent('alpha.md');

    fireEvent.click(screen.getByText('Confirm Delete Note'));

    await waitFor(() => {
      expect(notesState.deleteNote).toHaveBeenCalledWith('docs/alpha.md');
    });
  });
});
