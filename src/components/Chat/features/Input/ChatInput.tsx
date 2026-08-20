import { memo, useCallback, useEffect, useRef } from 'react';
import { useFileTreePointerDragState } from '@/components/Notes/features/FileTree/hooks/fileTreePointerDragState';
import { actions as aiActions } from '@/stores/useAIStore';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { limitChatComposerText } from '@/lib/ui/composerTextLimit';
import { ChatInputComposerFrame } from './components/ChatInputComposerFrame';
import type { ChatInputProps } from './ChatInputTypes';
import { useChatAttachments } from './hooks/useChatAttachments';
import { useChatComposer } from './hooks/useChatComposer';
import { useChatHistoryNavigation } from './hooks/useChatHistoryNavigation';
import { useChatInputAttachmentUndo } from './hooks/useChatInputAttachmentUndo';
import { useChatInputBlockDrop } from './hooks/useChatInputBlockDrop';
import { useChatInputDroppedNoteMentions } from './hooks/useChatInputDroppedNoteMentions';
import { useChatInputEventHandlers } from './hooks/useChatInputEventHandlers';
import { useChatInputFileTreeDrop } from './hooks/useChatInputFileTreeDrop';
import { useChatInputCaretLayoutSync } from './hooks/useChatInputCaretLayoutSync';
import { useChatInputFocus } from './hooks/useChatInputFocus';
import { useChatInputRecall } from './hooks/useChatInputRecall';
import { useNoteMentions } from './hooks/useNoteMentions';
import { getWebSearchAvailability } from './webSearchAvailability';

