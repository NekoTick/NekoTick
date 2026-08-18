import { useEffect, useRef, useState } from "react";
import {
  canStartChatSelection, computeStateFromSelection, createSelectionSnapshot,
  getSelectionTextForComposer, getStateSignature, isInsideChatScrollable, isInsideMessageItem,
  isInsideSelectionExcluded, isInsideSelectionSurface, isSameRange, isSelectionFullyInsideChatMessages,
  restoreSelectionSnapshot, resolveOutsideMoveDecision, setChatSelectionLock,
  type LastValidSelectionSnapshot, type SelectionInsertState,
} from "./chatSelectionBehavior";
import { dispatchChatSelectionStreamFreeze } from "./chatSelectionStreamFreeze";
import { addSelectionInsertEventListeners } from "./selectionInsertEventListeners";
export function useSelectionInsertState() {
  const [state, setState] = useState<SelectionInsertState | null>(null);
  const isSelectingFromChatRef = useRef(false);
  const isPointerInsideSelectionSurfaceRef = useRef(true);
  const isPointerInsideMessageItemRef = useRef(true);
  const isSelectionFrozenRef = useRef(false);
  const lastValidSelectionRef = useRef<LastValidSelectionSnapshot | null>(null);
  const isRestoringRangeRef = useRef(false);
  const lastStateSignatureRef = useRef("");
  const isChatSelectionLockedRef = useRef(false);

  useEffect(() => {
    const restoreLastValidSelection = (options?: { force?: boolean }) => {
      const force = options?.force ?? false;
      if (typeof window === "undefined") {
        return false;
      }
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        return false;
      }
      const range = selection.getRangeAt(0);
      const isRangeInsideChat = isSelectionFullyInsideChatMessages(selection, range);
      if (isRangeInsideChat && isPointerInsideSelectionSurfaceRef.current) {
        const normalizedText = getSelectionTextForComposer(selection, range);
        if (!normalizedText) {
          return false;
        }
        lastValidSelectionRef.current = createSelectionSnapshot(selection, range, normalizedText);
        return false;
      }
      if (!lastValidSelectionRef.current) {
        return false;
      }
      const currentText = getSelectionTextForComposer(selection, range);
      if (!force && currentText && currentText === lastValidSelectionRef.current.text) {
        return false;
      }
      if (!force && isSameRange(range, lastValidSelectionRef.current.range)) {
        return false;
      }
      isRestoringRangeRef.current = true;
      const didRestore = restoreSelectionSnapshot(selection, lastValidSelectionRef.current);
      isRestoringRangeRef.current = false;
      return didRestore;
    };

    let outsideClampRaf: number | null = null;
    let mouseUpRaf: number | null = null;
    let syncStateRaf: number | null = null;
    const stopOutsideClamp = () => {
      if (outsideClampRaf !== null) {
        cancelAnimationFrame(outsideClampRaf);
        outsideClampRaf = null;
      }
    };
    const stopMouseUpRaf = () => {
      if (mouseUpRaf !== null) {
        cancelAnimationFrame(mouseUpRaf);
        mouseUpRaf = null;
      }
    };
    const stopSyncStateRaf = () => {
      if (syncStateRaf !== null) {
        cancelAnimationFrame(syncStateRaf);
        syncStateRaf = null;
      }
    };
    const resetSelectionInteractionState = () => {
      isSelectingFromChatRef.current = false;
      isPointerInsideSelectionSurfaceRef.current = true;
      isPointerInsideMessageItemRef.current = true;
      isSelectionFrozenRef.current = false;
      lastValidSelectionRef.current = null;
      stopOutsideClamp();
      if (isChatSelectionLockedRef.current) {
        isChatSelectionLockedRef.current = false;
        setChatSelectionLock(false);
      }
    };
    const setSelectionLockIfChanged = (active: boolean) => {
      if (isChatSelectionLockedRef.current === active) {
        return;
      }
      isChatSelectionLockedRef.current = active;
      setChatSelectionLock(active);
    };
    const startOutsideClamp = () => {
      if (outsideClampRaf !== null) {
        return;
      }
      const tick = () => {
        if (!isSelectingFromChatRef.current || !isSelectionFrozenRef.current) {
          outsideClampRaf = null;
          return;
        }
        restoreLastValidSelection({ force: true });
        outsideClampRaf = requestAnimationFrame(tick);
      };
      outsideClampRaf = requestAnimationFrame(tick);
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }
      const target = event.target;
      isSelectingFromChatRef.current = target instanceof Element && canStartChatSelection(target);
      if (
        !isSelectingFromChatRef.current &&
        target instanceof Element &&
        isInsideChatScrollable(target) &&
        !isInsideSelectionExcluded(target)
      ) {
        window.getSelection()?.removeAllRanges();
        lastStateSignatureRef.current = "";
        setState(null);
      }
      if (isSelectingFromChatRef.current && target instanceof Element) {
        dispatchChatSelectionStreamFreeze({
          button: event.button,
          clientX: event.clientX,
          clientY: event.clientY,
          source: "mousedown",
          target,
        });
      }
      isPointerInsideSelectionSurfaceRef.current =
        target instanceof Element && isInsideSelectionSurface(target);
      isPointerInsideMessageItemRef.current =
        target instanceof Element && isInsideMessageItem(target);
      isSelectionFrozenRef.current = false;
      lastValidSelectionRef.current = null;
      stopOutsideClamp();
      setSelectionLockIfChanged(false);
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!isSelectingFromChatRef.current) {
        return;
      }
      if ((event.buttons & 1) === 0) {
        return;
      }
      const target = event.target;
      isPointerInsideSelectionSurfaceRef.current =
        target instanceof Element && isInsideSelectionSurface(target);
      isPointerInsideMessageItemRef.current =
        target instanceof Element && isInsideMessageItem(target);
      const pointerInsideSelectionBoundary =
        isPointerInsideSelectionSurfaceRef.current || isPointerInsideMessageItemRef.current;
      const decision = resolveOutsideMoveDecision({
        isSelectingFromChat: isSelectingFromChatRef.current,
        pointerInsideSelectionSurface: pointerInsideSelectionBoundary,
        isSelectionFrozen: isSelectionFrozenRef.current,
      });
      if (decision.nextFrozen !== isSelectionFrozenRef.current) {
        isSelectionFrozenRef.current = decision.nextFrozen;
        setSelectionLockIfChanged(decision.nextFrozen);
        if (decision.nextFrozen) {
          startOutsideClamp();
        } else {
          stopOutsideClamp();
        }
      }
      if (!decision.shouldPreventDefault) {
        return;
      }
      event.preventDefault();
      if (decision.shouldRestore) {
        restoreLastValidSelection({ force: true });
      }
    };

    const handleSelectStart = (event: Event) => {
      if (
        !isSelectingFromChatRef.current ||
        isPointerInsideSelectionSurfaceRef.current ||
        isPointerInsideMessageItemRef.current
      ) {
        return;
      }
      event.preventDefault();
    };

    const handleMouseUp = () => {
      if (isSelectingFromChatRef.current && !isPointerInsideMessageItemRef.current) {
        restoreLastValidSelection({ force: true });
      }
      stopMouseUpRaf();
      mouseUpRaf = requestAnimationFrame(() => {
        mouseUpRaf = null;
        resetSelectionInteractionState();
        const nextState = computeStateFromSelection();
        lastStateSignatureRef.current = getStateSignature(nextState);
        setState(nextState);
      });
    };

    const handleForceReset = () => {
      stopSyncStateRaf();
      resetSelectionInteractionState();
      const nextState = computeStateFromSelection();
      lastStateSignatureRef.current = getStateSignature(nextState);
      setState(nextState);
    };

    const handleWindowBlur = () => {
      resetSelectionInteractionState();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        resetSelectionInteractionState();
        lastStateSignatureRef.current = "";
        setState(null);
        return;
      }
      scheduleSyncState();
    };

    const syncState = () => {
      if (isRestoringRangeRef.current || typeof window === "undefined") {
        return;
      }

      if (isSelectingFromChatRef.current) {
        const pointerInsideSelectionBoundary =
          isPointerInsideSelectionSurfaceRef.current || isPointerInsideMessageItemRef.current;
        if (isPointerInsideSelectionSurfaceRef.current) {
          restoreLastValidSelection();
        } else if (!pointerInsideSelectionBoundary) {
          restoreLastValidSelection({ force: true });
          return;
        }
      }

      const nextState = computeStateFromSelection();
      const nextStateSignature = getStateSignature(nextState);
      if (nextStateSignature === lastStateSignatureRef.current) {
        return;
      }
      lastStateSignatureRef.current = nextStateSignature;
      setState(nextState);
    };

    const scheduleSyncState = () => {
      if (syncStateRaf !== null) {
        return;
      }

      syncStateRaf = requestAnimationFrame(() => {
        syncStateRaf = null;
        syncState();
      });
    };
    const handleViewportChange = () => {
      if (
        lastStateSignatureRef.current === "" &&
        !isSelectingFromChatRef.current &&
        !lastValidSelectionRef.current
      ) {
        return;
      }
      scheduleSyncState();
    };
    const handleSelectionChange = () => {
      if (isSelectingFromChatRef.current) {
        stopSyncStateRaf();
        syncState();
        return;
      }

      scheduleSyncState();
    };

    const removeEventListeners = addSelectionInsertEventListeners({
      handleForceReset,
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
      handleSelectStart,
      handleSelectionChange,
      handleViewportChange,
      handleVisibilityChange,
      handleWindowBlur,
      scheduleSyncState,
    });

    return () => {
      resetSelectionInteractionState();
      stopMouseUpRaf();
      stopSyncStateRaf();
      removeEventListeners();
    };
  }, []);

  const clearSelectionInsertState = () => {
    lastStateSignatureRef.current = "";
    setState(null);
  };

  return { clearSelectionInsertState, state };
}
