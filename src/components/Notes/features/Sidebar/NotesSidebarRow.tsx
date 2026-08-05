import type { HTMLAttributes, ReactNode } from 'react';
import { SidebarRow } from '@/components/layout/sidebar/SidebarRow';
import { cn } from '@/lib/utils';
import { getSidebarToneStyles } from '@/components/layout/sidebar/sidebarLabelStyles';

export interface NotesSidebarRowDragHandlers {
  onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  isDragging?: boolean;
}

interface NotesSidebarRowProps extends HTMLAttributes<HTMLDivElement> {
  depth?: number;
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
  contentClassName?: string;
  actionFadeClassName?: string;
  dragHandlers?: NotesSidebarRowDragHandlers;
}

export function NotesSidebarRow({
  depth = 0,
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
  className,
  contentClassName,
  actionFadeClassName,
  dragHandlers,
  children,
  ...props
}: NotesSidebarRowProps) {
  const styles = getSidebarToneStyles('notes');

  return (
    <SidebarRow
      indentWidth={depth * 16}
      leading={leading}
      leadingClassName={leadingClassName}
      rowClassName={cn(
        'min-h-[var(--vlaina-size-36px)] items-center rounded-[var(--vlaina-notes-ui-radius-compact)] text-[length:var(--vlaina-notes-ui-font-compact)] leading-5',
        rowClassName,
      )}
      main={main}
      trailing={trailing}
      actions={actions}
      isActive={isActive}
      isHighlighted={isHighlighted}
      isDragOver={isDragOver}
      showActionsByDefault={showActionsByDefault}
      className={cn(className, dragHandlers?.isDragging && 'opacity-[var(--vlaina-opacity-100)]')}
      contentClassName={contentClassName}
      actionFadeClassName={cn(
        isHighlighted && styles.fadeHover,
        isActive && !isHighlighted && 'from-transparent',
        !isActive && !isHighlighted && 'from-transparent',
        !isActive && !isHighlighted && styles.groupFadeHover,
        actionFadeClassName,
      )}
      activeClassName={styles.activeRow}
      highlightClassName={styles.highlightRow}
      inactiveClassName={styles.inactiveRow}
      dragOverClassName="bg-[var(--vlaina-sidebar-notes-row-drag)]"
      onPointerDown={dragHandlers?.onPointerDown}
      {...props}
    >
      {children}
    </SidebarRow>
  );
}
