import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SidebarLiveNoteFileIcon } from '@/components/Notes/features/Sidebar/SidebarNoteFileIcon';
import { useI18n } from '@/lib/i18n';
import { getParentPath, normalizePath } from '@/lib/storage/adapter';
import { cn } from '@/lib/utils';
import { themeDomStyleTokens, themeImageBlockStyleTokens } from '@/styles/themeTokens';
import type { BatchExportSource } from './batchNoteExportModel';

export const BATCH_EXPORT_SOURCE_VIRTUALIZATION_THRESHOLD = 100;

interface BatchNoteExportSourceListProps {
  isExporting: boolean;
  notesPath: string;
  onPreviewSourceChange: (id: string) => void;
  selectedIds: ReadonlySet<string>;
  sources: BatchExportSource[];
  toggleSelected: (id: string) => void;
}

function getSourceRowHeight(source: BatchExportSource): number {
  return !source.external && getParentPath(source.path) ? 58 : 42;
}

export function BatchNoteExportSourceList({
  isExporting,
  notesPath,
  onPreviewSourceChange,
  selectedIds,
  sources,
  toggleSelected,
}: BatchNoteExportSourceListProps) {
  const { t } = useI18n();
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = sources.length > BATCH_EXPORT_SOURCE_VIRTUALIZATION_THRESHOLD;
  const virtualizer = useVirtualizer({
    count: sources.length,
    enabled: shouldVirtualize,
    estimateSize: (index) => getSourceRowHeight(sources[index]!),
    getScrollElement: () => scrollRootRef.current,
    overscan: 8,
  });

  const renderSource = (source: BatchExportSource) => {
    const selected = selectedIds.has(source.id);
    const parentPath = source.external ? null : getParentPath(source.path);
    return (
      <button
        type="button"
        aria-pressed={selected}
        disabled={isExporting}
        onPointerMove={() => onPreviewSourceChange(source.id)}
        onFocus={() => onPreviewSourceChange(source.id)}
        onClick={() => toggleSelected(source.id)}
        className={cn(
          'group/batch-export-note mb-0.5 flex w-full cursor-pointer items-start gap-2 rounded-[var(--vlaina-notes-ui-radius-compact)] px-2 py-2 text-left text-[length:var(--vlaina-font-13)] hover:bg-[var(--vlaina-sidebar-notes-row-hover)]',
          parentPath ? 'h-[var(--vlaina-size-56px)]' : 'h-[var(--vlaina-size-40px)]',
          isExporting && 'cursor-not-allowed opacity-[var(--vlaina-opacity-50)]',
          selected && 'bg-[var(--vlaina-sidebar-row-selected-bg)] shadow-[var(--vlaina-shadow-selection-soft)]',
        )}
      >
        <span className="mt-0.5 flex size-[var(--vlaina-size-18px)] shrink-0 items-center justify-center leading-none">
          <SidebarLiveNoteFileIcon
            notePath={source.path}
            notesRootPath={source.external ? undefined : notesPath}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn(
            'block truncate text-[length:var(--vlaina-font-13)] font-medium leading-5 group-hover/batch-export-note:text-[var(--vlaina-sidebar-row-selected-text)] group-focus-within/batch-export-note:text-[var(--vlaina-sidebar-row-selected-text)]',
            selected ? 'text-[var(--vlaina-sidebar-row-selected-text)]' : 'text-[var(--vlaina-sidebar-notes-text)]',
          )}>{source.name}</span>
          {parentPath ? (
            <span className={cn(
              'block truncate text-[length:var(--vlaina-font-11)] leading-[var(--vlaina-leading-145)] group-hover/batch-export-note:text-[var(--vlaina-sidebar-row-selected-text-soft)] group-focus-within/batch-export-note:text-[var(--vlaina-sidebar-row-selected-text-soft)]',
              selected ? 'text-[var(--vlaina-sidebar-row-selected-text-soft)]' : 'text-[var(--vlaina-sidebar-notes-text-soft)]',
            )}>{normalizePath(parentPath, true)}/</span>
          ) : null}
        </span>
        {source.external ? (
          <span className={cn(
            'shrink-0 text-[length:var(--vlaina-font-11)] group-hover/batch-export-note:text-[var(--vlaina-sidebar-row-selected-text-soft)] group-focus-within/batch-export-note:text-[var(--vlaina-sidebar-row-selected-text-soft)]',
            selected ? 'text-[var(--vlaina-sidebar-row-selected-text-soft)]' : 'text-[var(--vlaina-sidebar-notes-text-soft)]',
          )}>{t('notes.externalFile')}</span>
        ) : null}
      </button>
    );
  };

  return (
    <div ref={scrollRootRef} className="max-h-[var(--vlaina-size-240px)] min-h-0 overflow-y-auto px-2 pb-2 md:max-h-none md:flex-1">
      {sources.length === 0 ? (
        <div className="px-2 py-8 text-center text-[length:var(--vlaina-font-12)] text-[var(--vlaina-sidebar-notes-text-soft)]">
          {t('notes.noMarkdownNotes')}
        </div>
      ) : shouldVirtualize ? (
        <div style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: themeDomStyleTokens.positionRelative,
          width: themeImageBlockStyleTokens.widthFull,
        }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const source = sources[virtualRow.index];
            if (!source) return null;
            return (
              <div
                key={source.id}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  left: themeDomStyleTokens.numericZero,
                  position: themeDomStyleTokens.positionAbsolute,
                  top: themeDomStyleTokens.numericZero,
                  transform: `translateY(${virtualRow.start}px)`,
                  width: themeImageBlockStyleTokens.widthFull,
                }}
              >
                {renderSource(source)}
              </div>
            );
          })}
        </div>
      ) : sources.map((source) => <div key={source.id}>{renderSource(source)}</div>)}
    </div>
  );
}
