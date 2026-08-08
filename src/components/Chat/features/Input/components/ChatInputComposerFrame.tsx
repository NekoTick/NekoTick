import { useEffect, useRef } from 'react';
import type {
  ChangeEvent,
  ClipboardEvent,
  ComponentProps,
  CompositionEvent,
  DragEvent,
  KeyboardEvent,
  RefObject,
  UIEvent,
} from 'react';
import { cn } from '@/lib/utils';
import {
  SUPPORTED_ATTACHMENT_INPUT_ACCEPT,
  type Attachment,
} from '@/lib/storage/attachmentStorage';
import { useI18n } from '@/lib/i18n/useI18n';
import { chatComposerFrameClass, chatComposerSurfaceClass } from '../composerStyles';
import { ChatAttachmentPreviewList } from './ChatAttachmentPreviewList';
import { ChatComposerField } from './ChatComposerField';
import { ChatInputActions } from './ChatInputActions';
import { ManagedQuotaNotice, managedQuotaNoticeFrameClass } from './ManagedQuotaNotice';
import { NoteMentionPicker } from './NoteMentionPicker';
import type { NoteMentionCandidate } from '../noteMentionHelpers';
import { ComputerCommandApprovalNotice } from '@/components/Chat/features/ComputerUse/ComputerCommandApprovalNotice';
import {
  isComputerCommandApprovalForSession,
  usePendingComputerCommandApprovals,
} from '@/lib/ai/computerUse/approvalState';
import { useWebSearchQuotaStore } from '@/stores/useWebSearchQuotaStore';

