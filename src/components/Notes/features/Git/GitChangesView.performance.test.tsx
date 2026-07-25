import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitChangesView } from './GitChangesView';

const mocks = vi.hoisted(() => ({
  changeRowRender: vi.fn(),
  diffRender: vi.fn(),
  getDiffStats: vi.fn(() => ({ 'notes/today.md': { additions: 1, deletions: 1 } })),
  openNote: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./GitUnifiedDiff', async () => {
  const { memo } = await import('react');
  return {
    getGitDiffStatsByPath: mocks.getDiffStats,
    GitUnifiedDiff: memo((props: { diff: string[]; onOpenFile: (path: string) => void }) => {
      mocks.diffRender(props);
      return <div data-testid="git-diff" />;
    }),
  };
});
vi.mock('@/stores/useNotesStore', () => ({
  useNotesStore: (selector: (state: { openNote: typeof mocks.openNote }) => unknown) =>
    selector({ openNote: mocks.openNote }),
}));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock('@/components/Settings/components/SettingsFields', () => ({
  SettingsTextarea: ({ textareaClassName: _textareaClassName, ...props }:
    React.TextareaHTMLAttributes<HTMLTextAreaElement> & { textareaClassName?: string }) => (
      <textarea {...props} />
    ),
}));
vi.mock('@/components/ui/overlay-scroll-area', () => ({
  OverlayScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: (props: { 'data-path'?: string; checked?: boolean }) => {
    if (props['data-path']) mocks.changeRowRender(props['data-path']);
    return <input type="checkbox" checked={Boolean(props.checked)} readOnly />;
  },
}));

const changes = [{
  path: 'notes/today.md',
  previousPath: null,
  indexStatus: ' ',
  workTreeStatus: 'M',
  status: 'modified' as const,
  staged: false,
  unstaged: true,
}];
const diffs = ['-Old\n+New'];
const selectedCommitPaths = new Set(['notes/today.md']);
const doNothing = () => undefined;

function TestView() {
  const [commitMessage, setCommitMessage] = useState('');
  return (
    <GitChangesView
      changes={changes}
      diffs={diffs}
      diffLoading={false}
      diffError={null}
      commitMessage={commitMessage}
      selectedCommitPaths={selectedCommitPaths}
      busy={false}
      commitUnavailable={false}
      onCommitMessageChange={setCommitMessage}
      onUseCurrentTime={doNothing}
      onToggleCommitPath={doNothing}
      onToggleAllCommitPaths={doNothing}
      onCommit={doNothing}
    />
  );
}

describe('GitChangesView rendering budget', () => {
  beforeEach(() => {
    mocks.changeRowRender.mockClear();
    mocks.diffRender.mockClear();
    mocks.getDiffStats.mockClear();
  });

  it('does not reparse or reconcile diffs while the commit message changes', () => {
    render(<TestView />);
    const initialDiffRenders = mocks.diffRender.mock.calls.length;
    const initialRowRenders = mocks.changeRowRender.mock.calls.length;
    const initialStatsReads = mocks.getDiffStats.mock.calls.length;

    fireEvent.change(screen.getByTestId('git-commit-message'), {
      target: { value: 'Updated message' },
    });

    expect(mocks.diffRender).toHaveBeenCalledTimes(initialDiffRenders);
    expect(mocks.changeRowRender).toHaveBeenCalledTimes(initialRowRenders);
    expect(mocks.getDiffStats).toHaveBeenCalledTimes(initialStatsReads);
  });
});
