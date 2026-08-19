import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useLayoutPanelDragDeferredCallback } from '@/hooks/useLayoutPanelDragDeferredCallback';
import { runSidebarResizeDiagnosticWork } from '@/lib/diagnostics/sidebarResizeDiagnostics';
import type { FileTreeNode } from '@/stores/useNotesStore';
import { FileTreeItem } from './FileTreeItem';
import {
  SIDEBAR_SCROLL_TO_PATH_EVENT,
  type SidebarScrollToPathDetail,
} from '../common/sidebarScrollIntoView';
import {
  buildVirtualFileTreeRowOffsets,
  estimateVirtualFileTreeRowHeight,
  flattenVisibleFileTreeRows,
  getVirtualFileTreeWindow,
  VIRTUAL_FILE_TREE_MIN_ROWS,
  VIRTUAL_FILE_TREE_OVERSCAN_ROWS,
  VIRTUAL_FILE_TREE_ROW_HEIGHT,
} from './virtualFileTree';

interface VirtualizedFileTreeProps {
  nodes: FileTreeNode[];
  startDepth: number;
  scrollRootRef: RefObject<HTMLElement | null>;
  parentFolderPath?: string;
}

export function shouldVirtualizeFileTree(rowCount: number) {
  return rowCount >= VIRTUAL_FILE_TREE_MIN_ROWS;
}

