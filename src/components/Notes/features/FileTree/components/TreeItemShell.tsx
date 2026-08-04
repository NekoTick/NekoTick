import { useRef, type ReactNode } from 'react';
import type React from 'react';
import { Icon } from '@/components/ui/icons';
import { cn, iconButtonStyles } from '@/lib/utils';
import { SidebarRowActionButton } from '@/components/layout/sidebar/SidebarRow';
import { NotesSidebarRow, type NotesSidebarRowDragHandlers } from '../../Sidebar/NotesSidebarRow';
import {
  clearHoveredSidebarRenamePath,
  setHoveredSidebarRenamePath,
} from '../../common/sidebarHoverRename';

interface TreeItemShellProps {
  itemPath: string;
  itemKind: 'file' | 'folder' | 'image';
  parentFolderPath?: string;
  depth: number;
  leading: ReactNode;
  main: ReactNode;
  children?: ReactNode;
  actionFadeClassName?: string;
  contentClassName?: string;
  isActive?: boolean;
  isHighlighted?: boolean;
  isDragOver?: boolean;
  isTreeDragOver?: boolean;
  showActionsByDefault?: boolean;
  showMenuButton?: boolean;
  dragHandlers?: NotesSidebarRowDragHandlers;
  menuButtonLabel: string;
  onMouseEnter?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onMenuClick: (event: React.MouseEvent<HTMLButtonElement>, rect: DOMRect) => void;
}

export function TreeItemShell({
  itemPath,
  itemKind,
  parentFolderPath,
  depth,
  leading,
  main,
  children,
  actionFadeClassName,
  contentClassName,
  isActive = false,
  isHighlighted = false,
  isDragOver = false,
  isTreeDragOver = false,
  showActionsByDefault = false,
  showMenuButton = true,
  dragHandlers,
  menuButtonLabel,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onDoubleClick,
  onContextMenu,
  onMenuClick,
}: TreeItemShellProps) {
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      className={cn(
        'relative',
        isTreeDragOver &&
          'rounded-[var(--vlaina-notes-ui-radius-compact)] bg-[var(--vlaina-sidebar-notes-row-drag)]',
      )}
      data-file-tree-path={itemPath}
      data-file-tree-kind={itemKind}
      data-file-tree-parent-folder-path={parentFolderPath}
    >
      <NotesSidebarRow
        depth={depth}
        actionFadeClassName={actionFadeClassName}
        onMouseEnter={(event) => {
          setHoveredSidebarRenamePath(itemPath);
          onMouseEnter?.(event);
        }}
        onMouseLeave={(event) => {
          clearHoveredSidebarRenamePath(itemPath);
          onMouseLeave?.(event);
        }}
        leading={leading}
        main={main}
        contentClassName={contentClassName}
        isActive={isActive}
        isHighlighted={isHighlighted}
        isDragOver={isDragOver}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        dragHandlers={dragHandlers}
        showActionsByDefault={showActionsByDefault}
        actions={showMenuButton ? (
          <SidebarRowActionButton
            ref={menuButtonRef}
            aria-label={menuButtonLabel}
            onClick={(event) => {
              const rowElement = event.currentTarget.closest('[data-file-tree-path]');
              if (!rowElement) {
                return;
              }

              onMenuClick(event, rowElement.getBoundingClientRect());
            }}
            className={cn(
              'rounded-md p-1 focus:outline-none',
              iconButtonStyles,
              'text-[var(--vlaina-sidebar-notes-text)] hover:text-[var(--vlaina-sidebar-row-selected-text)]',
            )}
          >
            <Icon name="common.more" size="md" />
          </SidebarRowActionButton>
        ) : null}
      />

      {children}
    </div>
  );
}
