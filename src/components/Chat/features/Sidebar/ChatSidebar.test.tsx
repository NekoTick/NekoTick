import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatSession } from '@/lib/ai/types';
import type { ReactNode } from 'react';
import { ChatSidebar } from './ChatSidebar';

const hoisted = vi.hoisted(() => ({
  appViewMode: 'chat' as 'chat' | 'notes',
  currentSessionId: 's1',
  markSessionRead: vi.fn(),
  sessions: [] as ChatSession[],
  openNewChat: vi.fn(),
  switchSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  topActionsProps: [] as Array<{ showAppViewModeSwitch?: boolean }>,
  sidebarSearchOpen: false,
  setSidebarSearchOpen: vi.fn((open: boolean) => {
    hoisted.sidebarSearchOpen = open;
  }),
  toggleSidebarSearch: vi.fn(() => {
    hoisted.sidebarSearchOpen = !hoisted.sidebarSearchOpen;
  }),
  chatSidebarSearchOpen: false,
  setChatSidebarSearchOpen: vi.fn((open: boolean) => {
    hoisted.chatSidebarSearchOpen = open;
  }),
  toggleChatSidebarSearch: vi.fn(() => {
    hoisted.chatSidebarSearchOpen = !hoisted.chatSidebarSearchOpen;
  }),
}));

vi.mock('@/stores/uiSlice', () => ({
  useUIStore: (selector: (state: {
    appViewMode: 'chat' | 'notes';
    sidebarSearchOpen: boolean;
    setSidebarSearchOpen: (open: boolean) => void;
    toggleSidebarSearch: () => void;
    chatSidebarSearchOpen: boolean;
    setChatSidebarSearchOpen: (open: boolean) => void;
    toggleChatSidebarSearch: () => void;
  }) => unknown) =>
    selector({
      appViewMode: hoisted.appViewMode,
      sidebarSearchOpen: hoisted.sidebarSearchOpen,
      setSidebarSearchOpen: hoisted.setSidebarSearchOpen,
      toggleSidebarSearch: hoisted.toggleSidebarSearch,
      chatSidebarSearchOpen: hoisted.chatSidebarSearchOpen,
      setChatSidebarSearchOpen: hoisted.setChatSidebarSearchOpen,
      toggleChatSidebarSearch: hoisted.toggleChatSidebarSearch,
    }),
}));

vi.mock('@/stores/unified/useUnifiedStore', () => ({
  useUnifiedStore: (selector: (state: { data: { ai: { sessions: ChatSession[] } } }) => unknown) =>
    selector({ data: { ai: { sessions: hoisted.sessions } } }),
}));

vi.mock('@/stores/ai/chatState', () => {
  const getState = () => ({
    currentSessionId: hoisted.currentSessionId,
    markSessionRead: hoisted.markSessionRead,
    unreadSessions: {},
  });
  const useAIUIStore = Object.assign(
    (selector: (state: ReturnType<typeof getState>) => unknown) => selector(getState()),
    { getState },
  );
  return { useAIUIStore };
});

vi.mock('@/stores/useAIStore', () => ({
  actions: {
    deleteSession: hoisted.deleteSession,
    openNewChat: hoisted.openNewChat,
    switchSession: hoisted.switchSession,
    updateSession: hoisted.updateSession,
  },
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (!values) return key;
      return `${key}:${Object.entries(values).map(([name, value]) => `${name}=${String(value)}`).join(',')}`;
    },
  }),
}));

vi.mock('@/lib/ui/composerFocusRegistry', () => ({
  focusComposerInput: vi.fn(() => true),
}));

vi.mock('@/components/common/ConfirmDialog', () => ({
  ConfirmDialog: ({
    isOpen,
    onConfirm,
    title,
    description,
  }: {
    isOpen: boolean;
    onConfirm: () => void | Promise<void>;
    title?: string;
    description?: string;
  }) => isOpen ? (
    <div data-testid="confirm-dialog">
      <span data-testid="confirm-title">{title}</span>
      <span data-testid="confirm-description">{description}</span>
      <button type="button" onClick={() => void onConfirm()}>
        confirm
      </button>
    </div>
  ) : null,
}));

vi.mock('@/components/layout/sidebar/SidebarSearchDrawer', async () => {
  const actual = await vi.importActual<typeof import('@/components/layout/sidebar/SidebarSearchDrawer')>(
    '@/components/layout/sidebar/SidebarSearchDrawer',
  );
  return {
    ...actual,
    SidebarSearchDrawer: ({
      searchQuery,
      setSearchQuery,
      canSubmit,
      onSubmit,
      canSelectPrevious,
      canSelectNext,
      onSelectPrevious,
      onSelectNext,
    }: {
      searchQuery: string;
      setSearchQuery: (value: string) => void;
      canSubmit: boolean;
      onSubmit: () => void;
      canSelectPrevious?: boolean;
      canSelectNext?: boolean;
      onSelectPrevious?: () => void;
      onSelectNext?: () => void;
    }) => (
      <input
        aria-label="chat-search"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' && canSelectPrevious) {
            onSelectPrevious?.();
          }
          if (event.key === 'ArrowDown' && canSelectNext) {
            onSelectNext?.();
          }
          if (event.key === 'Enter' && canSubmit) {
            onSubmit();
          }
        }}
      />
    ),
  };
});

