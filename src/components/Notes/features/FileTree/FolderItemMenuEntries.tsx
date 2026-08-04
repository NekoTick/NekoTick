import type { Dispatch, SetStateAction } from 'react';
import { Icon } from '@/components/ui/icons';
import { DeleteIcon } from '@/components/common/DeleteIcon';
import type { MessageKey } from '@/lib/i18n';
import type { NotesSidebarMenuEntry } from '../Sidebar/context-menu/NotesSidebarContextMenuContent';

interface CreateFolderMenuEntriesArgs {
  t: (key: MessageKey) => string;
  nodePath: string;
  isItemStarred: boolean;
  setIsRenaming: Dispatch<SetStateAction<boolean>>;
  setShowMenu: Dispatch<SetStateAction<boolean>>;
  setShowDeleteDialog: Dispatch<SetStateAction<boolean>>;
  createNote: (folderPath: string, options: { asDraft: true }) => Promise<unknown>;
  toggleFolderStarred: (folderPath: string) => void;
  handleCopyPath: () => Promise<void>;
  handleOpenInNewWindow: (itemKind: 'folder') => Promise<void>;
  handleOpenLocation: (itemKind: 'folder') => Promise<void>;
}

export function createFolderMenuEntries({
  t,
  nodePath,
  isItemStarred,
  setIsRenaming,
  setShowMenu,
  setShowDeleteDialog,
  createNote,
  toggleFolderStarred,
  handleCopyPath,
  handleOpenInNewWindow,
  handleOpenLocation,
}: CreateFolderMenuEntriesArgs): NotesSidebarMenuEntry[] {
  return [
    {
      key: 'new-note',
      icon: <Icon name="file.add" size="md" />,
      label: t('sidebar.newNote'),
      onClick: async () => {
        setShowMenu(false);
        await createNote(nodePath, { asDraft: true });
      },
    },
    {
      key: 'rename',
      icon: <Icon name="common.compose" size="md" />,
      label: t('sidebar.rename'),
      onClick: () => {
        setIsRenaming(true);
        setShowMenu(false);
      },
    },
    {
      key: 'toggle-star',
      icon: <Icon name="misc.star" size="md" className={isItemStarred ? 'fill-[var(--vlaina-color-favorite-fg)] text-[var(--vlaina-color-favorite-fg)]' : undefined} />,
      label: isItemStarred ? t('sidebar.removeFromStarred') : t('sidebar.addToStarred'),
      onClick: () => {
        toggleFolderStarred(nodePath);
        setShowMenu(false);
      },
    },
    {
      kind: 'submenu',
      key: 'more',
      icon: <Icon name="common.more" size="md" />,
      label: t('sidebar.more'),
      children: [
        {
          key: 'copy-path',
          icon: <Icon name="common.copy" size="md" />,
          label: t('sidebar.copyPath'),
          onClick: async () => {
            setShowMenu(false);
            await handleCopyPath();
          },
        },
        {
          key: 'open-new-window',
          icon: <Icon name="file.folderOutput" size="md" />,
          label: t('sidebar.openInNewWindow'),
          onClick: async () => {
            setShowMenu(false);
            await handleOpenInNewWindow('folder');
          },
        },
        {
          key: 'open-location',
          icon: <Icon name="file.folderOpenArrow" size="md" />,
          label: t('sidebar.openFolderLocation'),
          onClick: async () => {
            setShowMenu(false);
            await handleOpenLocation('folder');
          },
        },
      ],
    },
    {
      kind: 'divider',
      key: 'divider-danger',
    },
    {
      key: 'delete',
      icon: <DeleteIcon />,
      label: t('sidebar.moveToTrash'),
      onClick: () => {
        setShowMenu(false);
        setShowDeleteDialog(true);
      },
      danger: true,
    },
  ];
}
