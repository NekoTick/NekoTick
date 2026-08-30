import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { EditorView } from '@milkdown/kit/prose/view';

import { useNotesStore } from '@/stores/useNotesStore';
import {
  COMPOSITION_APPEND_GUARD_MS,
  MAX_COMPOSITION_REPAIR_TEXT_LENGTH,
  canCommitSuppressedCompositionEdit,
  getCompositionClockMs,
  getEventData,
  hasNonAsciiText,
  isCompositionInputEvent,
  isContentEditingUserEvent,
  isInputEvent,
  shouldClearCompositionAppendGuard,
  shouldSuppressCompositionSelectionRepair,
} from './pendingMarkdownAutosaveEvents';
import type { CompositionStartSelection, PendingMarkdownSnapshot } from './pendingMarkdownAutosaveTypes';
import { scheduleCompositionCommitFinalization } from './pendingMarkdownCompositionCommit';
import {
  collapseCommittedCompositionSelection,
} from './pendingMarkdownCompositionRepair';
import { syncEditorSelectionFromDOM } from '../utils/editorSelection';
import {
  captureCompositionStartSelection,
  getCompositionSelectionAppend,
  getSelectedCompositionText,
  insertCompositionAppendText,
  replaceCompositionStartSelectionWithCommittedText,
  splitBlockAfterCommittedCompositionSelection,
} from './pendingMarkdownCompositionSelection';

interface PendingMarkdownUserInputMarkerOptions {
  isCompositionActiveRef: MutableRefObject<boolean>;
  compositionSettleTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  deferredCompositionMarkdownRef: MutableRefObject<string | null>;
  deferredCompositionUserInputVersionRef: MutableRefObject<number>;
  latestCompositionDataRef: MutableRefObject<string | null>;
  latestCompositionResidueDataRef: MutableRefObject<string | null>;
  hasCompositionEndedRef: MutableRefObject<boolean>;
  compositionStartSelectionRef: MutableRefObject<CompositionStartSelection | null>;
  compositionSessionRef: MutableRefObject<number>;
  compositionAppendPositionRef: MutableRefObject<number | null>;
  lastCompositionAppendPositionRef: MutableRefObject<number | null>;
  lastCompositionAppendAtRef: MutableRefObject<number>;
  lastCompositionCommitAtRef: MutableRefObject<number>;
  isCompositionSelectionRepairSuppressedRef: MutableRefObject<boolean>;
  allowDeferredCompositionMarkdownWithoutCommitRef: MutableRefObject<boolean>;
  pendingRawMarkdownRef: MutableRefObject<PendingMarkdownSnapshot | null>;
  pendingMarkdownRef: MutableRefObject<PendingMarkdownSnapshot | null>;
  pendingMarkdownApplyTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  editorUserInputBaseContentRef: MutableRefObject<string | null>;
  hasEditorUserInput: MutableRefObject<boolean>;
  userInputVersionRef: MutableRefObject<number>;
  currentNotePath: string | undefined;
  clearCompositionAppendGuard: () => void;
}