vi.mock('./ChatSidebarPrimitives', () => ({
  ChatSidebarHoverEmptyHint: ({ title }: { title: string }) => <div data-testid="empty-hint">{title}</div>,
  ChatSidebarList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ChatSidebarScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ChatSidebarSurface: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('./ChatSidebarTopActions', () => ({
  ChatSidebarTopActions: (props: { showAppViewModeSwitch?: boolean }) => {
    hoisted.topActionsProps.push(props);
    return <div data-testid="top-actions" />;
  },
}));

vi.mock('@/components/layout/sidebar/SidebarPrimitives', () => ({
  SidebarCapsulePanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SIDEBAR_CAPSULE_SCROLLBAR_INSET_RIGHT: 0,
}));

vi.mock('./ChatSidebarVirtualList', () => ({
  ChatSidebarVirtualList: ({
    sessions,
    highlightedSessionId,
    onRequestDelete,
  }: {
    sessions: ChatSession[];
    highlightedSessionId?: string | null;
    onRequestDelete?: (sessionId: string) => void;
  }) => (
    <div data-testid="session-list">
      {sessions.map((session) => (
        <div
          key={session.id}
          data-highlighted={highlightedSessionId === session.id ? 'true' : undefined}
        >
          {session.title}
          <button type="button" onClick={() => onRequestDelete?.(session.id)}>
            delete {session.title}
          </button>
        </div>
      ))}
    </div>
  ),
}));

function buildSession(id: string, title: string): ChatSession {
  return {
    id,
    title,
    modelId: 'model',
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('ChatSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.appViewMode = 'chat';
    hoisted.currentSessionId = 's1';
    hoisted.sidebarSearchOpen = false;
    hoisted.chatSidebarSearchOpen = false;
    hoisted.topActionsProps = [];
    hoisted.sessions = [
      buildSession('s1', 'Alpha'),
      buildSession('s2', 'Beta'),
    ];
  });

  it('keeps the last active session list rendered while inactive', () => {
    const { rerender } = render(<ChatSidebar active />);

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();

    hoisted.appViewMode = 'notes';
    hoisted.sessions = [];
    rerender(<ChatSidebar active={false} />);

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-hint')).not.toBeInTheDocument();
  });

  it('closes chat search when the sidebar becomes inactive', async () => {
    hoisted.chatSidebarSearchOpen = true;

    const { rerender } = render(<ChatSidebar active />);

    hoisted.appViewMode = 'notes';
    rerender(<ChatSidebar active={false} />);

    await waitFor(() => {
      expect(hoisted.setChatSidebarSearchOpen).toHaveBeenCalledWith(false);
    });
  });

  it('hides the app view switch in the embedded chat sidebar', () => {
    render(<ChatSidebar embedded />);

    expect(hoisted.topActionsProps.at(-1)?.showAppViewModeSwitch).toBe(false);
  });

  it('gives the empty-state positioning container the full scroll-area height', () => {
    hoisted.sessions = [];

    render(<ChatSidebar embedded />);

    expect(screen.getByTestId('empty-hint').parentElement).toHaveClass('relative', 'h-full');
  });

  it('uses arrow key selection when submitting chat search results', async () => {
    hoisted.chatSidebarSearchOpen = true;
    hoisted.sessions = [
      buildSession('s1', 'Alpha'),
      buildSession('s2', 'Alpine'),
      buildSession('s3', 'Beta'),
    ];

    render(<ChatSidebar active />);

    const input = screen.getByLabelText('chat-search');
    fireEvent.change(input, { target: { value: 'Al' } });

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toHaveAttribute('data-highlighted', 'true');
    });

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    await waitFor(() => {
      expect(screen.getByText('Alpine')).toHaveAttribute('data-highlighted', 'true');
    });

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(hoisted.switchSession).toHaveBeenCalledWith('s2');
  });

  it('isolates rejected session switches from chat search submission', async () => {
    hoisted.chatSidebarSearchOpen = true;
    hoisted.sessions = [
      buildSession('s1', 'Alpha'),
      buildSession('s2', 'Alpine'),
    ];
    hoisted.switchSession.mockRejectedValueOnce(new Error('switch failed'));

    render(<ChatSidebar active />);

    const input = screen.getByLabelText('chat-search');
    fireEvent.change(input, { target: { value: 'Al' } });

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toHaveAttribute('data-highlighted', 'true');
    });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(hoisted.switchSession).toHaveBeenCalledWith('s2');
  });

  it('focuses the composer after confirming a sidebar chat delete', async () => {
    const { focusComposerInput } = await import('@/lib/ui/composerFocusRegistry');
    hoisted.deleteSession.mockResolvedValue(undefined);

    render(<ChatSidebar active />);

    fireEvent.click(screen.getByText('delete Alpha'));
    expect(screen.getByTestId('confirm-description')).toHaveTextContent('itemLabel=Alpha');
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));

    await waitFor(() => {
      expect(hoisted.deleteSession).toHaveBeenCalledWith('s1');
    });
    await waitFor(() => {
      expect(focusComposerInput).toHaveBeenCalled();
    });
  });

  it('isolates rejected sidebar chat deletes', async () => {
    const { focusComposerInput } = await import('@/lib/ui/composerFocusRegistry');
    hoisted.deleteSession.mockRejectedValueOnce(new Error('delete failed'));

    render(<ChatSidebar active />);

    fireEvent.click(screen.getByText('delete Alpha'));
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));

    await waitFor(() => {
      expect(hoisted.deleteSession).toHaveBeenCalledWith('s1');
    });
    expect(focusComposerInput).not.toHaveBeenCalled();
  });
});
