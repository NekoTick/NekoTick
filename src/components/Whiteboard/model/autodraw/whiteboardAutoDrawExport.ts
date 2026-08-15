import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { getWhiteboardAutoDrawCatalogEntry } from './whiteboardAutoDrawCatalog';
import type { WhiteboardElement } from '../whiteboardModel';

export function renderWhiteboardAutoDrawIconSvg(
  element: WhiteboardElement,
  x: number,
  y: number,
): string {
  if (!element.autoDrawIcon) return '';
  const viewBoxSize = themeWhiteboardTokens.autoDrawIconViewBoxSizePx;
  const strokeWidth = themeWhiteboardTokens.autoShapeStrokeWidthPx * viewBoxSize
    / Math.max(1, Math.min(element.width, element.height));
  const nodes = getWhiteboardAutoDrawCatalogEntry(element.autoDrawIcon).nodes.map(([tag, attributes]) => {
    const values = Object.entries(attributes)
      .filter(([name]) => name !== 'key')
      .map(([name, value]) => `${toSvgAttribute(name)}="${escapeAttr(value)}"`)
      .join(' ');
    return `<${tag}${values ? ` ${values}` : ''}/>`;
  }).join('');
  return `<svg data-whiteboard-autodraw-icon="${element.autoDrawIcon}" x="${x}" y="${y}" width="${element.width}" height="${element.height}" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" preserveAspectRatio="xMidYMid meet" fill="${themeWhiteboardTokens.strokeNoFill}" stroke="${escapeAttr(element.color ?? themeWhiteboardTokens.whiteboardTextDefaultColor)}" stroke-linecap="${themeWhiteboardTokens.strokeLineCap}" stroke-linejoin="${themeWhiteboardTokens.strokeLineJoin}" stroke-width="${strokeWidth}">${nodes}</svg>`;
}

function toSvgAttribute(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function escapeAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
