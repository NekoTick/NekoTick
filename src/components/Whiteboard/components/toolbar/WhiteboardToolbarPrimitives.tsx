import type { ReactNode } from 'react';
import { chatComposerPillSurfaceClass } from '@/components/Chat/features/Input/composerStyles';
import { Icon, type IconName } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { themeIconTokens } from '@/styles/themeTokens';

export const whiteboardFloatingPanelClassName = cn(
  'pointer-events-auto border border-[var(--vlaina-color-toolbar-border)] shadow-[var(--vlaina-shadow-toolbar)] backdrop-blur-[var(--vlaina-backdrop-blur-sm)]',
  chatComposerPillSurfaceClass,
);

export function WhiteboardToolbarButton({
  active = false,
  disabled = false,
  icon,
  indicatorColor,
  label,
  large = false,
  compact = false,
  dock = false,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  icon: IconName;
  indicatorColor?: string;
  label: string;
  large?: boolean;
  compact?: boolean;
  dock?: boolean;
  onClick: () => void;
}) {
  const button = (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      data-whiteboard-dock-visual={dock || undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center justify-center border border-transparent text-[var(--vlaina-color-text-secondary)] transition-[background-color,border-color,color,transform,box-shadow] duration-[var(--vlaina-duration-150)] disabled:cursor-not-allowed disabled:opacity-[var(--vlaina-opacity-35)]',
        compact
          ? 'size-[var(--vlaina-size-28px)] rounded-[var(--vlaina-radius-circle)]'
          : large
          ? 'size-[var(--vlaina-size-44px)] rounded-[var(--vlaina-radius-12px)]'
          : 'size-[var(--vlaina-size-36px)] rounded-[var(--vlaina-radius-circle)]',
        active
          ? 'border-transparent bg-[var(--vlaina-accent-light)] text-[var(--vlaina-accent)]'
          : cn(
            'hover:bg-[var(--vlaina-color-control-hover-bg)] hover:text-[var(--vlaina-color-control-hover-fg)]',
            !dock && 'active:scale-[var(--vlaina-scale-95)]',
          ),
      )}
    >
      <Icon name={icon} size={large ? themeIconTokens.sizeLg : themeIconTokens.sizeMd} />
      {indicatorColor ? (
        <span aria-hidden="true" className="absolute bottom-1 h-[var(--vlaina-size-2px)] w-5 rounded-[var(--vlaina-radius-pill)]" style={{ backgroundColor: indicatorColor }} />
      ) : null}
    </button>
  );
  if (!dock) return button;
  return (
    <WhiteboardDockSlot size={large ? 'large' : compact ? 'compact' : 'default'}>
      {button}
    </WhiteboardDockSlot>
  );
}

export function WhiteboardDockSlot({ children, size }: {
  children: ReactNode;
  size: 'small' | 'compact' | 'default' | 'large';
}) {
  return (
    <span
      data-whiteboard-dock-item="true"
      className={cn(
        'whiteboard-dock-slot relative inline-flex shrink-0 items-end justify-center overflow-visible',
        size === 'small' && 'size-[var(--vlaina-size-24px)]',
        size === 'compact' && 'size-[var(--vlaina-size-28px)]',
        size === 'default' && 'size-[var(--vlaina-size-36px)]',
        size === 'large' && 'size-[var(--vlaina-size-44px)]',
      )}
    >
      {children}
    </span>
  );
}

export function WhiteboardToolbarGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex shrink-0 items-center gap-1', className)}>{children}</div>;
}
