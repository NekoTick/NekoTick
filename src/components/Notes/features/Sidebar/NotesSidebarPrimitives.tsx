import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  CollapseTriangleAffordance,
  getSidebarCollapseTriangleColorClassName,
} from '../common/collapseTrianglePrimitive';
import {
  SidebarList,
  SidebarScrollArea,
  SidebarSurface,
} from '@/components/layout/sidebar/SidebarPrimitives';
import { themeIconTokens } from '@/styles/themeTokens';
export {
  NotesSidebarEmptyState,
  NotesSidebarHoverEmptyHint,
  NotesSidebarPillEmptyHint,
} from './NotesSidebarEmptyStates';

interface NotesSidebarSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  isPeeking?: boolean;
}

interface NotesSidebarScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  scrollbarInsetRight?: number;
}

interface NotesSidebarSectionProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  expanded?: boolean;
  onToggle?: () => void;
  actions?: ReactNode;
  contentClassName?: string;
  animated?: boolean;
  nested?: boolean;
  flushHeader?: boolean;
  headerClassName?: string;
}

export function NotesSidebarSurface({
  className,
  isPeeking = false,
  ...props
}: NotesSidebarSurfaceProps) {
  return (
    <SidebarSurface
      className={cn(
        'group/notes-sidebar-surface flex h-full flex-col text-[var(--vlaina-sidebar-notes-text)]',
        isPeeking ? 'bg-transparent' : 'bg-[var(--vlaina-sidebar-notes-surface)]',
        className
      )}
      isPeeking={isPeeking}
      {...props}
    />
  );
}

export const NotesSidebarScrollArea = forwardRef<HTMLDivElement, NotesSidebarScrollAreaProps>(function NotesSidebarScrollArea({
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

export function NotesSidebarList({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <SidebarList className={className} {...props} />;
}

export function NotesSidebarSection({
  title,
  expanded = true,
  onToggle,
  actions,
  children,
  className,
  contentClassName,
  animated = true,
  nested = false,
  flushHeader = false,
  headerClassName,
  ...props
}: NotesSidebarSectionProps) {
  const isInteractive = typeof onToggle === 'function';

  return (
    <div className={cn(nested ? 'mb-1' : 'mb-2', className)} {...props}>
      <div className={cn(
        nested ? 'px-0 pb-0.5' : 'px-1 pb-1'
      )}>
        <div
          onClick={(event) => {
            if (!isInteractive) return;
            const target = event.target as HTMLElement;
            if (target.closest('button')) return;
            onToggle();
          }}
          className={cn(
            'group flex items-center justify-between',
            nested
              ? 'min-h-7 rounded-[var(--vlaina-radius-6px)] px-2'
              : flushHeader
                ? 'min-h-8 rounded-[var(--vlaina-notes-ui-radius-compact)] px-0'
                : 'min-h-8 rounded-[var(--vlaina-notes-ui-radius-compact)] px-2',
            headerClassName,
            isInteractive && 'cursor-pointer'
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="inline-flex max-w-full items-center gap-1 align-middle">
              <span className={cn(
                'min-w-0 truncate font-semibold text-[var(--vlaina-sidebar-notes-section-label)] group-hover:text-[var(--vlaina-sidebar-notes-section-label-hover)]',
                'text-[length:var(--vlaina-notes-ui-font-compact)]',
                nested ? 'tracking-[var(--vlaina-tracking-label-md)]' : 'tracking-[var(--vlaina-tracking-label-sm)]'
              )}>
                {title}
              </span>
              {isInteractive ? (
                <CollapseTriangleAffordance
                  collapsed={!expanded}
                  visibility="hover-unless-collapsed"
                  size={themeIconTokens.sizeXs}
                  className={cn(
                    'h-[var(--vlaina-size-18px)] w-[var(--vlaina-size-18px)] shrink-0',
                    getSidebarCollapseTriangleColorClassName({ groupHover: true }),
                  )}
                />
              ) : null}
            </div>
          </div>
          <div className="ml-2 flex shrink-0 items-center gap-1">
            {actions ? (
              <div
                data-notes-sidebar-section-actions="true"
                className="flex items-center gap-1 opacity-[var(--vlaina-opacity-0)] pointer-events-none transition-opacity group-hover:opacity-[var(--vlaina-opacity-100)] group-hover:pointer-events-auto group-focus-within:opacity-[var(--vlaina-opacity-100)] group-focus-within:pointer-events-auto"
              >
                {actions}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={cn(
          'grid',
          animated && 'transition-[grid-template-rows] duration-[var(--vlaina-duration-200)] ease-out',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className={cn(expanded ? 'overflow-visible' : 'overflow-hidden')}>
          <div className={cn(nested ? 'px-0' : 'px-1', contentClassName)}>{children}</div>
        </div>
      </div>
    </div>
  );
}
