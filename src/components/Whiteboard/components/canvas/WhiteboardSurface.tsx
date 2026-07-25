import { useLayoutEffect, useState, type DragEvent, type PointerEvent, type RefObject, type WheelEvent } from 'react';
import { isImageFileLike } from '@/lib/assets/core/naming';
import { cn } from '@/lib/utils';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { WhiteboardCanvasLayer } from './WhiteboardCanvasLayer';
import {
  isDrawingTool,
  type WhiteboardBrushTool,
  type WhiteboardElement,
  type WhiteboardPoint,
  type WhiteboardPaperStyle,
  type WhiteboardStroke,
  type WhiteboardTool,
  type WhiteboardViewport,
} from '../../model/whiteboardModel';
import type { WhiteboardLassoPath } from '../../model/whiteboardSelection';
import type { WhiteboardResizeHandle } from '../../model/whiteboardSelection';
import type { WhiteboardEraserPreview, WhiteboardEraserSpatialIndex } from '../../model/whiteboardEraser';
import type { WhiteboardMovePreview } from '../../model/whiteboardInteractions';

interface WhiteboardSurfaceProps {
  brushCursorColor: string;
  brushCursorPoint: WhiteboardPoint | null;
  brushCursorSize: number;
  brushCursorTool: WhiteboardBrushTool | null;
  draftStroke: WhiteboardStroke | null;
  elements: WhiteboardElement[];
  eraserPreview: WhiteboardEraserPreview;
  isPanning: boolean;
  movePreview: WhiteboardMovePreview | null;
  paperStyle: WhiteboardPaperStyle;
  selectedElementIds: string[];
  selectedStrokeIds: string[];
  selectionPath: WhiteboardLassoPath | null;
  spacePressed: boolean;
  spatialIndex: WhiteboardEraserSpatialIndex;
  strokes: WhiteboardStroke[];
  tool: WhiteboardTool;
  viewport: WhiteboardViewport;
  viewportRef: RefObject<HTMLDivElement | null>;
  onElementPointerDown: (event: PointerEvent<HTMLDivElement>, element: WhiteboardElement) => void;
  onImageDrop: (file: File, point: WhiteboardPoint) => void;
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerLeave: () => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onSelectionMovePointerDown: (event: PointerEvent<SVGElement>) => void;
  onSelectionResizePointerDown: (event: PointerEvent<SVGRectElement>, handle: WhiteboardResizeHandle) => void;
  onWheel: (event: WheelEvent<HTMLDivElement>) => void;
}

export function WhiteboardSurface({
  brushCursorColor,
  brushCursorPoint,
  brushCursorSize,
  brushCursorTool,
  draftStroke,
  elements,
  eraserPreview,
  isPanning,
  movePreview,
  paperStyle,
  selectedElementIds,
  selectedStrokeIds,
  selectionPath,
  spacePressed,
  spatialIndex,
  strokes,
  tool,
  viewport,
  viewportRef,
  onElementPointerDown,
  onImageDrop,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerLeave,
  onPointerUp,
  onSelectionMovePointerDown,
  onSelectionResizePointerDown,
  onWheel,
}: WhiteboardSurfaceProps) {
  const [imageDragActive, setImageDragActive] = useState(false);
  const [viewportSize, setViewportSize] = useState<WhiteboardPoint>({ x: 0, y: 0 });
  const drawing = isDrawingTool(tool);
  const usesCrosshair = tool === 'select';
  const movingSelection = movePreview !== null;
  const cursorClass = cn(
    'group/whiteboard-surface relative h-full overflow-hidden touch-none',
    isPanning && 'cursor-grabbing',
    !isPanning && movingSelection && 'cursor-grabbing',
    !isPanning && !movingSelection && (tool === 'hand' || spacePressed) && 'cursor-grab',
    !isPanning && !movingSelection && !spacePressed && (drawing || tool === 'stroke-eraser') && 'cursor-none',
    !isPanning && !movingSelection && usesCrosshair && 'cursor-crosshair',
    !isPanning && !movingSelection && !drawing && !usesCrosshair && tool !== 'hand' && !spacePressed && tool !== 'stroke-eraser' && 'cursor-default',
  );
  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!hasImageFile(event.dataTransfer)) return;
    event.preventDefault();
    setImageDragActive(true);
    event.dataTransfer.dropEffect = 'copy';
  };
  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setImageDragActive(false);
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    const imageFile = getFirstImageFile(event.dataTransfer);
    if (!imageFile) return;
    event.preventDefault();
    setImageDragActive(false);
    onImageDrop(imageFile, { x: event.clientX, y: event.clientY });
  };
  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) return undefined;
    const updateSize = () => setViewportSize((current) => {
      const next = { x: node.clientWidth, y: node.clientHeight };
      return current.x === next.x && current.y === next.y ? current : next;
    });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, [viewportRef]);

  return (
    <div
      ref={viewportRef}
      className={cursorClass}
      style={{
        backgroundImage: themeWhiteboardTokens.paperBackgroundImages[paperStyle],
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        backgroundSize: paperStyle === 'blank'
          ? 'auto'
          : `${themeWhiteboardTokens.paperGridSizePx[paperStyle] * viewport.zoom}px ${themeWhiteboardTokens.paperGridSizePx[paperStyle] * viewport.zoom}px`,
      }}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onWheel={onWheel}
    >
      <WhiteboardCanvasLayer
        brushCursorColor={brushCursorColor}
        brushCursorPoint={brushCursorPoint}
        brushCursorSize={brushCursorSize}
        brushCursorTool={brushCursorTool}
        draftStroke={draftStroke}
        elements={elements}
        eraserPreview={eraserPreview}
        movePreview={movePreview}
        selectedElementIds={selectedElementIds}
        selectedStrokeIds={selectedStrokeIds}
        selectionPath={selectionPath}
        spacePressed={spacePressed}
        spatialIndex={spatialIndex}
        strokes={strokes}
        tool={tool}
        viewport={viewport}
        viewportSize={viewportSize}
        onElementPointerDown={onElementPointerDown}
        onSelectionMovePointerDown={onSelectionMovePointerDown}
        onSelectionResizePointerDown={onSelectionResizePointerDown}
      />
      {imageDragActive ? (
        <div className="pointer-events-none absolute inset-4 rounded-[var(--vlaina-radius-8px)] border border-[var(--vlaina-color-whiteboard-selected)] bg-[var(--vlaina-color-whiteboard-selection-fill)] shadow-[var(--vlaina-shadow-toolbar)]" />
      ) : null}
    </div>
  );
}

function hasImageFile(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.items).some((item) => {
    if (item.kind !== 'file') return false;
    const itemMimeType = item.type.split(';')[0]?.trim().toLowerCase() ?? '';
    if (itemMimeType.startsWith('image/')) return true;
    if (itemMimeType && itemMimeType !== 'application/octet-stream') return false;
    const file = item.getAsFile();
    return file ? isImageFileLike(file) : false;
  });
}

function getFirstImageFile(dataTransfer: DataTransfer): File | null {
  return Array.from(dataTransfer.files).find(isImageFileLike) ?? null;
}
