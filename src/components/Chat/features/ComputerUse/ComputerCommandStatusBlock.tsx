import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import type { ComputerCommandPhase, ComputerCommandStatus } from '@/lib/ai/computerUse/types';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { themeIconTokens } from '@/styles/themeTokens';
import { ComputerCommandChanges } from './ComputerCommandChanges';

interface ComputerCommandStatusBlockProps {
  isLoading: boolean;
  statuses: ComputerCommandStatus[];
}

const PHASE_KEYS: Record<ComputerCommandPhase, MessageKey> = {
  awaiting_approval: 'chat.computerUse.awaitingApproval',
  running: 'chat.computerUse.running',
  completed: 'chat.computerUse.completed',
  failed: 'chat.computerUse.failed',
  denied: 'chat.computerUse.denied',
  cancelled: 'chat.computerUse.cancelled',
  timed_out: 'chat.computerUse.timedOut',
  interrupted: 'chat.computerUse.interrupted',
};

function phaseColor(phase: ComputerCommandPhase): string {
  if (phase === 'completed') return 'text-[var(--vlaina-color-status-success-fg)]';
  if (phase === 'awaiting_approval' || phase === 'running') return 'text-[var(--vlaina-accent)]';
  if (phase === 'denied' || phase === 'cancelled' || phase === 'interrupted') {
    return 'text-[var(--vlaina-text-tertiary)]';
  }
  return 'text-[var(--vlaina-color-danger)]';
}

function formatDuration(durationMs: number | undefined): string {
  if (typeof durationMs !== 'number') return '';
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
}

