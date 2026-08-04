import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RootFolderRow } from './RootFolderRow';

const hoisted = vi.hoisted(() => ({
  notesPath: '',
  currentNotesRoot: { path: '/notesRoot', name: 'NotesRoot' } as { path: string; name: string } | null,
  renameCurrentNotesRoot: vi.fn(() => Promise.resolve(true)),
  setFileTreeSortMode: vi.fn(),
  toggleFolder: vi.fn(),
  internalDropTargetPath: null as string | null,
}));

vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon-name={name} />,
}));

vi.mock('@/stores/useNotesStore', () => ({
  useNotesStore: (selector: (state: any) => unknown) => selector({
    notesPath: hoisted.notesPath,
    fileTreeSortMode: 'name-asc',
    setFileTreeSortMode: hoisted.setFileTreeSortMode,
    toggleFolder: hoisted.toggleFolder,
  }),
}));

vi.mock('@/stores/useNotesRootStore', () => ({
  useNotesRootStore: (selector: (state: any) => unknown) => selector({
    currentNotesRoot: hoisted.currentNotesRoot,
    renameCurrentNotesRoot: hoisted.renameCurrentNotesRoot,
  }),
}));

vi.mock('../FileTree/hooks/fileTreePointerDragState', () => ({
  useIsFileTreePointerFolderDropTarget: (path: string, enabled: boolean) => (
    enabled && hoisted.internalDropTargetPath === path
  ),
}));

vi.mock('../FileTree/hooks/externalFileTreeDropState', () => ({
  useExternalFileTreeDropState: () => false,
}));

vi.mock('./useRootBlankContextMenu', () => ({
  useRootBlankContextMenu: () => {},
}));

vi.mock('../FileTree', () => ({
  FileTreeItem: () => null,
}));

vi.mock('../FileTree/VirtualizedFileTree', () => ({
  shouldVirtualizeFileTree: () => false,
  VirtualizedFileTree: () => null,
}));

vi.mock('../FileTree/virtualFileTree', () => ({
  countVisibleFileTreeRows: () => 0,
}));

vi.mock('./RootFolderMenu', () => ({
  RootFolderMenu: () => null,
}));

describe('RootFolderRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.notesPath = '';
    hoisted.currentNotesRoot = { path: '/notesRoot', name: 'NotesRoot' };
    hoisted.internalDropTargetPath = null;
  });

  it('does not show a root loading shell when no notes target is open', () => {
    const { container } = render(
      <RootFolderRow
        rootFolder={null}
        isLoading={false}
        onCreateNote={vi.fn(() => Promise.resolve())}
        onCreateFolder={vi.fn(() => Promise.resolve(null))}
      />,
    );

    expect(container.querySelector('[data-notes-sidebar-root-loading-shell="true"]')).toBeNull();
  });

  it('shows a root loading shell while the active notesRoot root is loading', () => {
    hoisted.notesPath = '/notesRoot';

    const { container } = render(
      <RootFolderRow
        rootFolder={null}
        isLoading={false}
        onCreateNote={vi.fn(() => Promise.resolve())}
        onCreateFolder={vi.fn(() => Promise.resolve(null))}
      />,
    );

    expect(container.querySelector('[data-notes-sidebar-root-loading-shell="true"]')).not.toBeNull();
  });

  it('uses background-only feedback for an expanded root drag target', () => {
    hoisted.internalDropTargetPath = '';
    const { container } = render(
      <RootFolderRow
        rootFolder={{
          id: 'root',
          name: 'NotesRoot',
          path: '',
          isFolder: true,
          expanded: true,
          children: [{
            id: 'inside',
            name: 'inside.md',
            path: 'inside.md',
            isFolder: false,
          }],
        }}
        isLoading={false}
        onCreateNote={vi.fn(() => Promise.resolve())}
        onCreateFolder={vi.fn(() => Promise.resolve(null))}
      />,
    );

    const root = container.querySelector('[data-file-tree-primary="true"]');
    const classNames = root?.className.split(/\s+/) ?? [];

    expect(root).toHaveClass('bg-[var(--vlaina-sidebar-notes-row-drag)]');
    expect(classNames.some((className) => className.startsWith('ring-'))).toBe(false);
    expect(classNames.some((className) => className.startsWith('shadow-'))).toBe(false);
  });
});
