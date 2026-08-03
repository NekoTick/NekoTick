import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { actions as aiActions } from '@/stores/useAIStore';
import { useAIUIStore } from '@/stores/ai/chatState';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { useUIStore } from '@/stores/uiSlice';
import {
  ChatSidebarHoverEmptyHint,
  ChatSidebarList,
  ChatSidebarScrollArea,
  ChatSidebarSurface,
} from './ChatSidebarPrimitives';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { focusComposerInput } from '@/lib/ui/composerFocusRegistry';
import { ChatSidebarTopActions } from './ChatSidebarTopActions';
import { SidebarSearchDrawer } from '@/components/layout/sidebar/SidebarSearchDrawer';
import {
  SidebarCapsulePanel,
  SIDEBAR_CAPSULE_SCROLLBAR_INSET_RIGHT,
} from '@/components/layout/sidebar/SidebarPrimitives';
import { ChatSidebarVirtualList } from './ChatSidebarVirtualList';
import { useChatSidebarSearch } from './useChatSidebarSearch';
import { useI18n } from '@/lib/i18n';
import type { ChatSession } from '@/lib/ai/types';

interface ChatSidebarProps {
  isPeeking?: boolean;
  embedded?: boolean;
  active?: boolean;
  onRequestClose?: () => void;
}

const EMPTY_CHAT_SESSIONS: ChatSession[] = [];

function scheduleComposerFocusAfterSidebarAction() {
  requestAnimationFrame(() => {
    if (focusComposerInput()) {
      return;
    }
    requestAnimationFrame(() => {
      focusComposerInput();
    });
  });
}

