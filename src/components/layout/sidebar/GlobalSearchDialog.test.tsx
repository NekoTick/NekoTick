import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { GlobalSearchDialog } from './GlobalSearchDialog';

const hoisted = vi.hoisted(() => ({
  aiActions: {
    prefetchSession: vi.fn(async () => undefined),
    cancelSessionPrefetch: vi.fn(),
    switchSession: vi.fn<(id: string) => Promise<void>>(async () => undefined),
  },
  appViewMode: 'chat' as 'notes' | 'chat' | 'whiteboard' | 'graph',
  chatUIState: {
    currentSessionId: null as string | null,
  },
  setAppViewMode: vi.fn(),
  aiState: {
    data: {
      ai: {
        sessions: [{ id: 'chat-1', title: 'Alpha chat', modelId: 'model', createdAt: 1, updatedAt: 2 }],
        messages: {},
      },
    },
  },
  notesState: {
    rootFolder: null,
    currentNote: null as { path: string; content: string } | null,
    recentNotes: ['recent.md'],
    noteContentsCache: new Map([
      ['recent.md', { content: '# Recent' }],
      ['alpha.md', { content: '# Alpha' }],
      ['beta.md', { content: '# Beta' }],
    ]),
    noteContentsCacheRevision: 1,
    starredEntries: [],
    notesPath: '/notes',
    getDisplayName: (path: string) => path.replace(/\.md$/, ''),
    scanAllNotes: vi.fn(async () => undefined),
    cancelNoteContentScan: vi.fn(),
    pruneNoteContentsCacheToOpenNotes: vi.fn(),
    prefetchNote: vi.fn(async () => undefined),
    cancelPrefetchNote: vi.fn(),
    openNote: vi.fn<(path?: string) => Promise<void>>(async () => undefined),
    openNoteByAbsolutePath: vi.fn<(path?: string) => Promise<void>>(async () => undefined),
  },
  whiteboardState: {
    boards: [{
      id: 'board-1',
      title: 'Alpha board',
      folder: 'board-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }, {
      id: 'board-2',
      title: 'Beta board',
      folder: 'board-2',
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
    }],
    activeBoardId: 'board-1' as string | null,
    activeSnapshot: null,
    loadForNotesRoot: vi.fn(async () => undefined),
    selectBoard: vi.fn<(id: string) => Promise<void>>(async () => undefined),
  },
}));

vi.mock('@/components/Notes/features/Sidebar/useSidebarContentSearchResults', () => ({
  useSidebarContentSearchResults: () => ({
    isContentScanPending: false,
    searchResults: [
      { id: 'alpha', path: 'alpha.md', name: 'Alpha', preview: '', matchIndex: 0, matchKind: 'name', contentSnippet: null, contentMatchOrdinal: null },
      { id: 'beta', path: 'beta.md', name: 'Beta', preview: '', matchIndex: 0, matchKind: 'name', contentSnippet: null, contentMatchOrdinal: null },
    ],
  }),
}));
vi.mock('./GlobalSearchPreview', () => ({
  GlobalSearchPreview: ({ result, noteContent }: { result: { title: string }; noteContent: string }) => (
    <div data-testid="search-preview">{result.title}:{noteContent}</div>
  ),
}));
vi.mock('@/components/Notes/features/Sidebar/SidebarNoteFileIcon', () => ({
  SidebarLiveNoteFileIcon: ({ notePath }: { notePath: string }) => <span data-testid={`live-note-icon-${notePath}`} />,
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));
vi.mock('@/components/ui/icons', () => ({ Icon: ({ name }: { name: string }) => <span>{name}</span> }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/stores/useNotesStore', () => ({
  useNotesStore: Object.assign(
    (selector: (state: typeof hoisted.notesState) => unknown) => selector(hoisted.notesState),
    { getState: () => hoisted.notesState },
  ),
}));
vi.mock('@/stores/useNotesRootStore', () => ({
  useNotesRootStore: (selector: (state: { currentNotesRoot: { path: string } }) => unknown) => selector({ currentNotesRoot: { path: '/notes' } }),
}));
vi.mock('@/stores/unified/useUnifiedStore', () => ({
  useUnifiedStore: (selector: (state: typeof hoisted.aiState) => unknown) => selector(hoisted.aiState),
}));
vi.mock('@/components/Whiteboard/stores/useWhiteboardStore', () => ({
  useWhiteboardStore: Object.assign(
    (selector: (state: typeof hoisted.whiteboardState) => unknown) => selector(hoisted.whiteboardState),
    { getState: () => hoisted.whiteboardState },
  ),
}));
vi.mock('@/stores/useAIStore', () => ({ actions: hoisted.aiActions }));
vi.mock('@/stores/ai/chatState', () => ({
  useAIUIStore: {
    getState: () => hoisted.chatUIState,
  },
}));
vi.mock('@/stores/uiSlice', () => ({
  useUIStore: (selector: (state: { appViewMode: typeof hoisted.appViewMode; setAppViewMode: typeof hoisted.setAppViewMode }) => unknown) => selector({
    appViewMode: hoisted.appViewMode,
    setAppViewMode: hoisted.setAppViewMode,
  }),
}));

