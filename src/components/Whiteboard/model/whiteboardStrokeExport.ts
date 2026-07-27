import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { WHITEBOARD_BRUSHES, type WhiteboardStroke } from './whiteboardModel';
import { getStrokeDabGeometry, getStrokeRenderGeometry, getStrokeRenderWidth } from './whiteboardStrokeRenderGeometry';
import { getWhiteboardStrokeDashStyle, getWhiteboardStrokeNoise, getWhiteboardStrokeSeed, groupWhiteboardStrokeGrainPaths } from './whiteboardStrokeTexture';

export function renderWhiteboardStrokeSvg(stroke: WhiteboardStroke): string {
  if (stroke.points.length === 0) return '';
  const brush = WHITEBOARD_BRUSHES[stroke.tool];
  const color = escapeAttr(stroke.color || brush.color);
  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    return renderStrokeDab(stroke, color, brush.opacity, point.x, point.y, getStrokeRenderWidth(stroke));
  }
  const { centerPath, grainPaths, heavyPressurePath, mediumPressurePath, pressurePath, renderWidth } = getStrokeRenderGeometry(stroke);
  const pressure = renderPressurePath(pressurePath, color, brush.opacity);
  if (stroke.tool === 'watercolor') {
    return wrapBrush('watercolor', [
      renderLine(centerPath, color, renderWidth * themeWhiteboardTokens.watercolorWashWidthScale, brush.opacity * themeWhiteboardTokens.watercolorWashOpacityScale),
      renderLine(centerPath, color, renderWidth * themeWhiteboardTokens.watercolorOuterWidthScale, brush.opacity),
      renderPressurePath(pressurePath, color, brush.opacity * themeWhiteboardTokens.watercolorInnerOpacityScale),
      ...renderPressureDetails(mediumPressurePath, heavyPressurePath, color, renderWidth * themeWhiteboardTokens.watercolorPressureCoreWidthScale, brush.opacity * themeWhiteboardTokens.watercolorPressureCoreOpacityScale),
    ]);
  }
  if (stroke.tool === 'pencil') {
    const primaryTexture = getWhiteboardStrokeDashStyle(stroke, themeWhiteboardTokens.pencilGrainDashArray, 0, 10);
    const secondaryTexture = getWhiteboardStrokeDashStyle(stroke, themeWhiteboardTokens.pencilGrainSecondaryDashArray, themeWhiteboardTokens.pencilGrainDashOffsetPx, 11);
    return wrapBrush('pencil', [
      pressure,
      renderLine(centerPath, color, Math.max(themeWhiteboardTokens.strokeEdgeFeatherWidthPx, renderWidth * themeWhiteboardTokens.pencilGrainWidthScale), brush.opacity * themeWhiteboardTokens.pencilGrainOpacityScale, primaryTexture.dashArray, primaryTexture.dashOffset),
      renderLine(centerPath, color, Math.max(themeWhiteboardTokens.strokeEdgeFeatherWidthPx, renderWidth * themeWhiteboardTokens.pencilGrainSecondaryWidthScale), brush.opacity * themeWhiteboardTokens.pencilGrainSecondaryOpacityScale, secondaryTexture.dashArray, secondaryTexture.dashOffset),
      ...renderPressureDetails(mediumPressurePath, heavyPressurePath, color, renderWidth * themeWhiteboardTokens.pencilPressureCoreWidthScale, brush.opacity * themeWhiteboardTokens.pencilPressureCoreOpacityScale),
    ]);
  }
  if (stroke.tool === 'marker') {
    return wrapBrush('marker', [
      pressure,
      renderLine(centerPath, color, renderWidth * themeWhiteboardTokens.markerCoreWidthScale, brush.opacity * themeWhiteboardTokens.markerCoreOpacityScale, undefined, undefined, themeWhiteboardTokens.markerLineCap),
      ...renderPressureDetails(mediumPressurePath, heavyPressurePath, color, renderWidth * themeWhiteboardTokens.markerPressureCoreWidthScale, brush.opacity * themeWhiteboardTokens.markerPressureCoreOpacityScale),
    ]);
  }
  if (stroke.tool === 'colored-pencil') {
    return wrapBrush('colored-pencil', [
      renderPressurePath(pressurePath, color, brush.opacity * themeWhiteboardTokens.coloredPencilBodyOpacityScale),
      ...renderMaterialGrainLines(
        stroke,
        grainPaths,
        color,
        Math.max(themeWhiteboardTokens.strokeEdgeFeatherWidthPx, renderWidth * themeWhiteboardTokens.coloredPencilGrainWidthScale),
        brush.opacity * themeWhiteboardTokens.coloredPencilGrainOpacityScale,
        themeWhiteboardTokens.coloredPencilGrainDashArray,
        themeWhiteboardTokens.coloredPencilGrainSecondaryDashArray,
        themeWhiteboardTokens.coloredPencilGrainDashOffsetPx,
        40,
      ),
    ]);
  }
  if (stroke.tool === 'crayon') {
    return wrapBrush('crayon', [
      renderPressurePath(pressurePath, color, brush.opacity * themeWhiteboardTokens.crayonBodyOpacityScale),
      ...renderMaterialGrainLines(
        stroke,
        grainPaths,
        color,
        Math.max(themeWhiteboardTokens.strokeEdgeFeatherWidthPx, renderWidth * themeWhiteboardTokens.crayonGrainWidthScale),
        brush.opacity * themeWhiteboardTokens.crayonGrainOpacityScale,
        themeWhiteboardTokens.crayonGrainDashArray,
        themeWhiteboardTokens.crayonGrainSecondaryDashArray,
        themeWhiteboardTokens.crayonGrainDashOffsetPx,
        60,
      ),
    ]);
  }
  if (stroke.tool === 'fountain') {
    return wrapBrush('fountain', [
      pressure,
      renderLine(centerPath, color, renderWidth * themeWhiteboardTokens.fountainCoreWidthScale, themeWhiteboardTokens.fountainCoreOpacityScale),
    ]);
  }
  return wrapBrush('pen', [pressure]);
}

