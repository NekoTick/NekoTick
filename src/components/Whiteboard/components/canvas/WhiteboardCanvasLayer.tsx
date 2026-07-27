import { useMemo, useRef, type CSSProperties, type PointerEvent } from 'react';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { WhiteboardBrushCursor } from './WhiteboardBrushCursor';
import { WhiteboardContentLayer } from './WhiteboardContentLayer';
import { WhiteboardEraserTrail } from './WhiteboardEraserTrail';
import { WhiteboardDraftStrokeLayer, WhiteboardStrokeLayer } from './WhiteboardStrokeLayer';
import {
  isDrawingTool,
  type WhiteboardBrushTool,
  type WhiteboardElement,
  type WhiteboardPoint,
  type WhiteboardStroke,
  type WhiteboardTool,
  type WhiteboardViewport,
} from '../../model/whiteboardModel';
import {
  getStrokeBounds,
  rectsOverlap,
  type WhiteboardLassoPath,
  type WhiteboardResizeHandle,
  type WhiteboardSelectionRect,
} from '../../model/whiteboardSelection';
import { getWhiteboardCullingWindow, type WhiteboardCullingWindow } from '../../model/whiteboardViewport';
import type { WhiteboardMovePreview, WhiteboardResizePreview } from '../../model/whiteboardInteractions';
import type { WhiteboardStrokeEraserPreview } from '../../model/whiteboardStrokeEraser';
import { getWhiteboardAppendStart } from '../../model/whiteboardCollection';
import { WhiteboardRenderData } from '../../model/whiteboardRenderData';
import {
  getWhiteboardBoundsCandidates,
  type WhiteboardEraserPreview,
  type WhiteboardEraserSpatialIndex,
} from '../../model/whiteboardEraser';

interface WhiteboardCanvasLayerProps {
  brushCursorColor: string;
  brushCursorPoint: WhiteboardPoint | null;
  brushCursorSize: number;
  brushCursorTool: WhiteboardBrushTool | null;
  draftStroke: WhiteboardStroke | null;
  eraserPreview: WhiteboardEraserPreview;
  movePreview: WhiteboardMovePreview | null;
  renderData: WhiteboardRenderData;
  resizePreview?: WhiteboardResizePreview | null;
  selectionPath: WhiteboardLassoPath | null;
  spacePressed: boolean;
  strokeEraserPreview?: WhiteboardStrokeEraserPreview | null;
  tool: WhiteboardTool;
  viewport: WhiteboardViewport;
  viewportSize: WhiteboardPoint;
  onElementPointerDown: (event: PointerEvent<HTMLDivElement>, element: WhiteboardElement) => void;
  onSelectionMovePointerDown: (event: PointerEvent<SVGElement>) => void;
  onSelectionResizePointerDown: (event: PointerEvent<SVGRectElement>, handle: WhiteboardResizeHandle) => void;
}

