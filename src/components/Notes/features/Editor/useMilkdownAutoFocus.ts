import { useCallback, useEffect, useMemo } from 'react';
import { editorViewCtx } from '@milkdown/kit/core';
import { shouldUseLazyBlockVisibility } from './milkdownLargePlainMarkdown';

export function useMilkdownAutoFocus(args: {
  active: boolean;
  activatedRevision: number;
  currentDraftName: string | undefined;
  currentNoteContent: string;
  currentNoteDiskRevision: number;
  currentNotePath: string | undefined;
  get: (() => any) | undefined;
  hasAutoFocused: React.MutableRefObject<boolean>;
  hasScheduledAutoFocus: React.MutableRefObject<boolean>;
  isDraftNote: boolean;
  isNewlyCreated: boolean;
  lazyBlockVisibilityRef: React.MutableRefObject<{
    content: string;
    diskRevision: number;
    path: string | undefined;
    value: boolean;
  } | null>;
}) {
  const {
    active,
    activatedRevision,
    currentDraftName,
    currentNoteContent,
    currentNoteDiskRevision,
    currentNotePath,
    get,
    hasAutoFocused,
    hasScheduledAutoFocus,
    isDraftNote,
    isNewlyCreated,
    lazyBlockVisibilityRef,
  } = args;

  const isEmptyContent = useMemo(() => {
    const content = currentNoteContent.trim();
    return content.length === 0 || /^#\s*$/.test(content);
  }, [currentNoteContent]);

  const shouldKeepFocusOnEmptyDraftTitle = isDraftNote && isEmptyContent && !currentDraftName?.trim();
  const shouldFocusEmptyDraftBody =
    isDraftNote && !isNewlyCreated && isEmptyContent && !shouldKeepFocusOnEmptyDraftTitle;
  if (
    lazyBlockVisibilityRef.current?.path !== currentNotePath ||
    lazyBlockVisibilityRef.current?.diskRevision !== currentNoteDiskRevision ||
    lazyBlockVisibilityRef.current?.content !== currentNoteContent
  ) {
    lazyBlockVisibilityRef.current = {
      content: currentNoteContent,
      diskRevision: currentNoteDiskRevision,
      path: currentNotePath,
      value: shouldUseLazyBlockVisibility(currentNoteContent),
    };
  }
  const useLazyBlockVisibility = lazyBlockVisibilityRef.current.value;

  const focusEditorBody = useCallback(() => {
    try {
      const editor = get?.();
      if (!editor) {
        return false;
      }

      const view = editor.ctx.get(editorViewCtx);
      if (!view) {
        return false;
      }

      view.focus();
      return true;
    } catch {
      return false;
    }
  }, [get]);

  useEffect(() => {
    if (!active || !get || hasAutoFocused.current || hasScheduledAutoFocus.current) return;
    if (isNewlyCreated || shouldKeepFocusOnEmptyDraftTitle) {
      return;
    }

    hasScheduledAutoFocus.current = true;

    const timer = setTimeout(() => {
      const focused = focusEditorBody();
      hasScheduledAutoFocus.current = false;
      if (focused) {
        hasAutoFocused.current = true;
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      hasScheduledAutoFocus.current = false;
    };
  }, [
    active,
    activatedRevision,
    currentNotePath,
    focusEditorBody,
    get,
    isNewlyCreated,
    shouldKeepFocusOnEmptyDraftTitle,
  ]);

  useEffect(() => {
    if (!active || !shouldFocusEmptyDraftBody || hasAutoFocused.current) return;
    const frame = requestAnimationFrame(() => {
      if (!shouldFocusEmptyDraftBody || hasAutoFocused.current) return;
      const focused = focusEditorBody();
      if (focused) {
        hasAutoFocused.current = true;
      }
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [active, currentNotePath, focusEditorBody, shouldFocusEmptyDraftBody]);

  return { useLazyBlockVisibility };
}
