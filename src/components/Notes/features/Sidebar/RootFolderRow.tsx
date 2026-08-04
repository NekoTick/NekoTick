import { SidebarInlineRenameInput } from '@/components/layout/sidebar/SidebarInlineRenameInput';
import { SidebarRowActionButton } from '@/components/layout/sidebar/SidebarRow';
import {
  getSidebarLabelClass,
  getSidebarTextClass,
  SIDEBAR_LABEL_TEXT_METRICS_CLASS,
} from '@/components/layout/sidebar/sidebarLabelStyles';
import { Icon } from '@/components/ui/icons';
import { cn, iconButtonStyles } from '@/lib/utils';
import { type FolderNode } from '@/stores/useNotesStore';
import { themeIconTokens } from '@/styles/themeTokens';
import { type RefObject } from 'react';
import { FileTreeItem } from '../FileTree';
import { VirtualizedFileTree } from '../FileTree/VirtualizedFileTree';
import {
  CollapseTriangleAffordance,
  getSidebarCollapseTriangleColorClassName,
} from '../common/collapseTrianglePrimitive';
import { NotesSidebarList } from './NotesSidebarPrimitives';
import { NotesSidebarRow } from './NotesSidebarRow';
import { RootFolderMenu } from './RootFolderMenu';
import { useRootFolderRowController } from './useRootFolderRowController';

interface RootFolderRowProps {
  rootFolder: FolderNode | null;
  isLoading: boolean;
  onCreateNote: () => Promise<unknown>;
  onCreateFolder: () => Promise<string | null>;
  blankContextMenuRef?: RefObject<HTMLElement | null>;
  scrollRootRef?: RefObject<HTMLElement | null>;
  active?: boolean;
}

