import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearEditorFocusIntent,
  fulfillEditorFocusIntent,
} from '@/components/Notes/features/Editor/utils/editorFocusIntent';
import { GraphView } from './GraphView';
import { useGraphUIStore } from './store/useGraphUIStore';

const hoisted = vi.hoisted(() => ({
  notesState: {
    currentNote: null as { content: string; path: string } | null,
    noteContentsCache: new Map(),
    noteContentsCacheRevision: 0,
    notesPath: '',
    openNote: vi.fn(),
    rootFolder: null as { children: Array<Record<string, unknown>> } | null,
    rootFolderPath: null as string | null,
    scanAllNotes: vi.fn(),
  },
  notesRootState: {
    currentNotesRoot: { name: 'Test notes', path: '/tmp/test-notes' },
    hasInitialized: true,
    recentNotesRoots: [{ name: 'Test notes', path: '/tmp/test-notes' }],
  },
  uiState: { setAppViewMode: vi.fn() },
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/stores/notes/useNotesStore', () => ({
  useNotesStore: Object.assign(
    (selector: (state: typeof hoisted.notesState) => unknown) => selector(hoisted.notesState),
    { getState: () => hoisted.notesState },
  ),
}));

vi.mock('@/stores/useNotesRootStore', () => ({
  useNotesRootStore: (selector: (state: typeof hoisted.notesRootState) => unknown) => selector(hoisted.notesRootState),
}));

vi.mock('@/stores/uiSlice', () => ({
  useUIStore: (selector: (state: typeof hoisted.uiState) => unknown) => selector(hoisted.uiState),
}));

