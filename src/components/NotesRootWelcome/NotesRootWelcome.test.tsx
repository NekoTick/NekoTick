import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotesRootWelcome } from './NotesRootWelcome';

const mocks = vi.hoisted(() => ({
  notesRootState: {
    initialize: vi.fn().mockResolvedValue(undefined),
    recentNotesRoots: [
      { id: 'notes-root-1', name: 'Alpha NotesRoot', path: '/notes-roots/alpha' },
    ],
    openNotesRoot: vi.fn().mockResolvedValue(true),
    removeFromRecent: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
  },
  windowState: {
    setResizable: vi.fn().mockResolvedValue(undefined),
    setSize: vi.fn().mockResolvedValue(undefined),
    center: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/stores/useNotesRootStore', () => ({
  useNotesRootStore: (selector?: (state: typeof mocks.notesRootState) => unknown) =>
    selector ? selector(mocks.notesRootState) : mocks.notesRootState,
}));

vi.mock('@/lib/desktop/window', () => ({
  desktopWindow: mocks.windowState,
}));

vi.mock('@/components/ui/icons', () => ({
  Icon: () => <span data-testid="icon" />,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('NotesRootWelcome', () => {
  beforeEach(() => {
    mocks.notesRootState.initialize.mockClear();
    mocks.notesRootState.openNotesRoot.mockClear();
    mocks.windowState.setResizable.mockClear();
    mocks.windowState.setSize.mockClear();
    mocks.windowState.center.mockClear();
    mocks.notesRootState.recentNotesRoots = [{ id: 'notes-root-1', name: 'Alpha NotesRoot', path: '/notes-roots/alpha' }];
    mocks.notesRootState.isLoading = false;
  });

  it('initializes, locks the window, and opens a recent notesRoot', async () => {
    render(<NotesRootWelcome />);

    await waitFor(() => {
      expect(mocks.notesRootState.initialize).toHaveBeenCalledTimes(1);
      expect(mocks.windowState.setResizable).toHaveBeenCalledWith(false);
      expect(mocks.windowState.setSize).not.toHaveBeenCalled();
      expect(mocks.windowState.center).not.toHaveBeenCalled();
    });

    const notesRootButton = await screen.findByRole('button', { name: /alpha notesRoot/i });
    fireEvent.click(notesRootButton);

    await waitFor(() => {
      expect(mocks.notesRootState.openNotesRoot).toHaveBeenCalledWith('/notes-roots/alpha');
    });
  });

  it('unlocks the window again on unmount', async () => {
    const view = render(<NotesRootWelcome />);

    await waitFor(() => {
      expect(mocks.windowState.setResizable).toHaveBeenCalledWith(false);
    });

    await act(async () => {
      view.unmount();
    });

    await waitFor(() => {
      expect(mocks.windowState.setResizable).toHaveBeenCalledWith(true);
      expect(mocks.windowState.setSize).not.toHaveBeenCalled();
      expect(mocks.windowState.center).not.toHaveBeenCalled();
    });
  });
});
