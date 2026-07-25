import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitTitleBarAction } from './GitTitleBarAction';

const mocks = vi.hoisted(() => ({
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
  path: 'notes/today.md', previousPath: null, indexStatus: ' ', workTreeStatus: 'M',
  status: 'modified', staged: false, unstaged: true,
};
const status = {
  rootPath: '/repo', head: '0123456789abcdef', branch: 'main', detached: false,
  upstream: 'origin/main', ahead: 0, behind: 0,
  remoteUrl: 'https://example.invalid/repo.git', remoteConfigured: true,
  remoteProtocolSupported: true, changes: [change],
};
const historyItem = {
  hash: '0123456789abcdef', shortHash: '0123456', subject: 'Initial notes',
  author: 'Test User', authoredAt: '2026-07-12T08:00:00.000Z',
};

vi.mock('@/lib/electron/bridge', () => ({ getElectronBridge: () => ({ git: mocks.git }) }));
vi.mock('@/stores/useNotesRootStore', () => ({
  useNotesRootStore: (selector: (state: { currentNotesRoot: { path: string } }) => unknown) =>
    selector({ currentNotesRoot: { path: '/repo' } }),
}));
vi.mock('@/stores/useNotesStore', () => ({
  useNotesStore: (selector: (state: {
    notesPath: string;
    rootFolderPath: string;
    rootFolder: { isGitRepository: boolean };
    openNote: typeof mocks.openNote;
  }) => unknown) => selector({
    notesPath: '/repo', rootFolderPath: '/repo', rootFolder: { isGitRepository: true },
    openNote: mocks.openNote,
  }),
}));
vi.mock('@/stores/useToastStore', () => ({
  useToastStore: (selector: (state: { addToast: typeof mocks.addToast }) => unknown) =>
    selector({ addToast: mocks.addToast }),
}));
vi.mock('@/stores/notes/dirtyOpenTabs', () => ({ saveDirtyRegularOpenTabs: mocks.saveDirtyTabs }));
vi.mock('../Editor/utils/titleCommitRegistry', () => ({ flushCurrentTitleCommit: mocks.flushTitle }));
vi.mock('../Editor/utils/editorSaveRegistry', () => ({ flushCurrentEditorSave: mocks.flushEditorSave }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: mocks.t }) }));
vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name, className }: { name: string; className?: string }) => (
    <span data-icon={name} className={className} />
  ),
}));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
  await screen.findByTestId('git-change-row');
}

async function waitUntilEnabled(testId: string) {
  await waitFor(() => expect(screen.getByTestId(testId)).not.toBeDisabled());
}

