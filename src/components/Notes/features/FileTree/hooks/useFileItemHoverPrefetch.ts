import { useCallback } from 'react';
import { useSidebarHoverPrefetch } from '@/components/layout/sidebar/useSidebarHoverPrefetch';
import { preloadCoverImage } from '@/components/Notes/features/Cover/utils/coverImagePreload';
import { resolveEffectiveNotesRootPath } from '@/stores/notes/effectiveNotesRootPath';
import { readNoteMetadataFromMarkdown } from '@/stores/notes/frontmatter';
import { useNotesStore } from '@/stores/useNotesStore';

const NOTE_HOVER_PREFETCH_DELAY_MS = 60;

export function useFileItemHoverPrefetch({
  notePath,
  enabled,
}: {
  notePath: string;
  enabled: boolean;
}) {
  const prefetchNote = useNotesStore((state) => state.prefetchNote);
  const cancelPrefetchNote = useNotesStore((state) => state.cancelPrefetchNote);
  const cancelHoverPrefetch = useCallback(() => {
    cancelPrefetchNote(notePath);
  }, [cancelPrefetchNote, notePath]);
  const prefetchHoveredNote = useCallback(async () => {
    const notePrefetch = prefetchNote(notePath);
    const stateBeforePrefetch = useNotesStore.getState();
    let cover = stateBeforePrefetch.noteMetadata?.notes[notePath]?.cover;

    if (!cover) {
      await notePrefetch;
      const stateAfterPrefetch = useNotesStore.getState();
      const content = stateAfterPrefetch.noteContentsCache.get(notePath)?.content;
      cover = content ? readNoteMetadataFromMarkdown(content).cover : undefined;
    }

    if (!cover?.assetPath) return;
    const notesRootPath = resolveEffectiveNotesRootPath({
      notesPath: useNotesStore.getState().notesPath,
      currentNotePath: notePath,
    });
    await Promise.all([
      notePrefetch,
      preloadCoverImage({
        url: cover.assetPath,
        notesRootPath,
        currentNotePath: notePath,
      }).catch(() => undefined),
    ]);
  }, [notePath, prefetchNote]);

  return useSidebarHoverPrefetch(prefetchHoveredNote, {
    enabled,
    delayMs: NOTE_HOVER_PREFETCH_DELAY_MS,
    cancel: cancelHoverPrefetch,
  });
}
