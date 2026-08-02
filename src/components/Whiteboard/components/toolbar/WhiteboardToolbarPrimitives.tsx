import type { ReactNode } from 'react';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { Icon, type IconName } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { themeIconTokens } from '@/styles/themeTokens';

export const whiteboardFloatingPanelClassName = cn(
  'pointer-events-auto border border-[var(--vlaina-color-toolbar-border)] shadow-[var(--vlaina-shadow-toolbar)] backdrop-blur-[var(--vlaina-backdrop-blur-sm)]',
  raisedPillSurfaceClass,
);

export function WhiteboardToolbarButton({
  active = false,
  disabled = false,
  icon,
  imageSrc,
  label,
  large = false,
  compact = false,
  dock = false,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  icon: IconName;
  imageSrc?: string;
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
          : imageSrc && !large
          ? 'h-[var(--vlaina-size-100px)] w-[var(--vlaina-size-56px)] rounded-[var(--vlaina-radius-12px)]'
          : large
          ? 'size-[var(--vlaina-size-56px)] rounded-[var(--vlaina-radius-16px)]'
          : 'size-[var(--vlaina-size-36px)] rounded-[var(--vlaina-radius-circle)]',
        active
          ? '-translate-y-[var(--vlaina-size-8px)] border-transparent bg-transparent text-[var(--vlaina-accent)]'
          : cn(
            'hover:bg-[var(--vlaina-color-control-hover-bg)] hover:text-[var(--vlaina-color-control-hover-fg)]',
            !dock && 'active:scale-[var(--vlaina-scale-95)]',
          ),
      )}
    >
      {imageSrc ? (
        <img
          alt=""
          aria-hidden="true"
          draggable={false}
          src={imageSrc}
          className={cn(
            'pointer-events-none w-auto select-none object-contain',
            large ? 'h-[var(--vlaina-size-72px)]' : 'h-[var(--vlaina-size-96px)]',
          )}
        />
      ) : (
        <Icon name={icon} size={large ? themeIconTokens.sizeXl : themeIconTokens.sizeMd} />
      )}
    </button>
  );
  if (!dock) return button;
  return (
    <WhiteboardDockSlot size={imageSrc && !large ? 'instrument' : large ? 'large' : compact ? 'compact' : 'default'}>
      {button}
    </WhiteboardDockSlot>
  );
}

export function WhiteboardDockSlot({ children, size }: {
  children: ReactNode;
  size: 'small' | 'compact' | 'default' | 'instrument' | 'large';
}) {
  return (
    <span
      data-whiteboard-dock-item="true"
      className={cn(
        'whiteboard-dock-slot relative inline-flex shrink-0 items-end justify-center overflow-visible',
        size === 'small' && 'size-[var(--vlaina-size-32px)]',
        size === 'compact' && 'size-[var(--vlaina-size-36px)]',
        size === 'default' && 'size-[var(--vlaina-size-36px)]',
        size === 'instrument' && 'h-[var(--vlaina-size-100px)] w-[var(--vlaina-size-56px)]',
        size === 'large' && 'size-[var(--vlaina-size-56px)]',
      )}
    >
      {children}
    </span>
  );
}

export function WhiteboardToolbarGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex shrink-0 items-center gap-1', className)}>{children}</div>;
}
