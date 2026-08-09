import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { AnimatePresence } from 'framer-motion';
import { actions as aiActions } from '@/stores/useAIStore';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { useChatService } from '@/hooks/useChatService';
import { useMessageAutoscroll } from '@/hooks/useMessageAutoscroll';
import { useChatShortcuts } from './hooks/useChatShortcuts';
import { useComposerClickFocus } from './hooks/useComposerClickFocus';
import { useChatEmbeddedSidebar } from './hooks/useChatEmbeddedSidebar';
import { useChatViewFocusLifecycle } from './hooks/useChatViewFocusLifecycle';
import { useStableChatMessageDerivatives } from './hooks/useStableChatMessageDerivatives';
import { useChatViewStoreState } from './hooks/useChatViewStoreState';
import { useChatViewMessageActions } from './hooks/useChatViewMessageActions';
import { useChatViewModelSelection } from './hooks/useChatViewModelSelection';
import { useEmbeddedComposerInsert } from './hooks/useEmbeddedComposerInsert';
import { cn } from '@/lib/utils';
import type { Attachment } from '@/lib/storage/attachmentStorage';
import { focusComposerInput } from '@/lib/ui/composerFocusRegistry';
import type { NoteMentionReference } from '@/lib/ai/noteMentions';
import { useUIStore } from '@/stores/uiSlice';
import { useHeldPageScroll } from '@/hooks/useHeldPageScroll';
import { useI18n } from '@/lib/i18n';
import {
  clearChatStorageStatus,
  getChatStorageStatusSnapshot,
  subscribeChatStorageStatus,
} from '@/lib/storage/chatStorageStatus';

import { ChatInput } from '@/components/Chat/features/Input/ChatInput';
import { MessageList } from '@/components/Chat/features/Messages/MessageList';
import { SelectionInsertButton } from '@/components/Chat/features/Messages/components/SelectionInsertButton';
import { WelcomeScreen } from '@/components/Chat/layout/WelcomeScreen';
import { ChatShortcutsDialog } from '@/components/Chat/common/ChatShortcutsDialog';
import { TemporaryChatToggle } from '@/components/Chat/features/Temporary/TemporaryChatToggle';
import { useTemporaryTogglePresentation } from '@/components/Chat/features/Temporary/useTemporaryTogglePresentation';
import { estimateChatLoadingHeight } from '@/components/Chat/features/Layout/chatMessageLayout';
import { useManagedAIStore } from '@/stores/useManagedAIStore';
import { ChatEmbeddedHeader } from './ChatEmbeddedHeader';
import { ChatEmbeddedSidebarOverlay } from './ChatEmbeddedSidebarOverlay';
import { EMPTY_MODELS, EMPTY_PROVIDERS, type ChatViewProps } from './ChatViewState';
import { ChatErrorNotice } from './common/ChatErrorNotice';
import type { ChatMessageNavigationHandler } from './features/Messages/MessageListTypes';

