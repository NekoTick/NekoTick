import { useEffect, useRef, useState } from 'react';
import { editorViewCtx, serializerCtx } from '@milkdown/kit/core';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  normalizeAlternativeMathBlockFences,
  preserveMarkdownBlankLinesForEditor,
} from '@/lib/notes/markdown/markdownSerializationUtils';
import { themeEditorLayoutTokens } from '@/styles/themeTokens';
import { normalizeLeadingFrontmatterMarkdown } from './plugins/frontmatter/frontmatterMarkdown';
import type { ActiveMilkdownEditor } from './MilkdownEditorInnerTypes';
import {
  isEditorMarkdownEquivalentToNoteContent,
  replaceEditorMarkdown,
} from './milkdownEditorMarkdownReplacement';
import { logE2EMilkdownTiming } from './milkdownE2ETiming';
import {
  cacheCurrentNoteEditorHistory,
  createNoteEditorHistorySession,
  restoreEditorHistoryState,
  type CachedNoteEditorHistory,
  type NoteEditorHistorySession,
} from './milkdownEditorHistorySession';
import { removeTemporaryTailParagraph } from './plugins/cursor/endBlankClickPlugin';
import { floatingToolbarKey } from './plugins/floating-toolbar/floatingToolbarKey';
import { clearFormatPreview } from './plugins/floating-toolbar/previewStyles';
import { TOOLBAR_ACTIONS } from './plugins/floating-toolbar/types';

