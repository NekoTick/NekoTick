import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitTitleBarAction } from './GitTitleBarAction';

const mocks = vi.hoisted(() => ({
  bridgeAvailable: true,
  currentNotesRoot: { path: '/repo' } as { path: string } | null,
  notesPath: '/repo',
  rootFolderPath: '/repo' as string | null,
  isGitRepository: true,
  addToast: vi.fn(),
  flushTitle: vi.fn().mockResolvedValue(undefined),
  flushEditorSave: vi.fn().mockResolvedValue(undefined),
  saveDirtyTabs: vi.fn().mockResolvedValue(true),
  openNote: vi.fn().mockResolvedValue(undefined),
  t: vi.fn((key: string) => key),
  openPopover: null as null | ((open: boolean) => void),
  git: {
    status: vi.fn(),
    fetch: vi.fn(),
    workingDiff: vi.fn(),
    history: vi.fn(),
    commitDiff: vi.fn(),
    commit: vi.fn(),
    pull: vi.fn(),
    push: vi.fn(),
  },
}));

const change = {
  path: 'notes/today.md',
  previousPath: null,
  indexStatus: ' ',
  workTreeStatus: 'M',
  status: 'modified',
  staged: false,
  unstaged: true,
};

const status = {
  rootPath: '/repo',
  branch: 'main',
  detached: false,
  upstream: 'origin/main',
  ahead: 0,
  behind: 0,
  remoteUrl: 'https://example.invalid/repo.git',
  changes: [change],
};

vi.mock('@/lib/electron/bridge', () => ({
  getElectronBridge: () => mocks.bridgeAvailable ? { git: mocks.git } : null,
}));

vi.mock('@/stores/useNotesRootStore', () => ({
  useNotesRootStore: (selector: (state: { currentNotesRoot: typeof mocks.currentNotesRoot }) => unknown) =>
    selector({ currentNotesRoot: mocks.currentNotesRoot }),
}));

vi.mock('@/stores/useNotesStore', () => ({
  useNotesStore: (selector: (state: {
    notesPath: string;
    rootFolderPath: string | null;
    rootFolder: { isGitRepository?: boolean } | null;
    openNote: typeof mocks.openNote;
  }) => unknown) => selector({
    notesPath: mocks.notesPath,
    rootFolderPath: mocks.rootFolderPath,
    rootFolder: { isGitRepository: mocks.isGitRepository },
    openNote: mocks.openNote,
  }),
}));

vi.mock('@/stores/useToastStore', () => ({
  useToastStore: (selector: (state: { addToast: typeof mocks.addToast }) => unknown) =>
    selector({ addToast: mocks.addToast }),
}));

vi.mock('@/stores/notes/dirtyOpenTabs', () => ({
  saveDirtyRegularOpenTabs: mocks.saveDirtyTabs,
}));

vi.mock('../Editor/utils/titleCommitRegistry', () => ({
  flushCurrentTitleCommit: mocks.flushTitle,
}));
vi.mock('../Editor/utils/editorSaveRegistry', () => ({
  flushCurrentEditorSave: mocks.flushEditorSave,
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: mocks.t }),
}));

vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children, className }: {
    children: React.ReactNode;
    className?: string;
  }) => <div data-testid="git-sync-tooltip" className={className}>{children}</div>,
}));

vi.mock('@/components/ui/overlay-scroll-area', () => ({
  OverlayScrollArea: ({ children, viewportClassName: _viewportClassName, scrollbarVariant: _scrollbarVariant, ...props }:
    React.HTMLAttributes<HTMLDivElement> & { viewportClassName?: string; scrollbarVariant?: string }) => (
    <div {...props}>{children}</div>
  ),
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children, onOpenChange }: {
    children: React.ReactNode;
    onOpenChange: (open: boolean) => void;
  }) => {
    mocks.openPopover = onOpenChange;
    return <>{children}</>;
  },
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <span onClick={() => mocks.openPopover?.(true)}>{children}</span>
  ),
  PopoverAnchor: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
  PopoverContent: ({ children, align: _align, side: _side, sideOffset: _sideOffset, ...props }:
    React.HTMLAttributes<HTMLDivElement> & { align?: string; side?: string; sideOffset?: number }) =>
    <div {...props}>{children}</div>,
}));