function renderStrokeDab(stroke: WhiteboardStroke, color: string, opacity: number, x: number, y: number, width: number): string {
  const geometry = getStrokeDabGeometry(stroke.tool, width);
  const transform = geometry.angle ? ` transform="rotate(${geometry.angle} ${x} ${y})"` : '';
  if (geometry.shape === 'rect') {
    return `<rect data-whiteboard-brush-dab="marker" x="${x - geometry.width / 2}" y="${y - geometry.height / 2}" width="${geometry.width}" height="${geometry.height}" rx="${themeWhiteboardTokens.strokeEdgeFeatherWidthPx}" fill="${color}" opacity="${opacity}"${transform}/>`;
  }
  if (geometry.shape === 'ellipse') {
    return `<ellipse data-whiteboard-brush-dab="fountain" cx="${x}" cy="${y}" rx="${geometry.width / 2}" ry="${geometry.height / 2}" fill="${color}" opacity="${opacity}"${transform}/>`;
  }
  if (stroke.tool === 'watercolor') {
    return `<g data-whiteboard-brush-dab="watercolor"><circle cx="${x}" cy="${y}" r="${width * themeWhiteboardTokens.watercolorWashWidthScale / 2}" fill="${color}" opacity="${opacity * themeWhiteboardTokens.watercolorWashOpacityScale}"/><circle cx="${x}" cy="${y}" r="${width * themeWhiteboardTokens.watercolorOuterWidthScale / 2}" fill="${color}" opacity="${opacity}"/><circle cx="${x}" cy="${y}" r="${width / 2}" fill="${color}" opacity="${opacity * themeWhiteboardTokens.watercolorInnerOpacityScale}"/></g>`;
  }
  if (stroke.tool === 'pencil' || stroke.tool === 'colored-pencil' || stroke.tool === 'crayon') {
    const material = stroke.tool === 'pencil'
      ? { bodyOpacity: opacity, dashArray: themeWhiteboardTokens.pencilGrainDashArray, textureOpacity: opacity * themeWhiteboardTokens.pencilGrainOpacityScale }
      : stroke.tool === 'colored-pencil'
        ? { bodyOpacity: opacity * themeWhiteboardTokens.coloredPencilBodyOpacityScale, dashArray: themeWhiteboardTokens.coloredPencilGrainDashArray, textureOpacity: opacity * themeWhiteboardTokens.coloredPencilGrainOpacityScale }
        : { bodyOpacity: opacity * themeWhiteboardTokens.crayonBodyOpacityScale, dashArray: themeWhiteboardTokens.crayonGrainDashArray, textureOpacity: opacity * themeWhiteboardTokens.crayonGrainOpacityScale };
    const texture = getWhiteboardStrokeDashStyle(stroke, material.dashArray, 0, 30);
    return `<g data-whiteboard-brush-dab="${stroke.tool}"><circle cx="${x}" cy="${y}" r="${width / 2}" fill="${color}" opacity="${material.bodyOpacity}"/><circle cx="${x}" cy="${y}" r="${Math.max(0, width / 2 - themeWhiteboardTokens.strokeEdgeFeatherWidthPx)}" fill="${themeWhiteboardTokens.strokeNoFill}" opacity="${material.textureOpacity}" stroke="${color}" stroke-dasharray="${texture.dashArray}" stroke-dashoffset="${texture.dashOffset}" stroke-width="${themeWhiteboardTokens.strokeEdgeFeatherWidthPx}"/></g>`;
  }
  return `<circle data-whiteboard-brush-dab="pen" cx="${x}" cy="${y}" r="${width / 2}" fill="${color}" opacity="${opacity}"/>`;
}

