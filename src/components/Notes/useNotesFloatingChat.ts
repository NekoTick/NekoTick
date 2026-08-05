import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import {
  NOTES_CHAT_FLOATING_DEFAULT_SIZE,
  NOTES_CHAT_FLOATING_MAX_SIZE,
  NOTES_CHAT_FLOATING_MIN_SIZE,
  type NotesChatFloatingSize,
  useUIStore,
} from '@/stores/uiSlice';
import { useResizableBox } from '@/components/layout/shell/useResizableBox';
import { requestNativeCaretOverlayRefresh } from '@/hooks/useNativeCaretOverlay';
import { useNotesChatComposerFocus } from './hooks/useNotesChatComposerFocus';
import {
  isEmbeddedChatViewModuleReady,
  preloadEmbeddedChatViewModule,
} from './notesViewLazyComponents';
import { FLOATING_CHAT_VIEWPORT_MARGIN_PX } from './notesViewHelpers';

export function useNotesFloatingChat(args: {
  active: boolean;
  notesViewRef: MutableRefObject<HTMLDivElement | null>;
}) {
  const { active, notesViewRef } = args;
  const chatPanelCollapsed = useUIStore((s) => s.notesChatPanelCollapsed);
  const setChatPanelCollapsed = useUIStore((s) => s.setNotesChatPanelCollapsed);
  const chatFloatingOpen = useUIStore((s) => s.notesChatFloatingOpen);
  const setChatFloatingOpen = useUIStore((s) => s.setNotesChatFloatingOpen);
  const chatFloatingSize = useUIStore((s) => s.notesChatFloatingSize);
  const setChatFloatingSize = useUIStore((s) => s.setNotesChatFloatingSize);
  const resetChatFloatingSize = useUIStore((s) => s.resetNotesChatFloatingSize);
  const setLayoutPanelDragging = useUIStore((s) => s.setLayoutPanelDragging);
  const setLayoutPanelTransitioning = useUIStore((s) => s.setLayoutPanelTransitioning);
  const [isEmbeddedChatViewReady, setIsEmbeddedChatViewReady] = useState(isEmbeddedChatViewModuleReady());
  const [floatingChatLiveSize, setFloatingChatLiveSize] = useState<NotesChatFloatingSize>(chatFloatingSize);
  const [isDockedChatPanelPresent, setIsDockedChatPanelPresent] = useState(active && !chatPanelCollapsed);
  const [isFloatingChatPresent, setIsFloatingChatPresent] = useState(chatFloatingOpen);
  const floatingChatPanelRef = useRef<HTMLDivElement>(null);
  const chatPanelCaretRefreshFrameRef = useRef<number | null>(null);
  const dockedChatPanelVisibleRef = useRef(false);
  const chatFloatingOpenRef = useRef(chatFloatingOpen);
  chatFloatingOpenRef.current = chatFloatingOpen;

  const closeFloatingChat = useCallback(() => {
    setChatFloatingOpen(false);
  }, [setChatFloatingOpen]);

  const closeChatPanel = useCallback(() => {
    setChatPanelCollapsed(true);
  }, [setChatPanelCollapsed]);

  const openFloatingChat = useCallback(() => {
    void preloadEmbeddedChatViewModule().catch(() => undefined);
    setChatPanelCollapsed(true);
    setChatFloatingOpen(true);
  }, [setChatFloatingOpen, setChatPanelCollapsed]);

  const promoteFloatingChatToSidePanel = useCallback(() => {
    setChatFloatingOpen(false);
    setChatPanelCollapsed(false);
  }, [setChatFloatingOpen, setChatPanelCollapsed]);

  const handleChatPanelDragStateChange = useCallback((dragging: boolean) => {
    setLayoutPanelDragging(dragging);
  }, [setLayoutPanelDragging]);

  const handleDockedChatPanelAnimationComplete = useCallback((definition: unknown) => {
    const expectedTarget = dockedChatPanelVisibleRef.current ? 'visible' : 'hidden';
    if (definition !== expectedTarget) return;
    if (definition === 'hidden') {
      setIsDockedChatPanelPresent(false);
    }
    setLayoutPanelTransitioning('docked-chat', false);
    requestNativeCaretOverlayRefresh();
  }, [setLayoutPanelTransitioning]);

  const handleFloatingChatAnimationComplete = useCallback((definition: unknown) => {
    if (definition === 'visible') {
      if (chatFloatingOpenRef.current) {
        requestNativeCaretOverlayRefresh();
      }
      return;
    }
    if (definition !== 'hidden' || chatFloatingOpenRef.current) return;
    setIsFloatingChatPresent(false);
    requestNativeCaretOverlayRefresh();
  }, []);

  const getDockedChatPanelMaxWidth = useCallback((): number => {
    const container = notesViewRef.current;
    const containerWidth = container?.clientWidth || window.innerWidth;
    const availableWidth = Math.max(0, containerWidth - FLOATING_CHAT_VIEWPORT_MARGIN_PX);

    return availableWidth || 760;
  }, [notesViewRef]);

  const scheduleChatPanelCaretRefresh = useCallback(() => {
    if (chatPanelCaretRefreshFrameRef.current !== null) {
      return;
    }

    chatPanelCaretRefreshFrameRef.current = window.requestAnimationFrame(() => {
      chatPanelCaretRefreshFrameRef.current = null;
      requestNativeCaretOverlayRefresh();
    });
  }, []);

  const applyFloatingChatLiveSize = useCallback((nextSize: NotesChatFloatingSize) => {
    const panel = floatingChatPanelRef.current;
    if (!panel) {
      return;
    }

    panel.style.width = `${nextSize.width}px`;
    panel.style.height = `${nextSize.height}px`;
  }, []);

  const handleFloatingChatLiveSizeChange = useCallback((nextSize: NotesChatFloatingSize) => {
    applyFloatingChatLiveSize(nextSize);
    requestNativeCaretOverlayRefresh();
  }, [applyFloatingChatLiveSize]);

  const getFloatingChatMaxSize = useCallback((): NotesChatFloatingSize => {
    const container = notesViewRef.current;
    const containerWidth = container?.clientWidth || window.innerWidth;
    const containerHeight = container?.clientHeight || window.innerHeight;
    const availableWidth = Math.max(0, containerWidth - FLOATING_CHAT_VIEWPORT_MARGIN_PX);
    const availableHeight = Math.max(0, containerHeight - FLOATING_CHAT_VIEWPORT_MARGIN_PX);

    return {
      width: availableWidth || NOTES_CHAT_FLOATING_MAX_SIZE.width,
      height: availableHeight || NOTES_CHAT_FLOATING_MAX_SIZE.height,
    };
  }, [notesViewRef]);

  const handleFloatingChatSizeCommit = useCallback((nextSize: NotesChatFloatingSize) => {
    applyFloatingChatLiveSize(nextSize);
    setFloatingChatLiveSize(nextSize);
    setChatFloatingSize(nextSize);
  }, [applyFloatingChatLiveSize, setChatFloatingSize]);

  const {
    isDragging: isFloatingChatResizing,
    handleResizeStart: beginFloatingChatResize,
  } = useResizableBox<NotesChatFloatingSize>({
    size: floatingChatLiveSize,
    minSize: NOTES_CHAT_FLOATING_MIN_SIZE,
    maxSize: NOTES_CHAT_FLOATING_MAX_SIZE,
    defaultSize: NOTES_CHAT_FLOATING_DEFAULT_SIZE,
    getMaxSize: getFloatingChatMaxSize,
    onSizeChange: handleFloatingChatLiveSizeChange,
    onSizeCommit: handleFloatingChatSizeCommit,
    onDragStateChange: handleChatPanelDragStateChange,
    liveUpdateMode: 'sync',
    allowDoubleClickReset: false,
  });

  const focusNotesChatComposer = useNotesChatComposerFocus(setChatPanelCollapsed);

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;
    void preloadEmbeddedChatViewModule().then(() => {
      if (!cancelled) {
        setIsEmbeddedChatViewReady(true);
      }
    }).catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (isFloatingChatResizing) {
      return;
    }

    applyFloatingChatLiveSize(chatFloatingSize);
    setFloatingChatLiveSize((current) => (
      current.width === chatFloatingSize.width && current.height === chatFloatingSize.height
        ? current
        : chatFloatingSize
    ));
  }, [applyFloatingChatLiveSize, chatFloatingSize, isFloatingChatResizing]);

  useLayoutEffect(() => {
    const dockedChatPanelVisible = active && !chatPanelCollapsed;
    if (dockedChatPanelVisibleRef.current === dockedChatPanelVisible) return;
    dockedChatPanelVisibleRef.current = dockedChatPanelVisible;
    if (dockedChatPanelVisible) {
      setIsDockedChatPanelPresent(true);
    }
    setLayoutPanelTransitioning('docked-chat', true);
  }, [active, chatPanelCollapsed, setLayoutPanelTransitioning]);

  useLayoutEffect(() => {
    if (chatFloatingOpen) {
      setIsFloatingChatPresent(true);
    }
  }, [chatFloatingOpen]);

  useLayoutEffect(() => {
    if (!active || !chatPanelCollapsed || !chatFloatingOpen) {
      return;
    }
    requestNativeCaretOverlayRefresh();
  }, [active, chatFloatingOpen, floatingChatLiveSize.height, floatingChatLiveSize.width, chatPanelCollapsed]);

  useEffect(() => () => {
    setLayoutPanelTransitioning('docked-chat', false);
    if (chatPanelCaretRefreshFrameRef.current !== null) {
      window.cancelAnimationFrame(chatPanelCaretRefreshFrameRef.current);
      chatPanelCaretRefreshFrameRef.current = null;
    }
  }, [setLayoutPanelTransitioning]);

  return {
    beginFloatingChatResize,
    chatFloatingOpen,
    chatPanelCollapsed,
    closeChatPanel,
    closeFloatingChat,
    floatingChatLiveSize,
    floatingChatPanelRef,
    focusNotesChatComposer,
    getDockedChatPanelMaxWidth,
    handleChatPanelDragStateChange,
    handleDockedChatPanelAnimationComplete,
    handleFloatingChatAnimationComplete,
    isEmbeddedChatViewReady,
    isDockedChatPanelPresent,
    isFloatingChatResizing,
    isFloatingChatPresent,
    openFloatingChat,
    promoteFloatingChatToSidePanel,
    resetChatFloatingSize,
    scheduleChatPanelCaretRefresh,
    setChatPanelCollapsed,
  };
}
