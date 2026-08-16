import { memo, useRef, type ReactNode } from 'react';
import { ghostIconButtonClass } from '@/components/ui/surfaceStyles';
import { MENU_PANEL_CLASS_NAME } from '@/components/layout/sidebar/context-menu/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n';
import { hasNativeFileShare } from '@/lib/nativeFileShare';
import { cn } from '@/lib/utils';
import type { WhiteboardExportFormat } from '@/components/Whiteboard/model/export/whiteboardExport';
import type { WhiteboardPaperStyle } from '@/components/Whiteboard/model/core/whiteboardModel';

interface WhiteboardMoreMenuProps {
  onCopyImage: () => void;
  onExport: (format: WhiteboardExportFormat) => void;
  onPaperStyleChange: (style: WhiteboardPaperStyle) => void;
  paperStyle: WhiteboardPaperStyle;
}

const menuItemClassName =
  'gap-2 text-[var(--vlaina-sidebar-notes-text)] transition-colors focus:bg-[var(--vlaina-sidebar-notes-row-active)] focus:text-[var(--vlaina-sidebar-row-selected-text)] data-[highlighted]:bg-[var(--vlaina-sidebar-notes-row-active)] data-[highlighted]:text-[var(--vlaina-sidebar-row-selected-text)] data-[state=open]:bg-[var(--vlaina-sidebar-notes-row-active)] data-[state=open]:text-[var(--vlaina-sidebar-row-selected-text)] [&>svg]:text-current';

const menuSurfaceClassName = cn(
  'sidebar-menu-surface max-w-[var(--vlaina-width-viewport-minus-1rem)] backdrop-blur-[var(--vlaina-backdrop-blur-lg)]',
  MENU_PANEL_CLASS_NAME,
);

const moreButtonClassName = cn(
  'app-no-drag absolute right-3 top-3 z-[var(--vlaina-z-20)] flex h-8 w-8 items-center justify-center',
  'cursor-pointer text-[var(--vlaina-text-tertiary)] disabled:cursor-default',
  ghostIconButtonClass,
  'hover:text-[var(--vlaina-sidebar-row-selected-text)]',
);

const paperStyles: WhiteboardPaperStyle[] = ['blank', 'dots', 'grid', 'ruled'];

export const WhiteboardMoreMenu = memo(function WhiteboardMoreMenu({ onCopyImage, onExport, onPaperStyleChange, paperStyle }: WhiteboardMoreMenuProps) {
  const { t } = useI18n();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const nativeFileShareAvailable = hasNativeFileShare();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          ref={buttonRef}
          type="button"
          aria-label={t('sidebar.more')}
          data-whiteboard-more-button="true"
          className={moreButtonClassName}
        >
          <Icon name="common.more" size="md" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        onCloseAutoFocus={() => {
          buttonRef.current?.blur();
          window.requestAnimationFrame(() => {
            buttonRef.current?.blur();
          });
        }}
        className={cn('w-max min-w-48 p-1 shadow-[var(--vlaina-shadow-md)]', menuSurfaceClassName)}
      >
        {!nativeFileShareAvailable ? (
          <>
            <WhiteboardMenuItem onSelect={onCopyImage}>
              <Icon size="md" name="common.copy" className="mr-2 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t('common.copyToClipboard')}</span>
            </WhiteboardMenuItem>
            <WhiteboardMenuSeparator />
          </>
        ) : null}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={cn(menuItemClassName, 'gap-2')}>
            <Icon size="md" name="editor.table" className="mr-2 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{t('whiteboard.paper')}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={cn('w-max min-w-36 p-1 shadow-[var(--vlaina-shadow-md)]', menuSurfaceClassName)}>
            {paperStyles.map((style) => (
              <WhiteboardMenuItem key={style} onSelect={() => onPaperStyleChange(style)}>
                {paperStyle === style
                  ? <Icon size="md" name="common.check" className="mr-2 shrink-0" />
                  : <span className="mr-2 size-[var(--vlaina-size-20px)] shrink-0" />}
                {t(`whiteboard.paper.${style}`)}
              </WhiteboardMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <WhiteboardMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={cn(menuItemClassName, 'gap-2')}>
            <Icon size="md" name="common.download" className="mr-2 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{t('notes.export')}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={cn('w-max min-w-36 p-1 shadow-[var(--vlaina-shadow-md)]', menuSurfaceClassName)}>
            <WhiteboardExportItem format="png" onExport={onExport}>PNG</WhiteboardExportItem>
            <WhiteboardExportItem format="jpeg" onExport={onExport}>JPEG</WhiteboardExportItem>
            <WhiteboardExportItem format="svg" onExport={onExport}>SVG</WhiteboardExportItem>
            <WhiteboardExportItem format="webp" onExport={onExport}>WebP</WhiteboardExportItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

function WhiteboardMenuSeparator() {
  return <div role="separator" className="-mx-1 my-1 h-px bg-[var(--muted)]" />;
}

function WhiteboardExportItem({
  children,
  format,
  onExport,
}: {
  children: ReactNode;
  format: WhiteboardExportFormat;
  onExport: (format: WhiteboardExportFormat) => void;
}) {
  return (
    <WhiteboardMenuItem onSelect={() => onExport(format)}>
      <Icon size="md" name="file.image" className="mr-2 shrink-0" />
      {children}
    </WhiteboardMenuItem>
  );
}

function WhiteboardMenuItem({
  children,
  onSelect,
}: {
  children: ReactNode;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem className={cn('w-full text-left', menuItemClassName)} onSelect={onSelect}>
      {children}
    </DropdownMenuItem>
  );
}
