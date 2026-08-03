import { memo, type ReactElement } from 'react';
import { getStrokeWidth, WHITEBOARD_BRUSHES, type WhiteboardStroke } from '../../model/whiteboardModel';
import {
  getPressureStrokePath,
  getStrokeDabGeometry,
  getStrokeRenderGeometry,
  getStrokeRenderWidth,
} from '../../model/whiteboardStrokeGeometry';
import { getWhiteboardStrokeRenderChunks } from '../../model/whiteboardStrokeRenderChunks';
import {
  getWhiteboardStrokeDashStyle,
  getWhiteboardStrokeNoise,
  getWhiteboardStrokeRenderSeed,
  groupWhiteboardStrokeGrainPaths,
} from '../../model/whiteboardStrokeTexture';
import { themeWhiteboardTokens } from '@/styles/themeTokens';

export const WhiteboardStrokeNode = memo(function WhiteboardStrokeNode({ stroke }: { stroke: WhiteboardStroke }) {
  const chunks = getWhiteboardStrokeRenderChunks(stroke);
  if (chunks.length === 1) return <WhiteboardStrokeRenderNode stroke={chunks[0]} />;
  return (
    <g data-whiteboard-chunked-stroke={stroke.id}>
      {chunks.map((chunk, index) => (
        <g key={index} data-whiteboard-render-chunk={index}>
          <WhiteboardStrokeRenderNode stroke={chunk} />
        </g>
      ))}
    </g>
  );
});

const strokeNodeCaches = [new WeakMap<WhiteboardStroke, ReactElement>(), new WeakMap<WhiteboardStroke, ReactElement>()];

export function getWhiteboardStrokeNode(stroke: WhiteboardStroke, erasing: boolean): ReactElement {
  const cache = strokeNodeCaches[erasing ? 1 : 0];
  const cached = cache.get(stroke);
  if (cached) return cached;
  const node = <g key={stroke.id} data-whiteboard-stroke={stroke.id} opacity={erasing ? themeWhiteboardTokens.eraserTargetPreviewOpacity : undefined}><WhiteboardStrokeNode stroke={stroke} /></g>;
  cache.set(stroke, node);
  return node;
}

