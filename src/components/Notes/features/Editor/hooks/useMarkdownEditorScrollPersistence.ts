import { useCallback, useEffect, useRef } from 'react';
import { themeEditorLayoutTokens } from '@/styles/themeTokens';
import { createScrollRestoreSession } from '../utils/scrollRestoreSession';
import {
  subscribeCurrentEditorBlockPositionSnapshot,
} from '../utils/editorBlockPositionCache';
import {
  loadPersistedNoteScrollPosition,
  persistNoteScrollPosition,
} from '../utils/noteScrollPositionStorage';
import { isSidebarSearchNavigationPending } from '../../Sidebar/sidebarSearchNavigation';
import { OVERLAY_SCROLL_IDLE_EVENT } from '@/components/ui/overlayScrollAreaEvents';

export function canPersistNoteScrollPosition(scrollRoot: HTMLElement | null): scrollRoot is HTMLElement {
  return Boolean(
    scrollRoot
    && scrollRoot.isConnected
    && scrollRoot.clientHeight > 0
    && scrollRoot.scrollHeight > 0
  );
}

export function useMarkdownEditorScrollPersistence({
  active,
  currentNotePath,
  hasActiveNote,
  notesPath,
  openTabPathsKey,
  startAtTop,
}: {
  active: boolean;
  currentNotePath: string | undefined;
  hasActiveNote: boolean;
  notesPath: string | null;
  openTabPathsKey: string;
  startAtTop: boolean;
}) {
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const scrollPositionsRef = useRef(new Map<string, number>());
  const pendingScrollPositionSaveRef = useRef<{ path: string } | null>(null);
  const scrollPositionPersistTimerRef = useRef<number | null>(null);
  const pendingPersistentScrollPositionRef = useRef<{
    notesPath: string | null;
    path: string;
    scrollTop: number;
  } | null>(null);
  const activePathRef = useRef<string | null>(null);
  const activeNotesPathRef = useRef<string | null>(null);
  const restoreSessionRef = useRef<{ path: string; targetScrollTop: number } | null>(null);

  const flushPendingPersistedScrollPosition = useCallback(() => {
    if (scrollPositionPersistTimerRef.current !== null) {
      window.clearTimeout(scrollPositionPersistTimerRef.current);
      scrollPositionPersistTimerRef.current = null;
    }

    const pending = pendingPersistentScrollPositionRef.current;
    pendingPersistentScrollPositionRef.current = null;
    if (!pending) {
      return;
    }

    persistNoteScrollPosition(pending.notesPath, pending.path, pending.scrollTop);
  }, []);

  const schedulePersistedScrollPosition = useCallback((
    notesRootPath: string | null,
    path: string,
    scrollTop: number,
  ) => {
    pendingPersistentScrollPositionRef.current = {
      notesPath: notesRootPath,
      path,
      scrollTop,
    };

    if (scrollPositionPersistTimerRef.current !== null) {
      window.clearTimeout(scrollPositionPersistTimerRef.current);
    }

    scrollPositionPersistTimerRef.current = window.setTimeout(() => {
      flushPendingPersistedScrollPosition();
    }, 500);
  }, [flushPendingPersistedScrollPosition]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const scrollRoot = scrollRootRef.current;
    if (!scrollRoot) return;

    const commitPendingScrollPosition = () => {
      const pending = pendingScrollPositionSaveRef.current;
      pendingScrollPositionSaveRef.current = null;
      if (!pending) {
        return;
      }
      const scrollTop = scrollRoot.scrollTop;
      scrollPositionsRef.current.set(pending.path, scrollTop);
      if (canPersistNoteScrollPosition(scrollRoot)) {
        schedulePersistedScrollPosition(activeNotesPathRef.current, pending.path, scrollTop);
      }
    };

    const handleScroll = () => {
      const path = activePathRef.current;
      if (!path) return;

      const restoreSession = restoreSessionRef.current;
      if (restoreSession?.path === path) {
        return;
      }

      pendingScrollPositionSaveRef.current = { path };
    };

    const handleScrollIdle = () => {
      const isScrollbarInteracting = scrollRoot.dataset.overlayScrollbarInteracting === 'true';
      if (isScrollbarInteracting) return;
      commitPendingScrollPosition();
    };

    scrollRoot.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener(OVERLAY_SCROLL_IDLE_EVENT, handleScrollIdle);
    return () => {
      scrollRoot.removeEventListener('scroll', handleScroll);
      window.removeEventListener(OVERLAY_SCROLL_IDLE_EVENT, handleScrollIdle);
      commitPendingScrollPosition();
      flushPendingPersistedScrollPosition();
    };
  }, [active, flushPendingPersistedScrollPosition, schedulePersistedScrollPosition]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const flushCurrentScrollPosition = () => {
      const path = activePathRef.current;
      const scrollRoot = scrollRootRef.current;
      if (!path || !canPersistNoteScrollPosition(scrollRoot)) {
        return;
      }

      scrollPositionsRef.current.set(path, scrollRoot.scrollTop);
      flushPendingPersistedScrollPosition();
      persistNoteScrollPosition(activeNotesPathRef.current, path, scrollRoot.scrollTop);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushCurrentScrollPosition();
      }
    };

    window.addEventListener('beforeunload', flushCurrentScrollPosition);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', flushCurrentScrollPosition);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushCurrentScrollPosition();
    };
  }, [active, flushPendingPersistedScrollPosition]);

  useEffect(() => {
    const openTabPaths = new Set(openTabPathsKey ? openTabPathsKey.split('\0') : []);
    for (const path of scrollPositionsRef.current.keys()) {
      if (!openTabPaths.has(path)) {
        scrollPositionsRef.current.delete(path);
      }
    }
  }, [openTabPathsKey]);

  useEffect(() => {
    const scrollRoot = scrollRootRef.current;
    if (!scrollRoot) return;

    if (!active) {
      const path = activePathRef.current;
      if (path && canPersistNoteScrollPosition(scrollRoot)) {
        scrollPositionsRef.current.set(path, scrollRoot.scrollTop);
        flushPendingPersistedScrollPosition();
        persistNoteScrollPosition(activeNotesPathRef.current, path, scrollRoot.scrollTop);
      }
      restoreSessionRef.current = null;
      return;
    }

    const previousPath = activePathRef.current;

    if (previousPath) {
      const cachedScrollTop = scrollPositionsRef.current.get(previousPath);
      const nextSavedScrollTop = cachedScrollTop ?? scrollRoot.scrollTop;
      scrollPositionsRef.current.set(previousPath, nextSavedScrollTop);
      if (canPersistNoteScrollPosition(scrollRoot)) {
        flushPendingPersistedScrollPosition();
        persistNoteScrollPosition(activeNotesPathRef.current, previousPath, nextSavedScrollTop);
      }
    }

    activePathRef.current = currentNotePath ?? null;
    activeNotesPathRef.current = currentNotePath ? notesPath : null;

    if (!hasActiveNote || !currentNotePath) {
      restoreSessionRef.current = null;
      activeNotesPathRef.current = null;
      scrollRoot.scrollTop = 0;
      return;
    }

    if (isSidebarSearchNavigationPending(currentNotePath)) {
      restoreSessionRef.current = null;
      return;
    }

    if (startAtTop) {
      scrollPositionsRef.current.set(currentNotePath, 0);
      persistNoteScrollPosition(notesPath, currentNotePath, 0);
    }
    const targetScrollTop = startAtTop
      ? 0
      : scrollPositionsRef.current.get(currentNotePath)
        ?? loadPersistedNoteScrollPosition(notesPath, currentNotePath)
        ?? 0;
    restoreSessionRef.current = {
      path: currentNotePath,
      targetScrollTop,
    };

    let unsubscribeBlockSnapshot = () => {};
    let frameA = 0;
    let timeoutId = 0;

    const restoreSession = createScrollRestoreSession({
      notePath: currentNotePath,
      targetScrollTop,
      getActivePath: () => activePathRef.current,
      getSessionPath: () => restoreSessionRef.current?.path ?? null,
      readScrollTop: () => scrollRoot.scrollTop,
      writeScrollTop: (nextScrollTop) => {
        scrollRoot.scrollTop = nextScrollTop;
      },
      onFinish: () => {
        scrollPositionsRef.current.set(currentNotePath, scrollRoot.scrollTop);
        if (canPersistNoteScrollPosition(scrollRoot)) {
          flushPendingPersistedScrollPosition();
          persistNoteScrollPosition(notesPath, currentNotePath, scrollRoot.scrollTop);
        }
        restoreSessionRef.current = null;
      },
      onStop: () => {
        unsubscribeBlockSnapshot();
        cancelAnimationFrame(frameA);
        window.clearTimeout(timeoutId);
      },
    });

    const restoredSynchronously = restoreSession.restore('sync') || restoreSession.restore('sync-confirm');
    if (restoredSynchronously) {
      restoreSession.finish();
      return () => {
        if (restoreSessionRef.current?.path === currentNotePath) {
          restoreSessionRef.current = null;
        }
      };
    }

    unsubscribeBlockSnapshot = subscribeCurrentEditorBlockPositionSnapshot((snapshot) => {
      if (
        !restoreSession.isActive()
        || !snapshot
        || snapshot.scrollRoot !== scrollRoot
        || activePathRef.current !== currentNotePath
      ) {
        return;
      }

      const alreadyRestored = restoreSession.restore(`snapshot:${snapshot.version}`, snapshot.scrollTop);
      if (alreadyRestored) {
        restoreSession.finish();
      }
    });
    frameA = requestAnimationFrame(() => {
      const alreadyRestored = restoreSession.restore('raf');
      if (alreadyRestored) {
        restoreSession.finish();
      }
    });
    timeoutId = window.setTimeout(() => {
      restoreSession.restore('timeout');
      restoreSession.finish();
    }, themeEditorLayoutTokens.scrollRestoreTimeoutFallbackDelayMs);

    return () => {
      restoreSession.stop();
      if (restoreSessionRef.current?.path === currentNotePath) {
        restoreSessionRef.current = null;
      }
    };
  }, [active, currentNotePath, flushPendingPersistedScrollPosition, hasActiveNote, notesPath, startAtTop]);

  return scrollRootRef;
}
