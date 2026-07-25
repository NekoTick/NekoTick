import { memo, useCallback } from 'react';
import { OverlayScrollArea } from '@/components/ui/overlay-scroll-area';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useNotesStore } from '@/stores/useNotesStore';
import type { GitHistoryItem } from './gitUiTypes';
import { GitUnifiedDiff } from './GitUnifiedDiff';

interface GitHistoryViewProps {
  history: GitHistoryItem[];
  historyLoading: boolean;
  historyError: MessageKey | null;
  selectedHash: string | null;
  diff: string;
  diffLoading: boolean;
  onSelectCommit: (commit: GitHistoryItem) => void;
}

export const GitHistoryView = memo(function GitHistoryView({
  history,
  historyLoading,
  historyError,
  selectedHash,
  diff,
  diffLoading,
  onSelectCommit,
}: GitHistoryViewProps) {
  const { t } = useI18n();
  const openNote = useNotesStore((state) => state.openNote);
  const handleOpenFile = useCallback((path: string) => {
    void openNote(path).catch(() => undefined);
  }, [openNote]);
  const diffLabel = diffLoading
    ? t('git.loading')
    : t('git.diffEmpty');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="select-none border-b border-[var(--border)] p-4">
        {historyLoading ? (
          <p className="text-[var(--vlaina-font-13)] text-[var(--vlaina-text-tertiary)]">
            {t('git.loading')}
          </p>
        ) : historyError ? (
          <p className="text-[var(--vlaina-font-13)] text-[var(--vlaina-color-status-danger-fg)]">
            {t(historyError)}
          </p>
        ) : history.length === 0 ? (
          <p className="text-[var(--vlaina-font-13)] text-[var(--vlaina-text-tertiary)]">
            {t('git.noHistory')}
          </p>
        ) : (
          <OverlayScrollArea
            data-testid="git-history-list-scroll"
            className={history.length > 6
              ? 'h-[var(--vlaina-size-240px)]'
              : 'max-h-[var(--vlaina-size-240px)]'}
          >
            <div className="space-y-1 pr-2">
              {history.slice(0, 30).map((commit) => (
                <button
                  key={commit.hash}
                  type="button"
                  data-testid="git-history-row"
                  data-hash={commit.hash}
                  onClick={() => onSelectCommit(commit)}
                  className={cn(
                    'block w-full min-w-0 rounded-[var(--vlaina-radius-8px)] px-3 py-2 text-left transition-colors',
                    selectedHash === commit.hash
                      ? 'bg-[var(--vlaina-sidebar-row-selected-bg)] text-[var(--vlaina-sidebar-row-selected-text)] shadow-[var(--vlaina-shadow-selection-soft)]'
                      : 'text-[var(--vlaina-sidebar-notes-text)] hover:bg-transparent hover:text-[var(--vlaina-sidebar-row-selected-text)]',
                  )}
                >
                  <span className="block truncate text-[var(--vlaina-font-13)] font-medium text-current">
                    {commit.subject}
                  </span>
                </button>
              ))}
            </div>
          </OverlayScrollArea>
        )}
      </div>

      <div data-testid="git-history-diff" className="flex p-4">
        <GitUnifiedDiff
          diff={diff}
          loading={diffLoading && !diff}
          emptyLabel={diff ? t('git.diffEmpty') : diffLabel}
          tooLargeLabel={t('git.diffTooLarge')}
          showFileHeaders
          onOpenFile={handleOpenFile}
        />
      </div>
    </div>
  );
});
