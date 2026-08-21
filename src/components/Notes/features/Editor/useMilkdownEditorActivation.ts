import { useCallback } from 'react';
import { editorViewCtx, parserCtx, serializerCtx } from '@milkdown/kit/core';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { Parser } from '@milkdown/kit/transformer';
import {
  clearCurrentMarkdownRuntime,
  getCurrentEditorView,
  setCurrentEditorBlockSelectionClearer,
  setCurrentEditorView,
  setCurrentMarkdownRuntime,
} from './utils/editorViewRegistry';
import {
  clearCurrentEditorBlockPositionSnapshot,
  createCurrentEditorBlockPositionController,
} from './utils/editorBlockPositionCache';
import { clearBlockSelection } from './plugins/cursor/blockSelectionPluginState';
import { handleLeadingEmptyParagraphBackspace } from './plugins/cursor/leadingEmptyParagraphBackspace';
import { normalizeInitialEditorSelection } from './milkdownEditorMarkdownReplacement';
import type { ActiveMilkdownEditor } from './MilkdownEditorInnerTypes';

export function useMilkdownEditorActivation(args: {
  activeRef: React.MutableRefObject<boolean>;
  activatedEditorRef: React.MutableRefObject<ActiveMilkdownEditor | null>;
  activationCleanupRef: React.MutableRefObject<(() => void) | null>;
  createUserInputMarker: (view: EditorView, serializer: ((doc: unknown) => string) | null) => (event: Event) => void;
  currentNoteContentRef: React.MutableRefObject<string>;
  currentNoteDiskRevision: number;
  currentNotePath: string | undefined;
  onEditorViewReadyRef: React.MutableRefObject<(() => void) | undefined>;
  onEditorActivationFailure?: (error: unknown) => void;
  readyReportedRef: React.MutableRefObject<{
    content: string;
    diskRevision: number;
    editor: ActiveMilkdownEditor;
    path: string | undefined;
  } | null>;
  setActivatedRevision: React.Dispatch<React.SetStateAction<number>>;
}) {
  const {
    activeRef,
    activatedEditorRef,
    activationCleanupRef,
    createUserInputMarker,
    currentNoteContentRef,
    currentNoteDiskRevision,
    currentNotePath,
    onEditorActivationFailure,
    onEditorViewReadyRef,
    readyReportedRef,
    setActivatedRevision,
  } = args;

  const cleanupActivatedEditor = useCallback(() => {
    activationCleanupRef.current?.();
    activationCleanupRef.current = null;
    activatedEditorRef.current = null;
  }, []);

  const reportEditorReady = useCallback((editor: ActiveMilkdownEditor) => {
    if (
      !activeRef.current
      || editor.status !== 'Created'
      || activatedEditorRef.current !== editor
    ) {
      return;
    }

    const readyReported = readyReportedRef.current;
    if (
      readyReported?.editor === editor &&
      readyReported.path === currentNotePath &&
      readyReported.diskRevision === currentNoteDiskRevision &&
      readyReported.content === currentNoteContentRef.current
    ) {
      return;
    }

    let view: EditorView;
    try {
      view = editor.ctx.get(editorViewCtx) as EditorView;
    } catch {
      // The provider can invalidate its context while a stale readiness callback is in flight.
      return;
    }
    if (getCurrentEditorView() !== view) {
      return;
    }
    setCurrentEditorView(view, currentNotePath);
    onEditorViewReadyRef.current?.();
    readyReportedRef.current = {
      editor,
      path: currentNotePath,
      diskRevision: currentNoteDiskRevision,
      content: currentNoteContentRef.current,
    };
  }, [currentNoteDiskRevision, currentNotePath]);

  const activateEditor = useCallback((editor: ActiveMilkdownEditor) => {
    if (
      !activeRef.current
      || editor.status !== 'Created'
      || activatedEditorRef.current === editor
    ) {
      return;
    }

    cleanupActivatedEditor();
    let activatedView: EditorView | null = null;
    let cleanupPartialActivation: (() => void) | null = null;
    try {
      const view = editor.ctx.get(editorViewCtx) as EditorView;
      activatedView = view;
      let parser: Parser | null = null;
      let liveSerializer: ((doc: unknown) => string) | null = null;
      try {
        parser = editor.ctx.get(parserCtx) as Parser;
      } catch {
        parser = null;
      }
      try {
        liveSerializer = editor.ctx.get(serializerCtx) as (doc: unknown) => string;
      } catch {
        liveSerializer = null;
      }

      setCurrentEditorView(view, currentNotePath);
      setCurrentEditorBlockSelectionClearer(() => clearBlockSelection(view));
      try {
        normalizeInitialEditorSelection(view);
      } catch {
        // Keep editor activation alive even if a plugin rejects the startup selection normalization.
      }
      setActivatedRevision((revision) => revision + 1);

      const markUserInput = createUserInputMarker(view, liveSerializer);
      const markScopedUserInput = (event: Event) => {
        const target = event.target;
        if (!(target instanceof Node) || (target !== view.dom && !view.dom.contains(target))) {
          return;
        }
        if (event instanceof KeyboardEvent && handleLeadingEmptyParagraphBackspace(view, event)) {
          markUserInput(event);
          return;
        }
        markUserInput(event);
      };
      let blockPositionController: ReturnType<typeof createCurrentEditorBlockPositionController> | null = null;
      cleanupPartialActivation = () => {
        document.removeEventListener('beforeinput', markScopedUserInput, { capture: true });
        document.removeEventListener('keydown', markScopedUserInput, { capture: true });
        document.removeEventListener('compositionstart', markScopedUserInput, { capture: true });
        document.removeEventListener('compositionend', markScopedUserInput, { capture: true });
        document.removeEventListener('pointerdown', markScopedUserInput, { capture: true });
        document.removeEventListener('mousedown', markScopedUserInput, { capture: true });
        view.dom.removeEventListener('editor:image-user-input', markUserInput);
        view.dom.removeEventListener('editor:block-user-input', markUserInput);
        document.removeEventListener('paste', markScopedUserInput, { capture: true });
        document.removeEventListener('cut', markScopedUserInput, { capture: true });
        document.removeEventListener('drop', markScopedUserInput, { capture: true });
        blockPositionController?.destroy();
        if (getCurrentEditorView() === view) {
          setCurrentEditorView(null);
          setCurrentEditorBlockSelectionClearer(null);
          clearCurrentEditorBlockPositionSnapshot();
          clearCurrentMarkdownRuntime();
        }
      };
      document.addEventListener('beforeinput', markScopedUserInput, { capture: true });
      document.addEventListener('keydown', markScopedUserInput, { capture: true });
      document.addEventListener('compositionstart', markScopedUserInput, { capture: true });
      document.addEventListener('compositionend', markScopedUserInput, { capture: true });
      document.addEventListener('pointerdown', markScopedUserInput, { capture: true });
      document.addEventListener('mousedown', markScopedUserInput, { capture: true });
      view.dom.addEventListener('editor:image-user-input', markUserInput);
      view.dom.addEventListener('editor:block-user-input', markUserInput);
      document.addEventListener('paste', markScopedUserInput, { capture: true });
      document.addEventListener('cut', markScopedUserInput, { capture: true });
      document.addEventListener('drop', markScopedUserInput, { capture: true });
      blockPositionController = createCurrentEditorBlockPositionController(view);
      setCurrentMarkdownRuntime({ parser, serializer: liveSerializer });
      activatedEditorRef.current = editor;
      activationCleanupRef.current = cleanupPartialActivation;
      cleanupPartialActivation = null;
    } catch (error) {
      try {
        cleanupPartialActivation?.();
      } catch {
        // Preserve the activation error.
      }
      if (activatedView && getCurrentEditorView() === activatedView) {
        setCurrentEditorView(null);
        setCurrentEditorBlockSelectionClearer(null);
        clearCurrentEditorBlockPositionSnapshot();
        clearCurrentMarkdownRuntime();
      }
      onEditorActivationFailure?.(error);
    }
  }, [
    cleanupActivatedEditor,
    createUserInputMarker,
    currentNotePath,
    onEditorActivationFailure,
  ]);


  return { activateEditor, cleanupActivatedEditor, reportEditorReady };
}