describe('GlobalSearchDialog', () => {
  beforeEach(() => {
    hoisted.appViewMode = 'chat';
    hoisted.chatUIState.currentSessionId = null;
    hoisted.notesState.currentNote = null;
    hoisted.notesState.recentNotes = ['recent.md'];
    hoisted.notesState.openNote.mockReset().mockImplementation(async (path?: string) => {
      if (path) hoisted.notesState.currentNote = { path, content: `# ${path}` };
    });
    hoisted.notesState.openNoteByAbsolutePath.mockReset().mockImplementation(async (path?: string) => {
      if (path) hoisted.notesState.currentNote = { path, content: `# ${path}` };
    });
    hoisted.notesState.prefetchNote.mockClear();
    hoisted.notesState.cancelPrefetchNote.mockClear();
    hoisted.whiteboardState.loadForNotesRoot.mockClear();
    hoisted.whiteboardState.activeBoardId = 'board-1';
    hoisted.whiteboardState.selectBoard.mockReset().mockImplementation(async (id: string) => {
      hoisted.whiteboardState.activeBoardId = id;
    });
    hoisted.aiActions.switchSession.mockReset().mockImplementation(async (id: string) => {
      hoisted.chatUIState.currentSessionId = id;
    });
    hoisted.setAppViewMode.mockClear();
  });

  it('shows all modules and puts the current module first', () => {
    render(<GlobalSearchDialog open onOpenChange={() => {}} />);

    const chatHeading = screen.getByText('app.viewChat');
    const notesHeading = screen.getByText('app.viewNotes');
    const boardHeading = screen.getByText('app.viewWhiteboard');
    expect(chatHeading.compareDocumentPosition(notesHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notesHeading.compareDocumentPosition(boardHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('option', { name: /Alpha chat/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /recent/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Alpha board/i })).toBeInTheDocument();
  });

  it('previews on hover and opens a clicked note', async () => {
    render(<GlobalSearchDialog open onOpenChange={() => {}} />);
    const input = screen.getByRole('textbox', { name: 'sidebar.search' });
    fireEvent.change(input, { target: { value: 'a' } });
    const betaResult = await screen.findByRole('option', { name: /^Beta$/i });
    fireEvent.pointerEnter(betaResult);
    expect(screen.getByTestId('search-preview')).toHaveTextContent('Beta:# Beta');
    expect(betaResult).toHaveClass(
      'bg-[var(--vlaina-sidebar-row-selected-bg)]',
      'shadow-[var(--vlaina-shadow-selection-soft)]',
    );
    await waitFor(() => expect(hoisted.notesState.prefetchNote).toHaveBeenCalledWith('beta.md'));
    fireEvent.click(betaResult);

    await waitFor(() => expect(hoisted.notesState.openNote).toHaveBeenCalledWith('beta.md', undefined));
    expect(hoisted.setAppViewMode).toHaveBeenCalledWith('notes');
  });

  it('opens chat and whiteboard results with their existing actions', async () => {
    render(<GlobalSearchDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole('option', { name: /Alpha chat/i }));
    await waitFor(() => expect(hoisted.aiActions.switchSession).toHaveBeenCalledWith('chat-1'));
    expect(hoisted.setAppViewMode).toHaveBeenCalledWith('chat');

    hoisted.setAppViewMode.mockClear();
    fireEvent.click(screen.getByRole('option', { name: /Alpha board/i }));
    await waitFor(() => expect(hoisted.whiteboardState.selectBoard).toHaveBeenCalledWith('board-1'));
    expect(hoisted.setAppViewMode).toHaveBeenCalledWith('whiteboard');
  });

  it('routes absolute recent notes through the external opener', async () => {
    hoisted.notesState.recentNotes = ['/external/recent.md'];
    render(<GlobalSearchDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole('option', { name: /recent/i }));

    await waitFor(() => expect(hoisted.notesState.openNoteByAbsolutePath).toHaveBeenCalledWith('/external/recent.md', undefined));
    expect(hoisted.notesState.openNote).not.toHaveBeenCalled();
  });

  it('waits for the latest open request before switching views and closing', async () => {
    const resolutions = new Map<string, () => void>();
    hoisted.notesState.openNote.mockImplementation((path?: string) => new Promise<void>((resolve) => {
      if (path) resolutions.set(path, () => {
        hoisted.notesState.currentNote = { path, content: `# ${path}` };
        resolve();
      });
    }));
    const onOpenChange = vi.fn();
    render(<GlobalSearchDialog open onOpenChange={onOpenChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'sidebar.search' }), { target: { value: 'a' } });
    fireEvent.click(await screen.findByRole('option', { name: /^Alpha$/i }));
    fireEvent.click(screen.getByRole('option', { name: /^Beta$/i }));

    resolutions.get('alpha.md')?.();
    await waitFor(() => expect(hoisted.notesState.openNote).toHaveBeenCalledTimes(2));
    expect(onOpenChange).not.toHaveBeenCalled();
    resolutions.get('beta.md')?.();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('queues rapid whiteboard selections so the latest board opens last', async () => {
    let resolveFirstSelection = () => {};
    hoisted.whiteboardState.selectBoard.mockImplementation((id: string) => (
      id === 'board-1'
        ? new Promise<void>((resolve) => {
            resolveFirstSelection = () => {
              hoisted.whiteboardState.activeBoardId = id;
              resolve();
            };
          })
        : Promise.resolve().then(() => {
          hoisted.whiteboardState.activeBoardId = id;
        })
    ));
    const onOpenChange = vi.fn();
    render(<GlobalSearchDialog open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('option', { name: /Alpha board/i }));
    await waitFor(() => expect(hoisted.whiteboardState.selectBoard).toHaveBeenCalledWith('board-1'));
    fireEvent.click(screen.getByRole('option', { name: /Beta board/i }));
    expect(hoisted.whiteboardState.selectBoard).toHaveBeenCalledTimes(1);

    resolveFirstSelection();
    await waitFor(() => expect(hoisted.whiteboardState.selectBoard).toHaveBeenLastCalledWith('board-2'));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('keeps the dialog open when a note action finishes without opening the target', async () => {
    hoisted.notesState.openNote.mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(<GlobalSearchDialog open onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'sidebar.search' }), { target: { value: 'beta' } });
    fireEvent.click(await screen.findByRole('option', { name: /^Beta$/i }));

    await waitFor(() => expect(hoisted.notesState.openNote).toHaveBeenCalledWith('beta.md', undefined));
    expect(hoisted.setAppViewMode).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('keeps the dialog open when a whiteboard selection is ignored', async () => {
    hoisted.whiteboardState.selectBoard.mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(<GlobalSearchDialog open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('option', { name: /Beta board/i }));

    await waitFor(() => expect(hoisted.whiteboardState.selectBoard).toHaveBeenCalledWith('board-2'));
    expect(hoisted.setAppViewMode).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('does not open a result while an input method is composing text', async () => {
    render(<GlobalSearchDialog open onOpenChange={() => {}} />);
    const input = screen.getByRole('textbox', { name: 'sidebar.search' });

    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, isComposing: true });

    expect(hoisted.aiActions.switchSession).not.toHaveBeenCalled();
    expect(hoisted.notesState.openNote).not.toHaveBeenCalled();
  });

  it('scrolls keyboard-selected results into view', async () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    try {
      render(<GlobalSearchDialog open onOpenChange={() => {}} />);
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
      scrollIntoView.mockClear();

      fireEvent.keyDown(screen.getByRole('textbox', { name: 'sidebar.search' }), { key: 'ArrowDown' });

      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' }));
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
          configurable: true,
          value: originalScrollIntoView,
        });
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
      }
    }
  });
});
