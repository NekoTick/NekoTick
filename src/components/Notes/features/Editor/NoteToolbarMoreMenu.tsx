import { useCallback, useState, type ReactNode, type RefObject } from 'react';
import { Icon } from '@/components/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { ShortcutKeys, SOFT_SHORTCUT_KEY_CLASSNAME } from '@/components/ui/shortcut-keys';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MENU_PANEL_CLASS_NAME } from '@/components/layout/sidebar/context-menu/shared';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { hasNativeFileShare } from '@/lib/nativeFileShare';
import type { AppLanguage } from '@/lib/i18n/languages';
import type { NoteExportFormat } from '../Export/noteExportTypes';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import { themeDomStyleTokens } from '@/styles/themeTokens';
import {
  NoteToolbarMoreMenuStats,
  type PreloadedBacklinkCount,
} from './NoteToolbarMoreMenuStats';

type NoteMetadata =
  | {
      createdAt?: string | number | Date | null;
      updatedAt?: string | number | Date | null;
    }
  | undefined;

interface NoteToolbarMoreMenuProps {
  buttonClassName: string;
  currentNoteMetadata: NoteMetadata;
  currentNotePath: string | null | undefined;
  moreButtonRef: RefObject<HTMLButtonElement | null>;
  onBatchExportOpen: () => void;
  onExportSelect: (format: NoteExportFormat) => void;
  onOpenChange: (open: boolean) => void;
  onSourceModeSelect: () => void;
  open: boolean;
  showSourceMode: boolean;
  sourceModeButtonLabel: string;
  sourceModeShortcutKeys: string[];
}

const exportMenuItemClassName =
  'text-[var(--vlaina-sidebar-notes-text)] transition-colors focus:bg-[var(--vlaina-sidebar-notes-row-active)] focus:text-[var(--vlaina-sidebar-row-selected-text)] data-[highlighted]:bg-[var(--vlaina-sidebar-notes-row-active)] data-[highlighted]:text-[var(--vlaina-sidebar-row-selected-text)] data-[state=open]:bg-[var(--vlaina-sidebar-notes-row-active)] data-[state=open]:text-[var(--vlaina-sidebar-row-selected-text)] [&>svg]:text-current';

const noteMenuSurfaceClassName = cn(
  'sidebar-menu-surface max-w-[var(--vlaina-width-viewport-minus-1rem)] backdrop-blur-[var(--vlaina-backdrop-blur-lg)]',
  MENU_PANEL_CLASS_NAME,
);

