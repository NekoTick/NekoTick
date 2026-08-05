import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  chatState: {
    currentSessionId: null as string | null,
    isMessagesLoaded: true,
    isSessionActive: false,
    messages: [] as Array<Record<string, unknown>>,
  },
  messageListProps: vi.fn(),
  welcomeProps: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/stores/useAIStore', () => ({
  actions: { switchSession: vi.fn() },
}));

vi.mock('@/stores/unified/useUnifiedStore', () => ({
  useUnifiedStore: (selector: (state: unknown) => unknown) => selector({
    loaded: true,
    data: {
      ai: {
        models: [],
        providers: [],
        selectedModelId: null,
      },
    },
  }),
}));

vi.mock('@/hooks/useChatService', () => ({
  useChatService: () => ({
    clearRecalledComposerDraft: vi.fn(),
    editMessage: vi.fn(),
    recalledComposerDraft: null,
    regenerate: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue(false),
    stop: vi.fn(),
    stopAndRecallLastUserMessage: vi.fn(),
    switchMessageVersion: vi.fn(),
  }),
}));

vi.mock('@/hooks/useMessageAutoscroll', () => ({
  useMessageAutoscroll: () => ({
    containerRef: { current: null },
    currentTurnTopSpacerHeight: 0,
    handleEditMessage: vi.fn(),
    handleNewUserMessage: vi.fn(),
    handleRegenerateMessage: vi.fn(),
    spacerHeight: 0,
  }),
}));

vi.mock('./hooks/useChatShortcuts', () => ({ useChatShortcuts: vi.fn() }));
vi.mock('./hooks/useComposerClickFocus', () => ({ useComposerClickFocus: () => vi.fn() }));
vi.mock('./hooks/useChatViewFocusLifecycle', () => ({ useChatViewFocusLifecycle: vi.fn() }));
vi.mock('./hooks/useEmbeddedComposerInsert', () => ({ useEmbeddedComposerInsert: vi.fn() }));
vi.mock('@/hooks/useHeldPageScroll', () => ({ useHeldPageScroll: vi.fn() }));

vi.mock('./hooks/useChatEmbeddedSidebar', () => ({
  useChatEmbeddedSidebar: () => ({
    closeEmbeddedSidebar: vi.fn(),
    handleEmbeddedSidebarExitComplete: vi.fn(),
    isEmbeddedSidebarOpen: false,
    openEmbeddedSidebar: vi.fn(),
  }),
}));

vi.mock('./hooks/useStableChatMessageDerivatives', () => ({
  useStableChatMessageDerivatives: () => ({ imageGallery: [], sentUserMessages: [] }),
}));

vi.mock('./hooks/useChatViewStoreState', () => ({
  useChatViewStoreState: () => mocks.chatState,
}));

vi.mock('./hooks/useChatViewMessageActions', () => ({
  useChatViewMessageActions: () => ({
    copyToClipboard: vi.fn(),
    getImageGallery: vi.fn(() => []),
    handleEdit: vi.fn(),
    handleFork: vi.fn(),
    handleRegenerate: vi.fn(),
    handleSwitchVersion: vi.fn(),
  }),
}));

vi.mock('./hooks/useChatViewModelSelection', () => ({
  useChatViewModelSelection: () => ({
    isSelectedManagedQuotaExhausted: false,
    selectedModel: null,
  }),
}));

vi.mock('@/stores/uiSlice', () => ({
  useUIStore: (selector: (state: unknown) => unknown) => selector({
    consumePendingNotesChatComposerInsert: vi.fn(),
    pendingNotesChatComposerInsert: null,
  }),
}));

vi.mock('@/stores/useManagedAIStore', () => ({
  useManagedAIStore: (selector: (state: unknown) => unknown) => selector({ budget: null }),
}));

vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/ui/composerFocusRegistry', () => ({ focusComposerInput: () => false }));

