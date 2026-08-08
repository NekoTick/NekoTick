import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/icons';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { cn } from '@/lib/utils';
import { themeIconTokens } from '@/styles/themeTokens';

export const whiteboardMainToolbarSurfaceClassName = cn(
  raisedPillSurfaceClass,
  'pointer-events-auto rounded-[var(--vlaina-radius-26px)] transition-shadow duration-[var(--vlaina-duration-300)] ease-out hover:!shadow-[var(--vlaina-shadow-raised-soft)]',
);

export const whiteboardToolPanelSurfaceClassName = [
  'pointer-events-auto rounded-[var(--vlaina-ui-radius-group)]',
  'bg-[var(--vlaina-color-whiteboard-tool-panel)] shadow-[var(--vlaina-shadow-whiteboard-tool-panel)]',
].join(' ');

export const whiteboardFloatingPanelClassName = [
  'pointer-events-auto border border-[var(--vlaina-color-whiteboard-toolbar-border)]',
  'bg-[var(--vlaina-color-whiteboard-toolbar-bg)] shadow-[var(--vlaina-shadow-whiteboard-toolbar)]',
  'backdrop-blur-[var(--vlaina-whiteboard-toolbar-backdrop-blur)] backdrop-saturate-[var(--vlaina-whiteboard-toolbar-backdrop-saturation)]',
  'transition-[background-color,border-color,box-shadow] duration-[var(--vlaina-duration-200)]',
].join(' ');

export function WhiteboardToolbarButton({
  active = false,
  disabled = false,
  icon,
  imageSrc,
  label,
  large = false,
  compact = false,
  dock = false,
  partiallyRevealed = false,
  revealOnHover = false,
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
  partiallyRevealed?: boolean;
  revealOnHover?: boolean;
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
        'relative inline-flex shrink-0 cursor-pointer items-center justify-center border border-transparent text-[var(--vlaina-color-text-secondary)] shadow-none transition-[background-color,border-color,color,transform] duration-[var(--vlaina-duration-200)] hover:shadow-none disabled:cursor-not-allowed disabled:opacity-[var(--vlaina-opacity-35)]',
        compact
          ? 'size-[var(--vlaina-size-28px)] rounded-[var(--vlaina-radius-circle)]'
          : imageSrc && !large
          ? 'h-[var(--vlaina-size-100px)] w-[var(--vlaina-size-56px)] rounded-[var(--vlaina-radius-12px)]'
          : large
          ? 'size-[var(--vlaina-size-56px)] rounded-[var(--vlaina-radius-16px)]'
          : 'size-[var(--vlaina-size-36px)] rounded-[var(--vlaina-radius-circle)]',
        active
          ? cn(
            imageSrc
              ? cn(
                partiallyRevealed
                  ? '-translate-y-[var(--vlaina-size-12px)]'
                  : '-translate-y-[var(--vlaina-size-20px)]',
                'scale-[var(--vlaina-scale-105)]',
              )
              : '-translate-y-[var(--vlaina-size-4px)]',
            'border-transparent bg-transparent text-[var(--vlaina-accent)]',
          )
          : cn(
            'hover:bg-transparent hover:text-[var(--vlaina-color-control-hover-fg)]',
            !dock && 'active:scale-[var(--vlaina-scale-95)]',
        ),
        partiallyRevealed && 'items-end',
        revealOnHover && 'group',
        revealOnHover && !active && 'hover:-translate-y-[var(--vlaina-size-12px)]',
      )}
    >
      {imageSrc && partiallyRevealed ? (
        <span
          aria-hidden="true"
          data-whiteboard-instrument-reveal="true"
          className={cn(
            'pointer-events-none flex w-full shrink-0 items-start justify-center overflow-hidden transition-[height] duration-[var(--vlaina-duration-200)]',
            active
              ? 'h-[var(--vlaina-size-72px)]'
              : cn(
                'h-[var(--vlaina-size-48px)]',
                revealOnHover && 'group-hover:h-[var(--vlaina-size-72px)]',
              ),
          )}
        >
          <img
            alt=""
            draggable={false}
            src={imageSrc}
            className="h-[var(--vlaina-size-96px)] w-auto shrink-0 select-none object-contain filter-none"
          />
        </span>
      ) : imageSrc ? (
        <img
          alt=""
          aria-hidden="true"
          draggable={false}
          src={imageSrc}
          className={cn(
            'pointer-events-none w-auto select-none object-contain filter-none',
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
