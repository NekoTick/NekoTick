import type { ComponentProps, ReactNode } from 'react';
import { Icon } from '@/components/ui/icons';
import { SettingsTextInput } from '@/components/Settings/components/SettingsFields';
import { cn } from '@/lib/utils';
import type { HealthStatus } from '../components/ModelListItem';
import { useI18n } from '@/lib/i18n';
import { getModelPresentationName } from '@/components/Chat/features/Input/modelFamilyRegistry';
import { providerInputClassName, providerInputShellClassName } from './providerInputStyles';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { ModelBenchmarkErrorInfo } from './ModelBenchmarkErrorInfo';

const SLOW_BENCHMARK_LATENCY_MS = 5000;

export const QUICK_ADD_SPLIT_PATTERN = /[,\uFF0C]+/;

export function compareHealthStatus(left?: HealthStatus, right?: HealthStatus) {
  const score = (health?: HealthStatus) => {
    if (!health) return 3;
    if (health.status === 'success') return 0;
    if (health.status === 'loading') return 1;
    return 2;
  };

  const leftScore = score(left);
  const rightScore = score(right);
  if (leftScore !== rightScore) {
    return leftScore - rightScore;
  }

  if (left?.status === 'success' && right?.status === 'success') {
    return (left.latency || Number.MAX_SAFE_INTEGER) - (right.latency || Number.MAX_SAFE_INTEGER);
  }

  return 0;
}

export function parseQuickAddModelIds(value: string) {
  return value
    .split(QUICK_ADD_SPLIT_PATTERN)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function replaceTrailingQuickAddSegment(value: string, nextSegment: string) {
  const parts = value.split(/[,\uFF0C]/);
  if (parts.length <= 1) {
    return nextSegment;
  }

  const prefix = parts
    .slice(0, -1)
    .map((part) => part.trim())
    .filter(Boolean);

  return [...prefix, nextSegment].join(', ');
}

export function ActionButton({
  label,
  icon,
  muted = false,
  compact = false,
  disabled = false,
  busy = false,
  onClick,
}: {
  label: string;
  icon?: ComponentProps<typeof Icon>['name'];
  muted?: boolean;
  compact?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full border border-transparent bg-transparent text-[var(--vlaina-font-xs)] font-semibold transition-colors duration-[var(--vlaina-duration-200)]',
        compact ? 'h-8 px-3' : 'h-9 px-4',
        raisedPillSurfaceClass,
        muted
          ? 'text-[var(--vlaina-sidebar-notes-text-soft)] hover:bg-transparent hover:text-[var(--vlaina-sidebar-row-selected-text)] disabled:cursor-not-allowed disabled:opacity-[var(--vlaina-opacity-50)]'
          : 'text-[var(--vlaina-sidebar-row-selected-text)] hover:bg-transparent hover:text-[var(--vlaina-sidebar-row-selected-text)] disabled:cursor-not-allowed disabled:opacity-[var(--vlaina-opacity-50)]'
      )}
    >
      {busy ? (
        <div className="h-3 w-3 rounded-full border-2 border-[var(--vlaina-border)] border-t-[var(--vlaina-accent)] animate-spin" />
      ) : icon ? (
        <Icon name={icon} size="xs" />
      ) : null}
      <span className="truncate">{label}</span>
    </button>
  );
}

