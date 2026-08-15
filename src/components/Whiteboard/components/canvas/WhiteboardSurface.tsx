import { useLayoutEffect, useState, type DragEvent, type MouseEvent, type PointerEvent, type RefObject, type WheelEvent } from 'react';
import { isImageFileLike } from '@/lib/assets/core/naming';
import { cn } from '@/lib/utils';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { WhiteboardCanvasLayer } from './WhiteboardCanvasLayer';
import {
  isDrawingTool,
  isLinearTool,
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
import type { WhiteboardEraserPreview } from '../../model/whiteboardEraser';
import type { WhiteboardMovePreview, WhiteboardResizePreview, WhiteboardRotationPreview } from '../../model/whiteboardInteractions';
import type { WhiteboardRenderData } from '../../model/whiteboardRenderData';
import type { WhiteboardTextEditingState } from '../../hooks/useWhiteboardTextEditing';

interface WhiteboardSurfaceProps {
  brushCursorColor: string;
  brushCursorPoint: WhiteboardPoint | null;
  brushCursorSize: number;
  brushCursorTool: WhiteboardBrushTool | null;
  draftStroke: WhiteboardStroke | null;
  eraserPreview: WhiteboardEraserPreview;
  isPanning: boolean;
  movePreview: WhiteboardMovePreview | null;
  paperStyle: WhiteboardPaperStyle;
  renderData: WhiteboardRenderData;
  resizePreview?: WhiteboardResizePreview | null;
  rotationPreview?: WhiteboardRotationPreview | null;
  selectionPath: WhiteboardLassoPath | null;
  spacePressed: boolean;
  tool: WhiteboardTool;
  textEditing?: WhiteboardTextEditingState | null;
  viewport: WhiteboardViewport;
  viewportRef: RefObject<HTMLDivElement | null>;
  onElementPointerDown: (event: PointerEvent<HTMLDivElement>, element: WhiteboardElement) => void;
  onDoubleClick: (event: MouseEvent<HTMLDivElement>) => void;
  onImageDrop: (file: File, point: WhiteboardPoint) => void;
  onLinearPointPointerDown?: (event: PointerEvent<SVGCircleElement>, strokeId: string, pointIndex: number, midpoint: boolean) => void;
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerLeave: () => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onSelectionMovePointerDown: (event: PointerEvent<SVGElement>) => void;
  onSelectionResizePointerDown: (event: PointerEvent<SVGRectElement>, handle: WhiteboardResizeHandle) => void;
  onSelectionRotationPointerDown?: (event: PointerEvent<SVGCircleElement>, center: WhiteboardPoint) => void;
  onTextEditingChange?: (text: string) => void;
  onTextEditingCommit?: () => void;
  onWheel: (event: WheelEvent<HTMLDivElement>) => void;
}

export function WhiteboardSurface({
  brushCursorColor,
  brushCursorPoint,
  brushCursorSize,
  brushCursorTool,
  draftStroke,
  eraserPreview,
  isPanning,
  movePreview,
  paperStyle,
  renderData,
  resizePreview = null,
  rotationPreview = null,
  selectionPath,
  spacePressed,
  tool,
  textEditing = null,
  viewport,
  viewportRef,
  onElementPointerDown,
  onDoubleClick,
  onImageDrop,
  onLinearPointPointerDown,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerLeave,
  onPointerUp,
  onSelectionMovePointerDown,
  onSelectionResizePointerDown,
  onSelectionRotationPointerDown,
  onTextEditingChange,
  onTextEditingCommit,
  onWheel,
}: WhiteboardSurfaceProps) {
  const [imageDragActive, setImageDragActive] = useState(false);
  const [viewportSize, setViewportSize] = useState<WhiteboardPoint>({ x: 0, y: 0 });
  const drawing = isDrawingTool(tool);
  const usesCrosshair = tool === 'select' || tool === 'autoshape' || tool === 'text' || isLinearTool(tool);
  const movingSelection = movePreview !== null;
  const cursorClass = cn(
    'group/whiteboard-surface relative h-full overflow-hidden touch-none',
    isPanning && 'cursor-grabbing',
    !isPanning && movingSelection && 'cursor-grabbing',
    !isPanning && !movingSelection && (tool === 'hand' || spacePressed) && 'cursor-grab',
    !isPanning && !movingSelection && !spacePressed && drawing && 'cursor-none',
    !isPanning && !movingSelection && usesCrosshair && 'cursor-crosshair',
    !isPanning && !movingSelection && !drawing && !usesCrosshair && tool !== 'hand' && !spacePressed && 'cursor-default',
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
      onDoubleClick={onDoubleClick}
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
        eraserPreview={eraserPreview}
        movePreview={movePreview}
        resizePreview={resizePreview}
        rotationPreview={rotationPreview}
        renderData={renderData}
        selectionPath={selectionPath}
        spacePressed={spacePressed}
        tool={tool}
        textEditing={textEditing}
        viewport={viewport}
        viewportSize={viewportSize}
        onElementPointerDown={onElementPointerDown}
        onLinearPointPointerDown={onLinearPointPointerDown}
        onSelectionMovePointerDown={onSelectionMovePointerDown}
        onSelectionResizePointerDown={onSelectionResizePointerDown}
        onSelectionRotationPointerDown={onSelectionRotationPointerDown}
        onTextEditingChange={onTextEditingChange}
        onTextEditingCommit={onTextEditingCommit}
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