export const ChatInput = memo(function ChatInput({
  active = true,
  onSend,
  onStop,
  onStopAndRecall,
  recalledDraft,
  onRecalledDraftConsumed,
  isLoading,
  hasSelectedModel,
  isManagedQuotaExhausted = false,
  focusTrigger,
  sessionId,
  sentUserMessages,
  acceptNotesBlockDrop = false,
}: ChatInputProps) {
  const lastSubmittedMessageRef = useRef('');
  const isFileTreeDragActive = useFileTreePointerDragState((state) => state.activeSourcePath !== null);
  const getDisplayName = useNotesStore((state) => state.getDisplayName);
  const webSearchEnabled = useUnifiedStore((state) => state.data.ai?.webSearchEnabled === true);
  const webSearchAvailable = useUnifiedStore((state) => getWebSearchAvailability(state.data.ai));
  useEffect(() => {
    if (webSearchEnabled && webSearchAvailable === false) {
      aiActions.setWebSearchEnabled(false);
    }
  }, [webSearchAvailable, webSearchEnabled]);
  const isQuotaSendBlocked = hasSelectedModel && isManagedQuotaExhausted;
  const {
    attachments,
    isDragging,
    fileInputRef,
    handlePaste,
    handleDrop: handleAttachmentDrop,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleFileChange,
    triggerFileSelect,
    removeAttachment,
    undoLastRemovedAttachment,
    discardRemovedAttachmentUndoStack,
    clearAttachments,
    clearDragState,
    restoreAttachments,
  } = useChatAttachments(active);

  const {
    message,
    isComposing,
    textareaRef,
    composerRootRef,
    markExplicitMultiline,
    handleMessageChange,
    handleSend,
    handleKeyDown,
    handleCompositionStart,
    handleCompositionEnd,
  } = useChatComposer({
    active,
    onSend: async (text, nextAttachments, nextNoteMentions) => {
      if (isLoading) {
        onStop();
      }
      const accepted = await onSend(text, nextAttachments, nextNoteMentions);
      if (accepted !== false) {
        lastSubmittedMessageRef.current = text;
      }
      return accepted;
    },
    attachments,
    getNoteMentions: () => getSynchronizedNoteMentions(),
    onAfterSend: () => {
      clearAttachments();
      clearNoteMentions();
    },
    canSubmit: hasSelectedModel,
    focusTrigger,
  });
  const {
    scheduleComposerFocus,
    scheduleFocusOnWindowFocus,
  } = useChatInputFocus(textareaRef);
  useChatInputCaretLayoutSync({
    composerRootRef,
    isComposing,
    message,
    textareaRef,
  });
  const handleRemoveAttachment = useCallback((attachmentId: string) => {
    const caretPosition = textareaRef.current?.selectionStart;
    removeAttachment(attachmentId);
    scheduleComposerFocus(caretPosition);
  }, [removeAttachment, scheduleComposerFocus, textareaRef]);

  const {
    noteMentions,
    hasMentionCandidates,
    clearNoteMentions,
    getSynchronizedNoteMentions,
    currentPageCandidates,
    folderCandidates,
    linkedPageCandidates,
    mentionPreviewParts,
    showMentionPicker,
    mentionPickerStatus,
    activeCandidatePath,
    textareaScrollTop,
    handleCaretChange,
    handleCaretBlur,
    handleMentionKeyDown,
    setTextareaScrollTop,
    applyMentionCandidate,
    removeNoteMention,
    appendNoteMentions,
    restoreNoteMentions,
  } = useNoteMentions({
    message,
    textareaRef,
    handleMessageChange,
  });

  const applyHistoryMessage = useCallback(
    (nextMessage: string) => {
      const limitedMessage = limitChatComposerText(nextMessage);
      if (limitedMessage.includes('\n')) {
        markExplicitMultiline();
      }
      handleMessageChange(limitedMessage);
      const nextCaret = limitedMessage.length;
      handleCaretChange(nextCaret);
      scheduleComposerFocus(nextCaret);
    },
    [handleCaretChange, handleMessageChange, markExplicitMultiline, scheduleComposerFocus]
  );

  const {
    resetHistoryNavigation,
    clearHistoryNavigationOnInput,
    handleHistoryKeyDown,
  } = useChatHistoryNavigation({
    message,
    sentUserMessages,
    showMentionPicker,
    applyHistoryMessage,
  });

  useEffect(() => {
    resetHistoryNavigation();
  }, [resetHistoryNavigation, sessionId]);

  const isBlockDropActive = useChatInputBlockDrop({
    acceptNotesBlockDrop,
    active,
    clearHistoryNavigationOnInput,
    composerRootRef,
    resetHistoryNavigation,
  });
  const isFileTreeDropActive = useChatInputFileTreeDrop({
    active,
    appendNoteMentions,
    clearHistoryNavigationOnInput,
    composerRootRef,
    getDisplayName,
    isFileTreeDragActive,
    resetHistoryNavigation,
  });

  useEffect(() => {
    if (message.length === 0) {
      resetHistoryNavigation();
    }
  }, [message, resetHistoryNavigation]);

  useChatInputAttachmentUndo({
    active,
    composerRootRef,
    scheduleComposerFocus,
    undoLastRemovedAttachment,
  });
  const { handleComposerDrop, handleComposerDropCapture } = useChatInputDroppedNoteMentions({
    active,
    appendNoteMentions,
    clearDragState,
    clearHistoryNavigationOnInput,
    getDisplayName,
    handleAttachmentDrop,
    resetHistoryNavigation,
  });

  const canSend =
    (!!message.trim() || attachments.length > 0 || noteMentions.length > 0) &&
    hasSelectedModel;
  const canSubmit = canSend && !isLoading;
  const {
    handleComposerChange,
    handleHiddenFileInputChange,
    handleTextareaKeyDown,
    handleTextareaPaste,
    handleTriggerFileSelect,
    handleTriggerMentionSelect,
  } = useChatInputEventHandlers({
    clearHistoryNavigationOnInput,
    discardRemovedAttachmentUndoStack,
    handleCaretChange,
    handleFileChange,
    handleHistoryKeyDown,
    handleKeyDown,
    handleMentionKeyDown,
    handleMessageChange,
    handlePaste,
    isComposing,
    markExplicitMultiline,
    message,
    scheduleComposerFocus,
    scheduleFocusOnWindowFocus,
    textareaRef,
    triggerFileSelect,
  });

  const { handleStopButton } = useChatInputRecall({
    attachmentsLength: attachments.length,
    clearHistoryNavigationOnInput,
    handleCaretChange,
    handleMessageChange,
    isQuotaSendBlocked,
    lastSubmittedMessageRef,
    markExplicitMultiline,
    message,
    noteMentionsLength: noteMentions.length,
    onRecalledDraftConsumed,
    onStop,
    onStopAndRecall,
    recalledDraft,
    restoreAttachments,
    restoreNoteMentions,
    scheduleComposerFocus,
  });
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;
  const handleSendAction = useCallback(() => {
    handleSendRef.current();
  }, []);
  const handleToggleWebSearch = useCallback(() => {
    aiActions.setWebSearchEnabled(!webSearchEnabled);
  }, [webSearchEnabled]);
  return (
      <ChatInputComposerFrame
      active={active}
      activeCandidatePath={activeCandidatePath}
      applyMentionCandidate={applyMentionCandidate}
      attachments={attachments}
      canSend={canSend}
      canSubmit={canSubmit}
      composerRootRef={composerRootRef}
      currentPageCandidates={currentPageCandidates}
      fileInputRef={fileInputRef}
      folderCandidates={folderCandidates}
      handleHiddenFileInputChange={handleHiddenFileInputChange}
      handleStopButton={handleStopButton}
      handleTextareaKeyDown={handleTextareaKeyDown}
      handleTextareaPaste={handleTextareaPaste}
      handleTriggerFileSelect={handleTriggerFileSelect}
      handleTriggerMentionSelect={handleTriggerMentionSelect}
      hasMentionCandidates={hasMentionCandidates}
      hasSelectedModel={hasSelectedModel}
      isBlockDropActive={isBlockDropActive}
      isDragging={isDragging}
      isFileTreeDropActive={isFileTreeDropActive}
      isLoading={isLoading}
      isQuotaSendBlocked={isQuotaSendBlocked}
      linkedPageCandidates={linkedPageCandidates}
      mentionPickerStatus={mentionPickerStatus}
      mentionPreviewParts={mentionPreviewParts}
      message={message}
      onCaretBlur={handleCaretBlur}
      onCaretChange={handleCaretChange}
      onComposerChange={handleComposerChange}
      onComposerDrop={handleComposerDrop}
      onComposerDropCapture={handleComposerDropCapture}
      onCompositionEnd={handleCompositionEnd}
      onCompositionStart={handleCompositionStart}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onRemoveAttachment={handleRemoveAttachment}
      onRemoveNoteMention={removeNoteMention}
      onRequestComposerFocus={scheduleComposerFocus}
      onSend={handleSendAction}
      onTextareaScroll={(e) => setTextareaScrollTop(e.currentTarget.scrollTop)}
      onToggleWebSearch={handleToggleWebSearch}
      showMentionPicker={showMentionPicker}
      textareaRef={textareaRef}
      textareaScrollTop={textareaScrollTop}
      webSearchEnabled={webSearchEnabled}
      webSearchAvailable={webSearchAvailable}
      />
  );
});
