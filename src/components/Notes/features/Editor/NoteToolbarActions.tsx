import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/icons';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { getShortcutKeys } from '@/lib/shortcuts';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import { useUIStore } from '@/stores/uiSlice';
import { useToastStore } from '@/stores/useToastStore';
import { flushCurrentPendingEditorMarkdown } from '@/stores/notes/pendingEditorMarkdownFlusher';
import { useI18n } from '@/lib/i18n';
import { normalizeUserFacingErrorMessage } from '@/lib/i18n/userFacingErrors';
import { canStarNotePath } from '@/stores/notes/notePathState';
import {
  themeDomStyleTokens,
  themeStyleResetTokens,
  themeUiFeedbackTokens,
} from '@/styles/themeTokens';
import type { NoteExportFormat } from '../Export/noteExportTypes';
import { NoteToolbarMoreMenu } from './NoteToolbarMoreMenu';
import { preloadEmbeddedChatViewModule } from '../../notesViewLazyComponents';
import { noteToolbarIconButtonClassName } from './noteToolbarStyles';
import { BatchNoteExportDialog } from '../Export/BatchNoteExportDialog';

export interface NoteToolbarActionsProps {
  currentNotePath: string | null | undefined;
  currentNoteTitle: string;
  getCurrentNoteContent: () => string;
  isSourceMode?: boolean;
  onToggleSourceMode?: () => void;
  notesPath: string;
  starred: boolean;
  toggleStarred: (path: string) => void;
  currentNoteMetadata:
    | {
        createdAt?: string | number | Date | null;
        updatedAt?: string | number | Date | null;
      }
    | undefined;
  className?: string;
  buttonClassName?: string;
  showStar?: boolean;
  showChat?: boolean;
  showMore?: boolean;
  forceShowChat?: boolean;
  onOpenChat?: () => void | Promise<void>;
}