const WhiteboardStrokeRenderNode = memo(function WhiteboardStrokeRenderNode({ stroke }: { stroke: WhiteboardStroke }) {
  const brush = WHITEBOARD_BRUSHES[stroke.tool];
  const color = stroke.color || brush.color;
  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    const renderWidth = getStrokeRenderWidth(stroke);
    return <WhiteboardStrokeDab color={color} opacity={brush.opacity} point={point} stroke={stroke} width={renderWidth} />;
  }
  if (stroke.tool === 'watercolor') {
    const { heavyPressurePath, mediumPressurePath, pressurePath, renderWidth, watercolorOuterPath, watercolorWashPath } = getStrokeRenderGeometry(stroke);
    return (
      <g data-whiteboard-brush="watercolor" shapeRendering="geometricPrecision">
        <PressureStrokePath color={color} d={watercolorWashPath} opacity={brush.opacity * themeWhiteboardTokens.watercolorWashOpacityScale} />
        <PressureStrokePath color={color} d={watercolorOuterPath} opacity={brush.opacity} />
        <PressureStrokePath color={color} d={pressurePath} opacity={brush.opacity * themeWhiteboardTokens.watercolorInnerOpacityScale} />
        <PressureDetailPaths color={color} heavyPath={heavyPressurePath} mediumPath={mediumPressurePath} opacity={brush.opacity * themeWhiteboardTokens.watercolorPressureCoreOpacityScale} width={renderWidth * themeWhiteboardTokens.watercolorPressureCoreWidthScale} />
        <WhiteboardStrokeEndpointDabs color={color} opacity={brush.opacity} stroke={stroke} />
      </g>
    );
  }
  if (stroke.tool === 'pencil') {
    const { centerPath, heavyPressurePath, mediumPressurePath, pressurePath, renderWidth } = getStrokeRenderGeometry(stroke);
    const primaryTexture = getWhiteboardStrokeDashStyle(stroke, themeWhiteboardTokens.pencilGrainDashArray, 0, 10);
    const secondaryTexture = getWhiteboardStrokeDashStyle(stroke, themeWhiteboardTokens.pencilGrainSecondaryDashArray, themeWhiteboardTokens.pencilGrainDashOffsetPx, 11);
    return (
      <g data-whiteboard-brush="pencil" shapeRendering="geometricPrecision">
        <PressureStrokePath color={color} d={pressurePath} opacity={brush.opacity} />
        <path d={centerPath} fill={themeWhiteboardTokens.strokeNoFill} opacity={brush.opacity * themeWhiteboardTokens.pencilGrainOpacityScale} stroke={color} strokeDasharray={primaryTexture.dashArray} strokeDashoffset={primaryTexture.dashOffset} strokeLinecap={themeWhiteboardTokens.strokeLineCap} strokeWidth={Math.max(themeWhiteboardTokens.strokeEdgeFeatherWidthPx, renderWidth * themeWhiteboardTokens.pencilGrainWidthScale)} />
        <path d={centerPath} fill={themeWhiteboardTokens.strokeNoFill} opacity={brush.opacity * themeWhiteboardTokens.pencilGrainSecondaryOpacityScale} stroke={color} strokeDasharray={secondaryTexture.dashArray} strokeDashoffset={secondaryTexture.dashOffset} strokeLinecap={themeWhiteboardTokens.strokeLineCap} strokeWidth={Math.max(themeWhiteboardTokens.strokeEdgeFeatherWidthPx, renderWidth * themeWhiteboardTokens.pencilGrainSecondaryWidthScale)} />
        <PressureDetailPaths color={color} heavyPath={heavyPressurePath} mediumPath={mediumPressurePath} opacity={brush.opacity * themeWhiteboardTokens.pencilPressureCoreOpacityScale} width={renderWidth * themeWhiteboardTokens.pencilPressureCoreWidthScale} />
      </g>
    );
  }
  if (stroke.tool === 'marker') {
    const { centerPath, heavyPressurePath, mediumPressurePath, pressurePath, renderWidth } = getStrokeRenderGeometry(stroke);
    return (
      <g data-whiteboard-brush="marker" shapeRendering="geometricPrecision">
        <PressureStrokePath color={color} d={pressurePath} opacity={brush.opacity} />
        <path d={centerPath} fill={themeWhiteboardTokens.strokeNoFill} opacity={brush.opacity * themeWhiteboardTokens.markerCoreOpacityScale} stroke={color} strokeLinecap={themeWhiteboardTokens.markerLineCap} strokeLinejoin={themeWhiteboardTokens.strokeLineJoin} strokeWidth={renderWidth * themeWhiteboardTokens.markerCoreWidthScale} />
        <PressureDetailPaths color={color} heavyPath={heavyPressurePath} mediumPath={mediumPressurePath} opacity={brush.opacity * themeWhiteboardTokens.markerPressureCoreOpacityScale} width={renderWidth * themeWhiteboardTokens.markerPressureCoreWidthScale} />
        <WhiteboardStrokeEndpointDabs color={color} opacity={brush.opacity} stroke={stroke} />
      </g>
    );
  }
  if (stroke.tool === 'colored-pencil') {
    const { grainPaths, heavyPressurePath, mediumPressurePath, pressurePath, renderWidth } = getStrokeRenderGeometry(stroke);
    return (
      <g data-whiteboard-brush="colored-pencil" shapeRendering="geometricPrecision">
        <PressureStrokePath color={color} d={pressurePath} opacity={brush.opacity * themeWhiteboardTokens.coloredPencilBodyOpacityScale} />
        <MaterialGrainPaths
          color={color}
          dashOffset={themeWhiteboardTokens.coloredPencilGrainDashOffsetPx}
          laneStart={40}
          opacity={brush.opacity * themeWhiteboardTokens.coloredPencilGrainOpacityScale}
          paths={grainPaths}
          primaryPattern={themeWhiteboardTokens.coloredPencilGrainDashArray}
          secondaryPattern={themeWhiteboardTokens.coloredPencilGrainSecondaryDashArray}
          stroke={stroke}
          width={Math.max(themeWhiteboardTokens.strokeEdgeFeatherWidthPx, renderWidth * themeWhiteboardTokens.coloredPencilGrainWidthScale)}
        />
        <PressureDetailPaths color={color} heavyPath={heavyPressurePath} mediumPath={mediumPressurePath} opacity={brush.opacity * themeWhiteboardTokens.coloredPencilGrainOpacityScale} width={renderWidth * themeWhiteboardTokens.coloredPencilGrainWidthScale} />
      </g>
    );
  }
  if (stroke.tool === 'crayon') {
    const { grainPaths, heavyPressurePath, mediumPressurePath, pressurePath, renderWidth } = getStrokeRenderGeometry(stroke);
    return (
      <g data-whiteboard-brush="crayon" shapeRendering="geometricPrecision">
        <PressureStrokePath color={color} d={pressurePath} opacity={brush.opacity * themeWhiteboardTokens.crayonBodyOpacityScale} />
        <MaterialGrainPaths
          color={color}
          dashOffset={themeWhiteboardTokens.crayonGrainDashOffsetPx}
          laneStart={60}
          opacity={brush.opacity * themeWhiteboardTokens.crayonGrainOpacityScale}
          paths={grainPaths}
          primaryPattern={themeWhiteboardTokens.crayonGrainDashArray}
          secondaryPattern={themeWhiteboardTokens.crayonGrainSecondaryDashArray}
          stroke={stroke}
          width={Math.max(themeWhiteboardTokens.strokeEdgeFeatherWidthPx, renderWidth * themeWhiteboardTokens.crayonGrainWidthScale)}
        />
        <PressureDetailPaths color={color} heavyPath={heavyPressurePath} mediumPath={mediumPressurePath} opacity={brush.opacity * themeWhiteboardTokens.crayonGrainOpacityScale} width={renderWidth * themeWhiteboardTokens.crayonGrainWidthScale} />
        <WhiteboardStrokeEndpointDabs color={color} opacity={brush.opacity} stroke={stroke} />
      </g>
    );
  }
  if (stroke.tool === 'fountain') {
    const { centerPath, heavyPressurePath, mediumPressurePath, pressurePath, renderWidth } = getStrokeRenderGeometry(stroke);
    return (
      <g data-whiteboard-brush="fountain" shapeRendering="geometricPrecision">
        <PressureStrokePath color={color} d={pressurePath} opacity={brush.opacity} />
        <path d={centerPath} fill={themeWhiteboardTokens.strokeNoFill} opacity={themeWhiteboardTokens.fountainCoreOpacityScale} stroke={color} strokeLinecap={themeWhiteboardTokens.strokeLineCap} strokeWidth={renderWidth * themeWhiteboardTokens.fountainCoreWidthScale} />
        <PressureDetailPaths color={color} heavyPath={heavyPressurePath} mediumPath={mediumPressurePath} opacity={themeWhiteboardTokens.fountainCoreOpacityScale} width={renderWidth * themeWhiteboardTokens.fountainCoreWidthScale} />
      </g>
    );
  }
  return (
    <g data-whiteboard-brush="pen" opacity={brush.opacity} shapeRendering="geometricPrecision">
      <PressureStrokePath color={color} d={getPressureStrokePath(stroke)} />
    </g>
  );
});

