import type { DragEvent } from 'react';
import { GlobalSearchPreview } from '@/components/layout/sidebar/GlobalSearchPreview';
import type { GlobalSearchResult } from '@/components/layout/sidebar/globalSearchResults';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Icon } from '@/components/ui/icons';
import { UploadSaveSpinner } from '@/components/common/UniversalIconPicker/UploadSaveSpinner';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { themeIconTokens } from '@/styles/themeTokens';
import { BATCH_EXPORT_FORMATS, type BatchExportSource } from './batchNoteExportModel';
import type { NoteExportFormat } from './noteExportTypes';
import { BatchNoteExportSourceList } from './BatchNoteExportSourceList';

type BatchFormatOption = (typeof BATCH_EXPORT_FORMATS)[number];

interface BatchNoteExportDialogViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  query: string;
  setQuery: (query: string) => void;
  isExporting: boolean;
  exportProgress: { completed: number; total: number };
  isDragActive: boolean;
  selectedCount: number;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  visibleSources: BatchExportSource[];
  selectedIds: Set<string>;
  notesPath: string;
  previewResult: GlobalSearchResult | null;
  previewContent: string;
  onPreviewSourceChange: (id: string) => void;
  onOpenGraph: (path: string) => void;
  format: NoteExportFormat;
  formatOptions: BatchFormatOption[];
  toggleAllVisible: () => void;
  toggleSelected: (id: string) => void;
  setFormat: (format: NoteExportFormat) => void;
  addExternalFiles: (files: FileList | File[]) => Promise<void>;
  handleExport: () => Promise<void>;
}