function formatMetadataDate(value: string | number | Date | null | undefined, language: AppLanguage) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function NoteToolbarMoreMenu({
  buttonClassName,
  currentNoteMetadata,
  currentNotePath,
  moreButtonRef,
  onBatchExportOpen,
  onExportSelect,
  onOpenChange,
  onSourceModeSelect,
  open,
  showSourceMode,
  sourceModeButtonLabel,
  sourceModeShortcutKeys,
}: NoteToolbarMoreMenuProps) {
  const { language, t } = useI18n();
  const nativeFileShareAvailable = hasNativeFileShare();
  const [preloadedBacklinkCount, setPreloadedBacklinkCount] = useState<PreloadedBacklinkCount | null>(null);
  const preloadBacklinkCount = useCallback(() => {
    if (!currentNotePath) return;

    const notesState = useNotesStore.getState();
    if (
      preloadedBacklinkCount?.notePath === currentNotePath
      && preloadedBacklinkCount.noteContentsCacheRevision === notesState.noteContentsCacheRevision
    ) {
      return;
    }
    setPreloadedBacklinkCount({
      count: notesState.getBacklinks(currentNotePath).length,
      noteContentsCacheRevision: notesState.noteContentsCacheRevision,
      notePath: currentNotePath,
    });
  }, [currentNotePath, preloadedBacklinkCount]);

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <DropdownMenuTrigger asChild>
          <TooltipTrigger asChild>
            <button
              ref={moreButtonRef}
              type="button"
              aria-label={t('notes.moreActions')}
              onPointerEnter={preloadBacklinkCount}
              onClick={(event) => event.stopPropagation()}
              className={cn(
                buttonClassName,
                'hover:text-[var(--vlaina-sidebar-row-selected-text)]',
              )}
            >
              <Icon size="md" name="common.more" />
            </button>
          </TooltipTrigger>
        </DropdownMenuTrigger>
        <TooltipContent
          side="bottom"
          sideOffset={themeDomStyleTokens.toolbarTooltipOffsetPx}
          showArrow={false}
          className={cn(
            'rounded-[var(--vlaina-notes-ui-radius-tooltip)] px-3 py-2 text-xs text-[var(--vlaina-sidebar-chat-text)]',
            raisedPillSurfaceClass,
          )}
        >
          {t('notes.moreActions')}
        </TooltipContent>
      </Tooltip>

      <DropdownMenuContent
        align="end"
        sideOffset={4}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          moreButtonRef.current?.blur();
          window.requestAnimationFrame(() => {
            moreButtonRef.current?.blur();
            moreButtonRef.current?.closest('[data-note-toolbar-root="true"]')
              ?.querySelector<HTMLTextAreaElement>('[data-note-source-editor="true"]')
              ?.focus({ preventScroll: true });
          });
        }}
        className={cn(
          'w-max min-w-56 p-1',
          noteMenuSurfaceClassName,
          'shadow-[var(--vlaina-shadow-md)]',
        )}
        data-no-editor-drag-box="true"
        data-testid="note-menu-content"
        onClick={(event) => event.stopPropagation()}
      >
        {showSourceMode ? (
          <>
            <NoteMenuButton
              className={cn(
                exportMenuItemClassName,
                'group gap-2 [&:focus_.source-mode-shortcut]:opacity-[var(--vlaina-opacity-100)]',
              )}
              onSelect={onSourceModeSelect}
            >
              <Icon
                size="md"
                name="editor.code"
                className="mr-2 shrink-0"
              />
              <span className="min-w-0 flex-1 truncate">{sourceModeButtonLabel}</span>
              <ShortcutKeys
                keys={sourceModeShortcutKeys}
                aria-hidden="true"
                className="source-mode-shortcut ml-4 shrink-0 opacity-[var(--vlaina-opacity-0)] transition-opacity duration-[var(--vlaina-duration-100)] group-hover:opacity-[var(--vlaina-opacity-100)] group-focus:opacity-[var(--vlaina-opacity-100)]"
                keyClassName={SOFT_SHORTCUT_KEY_CLASSNAME}
              />
            </NoteMenuButton>
            <NoteMenuSeparator />
          </>
        ) : null}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            className={cn(
              'gap-2',
              exportMenuItemClassName,
            )}
            data-no-editor-drag-box="true"
          >
            <Icon size="md" name="common.download" className="mr-2 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{t('notes.export')}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            className={cn(
              'w-max min-w-44 p-1',
              noteMenuSurfaceClassName,
              'shadow-[var(--vlaina-shadow-md)]',
            )}
            data-no-editor-drag-box="true"
            data-testid="note-export-menu-content"
          >
            <NoteMenuButton
              className={exportMenuItemClassName}
              onSelect={() => onExportSelect('docx')}
            >
              <Icon size="md" name="file.text" className="mr-2" />
              Word (.docx)
            </NoteMenuButton>
            {!nativeFileShareAvailable ? (
              <NoteMenuButton
                className={exportMenuItemClassName}
                onSelect={() => onExportSelect('pdf')}
              >
                <Icon size="md" name="file.text" className="mr-2" />
                PDF
              </NoteMenuButton>
            ) : null}
            <NoteMenuButton
              className={exportMenuItemClassName}
              onSelect={() => onExportSelect('png')}
            >
              <Icon size="md" name="file.image" className="mr-2" />
              {t('notes.imageExport')}
            </NoteMenuButton>
            <NoteMenuButton
              className={exportMenuItemClassName}
              onSelect={() => onExportSelect('html')}
            >
              <Icon size="md" name="file.public" className="mr-2" />
              HTML
            </NoteMenuButton>
            <NoteMenuSeparator />
            <NoteMenuButton
              className={exportMenuItemClassName}
              onSelect={onBatchExportOpen}
            >
              <Icon size="md" name="common.download" className="mr-2" />
              {t('notes.batchExport')}
            </NoteMenuButton>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <NoteMenuSeparator />
        <NoteToolbarMoreMenuStats
          currentNotePath={currentNotePath}
          preloadedBacklinkCount={preloadedBacklinkCount}
        />
        <NoteMenuSeparator />
        <div className="grid grid-cols-[78px_max-content] gap-1 px-2 py-1.5 text-xs text-[var(--vlaina-sidebar-notes-text)]">
          <span className="font-medium">{t('notes.created')}</span>
          <span className="whitespace-nowrap">{formatMetadataDate(currentNoteMetadata?.createdAt, language)}</span>

          <span className="font-medium">{t('notes.updated')}</span>
          <span className="whitespace-nowrap">{formatMetadataDate(currentNoteMetadata?.updatedAt, language)}</span>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NoteMenuButton({
  children,
  className,
  onSelect,
}: {
  children: ReactNode;
  className?: string;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      className={cn(
        'w-full text-left',
        className,
      )}
      onSelect={onSelect}
    >
      {children}
    </DropdownMenuItem>
  );
}

function NoteMenuSeparator() {
  return <div role="separator" className="-mx-1 my-1 h-px bg-[var(--muted)]" />;
}
