import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { Icon } from '@/components/ui/icons';
import { OverlayScrollArea } from '@/components/ui/overlay-scroll-area';
import { cn } from '@/lib/utils';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import {
  preventImageClipboardTextPaste,
  preventImageDataTransferTextDrop,
} from '@/lib/clipboardImagePayload';
import {
  getSidebarActionButtonClass,
  type SidebarTone,
} from '@/components/layout/sidebar/sidebarLabelStyles';

interface SidebarSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  isPeeking?: boolean;
}

interface SidebarScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  viewportClassName?: string;
  scrollbarInsetRight?: number;
}

type SidebarCapsulePanelProps = HTMLAttributes<HTMLDivElement>;

interface SidebarActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  label: ReactNode;
  iconClassName?: string;
  tone?: SidebarTone;
}

interface SidebarSearchFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  onClose: () => void;
  closeLabel: string;
  containerClassName?: string;
  inputClassName?: string;
  closeButtonClassName?: string;
}

export const SIDEBAR_CAPSULE_SCROLLBAR_INSET_RIGHT = 0;

export function SidebarCapsulePanel({
  className,
  ...props
}: SidebarCapsulePanelProps) {
  return (
    <div
      data-sidebar-capsule-panel="true"
      className={cn(
        'm-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--vlaina-ui-radius-panel)] border border-transparent bg-[var(--vlaina-color-sidebar-card-surface)] p-1 shadow-[var(--vlaina-shadow-raised-soft)]',
        className,
      )}
      {...props}
    />
  );
}

export const SidebarSurface = forwardRef<HTMLDivElement, SidebarSurfaceProps>(
  function SidebarSurface({ className, isPeeking = false, ...props }, ref) {
    return (
      <div
        ref={ref}
        data-sidebar-surface="true"
        className={cn('flex h-full min-h-0 min-w-0 flex-col', isPeeking && 'opacity-[var(--vlaina-opacity-95)]', className)}
        {...props}
      />
    );
  },
);

export const SidebarScrollArea = forwardRef<HTMLDivElement, SidebarScrollAreaProps>(
  function SidebarScrollArea({ onMouseEnter, className, viewportClassName, scrollbarInsetRight, ...props }, ref) {
    return (
      <OverlayScrollArea
        ref={ref}
        scrollbarVariant="compact"
        scrollbarInsetRight={scrollbarInsetRight}
        data-sidebar-scroll-root="true"
        viewportClassName={cn('px-2 py-2', viewportClassName, className)}
        onMouseEnter={onMouseEnter}
        {...props}
      />
    );
  },
);

export function SidebarList({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-0.5', className)} {...props} />;
}

export function SidebarActionGroup({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-2 pt-1 pb-0.5 space-y-1', className)} {...props} />;
}

export const SidebarActionButton = forwardRef<HTMLButtonElement, SidebarActionButtonProps>(
  function SidebarActionButton(
    { icon, label, className, iconClassName, tone, type = 'button', ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'flex h-[var(--vlaina-size-36px)] w-full cursor-pointer items-center gap-2 rounded-xl bg-transparent px-3 py-1 text-[var(--vlaina-font-base)] leading-none shadow-[var(--vlaina-shadow-none)] hover:shadow-[var(--vlaina-shadow-none)]',
          tone ? getSidebarActionButtonClass(tone) : undefined,
          className,
        )}
        {...props}
      >
        {icon ? (
          <span
            className={cn(
              'flex size-[var(--vlaina-size-20px)] shrink-0 items-center justify-center leading-none',
              iconClassName,
            )}
          >
            {icon}
          </span>
        ) : null}
        <span className="inline-flex min-w-0 items-center truncate leading-none">{label}</span>
      </button>
    );
  },
);

const SIDEBAR_SEARCH_ICON_SIZE = 18;

export const SidebarSearchField = forwardRef<HTMLInputElement, SidebarSearchFieldProps>(
  function SidebarSearchField(
    {
      onClose,
      closeLabel,
      disabled,
      containerClassName,
      inputClassName,
      closeButtonClassName,
      className,
      onDrop,
      onPaste,
      ...props
    },
    ref,
  ) {
    return (
      <div className={cn('px-2 pt-2', className)}>
        <div
          className={cn(
            'flex h-[var(--vlaina-size-44px)] items-center gap-2 rounded-full pl-3 pr-1',
            raisedPillSurfaceClass,
            containerClassName,
          )}
        >
          <Icon
            name="common.search"
            size={SIDEBAR_SEARCH_ICON_SIZE}
            className="text-[var(--vlaina-color-text-soft)]"
          />
          <input
            ref={ref}
            disabled={disabled}
            spellCheck={false}
            className={cn(
              'h-[var(--vlaina-size-44px)] min-w-0 flex-1 bg-transparent py-0 text-[var(--vlaina-font-base)] leading-5 text-[var(--vlaina-color-text-soft)] outline-none placeholder:text-[var(--vlaina-color-text-soft)]',
              inputClassName,
            )}
            onPaste={(event) => {
              if (!preventImageClipboardTextPaste(event)) {
                onPaste?.(event);
              }
            }}
            onDrop={(event) => {
              if (!preventImageDataTransferTextDrop(event)) {
                onDrop?.(event);
              }
            }}
            {...props}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={onClose}
            aria-label={closeLabel}
            className={cn(
              'inline-flex size-[var(--vlaina-size-44px)] shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--vlaina-color-text-soft)] transition-colors hover:bg-transparent hover:text-[var(--vlaina-sidebar-row-selected-text)]',
              closeButtonClassName,
            )}
          >
            <Icon name="common.close" size="sm" />
          </button>
        </div>
      </div>
    );
  },
);
