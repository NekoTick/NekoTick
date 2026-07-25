import { Button } from '@/components/ui/button';
import { DialogCloseIconButton } from '@/components/common/DialogCloseIconButton';
import { Icon } from '@/components/ui/icons';
import { OverlayScrollArea } from '@/components/ui/overlay-scroll-area';
import { PopoverContent } from '@/components/ui/popover';
import {
  raisedPillSurfaceClass,
  secondaryPillButtonClass,
  raisedPopoverSurfaceClass,
} from '@/components/ui/surfaceStyles';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { themeDomStyleTokens } from '@/styles/themeTokens';
import type { useGitPanelController } from './useGitPanelController';
import { GitChangesView } from './GitChangesView';
import { GitHistoryView } from './GitHistoryView';
import { useGitPopoverResize } from './useGitPopoverResize';

type GitPanelController = ReturnType<typeof useGitPanelController>;

export function GitSyncPopover({
  controller,
  onClose,
}: {
  controller: GitPanelController;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const resize = useGitPopoverResize();
  const status = controller.status;
  const busy = controller.operation !== null;
  const panelUnavailable = !controller.panelReady || Boolean(controller.panelError);
  const remoteConfigured = status?.remoteConfigured ?? Boolean(status?.remoteUrl);
  const remoteSupported = status?.remoteProtocolSupported ?? Boolean(status?.remoteUrl);
  const remoteUnavailable = !remoteConfigured;
  const remoteUnsupported = remoteConfigured && !remoteSupported;
  const hasConflicts = status?.changes.some((change) => change.status === 'conflicted') ?? false;
  const diverged = Boolean(status && status.ahead > 0 && status.behind > 0);
  const unsafeSyncState = Boolean(status?.detached || hasConflicts || diverged);
  const pullUnavailable = panelUnavailable || remoteUnavailable || remoteUnsupported
    || !status?.upstream || unsafeSyncState;
  const pushUnavailable = panelUnavailable || remoteUnavailable || remoteUnsupported || unsafeSyncState;
  const commitUnavailable = panelUnavailable || controller.workingDiffLoading
    || Boolean(controller.workingDiffError || status?.detached || hasConflicts);
  const changeCount = status?.changes.length ?? 0;
  const commitsToPull = status?.behind ?? 0;
  const commitsToPush = status?.ahead ?? 0;
  const pulling = controller.operation === 'pull';
  const pushing = controller.operation === 'push';
  const statusMessage: MessageKey | null = (controller.panelReady ? controller.panelError : null)
    ?? (status?.detached ? 'git.detachedUnavailable' : null)
    ?? (hasConflicts ? 'git.conflicts' : null)
    ?? (diverged ? 'git.diverged' : null)
    ?? (remoteUnsupported ? 'git.unsupportedRemote' : null)
    ?? (status && remoteUnavailable ? 'git.noRemote' : null);

  return (
    <PopoverContent
      ref={resize.popoverRef}
      data-testid="git-sync-popover"
      aria-label={t('git.sync')}
      align="center"
      side="bottom"
      sideOffset={themeDomStyleTokens.editorPopupAnchorOffsetPx}
      className={cn(
        'app-no-drag flex h-[var(--vlaina-height-git-popover)] w-[var(--vlaina-width-git-popover)] flex-col overflow-hidden rounded-[var(--vlaina-notes-ui-radius-panel)] p-0 backdrop-blur-[var(--vlaina-backdrop-blur-lg)] data-[state=open]:duration-[var(--vlaina-duration-100)] data-[state=closed]:duration-[var(--vlaina-duration-75)]',
        resize.isDragging && 'will-change-[height]',
        resize.isDragging && 'backdrop-blur-none',
        raisedPopoverSurfaceClass,
      )}
      style={resize.style}
    >
        <div className="select-none border-b border-[var(--border)] p-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-[var(--vlaina-font-13)] text-[var(--vlaina-text-secondary)]">
            <span data-testid="git-branch" className="max-w-full truncate font-medium">
              {controller.statusLoading && !status
                ? t('git.loading')
                : status?.branch || (status?.detached ? t('git.detachedHead') : '—')}
            </span>
            <Button
              type="button"
              data-testid="git-pull-button"
              variant="ghost"
              size="sm"
              className={cn('ml-auto', secondaryPillButtonClass)}
              disabled={busy || controller.statusLoading || pullUnavailable}
              aria-busy={pulling}
              onClick={controller.pull}
            >
              <Icon name={pulling ? 'common.refresh' : 'common.download'} className={pulling ? 'animate-spin' : undefined} />
              {commitsToPull > 0 ? `${t('git.pull')} (${commitsToPull})` : t('git.pull')}
            </Button>
            <Button
              type="button"
              data-testid="git-push-button"
              variant="ghost"
              size="sm"
              className={commitsToPush > 0
                ? "h-9 rounded-full bg-[var(--primary)] px-4 text-[var(--primary-foreground)] shadow-[var(--vlaina-shadow-md)] transition-[background-color,color,box-shadow,transform] duration-[var(--vlaina-duration-200)] hover:scale-[var(--vlaina-scale-105)] hover:bg-[var(--vlaina-color-accent-hover)] hover:text-[var(--primary-foreground)] active:scale-[var(--vlaina-scale-95)] disabled:bg-[var(--vlaina-bg-secondary)] disabled:text-[var(--vlaina-color-text-disabled)] disabled:shadow-[var(--vlaina-shadow-none)] disabled:hover:scale-[var(--vlaina-scale-100)]"
                : secondaryPillButtonClass}
              disabled={busy || controller.statusLoading || pushUnavailable}
              aria-busy={pushing}
              onClick={controller.push}
            >
              <Icon name={pushing ? 'common.refresh' : 'common.upload'} className={pushing ? 'animate-spin' : undefined} />
              {commitsToPush > 0 ? `${t('git.push')} (${commitsToPush})` : t('git.push')}
            </Button>
            <DialogCloseIconButton
              data-testid="git-close-button"
              onClick={onClose}
              label={t('common.close')}
            />
          </div>

          {statusMessage ? (
            <div className="mt-2 flex items-center gap-2">
              <p className={cn(
                'min-w-0 flex-1 text-[var(--vlaina-font-11)]',
                controller.panelError
                  ? 'text-[var(--vlaina-color-status-danger-fg)]'
                  : 'text-[var(--vlaina-color-status-warning-fg)]',
              )}>
                {t(statusMessage)}
              </p>
              {controller.panelError ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={secondaryPillButtonClass}
                  disabled={controller.statusLoading}
                  onClick={controller.retry}
                >
                  <Icon name="common.refresh" />
                  {t('git.retry')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {controller.panelReady && changeCount > 0 ? (
          <div
            role="tablist"
            className={cn(
              'relative mx-4 my-3 flex h-11 shrink-0 select-none items-center rounded-[var(--vlaina-notes-ui-radius-group)] p-1.5',
              raisedPillSurfaceClass,
            )}
          >
            <span
              data-testid="git-tab-active-background"
              aria-hidden="true"
              className={cn(
                'absolute inset-y-1.5 left-1.5 w-[var(--vlaina-width-git-tab-active)] rounded-full bg-[var(--vlaina-sidebar-row-selected-bg)] shadow-[var(--vlaina-shadow-selection-soft)] transition-transform duration-[var(--vlaina-duration-300)] ease-[var(--vlaina-ease-feedback)] motion-reduce:transition-none',
                controller.activeTab === 'history' && 'translate-x-full',
              )}
            />
            {(['changes', 'history'] as const).map((tab) => {
              const selected = controller.activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  data-testid={tab === 'history' ? 'git-history-tab' : 'git-changes-tab'}
                  aria-selected={selected}
                  onClick={() => controller.setActiveTab(tab)}
                  className={cn(
                    'relative z-[var(--vlaina-z-10)] flex h-8 min-w-0 flex-1 items-center justify-center rounded-full px-3 text-[var(--vlaina-font-13)] font-medium transition-colors duration-[var(--vlaina-duration-300)]',
                    selected
                      ? 'text-[var(--vlaina-sidebar-row-selected-text)]'
                      : 'text-[var(--vlaina-sidebar-notes-text)] hover:text-[var(--vlaina-sidebar-row-selected-text)]',
                  )}
                >
                  {tab === 'changes' ? `${t('git.changes')} (${changeCount})` : t('git.history')}
                </button>
              );
            })}
          </div>
        ) : null}

        {!controller.panelReady ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-[var(--vlaina-font-13)] text-[var(--vlaina-text-tertiary)]">
            <span>{controller.panelError ? t(controller.panelError) : t('git.loading')}</span>
            {controller.panelError ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={secondaryPillButtonClass}
                onClick={controller.retry}
              >
                <Icon name="common.refresh" />
                {t('git.retry')}
              </Button>
            ) : null}
          </div>
        ) : (
          <OverlayScrollArea data-testid="git-popover-scroll" className="min-h-0 flex-1">
          {changeCount > 0 && controller.activeTab === 'changes' ? (
            <GitChangesView
              changes={status?.changes ?? []}
              diffs={controller.workingDiffs}
              diffLoading={controller.workingDiffLoading}
              diffError={controller.workingDiffError}
              commitMessage={controller.commitMessage}
              selectedCommitPaths={controller.selectedCommitPaths}
              busy={busy}
              commitUnavailable={commitUnavailable}
              onCommitMessageChange={controller.setCommitMessage}
              onUseCurrentTime={controller.useCurrentTimeAsMessage}
              onToggleCommitPath={controller.toggleCommitPath}
              onToggleAllCommitPaths={controller.toggleAllCommitPaths}
              onCommit={controller.commit}
            />
          ) : (
            <GitHistoryView
              history={controller.history}
              historyLoading={controller.historyLoading}
              historyError={controller.historyError}
              selectedHash={controller.selectedCommitHash}
              diff={controller.selectedCommitDiff}
              diffLoading={controller.commitDiffLoading}
              onSelectCommit={controller.selectCommit}
            />
          )}
          </OverlayScrollArea>
        )}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-valuemin={resize.minHeight}
          aria-valuemax={resize.maxHeight}
          aria-valuenow={resize.height}
          aria-label={t('git.resizePopover')}
          tabIndex={0}
          ref={resize.handleRef}
          data-testid="git-popover-resize-handle"
          data-no-editor-drag-box="true"
          className={cn(
            'app-no-drag relative z-[var(--vlaina-z-10)] h-[var(--vlaina-size-8px)] shrink-0 cursor-row-resize touch-none select-none',
            'after:absolute after:bottom-1 after:left-1/2 after:h-[var(--vlaina-size-2px)] after:w-[var(--vlaina-size-32px)] after:-translate-x-1/2 after:rounded-full after:bg-[var(--border)]',
            resize.isDragging && 'after:bg-[var(--primary)]',
          )}
          onPointerDown={resize.handlePointerDown}
          onKeyDown={resize.handleKeyDown}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            resize.resetToDefaultSize();
          }}
        />
    </PopoverContent>
  );
}