vi.mock('@/lib/storage/chatStorageStatus', () => {
  const snapshot = {};
  return {
    clearChatStorageStatus: vi.fn(),
    getChatStorageStatusSnapshot: () => snapshot,
    subscribeChatStorageStatus: () => () => undefined,
  };
});

vi.mock('@/components/Chat/features/Input/ChatInput', () => ({
  ChatInput: () => <div data-testid="chat-input" />,
}));

vi.mock('@/components/Chat/features/Messages/MessageList', () => ({
  MessageList: (props: Record<string, unknown>) => {
    mocks.messageListProps(props);
    return <div data-testid="message-list" />;
  },
}));

vi.mock('@/components/Chat/layout/WelcomeScreen', () => ({
  WelcomeScreen: (props: Record<string, unknown>) => {
    mocks.welcomeProps(props);
    return <div data-testid="welcome-screen" />;
  },
}));

vi.mock('@/components/Chat/common/ChatShortcutsDialog', () => ({
  ChatShortcutsDialog: () => null,
}));
vi.mock('@/components/Chat/features/Messages/components/SelectionInsertButton', () => ({
  SelectionInsertButton: () => null,
}));
vi.mock('@/components/Chat/features/Temporary/TemporaryChatToggle', () => ({
  TemporaryChatToggle: () => <div data-testid="temporary-chat-toggle" />,
}));
vi.mock('@/components/Chat/features/Temporary/useTemporaryTogglePresentation', () => ({
  useTemporaryTogglePresentation: () => ({ showInChatArea: true, showInTitleBar: false }),
}));
vi.mock('./ChatEmbeddedHeader', () => ({ ChatEmbeddedHeader: () => null }));
vi.mock('./ChatEmbeddedSidebarOverlay', () => ({ ChatEmbeddedSidebarOverlay: () => null }));

import { ChatView } from './ChatView';

describe('ChatView presentation', () => {
  beforeEach(() => {
    mocks.chatState.currentSessionId = null;
    mocks.chatState.isMessagesLoaded = true;
    mocks.chatState.isSessionActive = false;
    mocks.chatState.messages = [];
    mocks.messageListProps.mockClear();
    mocks.welcomeProps.mockClear();
  });

  it('keeps overlay scrolling for the default desktop presentation', () => {
    const { container } = render(<ChatView />);

    const root = container.querySelector('[data-chat-view-mode="full"]');
    expect(root).toHaveAttribute('data-chat-presentation', 'desktop');
    expect(root).toHaveAttribute('data-chat-empty', 'true');
    expect(mocks.messageListProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ useOverlayScrollbar: true }),
    );
    expect(mocks.welcomeProps).toHaveBeenLastCalledWith({ presentation: 'desktop' });
  });

  it('uses native scrolling and stable mobile hooks without hiding temporary chat', () => {
    const { container, getByTestId } = render(<ChatView presentation="mobile" />);

    const root = container.querySelector('[data-chat-view-mode="full"]');
    expect(root).toHaveAttribute('data-chat-presentation', 'mobile');
    expect(root).toHaveAttribute('data-chat-empty', 'true');
    expect(mocks.messageListProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ useOverlayScrollbar: false }),
    );
    expect(mocks.welcomeProps).toHaveBeenLastCalledWith({ presentation: 'mobile' });
    expect(container.querySelector('[data-chat-temporary-toggle="true"]')).toContainElement(
      getByTestId('temporary-chat-toggle'),
    );
  });

  it('marks a loaded conversation as non-empty and removes the welcome screen', () => {
    mocks.chatState.currentSessionId = 'session-1';
    mocks.chatState.messages = [{ id: 'message-1', role: 'user', content: 'Hello' }];

    const { container, queryByTestId } = render(<ChatView presentation="mobile" />);

    expect(container.querySelector('[data-chat-view-mode="full"]')).toHaveAttribute(
      'data-chat-empty',
      'false',
    );
    expect(queryByTestId('welcome-screen')).not.toBeInTheDocument();
  });
});
