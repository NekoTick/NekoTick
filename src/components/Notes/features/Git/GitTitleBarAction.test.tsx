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
  head: '0123456789abcdef',
  branch: 'main',
  detached: false,
  upstream: 'origin/main',
  ahead: 0,
  behind: 0,
  remoteUrl: 'https://example.invalid/repo.git',
  remoteConfigured: true,
  remoteProtocolSupported: true,
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
    expect(button).toHaveClass('text-[var(--vlaina-sidebar-row-selected-text)]');
  });

  it('uses the normal titlebar color when the repository has no committable changes', async () => {
    mocks.git.status.mockResolvedValue({ ...status, changes: [] });

    render(<GitTitleBarAction />);

    const button = await screen.findByTestId('git-sync-button');
    expect(button).toHaveClass('text-[var(--vlaina-color-titlebar-button)]');
    expect(button).not.toHaveClass('text-[var(--vlaina-sidebar-row-selected-text)]');
  });

  it('stays hidden when the loaded folder is not a valid Git repository', async () => {
    mocks.git.status.mockResolvedValue(null);

    render(<GitTitleBarAction />);

    await waitFor(() => expect(mocks.git.status).toHaveBeenCalledWith('/repo'));
    expect(screen.queryByTestId('git-sync-button')).not.toBeInTheDocument();
  });

  it('keeps the Git entry available when repository detection fails', async () => {
    mocks.git.status.mockRejectedValue(new Error('Git command timed out.'));

    render(<GitTitleBarAction />);

    expect(await screen.findByTestId('git-sync-button')).toBeInTheDocument();
  });

  it('opens the popover and loads the working-tree diff in one batch', async () => {
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
      'data-[state=open]:duration-[var(--vlaina-duration-100)]',
    );
    expect(screen.getByTestId('git-sync-popover')).not.toHaveClass(
      'data-[state=open]:duration-[var(--vlaina-duration-200)]',
    );
    await screen.findByTestId('git-change-row');
    await waitFor(() => expect(mocks.git.workingDiff).toHaveBeenCalledWith('/repo', ['notes/today.md']));
    await waitFor(() => expect(screen.getByTestId('git-diff')).toHaveTextContent('+new'));
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

  it('keeps an untracked binary image in the selectable change list', async () => {
    const imageChange = {
      ...change,
      path: 'assets/cover.png',
      indexStatus: '?',
      workTreeStatus: '?',
      status: 'untracked',
    };
    mocks.git.status.mockResolvedValue({ ...status, changes: [imageChange] });
    mocks.git.workingDiff.mockResolvedValue([
      'diff --git a/assets/cover.png b/assets/cover.png',
      'new file mode 100644',
      'index 0000000..1234567',
      'Binary files /dev/null and b/assets/cover.png differ',
    ].join('\n'));

    await openGitPopover();

    const row = await screen.findByTestId('git-change-row');
    expect(row).toHaveTextContent('assets/cover.png');
    expect(row).not.toHaveTextContent('+0');
    expect(row).not.toHaveTextContent('-0');
    expect(screen.getByTestId('git-change-checkbox')).toHaveAttribute('data-state', 'checked');
    expect(screen.queryByTestId('git-open-file')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('git-change-file-label'));
    expect(mocks.openNote).not.toHaveBeenCalled();
    expect(await screen.findByTestId('git-diff-file')).toHaveAttribute('data-path', 'assets/cover.png');
    expect(screen.queryByTestId('git-open-diff-file')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('git-diff-file-label'));
    expect(mocks.openNote).not.toHaveBeenCalled();
    expect(screen.getByTestId('git-diff')).toHaveTextContent('Binary files');
  });

  it('resizes the Git panel from its bottom edge and resets on double click', async () => {
    await openGitPopover();
    await screen.findByTestId('git-change-row');
    await waitFor(() => expect(screen.getByTestId('git-diff')).toHaveTextContent('+new'));

    const popover = screen.getByTestId('git-sync-popover');
    const handle = screen.getByTestId('git-popover-resize-handle');
    expect(handle).toHaveAttribute('role', 'separator');
    expect(handle).toHaveAttribute('aria-label', 'git.resizePopover');
    expect(handle).toHaveAttribute('tabindex', '0');

    fireEvent.pointerDown(handle, { button: 0, clientY: 600, pointerId: 1 });
    const translationsAfterDragStart = mocks.t.mock.calls.length;
    for (let clientY = 620; clientY <= 700; clientY += 20) {
      fireEvent.pointerMove(window, { clientY, pointerId: 1 });
    }
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    expect(popover).toHaveStyle({ height: '700px' });
    expect(handle).toHaveAttribute('aria-valuenow', '700');
    expect(mocks.t).toHaveBeenCalledTimes(translationsAfterDragStart);
    fireEvent.pointerUp(window, { pointerId: 1 });

    fireEvent.doubleClick(handle);
    expect((popover as HTMLElement).style.height).toBe('');
    expect(handle).toHaveAttribute('aria-valuenow', '600');
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
    await waitFor(() => expect(mocks.saveDirtyTabs).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.git.status).toHaveBeenCalledWith('/repo'));
    expect(mocks.git.fetch).not.toHaveBeenCalled();
    expect(mocks.addToast).not.toHaveBeenCalledWith('git.saveBeforeOperationFailed', 'error');
  });

  it('blocks stale controls when saving on open fails and supports retry', async () => {
    render(<GitTitleBarAction />);
    const syncButton = await screen.findByTestId('git-sync-button');
    mocks.git.status.mockClear();
    mocks.saveDirtyTabs.mockResolvedValue(false);

    fireEvent.click(syncButton);
    expect(await screen.findByText('git.saveBeforeOperationFailed')).toBeInTheDocument();
    expect(screen.getByTestId('git-pull-button')).toBeDisabled();
    expect(screen.getByTestId('git-push-button')).toBeDisabled();
    expect(screen.queryByTestId('git-change-row')).not.toBeInTheDocument();
    expect(mocks.git.status).not.toHaveBeenCalled();

    mocks.saveDirtyTabs.mockResolvedValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'git.retry' }));
    expect(await screen.findByTestId('git-change-row')).toBeInTheDocument();
    expect(mocks.git.status).toHaveBeenCalledTimes(1);
  });

  it('explains and blocks detached, conflicted, and diverged states', async () => {
    mocks.git.status.mockResolvedValue({ ...status, branch: null, detached: true });
    const detachedView = render(<GitTitleBarAction />);
    fireEvent.click(await screen.findByTestId('git-sync-button'));
    expect(await screen.findByText('git.detachedUnavailable')).toBeInTheDocument();
    expect(screen.getByTestId('git-commit-button')).toBeDisabled();
    expect(screen.getByTestId('git-pull-button')).toBeDisabled();
    expect(screen.getByTestId('git-push-button')).toBeDisabled();
    detachedView.unmount();

    const conflictedChange = {
      ...change,
      indexStatus: 'U',
      workTreeStatus: 'U',
      status: 'conflicted',
    };
    mocks.git.status.mockResolvedValue({ ...status, changes: [conflictedChange] });
    const conflictedView = render(<GitTitleBarAction />);
    fireEvent.click(await screen.findByTestId('git-sync-button'));
    expect(await screen.findByText('git.conflicts')).toBeInTheDocument();
    expect(screen.getByText('git.conflicted')).toBeInTheDocument();
    expect(screen.getByTestId('git-commit-button')).toBeDisabled();
    conflictedView.unmount();

    mocks.git.status.mockResolvedValue({ ...status, ahead: 1, behind: 1 });
    render(<GitTitleBarAction />);
    fireEvent.click(await screen.findByTestId('git-sync-button'));
    expect(await screen.findByText('git.diverged')).toBeInTheDocument();
    expect(screen.getByTestId('git-pull-button')).toBeDisabled();
    expect(screen.getByTestId('git-push-button')).toBeDisabled();
  });

  it('blocks a configured remote that is not HTTPS or SSH', async () => {
    mocks.git.status.mockResolvedValue({
      ...status,
      remoteUrl: null,
      remoteConfigured: true,
      remoteProtocolSupported: false,
    });

    await openGitPopover();

    expect(screen.getByText('git.unsupportedRemote')).toBeInTheDocument();
    expect(screen.getByTestId('git-pull-button')).toBeDisabled();
    expect(screen.getByTestId('git-push-button')).toBeDisabled();
  });

  it('bounds aggregate diff rendering and blocks an incomplete review', async () => {
    mocks.git.workingDiff.mockResolvedValue('x'.repeat(4 * 1024 * 1024 + 1));

    await openGitPopover();

    expect(await screen.findByText('git.diffTooLarge')).toBeInTheDocument();
    expect(screen.getByTestId('git-commit-button')).toBeDisabled();
    expect(mocks.addToast).toHaveBeenCalledWith('git.diffTooLarge', 'error');
  });

  it('shows incoming and outgoing commit counts and highlights pushable commits in blue', async () => {
    mocks.git.status.mockResolvedValue({ ...status, ahead: 3, behind: 2 });

    await openGitPopover();

    await waitFor(() => expect(screen.getByTestId('git-pull-button')).toHaveTextContent('git.pull (2)'));
    expect(screen.getByTestId('git-push-button')).toHaveTextContent('git.push (3)');
    expect(screen.getByTestId('git-push-button')).toHaveClass(
      'bg-[var(--primary)]',
    );
  });

  it('loads working diffs in bounded batches', async () => {
    const changes = Array.from({ length: 206 }, (_, index) => ({
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
    const rows = await screen.findAllByTestId('git-change-row');
    rows.forEach((row) => {
      expect(row).not.toHaveTextContent('+0');
      expect(row).not.toHaveTextContent('-0');
    });
    await waitFor(() => expect(mocks.git.workingDiff).toHaveBeenCalledTimes(1));
    expect(mocks.git.workingDiff.mock.calls[0][1]).toHaveLength(100);
    resolvers[0]('@@ -0,0 +1 @@\n+batch:1');
    await waitFor(() => expect(mocks.git.workingDiff).toHaveBeenCalledTimes(2));
    expect(mocks.git.workingDiff.mock.calls[1][1]).toHaveLength(100);
    resolvers[1]('@@ -0,0 +1 @@\n+batch:2');
    await waitFor(() => expect(mocks.git.workingDiff).toHaveBeenCalledTimes(3));
    expect(mocks.git.workingDiff.mock.calls[2][1]).toHaveLength(6);
    resolvers[2]('@@ -0,0 +1 @@\n+batch:3');
    await waitFor(() => expect(screen.getByTestId('git-diff')).toHaveTextContent('batch:3'));
  });

  it('commits the reviewed disk snapshot without saving again', async () => {
    await openGitPopover();
    await screen.findByTestId('git-change-row');
    mocks.flushTitle.mockClear();
    mocks.flushEditorSave.mockClear();
    mocks.saveDirtyTabs.mockClear();
    fireEvent.change(screen.getByTestId('git-commit-message'), { target: { value: 'Update notes' } });
    fireEvent.click(screen.getByTestId('git-commit-button'));

    await waitFor(() => expect(mocks.git.commit).toHaveBeenCalledWith('/repo', {
      message: 'Update notes',
      paths: ['notes/today.md'],
    }));
    await waitFor(() => expect(screen.getByTestId('git-sync-button')).toHaveClass(
      'text-[var(--vlaina-color-titlebar-button)]',
    ));
    expect(screen.getByTestId('git-sync-button')).not.toHaveClass(
      'text-[var(--vlaina-sidebar-row-selected-text)]',
    );
    expect(mocks.flushTitle).not.toHaveBeenCalled();
    expect(mocks.flushEditorSave).not.toHaveBeenCalled();
    expect(mocks.saveDirtyTabs).not.toHaveBeenCalled();
  });

  it('fills the commit message with the current local time', async () => {
    await openGitPopover();

    const currentTimeButton = screen.getByTestId('git-use-current-time');
    await waitFor(() => expect(currentTimeButton).not.toBeDisabled());
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
    mocks.git.workingDiff.mockImplementation(async (_rootPath, filePaths: string[]) => (
      filePaths.map((filePath) => [
        `diff --git a/${filePath} b/${filePath}`,
        `--- a/${filePath}`,
        `+++ b/${filePath}`,
        '@@ -0,0 +1 @@',
        `+diff:${filePath}`,
      ].join('\n')).join('\n')
    ));
    await openGitPopover();

    const checkboxes = await screen.findAllByTestId('git-change-checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toHaveAttribute('aria-checked', 'true');
    expect(checkboxes[1]).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => {
      expect(mocks.git.workingDiff).toHaveBeenCalledWith(
        '/repo',
        ['notes/today.md', 'notes/later.md'],
      );
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
    expect(screen.queryByTestId('git-diff-file-scroll')).not.toBeInTheDocument();
    expect(screen.getByTestId('git-diff-scroll')).toHaveClass(
      'h-[var(--vlaina-size-180px)]',
      'flex-none',
    );
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
    await openGitPopover();
    fireEvent.click(screen.getByRole('tab', { name: 'git.history' }));

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
