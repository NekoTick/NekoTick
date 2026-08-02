import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { NotesOutlineHeading } from './types';
import { areOutlineHeadingsEqual } from './outlineUtils';
import {
  selectActiveOutlineHeadingId,
  type OutlineHeadingMetric,
} from './outlinePositionCache';
import {
  getCurrentEditorBlockPositionSnapshot,
  subscribeCurrentEditorBlockPositionSnapshot,
  type EditorBlockPositionSnapshot,
} from '@/components/Notes/features/Editor/utils/editorBlockPositionCache';

const ACTIVE_OFFSET_PX = 72;
const ACTIVE_SNAP_PX = 12;
const JUMP_LOCK_DURATION_MS = 900;
const JUMP_LOCK_TOLERANCE_PX = 2;

export function useNotesOutline(enabled: boolean) {
  const [headings, setHeadings] = useState<NotesOutlineHeading[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const headingsRef = useRef<NotesOutlineHeading[]>([]);
  const headingMetricsRef = useRef<OutlineHeadingMetric[]>([]);
  const elementMapRef = useRef<Map<string, HTMLElement>>(new Map());
  const editorRootRef = useRef<HTMLElement | null>(null);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const snapshotHeadingsRef = useRef<EditorBlockPositionSnapshot['headings'] | null>(null);
  const refreshOutlineRef = useRef<((snapshot: EditorBlockPositionSnapshot | null) => void) | null>(null);
  const scrollSyncRafRef = useRef<number | null>(null);
  const jumpLockRef = useRef<{
    headingId: string;
    targetScrollTop: number;
    expireAt: number;
  } | null>(null);

  const syncActiveHeading = useCallback((scrollTopOverride?: number | null) => {
    const jumpLock = jumpLockRef.current;
    const scrollRoot = scrollRootRef.current;
    const nextScrollTop = scrollTopOverride ?? scrollRoot?.scrollTop ?? 0;
    if (jumpLock && scrollRoot) {
      const reachedTarget = Math.abs(nextScrollTop - jumpLock.targetScrollTop) <= JUMP_LOCK_TOLERANCE_PX;
      const expired = Date.now() >= jumpLock.expireAt;
      if (!reachedTarget && !expired) {
        setActiveId((previous) => (previous === jumpLock.headingId ? previous : jumpLock.headingId));
        return;
      }
      jumpLockRef.current = null;
    }

    if (!scrollRoot) {
      setActiveId(null);
      return;
    }

    const maxScrollTop = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
    const nextActiveId = selectActiveOutlineHeadingId(
      headingMetricsRef.current,
      nextScrollTop,
      ACTIVE_OFFSET_PX,
      ACTIVE_SNAP_PX,
      maxScrollTop,
    );
    setActiveId((previous) => (previous === nextActiveId ? previous : nextActiveId));
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (scrollSyncRafRef.current !== null) {
        cancelAnimationFrame(scrollSyncRafRef.current);
        scrollSyncRafRef.current = null;
      }
      headingsRef.current = [];
      headingMetricsRef.current = [];
      elementMapRef.current = new Map();
      editorRootRef.current = null;
      scrollRootRef.current = null;
      snapshotHeadingsRef.current = null;
      jumpLockRef.current = null;
      refreshOutlineRef.current = null;
      setHeadings([]);
      setActiveId(null);
      return;
    }

    const refreshOutline = (snapshot: EditorBlockPositionSnapshot | null) => {
      const editorRoot = snapshot?.editorRoot ?? null;
      const scrollRoot = snapshot?.scrollRoot ?? null;
      const previousEditorRoot = editorRootRef.current;
      const previousScrollRoot = scrollRootRef.current;
      scrollRootRef.current = scrollRoot;
      editorRootRef.current = editorRoot;

      if (!snapshot || !editorRoot || !scrollRoot || !editorRoot.isConnected || !scrollRoot.isConnected) {
        headingsRef.current = [];
        headingMetricsRef.current = [];
        elementMapRef.current = new Map();
        snapshotHeadingsRef.current = null;
        jumpLockRef.current = null;
        setHeadings((previous) => (previous.length === 0 ? previous : []));
        setActiveId(null);
        return;
      }

      if (
        snapshotHeadingsRef.current === snapshot.headings
        && previousEditorRoot === editorRoot
        && previousScrollRoot === scrollRoot
      ) {
        syncActiveHeading(snapshot.scrollTop);
        return;
      }

      const metrics: OutlineHeadingMetric[] = snapshot.headings.map((heading) => ({
        id: heading.id,
        level: heading.level,
        text: heading.text,
        from: heading.from,
        to: heading.to,
        element: heading.element,
        top: heading.top,
      }));
      const nextHeadings = snapshot.headings.map(({ id, level, text, from, to }) => ({
        id,
        level,
        text,
        from,
        to,
      }));

      headingMetricsRef.current = metrics;
      elementMapRef.current = new Map(snapshot.headings.map((heading) => [heading.id, heading.element]));
      snapshotHeadingsRef.current = snapshot.headings;

      if (!areOutlineHeadingsEqual(headingsRef.current, nextHeadings)) {
        headingsRef.current = nextHeadings;
        setHeadings(nextHeadings);
      } else {
        headingsRef.current = nextHeadings;
      }

      syncActiveHeading(snapshot.scrollTop);
    };

    refreshOutlineRef.current = refreshOutline;
    refreshOutline(getCurrentEditorBlockPositionSnapshot());
    const unsubscribe = subscribeCurrentEditorBlockPositionSnapshot((snapshot) => {
      if (scrollSyncRafRef.current !== null) {
        cancelAnimationFrame(scrollSyncRafRef.current);
      }
      scrollSyncRafRef.current = requestAnimationFrame(() => {
        scrollSyncRafRef.current = null;
        refreshOutlineRef.current?.(snapshot);
      });
    });

    return () => {
      unsubscribe();
      if (scrollSyncRafRef.current !== null) {
        cancelAnimationFrame(scrollSyncRafRef.current);
        scrollSyncRafRef.current = null;
      }
      scrollRootRef.current = null;
      editorRootRef.current = null;
      snapshotHeadingsRef.current = null;
      refreshOutlineRef.current = null;
    };
  }, [enabled, syncActiveHeading]);

  const jumpToHeading = useCallback((
    headingId: string,
    options?: {
      selectText?: boolean;
    },
  ) => {
    const headingElement = elementMapRef.current.get(headingId);
    const scrollRoot = scrollRootRef.current;
    if (!headingElement || !scrollRoot) {
      return;
    }

    const fallbackTop =
      headingElement.getBoundingClientRect().top - scrollRoot.getBoundingClientRect().top + scrollRoot.scrollTop;
    const targetScrollTop = Math.max(0, fallbackTop - ACTIVE_OFFSET_PX);

    jumpLockRef.current = {
      headingId,
      targetScrollTop,
      expireAt: Date.now() + JUMP_LOCK_DURATION_MS,
    };

    scrollRoot.scrollTo({
      top: targetScrollTop,
      behavior: 'auto',
    });

    editorRootRef.current?.focus({ preventScroll: true });
    if (options?.selectText) {
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(headingElement);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    setActiveId(headingId);
  }, []);

  const renameHeading = useCallback((headingId: string, nextText: string): boolean => {
    const normalizedText = nextText.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normalizedText) {
      return false;
    }

    const snapshot = getCurrentEditorBlockPositionSnapshot();
    const heading = snapshot?.headings.find((entry) => entry.id === headingId);
    const view = snapshot?.view;
    if (!snapshot || !heading || !view || view.state.doc !== snapshot.doc) {
      return false;
    }

    const node = view.state.doc.nodeAt(heading.from);
    if (!node || node.type.name !== 'heading') {
      return false;
    }

    const textFrom = heading.from + 1;
    const textTo = heading.to - 1;
    const textNode = view.state.schema.text(normalizedText);
    const tr = view.state.tr.replaceWith(textFrom, textTo, textNode);
    tr.setSelection(TextSelection.create(tr.doc, textFrom + normalizedText.length));
    tr.scrollIntoView();

    view.dom.dispatchEvent(new CustomEvent('editor:block-user-input', { bubbles: true }));
    view.dispatch(tr);
    view.focus();
    return true;
  }, []);

  return useMemo(
    () => ({
      headings,
      activeId,
      jumpToHeading,
      renameHeading,
    }),
    [headings, activeId, jumpToHeading, renameHeading],
  );
}