function WhiteboardStrokeDab({
  color,
  opacity,
  point,
  stroke,
  width,
}: {
  color: string;
  opacity: number;
  point: WhiteboardStroke['points'][number];
  stroke: WhiteboardStroke;
  width: number;
}) {
  const geometry = getStrokeDabGeometry(stroke.tool, width, point);
  const transform = geometry.angle ? `rotate(${geometry.angle} ${point.x} ${point.y})` : undefined;
  if (geometry.shape === 'rect') {
    return <rect data-whiteboard-brush-dab="marker" x={point.x - geometry.width / 2} y={point.y - geometry.height / 2} width={geometry.width} height={geometry.height} rx={themeWhiteboardTokens.strokeEdgeFeatherWidthPx} fill={color} opacity={opacity} transform={transform} />;
  }
  if (stroke.tool === 'fountain') {
    return <ellipse data-whiteboard-brush-dab="fountain" cx={point.x} cy={point.y} rx={geometry.width / 2} ry={geometry.height / 2} fill={color} opacity={opacity} transform={transform} />;
  }
  if (stroke.tool === 'watercolor') {
    return (
      <g data-whiteboard-brush-dab="watercolor">
        <ellipse cx={point.x} cy={point.y} rx={geometry.width * themeWhiteboardTokens.watercolorWashWidthScale / 2} ry={geometry.height * themeWhiteboardTokens.watercolorWashWidthScale / 2} fill={color} opacity={opacity * themeWhiteboardTokens.watercolorWashOpacityScale} transform={transform} />
        <ellipse cx={point.x} cy={point.y} rx={geometry.width * themeWhiteboardTokens.watercolorOuterWidthScale / 2} ry={geometry.height * themeWhiteboardTokens.watercolorOuterWidthScale / 2} fill={color} opacity={opacity} transform={transform} />
        <ellipse cx={point.x} cy={point.y} rx={geometry.width / 2} ry={geometry.height / 2} fill={color} opacity={opacity * themeWhiteboardTokens.watercolorInnerOpacityScale} transform={transform} />
      </g>
    );
  }
  if (stroke.tool === 'pencil' || stroke.tool === 'colored-pencil' || stroke.tool === 'crayon') {
    const material = stroke.tool === 'pencil'
      ? { bodyOpacity: opacity, dashArray: themeWhiteboardTokens.pencilGrainDashArray, textureOpacity: opacity * themeWhiteboardTokens.pencilGrainOpacityScale }
      : stroke.tool === 'colored-pencil'
        ? { bodyOpacity: opacity * themeWhiteboardTokens.coloredPencilBodyOpacityScale, dashArray: themeWhiteboardTokens.coloredPencilGrainDashArray, textureOpacity: opacity * themeWhiteboardTokens.coloredPencilGrainOpacityScale }
        : { bodyOpacity: opacity * themeWhiteboardTokens.crayonBodyOpacityScale, dashArray: themeWhiteboardTokens.crayonGrainDashArray, textureOpacity: opacity * themeWhiteboardTokens.crayonGrainOpacityScale };
    const texture = getWhiteboardStrokeDashStyle(stroke, material.dashArray, 0, 30);
    return (
      <g data-whiteboard-brush-dab={stroke.tool}>
        <ellipse cx={point.x} cy={point.y} rx={geometry.width / 2} ry={geometry.height / 2} fill={color} opacity={material.bodyOpacity} transform={transform} />
        <ellipse cx={point.x} cy={point.y} rx={Math.max(0, geometry.width / 2 - themeWhiteboardTokens.strokeEdgeFeatherWidthPx)} ry={Math.max(0, geometry.height / 2 - themeWhiteboardTokens.strokeEdgeFeatherWidthPx)} fill={themeWhiteboardTokens.strokeNoFill} opacity={material.textureOpacity} stroke={color} strokeDasharray={texture.dashArray} strokeDashoffset={texture.dashOffset} strokeWidth={themeWhiteboardTokens.strokeEdgeFeatherWidthPx} transform={transform} />
      </g>
    );
  }
  if (geometry.shape === 'ellipse') {
    return <ellipse data-whiteboard-brush-dab="pen" cx={point.x} cy={point.y} rx={geometry.width / 2} ry={geometry.height / 2} fill={color} opacity={opacity} transform={transform} />;
  }
  return <circle data-whiteboard-brush-dab="pen" cx={point.x} cy={point.y} fill={color} opacity={opacity} r={geometry.width / 2} />;
}