function wrapBrush(tool: WhiteboardStroke['tool'], paths: string[]): string {
  return `<g data-whiteboard-brush="${tool}">${paths.join('')}</g>`;
}

function renderPressureDetails(
  mediumPath: string,
  heavyPath: string,
  color: string,
  width: number,
  opacity: number,
): string[] {
  return [mediumPath, heavyPath].filter(Boolean).map((path) => renderLine(path, color, width, opacity));
}

function renderMaterialGrainLines(
  stroke: WhiteboardStroke,
  paths: string[],
  color: string,
  width: number,
  opacity: number,
  primaryPattern: string,
  secondaryPattern: string,
  dashOffset: number,
  laneStart: number,
): string[] {
  const strokeSeed = getWhiteboardStrokeSeed(stroke.id);
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
    return renderLine(path, color, laneWidth, laneOpacity, texture.dashArray, texture.dashOffset, themeWhiteboardTokens.strokeLineCap, laneParity);
  });
}

function renderPressurePath(d: string, color: string, opacity: number): string {
  return `<path d="${d}" fill="${color}" opacity="${opacity}" stroke="${color}" stroke-linejoin="${themeWhiteboardTokens.strokeLineJoin}" stroke-width="${themeWhiteboardTokens.strokeEdgeFeatherWidthPx}" vector-effect="non-scaling-stroke"/>`;
}

function renderLine(
  d: string,
  color: string,
  width: number,
  opacity: number,
  dashArray?: string,
  dashOffset?: number,
  lineCap: string = themeWhiteboardTokens.strokeLineCap,
  grainGroup?: number,
): string {
  const dash = dashArray ? ` stroke-dasharray="${dashArray}"` : '';
  const offset = dashOffset === undefined ? '' : ` stroke-dashoffset="${dashOffset}"`;
  const grain = grainGroup === undefined ? '' : ` data-whiteboard-grain-group="${grainGroup}"`;
  return `<path${grain} d="${d}" fill="${themeWhiteboardTokens.strokeNoFill}" opacity="${opacity}" stroke="${color}"${dash}${offset} stroke-linecap="${lineCap}" stroke-linejoin="${themeWhiteboardTokens.strokeLineJoin}" stroke-width="${width}"/>`;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
