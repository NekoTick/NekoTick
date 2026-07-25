import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { useNotesStore } from '@/stores/useNotesStore';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { EDITOR_LAYOUT_CLASS } from '@/lib/layout';
import {
  flushPendingEditorMarkdown,
  setPendingEditorMarkdownFlusher,
} from '@/stores/notes/pendingEditorMarkdown';
import { themeImageBlockStyleTokens } from '@/styles/themeTokens';
import { publishLiveMarkdownPreview } from './hooks/pendingMarkdownLivePreview';
import { registerCurrentEditorSaveFlusher } from './utils/editorSaveRegistry';
import { focusCurrentEmptyUntitledDraftTitle } from './utils/emptyUntitledDraftTitleFocus';
import { useEditorSave } from './hooks/useEditorSave';
import {
  fulfillEditorFocusIntent,
  subscribeEditorFocusIntent,
} from './utils/editorFocusIntent';

const NOTE_SCROLL_ROOT_SELECTOR = '[data-note-scroll-root="true"]';

export function MarkdownSourceEditor({
  active = true,
  currentNotePath,
  showBodyLineNumbers,
  saveNote,
  mode,
}: {
  active?: boolean;
  currentNotePath: string;
  showBodyLineNumbers: boolean;
  saveNote: (options?: { explicit?: boolean }) => Promise<void>;
  mode: 'source' | 'fallback';
}) {
  const { t } = useI18n();
  const updateContent = useNotesStore((state) => state.updateContent);
  const currentNoteContent = useNotesStore(
    useCallback((state) => (
      state.currentNote?.path === currentNotePath ? state.currentNote.content : ''
    ), [currentNotePath])
  );
  const currentNoteIsDirty = useNotesStore(useCallback(
    (state) => state.currentNote?.path === currentNotePath && state.isDirty,
    [currentNotePath]
  ));
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const draftRef = useRef(currentNoteContent);
  const committedDraftRef = useRef(currentNoteContent);
  const draftBaseContentRef = useRef(currentNoteContent);
  const lastFlushedSourceDraftRef = useRef<{ path: string; markdown: string }>({
    path: currentNotePath,
    markdown: currentNoteContent,
  });
  const isComposingRef = useRef(false);
  const textareaResizeFrameRef = useRef<number | null>(null);
  const contentCommitFrameRef = useRef<number | null>(null);
  const { debouncedSave: scheduleSave, flushSave: flushQueuedSave } = useEditorSave(saveNote);

  const fulfillFocusIntent = useCallback((path: string) => {
    if (!active || path !== currentNotePath) return;
    fulfillEditorFocusIntent(path, () => {
      const textarea = textareaRef.current;
      if (!textarea) return false;
      textarea.focus({ preventScroll: true });
      return document.activeElement === textarea;
    });
  }, [active, currentNotePath]);

  useEffect(() => {
    fulfillFocusIntent(currentNotePath);
    return subscribeEditorFocusIntent(fulfillFocusIntent);
  }, [active, currentNotePath, fulfillFocusIntent]);

  useEffect(() => {
    if (currentNoteIsDirty) scheduleSave();
  }, [currentNoteIsDirty, currentNotePath, scheduleSave]);
  const updateContentIfCurrentNoteIsActive = useCallback((markdown: string) => {
    const currentNote = useNotesStore.getState().currentNote;
    if (currentNote?.path !== currentNotePath) {
      return false;
    }
    if (currentNote.content !== draftBaseContentRef.current && currentNote.content !== markdown) {
      return false;
    }
    if (currentNote.content === markdown) {
      draftBaseContentRef.current = markdown;
      return true;
    }
    updateContent(markdown);
    publishLiveMarkdownPreview(currentNotePath, markdown);
    draftBaseContentRef.current = markdown;
    return true;
  }, [currentNotePath, updateContent]);

  const updateSourceDraft = useCallback((markdown: string) => {
    const currentNote = useNotesStore.getState().currentNote;
    if (
      currentNote?.path === currentNotePath &&
      draftRef.current === currentNote.content
    ) {
      draftBaseContentRef.current = currentNote.content;
    }
    draftRef.current = markdown;
  }, [currentNotePath]);

  const updateCommittedSourceDraft = useCallback((markdown: string) => {
    const currentNote = useNotesStore.getState().currentNote;
    if (
      currentNote?.path === currentNotePath &&
      committedDraftRef.current === currentNote.content
    ) {
      draftBaseContentRef.current = currentNote.content;
    }
    committedDraftRef.current = markdown;
  }, [currentNotePath]);

  const flushSourceMarkdownIfCurrent = useCallback((markdown: string) => {
    const currentNote = useNotesStore.getState().currentNote;
    if (currentNote?.path !== currentNotePath) {
      return false;
    }
    if (currentNote.content !== draftBaseContentRef.current && currentNote.content !== markdown) {
      return false;
    }
    if (currentNote.content === markdown) {
      draftBaseContentRef.current = markdown;
      return true;
    }
    const didFlush = flushPendingEditorMarkdown(currentNotePath, markdown);
    if (didFlush) {
      draftBaseContentRef.current = markdown;
      return true;
    }
    return false;
  }, [currentNotePath]);

  const resizeTextareaToContent = useCallback(() => {
    textareaResizeFrameRef.current = null;
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = themeImageBlockStyleTokens.heightAuto;
    textarea.style.height = `${Math.max(textarea.scrollHeight, textarea.clientHeight)}px`;
  }, []);

  const scheduleTextareaResize = useCallback(() => {
    if (textareaResizeFrameRef.current !== null) {
      return;
    }

    textareaResizeFrameRef.current = window.requestAnimationFrame(resizeTextareaToContent);
  }, [resizeTextareaToContent]);

  const flushScheduledContentCommit = useCallback(() => {
    if (contentCommitFrameRef.current !== null) {
      window.cancelAnimationFrame(contentCommitFrameRef.current);
      contentCommitFrameRef.current = null;
    }

    updateContentIfCurrentNoteIsActive(committedDraftRef.current);
  }, [updateContentIfCurrentNoteIsActive]);

  const scheduleContentCommit = useCallback(() => {
    if (contentCommitFrameRef.current !== null) {
      return;
    }

    contentCommitFrameRef.current = window.requestAnimationFrame(() => {
      contentCommitFrameRef.current = null;
      updateContentIfCurrentNoteIsActive(committedDraftRef.current);
    });
  }, [updateContentIfCurrentNoteIsActive]);

  useEffect(() => {
    if (textareaRef.current && textareaRef.current.value !== currentNoteContent) {
      const textarea = textareaRef.current;
      const selection = textarea.ownerDocument.activeElement === textarea && lastFlushedSourceDraftRef.current.path === currentNotePath
        ? [textarea.selectionStart, textarea.selectionEnd, textarea.selectionDirection] as const : null;
      textareaRef.current.value = currentNoteContent;
      if (selection) textarea.setSelectionRange(...selection);
    }
    draftRef.current = currentNoteContent;
    committedDraftRef.current = currentNoteContent;
    draftBaseContentRef.current = currentNoteContent;
    lastFlushedSourceDraftRef.current = {
      path: currentNotePath,
      markdown: currentNoteContent,
    };
    scheduleTextareaResize();
  }, [currentNoteContent, currentNotePath, scheduleTextareaResize]);

  useEffect(() => {
    scheduleTextareaResize();
    return () => {
      if (textareaResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(textareaResizeFrameRef.current);
        textareaResizeFrameRef.current = null;
      }
      if (contentCommitFrameRef.current !== null) {
        window.cancelAnimationFrame(contentCommitFrameRef.current);
        contentCommitFrameRef.current = null;
      }
    };
  }, [scheduleTextareaResize]);

  const flushSourceDraft = useCallback((options: { force?: boolean } = {}) => {
    if (isComposingRef.current && !options.force) {
      return false;
    }
    const markdown = isComposingRef.current ? committedDraftRef.current : draftRef.current;
    if (!isComposingRef.current) {
      committedDraftRef.current = markdown;
      flushScheduledContentCommit();
    }

    const lastFlushedDraft = lastFlushedSourceDraftRef.current;
    if (lastFlushedDraft.path === currentNotePath && lastFlushedDraft.markdown === markdown) {
      return true;
    }

    if (flushSourceMarkdownIfCurrent(markdown)) {
      lastFlushedSourceDraftRef.current = {
        path: currentNotePath,
        markdown,
      };
      return true;
    }

    return false;
  }, [currentNotePath, flushScheduledContentCommit, flushSourceMarkdownIfCurrent]);

  useEffect(() => {
    const unregisterPendingMarkdownFlusher = setPendingEditorMarkdownFlusher(flushSourceDraft);
    return () => {
      flushSourceDraft({ force: true });
      unregisterPendingMarkdownFlusher();
    };
  }, [flushSourceDraft]);

  useEffect(() => {
    return () => {
      flushSourceDraft({ force: true });
      if (mode === 'source') {
        void saveNote({ explicit: false }).catch(() => undefined);
      }
    };
  }, [flushSourceDraft, mode, saveNote]);

  const flushSave = useCallback(async () => {
    flushSourceDraft({ force: true });
    await flushQueuedSave();
  }, [flushQueuedSave, flushSourceDraft]);

  useEffect(() => registerCurrentEditorSaveFlusher(flushSave), [flushSave]);

  const handleSourceMouseDownCapture = useCallback((event: ReactMouseEvent<HTMLTextAreaElement>) => {
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

    if (focusCurrentEmptyUntitledDraftTitle(
      event.currentTarget.closest(NOTE_SCROLL_ROOT_SELECTOR) ?? event.currentTarget.ownerDocument,
    )) {
      event.preventDefault();
    }
  }, []);

  return <div
      className={cn(
        'milkdown-editor theme-vlaina is-live-preview max is-readable-line-width min-h-[var(--vlaina-height-editor-min)]',
        showBodyLineNumbers && 'markdown-body-line-numbers',
        EDITOR_LAYOUT_CLASS
      )}
      data-note-content-root="true"
      data-vlaina-markdown-font-size-surface="true"
      data-markdown-theme-root="true"
      data-markdown-theme-platform="vlaina"
      data-markdown-compat="native"
      data-markdown-compat-layer="native"
      data-note-source-editor-mode={mode}
      data-note-source-fallback={mode === 'fallback' ? 'true' : undefined}
      data-note-source-mode={mode === 'source' ? 'true' : undefined}
    >
      <textarea
        ref={textareaRef}
        data-note-source-editor="true"
        data-native-caret-overlay-disabled="true"
        defaultValue={currentNoteContent}
        autoFocus={mode === 'source' && active}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={(event) => {
          isComposingRef.current = false;
          const nextValue = event.currentTarget.value;
          updateSourceDraft(nextValue);
          updateCommittedSourceDraft(nextValue);
          scheduleContentCommit();
          scheduleTextareaResize();
          scheduleSave();
        }}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          updateSourceDraft(nextValue);
          scheduleTextareaResize();
          if (isComposingRef.current || Boolean((event.nativeEvent as InputEvent).isComposing)) {
            return;
          }
          updateCommittedSourceDraft(nextValue);
          scheduleContentCommit();
          scheduleSave();
        }}
        onBlur={flushSave}
        onMouseDownCapture={handleSourceMouseDownCapture}
        spellCheck={false}
        aria-label={t('editor.markdownSourceEditor')}
        className="block min-h-[var(--vlaina-height-prosemirror-min)] w-full resize-none overflow-hidden bg-transparent px-0 py-2 pb-[var(--vlaina-height-prosemirror-bottom-padding)] font-mono text-[length:var(--vlaina-markdown-font-body-size)] leading-[var(--vlaina-markdown-line-height-body)] text-[var(--vlaina-text-primary)] outline-none"
      />
    </div>;
}
