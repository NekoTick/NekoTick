import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { AppViewModeSwitch } from '@/components/layout/sidebar/AppViewModeSwitch';
import { SidebarInlineRenameInput } from '@/components/layout/sidebar/SidebarInlineRenameInput';
import { SidebarContextMenu } from '@/components/layout/sidebar/SidebarContextMenu';
import {
  SidebarContextMenuContent,
  type SidebarMenuEntry,
} from '@/components/layout/sidebar/context-menu/SidebarContextMenuContent';
import { getSidebarContextMenuPosition } from '@/components/layout/sidebar/sidebarMenuPosition';
import {
  SidebarActionButton,
  SidebarActionGroup,
  SidebarCapsulePanel,
  SidebarList,
  SidebarScrollArea,
  SidebarSurface,
} from '@/components/layout/sidebar/SidebarPrimitives';
import { getSidebarIdleRowSurfaceClass, getSidebarSelectedRowSurfaceClass } from '@/components/layout/sidebar/sidebarLabelStyles';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n';
import { useNotesRootStore } from '@/stores/useNotesRootStore';
import { WHITEBOARD_SYSTEM_STORAGE_SCOPE } from '@/lib/storage/whiteboardStoragePaths';
import { themeIconTokens } from '@/styles/themeTokens';
import type { WhiteboardIndexEntry } from './model/whiteboardRepository';
import { useWhiteboardStore } from './stores/useWhiteboardStore';

