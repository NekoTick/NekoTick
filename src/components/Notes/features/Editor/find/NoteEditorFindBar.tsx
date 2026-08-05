import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import type { NoteEditorFindController } from './types';
import { useI18n } from '@/lib/i18n';
import { themeMotionTokens } from '@/styles/themeTokens';
import {
  preventImageClipboardTextPaste,
  preventImageDataTransferTextDrop,
} from '@/lib/clipboardImagePayload';
import { requestNativeCaretOverlayRefresh } from '@/hooks/useNativeCaretOverlay';

interface NoteEditorFindBarProps {
  controller: NoteEditorFindController;
}

function FindToolbarButton({
  label,
  icon,
  onClick,
  disabled = false,
  active = false,
  className,
}: {
  label: string;
  icon: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-[var(--vlaina-notes-ui-radius-compact)] transition-all active:scale-[var(--vlaina-scale-90)]',
        active
          ? 'text-[var(--vlaina-color-status-info-fg)] bg-[var(--vlaina-color-status-info-bg)]'
          : 'text-[var(--vlaina-color-text-soft)] hover:bg-[var(--vlaina-hover)] hover:text-[var(--vlaina-color-text-strong)]',
        disabled && 'cursor-not-allowed opacity-[var(--vlaina-opacity-20)] hover:bg-transparent',
        className
      )}
    >
      <Icon name={icon as never} size="sm" />
    </button>
  );
}