export function usePendingMarkdownUserInputMarker({
  isCompositionActiveRef,
  compositionSettleTimeoutRef,
  deferredCompositionMarkdownRef,
  deferredCompositionUserInputVersionRef,
  latestCompositionDataRef,
  latestCompositionResidueDataRef,
  hasCompositionEndedRef,
  compositionStartSelectionRef,
  compositionSessionRef,
  compositionAppendPositionRef,
  lastCompositionAppendPositionRef,
  lastCompositionAppendAtRef,
  lastCompositionCommitAtRef,
  isCompositionSelectionRepairSuppressedRef,
  allowDeferredCompositionMarkdownWithoutCommitRef,
  pendingRawMarkdownRef,
  pendingMarkdownRef,
  pendingMarkdownApplyTimeoutRef,
  editorUserInputBaseContentRef,
  hasEditorUserInput,
  userInputVersionRef,
  currentNotePath,
  clearCompositionAppendGuard,
}: PendingMarkdownUserInputMarkerOptions) {
  return useCallback((
    view: EditorView,
    _liveSerializer: ((doc: unknown) => string) | null
  ) => {
    let preserveNativeCompositionOnEnter = false;
    return (event: Event) => {
      if (
        event instanceof KeyboardEvent &&
        !isCompositionActiveRef.current &&
        !event.isComposing &&
        !view.composing &&
        view.hasFocus?.() === true
      ) {
        syncEditorSelectionFromDOM(view);
      }

      if (event.type === 'compositionstart') {
        compositionSessionRef.current += 1;
        isCompositionActiveRef.current = true;
        if (compositionSettleTimeoutRef.current !== null) {
          clearTimeout(compositionSettleTimeoutRef.current);
          compositionSettleTimeoutRef.current = null;
        }
        deferredCompositionMarkdownRef.current = null;
        deferredCompositionUserInputVersionRef.current = 0;
        latestCompositionDataRef.current = null;
        latestCompositionResidueDataRef.current = null;
        preserveNativeCompositionOnEnter = false;
        hasCompositionEndedRef.current = false;
        compositionStartSelectionRef.current = captureCompositionStartSelection(view);
        lastCompositionCommitAtRef.current = 0;
        isCompositionSelectionRepairSuppressedRef.current = false;
        allowDeferredCompositionMarkdownWithoutCommitRef.current = false;
        clearCompositionAppendGuard();
        pendingRawMarkdownRef.current = null;
        pendingMarkdownRef.current = null;
        return;
      }

      const isEnterDuringComposition = event instanceof KeyboardEvent &&
        event.key === 'Enter' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        isCompositionActiveRef.current &&
        !hasCompositionEndedRef.current;
      if (isEnterDuringComposition) {
        preserveNativeCompositionOnEnter = true;
      }

      if (event.type === 'compositionend') {
        if (hasCompositionEndedRef.current) {
          return;
        }
        isCompositionActiveRef.current = true;
        hasCompositionEndedRef.current = true;
        isCompositionSelectionRepairSuppressedRef.current = false;
        allowDeferredCompositionMarkdownWithoutCommitRef.current = false;
        clearCompositionAppendGuard();
        if (!preserveNativeCompositionOnEnter) {
          const compositionEndData = getEventData(event) ??
            (hasNonAsciiText(latestCompositionDataRef.current) ? latestCompositionDataRef.current : null) ??
            getSelectedCompositionText(view);
          if (compositionEndData) {
            const staleCompositionData = latestCompositionResidueDataRef.current ?? latestCompositionDataRef.current;
            const committedCompositionData = compositionEndData;
            const startSelection = compositionStartSelectionRef.current;
            const compositionSession = compositionSessionRef.current;
            latestCompositionDataRef.current = committedCompositionData;
            lastCompositionCommitAtRef.current = getCompositionClockMs();
            scheduleCompositionCommitFinalization(
              view,
              staleCompositionData,
              committedCompositionData,
              startSelection,
              () => compositionSessionRef.current === compositionSession && view.dom.isConnected,
            );
          }
        } else {
          // Enter confirms the native composition. Let ProseMirror's DOM observer
          // own the committed text instead of repairing an unrelated ASCII letter.
          isCompositionActiveRef.current = false;
          hasCompositionEndedRef.current = false;
          compositionStartSelectionRef.current = null;
          deferredCompositionMarkdownRef.current = null;
          deferredCompositionUserInputVersionRef.current = 0;
          latestCompositionDataRef.current = null;
          latestCompositionResidueDataRef.current = null;
          if (compositionSettleTimeoutRef.current !== null) {
            clearTimeout(compositionSettleTimeoutRef.current);
            compositionSettleTimeoutRef.current = null;
          }
          clearCompositionAppendGuard();
        }
        preserveNativeCompositionOnEnter = false;
      }

      const isCompositionEvent = isCompositionInputEvent(event);
      const isContentEditingEvent = isContentEditingUserEvent(event);
      const markUserInputVersion = () => {
        const currentNote = useNotesStore.getState().currentNote;
        editorUserInputBaseContentRef.current =
          currentNote && currentNote.path === currentNotePath ? currentNote.content : null;
        hasEditorUserInput.current = true;
        userInputVersionRef.current += 1;
      };
      const clearPendingApplyForFreshInput = () => {
        if (pendingMarkdownApplyTimeoutRef.current === null) {
          return;
        }
        clearTimeout(pendingMarkdownApplyTimeoutRef.current);
        pendingMarkdownApplyTimeoutRef.current = null;
        pendingMarkdownRef.current = null;
      };
      const finishCommittedCompositionSession = () => {
        compositionSessionRef.current += 1;
        isCompositionActiveRef.current = false;
        compositionStartSelectionRef.current = null;
        deferredCompositionMarkdownRef.current = null;
        deferredCompositionUserInputVersionRef.current = 0;
        allowDeferredCompositionMarkdownWithoutCommitRef.current = false;
        if (compositionSettleTimeoutRef.current !== null) {
          clearTimeout(compositionSettleTimeoutRef.current);
          compositionSettleTimeoutRef.current = null;
        }
        hasCompositionEndedRef.current = false;
        preserveNativeCompositionOnEnter = false;
        lastCompositionCommitAtRef.current = 0;
        clearCompositionAppendGuard();
      };
      const now = getCompositionClockMs();
      const activeAppendPosition = compositionAppendPositionRef.current !== null &&
        now - lastCompositionAppendAtRef.current <= COMPOSITION_APPEND_GUARD_MS
        ? compositionAppendPositionRef.current
        : null;
      if (compositionAppendPositionRef.current !== null && activeAppendPosition === null) {
        clearCompositionAppendGuard();
      }
      const hasRecentCompositionCommit = latestCompositionDataRef.current !== null &&
        lastCompositionCommitAtRef.current > 0 &&
        now - lastCompositionCommitAtRef.current <= COMPOSITION_APPEND_GUARD_MS;
      const shouldClearAppendGuard = shouldClearCompositionAppendGuard(event);
      const shouldSuppressSelectionRepair = shouldSuppressCompositionSelectionRepair(event);
      const compositionSelectionAppend = isContentEditingEvent
        && !isCompositionSelectionRepairSuppressedRef.current
        ? getCompositionSelectionAppend(
          view,
          event,
          hasCompositionEndedRef.current || activeAppendPosition !== null,
          latestCompositionDataRef.current,
          activeAppendPosition,
        )
        : null;

      if (compositionSelectionAppend) {
        clearPendingApplyForFreshInput();
        markUserInputVersion();
        const nextAppendPosition = insertCompositionAppendText(view, compositionSelectionAppend);
        if (nextAppendPosition !== null) {
          compositionAppendPositionRef.current = nextAppendPosition;
          lastCompositionAppendPositionRef.current = nextAppendPosition;
          lastCompositionAppendAtRef.current = getCompositionClockMs();
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }

      let compositionSelectionSplitPosition: number | null = null;
      if (
        event instanceof KeyboardEvent &&
        event.key === 'Enter' &&
        isContentEditingEvent &&
        !isCompositionSelectionRepairSuppressedRef.current &&
        (hasCompositionEndedRef.current || activeAppendPosition !== null || hasRecentCompositionCommit)
      ) {
        clearPendingApplyForFreshInput();
        markUserInputVersion();
        finishCommittedCompositionSession();
        compositionSelectionSplitPosition = splitBlockAfterCommittedCompositionSelection(
          view,
          event,
          latestCompositionDataRef.current,
          activeAppendPosition ?? undefined,
        );
      }

      if (compositionSelectionSplitPosition !== null) {
        isCompositionActiveRef.current = false;
        compositionAppendPositionRef.current = compositionSelectionSplitPosition;
        lastCompositionAppendPositionRef.current = compositionSelectionSplitPosition;
        lastCompositionAppendAtRef.current = getCompositionClockMs();
        return;
      }

      const shouldRepairCompositionSelection = isCompositionActiveRef.current ||
        hasCompositionEndedRef.current ||
        activeAppendPosition !== null ||
        lastCompositionAppendPositionRef.current !== null;
      const isPendingCompositionTextCommit = isCompositionActiveRef.current &&
        !hasCompositionEndedRef.current &&
        isInputEvent(event) &&
        !event.isComposing &&
        event.inputType === 'insertText';
      if (isPendingCompositionTextCommit && event.cancelable) {
        const committedText = getEventData(event);
        if (committedText) {
          clearPendingApplyForFreshInput();
          markUserInputVersion();
          latestCompositionDataRef.current = committedText;
          if (replaceCompositionStartSelectionWithCommittedText(
            view,
            compositionStartSelectionRef.current,
            committedText,
          )) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
        }
      }
      if (
        !isCompositionEvent &&
        !isPendingCompositionTextCommit &&
        shouldRepairCompositionSelection &&
        !isCompositionSelectionRepairSuppressedRef.current
      ) {
        const recentAppendPosition = lastCompositionAppendPositionRef.current;
        const selectedCompositionText = recentAppendPosition !== null
          ? getSelectedCompositionText(view)
          : null;
        const collapsedKnownComposition = collapseCommittedCompositionSelection(
          view,
          latestCompositionDataRef.current ?? selectedCompositionText ?? '',
          activeAppendPosition ?? recentAppendPosition ?? undefined,
        );
        if (collapsedKnownComposition && recentAppendPosition !== null) {
          lastCompositionAppendPositionRef.current = null;
        }
        if (!collapsedKnownComposition && (isCompositionActiveRef.current || hasCompositionEndedRef.current)) {
          const selectedCompositionText = getSelectedCompositionText(view);
          if (
            selectedCompositionText &&
            selectedCompositionText.length <= MAX_COMPOSITION_REPAIR_TEXT_LENGTH
          ) {
            collapseCommittedCompositionSelection(view, selectedCompositionText);
          }
        }
      }

      if (shouldSuppressSelectionRepair) {
        isCompositionSelectionRepairSuppressedRef.current = true;
      }
      if (shouldClearAppendGuard) {
        clearCompositionAppendGuard();
      }
      if (
        !isCompositionEvent &&
        isContentEditingEvent &&
        hasCompositionEndedRef.current
      ) {
        finishCommittedCompositionSession();
      }

      if (isInputEvent(event)) {
        const inputData = getEventData(event);
        if (
          inputData &&
          (
            event.inputType === 'insertCompositionText' ||
            event.inputType === 'insertFromComposition' ||
            event.isComposing ||
            (isCompositionActiveRef.current && !hasCompositionEndedRef.current)
          )
        ) {
          latestCompositionDataRef.current = inputData;
          if (event.inputType === 'insertCompositionText' && !hasNonAsciiText(inputData)) {
            latestCompositionResidueDataRef.current = inputData;
          }
        }
      }

      if (!isContentEditingEvent) {
        return;
      }

      if (isEnterDuringComposition) {
        markUserInputVersion();
        return;
      }

      if (
        isCompositionSelectionRepairSuppressedRef.current &&
        !isCompositionEvent &&
        canCommitSuppressedCompositionEdit(event)
      ) {
        deferredCompositionMarkdownRef.current = null;
        deferredCompositionUserInputVersionRef.current = 0;
        allowDeferredCompositionMarkdownWithoutCommitRef.current = true;
      }

      if (!isCompositionEvent) {
        clearPendingApplyForFreshInput();
      }
      markUserInputVersion();
    };
  }, [clearCompositionAppendGuard, currentNotePath]);
}