describe('Git sync operations', () => {
  beforeEach(() => {
    mocks.addToast.mockReset();
    mocks.flushTitle.mockReset().mockResolvedValue(undefined);
    mocks.flushEditorSave.mockReset().mockResolvedValue(undefined);
    mocks.saveDirtyTabs.mockReset().mockResolvedValue(true);
    mocks.openNote.mockReset().mockResolvedValue(undefined);
    Object.values(mocks.git).forEach((mock) => mock.mockReset());
    mocks.git.status.mockResolvedValue(status);
    mocks.git.fetch.mockResolvedValue(status);
    mocks.git.workingDiff.mockResolvedValue('');
    mocks.git.history.mockResolvedValue([historyItem]);
    mocks.git.commitDiff.mockResolvedValue('@@ -0,0 +1 @@\n+# Initial notes');
    mocks.git.commit.mockResolvedValue(status);
    mocks.git.pull.mockResolvedValue(status);
    mocks.git.push.mockResolvedValue(status);
  });

  it('saves before pull, while push only sends committed work', async () => {
    await openGitPopover();
    mocks.flushTitle.mockClear();
    mocks.flushEditorSave.mockClear();
    mocks.saveDirtyTabs.mockClear();

    fireEvent.click(screen.getByTestId('git-pull-button'));
    await waitFor(() => expect(mocks.git.pull).toHaveBeenCalledWith('/repo'));
    expect(mocks.flushTitle).toHaveBeenCalledTimes(1);
    expect(mocks.flushEditorSave).toHaveBeenCalledTimes(1);
    expect(mocks.saveDirtyTabs).toHaveBeenCalledTimes(1);
    await waitUntilEnabled('git-push-button');

    mocks.flushTitle.mockClear();
    mocks.saveDirtyTabs.mockClear();
    fireEvent.click(screen.getByTestId('git-push-button'));
    await waitFor(() => expect(mocks.git.push).toHaveBeenCalledWith('/repo'));
    expect(mocks.flushTitle).not.toHaveBeenCalled();
    expect(mocks.saveDirtyTabs).not.toHaveBeenCalled();
  });

  it('spins only the operation that is currently running', async () => {
    let resolvePull: (nextStatus: typeof status) => void = () => undefined;
    mocks.git.pull.mockReturnValue(new Promise((resolve) => {
      resolvePull = resolve;
    }));
    await openGitPopover();

    fireEvent.click(screen.getByTestId('git-pull-button'));
    const pullButton = screen.getByTestId('git-pull-button');
    const pushButton = screen.getByTestId('git-push-button');
    await waitFor(() => expect(pullButton).toHaveAttribute('aria-busy', 'true'));
    expect(pullButton.querySelector('[data-icon="common.refresh"]')).toHaveClass('animate-spin');
    expect(pushButton.querySelector('[data-icon="common.upload"]')).not.toHaveClass('animate-spin');

    resolvePull(status);
    await waitFor(() => expect(pullButton).toHaveAttribute('aria-busy', 'false'));

    let resolvePush: (nextStatus: typeof status) => void = () => undefined;
    mocks.git.push.mockReturnValue(new Promise((resolve) => {
      resolvePush = resolve;
    }));
    fireEvent.click(pushButton);
    await waitFor(() => expect(pushButton).toHaveAttribute('aria-busy', 'true'));
    expect(pushButton.querySelector('[data-icon="common.refresh"]')).toHaveClass('animate-spin');
    expect(pullButton.querySelector('[data-icon="common.download"]')).not.toHaveClass('animate-spin');

    resolvePush(status);
    await waitFor(() => expect(pushButton).toHaveAttribute('aria-busy', 'false'));
  });

  it('pulls directly without an automatic remote preflight', async () => {
    await openGitPopover();

    fireEvent.click(screen.getByTestId('git-pull-button'));
    await waitFor(() => expect(mocks.git.pull).toHaveBeenCalledWith('/repo'));
    expect(mocks.git.fetch).not.toHaveBeenCalled();
  });

  it('blocks a pull when pending notes cannot be saved', async () => {
    await openGitPopover();
    mocks.saveDirtyTabs.mockResolvedValue(false);
    fireEvent.click(screen.getByTestId('git-pull-button'));

    await waitFor(() => expect(mocks.addToast).toHaveBeenCalledWith(
      'git.saveBeforeOperationFailed',
      'error',
    ));
    expect(mocks.git.pull).not.toHaveBeenCalled();
  });

  it('reports a failed Git operation and restores the controls', async () => {
    mocks.git.pull.mockRejectedValue(new Error('network unavailable'));
    await openGitPopover();

    fireEvent.click(screen.getByTestId('git-pull-button'));

    await waitFor(() => expect(mocks.addToast).toHaveBeenCalledWith(
      'git.networkUnavailable',
      'error',
    ));
    expect(screen.getByTestId('git-pull-button')).not.toBeDisabled();
  });

  it('does not retry a failed history request on every render', async () => {
    mocks.git.history.mockRejectedValue(new Error('history unavailable'));
    await openGitPopover();
    fireEvent.click(screen.getByRole('tab', { name: 'git.history' }));

    await waitFor(() => expect(mocks.git.history).toHaveBeenCalledTimes(1));
    expect(screen.getByText('git.operationFailed')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.git.history).toHaveBeenCalledTimes(1);
  });

  it('discards a history response from a closed panel session', async () => {
    const staleHistory = { ...historyItem, subject: 'Stale history' };
    const currentHistory = {
      ...historyItem,
      hash: 'fedcba9876543210',
      subject: 'Current history',
    };
    let resolveStaleHistory: (history: typeof historyItem[]) => void = () => undefined;
    mocks.git.history
      .mockImplementationOnce(() => new Promise<typeof historyItem[]>((resolve) => {
        resolveStaleHistory = resolve;
      }))
      .mockResolvedValueOnce([currentHistory]);
    await openGitPopover();
    fireEvent.click(screen.getByRole('tab', { name: 'git.history' }));
    await waitFor(() => expect(mocks.git.history).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('git-close-button'));
    fireEvent.click(screen.getByTestId('git-sync-button'));
    await screen.findByTestId('git-change-row');
    fireEvent.click(screen.getByRole('tab', { name: 'git.history' }));
    expect(await screen.findByText('Current history')).toBeInTheDocument();

    resolveStaleHistory([staleHistory]);
    await waitFor(() => expect(screen.queryByText('Stale history')).not.toBeInTheDocument());
  });

  it('invalidates history when another process advances HEAD', async () => {
    const nextHistory = {
      ...historyItem,
      hash: 'fedcba9876543210',
      subject: 'External commit',
    };
    await openGitPopover();
    fireEvent.click(screen.getByRole('tab', { name: 'git.history' }));
    await screen.findByTestId('git-history-row');
    mocks.git.status.mockClear();
    mocks.git.history.mockResolvedValue([nextHistory]);
    mocks.git.status.mockResolvedValue({ ...status, head: 'fedcba9876543210' });

    window.dispatchEvent(new Event('focus'));

    await waitFor(() => expect(mocks.git.history).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('External commit')).toBeInTheDocument();
  });

  it('loads commit history and opens the latest commit diff', async () => {
    const history = Array.from({ length: 32 }, (_, index) => ({
      ...historyItem,
      hash: `${index + 1}`.padStart(16, '0'),
      shortHash: `${index + 1}`.padStart(7, '0'),
      subject: index === 0 ? historyItem.subject : `Commit ${index + 1}`,
    }));
    mocks.git.history.mockResolvedValue(history);
    mocks.git.commitDiff.mockResolvedValue([
      'diff --git a/notes/today.md b/notes/today.md',
      'index 1111111..2222222 100644',
      '--- a/notes/today.md',
      '+++ b/notes/today.md',
      '@@ -1 +1 @@',
      '-Old notes',
      '+# Initial notes',
      'diff --git a/docs/setup.md b/docs/setup.md',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/docs/setup.md',
      '@@ -0,0 +1,2 @@',
      '+Install dependencies.',
      '+Start the app.',
    ].join('\n'));
    await openGitPopover();
    expect(screen.getByTestId('git-tab-active-background')).not.toHaveClass('translate-x-full');
    fireEvent.click(screen.getByRole('tab', { name: 'git.history' }));
    expect(screen.getByTestId('git-tab-active-background')).toHaveClass('translate-x-full');

    const rows = await screen.findAllByTestId('git-history-row');
    expect(rows).toHaveLength(30);
    expect(screen.getByTestId('git-history-list-scroll')).toHaveClass(
      'h-[var(--vlaina-size-240px)]',
    );
    const row = rows[0];
    expect(mocks.git.history).toHaveBeenCalledWith('/repo', 30);
    expect(row).toHaveTextContent('Initial notes');
    expect(row).not.toHaveTextContent('0123456');
    expect(row).not.toHaveTextContent('Test User');
    expect(row).not.toHaveTextContent('2026');

    await waitFor(() => expect(mocks.git.commitDiff).toHaveBeenCalledWith('/repo', history[0].hash));
    expect(row).toHaveClass('bg-[var(--vlaina-sidebar-row-selected-bg)]');
    expect(row).toHaveClass('text-[var(--vlaina-sidebar-row-selected-text)]');
    await waitFor(() => expect(screen.getByTestId('git-diff')).toHaveTextContent('# Initial notes'));
    const files = screen.getAllByTestId('git-diff-file');
    expect(files).toHaveLength(2);
    expect(files[0]).toHaveAttribute('data-path', 'notes/today.md');
    expect(files[0]).toHaveTextContent('+1');
    expect(files[0]).toHaveTextContent('-1');
    expect(files[1]).toHaveAttribute('data-path', 'docs/setup.md');
    expect(files[1]).toHaveTextContent('+2');
    expect(files[1]).not.toHaveTextContent('-0');
    fireEvent.click(screen.getAllByTestId('git-open-diff-file')[1]);
    expect(mocks.openNote).toHaveBeenCalledWith('docs/setup.md');
    expect(screen.queryByText('git.selectCommit')).not.toBeInTheDocument();
  });

  it('keeps the current diff visible while another commit diff loads', async () => {
    const nextCommit = {
      ...historyItem,
      hash: 'fedcba9876543210',
      shortHash: 'fedcba9',
      subject: 'Previous notes',
    };
    let resolveNextDiff: (diff: string) => void = () => undefined;
    const nextDiff = new Promise<string>((resolve) => {
      resolveNextDiff = resolve;
    });
    mocks.git.history.mockResolvedValue([historyItem, nextCommit]);
    mocks.git.commitDiff.mockImplementation((_root: string, hash: string) => (
      hash === historyItem.hash
        ? Promise.resolve('@@ -0,0 +1 @@\n+# Current diff')
        : nextDiff
    ));

    await openGitPopover();
    fireEvent.click(screen.getByRole('tab', { name: 'git.history' }));
    await waitFor(() => expect(screen.getByTestId('git-history-diff')).toHaveTextContent('# Current diff'));

    fireEvent.click(screen.getAllByTestId('git-history-row')[1]);
    const historyDiff = screen.getByTestId('git-history-diff');
    expect(historyDiff).toHaveTextContent('# Current diff');
    expect(historyDiff).not.toHaveTextContent('git.loading');

    resolveNextDiff('@@ -1 +1 @@\n-# Current diff\n+# Previous diff');
    await waitFor(() => expect(historyDiff).toHaveTextContent('# Previous diff'));
  });

  it('serializes rapid history diff requests and only loads the latest queued commit', async () => {
    const secondCommit = { ...historyItem, hash: '1111111111111111', subject: 'Second' };
    const latestCommit = { ...historyItem, hash: '2222222222222222', subject: 'Latest' };
    let resolveFirst: (diff: string) => void = () => undefined;
    let resolveLatest: (diff: string) => void = () => undefined;
    mocks.git.history.mockResolvedValue([historyItem, secondCommit, latestCommit]);
    mocks.git.commitDiff.mockImplementation((_root: string, hash: string) => new Promise<string>((resolve) => {
      if (hash === historyItem.hash) resolveFirst = resolve;
      if (hash === latestCommit.hash) resolveLatest = resolve;
    }));

    await openGitPopover();
    fireEvent.click(screen.getByRole('tab', { name: 'git.history' }));
    const rows = await screen.findAllByTestId('git-history-row');
    await waitFor(() => expect(mocks.git.commitDiff).toHaveBeenCalledTimes(1));

    fireEvent.click(rows[1]);
    fireEvent.click(rows[2]);
    expect(mocks.git.commitDiff).toHaveBeenCalledTimes(1);

    resolveFirst('first diff');
    await waitFor(() => expect(mocks.git.commitDiff).toHaveBeenCalledTimes(2));
    expect(mocks.git.commitDiff).toHaveBeenLastCalledWith('/repo', latestCommit.hash);

    resolveLatest('@@ -0,0 +1 @@\n+latest diff');
    await waitFor(() => expect(screen.getByTestId('git-history-diff')).toHaveTextContent('latest diff'));
    expect(mocks.git.commitDiff).not.toHaveBeenCalledWith('/repo', secondCommit.hash);
  });
});