interface ChatInputComposerFrameProps {
  active: boolean;
  activeCandidatePath: string | null;
  applyMentionCandidate: (candidate: NoteMentionCandidate) => void;
  attachments: Attachment[];
  canSend: boolean;
  canSubmit: boolean;
  computerUseAvailable: boolean;
  computerUseEnabled: boolean;
  composerRootRef: RefObject<HTMLDivElement | null>;
  currentPageCandidates: NoteMentionCandidate[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  folderCandidates: NoteMentionCandidate[];
  handleHiddenFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleStopButton: () => void;
  handleTextareaKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  handleTextareaPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  handleTriggerFileSelect: () => void;
  handleTriggerMentionSelect: () => void;
  hasMentionCandidates: boolean;
  hasSelectedModel: boolean;
  isBlockDropActive: boolean;
  isDragging: boolean;
  isFileTreeDropActive: boolean;
  isLoading: boolean;
  isQuotaSendBlocked: boolean;
  linkedPageCandidates: NoteMentionCandidate[];
  mentionPickerStatus: ComponentProps<typeof NoteMentionPicker>['status'];
  mentionPreviewParts: ComponentProps<typeof ChatComposerField>['mentionPreviewParts'];
  message: string;
  onCaretBlur: () => void;
  onCaretChange: (start: number, end?: number) => void;
  onComposerChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onComposerDrop: (event: DragEvent<HTMLDivElement>) => void | Promise<void>;
  onComposerDropCapture: (event: DragEvent<HTMLDivElement>) => void;
  onDisableComputerUse: () => void;
  onCompositionEnd: (event: CompositionEvent<HTMLTextAreaElement>) => void;
  onCompositionStart: (event: CompositionEvent<HTMLTextAreaElement>) => void;
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onRemoveNoteMention: (path: string) => void;
  onRequestComposerFocus: (position?: number) => void;
  onRequestEnableComputerUse: () => void;
  onSend: () => void;
  onTextareaScroll: (event: UIEvent<HTMLTextAreaElement>) => void;
  onToggleWebSearch: () => void;
  showMentionPicker: boolean;
  showComputerCommandApproval: boolean;
  sessionId?: string | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  textareaScrollTop: number;
  webSearchEnabled: boolean;
  webSearchAvailable?: boolean;
}

export function ChatInputComposerFrame({
  active,
  activeCandidatePath,
  applyMentionCandidate,
  attachments,
  canSend,
  canSubmit,
  computerUseAvailable,
  computerUseEnabled,
  composerRootRef,
  currentPageCandidates,
  fileInputRef,
  folderCandidates,
  handleHiddenFileInputChange,
  handleStopButton,
  handleTextareaKeyDown,
  handleTextareaPaste,
  handleTriggerFileSelect,
  handleTriggerMentionSelect,
  hasMentionCandidates,
  hasSelectedModel,
  isBlockDropActive,
  isDragging,
  isFileTreeDropActive,
  isLoading,
  isQuotaSendBlocked,
  linkedPageCandidates,
  mentionPickerStatus,
  mentionPreviewParts,
  message,
  onCaretBlur,
  onCaretChange,
  onComposerChange,
  onComposerDrop,
  onComposerDropCapture,
  onDisableComputerUse,
  onCompositionEnd,
  onCompositionStart,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onRemoveAttachment,
  onRemoveNoteMention,
  onRequestComposerFocus,
  onRequestEnableComputerUse,
  onSend,
  onTextareaScroll,
  onToggleWebSearch,
  showMentionPicker,
  showComputerCommandApproval,
  sessionId,
  textareaRef,
  textareaScrollTop,
  webSearchEnabled,
  webSearchAvailable = true,
}: ChatInputComposerFrameProps) {
  const { t } = useI18n();
  const pendingComputerCommandApprovals = usePendingComputerCommandApprovals();
  const sessionComputerCommandApprovals = pendingComputerCommandApprovals.filter(
    (approval) => isComputerCommandApprovalForSession(approval, sessionId),
  );
  const hasComputerCommandApproval = showComputerCommandApproval &&
    sessionComputerCommandApprovals.length > 0;
  const isWebSearchQuotaExhausted = useWebSearchQuotaStore((state) => state.exhausted);
  const hasComposerNotice = isQuotaSendBlocked || isWebSearchQuotaExhausted || hasComputerCommandApproval;
  const previousApprovalCountRef = useRef(sessionComputerCommandApprovals.length);

  useEffect(() => {
    const previousApprovalCount = previousApprovalCountRef.current;
    previousApprovalCountRef.current = sessionComputerCommandApprovals.length;
    if (
      showComputerCommandApproval &&
      previousApprovalCount > 0 &&
      sessionComputerCommandApprovals.length === 0
    ) {
      onRequestComposerFocus();
    }
  }, [
    onRequestComposerFocus,
    sessionComputerCommandApprovals.length,
    showComputerCommandApproval,
  ]);

  return (
    <>
      <input
        type="file"
        spellCheck={false}
        tabIndex={-1}
        multiple
        accept={SUPPORTED_ATTACHMENT_INPUT_ACCEPT}
        className="sr-only"
        ref={fileInputRef}
        onChange={handleHiddenFileInputChange}
      />

      <div className="relative z-[var(--vlaina-z-10)]">
        {hasComputerCommandApproval ? (
          <div
            data-computer-command-approval-frame="true"
            className={cn(
              managedQuotaNoticeFrameClass,
              'pointer-events-auto absolute inset-x-0 bottom-[var(--vlaina-offset-computer-command-approval)] z-[var(--vlaina-z-0)] pb-[var(--vlaina-space-12px)]',
            )}
          >
            <ComputerCommandApprovalNotice sessionId={sessionId} />
          </div>
        ) : null}
        <div className={cn((isQuotaSendBlocked || isWebSearchQuotaExhausted) && managedQuotaNoticeFrameClass)}>
          <div
            data-chat-input="true"
            ref={composerRootRef}
            className={cn(
              'relative z-[var(--vlaina-z-10)]',
              chatComposerFrameClass,
              chatComposerSurfaceClass,
              hasComposerNotice && [
                '!shadow-none',
                'hover:!shadow-none',
              ]
            )}
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDropCapture={onComposerDropCapture}
            onDrop={onComposerDrop}
          >
          {(isDragging || isBlockDropActive || isFileTreeDropActive) && (
            <div
              className={cn(
                "absolute inset-0 z-[var(--vlaina-z-20)] flex items-center justify-center rounded-[var(--vlaina-radius-26px)] border-2 border-dashed backdrop-blur-[var(--vlaina-backdrop-blur-sm)] pointer-events-none",
                isBlockDropActive || isFileTreeDropActive
                  ? "border-[var(--vlaina-color-accent)] bg-[var(--vlaina-color-accent-soft)]"
                  : "border-[var(--vlaina-color-subtle-border-strong)] bg-[var(--vlaina-color-overlay-weak)]"
              )}
            >
              <span
                className={cn(
                  "font-medium",
                  isBlockDropActive || isFileTreeDropActive
                    ? "text-[var(--vlaina-color-accent)]"
                    : "text-[var(--vlaina-sidebar-chat-text-muted)]"
                )}
              >
                {isBlockDropActive ? t('chat.dropBlocksHere') : t('chat.dropFilesHere')}
              </span>
            </div>
          )}

          <div className="flex flex-col px-1 w-full">
            {showMentionPicker && (
              <NoteMentionPicker
                currentPageCandidates={currentPageCandidates}
                folderCandidates={folderCandidates}
                linkedPageCandidates={linkedPageCandidates}
                activeCandidatePath={activeCandidatePath}
                status={mentionPickerStatus}
                onSelect={applyMentionCandidate}
              />
            )}

            <ChatAttachmentPreviewList attachments={attachments} onRemove={onRemoveAttachment} />

            <ChatComposerField
              textareaRef={textareaRef}
              message={message}
              ariaLabel={t('chat.composerPlaceholder')}
              onChange={onComposerChange}
              onCompositionStart={onCompositionStart}
              onCompositionEnd={onCompositionEnd}
              onKeyDown={handleTextareaKeyDown}
              onSelect={(e) => onCaretChange(e.currentTarget.selectionStart ?? 0,
                e.currentTarget.selectionEnd ?? e.currentTarget.selectionStart ?? 0)}
              onClick={(e) => onCaretChange(e.currentTarget.selectionStart ?? 0,
                e.currentTarget.selectionEnd ?? e.currentTarget.selectionStart ?? 0)}
              onBlur={onCaretBlur}
              onPaste={handleTextareaPaste}
              onScroll={onTextareaScroll}
              placeholder={!hasSelectedModel ? t('chat.selectModelPlaceholder') : t('chat.composerPlaceholder')}
              mentionPreviewParts={mentionPreviewParts}
              textareaScrollTop={textareaScrollTop}
              onFocusMentionEnd={onCaretChange}
              onRemoveMention={onRemoveNoteMention}
            />

            <ChatInputActions
              onTriggerFileSelect={handleTriggerFileSelect}
              onTriggerMentionSelect={handleTriggerMentionSelect}
              hasMentionCandidates={hasMentionCandidates}
              isLoading={isLoading}
              canSend={canSend}
              canSubmit={canSubmit}
              showSendReadyState={!isQuotaSendBlocked && canSend}
              webSearchEnabled={webSearchEnabled}
              webSearchAvailable={webSearchAvailable}
              onToggleWebSearch={onToggleWebSearch}
              computerUseAvailable={computerUseAvailable}
              computerUseEnabled={computerUseEnabled}
              onRequestEnableComputerUse={onRequestEnableComputerUse}
              onDisableComputerUse={onDisableComputerUse}
              onRequestComposerFocus={onRequestComposerFocus}
              onStop={handleStopButton}
              onSend={onSend}
              disabled={!active}
            />
          </div>
          </div>
          {isQuotaSendBlocked ? (
            <ManagedQuotaNotice />
          ) : isWebSearchQuotaExhausted ? (
            <ManagedQuotaNotice messageKey="chat.webSearchQuotaExhausted" />
          ) : null}
        </div>
      </div>
    </>
  );
}
