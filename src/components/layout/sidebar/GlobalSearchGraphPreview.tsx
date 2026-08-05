import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GraphCanvasScene } from '@/components/Graph/canvas/GraphCanvasScene';
import { useGraphCanvasSize } from '@/components/Graph/hooks/useGraphCanvasSize';
import { filterNoteGraph } from '@/components/Graph/model/graphFilters';
import { layoutNoteGraph } from '@/components/Graph/model/graphLayout';
import { buildNoteGraph } from '@/components/Graph/model/noteGraph';
import { fitGraphViewportToNodes } from '@/components/Graph/model/graphViewport';
import { getNoteTitleFromPath } from '@/lib/notes/displayName';
import { Icon } from '@/components/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  raisedPillSurfaceClass,
  raisedPopoverSurfaceClass,
} from '@/components/ui/surfaceStyles';
import { useI18n } from '@/lib/i18n';
import { cn, iconButtonStyles } from '@/lib/utils';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import { themeGraphTokens, themeUiFeedbackTokens } from '@/styles/themeTokens';

const noop = () => {};

function scheduleGraphPreviewWork(callback: () => void) {
  if (typeof window.requestIdleCallback === 'function') {
    const idleId = window.requestIdleCallback(callback);
    return () => window.cancelIdleCallback?.(idleId);
  }
  const timeoutId = window.setTimeout(callback, 0);
  return () => window.clearTimeout(timeoutId);
}

export function GlobalSearchLocalGraphPreview({
  focusPath,
  onOpenPath,
}: {
  focusPath: string;
  onOpenPath?: (path: string) => void;
}) {
  const { t } = useI18n();
  const rootFolder = useNotesStore((state) => state.rootFolder);
  const noteContentsCache = useNotesStore((state) => state.noteContentsCache);
  const noteContentsCacheRevision = useNotesStore((state) => state.noteContentsCacheRevision);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const canvasSize = useGraphCanvasSize(svgRef);
  const graph = useMemo(() => {
    const fullGraph = buildNoteGraph(
      rootFolder?.children ?? [],
      noteContentsCache,
      noteContentsCacheRevision,
      [focusPath],
    );
    const localGraph = filterNoteGraph(fullGraph, {
      scope: 'local',
      focusNodeId: focusPath,
      localDepth: 1,
    });
    return layoutNoteGraph(localGraph.nodes.length > 0 ? localGraph : {
      edges: [],
      nodes: [{
        degree: 0,
        id: focusPath,
        label: getNoteTitleFromPath(focusPath),
      }],
    }, focusPath);
  }, [focusPath, noteContentsCache, noteContentsCacheRevision, rootFolder]);
  const viewport = useMemo(
    () => fitGraphViewportToNodes(graph.nodes, canvasSize),
    [canvasSize, graph.nodes],
  );

  return (
    <div
      data-global-search-local-graph={focusPath}
      className="h-full min-h-0 overflow-hidden bg-[var(--vlaina-color-graph-canvas)]"
    >
      <svg
        ref={svgRef}
        role={onOpenPath ? 'group' : undefined}
        aria-label={onOpenPath ? t('app.viewGraph') : undefined}
        aria-hidden={onOpenPath ? undefined : true}
        focusable="false"
        className={cn('h-full w-full', !onOpenPath && 'pointer-events-none')}
      >
        <g aria-hidden={onOpenPath ? true : undefined}>
          <GraphCanvasScene
            currentPath={focusPath}
            dragPositionId={null}
            edges={graph.edges}
            focusablePath={null}
            hoveredPath={hoveredPath}
            labelsReady
            labelLayoutRevision={0}
            maxVisibleLabels={graph.nodes.length > themeGraphTokens.localPreviewAllLabelNodeLimit
              ? themeGraphTokens.localPreviewDenseLabelLimit
              : undefined}
            nodes={graph.nodes}
            onHoverChange={noop}
            onFocusChange={noop}
            onNavigate={noop}
            onOpen={noop}
            onPositionNudge={noop}
            onSelect={noop}
            onStartDrag={noop}
            selectedPath={focusPath}
            showAllLabels={graph.nodes.length <= themeGraphTokens.localPreviewAllLabelNodeLimit}
            viewport={viewport}
            viewportSize={canvasSize}
          />
        </g>
        {onOpenPath ? (
          <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
            {graph.nodes.map((node) => (
              <circle
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={node.label}
                data-graph-preview-target={node.id}
                cx={node.x}
                cy={node.y}
                r={themeGraphTokens.nodeHitRadiusPx / viewport.zoom}
                pointerEvents="all"
                className="cursor-pointer fill-transparent outline-none"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenPath(node.id);
                }}
                onFocus={() => setHoveredPath(node.id)}
                onBlur={() => setHoveredPath(null)}
                onPointerEnter={() => setHoveredPath(node.id)}
                onPointerLeave={() => setHoveredPath(null)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  onOpenPath(node.id);
                }}
              />
            ))}
          </g>
        ) : null}
      </svg>
    </div>
  );
}