export function BatchNoteExportDialogView({
  open,
  onOpenChange,
  onDragOver,
  onDragLeave,
  onDrop,
  query,
  setQuery,
  isExporting,
  exportProgress,
  isDragActive,
  selectedCount,
  allVisibleSelected,
  someVisibleSelected,
  visibleSources,
  selectedIds,
  notesPath,
  previewResult,
  previewContent,
  onPreviewSourceChange,
  onOpenGraph,
  format,
  formatOptions,
  toggleAllVisible,
  toggleSelected,
  setFormat,
  addExternalFiles,
  handleExport,
}: BatchNoteExportDialogViewProps) {
  const { t } = useI18n();
  const selectedFormatOption = formatOptions.find((option) => option.value === format) ?? formatOptions[0]!;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        useBlurBackdrop
        className="!flex h-[var(--vlaina-height-global-search)] w-[var(--vlaina-width-batch-export)] max-w-none flex-col gap-0 overflow-hidden rounded-[var(--vlaina-ui-radius-panel)] border-[var(--vlaina-color-border-shell)] bg-[var(--vlaina-color-floating-surface)] p-0 sm:max-w-none"
        data-testid="batch-note-export-dialog"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <DialogTitle className="sr-only">{t('notes.batchExport')}</DialogTitle>
        <DialogDescription className="sr-only">{t('notes.batchExportDescription')}</DialogDescription>
        <div className="flex h-[var(--vlaina-size-48px)] shrink-0 items-center border-b border-[var(--vlaina-color-border-shell)] px-4">
          <Icon name="common.search" size={themeIconTokens.sizeCompact} className="shrink-0 text-[var(--vlaina-sidebar-notes-text-soft)]" />
          <input
            autoFocus
            type="search"
            aria-label={t('notes.searchNotes')}
            placeholder={t('notes.searchNotes')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-[length:var(--vlaina-font-sm)] text-[var(--vlaina-text-primary)] outline-none placeholder:text-[var(--vlaina-text-tertiary)]"
          />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[var(--vlaina-width-global-search-results)_minmax(0,1fr)_var(--vlaina-size-240px)] md:overflow-hidden">
          <section className="flex min-h-[var(--vlaina-size-300px)] flex-col border-b border-[var(--vlaina-color-border-shell)] md:min-h-0 md:border-b-0 md:border-r">
            <div className="flex shrink-0 items-center justify-between px-4 pb-1 pt-3 text-[length:var(--vlaina-font-11)] font-medium text-[var(--vlaina-sidebar-notes-text-soft)]">
              <span>{t('app.viewNotes')}</span>
              <span className="tabular-nums">{t('notes.selectedCount', { count: selectedCount })}</span>
            </div>
            {visibleSources.length > 0 ? (
              <label className={cn(
                'mx-2 mb-1 flex h-[var(--vlaina-size-36px)] cursor-pointer items-center gap-2 rounded-[var(--vlaina-notes-ui-radius-compact)] px-2 text-[length:var(--vlaina-font-13)] text-[var(--vlaina-sidebar-notes-text)] hover:bg-[var(--vlaina-sidebar-notes-row-hover)]',
                isExporting && 'cursor-not-allowed opacity-[var(--vlaina-opacity-50)]',
              )}>
                <Checkbox
                  checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
                  disabled={isExporting}
                  onCheckedChange={toggleAllVisible}
                />
                {t('notes.selectAll')}
              </label>
            ) : null}
            <BatchNoteExportSourceList
              isExporting={isExporting}
              notesPath={notesPath}
              onPreviewSourceChange={onPreviewSourceChange}
              selectedIds={selectedIds}
              sources={visibleSources}
              toggleSelected={toggleSelected}
            />
            <label
              className={cn(
                'mx-2 mb-3 mt-1 flex min-h-16 shrink-0 cursor-pointer items-center justify-center rounded-[var(--vlaina-notes-ui-radius-compact)] border border-dashed px-3 text-center text-[length:var(--vlaina-font-12)] transition-colors',
                isExporting && 'pointer-events-none cursor-not-allowed opacity-[var(--vlaina-opacity-50)]',
                isDragActive
                  ? 'border-[var(--vlaina-accent)] bg-[var(--vlaina-sidebar-row-selected-bg)] text-[var(--vlaina-accent)]'
                  : 'border-[var(--vlaina-color-border-shell)] text-[var(--vlaina-sidebar-notes-text-soft)] hover:border-[var(--vlaina-accent)] hover:bg-[var(--vlaina-sidebar-row-selected-bg)] hover:text-[var(--vlaina-accent)]',
              )}
            >
              <span className="flex items-center gap-2"><Icon name="common.upload" size="sm" />{t('notes.dropMarkdownFiles')}</span>
              <input
                type="file"
                accept=".md,.markdown,.mdown,.mkd,text/markdown"
                multiple
                disabled={isExporting}
                className="sr-only"
                onChange={(event) => {
                  if (event.currentTarget.files) void addExternalFiles(event.currentTarget.files);
                  event.currentTarget.value = '';
                }}
              />
            </label>
          </section>

          <section className="relative min-h-[var(--vlaina-size-300px)] overflow-hidden border-b border-[var(--vlaina-color-border-shell)] bg-[var(--vlaina-bg-primary)] md:min-h-0 md:border-b-0 md:border-r">
            {previewResult ? (
              <GlobalSearchPreview
                result={previewResult}
                noteContent={previewContent}
                chatMessages={[]}
                notesRootPath={notesPath}
                activeBoardId={null}
                activeSnapshot={null}
                onOpenGraph={onOpenGraph}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[length:var(--vlaina-font-12)] text-[var(--vlaina-sidebar-notes-text-soft)]">
                {t('shortcut.noResults')}
              </div>
            )}
          </section>

          <section className="flex min-h-[var(--vlaina-size-300px)] items-center border-b border-[var(--vlaina-color-border-shell)] bg-[var(--vlaina-color-floating-surface)] px-3 md:min-h-0 md:border-b-0">
            <div className="w-full">
              <div className="mb-2 px-1 text-[length:var(--vlaina-font-11)] font-medium text-[var(--vlaina-sidebar-notes-text-soft)]">
                {t('notes.outputFormats')}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={t('notes.outputFormats')}
                    disabled={isExporting}
                    className="flex h-[var(--vlaina-size-36px)] w-full cursor-pointer items-center justify-between gap-2 rounded-[var(--vlaina-notes-ui-radius-compact)] border border-[var(--vlaina-color-border-shell)] bg-[var(--vlaina-bg-primary)] px-3 text-[length:var(--vlaina-font-13)] font-medium text-[var(--vlaina-sidebar-notes-text)] outline-none transition-colors hover:border-[var(--vlaina-accent)] disabled:cursor-not-allowed disabled:opacity-[var(--vlaina-opacity-50)]"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon name={selectedFormatOption.icon} size="sm" className="shrink-0 text-[var(--vlaina-accent)]" />
                      <span className="truncate">{selectedFormatOption.value === 'png' ? t('notes.imageExport') : selectedFormatOption.label}</span>
                    </span>
                    <Icon name="nav.chevronDown" size="sm" className="shrink-0 text-[var(--vlaina-sidebar-notes-text-soft)]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-[var(--vlaina-ui-radius-panel)] border-[var(--vlaina-color-border-shell)] bg-[var(--vlaina-color-floating-surface)]"
                >
                  <DropdownMenuRadioGroup value={format} onValueChange={(value) => setFormat(value as NoteExportFormat)}>
                    {formatOptions.map((option) => (
                      <DropdownMenuRadioItem
                        key={option.value}
                        value={option.value}
                        disabled={isExporting}
                        className="cursor-pointer rounded-[var(--vlaina-notes-ui-radius-compact)] py-2 text-[length:var(--vlaina-font-13)] data-[state=checked]:bg-[var(--vlaina-sidebar-row-selected-bg)] data-[state=checked]:text-[var(--vlaina-sidebar-row-selected-text)]"
                      >
                        <Icon name={option.icon} size="sm" className="mr-2 shrink-0" />
                        <span className="truncate">{option.value === 'png' ? t('notes.imageExport') : option.label}</span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                type="button"
                disabled={selectedCount === 0 || isExporting}
                onClick={() => void handleExport()}
                className={cn(
                  'mt-4 flex h-[var(--vlaina-size-36px)] w-full cursor-pointer items-center justify-center gap-1.5 rounded-[var(--vlaina-radius-pill)] bg-[var(--vlaina-color-floating-surface)] px-3 text-[length:var(--vlaina-font-13)] font-medium text-[var(--vlaina-text-primary)] shadow-[var(--vlaina-shadow-raised-soft)] transition-colors duration-[var(--vlaina-duration-150)] hover:text-[var(--vlaina-accent)] disabled:cursor-not-allowed motion-reduce:transition-none',
                  isExporting
                    ? 'text-[var(--vlaina-accent)]'
                    : 'disabled:opacity-[var(--vlaina-opacity-50)]',
                )}
              >
                {isExporting ? <UploadSaveSpinner /> : <Icon name="common.download" size="sm" />}
                {isExporting
                  ? t('notes.exportProgress', exportProgress)
                  : t('notes.exportSelected', { count: selectedCount })}
              </button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
