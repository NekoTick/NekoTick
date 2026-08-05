import {
  useRef,
  useCallback,
  useState,
  useMemo,
} from "react";
import type { CurrentTurnAnchorMode, MessageAutoscrollBehavior, UseMessageAutoscrollOptions } from "./messageAutoscrollTypes";
import {
  findLastUserMessageIndex,
  restoreCurrentTurnAnchorIfOutputFitsForContainer,
  scrollCurrentTurnIntoViewForContainer,
} from "./messageAutoscrollAnchoring";
import {
  hasVisibleAssistantOutputAfterLastUser,
  updateMessageAutoscrollSpacers,
} from "./messageAutoscrollSpacer";
import { scheduleActiveOutputFollow } from "./messageAutoscrollFollow";
import { useMessageAutoscrollLifecycle } from "./messageAutoscrollLifecycle";
import { useMessageAutoscrollObservers } from "./messageAutoscrollObservers";
import {
  useMessageAutoscrollActions,
} from './messageAutoscrollActions';

export const useMessageAutoscroll = ({
  active = true,
  messages,
  isStreaming,
  chatId,
  estimateMessageHeight,
  estimateLoadingHeight,
  showLoading = false,
}: UseMessageAutoscrollOptions): MessageAutoscrollBehavior => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const updateSpacerHeightRef = useRef<() => void>(() => {});
  const scrollActiveOutputIfNeededRef = useRef<() => void>(() => {});
  const restoreCurrentTurnAnchorIfOutputFitsRef = useRef<() => boolean>(() => false);
  const isStreamingRef = useRef(isStreaming);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const contentResizeObserverRef = useRef<ResizeObserver | null>(null);
  const activeOutputFollowRafRef = useRef<number | null>(null);
  const spacerUpdateRafRef = useRef<number | null>(null);
  const observedContainerRef = useRef<HTMLDivElement | null>(null);
  const observedContentRef = useRef<Element | null>(null);
  const messagesRef = useRef(messages);
  const activeRef = useRef(active);
  const pendingScrollToCurrentTurnRef = useRef(false);
  const pendingScrollMessageCountRef = useRef<number | null>(null);
  const pendingChatCreationAnchorRef = useRef(false);
  const isCurrentTurnAnchoredRef = useRef(false);
  const currentTurnAnchorModeRef = useRef<CurrentTurnAnchorMode>("near-composer");
  const userDetachedFromCurrentTurnRef = useRef(false);
  const isAutoFollowRef = useRef(true);
  const programmaticScrollTopRef = useRef<number | null>(null);
  const lastObservedScrollTopRef = useRef<number | null>(null);
  const lastTouchYRef = useRef<number | null>(null);
  const isPointerInsideScrollRootRef = useRef(false);
  const lastContainerHeightRef = useRef(0);
  const prevChatIdRef = useRef<string | null>(chatId);
  const initialScrollPendingRef = useRef(!!chatId);
  const [spacerHeight, setSpacerHeight] = useState(0);
  const spacerHeightRef = useRef(0);
  const [currentTurnTopSpacerHeight, setCurrentTurnTopSpacerHeight] = useState(0);
  const currentTurnTopSpacerHeightRef = useRef(0);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false);
  activeRef.current = active;

  const currentTurnActionRefs = useMemo(() => ({
    currentTurnAnchorModeRef, isAutoFollowRef, isCurrentTurnAnchoredRef, pendingChatCreationAnchorRef,
    pendingScrollMessageCountRef, pendingScrollToCurrentTurnRef, userDetachedFromCurrentTurnRef,
  }), []);

  const getLastUserMessageIndex = useCallback(() => {
    return findLastUserMessageIndex(messages);
  }, [messages]);

  const cancelScheduledSpacerHeightUpdate = useCallback(() => {
    if (spacerUpdateRafRef.current !== null) {
      cancelAnimationFrame(spacerUpdateRafRef.current);
      spacerUpdateRafRef.current = null;
    }
  }, []);

  const scheduleSpacerHeightUpdate = useCallback(() => {
    if (spacerUpdateRafRef.current !== null) {
      return;
    }

    spacerUpdateRafRef.current = requestAnimationFrame(() => {
      spacerUpdateRafRef.current = null;
      updateSpacerHeightRef.current();
    });
  }, []);

  const setProgrammaticScrollTop = useCallback((container: HTMLElement, nextScrollTop: number) => {
    if (container.clientHeight > 0) {
      lastContainerHeightRef.current = container.clientHeight;
    }
    container.scrollTop = nextScrollTop;
    programmaticScrollTopRef.current = container.scrollTop;
    lastObservedScrollTopRef.current = container.scrollTop;
    container.dispatchEvent(new Event("chat-programmatic-scroll"));
    return container.scrollTop;
  }, []);

  const scrollCurrentTurnIntoView = useCallback((): 'estimated' | 'rendered' | false => {
    if (!activeRef.current) {
      return false;
    }

    if (!containerRef.current) {
      return false;
    }

    return scrollCurrentTurnIntoViewForContainer({
      active: activeRef.current,
      container: containerRef.current,
      messages,
      chatId,
      isStreaming: isStreamingRef.current,
      currentTurnAnchorMode: currentTurnAnchorModeRef.current,
      currentTurnTopSpacerHeight: currentTurnTopSpacerHeightRef.current,
      setProgrammaticScrollTop,
    });
  }, [chatId, messages, setProgrammaticScrollTop]);

  const scrollActiveOutputIfNeeded = useCallback(() => {
    scheduleActiveOutputFollow({
      active: activeRef.current,
      activeOutputFollowRafRef,
      container: containerRef.current,
      isAutoFollowRef,
      isCurrentTurnAnchoredRef,
      isStreamingRef,
      messagesRef,
      setProgrammaticScrollTop,
    });
  }, [setProgrammaticScrollTop]);

  const restoreCurrentTurnAnchorIfOutputFits = useCallback(() => {
    return restoreCurrentTurnAnchorIfOutputFitsForContainer({
      active: activeRef.current,
      container: containerRef.current,
      isCurrentTurnAnchored: isCurrentTurnAnchoredRef.current,
      userDetachedFromCurrentTurn: userDetachedFromCurrentTurnRef.current,
      messages,
      chatId,
      isStreaming: isStreamingRef.current,
      currentTurnAnchorMode: currentTurnAnchorModeRef.current,
      currentTurnTopSpacerHeight: currentTurnTopSpacerHeightRef.current,
      setProgrammaticScrollTop,
    });
  }, [chatId, messages, setProgrammaticScrollTop]);
  restoreCurrentTurnAnchorIfOutputFitsRef.current = restoreCurrentTurnAnchorIfOutputFits;

  const hasVisibleAssistantOutput = useMemo(() => {
    return hasVisibleAssistantOutputAfterLastUser(messages);
  }, [messages]);

  const updateSpacerHeight = useCallback(() => {
    updateMessageAutoscrollSpacers({
      active: activeRef.current,
      container: containerRef.current,
      chatId,
      currentTurnAnchorMode: currentTurnAnchorModeRef.current,
      currentTurnTopSpacerHeightRef,
      estimateLoadingHeight,
      estimateMessageHeight,
      hasVisibleAssistantOutput,
      isCurrentTurnAnchored: isCurrentTurnAnchoredRef.current,
      isStreaming,
      lastContainerHeightRef,
      messages,
      setCurrentTurnTopSpacerHeight,
      setSpacerHeight,
      showLoading,
    });
  }, [
    chatId,
    estimateLoadingHeight,
    estimateMessageHeight,
    hasVisibleAssistantOutput,
    isStreaming,
    messages,
    showLoading,
  ]);

  const { handleEditMessage, handleNewUserMessage, handleRegenerateMessage } = useMessageAutoscrollActions({
    active,
    chatId,
    isStreaming,
    messages,
    refs: currentTurnActionRefs,
    scrollCurrentTurnIntoView,
    updateSpacerHeight,
  });

  useMessageAutoscrollLifecycle({
    active,
    chatId,
    containerRef,
    currentTurnAnchorModeRef,
    currentTurnTopSpacerHeight,
    currentTurnTopSpacerHeightRef,
    getLastUserMessageIndex,
    hasVisibleAssistantOutput,
    initialScrollPendingRef,
    isAutoFollowRef,
    isCurrentTurnAnchoredRef,
    isStreaming,
    isStreamingRef,
    messages,
    messagesRef,
    pendingChatCreationAnchorRef,
    pendingScrollMessageCountRef,
    pendingScrollToCurrentTurnRef,
    prevChatIdRef,
    restoreCurrentTurnAnchorIfOutputFits,
    scrollCurrentTurnIntoView,
    setCurrentTurnTopSpacerHeight,
    setProgrammaticScrollTop,
    setShouldScrollToBottom,
    setSpacerHeight,
    shouldScrollToBottom,
    spacerHeight,
    spacerHeightRef,
    updateSpacerHeight,
    updateSpacerHeightRef,
    userDetachedFromCurrentTurnRef,
  });

  useMessageAutoscrollObservers({
    active,
    activeOutputFollowRafRef,
    cancelScheduledSpacerHeightUpdate,
    containerRef,
    contentResizeObserverRef,
    currentTurnAnchorModeRef,
    hasVisibleAssistantOutput,
    isAutoFollowRef,
    isCurrentTurnAnchoredRef,
    isPointerInsideScrollRootRef,
    isStreaming,
    isStreamingRef,
    lastContainerHeightRef,
    lastObservedScrollTopRef,
    lastTouchYRef,
    messages,
    messagesRef,
    observedContainerRef,
    observedContentRef,
    pendingChatCreationAnchorRef,
    pendingScrollMessageCountRef,
    pendingScrollToCurrentTurnRef,
    programmaticScrollTopRef,
    resizeObserverRef,
    restoreCurrentTurnAnchorIfOutputFitsRef,
    scheduleSpacerHeightUpdate,
    scrollActiveOutputIfNeeded,
    scrollActiveOutputIfNeededRef,
    setProgrammaticScrollTop,
    userDetachedFromCurrentTurnRef,
  });

  const completionTransitionSpacerReserve =
    isStreamingRef.current &&
    !isStreaming &&
    isCurrentTurnAnchoredRef.current &&
    !userDetachedFromCurrentTurnRef.current
      ? lastContainerHeightRef.current
      : 0;
  const renderedSpacerHeight = spacerHeight + completionTransitionSpacerReserve;

  return useMemo(
    () => ({
      handleEditMessage,
      handleNewUserMessage,
      handleRegenerateMessage,
      containerRef,
      spacerHeight: renderedSpacerHeight,
      currentTurnTopSpacerHeight,
    }),
    [currentTurnTopSpacerHeight, handleEditMessage, handleNewUserMessage, handleRegenerateMessage, renderedSpacerHeight],
  );
};
