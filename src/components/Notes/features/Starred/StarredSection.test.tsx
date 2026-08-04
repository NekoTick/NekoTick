import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StarredSection } from './StarredSection';

const mocked = vi.hoisted(() => ({
  requestFileTreePointerDragDropTargetUpdate: vi.fn(),
  dragSnapshot: {
    activeSourcePath: null as string | null,
    dropTargetPath: null as string | null,
    dropTargetKind: null as 'folder' | 'starred' | null,
  },
  externalDropSnapshot: {
    active: false,
    dropTargetPath: null as string | null,
    dropTargetKind: null as 'folder' | 'starred' | null,
  },
  starredState: {
    starredLoaded: true,
    hasEntries: false,
    entries: [] as Array<{
      entry: { id: string; kind: 'note' | 'folder'; relativePath: string; notesRootPath: string; addedAt: number };
      isCurrentNotesRootEntry: boolean;
      isActive: boolean;
      treeNode: { id: string; name: string; path: string; isFolder: boolean; children?: unknown[]; expanded?: boolean } | null;
      onOpen: () => void;
      onRemove: () => void;
    }>,
  },
  fileItemProps: [] as Array<Record<string, unknown>>,
  folderItemProps: [] as Array<Record<string, unknown>>,
  externalStarredEntryRowProps: [] as Array<Record<string, unknown>>,
}));

vi.mock('../FileTree/hooks/fileTreePointerDragState', () => ({
  requestFileTreePointerDragDropTargetUpdate: mocked.requestFileTreePointerDragDropTargetUpdate,
  useIsFileTreePointerDragActive: () => mocked.dragSnapshot.activeSourcePath !== null,
  useIsFileTreePointerStarredDropTarget: () => mocked.dragSnapshot.dropTargetKind === 'starred',
}));

vi.mock('../FileTree/hooks/externalFileTreeDropState', () => ({
  useExternalFileTreeDropState: (selector: (snapshot: typeof mocked.externalDropSnapshot) => unknown) =>
    selector(mocked.externalDropSnapshot),
}));

vi.mock('./useStarredSectionEntries', () => ({
  useStarredSectionEntries: () => mocked.starredState,
}));

vi.mock('../FileTree/FileItem', () => ({
  FileItem: ({
    dragEnabled,
    showMenuButton,
    showStarBadge,
  }: {
    dragEnabled?: boolean;
    showMenuButton?: boolean;
    showStarBadge?: boolean;
  }) => {
    mocked.fileItemProps.push({ dragEnabled, showMenuButton, showStarBadge });
    return <div data-testid="mock-file-item" />;
  },
}));

vi.mock('../FileTree/FolderItem', () => ({
  FolderItem: ({
    dragEnabled,
    showMenuButton,
    showStarBadge,
  }: {
    dragEnabled?: boolean;
    showMenuButton?: boolean;
    showStarBadge?: boolean;
  }) => {
    mocked.folderItemProps.push({ dragEnabled, showMenuButton, showStarBadge });
    return <div data-testid="mock-folder-item" />;
  },
}));

vi.mock('./ExternalStarredEntryRow', () => ({
  ExternalStarredEntryRow: (props: Record<string, unknown>) => {
    mocked.externalStarredEntryRowProps.push(props);
    return <div data-testid="mock-external-starred-entry-row" />;
  },
}));

