import { useCallback, useMemo } from 'react';
import { useI18n } from '@/lib/i18n';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import { useDeferredTextStats } from './hooks/useDeferredTextStats';

export type PreloadedBacklinkCount = {
  count: number;
  noteContentsCacheRevision: number;
  notePath: string;
};

export function NoteToolbarMoreMenuStats({
  currentNotePath,
  preloadedBacklinkCount,
}: {
  currentNotePath: string | null | undefined;
  preloadedBacklinkCount: PreloadedBacklinkCount | null;
}) {
  const { t } = useI18n();
  const currentNoteContent = useNotesStore(
    useCallback((state) => {
      const currentNote = state.currentNote;
      return currentNote && currentNote.path === currentNotePath
        ? currentNote.content
        : currentNotePath ? state.noteContentsCache.get(currentNotePath)?.content ?? '' : '';
    }, [currentNotePath]),
  );
  const getBacklinks = useNotesStore((state) => state.getBacklinks);
  const noteContentsCacheRevision = useNotesStore((state) => state.noteContentsCacheRevision);
  const backlinkCount = useMemo(() => {
    if (
      preloadedBacklinkCount &&
      preloadedBacklinkCount.notePath === currentNotePath &&
      preloadedBacklinkCount.noteContentsCacheRevision === noteContentsCacheRevision
    ) {
      return preloadedBacklinkCount.count;
    }
    return currentNotePath ? getBacklinks(currentNotePath).length : 0;
  }, [currentNotePath, getBacklinks, noteContentsCacheRevision, preloadedBacklinkCount]);
  const textStats = useDeferredTextStats(currentNotePath, currentNoteContent);

  return (
    <div className="grid grid-cols-[78px_max-content] gap-1 px-2 py-1.5 text-xs text-[var(--vlaina-sidebar-notes-text)]">
      <span className="font-medium">{t('notes.lines')}</span>
      <span className="tabular-nums">{textStats.lineCount}</span>

      <span className="font-medium">{t('notes.words')}</span>
      <span className="tabular-nums">{textStats.wordCount}</span>

      <span className="font-medium">{t('notes.characters')}</span>
      <span className="tabular-nums">{textStats.characterCount}</span>

      <span className="font-medium">{t('notes.backlinks')}</span>
      <span className="tabular-nums">{backlinkCount}</span>
    </div>
  );
}
