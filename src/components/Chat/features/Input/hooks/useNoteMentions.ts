import { useCallback, useRef, type RefObject } from 'react';
import { useNoteMentionState } from './useNoteMentionState';
import { createMentionTitleMatcher } from '../noteMentionHelpers';

type SyncCandidate = {
  path: string;
  title: string;
  kind: 'note' | 'folder';
};

type SyncMention = {
  path: string;
  title: string;
  kind?: 'note' | 'folder';
};

interface MentionSyncCache {
  allNoteCandidates: SyncCandidate[];
  candidatesByPath: Map<string, SyncCandidate>;
  candidatesByTitle: Map<string, SyncCandidate[]>;
  matcher: ReturnType<typeof createMentionTitleMatcher>;
  mentions: SyncMention[];
}

interface UseNoteMentionsOptions {
  message: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  handleMessageChange: (message: string) => void;
}

export function useNoteMentions({
  message,
  textareaRef,
  handleMessageChange,
}: UseNoteMentionsOptions) {
  const syncCacheRef = useRef<MentionSyncCache | null>(null);
  const syncMentions = useCallback(({ allNoteCandidates, mentions, value }: {
    allNoteCandidates: SyncCandidate[];
    mentions: SyncMention[];
    value: string;
  }) => {
    const syncedMentions = new Map<string, { path: string; title: string; kind: 'note' | 'folder' }>();
    let cache = syncCacheRef.current;
    if (
      !cache
      || cache.allNoteCandidates !== allNoteCandidates
      || cache.mentions !== mentions
    ) {
      if (!value.includes('@')) {
        syncCacheRef.current = null;
        return [];
      }
      const candidatesByPath = new Map<string, SyncCandidate>();
      const candidatesByTitle = new Map<string, SyncCandidate[]>();
      for (const candidate of allNoteCandidates) {
        candidatesByPath.set(candidate.path, candidate);
        const candidates = candidatesByTitle.get(candidate.title) ?? [];
        candidates.push(candidate);
        candidatesByTitle.set(candidate.title, candidates);
      }

      cache = {
        allNoteCandidates,
        candidatesByPath,
        candidatesByTitle,
        matcher: createMentionTitleMatcher((function* () {
          for (const mention of mentions) {
            yield mention.title;
          }
          for (const candidate of allNoteCandidates) {
            yield candidate.title;
          }
        })()),
        mentions,
      };
      syncCacheRef.current = cache;
    }

    const matchedTitles = cache.matcher.findInValue(value);
    const retainedTitles = new Set<string>();
    for (const mention of mentions) {
      if (matchedTitles.has(mention.title)) {
        const candidate = cache.candidatesByPath.get(mention.path);
        syncedMentions.set(mention.path, {
          path: mention.path,
          title: mention.title,
          kind: candidate?.kind ?? (mention.kind === 'folder' ? 'folder' : 'note'),
        });
        retainedTitles.add(mention.title);
      }
    }

    for (const [title, candidates] of cache.candidatesByTitle) {
      if (retainedTitles.has(title) || !matchedTitles.has(title)) continue;
      if (candidates.length === 1) {
        const candidate = candidates[0];
        syncedMentions.set(candidate.path, {
          path: candidate.path,
          title: candidate.title,
          kind: candidate.kind,
        });
      }
    }

    const result: Array<{ path: string; title: string; kind: 'note' | 'folder' }> = [];
    for (const mention of syncedMentions.values()) {
      result.push(mention);
    }
    return result;
  }, []);

  const {
    mentions,
    hasMentionCandidates,
    clearMentions,
    getSynchronizedMentions,
    currentPageCandidates,
    folderCandidates,
    linkedPageCandidates,
    mentionPreviewParts,
    showMentionPicker,
    mentionPickerStatus,
    activeCandidatePath,
    textareaScrollTop,
    handleCaretChange,
    handleCaretBlur,
    handleMentionKeyDown,
    setTextareaScrollTop,
    applyMentionCandidate,
    appendMentions,
    removeMention,
    restoreMentions,
  } = useNoteMentionState({
    value: message,
    onValueChange: handleMessageChange,
    textareaRef,
    syncMentions,
    removeLastMentionOnBoundary: true,
  });

  return {
    noteMentions: mentions,
    hasMentionCandidates,
    clearNoteMentions: clearMentions,
    getSynchronizedNoteMentions: getSynchronizedMentions,
    currentPageCandidates,
    folderCandidates,
    linkedPageCandidates,
    mentionPreviewParts,
    showMentionPicker,
    mentionPickerStatus,
    activeCandidatePath,
    textareaScrollTop,
    handleCaretChange,
    handleCaretBlur,
    handleMentionKeyDown,
    setTextareaScrollTop,
    applyMentionCandidate,
    appendNoteMentions: appendMentions,
    restoreNoteMentions: restoreMentions,
    removeNoteMention: removeMention,
  };
}
