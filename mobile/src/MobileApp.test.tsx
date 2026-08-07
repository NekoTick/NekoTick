import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OPEN_SETTINGS_EVENT } from '@/components/Settings/settingsEvents';
import { MobileApp } from './MobileApp';

const controls = vi.hoisted(() => ({
  appViewMode: 'notes',
  createNote: vi.fn(),
  currentNote: null as { path: string; content: string } | null,
  flushEditor: vi.fn(),
  isConnected: false,
  setAppViewMode: vi.fn(),
}));

vi.mock('@/components/layout/AccountLoginDialog', () => ({
  AccountLoginDialog: ({
    onOpenChange,
    open,
  }: {
    onOpenChange: (open: boolean) => void;
    open: boolean;
  }) => open ? (
    <section role="dialog" aria-label="Login">
      <button type="button" onClick={() => onOpenChange(false)}>Close login</button>
    </section>
  ) : null,
}));
vi.mock('@/stores/notes/pendingEditorMarkdownFlusher', () => ({
  flushCurrentPendingEditorMarkdown: controls.flushEditor,
}));
vi.mock('@/stores/accountSession', () => {
  const getState = () => ({ isConnected: controls.isConnected });
  const useAccountSessionStore = (
    selector: (state: ReturnType<typeof getState>) => unknown,
  ) => selector(getState());
  useAccountSessionStore.getState = getState;
  return { useAccountSessionStore };
});
vi.mock('@/stores/useNotesStore', () => {
  const getState = () => ({
    createNote: controls.createNote,
    currentNote: controls.currentNote,
  });
  const useNotesStore = (selector: (state: ReturnType<typeof getState>) => unknown) => (
    selector(getState())
  );
  useNotesStore.getState = getState;
  return { useNotesStore };
});
vi.mock('@/stores/uiSlice', () => ({
  useUIStore: (selector: (state: {
    appViewMode: string;
    setAppViewMode: (view: string) => void;
  }) => unknown) => selector({
    appViewMode: controls.appViewMode,
    setAppViewMode: controls.setAppViewMode,
  }),
}));
vi.mock('./app/MobileProviders', () => ({
  MobileProviders: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./components/MobileTopBar', () => ({
  MobileTopBar: ({
    activeView,
    onOpenSidebar,
    onViewChange,
  }: {
    activeView: string;
    onOpenSidebar: () => void;
    onViewChange: (view: 'chat') => void;
  }) => (
    <header data-testid="top-bar" data-view={activeView}>
      <button type="button" onClick={onOpenSidebar}>Open sidebar</button>
      <button type="button" onClick={() => onViewChange('chat')}>Open Chat</button>
    </header>
  ),
}));
vi.mock('./components/MobileMoreSheet', () => ({
  MobileMoreSheet: ({
    onClose,
    onOpenAccount,
    onOpenSettings,
    onShare,
    open,
  }: {
    onClose: () => void;
    onOpenAccount: () => void;
    onOpenSettings: () => void;
    onShare?: () => void;
    open: boolean;
  }) => open ? (
    <section role="dialog" aria-label="More">
      <button type="button" onClick={() => { onClose(); onOpenSettings(); }}>
        Open settings
      </button>
      <button type="button" onClick={() => { onClose(); onOpenAccount(); }}>
        Open account
      </button>
      {onShare ? (
        <button type="button" onClick={() => { onClose(); onShare(); }}>
          Share current note
        </button>
      ) : null}
    </section>
  ) : null,
}));
vi.mock('./components/MobileSidebarSheet', () => ({
  MobileSidebarSheet: ({ open, onOpenMore }: { open: boolean; onOpenMore: () => void }) => open ? (
    <section role="dialog" aria-label="Sidebar">
      <button type="button" onClick={onOpenMore}>Open more</button>
    </section>
  ) : null,
}));
vi.mock('./screens/MobileMainView', () => ({
  MobileMainView: ({
    activeView,
    onCreateNote,
  }: {
    activeView: string;
    onCreateNote: () => void;
  }) => (
    <main data-testid="main-view" data-view={activeView}>
      <button type="button" onClick={onCreateNote}>Create note</button>
    </main>
  ),
}));
vi.mock('./screens/MobileSettingsScreen', () => ({
  MobileSettingsScreen: ({
    open,
    requestedTab,
  }: {
    open: boolean;
    requestedTab?: string;
  }) => open ? (
    <section role="dialog" aria-label="Settings">
      <span>Settings tab: {requestedTab ?? 'index'}</span>
    </section>
  ) : null,
}));
vi.mock('./screens/MobileAccountScreen', () => ({
  MobileAccountScreen: ({
    onSwitchAccount,
    open,
  }: {
    onSwitchAccount: () => void;
    open: boolean;
  }) => open ? (
    <section role="dialog" aria-label="Account">
      <button type="button" onClick={onSwitchAccount}>Switch account</button>
    </section>
  ) : null,
}));