export function ChatView({
  mode = 'full',
  presentation = 'desktop',
  active = true,
  onCloseEmbeddedPanel,
  onPromoteEmbeddedPanel,
  onStartupReady,
  onPrimaryContentReady,
}: ChatViewProps) {
  const { t } = useI18n();
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [focusInputTrigger, setFocusInputTrigger] = useState(0); 
  const messageNavigationRef = useRef<ChatMessageNavigationHandler | null>(null);
  const isEmbedded = mode === 'embedded';
  const isMobilePresentation = presentation === 'mobile';
  const {
    currentSessionId,
    isMessagesLoaded,
    isSessionActive,
    messages,
  } = useChatViewStoreState(active, isEmbedded);
  const providers = useUnifiedStore((s) => s.data.ai?.providers || EMPTY_PROVIDERS);
  const models = useUnifiedStore((s) => s.data.ai?.models || EMPTY_MODELS);
  const selectedModelId = useUnifiedStore((s) => s.data.ai?.selectedModelId || null);
  const managedBudget = useManagedAIStore((state) => state.budget);
  const chatStorageStatuses = useSyncExternalStore(
    subscribeChatStorageStatus,
    getChatStorageStatusSnapshot,
    getChatStorageStatusSnapshot,
  );
  const hasStorageError = !!currentSessionId && chatStorageStatuses[currentSessionId] === 'saveFailed';

  const loaded = useUnifiedStore(s => s.loaded);
  const pendingComposerInsert = useUIStore((state) => state.pendingNotesChatComposerInsert);
  const consumePendingComposerInsert = useUIStore((state) => state.consumePendingNotesChatComposerInsert);

  const { imageGallery, sentUserMessages } = useStableChatMessageDerivatives(
    messages,
    isSessionActive,
  );
  const { isSelectedManagedQuotaExhausted, selectedModel } = useChatViewModelSelection({
    managedBudget,
    models,
    providers,
    selectedModelId,
  });
  
  useEffect(() => {
    if (currentSessionId && !isMessagesLoaded) {
      aiActions.switchSession(currentSessionId);
    }
  }, [currentSessionId, isMessagesLoaded]);

  const {
    sendMessage,
    regenerate,
    editMessage,
    switchMessageVersion,
    stop,
    stopAndRecallLastUserMessage,
    recalledComposerDraft,
    clearRecalledComposerDraft,
  } = useChatService(active);
  const lastMessage = messages[messages.length - 1];
  const showLoading = isSessionActive && (
      lastMessage?.role === 'user' ||
      (lastMessage?.role === 'assistant' && (!lastMessage.content || !lastMessage.content.trim()))
  );
  
  const isEmpty = !currentSessionId || (isMessagesLoaded && messages.length === 0);
  const { showInChatArea, showInTitleBar } = useTemporaryTogglePresentation();
  const showEmbeddedTemporaryToggle = isEmbedded && (showInChatArea || showInTitleBar);

  const { containerRef, currentTurnTopSpacerHeight, handleEditMessage, handleNewUserMessage, handleRegenerateMessage, spacerHeight } = useMessageAutoscroll({
      active,
      messages,
      isStreaming: isSessionActive,
      chatId: currentSessionId,
      showLoading,
      estimateLoadingHeight: estimateChatLoadingHeight,
  });
  useHeldPageScroll(containerRef, {
    enabled: active && !isMobilePresentation,
    ignoreEditableTargets: true,
  });

  useChatViewFocusLifecycle({
    active,
    currentSessionId,
    isEmbedded,
    loaded,
    onPrimaryContentReady,
    onStartupReady,
    setFocusInputTrigger,
  });

  useEmbeddedComposerInsert({
    active,
    consumePendingComposerInsert,
    isEmbedded,
    pendingComposerInsert,
  });

  const handleFocusInput = useCallback(() => {
    if (!focusComposerInput()) {
      setFocusInputTrigger(n => n + 1);
    }
  }, []);
  const handleNavigateMessages = useCallback((direction: 'prev' | 'next') => {
    messageNavigationRef.current?.(direction);
  }, []);
  const handleToggleShortcuts = useCallback(() => {
    setIsShortcutsOpen(prev => !prev);
  }, []);

  useEffect(() => {
    if (!active) {
      setIsShortcutsOpen(false);
    }
  }, [active]);

  useChatShortcuts({
    onFocusInput: handleFocusInput,
    onNavigateMessages: handleNavigateMessages,
    onToggleShortcuts: handleToggleShortcuts,
    onStopGeneration: stop,
    isGenerating: isSessionActive,
  }, active && !isEmbedded && !isMobilePresentation);

  const {
    copyToClipboard,
    getImageGallery,
    handleEdit,
    handleFork,
    handleRegenerate,
    handleSwitchVersion,
  } = useChatViewMessageActions({
    currentSessionId,
    editMessage,
    imageGallery,
    onBeforeEdit: handleEditMessage,
    onBeforeRegenerate: handleRegenerateMessage,
    regenerate,
    switchMessageVersion,
  });

  const handleSend = useCallback(async (text: string, attachments: Attachment[], noteMentions: NoteMentionReference[]) => {
      return new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (accepted: boolean) => {
          if (settled) {
            return;
          }
          settled = true;
          if (accepted) {
            handleNewUserMessage();
          }
          resolve(accepted);
        };

        void sendMessage(text, attachments, noteMentions, settle)
          .then((started) => {
            if (started === false) {
              settle(false);
            }
          })
          .catch(() => settle(false));
      });
  }, [handleNewUserMessage, sendMessage]);

  const handleChatAreaMouseDownCapture = useComposerClickFocus({
    requestFocusFallback: () => {
      setFocusInputTrigger(n => n + 1);
    }
  });

  const {
    closeEmbeddedSidebar,
    handleEmbeddedSidebarExitComplete,
    isEmbeddedSidebarOpen,
    openEmbeddedSidebar,
  } = useChatEmbeddedSidebar({
    active,
    isEmbedded,
    isSessionActive,
    stop,
  });

  if (!loaded) return null;

  return (
    <div
      data-chat-view-mode={mode}
      data-chat-presentation={presentation}
      data-chat-empty={isEmpty ? 'true' : 'false'}
      data-notes-block-drop-target={isEmbedded ? 'true' : undefined}
      data-file-tree-chat-drop-target={isEmbedded ? 'true' : undefined}
      className="h-full w-full flex flex-col relative overflow-hidden"
      onMouseDownCapture={handleChatAreaMouseDownCapture}
    >
      {isEmbedded && active && (
        <ChatEmbeddedHeader
          onCloseEmbeddedPanel={onCloseEmbeddedPanel}
          onOpenEmbeddedSidebar={openEmbeddedSidebar}
          onPromoteEmbeddedPanel={onPromoteEmbeddedPanel}
          showEmbeddedTemporaryToggle={showEmbeddedTemporaryToggle}
          showInTitleBar={showInTitleBar}
        />
      )}

      <AnimatePresence onExitComplete={handleEmbeddedSidebarExitComplete}>
        {isEmbedded && isEmbeddedSidebarOpen && (
          <ChatEmbeddedSidebarOverlay
            isOpen={isEmbeddedSidebarOpen}
            onClose={closeEmbeddedSidebar}
          />
        )}
      </AnimatePresence>

      {!isEmbedded && showInChatArea && (
        <div
          data-chat-temporary-toggle="true"
          className={cn(
            "absolute right-4 z-[var(--vlaina-z-30)] translate-x-[var(--vlaina-window-resize-compensation-x)] pointer-events-auto",
            "top-3"
          )}
        >
          <TemporaryChatToggle />
        </div>
      )}

      <MessageList 
          active={active}
          chatId={currentSessionId}
          messages={messages}
          getImageGallery={getImageGallery}
          isSessionActive={isSessionActive}
          showLoading={showLoading}
          isLayoutCentered={isEmpty}
          useOverlayScrollbar={!isMobilePresentation}
          showMessageOutline={!isEmbedded}
          currentTurnTopSpacerHeight={currentTurnTopSpacerHeight}
          spacerHeight={spacerHeight}
          containerRef={containerRef}
          navigationRef={messageNavigationRef}
          onCopy={copyToClipboard}
          onFork={handleFork}
          onRegenerate={handleRegenerate}
          onEdit={handleEdit}
          onSwitchVersion={handleSwitchVersion}
      />

      <div 
          data-chat-input-region="true"
          className={cn(
              "w-full z-[var(--vlaina-z-10)] flex flex-col",
              isEmpty ? "flex-1 justify-center items-center" : "flex-none pb-6"
          )}
      >
          {isEmpty ? <WelcomeScreen presentation={presentation} /> : null}

          <div 
            className="w-full max-w-[var(--vlaina-size-850px)] mx-auto px-4 pointer-events-auto"
          >
              {hasStorageError && currentSessionId && (
                <div className="mb-2">
                  <ChatErrorNotice
                    closeLabel={t('common.close')}
                    message={t('storage.saveFailed')}
                    onDismiss={() => clearChatStorageStatus(currentSessionId)}
                  />
                </div>
              )}
              <ChatInput 
                active={active}
                onSend={handleSend} 
                onStop={stop}
                onStopAndRecall={stopAndRecallLastUserMessage}
                recalledDraft={recalledComposerDraft}
                onRecalledDraftConsumed={clearRecalledComposerDraft}
                isLoading={isSessionActive} 
                hasSelectedModel={!!selectedModel}
                isManagedQuotaExhausted={isSelectedManagedQuotaExhausted}
                focusTrigger={focusInputTrigger}
                sessionId={currentSessionId}
                sentUserMessages={sentUserMessages}
                acceptNotesBlockDrop={isEmbedded}
              />
          </div>
      </div>
      
      {!isEmbedded && !isMobilePresentation && active && (
        <ChatShortcutsDialog
          isOpen={isShortcutsOpen}
          onOpenChange={setIsShortcutsOpen}
        />
      )}
      {!isEmbedded && !isMobilePresentation && active && <SelectionInsertButton />}
    </div>
  );
}
