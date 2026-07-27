import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SIDEBAR_LABEL_TEXT_METRICS_CLASS } from './sidebarLabelStyles';

interface SidebarRowProps extends HTMLAttributes<HTMLDivElement> {
  indentWidth?: number;
  leading?: ReactNode;
  leadingClassName?: string;
  rowClassName?: string;
  main: ReactNode;
  trailing?: ReactNode;
  actions?: ReactNode;
  isActive?: boolean;
  isHighlighted?: boolean;
  isDragOver?: boolean;
  showActionsByDefault?: boolean;
  showActionsOnFocusWithin?: boolean;
  contentClassName?: string;
  actionFadeClassName?: string;
  activeClassName: string;
  highlightClassName?: string;
  inactiveClassName: string;
  dragOverClassName?: string;
}

interface SidebarRowActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  stopRowActivation?: boolean;
}

export const SidebarRowActionButton = forwardRef<HTMLButtonElement, SidebarRowActionButtonProps>(
  function SidebarRowActionButton({
    stopRowActivation = true,
    type = 'button',
    onPointerDown,
    onPointerUp,
    onClick,
    ...props
  }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        onPointerDown={(event) => {
          if (stopRowActivation) {
            event.stopPropagation();
          }
          onPointerDown?.(event);
        }}
        onPointerUp={(event) => {
          if (stopRowActivation) {
            event.stopPropagation();
          }
          onPointerUp?.(event);
        }}
        onClick={(event) => {
          if (stopRowActivation) {
            event.stopPropagation();
          }
          onClick?.(event);
        }}
        {...props}
      />
    );
  },
);

export function SidebarRow({
  indentWidth = 0,
  leading,
  leadingClassName,
  rowClassName,
  main,
  trailing,
  actions,
  isActive = false,
  isHighlighted = false,
  isDragOver = false,
  showActionsByDefault = false,
  showActionsOnFocusWithin = false,
  className,
  contentClassName,
  actionFadeClassName,
  activeClassName,
  highlightClassName,
  inactiveClassName,
  dragOverClassName,
  children,
  ...props
}: SidebarRowProps) {
  const hasActions = Boolean(actions);
  const showTrailing = Boolean(trailing) && (!hasActions || !showActionsByDefault);
  const rowStyle = indentWidth > 0 ? { paddingLeft: `calc(0.75rem + ${indentWidth}px)` } : undefined;

  return (
    <div
      className={cn(
        'group/sidebar-row flex items-center py-[var(--vlaina-space-1px)]',
        props.onClick && 'cursor-pointer',
        className,
      )}
      {...props}
    >
      <div
        style={rowStyle}
        className={cn(
          'relative flex min-h-[var(--vlaina-size-36px)] flex-1 items-center gap-2 rounded-xl px-3 py-1',
          SIDEBAR_LABEL_TEXT_METRICS_CLASS,
          rowClassName,
          props.onClick && 'cursor-pointer',
          isActive
            ? activeClassName
            : isHighlighted
              ? highlightClassName ?? inactiveClassName
              : inactiveClassName,
          isDragOver && dragOverClassName,
        )}
      >
        {leading ? (
          <span
            className={cn(
              'flex size-[var(--vlaina-size-20px)] shrink-0 items-center justify-center leading-none',
              leadingClassName,
            )}
          >
            {leading}
          </span>
        ) : null}

        <div
          className={cn('relative z-[var(--vlaina-z-10)] flex min-w-0 flex-1 items-center', hasActions && 'pr-8', contentClassName)}
        >
          {main}
        </div>

        {showTrailing ? (
          <div
            className={cn(
              'pointer-events-none absolute right-3 top-1/2 z-[var(--vlaina-z-10)] -translate-y-1/2 transition-opacity duration-[var(--vlaina-duration-150)]',
              hasActions && 'group-hover/sidebar-row:opacity-[var(--vlaina-opacity-0)]',
              hasActions && showActionsOnFocusWithin && 'group-focus-within/sidebar-row:opacity-[var(--vlaina-opacity-0)]',
            )}
          >
            {trailing}
          </div>
        ) : null}

        {hasActions ? (
          <div
            className={cn(
              'absolute right-1 top-1/2 z-[var(--vlaina-z-20)] flex -translate-y-1/2 items-center transition-opacity duration-[var(--vlaina-duration-150)]',
              showActionsByDefault
                ? 'pointer-events-auto opacity-[var(--vlaina-opacity-100)]'
                : cn(
                  'pointer-events-none opacity-[var(--vlaina-opacity-0)] group-hover/sidebar-row:pointer-events-auto group-hover/sidebar-row:opacity-[var(--vlaina-opacity-100)]',
                  showActionsOnFocusWithin && 'group-focus-within/sidebar-row:pointer-events-auto group-focus-within/sidebar-row:opacity-[var(--vlaina-opacity-100)]',
                ),
            )}
          >
            <div
              className={cn(
                'pointer-events-none absolute right-full top-0 h-full w-8 bg-gradient-to-l to-transparent',
                actionFadeClassName,
              )}
            />
            {actions}
          </div>
        ) : null}

        {children}
      </div>
    </div>
  );
}