export function NoteEditorFindBar({ controller }: NoteEditorFindBarProps) {
  const { t } = useI18n();
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!controller.isOpen) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (containerRef.current?.contains(target)) {
        return;
      }

      controller.close(false);
    };

    window.addEventListener('mousedown', handleMouseDown, true);
    return () => window.removeEventListener('mousedown', handleMouseDown, true);
  }, [controller.close, controller.isOpen]);

  if (!controller.isOpen) {
    return null;
  }

  const hasQuery = controller.query.length > 0;
  const matchLabel = hasQuery
    ? `${controller.activeMatchNumber} / ${controller.totalMatches}`
    : '0 / 0';

  return (
    <motion.div
      ref={containerRef}
      initial={{
        scale: themeMotionTokens.noteFindInitialScale,
        opacity: themeMotionTokens.opacityHidden,
        y: themeMotionTokens.noteFindInitialY,
      }}
      animate={{
        scale: themeMotionTokens.noteFindVisibleScale,
        opacity: themeMotionTokens.opacityVisible,
        y: themeMotionTokens.noteFindVisibleY,
        boxShadow: hasQuery
          ? themeMotionTokens.noteFindShadowWithQuery
          : themeMotionTokens.noteFindShadowWithoutQuery,
      }}
      transition={{
        default: {
          type: 'spring',
          stiffness: themeMotionTokens.noteFindSpringStiffness,
          damping: themeMotionTokens.noteFindSpringDamping,
        },
      }}
      onAnimationComplete={requestNativeCaretOverlayRefresh}
      className="w-[var(--vlaina-width-note-find-bar)] max-w-full rounded-[var(--vlaina-notes-ui-radius-panel)] bg-[var(--vlaina-color-setting-field)] border border-[var(--vlaina-color-panel-border)] backdrop-blur-[var(--vlaina-backdrop-blur-3xl)] p-1.5"
    >
      <div
        className={cn(
          'flex h-11 items-center gap-3 pl-4 pr-1',
          controller.isReplaceOpen && 'mb-1',
        )}
      >
        <input
          ref={controller.inputRef}
          value={controller.query}
          onChange={(event) => controller.setQuery(event.target.value)}
          onCompositionStart={controller.handleQueryCompositionStart}
          onCompositionEnd={controller.handleQueryCompositionEnd}
          onKeyDown={controller.handleQueryKeyDown}
          onPaste={preventImageClipboardTextPaste}
          onDrop={preventImageDataTransferTextDrop}
          placeholder={t('notes.find')}
          spellCheck={false}
          className="h-8 min-w-0 flex-1 bg-transparent py-0 text-[var(--vlaina-font-15)] font-medium leading-5 text-[var(--vlaina-color-text-strong)] outline-none placeholder:text-[var(--vlaina-color-text-soft)] tracking-tight"
        />

        <div className="flex items-center gap-1.5">
          <div className="flex min-w-[var(--vlaina-size-132px)] items-center justify-end gap-1">
            <span
              className={cn(
                'shrink-0 px-1 text-[var(--vlaina-font-11)] font-bold tabular-nums uppercase tracking-tighter transition-opacity',
                hasQuery ? 'text-[var(--vlaina-color-text-soft)] opacity-[var(--vlaina-opacity-100)]' : 'text-[var(--vlaina-color-text-disabled)] opacity-[var(--vlaina-opacity-0)]',
              )}
            >
              {matchLabel}
            </span>
            <div className="flex items-center gap-0.5 border-l border-[var(--vlaina-border)] pl-1">
              <FindToolbarButton
                label={t('notes.previous')}
                icon="nav.chevronUp"
                onClick={controller.goToPrevious}
                disabled={!controller.canNavigate}
              />
              <FindToolbarButton
                label={t('notes.next')}
                icon="nav.chevronDown"
                onClick={controller.goToNext}
                disabled={!controller.canNavigate}
              />
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <FindToolbarButton
              label={controller.isReplaceOpen ? t('notes.hideReplace') : t('notes.showReplace')}
              icon="common.refresh"
              onClick={controller.toggleReplace}
              active={controller.isReplaceOpen}
            />
            <FindToolbarButton
              label={t('common.close')}
              icon="common.close"
              onClick={() => controller.close()}
              className="hover:text-[var(--vlaina-color-status-danger-fg)] hover:bg-[var(--vlaina-color-status-danger-bg)]"
            />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {controller.isReplaceOpen && (
          <motion.div 
            initial={{
              height: themeMotionTokens.noteFindReplaceCollapsedHeight,
              opacity: themeMotionTokens.opacityHidden,
            }}
            animate={{
              height: themeMotionTokens.noteFindReplaceExpandedHeight,
              opacity: themeMotionTokens.opacityVisible,
            }}
            exit={{
              height: themeMotionTokens.noteFindReplaceCollapsedHeight,
              opacity: themeMotionTokens.opacityHidden,
            }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 px-2 py-3 border-t border-[var(--vlaina-border)] mt-1">
              <input
                ref={controller.replaceInputRef}
                value={controller.replaceValue}
                onChange={(event) => controller.setReplaceValue(event.target.value)}
                onCompositionStart={controller.handleReplaceCompositionStart}
                onCompositionEnd={controller.handleReplaceCompositionEnd}
                onKeyDown={controller.handleReplaceKeyDown}
                onPaste={preventImageClipboardTextPaste}
                onDrop={preventImageDataTransferTextDrop}
                placeholder={t('notes.replaceWith')}
                spellCheck={false}
                className="h-8 min-w-0 flex-1 bg-transparent px-3 py-0 text-[var(--vlaina-font-sm)] font-medium leading-5 text-[var(--vlaina-text-primary)] outline-none placeholder:text-[var(--vlaina-color-text-soft)] tracking-tight"
              />

              <div className="flex items-center gap-1.5 pr-1">
                <button
                  type="button"
                  disabled={!controller.canReplace}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => controller.replaceAll()}
                  className={cn(
                    'px-3 py-1.5 text-[var(--vlaina-font-11)] font-bold uppercase tracking-widest text-[var(--vlaina-color-text-soft)] transition-all rounded-[var(--vlaina-notes-ui-radius-compact)] hover:bg-[var(--vlaina-hover)] hover:text-[var(--vlaina-color-text-strong)]',
                    !controller.canReplace && 'opacity-[var(--vlaina-opacity-20)] cursor-not-allowed',
                  )}
                >
                  {t('notes.replaceAll')}
                </button>
                <button
                  type="button"
                  disabled={!controller.canReplace}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => controller.replaceCurrent()}
                  className={cn(
                    'px-4 py-1.5 text-[var(--vlaina-font-11)] font-bold uppercase tracking-widest bg-[var(--vlaina-accent)] text-[var(--vlaina-color-white)] rounded-[var(--vlaina-notes-ui-radius-compact)] transition-all active:scale-[var(--vlaina-scale-95)] shadow-[var(--vlaina-shadow-none)]',
                    !controller.canReplace && 'opacity-[var(--vlaina-opacity-50)] grayscale cursor-not-allowed',
                  )}
                >
                  {t('notes.replace')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
