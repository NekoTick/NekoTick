import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TextSelection } from '@milkdown/kit/prose/state';
import { materializeVirtualizedBlockAtPos } from '@milkdown/kit/core';
import type { NotesOutlineHeading } from './types';
import { areOutlineHeadingsEqual } from './outlineUtils';
import {
  selectActiveOutlineHeadingId,
  type OutlineHeadingMetric,
} from './outlinePositionCache';
import {
  getCurrentEditorBlockPositionSnapshot,
  refreshCurrentEditorBlockPositionSnapshot,
  subscribeCurrentEditorBlockPositionSnapshot,
  type EditorBlockPositionSnapshot,
} from '@/components/Notes/features/Editor/utils/editorBlockPositionCache';
import { expandCollapsedHeadingSectionAtPos } from '@/components/Notes/features/Editor/plugins/heading/collapse';

const ACTIVE_OFFSET_PX = 72;
const ACTIVE_SNAP_PX = 12;
const JUMP_LOCK_DURATION_MS = 900;
const JUMP_LOCK_TOLERANCE_PX = 2;

export function useNotesOutline(enabled: boolean) {
  const [headings, setHeadings] = useState<NotesOutlineHeading[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const headingsRef = useRef<NotesOutlineHeading[]>([]);
  const headingMetricsRef = useRef<OutlineHeadingMetric[]>([]);
  const headingMapRef = useRef<Map<string, EditorBlockPositionSnapshot['headings'][number]>>(new Map());
  const editorRootRef = useRef<HTMLElement | null>(null);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const snapshotHeadingsRef = useRef<EditorBlockPositionSnapshot['headings'] | null>(null);
  const refreshOutlineRef = useRef<((snapshot: EditorBlockPositionSnapshot | null) => void) | null>(null);
  const scrollSyncRafRef = useRef<number | null>(null);
  const jumpRafRef = useRef<number | null>(null);
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
      const expired = Date.now() >= jumpLock.expireAt;
      const targetMetric = headingMetricsRef.current.find((metric) => metric.id === jumpLock.headingId);
      const measuredTarget = targetMetric ? Math.max(0, targetMetric.top - ACTIVE_OFFSET_PX) : null;
      if (
        !expired
        && measuredTarget !== null
        && Math.abs(measuredTarget - jumpLock.targetScrollTop) > JUMP_LOCK_TOLERANCE_PX
      ) {
        jumpLock.targetScrollTop = measuredTarget;
        scrollRoot.scrollTo({ top: measuredTarget, behavior: 'auto' });
        setActiveId((previous) => (previous === jumpLock.headingId ? previous : jumpLock.headingId));
        return;
      }
      const reachedTarget = Math.abs(nextScrollTop - jumpLock.targetScrollTop) <= JUMP_LOCK_TOLERANCE_PX;
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
      if (jumpRafRef.current !== null) {
        cancelAnimationFrame(jumpRafRef.current);
        jumpRafRef.current = null;
      }
      headingsRef.current = [];
      headingMetricsRef.current = [];
      headingMapRef.current = new Map();
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
        headingMapRef.current = new Map();
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

      const metrics: OutlineHeadingMetric[] = snapshot.headings.flatMap((heading) => (
        heading.element && heading.hasExactGeometry !== false ? [{
          id: heading.id,
          level: heading.level,
          text: heading.text,
          from: heading.from,
          to: heading.to,
          element: heading.element,
          top: heading.top,
        }] : []
      ));
      const nextHeadings = snapshot.headings.map(({ id, level, text, from, to }) => ({
        id,
        level,
        text,
        from,
        to,
      }));

      headingMetricsRef.current = metrics;
      headingMapRef.current = new Map(snapshot.headings.map((heading) => [heading.id, heading]));
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
      if (jumpRafRef.current !== null) {
        cancelAnimationFrame(jumpRafRef.current);
        jumpRafRef.current = null;
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
    const scrollRoot = scrollRootRef.current;
    const snapshot = getCurrentEditorBlockPositionSnapshot();
    const heading = headingMapRef.current.get(headingId);
    const view = snapshot?.view;
    if (!heading || !scrollRoot || !view || snapshot.doc !== view.state.doc) {
      return;
    }

    const wasExpanded = expandCollapsedHeadingSectionAtPos(view, heading.from);
    const wasMaterialized = materializeVirtualizedBlockAtPos(view, heading.from);
    const finishJump = () => {
      jumpRafRef.current = null;
      const currentSnapshot = wasExpanded || wasMaterialized
        ? refreshCurrentEditorBlockPositionSnapshot(view)
        : getCurrentEditorBlockPositionSnapshot();
      const currentHeading = currentSnapshot?.headings.find((entry) => (
        entry.id === headingId || entry.from === heading.from
      )) ?? heading;
      let headingElement = currentHeading.element;
      if (currentHeading.hasExactGeometry === false) {
        const liveElement = view.nodeDOM(currentHeading.from);
        if (
          liveElement instanceof HTMLElement
          && view.dom.contains(liveElement)
          && /^H[1-6]$/.test(liveElement.tagName)
        ) {
          headingElement = liveElement;
        }
      }
      if (!headingElement || !headingElement.isConnected) return;
      const headingRect = headingElement.getBoundingClientRect();
      if (headingRect.width <= 0 || headingRect.height <= 0) return;
      const fallbackTop = headingRect.top - scrollRoot.getBoundingClientRect().top + scrollRoot.scrollTop;
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
    };

    setActiveId(headingId);
    if (wasExpanded || wasMaterialized) {
      jumpRafRef.current = requestAnimationFrame(finishJump);
    } else {
      finishJump();
    }
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