describe('MobileApp shell integration', () => {
  beforeEach(() => {
    controls.appViewMode = 'notes';
    controls.currentNote = null;
    controls.isConnected = false;
    controls.createNote.mockResolvedValue(undefined);
    controls.setAppViewMode.mockImplementation((view: string) => {
      controls.appViewMode = view;
    });
  });

  it('flushes editor state before changing views and notifies the platform', async () => {
    const onViewChange = vi.fn();
    const platform = { onViewChange };
    const { rerender } = render(<MobileApp platform={platform} />);

    expect(onViewChange).toHaveBeenCalledWith('notes');
    fireEvent.click(screen.getByRole('button', { name: 'Open Chat' }));

    expect(controls.flushEditor).toHaveBeenCalledOnce();
    expect(controls.setAppViewMode).toHaveBeenCalledWith('chat');
    expect(controls.flushEditor.mock.invocationCallOrder[0]).toBeLessThan(
      controls.setAppViewMode.mock.invocationCallOrder[0],
    );

    rerender(<MobileApp platform={platform} />);
    await waitFor(() => expect(onViewChange).toHaveBeenLastCalledWith('chat'));
    expect(screen.getByTestId('main-view')).toHaveAttribute('data-view', 'chat');
  });

  it('creates a new Notes draft with the shell action', () => {
    render(<MobileApp platform={{}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create note' }));

    expect(controls.createNote).toHaveBeenCalledWith(undefined, { asDraft: true });
  });

  it('shares the current note title and latest content', () => {
    controls.currentNote = {
      path: 'Projects/Roadmap.MD',
      content: '# Shipping plan',
    };
    const share = vi.fn().mockResolvedValue(true);
    render(<MobileApp platform={{ share }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open more' }));
    fireEvent.click(screen.getByRole('button', { name: 'Share current note' }));

    expect(controls.flushEditor).toHaveBeenCalledOnce();
    expect(share).toHaveBeenCalledWith({
      title: 'Roadmap',
      text: '# Shipping plan',
    });
    expect(controls.flushEditor.mock.invocationCallOrder[0]).toBeLessThan(
      share.mock.invocationCallOrder[0],
    );
  });

  it('opens Settings and resolves externally requested settings tabs', () => {
    render(<MobileApp platform={{}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open more' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toHaveTextContent(
      'Settings tab: index',
    );

    act(() => {
      window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, {
        detail: { tab: 'feedback' },
      }));
    });
    expect(screen.getByRole('dialog', { name: 'Settings' })).toHaveTextContent(
      'Settings tab: about',
    );
  });

  it('routes a signed-out Account action to Login', () => {
    render(<MobileApp platform={{}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open more' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open account' }));

    expect(screen.getByRole('dialog', { name: 'Login' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Account' })).not.toBeInTheDocument();
  });

  it('opens Account for a connected user and routes account switching to Login', () => {
    controls.isConnected = true;
    render(<MobileApp platform={{}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open more' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open account' }));
    expect(screen.getByRole('dialog', { name: 'Account' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Switch account' }));
    expect(screen.queryByRole('dialog', { name: 'Account' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Login' })).toBeInTheDocument();
  });
});