export function WhiteboardSidebar() {
  const { t } = useI18n();
  const notesRootPath = useNotesRootStore((state) => state.currentNotesRoot?.path ?? WHITEBOARD_SYSTEM_STORAGE_SCOPE);
  const activeBoardId = useWhiteboardStore((state) => state.activeBoardId);
  const boards = useWhiteboardStore((state) => state.boards);
  const createBoard = useWhiteboardStore((state) => state.createBoard);
  const deleteBoard = useWhiteboardStore((state) => state.deleteBoard);
  const loadWhiteboards = useWhiteboardStore((state) => state.loadForNotesRoot);
  const loading = useWhiteboardStore((state) => state.loading);
  const renameBoard = useWhiteboardStore((state) => state.renameBoard);
  const selectBoard = useWhiteboardStore((state) => state.selectBoard);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<WhiteboardIndexEntry | null>(null);
  const [contextMenuTarget, setContextMenuTarget] = useState<WhiteboardIndexEntry | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState({ left: 0, top: 0 });

  const contextMenuEntries: SidebarMenuEntry[] = contextMenuTarget ? [
    {
      key: 'rename',
      icon: <Icon name="common.rename" size="md" />,
      label: t('sidebar.rename'),
      onClick: () => {
        setEditingBoardId(contextMenuTarget.id);
        setEditingTitle(contextMenuTarget.title);
        setContextMenuTarget(null);
      },
    },
    { kind: 'divider', key: 'delete-divider' },
    {
      key: 'delete',
      danger: true,
      icon: <Icon name="common.delete" size="md" />,
      label: t('common.delete'),
      onClick: () => {
        setDeleteTarget(contextMenuTarget);
        setContextMenuTarget(null);
      },
    },
  ] : [];

  useEffect(() => {
    void loadWhiteboards(notesRootPath).catch(() => undefined);
  }, [loadWhiteboards, notesRootPath]);

  return (
    <SidebarSurface className="bg-[var(--vlaina-sidebar-notes-surface)] text-[var(--vlaina-sidebar-notes-text)]">
      <SidebarCapsulePanel>
        <SidebarActionGroup>
          <AppViewModeSwitch />
          <SidebarActionButton
            tone="notes"
            disabled={loading}
            label={t('common.create')}
            icon={<Icon name="common.add" size={themeIconTokens.sizeCompact} />}
            onClick={() => {
              void (async () => {
                await loadWhiteboards(notesRootPath);
                await createBoard();
              })().catch(() => undefined);
            }}
          />
        </SidebarActionGroup>
        <SidebarScrollArea className="pt-1">
          <SidebarList>
            {boards.map((board) => {
              const selected = board.id === activeBoardId;
              const editing = board.id === editingBoardId;
              return (
                <div
                  key={board.id}
                  aria-current={selected ? 'page' : undefined}
                  data-whiteboard-board-row="true"
                  className={[
                    'group/whiteboard-board flex min-h-[var(--vlaina-size-36px)] w-full items-center rounded-[var(--vlaina-ui-radius-compact)] px-1.5 text-left text-[length:var(--vlaina-font-sm)] font-medium leading-none [contain-intrinsic-size:auto_var(--vlaina-size-36px)] [content-visibility:auto]',
                    selected ? getSidebarSelectedRowSurfaceClass('notes') : getSidebarIdleRowSurfaceClass('notes'),
                  ].join(' ')}
                >
                  {editing ? (
                    <SidebarInlineRenameInput
                      aria-label={t('sidebar.rename')}
                      value={editingTitle}
                      onValueChange={setEditingTitle}
                      onCancel={() => setEditingBoardId(null)}
                      onSubmit={async () => {
                        await renameBoard(board.id, editingTitle);
                        setEditingBoardId(null);
                      }}
                      className="min-w-0 flex-1 bg-transparent px-1.5 py-2 outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={loading}
                      className="min-w-0 flex-1 cursor-pointer truncate px-1.5 py-2 text-left"
                      onClick={() => {
                        void selectBoard(board.id).catch(() => undefined);
                      }}
                      onDoubleClick={() => {
                        setEditingBoardId(board.id);
                        setEditingTitle(board.title);
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setContextMenuPosition(getSidebarContextMenuPosition(
                          event.currentTarget.getBoundingClientRect(),
                          event.clientY,
                          event.clientX,
                        ));
                        setContextMenuTarget(board);
                      }}
                    >
                      {board.title}
                    </button>
                  )}
                  {!editing ? (
                    <button
                      type="button"
                      aria-label={t('sidebar.more')}
                      data-whiteboard-board-menu-trigger="true"
                      className="pointer-events-none flex size-[var(--vlaina-size-36px)] shrink-0 items-center justify-center rounded-[var(--vlaina-ui-radius-compact)] opacity-[var(--vlaina-opacity-0)] transition-opacity group-hover/whiteboard-board:pointer-events-auto group-hover/whiteboard-board:opacity-[var(--vlaina-opacity-100)] group-focus-within/whiteboard-board:pointer-events-auto group-focus-within/whiteboard-board:opacity-[var(--vlaina-opacity-100)]"
                      onClick={(event) => {
                        event.stopPropagation();
                        const row = event.currentTarget.closest<HTMLElement>('[data-whiteboard-board-row="true"]');
                        const rect = (row ?? event.currentTarget).getBoundingClientRect();
                        setContextMenuPosition(getSidebarContextMenuPosition(rect, rect.top));
                        setContextMenuTarget(board);
                      }}
                    >
                      <Icon name="common.more" size="md" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </SidebarList>
        </SidebarScrollArea>
      </SidebarCapsulePanel>
      <SidebarContextMenu
        isOpen={contextMenuTarget !== null}
        onClose={() => setContextMenuTarget(null)}
        position={contextMenuPosition}
      >
        <SidebarContextMenuContent entries={contextMenuEntries} />
      </SidebarContextMenu>
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title={t('sidebar.deleteItemTitle', { itemType: t('app.viewWhiteboard') })}
        description={deleteTarget ? t('sidebar.deleteItemDescription', { itemLabel: deleteTarget.title }) : undefined}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        variant="danger"
        initialFocus="cancel"
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await deleteBoard(deleteTarget.id);
        }}
      />
    </SidebarSurface>
  );
}