export function SectionHeader({
  label,
  disabled,
  busy,
  onBenchmark,
  actionLabel,
  actionDisabled = false,
  onAction,
}: {
  label: string;
  disabled: boolean;
  busy: boolean;
  onBenchmark: () => void | Promise<void>;
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-1">
      <div className="flex min-w-0 items-center gap-2">
      <div className="min-w-0 truncate text-[var(--vlaina-font-11)] font-bold uppercase tracking-[var(--vlaina-tracking-label-lg)] text-[var(--vlaina-sidebar-notes-text-soft)]">
        {label}
      </div>
      <button
        type="button"
        aria-label={`${t('settings.ai.benchmarkAll')}: ${label}`}
        disabled={disabled && !busy}
        onClick={() => {
          void Promise.resolve(onBenchmark()).catch(() => undefined);
        }}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full text-[var(--vlaina-sidebar-notes-text-soft)] transition-colors hover:bg-transparent hover:text-[var(--vlaina-sidebar-row-selected-text)] disabled:cursor-not-allowed disabled:opacity-[var(--vlaina-opacity-35)]',
          raisedPillSurfaceClass
        )}
      >
        {busy ? (
          <div className="h-3 w-3 rounded-full border-2 border-[var(--vlaina-border)] border-t-[var(--vlaina-accent)] animate-spin" />
        ) : (
          <Icon name="misc.activity" size="xs" />
        )}
      </button>
      </div>
      {actionLabel && onAction ? (
        <button
          type="button"
          disabled={actionDisabled}
          onClick={onAction}
          className="h-6 shrink-0 rounded-full px-2.5 text-[var(--vlaina-font-11)] font-bold text-[var(--vlaina-sidebar-row-selected-text)] transition-colors hover:bg-[var(--vlaina-sidebar-row-selected-bg)] disabled:cursor-not-allowed disabled:opacity-[var(--vlaina-opacity-35)]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function ModelRow({
  model,
  trailing,
  selected = false,
  health,
  onClick,
  decorativeTrailing = false,
}: {
  model: string;
  trailing: ReactNode;
  selected?: boolean;
  health?: HealthStatus;
  onClick?: () => void;
  decorativeTrailing?: boolean;
}) {
  const tone = getHealthTone(health);
  const className = cn(
    'flex min-w-0 items-center gap-3 rounded-[var(--vlaina-ui-radius-group)] border border-transparent px-4 py-3 text-left transition-all duration-[var(--vlaina-duration-200)]',
    selected && tone === 'neutral' && 'bg-[var(--vlaina-bg-secondary)] text-[var(--vlaina-sidebar-notes-text)]',
    selected && tone === 'success' && 'bg-[var(--vlaina-color-status-success-bg)] text-[var(--vlaina-sidebar-notes-text)]',
    selected && tone === 'warning' && 'bg-[var(--vlaina-color-status-warning-bg)] text-[var(--vlaina-sidebar-notes-text)]',
    selected && tone === 'error' && 'bg-[var(--vlaina-color-status-danger-bg)] text-[var(--vlaina-sidebar-notes-text)]',
    selected && tone === 'loading' && 'bg-[var(--vlaina-bg-secondary)] text-[var(--vlaina-sidebar-notes-text)]',
    !selected && tone === 'neutral' && 'bg-[var(--vlaina-color-row-soft)] text-[var(--vlaina-sidebar-notes-text)] hover:bg-[var(--vlaina-hover)]',
    !selected && tone === 'success' && 'bg-[var(--vlaina-color-status-success-bg)] text-[var(--vlaina-sidebar-notes-text)] hover:bg-[var(--vlaina-color-status-success-bg)]',
    !selected && tone === 'warning' && 'bg-[var(--vlaina-color-status-warning-bg)] text-[var(--vlaina-sidebar-notes-text)] hover:bg-[var(--vlaina-color-status-warning-bg)]',
    !selected && tone === 'error' && 'bg-[var(--vlaina-color-status-danger-bg)] text-[var(--vlaina-sidebar-notes-text)] hover:bg-[var(--vlaina-color-status-danger-bg)]',
    !selected && tone === 'loading' && 'bg-[var(--vlaina-color-row-soft)] text-[var(--vlaina-sidebar-notes-text)]',
    onClick && 'cursor-pointer'
  );

  const content = (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[var(--vlaina-font-sm)] font-semibold">
        <span className="min-w-0 truncate">{getModelPresentationName({ name: model, apiModelId: model })}</span>
        {health?.status === 'error' && health.error ? <ModelBenchmarkErrorInfo error={health.error} /> : null}
      </div>
      <div className={cn('shrink-0', decorativeTrailing && 'pointer-events-none')}>{trailing}</div>
    </>
  );

  if (onClick) {
    return (
      <div role="button" tabIndex={0} aria-pressed={selected} onClick={onClick} onKeyDown={(e) => {
        if (e.target !== e.currentTarget) {
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }} className={className}>
        {content}
      </div>
    );
  }

  return <div className={className}>{content}</div>;
}

export function ModelSearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();

  return (
    <SettingsTextInput
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={t('settings.ai.filterModels')}
      aria-label={t('settings.ai.filterModels')}
      leading={<Icon name="common.search" size="sm" className="text-[var(--vlaina-sidebar-notes-text-soft)]" />}
      inputClassName={cn(providerInputClassName, 'pl-11', value && 'pr-20')}
      shellClassName={providerInputShellClassName}
      trailing={value ? (
        <button
          type="button"
          aria-label={t('common.close')}
          onClick={() => onChange('')}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--vlaina-sidebar-notes-text-soft)] transition-colors hover:bg-[var(--vlaina-hover)] hover:text-[var(--vlaina-sidebar-notes-text)]"
        >
          <Icon name="common.close" size="sm" />
        </button>
      ) : null}
    />
  );
}

function getHealthTone(health?: HealthStatus): 'neutral' | 'success' | 'warning' | 'error' | 'loading' {
  if (!health) return 'neutral';
  if (health.status === 'loading') return 'loading';
  if (health.status === 'error') return 'error';
  return typeof health.latency === 'number' && health.latency >= SLOW_BENCHMARK_LATENCY_MS
    ? 'warning'
    : 'success';
}
