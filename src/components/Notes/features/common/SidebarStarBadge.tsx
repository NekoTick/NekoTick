import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import type { MouseEvent, PointerEvent } from 'react';

interface SidebarStarBadgeProps {
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
}

export function SidebarStarBadge({
  onClick,
  className,
  ariaLabel = 'Remove from Starred',
}: SidebarStarBadgeProps) {
  const stopRowInteraction = (
    event: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onPointerDown={stopRowInteraction}
      onMouseDown={stopRowInteraction}
      onClick={(event) => {
        stopRowInteraction(event);
        onClick?.();
      }}
      className={cn(
        'absolute inset-y-0 right-0 z-[var(--vlaina-z-30)] my-auto flex h-4 w-4 cursor-pointer items-center justify-center text-[var(--vlaina-color-favorite-fg)] opacity-[var(--vlaina-opacity-100)] hover:opacity-[var(--vlaina-opacity-100)] focus-visible:opacity-[var(--vlaina-opacity-100)]',
        className,
      )}
    >
      <Icon name="misc.star" size="sm" className="fill-current" />
    </button>
  );
}