function CommandOutput({ status }: { status: ComputerCommandStatus }) {
  const { t } = useI18n();
  if (!status.stdout && !status.stderr) return null;
  const active = status.phase === 'awaiting_approval' || status.phase === 'running';
  return (
    <details className="mt-2" open={active || status.phase === 'failed' || status.phase === 'timed_out'}>
      <summary className="cursor-pointer select-none text-[var(--vlaina-font-xs)] font-medium text-[var(--vlaina-text-secondary)]">
        {t('chat.computerUse.output')}
        {status.truncated ? ` · ${t('chat.computerUse.outputTruncated')}` : ''}
      </summary>
      <div className="mt-2 max-h-[var(--vlaina-size-320px)] overflow-auto rounded-[var(--vlaina-radius-12px)] bg-[var(--vlaina-code-block-background)] p-[var(--vlaina-space-12px)] font-mono text-[var(--vlaina-font-xs)] leading-5 text-[var(--vlaina-code-syntax-foreground)]">
        {status.stdout ? (
          <div>
            <div className="mb-1 font-sans font-medium text-[var(--vlaina-code-syntax-muted)]">
              {t('chat.computerUse.stdout')}
            </div>
            <pre className="whitespace-pre-wrap break-words">{status.stdout}</pre>
          </div>
        ) : null}
        {status.stderr ? (
          <div className={status.stdout ? 'mt-3' : undefined}>
            <div className="mb-1 font-sans font-medium text-[var(--vlaina-color-danger)]">
              {t('chat.computerUse.stderr')}
            </div>
            <pre className="whitespace-pre-wrap break-words">{status.stderr}</pre>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function CommandStatusItem({
  showCompletedPhase,
  status,
}: {
  showCompletedPhase: boolean;
  status: ComputerCommandStatus;
}) {
  const { t } = useI18n();
  const active = status.phase === 'awaiting_approval' || status.phase === 'running';
  const duration = status.phase === 'completed' ? '' : formatDuration(status.durationMs);
  const showPhase = status.phase !== 'completed' || showCompletedPhase;
  return (
    <div className="rounded-[var(--vlaina-radius-16px)] bg-[var(--vlaina-color-overlay-weak)] p-[var(--vlaina-space-12px)]">
      {showPhase ? (
        <div
          data-chat-selection-excluded="true"
          className="flex min-w-0 select-none items-center gap-2"
        >
          <span className={cn('relative flex size-5 shrink-0 items-center justify-center', phaseColor(status.phase))}>
            {active ? (
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full border border-transparent border-t-current animate-spin"
              />
            ) : null}
            <Icon name="editor.keyboard" size={themeIconTokens.sizeSm} />
          </span>
          <span className={cn('font-medium', phaseColor(status.phase))}>{t(PHASE_KEYS[status.phase])}</span>
          {duration ? <span className="text-[var(--vlaina-text-tertiary)]">{duration}</span> : null}
          {status.phase !== 'completed' && status.exitCode !== undefined ? (
            <span className="text-[var(--vlaina-text-tertiary)]">
              {t('chat.computerUse.exitCode')}: {status.exitCode ?? '—'}
            </span>
          ) : null}
        </div>
      ) : null}
      {status.purpose ? (
        <div className={cn(showPhase && 'mt-2', 'text-[var(--vlaina-text-secondary)]')}>
          {t('chat.computerUse.purpose')}: {status.purpose}
        </div>
      ) : null}
      <pre className={cn(
        (showPhase || status.purpose) && 'mt-2',
        'overflow-auto whitespace-pre-wrap break-words rounded-[var(--vlaina-radius-12px)] bg-[var(--vlaina-code-block-background)] p-[var(--vlaina-space-12px)] font-mono text-[var(--vlaina-font-xs)] leading-5 text-[var(--vlaina-code-syntax-foreground)]',
      )}>
        {status.command}
      </pre>
      {status.cwd ? (
        <div className="mt-2 break-all text-[var(--vlaina-font-xs)] text-[var(--vlaina-text-tertiary)]">
          {t('chat.computerUse.workingDirectory')}: {status.cwd}
        </div>
      ) : null}
      <CommandOutput status={status} />
      <ComputerCommandChanges
        changes={status.fileChanges || []}
        truncated={status.fileChangesTruncated}
      />
    </div>
  );
}

export function ComputerCommandStatusBlock({ isLoading, statuses }: ComputerCommandStatusBlockProps) {
  const { t } = useI18n();
  const successfulCompletionKey = !isLoading
    && statuses.length > 0
    && statuses.every((status) => status.phase === 'completed')
    ? JSON.stringify(statuses.map((status) => status.id))
    : null;
  const [isCollapsed, setIsCollapsed] = useState(successfulCompletionKey !== null);
  const autoCollapsedCompletionKeyRef = useRef(successfulCompletionKey);
  const contentId = useId();

  useEffect(() => {
    if (successfulCompletionKey === null) {
      autoCollapsedCompletionKeyRef.current = null;
      return;
    }
    if (autoCollapsedCompletionKeyRef.current === successfulCompletionKey) {
      return;
    }
    autoCollapsedCompletionKeyRef.current = successfulCompletionKey;
    setIsCollapsed(true);
  }, [successfulCompletionKey]);

  if (statuses.length === 0) return null;
  const firstCompletedIndex = statuses.findIndex((status) => status.phase === 'completed');
  return (
    <div className={cn(
      'mb-3 max-w-full rounded-[var(--vlaina-ui-radius-group)] p-[var(--vlaina-space-8px)] text-[var(--vlaina-font-xs)]',
      raisedPillSurfaceClass,
    )}>
      <button
        type="button"
        aria-controls={contentId}
        aria-expanded={!isCollapsed}
        data-chat-selection-excluded="true"
        data-no-focus-input="true"
        className={cn(
          'flex w-full cursor-pointer select-none items-center justify-between border-0 bg-transparent px-[var(--vlaina-space-4px)] text-left font-medium text-[var(--vlaina-text-primary)]',
          !isCollapsed && 'pb-[var(--vlaina-space-8px)]',
        )}
        onClick={() => setIsCollapsed((collapsed) => !collapsed)}
      >
        <span>{t('chat.computerUse')}</span>
        <Icon name={isCollapsed ? 'nav.chevronDown' : 'nav.chevronUp'} size="sm" />
      </button>
      {!isCollapsed ? (
        <div id={contentId} className="space-y-2">
          {statuses.map((status, index) => (
            <CommandStatusItem
              key={`${status.id}-${index}`}
              status={status}
              showCompletedPhase={index === firstCompletedIndex}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