export function useMilkdownExternalContentSync(args: {
  activatedRevision: number;
  canSyncContent: boolean;
  currentNoteContent: string;
  currentNoteDiskRevision: number;
  currentNotePath: string | undefined;
  get: (() => unknown) | undefined;
  lastAppliedNoteRef: React.MutableRefObject<{
    path: string | undefined;
    diskRevision: number;
    content: string;
  }>;
  reportEditorContentSyncFailure?: () => void;
  reportEditorReady: (editor: ActiveMilkdownEditor) => void;
  shouldPreserveLiveEditorContent: () => boolean;
}) {
  const {
    activatedRevision,
    canSyncContent,
    currentNoteContent,
    currentNoteDiskRevision,
    currentNotePath,
    get,
    lastAppliedNoteRef,
    reportEditorContentSyncFailure,
    reportEditorReady,
    shouldPreserveLiveEditorContent,
  } = args;
  const historySessionRef = useRef<NoteEditorHistorySession | null>(null);
  const failedSyncTargetRef = useRef<{
    content: string;
    diskRevision: number;
    path: string | undefined;
  } | null>(null);
  const [retryRevision, setRetryRevision] = useState(0);

  useEffect(() => {
    if (!canSyncContent) {
      return;
    }

    const lastAppliedNote = lastAppliedNoteRef.current;
    let restoreFrame = 0;
    let restoreTimeout = 0;
    let syncRetryFrame = 0;
    const isCurrentSyncTarget = (target: typeof failedSyncTargetRef.current) => (
      target?.path === currentNotePath &&
      target.diskRevision === currentNoteDiskRevision &&
      target.content === currentNoteContent
    );
    const clearSyncFailure = () => {
      failedSyncTargetRef.current = null;
    };
    const handleSyncFailure = () => {
      if (isCurrentSyncTarget(failedSyncTargetRef.current)) {
        reportEditorContentSyncFailure?.();
        return;
      }

      failedSyncTargetRef.current = {
        path: currentNotePath,
        diskRevision: currentNoteDiskRevision,
        content: currentNoteContent,
      };
      syncRetryFrame = window.requestAnimationFrame(() => {
        setRetryRevision((revision) => revision + 1);
      });
    };

    try {
      const editor = get?.() as ActiveMilkdownEditor | undefined;
      const runEditorAction = editor?.action;
      if (!editor || !runEditorAction) {
        return;
      }

      const view = editor.ctx.get(editorViewCtx) as EditorView;
      const historySession = historySessionRef.current
        ?? createNoteEditorHistorySession(view);
      historySessionRef.current = historySession;

      const isSameNotePath = lastAppliedNote.path === currentNotePath;
      if (!isSameNotePath) {
        clearFormatPreview(view);
        view.dispatch(
          view.state.tr
            .setMeta(floatingToolbarKey, { type: TOOLBAR_ACTIONS.HIDE })
            .setMeta('addToHistory', false),
        );
      }
      let liveSerializer: ((doc: unknown) => string) | null = null;
      try {
        liveSerializer = editor.ctx.get(serializerCtx) as (doc: unknown) => string;
      } catch {
        liveSerializer = null;
      }
      if (!isSameNotePath && lastAppliedNote.path && historySession && liveSerializer) {
        try {
          removeTemporaryTailParagraph(view);
          cacheCurrentNoteEditorHistory(
            view,
            historySession,
            lastAppliedNote.path,
            liveSerializer(view.state.doc),
          );
        } catch {
          historySession.entries.delete(lastAppliedNote.path);
        }
      }

      const isLastAppliedTargetCurrent =
        lastAppliedNote.path === currentNotePath &&
        lastAppliedNote.diskRevision === currentNoteDiskRevision &&
        lastAppliedNote.content === currentNoteContent;
      if (liveSerializer && isSameNotePath) {
        try {
          const serializedCurrentDoc = liveSerializer(view.state.doc);
          if (isEditorMarkdownEquivalentToNoteContent(serializedCurrentDoc, currentNoteContent)) {
            lastAppliedNoteRef.current = {
              path: currentNotePath,
              diskRevision: currentNoteDiskRevision,
              content: currentNoteContent,
            };
            clearSyncFailure();
            reportEditorReady(editor);
            return;
          }
          if (isLastAppliedTargetCurrent && shouldPreserveLiveEditorContent()) {
            return;
          }
        } catch {
        }
      }
      const scrollRoot = view.dom.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
      const scrollTop = isSameNotePath ? scrollRoot?.scrollTop ?? null : null;
      const prepareStartedAt = performance.now();
      const normalizedFrontmatter = normalizeLeadingFrontmatterMarkdown(
        normalizeAlternativeMathBlockFences(currentNoteContent)
      );
      const nextMarkdown = preserveMarkdownBlankLinesForEditor(normalizedFrontmatter);
      let cachedHistory: CachedNoteEditorHistory | null = null;
      if (!isSameNotePath && currentNotePath && historySession) {
        const cached = historySession.entries.get(currentNotePath);
        if (cached && isEditorMarkdownEquivalentToNoteContent(cached.markdown, currentNoteContent)) {
          cachedHistory = cached;
        } else if (cached) {
          historySession.entries.delete(currentNotePath);
        }
      }
      logE2EMilkdownTiming('replace-prepare', {
        notePath: currentNotePath,
        inputLength: currentNoteContent.length,
        outputLength: nextMarkdown.length,
        durationMs: Math.round(performance.now() - prepareStartedAt),
      });

      const replaceStartedAt = performance.now();
      const replaced = runEditorAction((ctx) => {
        const didReplace = replaceEditorMarkdown(ctx, nextMarkdown, {
          replacementDoc: cachedHistory?.doc,
          resetSelection: !isSameNotePath,
        });
        if (!didReplace || !historySession) {
          return didReplace;
        }

        const updatedView = ctx.get(editorViewCtx) as EditorView;
        const canRestoreCachedHistory = Boolean(
          cachedHistory && updatedView.state.doc.eq(cachedHistory.doc),
        );
        restoreEditorHistoryState(
          updatedView,
          historySession,
          canRestoreCachedHistory
            ? cachedHistory!.historyState
            : historySession.emptyHistoryState,
        );
        if (cachedHistory && !canRestoreCachedHistory && currentNotePath) {
          historySession.entries.delete(currentNotePath);
        }
        return true;
      });
      logE2EMilkdownTiming('replace-dispatch', {
        notePath: currentNotePath,
        replaced,
        durationMs: Math.round(performance.now() - replaceStartedAt),
      });
      if (!replaced) {
        handleSyncFailure();
        return;
      }

      let hasExpectedContent = false;
      if (liveSerializer) {
        try {
          hasExpectedContent = isEditorMarkdownEquivalentToNoteContent(
            liveSerializer(view.state.doc),
            currentNoteContent,
          );
        } catch {
          hasExpectedContent = false;
        }
      }
      if (!hasExpectedContent) {
        handleSyncFailure();
        return;
      }

      lastAppliedNoteRef.current = {
        path: currentNotePath,
        diskRevision: currentNoteDiskRevision,
        content: currentNoteContent,
      };
      clearSyncFailure();
      reportEditorReady(editor);

      if (scrollRoot && scrollTop !== null) {
        const restoreScroll = () => {
          scrollRoot.scrollTop = scrollTop;
        };
        restoreFrame = requestAnimationFrame(restoreScroll);
        restoreTimeout = window.setTimeout(
          restoreScroll,
          themeEditorLayoutTokens.restoreScrollFallbackDelayMs
        );
      }
    } catch {
      handleSyncFailure();
    }

    return () => {
      cancelAnimationFrame(restoreFrame);
      cancelAnimationFrame(syncRetryFrame);
      window.clearTimeout(restoreTimeout);
    };
  }, [
    activatedRevision,
    canSyncContent,
    currentNoteContent,
    currentNoteDiskRevision,
    currentNotePath,
    get,
    reportEditorContentSyncFailure,
    reportEditorReady,
    retryRevision,
    shouldPreserveLiveEditorContent,
  ]);

}
