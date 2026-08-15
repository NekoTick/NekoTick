import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchNoteExportDialog } from './BatchNoteExportDialog';

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  cancelPrefetchNote: vi.fn(),
  desktopBridge: null as object | null,
  exportNote: vi.fn(),
  exportNoteToFilePath: vi.fn(),
  getDisplayName: vi.fn((path: string) => path.split('/').pop()?.replace(/\.md$/i, '') ?? path),
  hasNativeFileShare: false,
  noteContentsCache: new Map([
    ['alpha.md', { content: '# Alpha cached' }],
    ['docs/beta.md', { content: '# Beta cached' }],
  ]),
  openDialog: vi.fn(),
  prefetchNote: vi.fn(() => Promise.resolve()),
  scanAllNotes: vi.fn(() => Promise.resolve()),
  setAppViewMode: vi.fn(),
  setGraphMode: vi.fn(),
  setGraphSelectedPath: vi.fn(),
}));

const rootFolder = vi.hoisted(() => ({
  id: 'root',
  name: 'Notes',
  path: '',
  isFolder: true as const,
  expanded: true,
  children: [
    { id: 'alpha.md', name: 'Alpha', path: 'alpha.md', isFolder: false as const },
    {
      id: 'docs',
      name: 'docs',
      path: 'docs',
      isFolder: true as const,
      expanded: true,
      children: [{ id: 'docs/beta.md', name: 'Beta', path: 'docs/beta.md', isFolder: false as const }],
    },
  ],
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? <>{children}</> : null,
  DialogContent: ({
    children,
    showCloseButton,
    useBlurBackdrop,
    ...props
  }: React.ComponentProps<'div'> & { showCloseButton?: boolean; useBlurBackdrop?: boolean }) => (
    <div
      data-show-close-button={String(showCloseButton)}
      data-use-blur-backdrop={String(useBlurBackdrop)}
      {...props}
    >
      {children}
    </div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean | 'indeterminate';
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <input
      type="checkbox"
      checked={checked === true}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
}));

vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

vi.mock('@/components/Notes/features/Sidebar/SidebarNoteFileIcon', () => ({
  SidebarLiveNoteFileIcon: ({
    notePath,
    notesRootPath,
  }: {
    notePath: string;
    notesRootPath?: string;
  }) => <span data-testid={`live-note-icon-${notePath}`} data-notes-root={notesRootPath} />,
}));

vi.mock('@/components/layout/sidebar/GlobalSearchPreview', () => ({
  GlobalSearchPreview: ({
    noteContent,
    onOpenGraph,
    result,
  }: {
    noteContent: string;
    onOpenGraph: (path: string) => void;
    result: { title: string };
  }) => (
    <div data-testid="batch-note-preview">
      {result.title}:{noteContent}
      <button type="button" onClick={() => onOpenGraph('alpha.md')}>Open graph</button>
    </div>
  ),
}));

vi.mock('@/components/Graph/store/useGraphUIStore', () => ({
  useGraphUIStore: (selector: (state: {
    setMode: typeof mocks.setGraphMode;
    setSelectedPath: typeof mocks.setGraphSelectedPath;
  }) => unknown) => selector({ setMode: mocks.setGraphMode, setSelectedPath: mocks.setGraphSelectedPath }),
}));

vi.mock('@/stores/uiSlice', () => ({
  useUIStore: (selector: (state: { setAppViewMode: typeof mocks.setAppViewMode }) => unknown) => (
    selector({ setAppViewMode: mocks.setAppViewMode })
  ),
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: { count?: number; completed?: number; total?: number }) => key === 'notes.selectedCount'
      ? `${values?.count ?? 0} selected`
      : key === 'notes.exportSelected'
        ? `Export selected (${values?.count ?? 0})`
      : key === 'notes.exportProgress'
        ? `Exporting ${values?.completed ?? 0}/${values?.total ?? 0}`
      : ({
          'common.cancel': 'Cancel',
          'notes.batchExportDescription': 'Select notes and output formats.',
          'notes.dropMarkdownFiles': 'Choose or drop Markdown files here',
          'notes.export': 'Export',
          'notes.exporting': 'Exporting...',
          'notes.externalFile': 'External',
          'notes.loadingNotes': 'Loading notes...',
          'notes.noMarkdownNotes': 'No Markdown notes found.',
          'notes.outputFormats': 'Output formats',
          'notes.searchNotes': 'Search notes',
          'notes.selectAll': 'Select all',
        })[key] ?? key,
  }),
}));

vi.mock('@/lib/nativeFileShare', () => ({ hasNativeFileShare: () => mocks.hasNativeFileShare }));

vi.mock('@/lib/electron/bridge', () => ({ getElectronBridge: () => mocks.desktopBridge }));

vi.mock('@/lib/storage/adapter', () => ({
  getParentPath: (path: string) => {
    const normalized = path.replace(/\\/g, '/');
    const separatorIndex = normalized.lastIndexOf('/');
    return separatorIndex < 0 ? null : normalized.slice(0, separatorIndex) || '/';
  },
  getStorageAdapter: () => ({ readFile: vi.fn() }),
  joinPath: (...parts: string[]) => Promise.resolve(parts.join('/').replace(/\/+/g, '/')),
  normalizePath: (path: string) => path.replace(/\\/g, '/'),
}));