function WhiteboardStrokeEndpointDabs({ color, opacity, stroke }: {
  color: string;
  opacity: number;
  stroke: WhiteboardStroke;
}) {
  const start = stroke.renderTaperStart !== false ? stroke.points[0] : null;
  const end = stroke.renderTaperEnd !== false ? stroke.points.at(-1) : null;
  return (
    <>
      {start ? <WhiteboardStrokeDab color={color} opacity={opacity} point={start} stroke={stroke} width={getStrokeWidth(stroke.tool, start.pressure, stroke.size)} /> : null}
      {end && end !== start ? <WhiteboardStrokeDab color={color} opacity={opacity} point={end} stroke={stroke} width={getStrokeWidth(stroke.tool, end.pressure, stroke.size)} /> : null}
    </>
  );
}

function MaterialGrainPaths({
  color,
  dashOffset,
  laneStart,
  opacity,
  paths,
  primaryPattern,
  secondaryPattern,
  stroke,
  width,
}: {
  color: string;
  dashOffset: number;
  laneStart: number;
  opacity: number;
  paths: string[];
  primaryPattern: string;
  secondaryPattern: string;
  stroke: WhiteboardStroke;
  width: number;
}) {
  const strokeSeed = getWhiteboardStrokeRenderSeed(stroke);
  const widthVariation = stroke.tool === 'colored-pencil'
    ? themeWhiteboardTokens.coloredPencilGrainWidthVariationScale
    : themeWhiteboardTokens.crayonGrainWidthVariationScale;
  const opacityVariation = stroke.tool === 'colored-pencil'
    ? themeWhiteboardTokens.coloredPencilGrainOpacityVariationScale
    : themeWhiteboardTokens.crayonGrainOpacityVariationScale;
  return groupWhiteboardStrokeGrainPaths(paths).map(({ laneParity, path }) => {
    const texture = getWhiteboardStrokeDashStyle(
      stroke,
      laneParity === 0 ? primaryPattern : secondaryPattern,
      laneParity * dashOffset,
      laneStart + laneParity,
    );
    const laneWidth = Math.max(
      themeWhiteboardTokens.strokeEdgeFeatherWidthPx,
      width * (1 + getWhiteboardStrokeNoise(strokeSeed, laneParity, laneStart + 100) * widthVariation),
    );
    const laneOpacity = Math.min(
      1,
      opacity * (1 + getWhiteboardStrokeNoise(strokeSeed, laneParity, laneStart + 200) * opacityVariation),
    );
    return (
      <path
        key={laneParity}
        data-whiteboard-grain-group={laneParity}
        d={path}
        fill={themeWhiteboardTokens.strokeNoFill}
        opacity={laneOpacity}
        stroke={color}
        strokeDasharray={texture.dashArray}
        strokeDashoffset={texture.dashOffset}
        strokeLinecap={themeWhiteboardTokens.strokeLineCap}
        strokeLinejoin={themeWhiteboardTokens.strokeLineJoin}
        strokeWidth={laneWidth}
      />
    );
  });
}

function PressureStrokePath({ color, d, opacity }: { color: string; d: string; opacity?: number }) {
  return (
    <path
      d={d}
      fill={color}
      opacity={opacity}
      stroke={color}
      strokeLinejoin={themeWhiteboardTokens.strokeLineJoin}
      strokeWidth={themeWhiteboardTokens.strokeEdgeFeatherWidthPx}
    />
  );
}

function PressureDetailPaths({ color, heavyPath, mediumPath, opacity, width }: {
  color: string;
  heavyPath: string;
  mediumPath: string;
  opacity: number;
  width: number;
}) {
  return (
    <>
      {mediumPath ? <path d={mediumPath} fill={themeWhiteboardTokens.strokeNoFill} opacity={opacity} stroke={color} strokeLinecap={themeWhiteboardTokens.strokeLineCap} strokeWidth={width} /> : null}
      {heavyPath ? <path d={heavyPath} fill={themeWhiteboardTokens.strokeNoFill} opacity={opacity} stroke={color} strokeLinecap={themeWhiteboardTokens.strokeLineCap} strokeWidth={width} /> : null}
    </>
  );
}