describe('StarredSection', () => {
  beforeEach(() => {
    mocked.dragSnapshot.activeSourcePath = null;
    mocked.dragSnapshot.dropTargetPath = null;
    mocked.dragSnapshot.dropTargetKind = null;
    mocked.externalDropSnapshot.active = false;
    mocked.externalDropSnapshot.dropTargetPath = null;
    mocked.externalDropSnapshot.dropTargetKind = null;
    mocked.requestFileTreePointerDragDropTargetUpdate.mockClear();
    mocked.starredState.starredLoaded = true;
    mocked.starredState.hasEntries = false;
    mocked.starredState.entries = [];
    mocked.fileItemProps = [];
    mocked.folderItemProps = [];
    mocked.externalStarredEntryRowProps = [];
  });

  afterEach(() => {
    cleanup();
  });

  it('does not reserve embedded sidebar space when empty and no file tree item is being dragged', () => {
    const { container } = render(<StarredSection showTitle={false} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Starred')).toBeNull();
  });

  it('stays hidden in titled sections when empty and no file tree item is being dragged', () => {
    const { container } = render(<StarredSection />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders an empty starred drop target while a file tree item is being dragged', () => {
    mocked.dragSnapshot.activeSourcePath = 'Source.md';

    const { container } = render(<StarredSection showTitle={false} />);

    expect(screen.getAllByText('Starred').length).toBeGreaterThan(0);
    const target = container.querySelector('[data-file-tree-starred-drop-target="true"]');
    expect(target).not.toBeNull();
    expect(target?.className).not.toContain('absolute');
  });

  it('renders the empty starred drop target while starred data is still loading', () => {
    mocked.starredState.starredLoaded = false;
    mocked.dragSnapshot.activeSourcePath = 'Source.md';

    const { container } = render(<StarredSection showTitle={false} />);

    expect(screen.getAllByText('Starred').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-file-tree-starred-drop-target="true"]')).not.toBeNull();
  });

  it('keeps existing embedded entries visible while starred data reloads', () => {
    mocked.starredState.starredLoaded = false;
    mocked.starredState.hasEntries = true;

    const { container } = render(<StarredSection showTitle={false} />);

    expect(container.querySelector('[data-file-tree-starred-drop-target="true"]')).not.toBeNull();
    expect(container).not.toBeEmptyDOMElement();
  });

  it('opens the empty starred section while a file tree item is being dragged', () => {
    mocked.dragSnapshot.activeSourcePath = 'Source.md';

    const { container } = render(<StarredSection />);

    const contentGrid = container.querySelector('[class*="grid-rows-"]');
    expect(contentGrid?.className).toContain('grid-rows-[1fr]');
    expect(mocked.requestFileTreePointerDragDropTargetUpdate).toHaveBeenCalledTimes(1);
  });

  it('renders and opens the empty starred section during an external file drag', () => {
    mocked.externalDropSnapshot.active = true;

    const { container } = render(<StarredSection />);

    expect(screen.getAllByText('Starred').length).toBeGreaterThan(0);
    const contentGrid = container.querySelector('[class*="grid-rows-"]');
    expect(contentGrid?.className).toContain('grid-rows-[1fr]');
    expect(mocked.requestFileTreePointerDragDropTargetUpdate).not.toHaveBeenCalled();
  });

  it('renders current-notesRoot starred files with the starred row instead of a file tree row', async () => {
    mocked.starredState.hasEntries = true;
    mocked.starredState.entries = [{
      entry: {
        id: 'starred-file',
        kind: 'note',
        relativePath: 'docs/alpha.md',
        notesRootPath: '/notesRoot',
        addedAt: 1,
      },
      isCurrentNotesRootEntry: true,
      isActive: false,
      treeNode: {
        id: 'file-alpha',
        name: 'alpha.md',
        path: 'docs/alpha.md',
        isFolder: false,
      },
      onOpen: vi.fn(),
      onRemove: vi.fn(),
    }];

    render(<StarredSection showTitle={false} />);

    await waitFor(() => expect(mocked.externalStarredEntryRowProps.length).toBeGreaterThan(0));
    expect(mocked.fileItemProps).toEqual([]);
    expect(mocked.externalStarredEntryRowProps[0]).toEqual(expect.objectContaining({
      isCurrentNotesRootEntry: true,
      isActive: false,
    }));
  });

  it('renders current-notesRoot starred folders with the normal folder row menu action', async () => {
    mocked.starredState.hasEntries = true;
    mocked.starredState.entries = [{
      entry: {
        id: 'starred-folder',
        kind: 'folder',
        relativePath: 'docs',
        notesRootPath: '/notesRoot',
        addedAt: 1,
      },
      isCurrentNotesRootEntry: true,
      isActive: false,
      treeNode: {
        id: 'folder-docs',
        name: 'docs',
        path: 'docs',
        isFolder: true,
        children: [],
        expanded: false,
      },
      onOpen: vi.fn(),
      onRemove: vi.fn(),
    }];

    render(<StarredSection showTitle={false} />);

    await waitFor(() => expect(mocked.folderItemProps.length).toBeGreaterThan(0));
    mocked.folderItemProps.forEach((props) => expect(props).toEqual(expect.objectContaining({
      dragEnabled: false,
      showStarBadge: undefined,
      showMenuButton: undefined,
    })));
  });
});
