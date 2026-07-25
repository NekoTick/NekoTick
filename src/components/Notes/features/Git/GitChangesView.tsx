import { memo, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Icon } from '@/components/ui/icons';
import { OverlayScrollArea } from '@/components/ui/overlay-scroll-area';
import { secondaryPillButtonClass } from '@/components/ui/surfaceStyles';
import { SettingsTextarea } from '@/components/Settings/components/SettingsFields';
import { isImageFilename } from '@/lib/assets/core/naming';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n';
import { useNotesStore } from '@/stores/useNotesStore';
import type { GitChange } from './gitUiTypes';
import { getGitChangeKind } from './gitUiTypes';
import { getGitDiffStatsByPath, GitUnifiedDiff } from './GitUnifiedDiff';

interface GitChangesViewProps {
  changes: GitChange[];
  diffs: string[];
  diffLoading: boolean;
  diffError: MessageKey | null;
  commitMessage: string;
  selectedCommitPaths: Set<string>;
  busy: boolean;
  commitUnavailable: boolean;
  onCommitMessageChange: (message: string) => void;
  onUseCurrentTime: () => void;
  onToggleCommitPath: (path: string) => void;
  onToggleAllCommitPaths: () => void;
  onCommit: () => void;
}

export const GitChangesView = memo(function GitChangesView({
  changes,
  diffs,
  diffLoading,
  diffError,
  commitMessage,
  selectedCommitPaths,
  busy,
  commitUnavailable,
  onCommitMessageChange,
  onUseCurrentTime,
  onToggleCommitPath,
  onToggleAllCommitPaths,
  onCommit,
}: GitChangesViewProps) {
  const { t } = useI18n();
  const openNote = useNotesStore((state) => state.openNote);
  const conflictLabel = t('git.conflicted');
  const controlsDisabled = busy || commitUnavailable || Boolean(diffError) || diffLoading;
  const selectedCount = useMemo(
    () => changes.filter((change) => selectedCommitPaths.has(change.path)).length,
    [changes, selectedCommitPaths],
  );
  const statsByPath = useMemo(() => getGitDiffStatsByPath(diffs), [diffs]);
  const handleOpenFile = useCallback((path: string) => {
    void openNote(path).catch(() => undefined);
  }, [openNote]);
  const hasLoadedDiff = useMemo(() => diffs.some(Boolean), [diffs]);
  const changeRows = useMemo(() => changes.map((change) => {
    const kind = getGitChangeKind(change);
    const canOpenFile = kind !== 'deleted' && !isImageFilename(change.path);
    const selectedForCommit = selectedCommitPaths.has(change.path);
    const stats = statsByPath[change.path];
    const hasStats = Boolean(stats && (stats.additions > 0 || stats.deletions > 0));
    return (
      <div
        key={`${change.previousPath ?? ''}:${change.path}`}
        data-testid="git-change-row"
        data-path={change.path}
        className="flex w-full min-w-0 items-center gap-2 rounded-[var(--vlaina-radius-8px)] px-3 py-2 text-left text-[var(--vlaina-text-secondary)]"
      >
        <Checkbox
          data-testid="git-change-checkbox"
          data-path={change.path}
          checked={selectedForCommit}
          disabled={controlsDisabled}
          onCheckedChange={() => onToggleCommitPath(change.path)}
          aria-label={change.path}
        />
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {canOpenFile ? (
            <button
              type="button"
              data-testid="git-open-file"
              onClick={() => handleOpenFile(change.path)}
              className="min-w-0 truncate text-left font-mono text-[var(--vlaina-font-13)] hover:text-[var(--vlaina-sidebar-row-selected-text)]"
            >
              {change.previousPath ? `${change.previousPath} → ${change.path}` : change.path}
            </button>
          ) : (
            <span
              data-testid="git-change-file-label"
              className="min-w-0 truncate font-mono text-[var(--vlaina-font-13)]"
            >
              {change.previousPath ? `${change.previousPath} → ${change.path}` : change.path}
            </span>
          )}
          {kind === 'conflicted' ? (
            <span className="shrink-0 text-[var(--vlaina-font-11)] font-medium text-[var(--vlaina-color-status-danger-fg)]">
              {conflictLabel}
            </span>
          ) : null}
          {hasStats && stats ? (
            <span className="ml-auto flex shrink-0 items-center gap-2 font-mono text-[var(--vlaina-font-xs)]">
              {stats.additions > 0 ? (
                <span className="text-[var(--vlaina-color-status-success-fg)]">+{stats.additions}</span>
              ) : null}
              {stats.deletions > 0 ? (
                <span className="text-[var(--vlaina-color-status-danger-fg)]">-{stats.deletions}</span>
              ) : null}
            </span>
          ) : null}
        </span>
      </div>
    );
  }), [changes, conflictLabel, controlsDisabled, handleOpenFile, onToggleCommitPath, selectedCommitPaths, statsByPath]);
  if (changes.length === 0) {
    return <div data-testid="git-changes-empty" />;
  }

  const allSelected = changes.length > 0 && selectedCount === changes.length;
  const selectionState = allSelected ? true : selectedCount > 0 ? 'indeterminate' : false;
  const canCommit = selectedCount > 0 && commitMessage.trim().length > 0 && !controlsDisabled;
  const diffLabel = diffError ? t(diffError) : diffLoading ? t('git.loading') : t('git.diffEmpty');

  return (
    <div className="flex flex-col">
      <form
        className="shrink-0 select-none space-y-3 border-b border-[var(--border)] p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (canCommit) onCommit();
        }}
      >
        <label className="block text-[var(--vlaina-font-13)] font-medium text-[var(--vlaina-text-primary)]">
          <span className="mb-1.5 block">{t('git.commitMessage')}</span>
          <SettingsTextarea
            data-testid="git-commit-message"
            data-git-selectable="true"
            value={commitMessage}
            disabled={controlsDisabled}
            onChange={(event) => onCommitMessageChange(event.target.value)}
            placeholder={t('git.commitMessagePlaceholder')}
            rows={2}
            textareaClassName="select-text resize-none"
          />
        </label>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            data-testid="git-use-current-time"
            variant="ghost"
            size="sm"
            className={secondaryPillButtonClass}
            disabled={controlsDisabled}
            onClick={onUseCurrentTime}
          >
            <Icon name="misc.clock" />
            {t('git.currentTime')}
          </Button>
          <Button
            type="submit"
            data-testid="git-commit-button"
            size="sm"
            disabled={!canCommit}
          >
            {t('git.commit')}
          </Button>
        </div>
      </form>

      <div className="shrink-0 select-none border-b border-[var(--border)] p-4">
        <OverlayScrollArea className="max-h-[var(--vlaina-size-180px)]">
          <div className="space-y-1 pr-2">
              <div className="flex items-center gap-2 px-3 py-1.5">
                <Checkbox
                  data-testid="git-select-all"
                  checked={selectionState}
                  disabled={controlsDisabled}
                  onCheckedChange={onToggleAllCommitPaths}
                  aria-label={t('git.selectAll')}
                />
                <button
                  type="button"
                  disabled={controlsDisabled}
                  onClick={onToggleAllCommitPaths}
                  className="text-[var(--vlaina-font-13)] font-medium text-[var(--vlaina-text-secondary)] hover:text-[var(--vlaina-text-primary)]"
                >
                  {t('git.selectAll')}
                </button>
                <span className="ml-auto text-[var(--vlaina-font-11)] text-[var(--vlaina-text-tertiary)]">
                  {t('git.selectedCount', { selected: selectedCount, total: changes.length })}
                </span>
              </div>
              {changeRows}
          </div>
        </OverlayScrollArea>
      </div>

      <div className="flex p-4">
        <GitUnifiedDiff
          diff={diffs}
          loading={diffLoading && !hasLoadedDiff}
          emptyLabel={diffLabel}
          tooLargeLabel={t('git.diffTooLarge')}
          showFileHeaders
          onOpenFile={handleOpenFile}
        />
      </div>
    </div>
  );
});