export function RootFolderRow({
  rootFolder,
  isLoading,
  onCreateNote,
  onCreateFolder,
  blankContextMenuRef,
  scrollRootRef,
  active = true,
}: RootFolderRowProps) {
  const {
    displayExpanded,
    expanded,
    fileTreeSortMode,
    handleClick,
    handleContextMenu,
    handleMenuOpen,
    handleRenameFromDoubleClick,
    handleRenameSubmit,
    hasChildren,
    isExpandedRootDragOver,
    isRenaming,
    isRootBusy,
    isRootDragOver,
    isRootTreePending,
    menuButtonRef,
    menuPosition,
    notesRootPath,
    openRootFolderMenuLabel,
    renameValue,
    rootRowRef,
    setExpanded,
    setFileTreeSortMode,
    setIsRenaming,
    setRenameValue,
    setShowMenu,
    setHoveredSidebarRenamePath,
    clearHoveredSidebarRenamePath,
    shouldRenderChildren,
    showMenu,
    title,
    useVirtualFileTree,
  } = useRootFolderRowController({
    rootFolder,
    isLoading,
    blankContextMenuRef,
    scrollRootRef,
    active,
  });

  if (!rootFolder && isRootTreePending) {
    return (
      <div
        ref={rootRowRef}
        className="py-1 pointer-events-none"
        aria-busy={isRootBusy || undefined}
        data-notes-sidebar-root-loading-shell="true"
      >
        <NotesSidebarRow
          data-file-tree-root-drop-target="true"
          leading={
            <span className="relative flex size-[var(--vlaina-size-20px)] items-center justify-center">
              <Icon
                name="file.folderOpen"
                size={themeIconTokens.sizeRow}
                className="text-[var(--vlaina-sidebar-notes-folder-icon)]"
              />
            </span>
          }
          main={
            <span className={cn('block whitespace-normal break-all', getSidebarTextClass('notes'))}>
              {title}
            </span>
          }
        />
      </div>
    );
  }

  if (!rootFolder) {
    return null;
  }

  return (
    <div
      ref={rootRowRef}
      className={cn(
        'py-1',
        isRootBusy && 'pointer-events-none',
        isExpandedRootDragOver &&
        'rounded-[var(--vlaina-notes-ui-radius-compact)] bg-[var(--vlaina-sidebar-notes-row-drag)]',
      )}
      aria-busy={isRootBusy || undefined}
      data-file-tree-root-drop-target="true"
      data-file-tree-primary="true"
    >
      <NotesSidebarRow
        data-file-tree-root-drop-target="true"
        onMouseEnter={() => setHoveredSidebarRenamePath(rootFolder.path)}
        onMouseLeave={() => clearHoveredSidebarRenamePath(rootFolder.path)}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleRenameFromDoubleClick}
        leading={
          <span className="relative flex size-[var(--vlaina-size-20px)] items-center justify-center">
            <span
              className={cn(
                'transition-none',
                hasChildren && 'group-hover/sidebar-row:opacity-[var(--vlaina-opacity-0)] group-focus-within/sidebar-row:opacity-[var(--vlaina-opacity-0)]',
              )}
            >
              <Icon
                name={displayExpanded ? 'file.folderOpen' : 'file.folder'}
                size={themeIconTokens.sizeRow}
                className="text-[var(--vlaina-sidebar-notes-folder-icon)]"
              />
            </span>
            {hasChildren ? (
              <CollapseTriangleAffordance
                collapsed={!expanded}
                visibility="always"
                size={themeIconTokens.sizeSm}
                className={cn(
                  'absolute inset-0 opacity-[var(--vlaina-opacity-0)] transition-none group-hover/sidebar-row:opacity-[var(--vlaina-opacity-100)] group-focus-within/sidebar-row:opacity-[var(--vlaina-opacity-100)]',
                  getSidebarCollapseTriangleColorClassName({ rowHover: true }),
                )}
              />
            ) : null}
          </span>
        }
        onClick={hasChildren ? handleClick : undefined}
        isHighlighted={showMenu}
        isDragOver={!isExpandedRootDragOver && isRootDragOver}
        showActionsByDefault={showMenu}
        data-notes-root-folder-row="true"
        main={
          isRenaming ? (
            <SidebarInlineRenameInput
              value={renameValue}
              onValueChange={setRenameValue}
              onSubmit={handleRenameSubmit}
              onCancel={() => setIsRenaming(false)}
              className={cn(
                'w-full min-w-0 border-none bg-transparent p-0 outline-none',
                SIDEBAR_LABEL_TEXT_METRICS_CLASS,
                getSidebarLabelClass('notes', { selected: showMenu })
              )}
            />
          ) : (
            <span className={cn('block whitespace-normal break-all', getSidebarLabelClass('notes', { selected: showMenu }))}>
              {title}
            </span>
          )
        }
        actions={
          <SidebarRowActionButton
            ref={menuButtonRef}
            aria-label={openRootFolderMenuLabel}
            onClick={(event) => {
              handleMenuOpen(event);
            }}
            className={cn(
              'rounded-md p-1 focus:outline-none',
              iconButtonStyles,
              'text-[var(--vlaina-sidebar-notes-text)] hover:text-[var(--vlaina-sidebar-row-selected-text)]',
            )}
          >
            <Icon name="common.more" size="md" />
          </SidebarRowActionButton>
        }
      />

      <RootFolderMenu
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        position={menuPosition}
        expanded={expanded}
        setExpanded={(value) => {
          if (!hasChildren) {
            return;
          }

          const nextExpanded = typeof value === 'function' ? value(expanded) : value;
          if (nextExpanded !== expanded) {
            setExpanded(value);
          }
        }}
        onCreateNote={onCreateNote}
        onCreateFolder={onCreateFolder}
        onStartRename={() => setIsRenaming(true)}
        fileTreeSortMode={fileTreeSortMode}
        onSelectSortMode={setFileTreeSortMode}
        notesRootPath={notesRootPath}
      />

      {expanded && shouldRenderChildren && rootFolder.children.length > 0 ? (
        <NotesSidebarList>
          {useVirtualFileTree && scrollRootRef ? (
            <VirtualizedFileTree
              nodes={rootFolder.children}
              startDepth={1}
              parentFolderPath=""
              scrollRootRef={scrollRootRef}
            />
          ) : (
            rootFolder.children.map((node) => (
              <FileTreeItem
                key={node.id}
                node={node}
                depth={1}
                parentFolderPath=""
              />
            ))
          )}
        </NotesSidebarList>
      ) : null}
    </div>
  );
}