vi.mock('@/lib/storage/dialog', () => ({ openDialog: mocks.openDialog }));

vi.mock('@/stores/notes/useNotesStore', () => {
  const state = {
    cancelPrefetchNote: mocks.cancelPrefetchNote,
    currentNote: { path: 'alpha.md', content: '# Alpha live' },
    getDisplayName: mocks.getDisplayName,
    noteContentsCache: mocks.noteContentsCache,
    noteContentsCacheRevision: 1,
    prefetchNote: mocks.prefetchNote,
    rootFolder,
    scanAllNotes: mocks.scanAllNotes,
  };
  return {
    useNotesStore: Object.assign(
      (selector: (value: typeof state) => unknown) => selector(state),
      { getState: () => state },
    ),
  };
});

vi.mock('@/stores/useToastStore', () => ({
  useToastStore: (selector: (state: { addToast: typeof mocks.addToast }) => unknown) => (
    selector({ addToast: mocks.addToast })
  ),
}));

vi.mock('./noteExport', () => ({
  exportNote: mocks.exportNote,
  exportNoteToFilePath: mocks.exportNoteToFilePath,
  getNoteExportFileName: (request: { format: string; title: string }) => `${request.title}.${request.format}`,
}));

function renderDialog(onOpenChange = vi.fn()) {
  return render(
    <BatchNoteExportDialog
      open
      onOpenChange={onOpenChange}
      currentNotePath="alpha.md"
      currentNoteTitle="Alpha live"
      getCurrentNoteContent={() => '# Alpha live'}
      notesPath="/notes"
    />,
  );
}