describe('GraphView', () => {
  beforeEach(() => {
    clearEditorFocusIntent();
    localStorage.clear();
    hoisted.notesState.currentNote = null;
    hoisted.notesState.noteContentsCache = new Map();
    hoisted.notesState.noteContentsCacheRevision = 0;
    hoisted.notesState.notesPath = '';
    hoisted.notesState.rootFolder = null;
    hoisted.notesState.rootFolderPath = null;
    hoisted.notesRootState.currentNotesRoot = { name: 'Test notes', path: '/tmp/test-notes' };
    hoisted.notesRootState.hasInitialized = true;
    hoisted.notesRootState.recentNotesRoots = [{ name: 'Test notes', path: '/tmp/test-notes' }];
    hoisted.notesState.scanAllNotes.mockClear();
    hoisted.notesState.scanAllNotes.mockResolvedValue(undefined);
    hoisted.notesState.openNote.mockClear();
    hoisted.notesState.openNote.mockResolvedValue(undefined);
    hoisted.uiState.setAppViewMode.mockClear();
    useGraphUIStore.setState({ mode: 'all', searchQuery: '', selectedPath: null });
  });

  it('uses a stable empty position snapshot before a graph layout has been saved', () => {
    render(<GraphView />);

    expect(screen.getByText('graph.empty')).toBeInTheDocument();
  });

  it('does not render a partial graph before the initial note scan completes', () => {
    hoisted.notesState.currentNote = { content: '# Alpha', path: 'Alpha.md' };
    hoisted.notesState.notesPath = '/tmp/test-notes';
    hoisted.notesState.rootFolderPath = '/tmp/test-notes';
    hoisted.notesState.rootFolder = {
      children: [{
        id: 'Alpha.md',
        isFolder: false,
        kind: 'note',
        name: 'Alpha.md',
        path: 'Alpha.md',
      }],
    };
    hoisted.notesState.noteContentsCache = new Map([
      ['Alpha.md', { content: '# Alpha', modifiedAt: 1 }],
    ]);
    hoisted.notesState.scanAllNotes.mockImplementation(() => new Promise(() => undefined));

    render(<GraphView />);

    expect(screen.getByText('graph.loading')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'app.viewGraph' })).not.toBeInTheDocument();
  });

  it('defers hidden graph work and refreshes when activated in StrictMode', async () => {
    hoisted.notesState.currentNote = { content: '# Alpha', path: 'Alpha.md' };
    hoisted.notesState.notesPath = '/tmp/test-notes';
    hoisted.notesState.rootFolderPath = '/tmp/test-notes';
    hoisted.notesState.rootFolder = {
      children: [{
        id: 'Alpha.md',
        isFolder: false,
        kind: 'note',
        name: 'Alpha.md',
        path: 'Alpha.md',
      }],
    };
    hoisted.notesState.noteContentsCache = new Map([
      ['Alpha.md', { content: '# Alpha', modifiedAt: 1 }],
    ]);

    const view = render(
      <StrictMode>
        <GraphView active={false} />
      </StrictMode>,
    );

    expect(document.querySelector('[data-graph-view-mode="true"]')).toHaveAttribute('data-graph-active', 'false');
    expect(screen.queryByRole('img', { name: 'app.viewGraph' })).not.toBeInTheDocument();
    expect(hoisted.notesState.scanAllNotes).not.toHaveBeenCalled();

    view.rerender(
      <StrictMode>
        <GraphView active />
      </StrictMode>,
    );

    expect(await screen.findByRole('group', { name: 'app.viewGraph' })).toBeInTheDocument();
    await waitFor(() => expect(hoisted.notesState.scanAllNotes).toHaveBeenCalledWith(
      expect.objectContaining({ background: true, priorityPaths: ['Alpha.md'] }),
    ));
  });

  it('keeps the existing canvas mounted during a background refresh', async () => {
    hoisted.notesState.currentNote = { content: '# Alpha', path: 'Alpha.md' };
    hoisted.notesState.notesPath = '/tmp/test-notes';
    hoisted.notesState.rootFolderPath = '/tmp/test-notes';
    hoisted.notesState.rootFolder = {
      children: [{
        id: 'Alpha.md',
        isFolder: false,
        kind: 'note',
        name: 'Alpha.md',
        path: 'Alpha.md',
      }],
    };
    hoisted.notesState.noteContentsCache = new Map([
      ['Alpha.md', { content: '# Alpha', modifiedAt: 1 }],
    ]);
    const view = render(<GraphView active />);
    const canvas = await screen.findByRole('group', { name: 'app.viewGraph' });

    view.rerender(<GraphView active={false} />);
    hoisted.notesState.scanAllNotes.mockClear();
    expect(screen.getByRole('group', { name: 'app.viewGraph' })).toBe(canvas);
    expect(hoisted.notesState.scanAllNotes).not.toHaveBeenCalled();
    hoisted.notesState.scanAllNotes.mockImplementation(() => new Promise(() => undefined));
    view.rerender(<GraphView active />);

    expect(screen.getByRole('group', { name: 'app.viewGraph' })).toBe(canvas);
    expect(screen.queryByText('graph.loading')).not.toBeInTheDocument();
    expect(await screen.findByText('graph.scanning')).toBeInTheDocument();
  });

  it('clears a stale selection after returning from another note', async () => {
    hoisted.notesState.currentNote = { content: '# Alpha', path: 'Alpha.md' };
    hoisted.notesState.notesPath = '/tmp/test-notes';
    hoisted.notesState.rootFolderPath = '/tmp/test-notes';
    hoisted.notesState.rootFolder = {
      children: [
        { id: 'Alpha.md', isFolder: false, kind: 'note', name: 'Alpha.md', path: 'Alpha.md' },
        { id: 'Beta.md', isFolder: false, kind: 'note', name: 'Beta.md', path: 'Beta.md' },
        { id: 'Gamma.md', isFolder: false, kind: 'note', name: 'Gamma.md', path: 'Gamma.md' },
      ],
    };
    useGraphUIStore.setState({ selectedPath: 'Alpha.md' });
    const view = render(<GraphView active />);
    await waitFor(() => expect(useGraphUIStore.getState().selectedPath).toBe('Alpha.md'));

    view.rerender(<GraphView active={false} />);
    hoisted.notesState.currentNote = { content: '# Gamma', path: 'Gamma.md' };
    view.rerender(<GraphView active />);

    await waitFor(() => expect(useGraphUIStore.getState().selectedPath).toBeNull());
  });

  it('hands focus to the opened note editor after leaving the graph', async () => {
    hoisted.notesState.currentNote = { content: '# Alpha', path: 'Alpha.md' };
    hoisted.notesState.notesPath = '/tmp/test-notes';
    hoisted.notesState.rootFolderPath = '/tmp/test-notes';
    hoisted.notesState.rootFolder = {
      children: [
        { id: 'Alpha.md', isFolder: false, kind: 'note', name: 'Alpha.md', path: 'Alpha.md' },
      ],
    };
    hoisted.notesState.noteContentsCache = new Map([
      ['Alpha.md', { content: '# Alpha', modifiedAt: 1 }],
    ]);
    render(<GraphView active />);

    fireEvent.doubleClick(await screen.findByRole('option', { name: 'Alpha' }));

    await waitFor(() => expect(hoisted.notesState.openNote).toHaveBeenCalledWith('Alpha.md'));
    expect(hoisted.uiState.setAppViewMode).toHaveBeenCalledWith('notes');
    expect(fulfillEditorFocusIntent('Alpha.md', () => true)).toBe(true);
  });

  it('shows the target note on the first frame after leaving the graph', async () => {
    let finishOpening: (() => void) | null = null;
    hoisted.notesState.currentNote = { content: '# Alpha', path: 'Alpha.md' };
    hoisted.notesState.notesPath = '/tmp/test-notes';
    hoisted.notesState.rootFolderPath = '/tmp/test-notes';
    hoisted.notesState.rootFolder = {
      children: [
        { id: 'Alpha.md', isFolder: false, kind: 'note', name: 'Alpha.md', path: 'Alpha.md' },
        { id: 'Beta.md', isFolder: false, kind: 'note', name: 'Beta.md', path: 'Beta.md' },
      ],
    };
    hoisted.notesState.noteContentsCache = new Map([
      ['Alpha.md', { content: '# Alpha', modifiedAt: 1 }],
      ['Beta.md', { content: '# Beta', modifiedAt: 1 }],
    ]);
    hoisted.notesState.openNote.mockImplementation(() => new Promise<void>((resolve) => {
      finishOpening = () => {
        hoisted.notesState.currentNote = { content: '# Beta', path: 'Beta.md' };
        resolve();
      };
    }));
    render(<GraphView active />);

    fireEvent.doubleClick(await screen.findByRole('option', { name: 'Beta' }));

    expect(hoisted.notesState.openNote).toHaveBeenCalledWith('Beta.md');
    expect(hoisted.uiState.setAppViewMode).not.toHaveBeenCalled();
    expect(fulfillEditorFocusIntent('Beta.md', () => true)).toBe(false);

    const completeOpening = finishOpening as (() => void) | null;
    completeOpening?.();
    await waitFor(() => expect(hoisted.uiState.setAppViewMode).toHaveBeenCalledWith('notes'));
    expect(fulfillEditorFocusIntent('Beta.md', () => true)).toBe(true);
  });

  it('clears a selection when re-entering a different notes root', async () => {
    hoisted.notesState.currentNote = { content: '# Alpha', path: 'Alpha.md' };
    hoisted.notesState.notesPath = '/tmp/test-notes';
    hoisted.notesState.rootFolderPath = '/tmp/test-notes';
    hoisted.notesState.rootFolder = {
      children: [
        { id: 'Alpha.md', isFolder: false, kind: 'note', name: 'Alpha.md', path: 'Alpha.md' },
        { id: 'Beta.md', isFolder: false, kind: 'note', name: 'Beta.md', path: 'Beta.md' },
      ],
    };
    useGraphUIStore.setState({ selectedPath: 'Alpha.md' });
    const view = render(<GraphView active />);
    await waitFor(() => expect(useGraphUIStore.getState().selectedPath).toBe('Alpha.md'));

    view.rerender(<GraphView active={false} />);
    hoisted.notesRootState.currentNotesRoot = { name: 'Other notes', path: '/tmp/other-notes' };
    hoisted.notesState.notesPath = '/tmp/other-notes';
    hoisted.notesState.rootFolderPath = '/tmp/other-notes';
    view.rerender(<GraphView active />);

    await waitFor(() => expect(useGraphUIStore.getState().selectedPath).toBeNull());
  });

  it('shows a scan error instead of presenting a failed scan as an empty graph', async () => {
    hoisted.notesState.notesPath = '/tmp/test-notes';
    hoisted.notesState.rootFolderPath = '/tmp/test-notes';
    hoisted.notesState.rootFolder = { children: [] };
    hoisted.notesState.scanAllNotes.mockRejectedValue(new Error('scan failed'));

    render(<GraphView />);

    expect(await screen.findByRole('alert')).toHaveTextContent('graph.scanError');
    expect(screen.queryByText('graph.empty')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'graph.retry' })).toBeInTheDocument();
  });

  it('keeps the background scan error action inside a single compact row', async () => {
    hoisted.notesState.currentNote = { content: '# Alpha', path: 'Alpha.md' };
    hoisted.notesState.notesPath = '/tmp/test-notes';
    hoisted.notesState.rootFolderPath = '/tmp/test-notes';
    hoisted.notesState.rootFolder = {
      children: [{
        id: 'Alpha.md',
        isFolder: false,
        kind: 'note',
        name: 'Alpha.md',
        path: 'Alpha.md',
      }],
    };
    hoisted.notesState.noteContentsCache = new Map([
      ['Alpha.md', { content: '# Alpha', modifiedAt: 1 }],
    ]);
    const view = render(<GraphView active />);
    await screen.findByRole('group', { name: 'app.viewGraph' });

    view.rerender(<GraphView active={false} />);
    hoisted.notesState.scanAllNotes.mockRejectedValue(new Error('scan failed'));
    view.rerender(<GraphView active />);

    const alert = await screen.findByRole('alert');
    expect(alert.parentElement).toHaveClass('px-3');
    expect(alert).toHaveClass('min-w-0', 'max-w-full', 'flex-nowrap');
    expect(alert.querySelector('span')).toHaveClass('truncate', 'whitespace-nowrap');
    expect(screen.getByRole('button', { name: 'graph.retry' })).toHaveClass('shrink-0');
  });
});
