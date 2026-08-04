import { describe, expect, it, vi } from 'vitest';
import { createFolderMenuEntries } from './FolderItemMenuEntries';

describe('createFolderMenuEntries', () => {
  it('places Rename directly below New File', () => {
    const entries = createFolderMenuEntries({
      t: (key) => key,
      nodePath: 'docs',
      isItemStarred: false,
      setIsRenaming: vi.fn(),
      setShowMenu: vi.fn(),
      setShowDeleteDialog: vi.fn(),
      createNote: vi.fn(),
      toggleFolderStarred: vi.fn(),
      handleCopyPath: vi.fn(),
      handleOpenInNewWindow: vi.fn(),
      handleOpenLocation: vi.fn(),
    });

    expect(entries.slice(0, 2).map((entry) => entry.key)).toEqual([
      'new-note',
      'rename',
    ]);
  });
});
