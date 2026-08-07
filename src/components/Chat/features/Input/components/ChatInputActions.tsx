import { memo, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn, iconButtonStyles } from '@/lib/utils';
import { ghostIconButtonClass, raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { getSidebarIdleRowSurfaceClass } from '@/components/layout/sidebar/sidebarLabelStyles';
import { useI18n } from '@/lib/i18n';

interface ChatInputActionsProps {
  onTriggerFileSelect: () => void;
  onTriggerMentionSelect: () => void;
  hasMentionCandidates: boolean;
  isLoading: boolean;
  canSend: boolean;
  canSubmit: boolean;
  showSendReadyState?: boolean;
  webSearchEnabled: boolean;
  webSearchAvailable?: boolean;
  onToggleWebSearch: () => void;
  computerUseAvailable?: boolean;
  computerUseEnabled?: boolean;
  onRequestEnableComputerUse?: () => void;
  onDisableComputerUse?: () => void;
  onRequestComposerFocus: () => void;
  onStop: () => void;
  onSend: () => void;
  disabled?: boolean;
}

export const ChatInputActions = memo(function ChatInputActions({
  onTriggerFileSelect,
  onTriggerMentionSelect,
  hasMentionCandidates,
  isLoading,
  canSend,
  canSubmit,
  showSendReadyState,
  webSearchEnabled,
  webSearchAvailable = true,
  onToggleWebSearch,
  computerUseAvailable = false,
  computerUseEnabled = false,
  onRequestEnableComputerUse = () => {},
  onDisableComputerUse = () => {},
  onRequestComposerFocus,
  onStop,
  onSend,
  disabled = false,
}: ChatInputActionsProps) {
  const { t } = useI18n();
  const [actionsOpen, setActionsOpen] = useState(false);
  const restoreComposerFocusOnCloseRef = useRef(false);
  const shouldShowSendReadyState = showSendReadyState ?? canSend;

  useEffect(() => {
    if (disabled) {
      setActionsOpen(false);
    }
  }, [disabled]);

  const handleTriggerFileSelect = () => {
    if (disabled) return;
    restoreComposerFocusOnCloseRef.current = true;
    onTriggerFileSelect();
    setActionsOpen(false);
  };

  const handleTriggerMentionSelect = () => {
    if (disabled) return;
    restoreComposerFocusOnCloseRef.current = true;
    setActionsOpen(false);
    onTriggerMentionSelect();
  };

  const handleEnableWebSearch = () => {
    if (disabled) return;
    restoreComposerFocusOnCloseRef.current = true;
    setActionsOpen(false);
    if (!webSearchEnabled) {
      onToggleWebSearch();
    }
    onRequestComposerFocus();
  };

  const handleDisableWebSearch = () => {
    if (disabled) return;
    onToggleWebSearch();
    onRequestComposerFocus();
  };

  const handleEnableComputerUse = () => {
    if (disabled) return;
    restoreComposerFocusOnCloseRef.current = true;
    setActionsOpen(false);
    onRequestEnableComputerUse();
  };

  const handleDisableComputerUse = () => {
    if (disabled) return;
    onDisableComputerUse();
    onRequestComposerFocus();
  };

  return (
    <div className="flex items-center justify-between px-2 pb-2 pl-3">
      <div className="flex items-center gap-2">
        <Popover open={!disabled && actionsOpen} onOpenChange={setActionsOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t('chat.openActions')}
              data-chat-input-action="open-actions"
              disabled={disabled}
              className={cn(
                'w-9 h-9 flex items-center justify-center',
                iconButtonStyles,
                ghostIconButtonClass,
                '!bg-transparent !shadow-none text-[var(--vlaina-accent)] hover:!bg-[var(--vlaina-color-pill-surface-hover)] hover:!shadow-[var(--vlaina-shadow-menu-hover)] hover:text-[var(--vlaina-accent-hover)] active:scale-[var(--vlaina-scale-95)]',
                disabled && 'cursor-default opacity-[var(--vlaina-opacity-45)] hover:!bg-transparent hover:!shadow-none hover:text-[var(--vlaina-accent)] active:scale-[var(--vlaina-scale-100)]'
              )}
            >
              <Icon name="common.add" size="md" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="top"
            sideOffset={8}
            onCloseAutoFocus={(event) => {
              if (!restoreComposerFocusOnCloseRef.current) {
                return;
              }
              restoreComposerFocusOnCloseRef.current = false;
              event.preventDefault();
              onRequestComposerFocus();
            }}
            className={cn(
              "w-max min-w-52 rounded-[var(--vlaina-ui-radius-panel)] border-transparent p-1.5 text-[var(--vlaina-sidebar-chat-text)]",
              raisedPillSurfaceClass
            )}
          >
            {webSearchAvailable && !webSearchEnabled && (
              <button
                type="button"
                data-chat-input-action="enable-web-search"
                onClick={handleEnableWebSearch}
                className={cn(
                  "group/chat-action flex h-10 w-full items-center gap-2 rounded-[var(--vlaina-ui-radius-compact)] px-2.5 py-2 text-left text-[var(--vlaina-font-base)] font-medium whitespace-nowrap transition-colors",
                  "text-[var(--vlaina-sidebar-chat-text)] hover:bg-[var(--vlaina-sidebar-chat-row-hover)]",
                  getSidebarIdleRowSurfaceClass('chat')
                )}
              >
                <Icon name="file.public" size="md" className="text-[var(--vlaina-accent)]" />
                <span>{t('chat.webSearch')}</span>
              </button>
            )}
            {computerUseAvailable && !computerUseEnabled && (
              <button
                type="button"
                data-chat-input-action="enable-computer-use"
                onClick={handleEnableComputerUse}
                className={cn(
                  "group/chat-action flex h-10 w-full items-center gap-2 rounded-[var(--vlaina-ui-radius-compact)] px-2.5 py-2 text-left text-[var(--vlaina-font-base)] font-medium whitespace-nowrap transition-colors",
                  "text-[var(--vlaina-sidebar-chat-text)] hover:bg-[var(--vlaina-sidebar-chat-row-hover)]",
                  getSidebarIdleRowSurfaceClass('chat')
                )}
              >
                <Icon name="editor.keyboard" size="md" className="text-[var(--vlaina-accent)]" />
                <span>{t('chat.computerUse')}</span>
              </button>
            )}
            {hasMentionCandidates && (
              <button
                type="button"
                data-chat-input-action="mention"
                onClick={handleTriggerMentionSelect}
                className={cn(
                  "group/chat-action flex h-10 w-full items-center gap-2 rounded-[var(--vlaina-ui-radius-compact)] px-2.5 py-2 text-left text-[var(--vlaina-font-base)] font-medium whitespace-nowrap transition-colors",
                  "text-[var(--vlaina-sidebar-chat-text)] hover:bg-[var(--vlaina-sidebar-chat-row-hover)]",
                  getSidebarIdleRowSurfaceClass('chat')
                )}
              >
                <span className="flex size-5 items-center justify-center text-[var(--vlaina-font-h6)] font-semibold leading-none !text-[var(--vlaina-accent)]">@</span>
                <span>{t('chat.mentionFileOrFolder')}</span>
              </button>
            )}
            <button
              type="button"
              data-chat-input-action="upload"
              onClick={handleTriggerFileSelect}
              className={cn(
                "group/chat-action flex h-10 w-full items-center gap-2 rounded-[var(--vlaina-ui-radius-compact)] px-2.5 py-2 text-left text-[var(--vlaina-font-base)] font-medium whitespace-nowrap transition-colors",
                "text-[var(--vlaina-sidebar-chat-text)] hover:bg-[var(--vlaina-sidebar-chat-row-hover)]",
                getSidebarIdleRowSurfaceClass('chat')
              )}
            >
              <Icon name="file.attach" size="md" className="text-[var(--vlaina-accent)]" />
              <span>{t('chat.uploadFile')}</span>
            </button>
          </PopoverContent>
        </Popover>
        {webSearchAvailable && webSearchEnabled && (
          <button
            type="button"
            aria-pressed="true"
            aria-label={t('chat.disableWebSearch')}
            data-chat-input-action="disable-web-search"
            onClick={handleDisableWebSearch}
            disabled={disabled}
            className={cn(
              "w-9 h-9 flex items-center justify-center rounded-full bg-[var(--vlaina-sidebar-chat-row-active)] text-[var(--vlaina-sidebar-row-selected-text)] transition-[background-color,color,transform] duration-[var(--vlaina-duration-200)] hover:bg-[var(--vlaina-sidebar-chat-row-active)] hover:text-[var(--vlaina-sidebar-row-selected-text)] active:scale-[var(--vlaina-scale-95)]",
              disabled && 'cursor-default opacity-[var(--vlaina-opacity-45)] active:scale-[var(--vlaina-scale-100)]'
            )}
          >
            <Icon name="file.public" size="md" />
          </button>
        )}
        {computerUseAvailable && computerUseEnabled && (
          <button
            type="button"
            aria-pressed="true"
            aria-label={t('chat.computerUse.disable')}
            data-chat-input-action="disable-computer-use"
            onClick={handleDisableComputerUse}
            disabled={disabled}
            className={cn(
              "w-9 h-9 flex items-center justify-center rounded-full bg-[var(--vlaina-sidebar-chat-row-active)] text-[var(--vlaina-sidebar-row-selected-text)] transition-[background-color,color,transform] duration-[var(--vlaina-duration-200)] hover:bg-[var(--vlaina-sidebar-chat-row-active)] hover:text-[var(--vlaina-sidebar-row-selected-text)] active:scale-[var(--vlaina-scale-95)]",
              disabled && 'cursor-default opacity-[var(--vlaina-opacity-45)] active:scale-[var(--vlaina-scale-100)]'
            )}
          >
            <Icon name="editor.keyboard" size="md" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isLoading ? (
          <button
            type="button"
            aria-label={t('shortcut.action.stopResponse')}
            data-chat-input-action="stop"
            onClick={onStop}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--vlaina-color-pill-surface-hover)] text-[var(--vlaina-accent)] shadow-[var(--vlaina-shadow-menu-hover)] transition-[color,box-shadow,transform] duration-[var(--vlaina-duration-200)] hover:text-[var(--vlaina-accent-hover)] hover:scale-[var(--vlaina-scale-105)] active:scale-[var(--vlaina-scale-95)]"
          >
            <Icon name="media.stop" size="md" />
          </button>
        ) : (
          <button
            type="button"
            aria-label={t('common.send')}
            data-chat-input-action="send"
            onClick={onSend}
            disabled={disabled || !canSubmit}
            className={cn(
              'w-9 h-9 rounded-full flex items-center justify-center transition-[background-color,color,box-shadow,opacity,transform] duration-[var(--vlaina-duration-200)]',
              !disabled && canSubmit
                ? 'bg-[var(--vlaina-color-pill-surface-hover)] text-[var(--vlaina-accent)] shadow-[var(--vlaina-shadow-menu-hover)] hover:text-[var(--vlaina-accent-hover)] hover:scale-[var(--vlaina-scale-105)] active:scale-[var(--vlaina-scale-95)]'
                : shouldShowSendReadyState
                  ? 'bg-[var(--vlaina-color-pill-surface-hover)] text-[var(--vlaina-accent)] opacity-[var(--vlaina-opacity-60)] shadow-[var(--vlaina-shadow-menu-hover)] cursor-default'
                  : 'bg-[var(--vlaina-color-pill-surface-hover)] text-[var(--vlaina-accent)] opacity-[var(--vlaina-opacity-45)] shadow-[var(--vlaina-shadow-menu-hover)] cursor-default'
            )}
          >
            <Icon name="common.send" size="md" />
          </button>
        )}
      </div>
    </div>
  );
});
