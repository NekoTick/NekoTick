import { useEffect, useMemo, useRef, useState } from 'react';
import { WhiteboardCanvasLayer } from '@/components/Whiteboard/components/canvas/WhiteboardCanvasLayer';
import { EMPTY_WHITEBOARD_ERASER_PREVIEW, createWhiteboardEraserSpatialIndexAsync } from '@/components/Whiteboard/model/interaction';
import type { WhiteboardSnapshot } from '@/components/Whiteboard/model/document';
import { WHITEBOARD_DEFAULT_PAPER_STYLE, WHITEBOARD_INITIAL_VIEWPORT } from '@/components/Whiteboard/model/core';
import { readWhiteboardBoard, type WhiteboardIndexEntry } from '@/components/Whiteboard/model/persistence';
import { WhiteboardRenderData } from '@/components/Whiteboard/model/rendering';
import { fitViewportToContent } from '@/components/Whiteboard/model/geometry';
import { themeWhiteboardTokens } from '@/styles/themeTokens';

const noop = () => {};
const WHITEBOARD_PREVIEW_LOAD_DELAY_MS = 100;
const WHITEBOARD_PREVIEW_MAX_BYTES = 64 * 1024 * 1024;

export function GlobalWhiteboardSearchPreview({
  activeBoardId,
  activeSnapshot,
  board,
  notesRootPath,
}: {
  activeBoardId: string | null;
  activeSnapshot: WhiteboardSnapshot | null;
  board: WhiteboardIndexEntry;
  notesRootPath: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ x: 0, y: 0 });
  const [preview, setPreview] = useState<{
    renderData: WhiteboardRenderData;
    snapshot: WhiteboardSnapshot;
  } | null>(null);

  useEffect(() => {
    let current = true;
    const load = async () => {
      const snapshot = board.id === activeBoardId && activeSnapshot
        ? activeSnapshot
        : await readWhiteboardBoard(notesRootPath, board, {
          maxBytes: WHITEBOARD_PREVIEW_MAX_BYTES,
          shouldContinue: () => current,
        });
      if (!snapshot || !current) return;
      const spatialIndex = await createWhiteboardEraserSpatialIndexAsync(
        snapshot.elements,
        snapshot.strokes,
        () => current,
      );
      if (!current || !spatialIndex) return;
      setPreview({
        renderData: new WhiteboardRenderData(snapshot.elements, spatialIndex, snapshot.strokes),
        snapshot,
      });
    };
    setPreview(null);
    const loadTimer = board.id === activeBoardId && activeSnapshot
      ? null
      : window.setTimeout(() => void load().catch(() => undefined), WHITEBOARD_PREVIEW_LOAD_DELAY_MS);
    if (loadTimer === null) void load().catch(() => undefined);
    return () => {
      current = false;
      if (loadTimer !== null) window.clearTimeout(loadTimer);
    };
  }, [activeBoardId, activeSnapshot, board, notesRootPath]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const updateSize = () => setViewportSize((current) => {
      const next = { x: node.clientWidth, y: node.clientHeight };
      return current.x === next.x && current.y === next.y ? current : next;
    });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const viewport = useMemo(() => preview && viewportSize.x > 0 && viewportSize.y > 0
    ? fitViewportToContent(preview.snapshot.elements, preview.snapshot.strokes, viewportSize)
    : WHITEBOARD_INITIAL_VIEWPORT, [preview, viewportSize]);
  const paperStyle = preview?.snapshot.paper ?? WHITEBOARD_DEFAULT_PAPER_STYLE;

  return (
    <div
      ref={rootRef}
      className="relative size-full overflow-hidden"
      style={{
        backgroundImage: themeWhiteboardTokens.paperBackgroundImages[paperStyle],
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        backgroundSize: paperStyle === 'blank'
          ? 'auto'
          : `${themeWhiteboardTokens.paperGridSizePx[paperStyle] * viewport.zoom}px ${themeWhiteboardTokens.paperGridSizePx[paperStyle] * viewport.zoom}px`,
      }}
    >
      {preview ? (
        <WhiteboardCanvasLayer
          brushCursorColor="transparent"
          brushCursorPoint={null}
          brushCursorSize={0}
          brushCursorTool={null}
          draftStroke={null}
          eraserPreview={EMPTY_WHITEBOARD_ERASER_PREVIEW}
          movePreview={null}
          renderData={preview.renderData}
          selectionPath={null}
          spacePressed={false}
          tool="hand"
          viewport={viewport}
          viewportSize={viewportSize}
          onElementPointerDown={noop}
          onSelectionMovePointerDown={noop}
          onSelectionResizePointerDown={noop}
        />
      ) : null}
    </div>
  );
}