export function GlobalSearchGraphPreviewButton({
  focusPath,
  onOpenGraph,
}: {
  focusPath: string;
  onOpenGraph: (path: string) => void;
}) {
  const { t } = useI18n();
  const connectionCount = useGlobalSearchGraphConnectionCount(focusPath);
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const cancelScheduledClose = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);
  const showPreview = useCallback(() => {
    cancelScheduledClose();
    setOpen(true);
  }, [cancelScheduledClose]);
  const scheduleClose = useCallback(() => {
    cancelScheduledClose();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
    }, themeUiFeedbackTokens.hoverPeekOpenDelayMs);
  }, [cancelScheduledClose]);

  useEffect(() => cancelScheduledClose, [cancelScheduledClose]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={connectionCount > 0
            ? `${t('app.viewGraph')}, ${t('graph.linksCount', { count: connectionCount })}`
            : t('app.viewGraph')}
          onClick={() => onOpenGraph(focusPath)}
          onFocus={showPreview}
          onBlur={scheduleClose}
          onPointerEnter={showPreview}
          onPointerLeave={scheduleClose}
          className={cn(
            'absolute right-[var(--vlaina-space-16px)] top-[var(--vlaina-space-16px)] z-[var(--vlaina-z-20)] flex h-[var(--vlaina-size-36px)] min-w-[var(--vlaina-size-36px)] items-center justify-center rounded-full',
            connectionCount > 0
              ? 'gap-[var(--vlaina-space-4px)] px-[var(--vlaina-space-10px)]'
              : 'w-[var(--vlaina-size-36px)]',
            iconButtonStyles,
            raisedPillSurfaceClass,
            'text-[var(--vlaina-accent)] hover:text-[var(--vlaina-accent-hover)]',
          )}
        >
          <Icon name="graph.network" size="sm" />
          {connectionCount > 0 ? (
            <span
              aria-hidden="true"
              className="text-[length:var(--vlaina-font-12)] font-semibold leading-none tabular-nums"
            >
              {connectionCount}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        aria-label={t('app.viewGraph')}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={showPreview}
        onPointerLeave={scheduleClose}
        className={cn(
          'h-[var(--vlaina-size-240px)] w-[var(--vlaina-size-360px)] overflow-hidden rounded-[var(--vlaina-ui-radius-panel)] p-0',
          raisedPopoverSurfaceClass,
        )}
      >
        <GlobalSearchLocalGraphPreview focusPath={focusPath} onOpenPath={onOpenGraph} />
      </PopoverContent>
    </Popover>
  );
}

function useGlobalSearchGraphConnectionCount(focusPath: string) {
  const rootFolder = useNotesStore((state) => state.rootFolder);
  const noteContentsCache = useNotesStore((state) => state.noteContentsCache);
  const noteContentsCacheRevision = useNotesStore((state) => state.noteContentsCacheRevision);
  const sourceKey = useMemo(() => ({}), [
    focusPath,
    noteContentsCache,
    noteContentsCacheRevision,
    rootFolder,
  ]);
  const [resolvedCount, setResolvedCount] = useState<{ key: object; value: number } | null>(null);

  useEffect(() => scheduleGraphPreviewWork(() => {
    const graph = buildNoteGraph(
      rootFolder?.children ?? [],
      noteContentsCache,
      noteContentsCacheRevision,
      [focusPath],
    );
    setResolvedCount({
      key: sourceKey,
      value: graph.nodes.find((node) => node.id === focusPath)?.degree ?? 0,
    });
  }), [focusPath, noteContentsCache, noteContentsCacheRevision, rootFolder, sourceKey]);

  return resolvedCount?.key === sourceKey ? resolvedCount.value : 0;
}