describe('BatchNoteExportDialog', () => {
  beforeEach(() => {
    mocks.addToast.mockReset();
    mocks.cancelPrefetchNote.mockReset();
    mocks.desktopBridge = null;
    mocks.exportNote.mockReset();
    mocks.exportNote.mockResolvedValue({ canceled: false });
    mocks.exportNoteToFilePath.mockReset();
    mocks.exportNoteToFilePath.mockResolvedValue({ canceled: false });
    mocks.hasNativeFileShare = false;
    mocks.openDialog.mockReset();
    mocks.openDialog.mockResolvedValue('/exports');
    mocks.prefetchNote.mockClear();
    mocks.scanAllNotes.mockClear();
    mocks.setAppViewMode.mockClear();
    mocks.setGraphMode.mockClear();
    mocks.setGraphSelectedPath.mockClear();
  });

  it('uses the global search dialog shell', async () => {
    renderDialog();
    await act(async () => undefined);

    const dialog = screen.getByTestId('batch-note-export-dialog');
    expect(dialog).toHaveAttribute('data-show-close-button', 'false');
    expect(dialog).toHaveAttribute('data-use-blur-backdrop', 'true');
    expect(dialog).toHaveClass('h-[var(--vlaina-height-global-search)]');
    expect(dialog).toHaveClass('w-[var(--vlaina-width-batch-export)]');
    expect(dialog).toHaveClass('bg-[var(--vlaina-color-floating-surface)]');
    expect(screen.getByRole('button', { name: 'Output formats' }).closest('section')).toHaveClass('items-center');
    expect(screen.queryByRole('button', { name: 'common.close' })).not.toBeInTheDocument();
    expect(screen.queryByText('notes.exportStyleDescription')).not.toBeInTheDocument();
  });

  it('does not scan every note when the dialog opens', async () => {
    renderDialog();
    await act(async () => undefined);

    expect(mocks.scanAllNotes).not.toHaveBeenCalled();
  });

  it('selects notes by clicking the full row without a trailing check icon', async () => {
    renderDialog();

    const betaRow = screen.getByRole('button', { name: /Beta/ });
    expect(betaRow).toHaveAttribute('aria-pressed', 'false');
    expect(betaRow.querySelector('[data-icon="common.check"]')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(betaRow);
    });

    expect(betaRow).toHaveAttribute('aria-pressed', 'true');
    expect(betaRow).toHaveClass('bg-[var(--vlaina-sidebar-row-selected-bg)]');
    expect(betaRow.querySelector('[data-icon="common.check"]')).not.toBeInTheDocument();
  });

  it('uses the same live note icons as search results', async () => {
    renderDialog();
    await act(async () => undefined);

    expect(screen.getByTestId('live-note-icon-alpha.md')).toHaveAttribute('data-notes-root', '/notes');
    expect(screen.getByTestId('live-note-icon-docs/beta.md')).toHaveAttribute('data-notes-root', '/notes');
    expect(screen.queryByText('alpha.md')).not.toBeInTheDocument();
    expect(screen.queryByText('docs/beta.md')).not.toBeInTheDocument();
    expect(screen.getByText('docs/')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Alpha/ })).toHaveClass('h-[var(--vlaina-size-40px)]');
    expect(screen.getByRole('button', { name: /Beta/ })).toHaveClass('h-[var(--vlaina-size-56px)]');
  });

  it('previews the note under the pointer with the global search preview', async () => {
    renderDialog();
    await act(async () => undefined);

    expect(screen.getByTestId('batch-note-preview')).toHaveTextContent('Alpha:# Alpha live');

    fireEvent.pointerMove(screen.getByRole('button', { name: /Beta/ }));

    expect(screen.getByTestId('batch-note-preview')).toHaveTextContent('Beta:# Beta cached');
  });

  it('opens the hovered note in the local graph from the shared preview', async () => {
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);
    await act(async () => undefined);

    fireEvent.click(screen.getByRole('button', { name: 'Open graph' }));

    expect(mocks.setGraphMode).toHaveBeenCalledWith('local');
    expect(mocks.setGraphSelectedPath).toHaveBeenCalledWith('alpha.md');
    expect(mocks.setAppViewMode).toHaveBeenCalledWith('graph');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('exports multiple selected notes to the one selected format', async () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /Beta/ }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Output formats' }), { button: 0 });
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'HTML' }));
    expect(screen.getByRole('button', { name: 'Output formats' })).toHaveTextContent('HTML');
    fireEvent.click(screen.getByRole('button', { name: 'Export selected (2)' }));

    await waitFor(() => expect(mocks.exportNote).toHaveBeenCalledTimes(2));
    expect(mocks.exportNote.mock.calls.map(([request]) => [request.notePath, request.format, request.markdown])).toEqual([
      ['alpha.md', 'html', '# Alpha live'],
      ['docs/beta.md', 'html', '# Beta cached'],
    ]);
  });

  it('adds a dropped Markdown file to the selected export queue', async () => {
    renderDialog();
    const file = new File(['# External'], 'external.md', { type: 'text/markdown', lastModified: 42 });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve('# External') });

    fireEvent.drop(screen.getByTestId('batch-note-export-dialog'), {
      dataTransfer: { files: [file] },
    });

    expect(await screen.findByText('external.md')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Export selected (1)' }));

    await waitFor(() => expect(mocks.exportNote).toHaveBeenCalledTimes(1));
    expect(mocks.exportNote).toHaveBeenCalledWith({
      format: 'docx',
      markdown: '# External',
      notePath: 'external.md',
      notesPath: '',
      title: 'external',
    });
  });

  it('adds Markdown files selected from the file picker', async () => {
    renderDialog();
    const file = new File(['# Picked'], 'picked.md', { type: 'text/markdown', lastModified: 43 });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve('# Picked') });

    fireEvent.change(screen.getByLabelText('Choose or drop Markdown files here'), {
      target: { files: [file] },
    });

    expect(await screen.findByText('picked.md')).toBeInTheDocument();
  });

  it('shows progress while processing ordinary exports concurrently', async () => {
    const resolvers: Array<(result: { canceled: boolean }) => void> = [];
    mocks.exportNote.mockImplementation(() => new Promise((resolve) => { resolvers.push(resolve); }));
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /Beta/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Export selected (2)' }));

    const progressButton = await screen.findByRole('button', { name: 'Exporting 0/2' });
    expect(progressButton.querySelector('.animate-spin')).toBeInTheDocument();
    expect(progressButton).toHaveClass('text-[var(--vlaina-accent)]');
    await waitFor(() => expect(mocks.exportNote).toHaveBeenCalledTimes(2));

    await act(async () => resolvers[0]?.({ canceled: false }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Exporting 1/2' })).toBeInTheDocument());

    await act(async () => resolvers[1]?.({ canceled: false }));
  });

  it('keeps native file sharing exports serial', async () => {
    mocks.hasNativeFileShare = true;
    let resolveFirst: ((result: { canceled: boolean }) => void) | undefined;
    mocks.exportNote.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /Beta/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Export selected (2)' }));

    await waitFor(() => expect(mocks.exportNote).toHaveBeenCalledTimes(1));
    await act(async () => resolveFirst?.({ canceled: false }));
    await waitFor(() => expect(mocks.exportNote).toHaveBeenCalledTimes(2));
  });

  it('filters the note list without changing the selected notes', async () => {
    renderDialog();
    await act(async () => undefined);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search notes' }), { target: { value: 'beta' } });

    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getAllByText('1 selected')).toHaveLength(1);
  });

  it('chooses one desktop directory for the whole batch', async () => {
    mocks.desktopBridge = {};
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /Beta/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Export selected (2)' }));

    await waitFor(() => expect(mocks.exportNoteToFilePath).toHaveBeenCalledTimes(2));
    expect(mocks.openDialog).toHaveBeenCalledTimes(1);
    expect(mocks.exportNote).not.toHaveBeenCalled();
    expect(mocks.exportNoteToFilePath.mock.calls.map(([, path]) => path)).toEqual([
      '/exports/Alpha live.docx',
      '/exports/beta.docx',
    ]);
  });
});