export function WhiteboardCanvasLayer(props: WhiteboardCanvasLayerProps) {
  const { elements, selectedElementIds, selectedStrokeIds, spatialIndex, strokes } = props.renderData;
  const transformStyle: CSSProperties = {
    transform: `translate(${props.viewport.x}px, ${props.viewport.y}px) scale(${props.viewport.zoom})`,
    transformOrigin: themeWhiteboardTokens.layerTransformOrigin,
    willChange: 'transform',
  };
  const cullingWindowRef = useRef<WhiteboardCullingWindow | null>(null);
  const cullingWindow = getWhiteboardCullingWindow(cullingWindowRef.current, props.viewport, props.viewportSize);
  cullingWindowRef.current = cullingWindow;
  const visibleRect = cullingWindow.rect;
  const completedLayersRef = useRef<ReturnType<typeof getCompletedStrokeLayers> | null>(null);
  const completedLayers = getCompletedStrokeLayers(
    completedLayersRef.current, elements, strokes, spatialIndex, isDrawingTool(props.tool),
  );
  completedLayersRef.current = completedLayers;
  const selectionGeometry = completedLayers.base === strokes ? props.renderData.selectionGeometry : null;
  const completedRenderData = useMemo(
    () => new WhiteboardRenderData(
      elements,
      completedLayers.spatialIndex,
      completedLayers.base,
      selectionGeometry,
      selectedElementIds,
      selectedStrokeIds,
    ),
    [completedLayers.base, completedLayers.spatialIndex, elements, selectedElementIds, selectedStrokeIds, selectionGeometry],
  );
  const appendedStrokes = useMemo(
    () => getVisibleAppendedStrokes(
      completedLayers.appended,
      completedLayers.base.length,
      strokes,
      spatialIndex,
      visibleRect,
    ),
    [completedLayers, spatialIndex, strokes, visibleRect],
  );

  return (
    <>
      <div data-whiteboard-layer="content" className="absolute inset-0 overflow-visible" style={transformStyle}>
        <WhiteboardContentLayer
          erasingElementIds={props.eraserPreview.elementIds}
          erasingStrokeIds={props.eraserPreview.strokeIds}
          movePreview={props.movePreview}
          renderData={completedRenderData}
          resizePreview={props.resizePreview ?? null}
          selectionPath={props.selectionPath}
          spacePressed={props.spacePressed}
          strokeEraserPreview={props.strokeEraserPreview ?? null}
          tool={props.tool}
          visibleRect={visibleRect}
          onElementPointerDown={props.onElementPointerDown}
          onSelectionMovePointerDown={props.onSelectionMovePointerDown}
          onSelectionResizePointerDown={props.onSelectionResizePointerDown}
        />
      </div>
      <div data-whiteboard-layer="appended" className="pointer-events-none absolute inset-0 overflow-visible" style={transformStyle}>
        {appendedStrokes.length > 0 ? <WhiteboardStrokeLayer strokes={appendedStrokes} /> : null}
      </div>
      <div
        data-whiteboard-layer="interaction"
        className="pointer-events-none absolute inset-0 overflow-visible"
        style={transformStyle}
      >
        <WhiteboardEraserTrail trail={props.eraserPreview.trail} zoom={props.viewport.zoom} />
        <WhiteboardDraftStrokeLayer stroke={props.draftStroke} />
        <WhiteboardBrushCursor
          color={props.brushCursorColor}
          point={props.brushCursorPoint}
          size={props.brushCursorSize}
          tool={props.brushCursorTool}
        />
      </div>
    </>
  );
}

function getCompletedStrokeLayers(
  current: { all: WhiteboardStroke[]; appended: WhiteboardStroke[]; base: WhiteboardStroke[]; elements: WhiteboardElement[]; spatialIndex: WhiteboardEraserSpatialIndex } | null,
  elements: WhiteboardElement[], strokes: WhiteboardStroke[], spatialIndex: WhiteboardEraserSpatialIndex, append: boolean,
) {
  if (append && current && current.elements === elements) {
    if (current.all === strokes) return current;
    const appendStart = getWhiteboardAppendStart(current.all, strokes);
    if (
      appendStart === current.all.length ||
      (strokes.length >= current.all.length && current.all.every((stroke, index) => stroke === strokes[index]))
    ) {
      return { ...current, all: strokes, appended: strokes.slice(current.base.length) };
    }
  }
  return { all: strokes, appended: [], base: strokes, elements, spatialIndex };
}

function getVisibleAppendedStrokes(
  appended: WhiteboardStroke[],
  baseLength: number,
  strokes: WhiteboardStroke[],
  spatialIndex: WhiteboardEraserSpatialIndex,
  visibleRect: WhiteboardSelectionRect | null,
): WhiteboardStroke[] {
  if (!visibleRect || appended.length === 0) return appended;
  const candidates = spatialIndex.allStrokes === strokes
    ? getWhiteboardBoundsCandidates(spatialIndex, visibleRect).strokes.filter((stroke) => (
      (spatialIndex.strokeOrder.get(stroke.id) ?? -1) >= baseLength
    ))
    : appended;
  return candidates.filter((stroke) => {
    const bounds = getStrokeBounds(stroke);
    return stroke.points.length > 0 && Boolean(bounds && rectsOverlap(bounds, visibleRect));
  });
}