function NoteToolbarTooltip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="bottom"
        sideOffset={themeDomStyleTokens.toolbarTooltipOffsetPx}
        showArrow={false}
        className={cn(
          'rounded-[var(--vlaina-notes-ui-radius-tooltip)] px-3 py-2 text-xs text-[var(--vlaina-sidebar-chat-text)]',
          raisedPillSurfaceClass,
        )}
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function NoteToolbarActions({
  currentNotePath,
  currentNoteTitle,
  getCurrentNoteContent,
  isSourceMode = false,
  onToggleSourceMode,
  notesPath,
  starred,
  toggleStarred,
  currentNoteMetadata,
  className,
  buttonClassName,
  showStar = true,
  showChat = true,
  showMore = true,
  forceShowChat = false,
  onOpenChat,
}: NoteToolbarActionsProps) {
  const { t } = useI18n();
  const canToggleStar = canStarNotePath(currentNotePath, notesPath);
  const showStarButton = showStar && (starred || canToggleStar);
  const starButtonLabel = starred ? t('notes.removeFromStarred') : t('notes.addToStarred');
  const sourceModeButtonLabel = isSourceMode ? t('notes.switchToRenderedMode') : t('notes.switchToSourceMode');
  const sourceModeShortcutKeys = getShortcutKeys('toggleNoteSourceMode') ?? ['Ctrl', '/'];
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const addToast = useToastStore((state) => state.addToast);
  const chatPanelCollapsed = useUIStore((state) => state.notesChatPanelCollapsed);
  const chatFloatingOpen = useUIStore((state) => state.notesChatFloatingOpen);
  const setNotesChatFloatingOpen = useUIStore((state) => state.setNotesChatFloatingOpen);
  const toolbarButtonClassName = cn(noteToolbarIconButtonClassName, buttonClassName);
  const showChatButton = showChat && (forceShowChat || (chatPanelCollapsed && !chatFloatingOpen));
  const exportCurrentNote = async (format: NoteExportFormat) => {
    if (!currentNotePath) {
      return;
    }

    try {
      flushCurrentPendingEditorMarkdown();
      const latestNote = useNotesStore.getState().currentNote;
      const { exportNote } = await import('../Export');
      await exportNote({
        format,
        markdown: latestNote?.path === currentNotePath ? latestNote.content : getCurrentNoteContent(),
        notePath: currentNotePath,
        notesPath,
        title: currentNoteTitle,
      });
    } catch (error) {
      addToast(normalizeUserFacingErrorMessage(error, 'notes.exportFailed'), 'error', themeUiFeedbackTokens.errorToastDurationMs);
    }
  };
  const handleSourceModeSelect = useCallback(() => {
    onToggleSourceMode?.();
    setMoreMenuOpen(false);
    moreButtonRef.current?.blur();
    window.requestAnimationFrame(() => {
      moreButtonRef.current?.blur();
    });
  }, [onToggleSourceMode]);

  const handleExportSelect = useCallback((format: NoteExportFormat) => {
    setMoreMenuOpen(false);
    void exportCurrentNote(format);
  }, [exportCurrentNote]);

  const handleBatchExportOpen = useCallback(() => {
    flushCurrentPendingEditorMarkdown();
    setMoreMenuOpen(false);
    setExportDialogOpen(true);
  }, []);

  if (!showStarButton && !showChatButton && !showMore) {
    return null;
  }

  return (
    <div data-note-toolbar-actions="true" className={cn('flex items-center gap-1', className)}>
      {showStarButton ? (
        <NoteToolbarTooltip label={starButtonLabel}>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (currentNotePath && (starred || canStarNotePath(currentNotePath, notesPath))) {
                toggleStarred(currentNotePath);
              }
            }}
            aria-label={starButtonLabel}
            data-note-star-button="true"
            className={cn(
              toolbarButtonClassName,
              starred
                ? 'text-[var(--vlaina-color-favorite-fg)] hover:text-[var(--vlaina-color-favorite-fg)]'
                : 'hover:text-[var(--vlaina-color-favorite-fg)]',
            )}
          >
            <Icon
              size="md"
              name="misc.star"
              style={{ fill: starred ? themeStyleResetTokens.currentColor : themeStyleResetTokens.fillNone }}
            />
          </button>
        </NoteToolbarTooltip>
      ) : null}

      {showChatButton ? (
        <NoteToolbarTooltip label={t('notes.rightChat')}>
          <button
            type="button"
            onPointerEnter={() => {
              void preloadEmbeddedChatViewModule().catch(() => undefined);
            }}
            onClick={(event) => {
              event.stopPropagation();
              const openFloatingChat = () => {
                if (chatPanelCollapsed) {
                  setNotesChatFloatingOpen(true);
                }
              };
              if (!onOpenChat) {
                openFloatingChat();
                return;
              }
              void Promise.resolve(onOpenChat?.())
                .then(
                  openFloatingChat,
                  openFloatingChat,
                );
            }}
            aria-label={t('notes.rightChat')}
            data-note-chat-button="true"
            className={cn(
              toolbarButtonClassName,
              'hover:text-[var(--vlaina-accent)]',
            )}
          >
            <Icon size="md" name="common.shootingStar" />
          </button>
        </NoteToolbarTooltip>
      ) : null}

      {showMore ? (
        <NoteToolbarMoreMenu
          buttonClassName={toolbarButtonClassName}
          currentNoteMetadata={currentNoteMetadata}
          currentNotePath={currentNotePath}
          moreButtonRef={moreButtonRef}
          onBatchExportOpen={handleBatchExportOpen}
          onExportSelect={handleExportSelect}
          onOpenChange={setMoreMenuOpen}
          onSourceModeSelect={handleSourceModeSelect}
          open={moreMenuOpen}
          showSourceMode={Boolean(onToggleSourceMode)}
          sourceModeButtonLabel={sourceModeButtonLabel}
          sourceModeShortcutKeys={sourceModeShortcutKeys}
        />
      ) : null}
      <BatchNoteExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        currentNotePath={currentNotePath}
        currentNoteTitle={currentNoteTitle}
        getCurrentNoteContent={getCurrentNoteContent}
        notesPath={notesPath}
      />
    </div>
  );
}