export const ChatSidebar = memo(function ChatSidebar({
  isPeeking = false,
  embedded = false,
  active,
  onRequestClose,
}: ChatSidebarProps) {
  const { t } = useI18n();
  const appViewMode = useUIStore((state) => state.appViewMode);
  const isActive = embedded || (active ?? appViewMode === 'chat');
  const activeSessions = useUnifiedStore((state) =>
    isActive ? state.data.ai?.sessions || EMPTY_CHAT_SESSIONS : EMPTY_CHAT_SESSIONS
  );
  const activeCurrentSessionId = useAIUIStore((state) => isActive ? state.currentSessionId : null);
  const markSessionRead = useAIUIStore((state) => state.markSessionRead);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const sidebarRootRef = useRef<HTMLDivElement | null>(null);
  const lastActiveSessionsRef = useRef<ChatSession[]>(EMPTY_CHAT_SESSIONS);
  const lastActiveCurrentSessionIdRef = useRef<string | null>(null);

  if (isActive) {
    lastActiveSessionsRef.current = activeSessions;
    lastActiveCurrentSessionIdRef.current = activeCurrentSessionId;
  }

  const sessions = isActive ? activeSessions : lastActiveSessionsRef.current;
  const currentSessionId = isActive ? activeCurrentSessionId : lastActiveCurrentSessionIdRef.current;
  const deleteSession = useMemo(
    () => deleteId ? sessions.find((session) => session.id === deleteId) ?? null : null,
    [deleteId, sessions],
  );
  const {
    inputRef: searchInputRef,
    scrollRootRef,
    hideSearch,
    shouldShowSearchResults,
    isSearchOpen,
    searchQuery,
    deferredSearchQuery,
    setSearchQuery,
    filteredSessions,
    selectedSearchSession,
    selectPreviousSearchResult,
    selectNextSearchResult,
    hasSessions,
    sessionsToRender,
  } = useChatSidebarSearch({
    enabled: isActive,
    scopeRef: sidebarRootRef,
    sessions,
  });

  useEffect(() => {
    if (isActive) {
      return;
    }

    setDeleteId(null);
    setRenamingSessionId(null);
    setRenameDraft('');
  }, [isActive]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const handleDeleteChat = (event: Event) => {
      const customEvent = event as CustomEvent<{ id?: string }>;
      if (customEvent.detail?.id) {
        setDeleteId(customEvent.detail.id);
      }
    };

    window.addEventListener('app-delete-chat', handleDeleteChat);
    return () => {
      window.removeEventListener('app-delete-chat', handleDeleteChat);
    };
  }, [isActive]);

  const handleRename = useCallback((sessionId: string, currentTitle: string) => {
    setRenamingSessionId(sessionId);
    setRenameDraft(currentTitle || t('chat.newChatTitle'));
  }, [t]);

  const cancelRename = useCallback(() => {
    setRenamingSessionId(null);
    setRenameDraft('');
  }, []);

  const commitRename = useCallback((sessionId: string, originalTitle: string) => {
    const nextTitle = renameDraft.trim();
    if (!nextTitle) {
      cancelRename();
      return;
    }
    if (nextTitle !== originalTitle) {
      aiActions.updateSession(sessionId, { title: nextTitle });
    }
    cancelRename();
  }, [cancelRename, renameDraft]);

  const handleTogglePin = useCallback((sessionId: string, isPinned?: boolean) => {
    aiActions.updateSession(sessionId, { isPinned: !isPinned });
  }, []);

  const handleSwitch = useCallback((sessionId: string, isUnread: boolean) => {
    if (isUnread) {
      markSessionRead(sessionId);
    }
    void Promise.resolve(aiActions.switchSession(sessionId)).catch(() => undefined);
    onRequestClose?.();
  }, [markSessionRead, onRequestClose]);

  const handleOpenNewChat = useCallback(() => {
    aiActions.openNewChat();
    onRequestClose?.();
    scheduleComposerFocusAfterSidebarAction();
  }, [onRequestClose]);

  const handleRenameDraftChange = useCallback((value: string) => {
    setRenameDraft(value);
  }, []);

  const handleRequestDelete = useCallback((sessionId: string) => {
    setDeleteId(sessionId);
  }, []);

  return (
    <>
      <ChatSidebarSurface ref={sidebarRootRef} isPeeking={isPeeking}>
        <SidebarSearchDrawer
          isSearchOpen={isSearchOpen}
          shouldShowTopActions={false}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          inputRef={searchInputRef}
          hideSearch={hideSearch}
          canSubmit={Boolean(selectedSearchSession)}
          onSubmit={() => {
            const session = selectedSearchSession;
            if (!session) {
              return;
            }
            handleSwitch(session.id, !!useAIUIStore.getState().unreadSessions[session.id]);
            hideSearch();
          }}
          canSelectPrevious={filteredSessions.length > 0}
          canSelectNext={filteredSessions.length > 0}
          onSelectPrevious={selectPreviousSearchResult}
          onSelectNext={selectNextSearchResult}
          placeholder=""
          closeLabel={t('sidebar.closeChatSearch')}
          topActions={null}
        />

        <SidebarCapsulePanel>
          {!shouldShowSearchResults ? (
            <ChatSidebarTopActions
              onOpenNewChat={handleOpenNewChat}
              showAppViewModeSwitch={!embedded}
            />
          ) : null}

          <ChatSidebarScrollArea
            ref={scrollRootRef}
            className="pt-0"
            scrollbarInsetRight={SIDEBAR_CAPSULE_SCROLLBAR_INSET_RIGHT}
          >
            <div className="relative min-h-full">
              {shouldShowSearchResults && filteredSessions.length === 0 ? null : !shouldShowSearchResults && !hasSessions ? null : (
                <ChatSidebarList>
                  <ChatSidebarVirtualList
                    active={isActive}
                    sessions={sessionsToRender}
                    currentSessionId={currentSessionId}
                    renamingSessionId={renamingSessionId}
                    renameDraft={renameDraft}
                    shouldHideSearchResults={shouldShowSearchResults}
                    scrollRootRef={scrollRootRef}
                    onRenameDraftChange={handleRenameDraftChange}
                    onStartRename={handleRename}
                    onCommitRename={commitRename}
                    onCancelRename={cancelRename}
                    onSwitch={handleSwitch}
                    onRequestDelete={handleRequestDelete}
                    onTogglePin={handleTogglePin}
                    onHideSearch={hideSearch}
                    resetKey={shouldShowSearchResults ? deferredSearchQuery.trim() : ''}
                    highlightedSessionId={shouldShowSearchResults ? selectedSearchSession?.id ?? null : null}
                  />
                </ChatSidebarList>
              )}
              {!shouldShowSearchResults && !hasSessions ? (
                <ChatSidebarHoverEmptyHint title={t('sidebar.noConversations')} />
              ) : null}
            </div>
          </ChatSidebarScrollArea>
        </SidebarCapsulePanel>
      </ChatSidebarSurface>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) {
            void Promise.resolve(aiActions.deleteSession(deleteId)).then(() => {
              scheduleComposerFocusAfterSidebarAction();
            }).catch(() => undefined);
          }
        }}
        title={t('sidebar.deleteChatTitle')}
        description={
          deleteSession
            ? t('sidebar.deleteItemDescription', { itemLabel: deleteSession.title || t('sidebar.newChat') })
            : t('sidebar.deleteChatDescription')
        }
        confirmText={t('sidebar.deleteChat')}
        variant="danger"
      />
    </>
  );
});
