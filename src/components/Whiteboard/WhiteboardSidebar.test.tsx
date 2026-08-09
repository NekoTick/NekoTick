import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WhiteboardSidebar } from './WhiteboardSidebar';

const store = vi.hoisted(() => ({
  activeBoardId: 'board-1' as string | null,
  boards: [{
    id: 'board-1',
    title: 'Ideas',
    folder: 'ideas',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }],
  createBoard: vi.fn(async () => undefined),
  deleteBoard: vi.fn(async () => undefined),
  loadForNotesRoot: vi.fn(async () => undefined),
  renameBoard: vi.fn(async () => undefined),
  selectBoard: vi.fn(async () => undefined),
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string>) => values
      ? `${key}:${Object.values(values).join(':')}`
      : key,
  }),
}));

vi.mock('@/stores/useNotesRootStore', () => ({
  useNotesRootStore: (selector: (state: { currentNotesRoot: { path: string } }) => unknown) => (
    selector({ currentNotesRoot: { path: '/notesRoot' } })
  ),
}));

vi.mock('./stores/useWhiteboardStore', () => ({
  useWhiteboardStore: (selector: (state: typeof store) => unknown) => selector(store),
}));

vi.mock('@/components/layout/sidebar/AppViewModeSwitch', () => ({
  AppViewModeSwitch: () => <div />,
}));

vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon-name={name} />,
}));

vi.mock('@/components/layout/sidebar/SidebarPrimitives', () => ({
  SidebarActionButton: ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button type="button" onClick={onClick}>{label}</button>
  ),
  SidebarActionGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarCapsulePanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarSurface: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/common/ConfirmDialog', () => ({
  ConfirmDialog: ({ isOpen, onConfirm }: { isOpen: boolean; onConfirm: () => void }) => (
    isOpen ? <button type="button" onClick={onConfirm}>confirm-delete</button> : null
  ),
}));

describe('WhiteboardSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the current notes root when mounted for background prewarm', async () => {
    render(<WhiteboardSidebar />);

    await waitFor(() => expect(store.loadForNotesRoot).toHaveBeenCalledWith('/notesRoot'));
    const row = document.querySelector('[data-whiteboard-board-row="true"]');
    expect(row).toHaveClass('[content-visibility:auto]');
    expect(screen.getByRole('button', { name: 'Ideas' }).tabIndex).toBe(0);
  });

  it('renames a board from the inline editor', async () => {
    render(<WhiteboardSidebar />);

    fireEvent.click(openBoardContextMenu().getByText('sidebar.rename'));
    const input = screen.getByRole('textbox', { name: 'sidebar.rename' });
    fireEvent.change(input, { target: { value: 'Research' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(store.renameBoard).toHaveBeenCalledWith('board-1', 'Research'));
  });

  it('confirms board deletion before removing it', async () => {
    render(<WhiteboardSidebar />);

    fireEvent.click(openBoardContextMenu().getByText('common.delete'));
    fireEvent.click(screen.getByRole('button', { name: 'confirm-delete' }));

    await waitFor(() => expect(store.deleteBoard).toHaveBeenCalledWith('board-1'));
  });

  it('uses the shared chat context menu when right-clicking a board name', () => {
    render(<WhiteboardSidebar />);

    expect(screen.queryByRole('button', { name: 'sidebar.rename' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'common.delete' })).not.toBeInTheDocument();
    const menu = openBoardContextMenu();
    expect(menu.getByText('sidebar.rename')).toBeInTheDocument();
    expect(menu.getByText('common.delete')).toBeInTheDocument();
  });

  it('opens board actions from the visible menu button', () => {
    render(<WhiteboardSidebar />);

    fireEvent.click(screen.getByRole('button', { name: 'sidebar.more' }));

    const layer = document.querySelector<HTMLElement>('[data-sidebar-context-menu-layer="true"]');
    expect(layer).not.toBeNull();
    expect(within(layer!).getByText('sidebar.rename')).toBeInTheDocument();
    expect(within(layer!).getByText('common.delete')).toBeInTheDocument();
  });
});

function openBoardContextMenu() {
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Ideas' }), { clientX: 120, clientY: 160 });
  const layer = document.querySelector<HTMLElement>('[data-sidebar-context-menu-layer="true"]');
  expect(layer).not.toBeNull();
  return within(layer!);
}