export function VirtualizedFileTree({
  nodes,
  startDepth,
  scrollRootRef,
  parentFolderPath = '',
}: VirtualizedFileTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportFrameRef = useRef<number | null>(null);
  const containerTopInScrollRef = useRef<number | null>(null);
  const rows = useMemo(
    () => flattenVisibleFileTreeRows(nodes, startDepth, parentFolderPath),
    [nodes, parentFolderPath, startDepth],
  );
  const [containerWidth, setContainerWidth] = useState(0);
  const rowHeights = useMemo(
    () => runSidebarResizeDiagnosticWork(
      'notes-file-tree-row-heights',
      'render',
      () => rows.map((row) => estimateVirtualFileTreeRowHeight(row, containerWidth)),
    ),
    [containerWidth, rows],
  );
  const rowOffsets = useMemo(() => buildVirtualFileTreeRowOffsets(rowHeights), [rowHeights]);
  const [viewport, setViewport] = useState({ start: 0, height: 0 });

  const measureContainerTopInScroll = useCallback(() => {
    const scrollRoot = scrollRootRef.current;
    const container = containerRef.current;
    if (!scrollRoot || !container) {
      return null;
    }

    const scrollRootRect = scrollRoot.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const containerTopInScroll = containerRect.top - scrollRootRect.top + scrollRoot.scrollTop;
    containerTopInScrollRef.current = containerTopInScroll;
    return containerTopInScroll;
  }, [scrollRootRef]);

  const commitViewport = useCallback(() => {
    const scrollRoot = scrollRootRef.current;
    const containerTopInScroll = containerTopInScrollRef.current ?? measureContainerTopInScroll();
    if (!scrollRoot || containerTopInScroll === null) {
      return;
    }

    const nextViewport = {
      start: scrollRoot.scrollTop - containerTopInScroll,
      height: scrollRoot.clientHeight,
    };
    setViewport((previous) => (
      previous.start === nextViewport.start && previous.height === nextViewport.height
        ? previous
        : nextViewport
    ));
  }, [measureContainerTopInScroll, scrollRootRef]);

  const updateViewport = useCallback(() => {
    if (viewportFrameRef.current !== null) {
      return;
    }

    viewportFrameRef.current = window.requestAnimationFrame(() => {
      viewportFrameRef.current = null;
      commitViewport();
    });
  }, [commitViewport]);

  const updateViewportNow = useCallback(() => {
    if (viewportFrameRef.current !== null) {
      window.cancelAnimationFrame(viewportFrameRef.current);
      viewportFrameRef.current = null;
    }

    measureContainerTopInScroll();
    const nextContainerWidth = Math.round(containerRef.current?.clientWidth ?? 0);
    setContainerWidth((previous) => previous === nextContainerWidth ? previous : nextContainerWidth);
    commitViewport();
  }, [commitViewport, measureContainerTopInScroll]);
  const updateViewportWhenLayoutIdle = useLayoutPanelDragDeferredCallback(
    updateViewportNow,
    'notes-file-tree-viewport',
  );

  useLayoutEffect(() => {
    updateViewportWhenLayoutIdle();

    const scrollRoot = scrollRootRef.current;
    if (!scrollRoot) {
      return;
    }

    scrollRoot.addEventListener('scroll', updateViewport, { passive: true });
    window.addEventListener('resize', updateViewportWhenLayoutIdle);

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateViewportWhenLayoutIdle);
    resizeObserver?.observe(scrollRoot);
    if (containerRef.current) {
      resizeObserver?.observe(containerRef.current);
    }

    return () => {
      if (viewportFrameRef.current !== null) {
        window.cancelAnimationFrame(viewportFrameRef.current);
        viewportFrameRef.current = null;
      }
      scrollRoot.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewportWhenLayoutIdle);
      resizeObserver?.disconnect();
    };
  }, [scrollRootRef, updateViewport, updateViewportWhenLayoutIdle]);

  useLayoutEffect(() => {
    updateViewportWhenLayoutIdle();
  }, [rowOffsets, updateViewportWhenLayoutIdle]);

  useLayoutEffect(() => {
    const scrollRoot = scrollRootRef.current;
    const container = containerRef.current;
    if (!scrollRoot || !container) {
      return;
    }

    const handleScrollToPath = (event: Event) => {
      const customEvent = event as CustomEvent<SidebarScrollToPathDetail>;
      const targetPath = customEvent.detail?.path;
      if (!targetPath) {
        return;
      }

      const rowIndex = rows.findIndex((row) => row.node.path === targetPath);
      if (rowIndex === -1) {
        return;
      }

      event.preventDefault();

      const containerTopInScroll = measureContainerTopInScroll();
      if (containerTopInScroll === null) {
        return;
      }

      const targetTop = containerTopInScroll + (rowOffsets[rowIndex] ?? 0);
      const targetHeight = rowHeights[rowIndex] ?? VIRTUAL_FILE_TREE_ROW_HEIGHT;
      const block = customEvent.detail.block;
      const maxScrollTop = Math.max(scrollRoot.scrollHeight - scrollRoot.clientHeight, 0);
      const nextScrollTop = (() => {
        if (block === 'start') {
          return targetTop;
        }
        if (block === 'end') {
          return targetTop - scrollRoot.clientHeight + targetHeight;
        }
        if (block === 'nearest') {
          if (targetTop >= scrollRoot.scrollTop && targetTop + targetHeight <= scrollRoot.scrollTop + scrollRoot.clientHeight) {
            return scrollRoot.scrollTop;
          }
          if (targetTop < scrollRoot.scrollTop) {
            return targetTop;
          }
          return targetTop - scrollRoot.clientHeight + targetHeight;
        }
        return targetTop - Math.max(0, (scrollRoot.clientHeight - targetHeight) / 2);
      })();

      scrollRoot.scrollTo({
        top: Math.max(0, Math.min(maxScrollTop, nextScrollTop)),
        behavior: 'auto',
      });
      updateViewport();
    };

    scrollRoot.addEventListener(SIDEBAR_SCROLL_TO_PATH_EVENT, handleScrollToPath);
    return () => {
      scrollRoot.removeEventListener(SIDEBAR_SCROLL_TO_PATH_EVENT, handleScrollToPath);
    };
  }, [measureContainerTopInScroll, rowHeights, rowOffsets, rows, scrollRootRef, updateViewport]);

  const virtualWindow = getVirtualFileTreeWindow({
    rowCount: rows.length,
    rowHeight: VIRTUAL_FILE_TREE_ROW_HEIGHT,
    rowHeights,
    rowOffsets,
    viewportStart: viewport.start,
    viewportHeight: viewport.height,
    overscanRows: VIRTUAL_FILE_TREE_OVERSCAN_ROWS,
  });
  const visibleRows = rows.slice(virtualWindow.startIndex, virtualWindow.endIndex);

  return (
    <div ref={containerRef} style={{ height: virtualWindow.totalHeight }} className="relative">
      <div
        className="absolute inset-x-0 top-0"
        style={{ transform: `translateY(${virtualWindow.offsetTop}px)` }}
      >
        {visibleRows.map((row) => (
          <FileTreeItem
            key={row.node.id}
            node={row.node}
            depth={row.depth}
            parentFolderPath={row.parentFolderPath}
            renderChildren={false}
          />
        ))}
      </div>
    </div>
  );
}