async function openGitPopover() {
  render(<GitTitleBarAction />);
  fireEvent.click(await screen.findByTestId('git-sync-button'));
  return screen.findByTestId('git-sync-popover');
}

describe('GitTitleBarAction', () => {
  beforeEach(() => {
    mocks.bridgeAvailable = true;
    mocks.currentNotesRoot = { path: '/repo' };
    mocks.notesPath = '/repo';
    mocks.rootFolderPath = '/repo';
    mocks.isGitRepository = true;
    mocks.addToast.mockReset();
    mocks.flushTitle.mockReset().mockResolvedValue(undefined);
    mocks.flushEditorSave.mockReset().mockResolvedValue(undefined);
    mocks.saveDirtyTabs.mockReset().mockResolvedValue(true);
    mocks.openNote.mockReset().mockResolvedValue(undefined);
    Object.values(mocks.git).forEach((mock) => mock.mockReset());
    mocks.git.status.mockResolvedValue(status);
    mocks.git.fetch.mockResolvedValue(status);
    mocks.git.workingDiff.mockResolvedValue([
      'diff --git a/notes/today.md b/notes/today.md',
      'index 1111111..2222222 100644',
      '--- a/notes/today.md',
      '+++ b/notes/today.md',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n'));
    mocks.git.history.mockResolvedValue([]);
    mocks.git.commit.mockResolvedValue({ ...status, changes: [] });
    mocks.git.pull.mockResolvedValue(status);
    mocks.git.push.mockResolvedValue(status);
  });

  it('only shows for the fully loaded current Git notes root', async () => {
    const view = render(<GitTitleBarAction />);
    expect(await screen.findByTestId('git-sync-button')).toBeInTheDocument();

    mocks.rootFolderPath = '/other';
    view.rerender(<GitTitleBarAction />);
    expect(screen.queryByTestId('git-sync-button')).not.toBeInTheDocument();

    mocks.rootFolderPath = '/repo';
    mocks.bridgeAvailable = false;
    view.rerender(<GitTitleBarAction />);
    expect(screen.queryByTestId('git-sync-button')).not.toBeInTheDocument();
  });

  it('uses a Git branch icon and the shared shortcut tooltip surface', async () => {
    render(<GitTitleBarAction />);

    const button = await screen.findByTestId('git-sync-button');
    expect(button.querySelector('[data-icon="common.gitBranch"]')).toBeInTheDocument();
    expect(screen.getByTestId('git-sync-tooltip')).toHaveClass(
      'rounded-[var(--vlaina-notes-ui-radius-tooltip)]',
      'text-[var(--vlaina-sidebar-chat-text)]',
    );
    expect(screen.getByTestId('git-sync-tooltip')).toHaveTextContent('git.sync');
  });

  it('stays hidden when the loaded folder is not a valid Git repository', async () => {
    mocks.git.status.mockResolvedValue(null);

    render(<GitTitleBarAction />);

    await waitFor(() => expect(mocks.git.status).toHaveBeenCalledWith('/repo'));
    expect(screen.queryByTestId('git-sync-button')).not.toBeInTheDocument();
  });

  it('opens the popover and automatically loads every working-tree diff', async () => {
    await openGitPopover();

    expect(mocks.git.status).toHaveBeenCalledWith('/repo');
    expect(document.body).toHaveAttribute('data-git-selection-active', 'true');
    expect(await screen.findByText('main')).toBeInTheDocument();
    expect(screen.queryByText(/git\.branch/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('git.refresh')).not.toBeInTheDocument();
    const headerControls = screen.getByTestId('git-branch').parentElement!;
    expect(Array.from(headerControls.children).map((element) => (
      element.getAttribute('data-testid')
    ))).toEqual([
      'git-branch',
      'git-pull-button',
      'git-push-button',
      'git-close-button',
    ]);
    expect(screen.queryByText('git.aheadBehind')).not.toBeInTheDocument();
    expect(screen.getByTestId('git-pull-button')).toHaveClass('ml-auto', 'rounded-full');
    expect(screen.getByTestId('git-push-button')).toHaveTextContent('git.push');
    expect(screen.getByTestId('git-push-button')).toHaveClass('bg-[var(--vlaina-bg-tertiary)]');
    expect(screen.getByTestId('git-push-button')).not.toHaveClass(
      'bg-[var(--primary)]',
    );
    expect(screen.queryByText('git.syncNow')).not.toBeInTheDocument();
    expect(screen.getByTestId('git-close-button')).toHaveClass('h-8', 'w-8', 'rounded-full');
    expect(screen.getByTestId('git-sync-popover')).toHaveClass(
      'data-[state=closed]:duration-[var(--vlaina-duration-75)]',
    );
    expect(screen.getByTestId('git-sync-popover')).not.toHaveClass(
      'data-[state=closed]:duration-[var(--vlaina-duration-150)]',
    );
    await screen.findByTestId('git-change-row');
    await waitFor(() => expect(mocks.git.workingDiff).toHaveBeenCalledWith('/repo', 'notes/today.md'));
    expect(screen.getByTestId('git-diff')).toHaveTextContent('+new');
    expect(screen.queryByText(/diff --git/)).not.toBeInTheDocument();
    expect(screen.queryByText(/index 1111111/)).not.toBeInTheDocument();
    expect(screen.queryByText('--- a/notes/today.md')).not.toBeInTheDocument();
    expect(screen.queryByText('+++ b/notes/today.md')).not.toBeInTheDocument();
    expect(screen.queryByText('@@ -1 +1 @@')).not.toBeInTheDocument();
    expect(screen.getByTestId('git-diff-file')).toHaveAttribute('data-path', 'notes/today.md');
    expect(screen.getByTestId('git-change-row')).toHaveTextContent('+1');
    expect(screen.getByTestId('git-change-row')).toHaveTextContent('-1');
    expect(screen.getByTestId('git-change-row')).not.toHaveTextContent('git.status.modified');
    fireEvent.click(screen.getByTestId('git-open-file'));
    expect(mocks.openNote).toHaveBeenCalledWith('notes/today.md');
    fireEvent.click(screen.getByTestId('git-close-button'));
    await act(async () => undefined);
    expect(document.body).not.toHaveAttribute('data-git-selection-active');
  });

  it('saves pending notes before loading Git data on open', async () => {
    let resolveSave: () => void = () => undefined;
    mocks.flushEditorSave.mockReturnValue(new Promise<void>((resolve) => {
      resolveSave = resolve;
    }));
    render(<GitTitleBarAction />);
    const syncButton = await screen.findByTestId('git-sync-button');
    mocks.git.status.mockClear();

    fireEvent.click(syncButton);
    await waitFor(() => expect(mocks.flushTitle).toHaveBeenCalledTimes(1));
    expect(mocks.saveDirtyTabs).not.toHaveBeenCalled();
    expect(mocks.git.status).not.toHaveBeenCalled();
    expect(mocks.git.fetch).not.toHaveBeenCalled();

    resolveSave();
    await waitFor(() => expect(mocks.git.status).toHaveBeenCalledWith('/repo'));
    await waitFor(() => expect(mocks.git.fetch).toHaveBeenCalledWith('/repo'));
    expect(mocks.addToast).not.toHaveBeenCalledWith('git.saveBeforeOperationFailed', 'error');
  });

  it('shows incoming and outgoing commit counts and highlights pushable commits in blue', async () => {
    mocks.git.fetch.mockResolvedValue({ ...status, ahead: 3, behind: 2 });

    await openGitPopover();

    await waitFor(() => expect(mocks.git.fetch).toHaveBeenCalledWith('/repo'));
    await waitFor(() => expect(screen.getByTestId('git-pull-button')).toHaveTextContent('git.pull (2)'));
    expect(screen.getByTestId('git-push-button')).toHaveTextContent('git.push (3)');
    expect(screen.getByTestId('git-push-button')).toHaveClass(
      'bg-[var(--primary)]',
    );
  });

  it('loads working diffs in bounded batches', async () => {
    const changes = Array.from({ length: 6 }, (_, index) => ({
      ...change,
      path: `notes/note-${index + 1}.md`,
    }));
    const statusWithManyChanges = { ...status, changes };
    const resolvers: Array<(diff: string) => void> = [];
    mocks.git.status.mockResolvedValue(statusWithManyChanges);
    mocks.git.fetch.mockResolvedValue(statusWithManyChanges);
    mocks.git.workingDiff.mockImplementation(() => new Promise((resolve) => {
      resolvers.push(resolve);
    }));

    await openGitPopover();
    await screen.findAllByTestId('git-change-row');
    await waitFor(() => expect(mocks.git.workingDiff).toHaveBeenCalledTimes(4));

    resolvers.slice(0, 4).forEach((resolve, index) => resolve(`diff:${index}`));
    await waitFor(() => expect(mocks.git.workingDiff).toHaveBeenCalledTimes(6));
    await waitFor(() => expect(screen.getByTestId('git-diff')).toHaveTextContent('diff:0'));
    resolvers.slice(4).forEach((resolve, index) => resolve(`diff:${index + 4}`));
    await waitFor(() => expect(screen.getByTestId('git-diff')).toHaveTextContent('diff:5'));
  });

  it('saves pending notes before committing selected changes', async () => {
    await openGitPopover();
    await screen.findByTestId('git-change-row');
    fireEvent.change(screen.getByTestId('git-commit-message'), { target: { value: 'Update notes' } });
    fireEvent.click(screen.getByTestId('git-commit-button'));

    await waitFor(() => expect(mocks.git.commit).toHaveBeenCalledWith('/repo', {
      message: 'Update notes',
      paths: ['notes/today.md'],
    }));
    expect(mocks.flushTitle).toHaveBeenCalledTimes(2);
    expect(mocks.saveDirtyTabs).toHaveBeenCalledTimes(1);
  });

  it('fills the commit message with the current local time', async () => {
    await openGitPopover();

    const currentTimeButton = screen.getByTestId('git-use-current-time');
    expect(currentTimeButton).toHaveClass(
      'rounded-full',
      'bg-[var(--vlaina-bg-tertiary)]',
    );
    expect(currentTimeButton.querySelector('[data-icon="misc.clock"]')).toBeInTheDocument();
    fireEvent.click(currentTimeButton);

    expect((screen.getByTestId('git-commit-message') as HTMLTextAreaElement).value)
      .toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('selects all files by default and commits only checked files', async () => {
    const secondChange = { ...change, path: 'notes/later.md' };
    const statusWithTwoChanges = { ...status, changes: [change, secondChange] };
    mocks.git.status.mockResolvedValue(statusWithTwoChanges);
    mocks.git.fetch.mockResolvedValue(statusWithTwoChanges);
    mocks.git.workingDiff.mockImplementation(async (_rootPath, filePath) => [
      `diff --git a/${filePath} b/${filePath}`,
      `--- a/${filePath}`,
      `+++ b/${filePath}`,
      '@@ -0,0 +1 @@',
      `+diff:${filePath}`,
    ].join('\n'));
    await openGitPopover();

    const checkboxes = await screen.findAllByTestId('git-change-checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toHaveAttribute('aria-checked', 'true');
    expect(checkboxes[1]).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => {
      expect(mocks.git.workingDiff).toHaveBeenCalledWith('/repo', 'notes/today.md');
      expect(mocks.git.workingDiff).toHaveBeenCalledWith('/repo', 'notes/later.md');
    });
    expect(screen.getByTestId('git-diff')).toHaveTextContent('diff:notes/today.md');
    expect(screen.getByTestId('git-diff')).toHaveTextContent('diff:notes/later.md');
    const diffFiles = screen.getAllByTestId('git-diff-file');
    expect(diffFiles).toHaveLength(2);
    diffFiles.forEach((file) => {
      expect(file).toHaveClass(
        'overflow-hidden',
        'rounded-[var(--vlaina-radius-8px)]',
        'border',
        'bg-[var(--vlaina-bg-secondary)]',
      );
    });
    expect(diffFiles[0].parentElement).toHaveClass('space-y-3');
    expect(screen.getAllByTestId('git-open-diff-file')[0].parentElement).toHaveClass('select-none');
    expect(screen.getByTestId('git-commit-message')).toHaveClass('select-text');
    expect(screen.getByTestId('git-commit-message').parentElement).toHaveClass(
      'rounded-[var(--vlaina-ui-radius-group)]',
      'bg-[var(--vlaina-color-setting-field)]',
      'shadow-[var(--vlaina-shadow-control-active)]',
    );
    const fileScrollAreas = screen.getAllByTestId('git-diff-file-scroll');
    expect(fileScrollAreas).toHaveLength(2);
    fileScrollAreas.forEach((scrollArea) => {
      expect(scrollArea).toHaveClass(
        'h-[var(--vlaina-size-180px)]',
        'flex-none',
        'overflow-auto',
        'app-scrollbar',
      );
    });
    expect(screen.queryByTestId('git-diff-scroll')).not.toBeInTheDocument();
    fireEvent.click(checkboxes[1]);
    fireEvent.change(screen.getByTestId('git-commit-message'), { target: { value: 'Selected note' } });
    fireEvent.click(screen.getByTestId('git-commit-button'));

    await waitFor(() => expect(mocks.git.commit).toHaveBeenCalledWith('/repo', {
      message: 'Selected note',
      paths: ['notes/today.md'],
    }));
  });

  it('allows the first push while keeping pull disabled without an upstream branch', async () => {
    const statusWithoutUpstream = {
      ...status,
      upstream: null,
    };
    mocks.git.status.mockResolvedValue(statusWithoutUpstream);
    mocks.git.fetch.mockResolvedValue(statusWithoutUpstream);

    await openGitPopover();

    await screen.findByTestId('git-change-row');

    expect(screen.getByTestId('git-pull-button')).toBeDisabled();
    expect(screen.getByTestId('git-push-button')).not.toBeDisabled();
  });

  it('shows a clear empty state when the repository has no commits', async () => {
    const cleanStatus = { ...status, changes: [] };
    mocks.git.status.mockResolvedValue(cleanStatus);
    mocks.git.fetch.mockResolvedValue(cleanStatus);
    await openGitPopover();
    expect(await screen.findByText('git.noHistory')).toBeInTheDocument();
  });

  it('opens history directly without tabs when the repository has no changes', async () => {
    const cleanStatus = { ...status, changes: [] };
    mocks.git.status.mockResolvedValue(cleanStatus);
    mocks.git.fetch.mockResolvedValue(cleanStatus);
    await openGitPopover();

    await waitFor(() => expect(mocks.git.history).toHaveBeenCalledWith('/repo', 30));
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(await screen.findByText('git.noHistory')).toBeInTheDocument();
    expect(screen.queryByTestId('git-changes-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('git-commit-message')).not.toBeInTheDocument();
    expect(screen.queryByTestId('git-use-current-time')).not.toBeInTheDocument();
    expect(screen.queryByTestId('git-commit-button')).not.toBeInTheDocument();
    expect(screen.queryByText('git.noChanges')).not.toBeInTheDocument();
  });
});
