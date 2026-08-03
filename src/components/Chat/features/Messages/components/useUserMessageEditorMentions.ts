import {
  useCallback,
  useRef,
  type RefObject,
} from 'react';
import { useNoteMentionState } from '@/components/Chat/features/Input/hooks/useNoteMentionState';
import { createMentionTitleMatcher } from '@/components/Chat/features/Input/noteMentionHelpers';

type EditorMentionCandidate = {
  path: string;
  title: string;
  kind: 'note' | 'folder';
  isCurrent: boolean;
};

interface EditorMentionSyncCache {
  allNoteCandidates: EditorMentionCandidate[];
  candidatesByTitle: Map<string, EditorMentionCandidate[]>;
  matcher: ReturnType<typeof createMentionTitleMatcher>;
}

interface UseUserMessageEditorMentionsOptions {
  value: string;
  onValueChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

export function useUserMessageEditorMentions({
  value,
  onValueChange,
  textareaRef,
}: UseUserMessageEditorMentionsOptions) {
  const syncCacheRef = useRef<EditorMentionSyncCache | null>(null);
  const syncMentions = useCallback(({ allNoteCandidates, value }: {
    allNoteCandidates: EditorMentionCandidate[];
    value: string;
  }) => {
    let cache = syncCacheRef.current;
    if (!cache || cache.allNoteCandidates !== allNoteCandidates) {
      if (!value.includes('@')) {
        syncCacheRef.current = null;
        return [];
      }
      const candidatesByTitle = new Map<string, EditorMentionCandidate[]>();
      for (const candidate of allNoteCandidates) {
        const candidates = candidatesByTitle.get(candidate.title) ?? [];
        candidates.push(candidate);
        candidatesByTitle.set(candidate.title, candidates);
      }

      cache = {
        allNoteCandidates,
        candidatesByTitle,
        matcher: createMentionTitleMatcher(allNoteCandidates.map((candidate) => candidate.title)),
      };
      syncCacheRef.current = cache;
    }

    const matchedTitles = cache.matcher.findInValue(value);
    const syncedMentions: Array<{ path: string; title: string; kind: 'note' | 'folder' }> = [];
    for (const [title, candidates] of cache.candidatesByTitle) {
      if (!matchedTitles.has(title)) continue;
      if (candidates.length !== 1) continue;

      const candidate = candidates[0];
      syncedMentions.push({ path: candidate.path, title: candidate.title, kind: candidate.kind });
    }
    return syncedMentions;
  }, []);

  const {
    currentPageCandidates,
    folderCandidates,
    linkedPageCandidates,
    mentionPreviewParts,
    showMentionPicker,
    mentionPickerStatus,
    activeCandidatePath,
    textareaScrollTop,
    handleValueChange,
    handleCaretBlur,
    handleMentionKeyDown,
    setTextareaScrollTop,
    handleCaretChange,
    applyMentionCandidate,
    removeMention,
  } = useNoteMentionState({
    value,
    onValueChange,
    textareaRef,
    syncMentions,
  });

  return {
    currentPageCandidates,
    folderCandidates,
    linkedPageCandidates,
    mentionPreviewParts,
    showMentionPicker,
    mentionPickerStatus,
    activeCandidatePath,
    textareaScrollTop,
    handleValueChange,
    handleCaretBlur,
    handleMentionKeyDown,
    setTextareaScrollTop,
    setCaretIndex: handleCaretChange,
    applyMentionCandidate,
    removeMention,
  };
}
