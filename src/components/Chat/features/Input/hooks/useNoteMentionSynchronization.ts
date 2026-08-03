import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { NoteMentionReference } from '@/lib/ai/noteMentions';
import { MAX_CHAT_COMPOSER_INTERACTIVE_TEXT_CHARS } from '@/lib/ui/composerTextLimit';
import {
  buildMentionPreviewParts,
  type NoteMentionCandidate,
} from '../noteMentionHelpers';
import { isMentionPreviewRange } from './noteMentionKeyboard';
import { normalizeMentionReferencesForState } from './noteMentionStateNormalize';
import type { UseNoteMentionStateOptions } from './noteMentionStateTypes';

interface UseNoteMentionSynchronizationOptions {
  allNoteCandidates: NoteMentionCandidate[];
  syncMentions: UseNoteMentionStateOptions['syncMentions'];
  value: string;
}

export function useNoteMentionSynchronization({
  allNoteCandidates,
  syncMentions,
  value,
}: UseNoteMentionSynchronizationOptions) {
  const [mentions, setMentions] = useState<NoteMentionReference[]>([]);
  const isOversizedValue = value.length > MAX_CHAT_COMPOSER_INTERACTIVE_TEXT_CHARS;
  const mentionPreviewParts = useMemo(
    () => isOversizedValue ? [] : buildMentionPreviewParts(value, mentions),
    [isOversizedValue, mentions, value],
  );
  const mentionRanges = useMemo(
    () => mentionPreviewParts.filter(isMentionPreviewRange),
    [mentionPreviewParts],
  );

  useEffect(() => {
    if (isOversizedValue) {
      return;
    }

    setMentions((previous) => {
      const next = normalizeMentionReferencesForState(syncMentions({
        allNoteCandidates,
        mentions: previous,
        value,
      }), false);
      const unchanged = next.length === previous.length && next.every((mention, index) =>
        mention.path === previous[index]?.path
        && mention.title === previous[index]?.title
        && mention.kind === previous[index]?.kind
      );
      return unchanged ? previous : next;
    });
  }, [allNoteCandidates, isOversizedValue, syncMentions, value]);

  const clearMentions = useCallback(() => {
    setMentions([]);
  }, []);

  const restoreMentions = useCallback((nextMentions: NoteMentionReference[]) => {
    setMentions(normalizeMentionReferencesForState(nextMentions, true));
  }, []);

  const getSynchronizedMentions = useCallback(
    () => normalizeMentionReferencesForState(syncMentions({
      allNoteCandidates,
      mentions,
      value,
    }), false),
    [allNoteCandidates, mentions, syncMentions, value],
  );

  return {
    mentions,
    setMentions,
    mentionPreviewParts,
    mentionRanges,
    clearMentions,
    restoreMentions,
    getSynchronizedMentions,
  };
}
