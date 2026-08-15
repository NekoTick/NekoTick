import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { getSidebarToneStyles } from '@/components/layout/sidebar/sidebarLabelStyles';
import {
  SidebarList,
  SidebarScrollArea,
  SidebarSurface,
} from '@/components/layout/sidebar/SidebarPrimitives';
import { SidebarRow } from '@/components/layout/sidebar/SidebarRow';

interface ChatSidebarSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  isPeeking?: boolean;
}

interface ChatSidebarScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  scrollbarInsetRight?: number;
}

interface ChatSidebarRowProps extends HTMLAttributes<HTMLDivElement> {
  main: ReactNode;
  trailing?: ReactNode;
  actions?: ReactNode;
  isActive?: boolean;
  isHighlighted?: boolean;
  showActionsByDefault?: boolean;
}

export const ChatSidebarSurface = forwardRef<HTMLDivElement, ChatSidebarSurfaceProps>(function ChatSidebarSurface({
  className,
  isPeeking = false,
  ...props
}, ref) {
  return (
    <SidebarSurface
      ref={ref}
      className={cn(
        'group/chat-sidebar-surface flex h-full flex-col text-[var(--vlaina-sidebar-chat-text)]',
        isPeeking ? 'bg-transparent' : 'bg-[var(--vlaina-sidebar-chat-surface)]',
        className
      )}
      isPeeking={isPeeking}
      {...props}
    />
  );
});

export const ChatSidebarScrollArea = forwardRef<HTMLDivElement, ChatSidebarScrollAreaProps>(function ChatSidebarScrollArea({
  onMouseEnter,
  className,
  scrollbarInsetRight,
  ...props
}, ref) {
  return (
    <SidebarScrollArea
      ref={ref}
      onMouseEnter={onMouseEnter}
      scrollbarInsetRight={scrollbarInsetRight}
      viewportClassName={className}
      {...props}
    />
  );
});

export function ChatSidebarList({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <SidebarList className={className} {...props} />;
}

export function ChatSidebarRow({
  main,
  trailing,
  actions,
  isActive = false,
  isHighlighted = false,
  showActionsByDefault = false,
  className,
  children,
  ...props
}: ChatSidebarRowProps) {
  const styles = getSidebarToneStyles('chat');

  return (
    <SidebarRow
      main={main}
      trailing={trailing}
      actions={actions}
      isActive={isActive}
      isHighlighted={isHighlighted}
      showActionsByDefault={showActionsByDefault}
      showActionsOnFocusWithin
      className={className}
      activeClassName={styles.activeRow}
      highlightClassName={styles.highlightRow}
      inactiveClassName={styles.inactiveRow}
      actionFadeClassName={cn(
        isActive && 'from-transparent',
        !isActive && 'from-transparent',
        !isActive && styles.groupFadeHover
      )}
      {...props}
    >
      {children}
    </SidebarRow>
  );
}

interface ChatSidebarHoverEmptyHintProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
}

export function ChatSidebarHoverEmptyHint({
  title,
  className,
  ...props
}: ChatSidebarHoverEmptyHintProps) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 flex items-center justify-center opacity-[var(--vlaina-opacity-0)] transition-opacity duration-[var(--vlaina-duration-150)] group-hover/chat-sidebar-surface:opacity-[var(--vlaina-opacity-100)]',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'whitespace-nowrap rounded-full px-4 py-2 text-center text-[var(--vlaina-font-15)] text-[var(--vlaina-sidebar-chat-text-soft)]',
          raisedPillSurfaceClass,
        )}
      >
        {title}
      </span>
    </div>
  );
}
