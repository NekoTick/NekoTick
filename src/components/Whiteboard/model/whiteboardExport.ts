import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { writeImageBlobToClipboard } from '@/lib/clipboard';
import { shareNativeFile } from '@/lib/nativeFileShare';
import {
  type WhiteboardElement,
  type WhiteboardPaperStyle,
  type WhiteboardStroke,
} from './whiteboardModel';
import { getStrokeBounds } from './whiteboardSelection';
import { renderWhiteboardStrokeSvg } from './whiteboardStrokeExport';

export type WhiteboardExportFormat = 'jpeg' | 'png' | 'svg' | 'webp';
const WHITEBOARD_EXPORT_IMAGE_LOAD_TIMEOUT_MS = import.meta.env.MODE === 'test' ? 20 : 15_000;

interface WhiteboardExportOptions {
  elements: WhiteboardElement[];
  paper: WhiteboardPaperStyle;
  root: HTMLElement | null;
  strokes: WhiteboardStroke[];
}

export async function exportWhiteboard({
  elements,
  paper,
  root,
  strokes,
}: WhiteboardExportOptions, format: WhiteboardExportFormat) {
  const blob = await createWhiteboardExportBlob({ elements, paper, root, strokes }, format);
  if (!blob) return false;
  const fileName = `whiteboard-${new Date().toISOString().slice(0, 10)}.${format === 'jpeg' ? 'jpg' : format}`;
  if (await shareNativeFile({ data: blob, fileName, mimeType: blob.type, title: 'Whiteboard' })) {
    return true;
  }
  downloadBlob(blob, fileName);
  return true;
}

export async function copyWhiteboardImageToClipboard(options: WhiteboardExportOptions) {
  const blob = await createWhiteboardExportBlob(options, 'png');
  return blob ? writeImageBlobToClipboard(blob) : false;
}

export async function createWhiteboardExportBlob({
  elements,
  paper,
  root,
  strokes,
}: WhiteboardExportOptions, format: WhiteboardExportFormat): Promise<Blob | null> {
  const styles = root ? window.getComputedStyle(root) : document.documentElement.style;
  const bounds = getExportBounds(elements, strokes);
  const svg = buildExportSvg({ bounds, elements, paper, strokes, styles });
  if (format === 'svg') {
    return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  }
  const image = await loadSvgImage(svg);
  const canvas = document.createElement('canvas');
  canvas.width = bounds.width;
  canvas.height = bounds.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0);
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, getRasterMimeType(format), format === 'jpeg' ? 0.92 : undefined);
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function getRasterMimeType(format: WhiteboardExportFormat): string {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return 'image/png';
}

interface BuildExportSvgOptions {
  bounds: ExportBounds;
  elements: WhiteboardElement[];
  paper: WhiteboardPaperStyle;
  strokes: WhiteboardStroke[];
  styles: CSSStyleDeclaration;
}

function buildExportSvg({
  bounds,
  elements,
  paper,
  strokes,
  styles,
}: BuildExportSvgOptions) {
  const background = css(styles, '--vlaina-bg-primary');
  const paperColor = css(styles, '--vlaina-color-whiteboard-grid-dot');
  const paperPattern = renderPaperPattern(paper, paperColor);
  const content = [
    `<rect width="100%" height="100%" fill="${escapeAttr(background)}"/>`,
    paperPattern.defs,
    paperPattern.fill,
    ...elements.map((element) => renderElement(element, bounds)),
    `<g transform="translate(${-bounds.x} ${-bounds.y})">${strokes.map(renderWhiteboardStrokeSvg).join('')}</g>`,
  ].join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}">${content}</svg>`;
}

function renderPaperPattern(paper: WhiteboardPaperStyle, color: string): { defs: string; fill: string } {
  if (paper === 'blank') return { defs: '', fill: '' };
  const size = themeWhiteboardTokens.paperGridSizePx[paper];
  const mark = paper === 'dots'
    ? `<circle cx="${themeWhiteboardTokens.paperDotRadiusPx}" cy="${themeWhiteboardTokens.paperDotRadiusPx}" r="${themeWhiteboardTokens.paperDotRadiusPx}" fill="${escapeAttr(color)}"/>`
    : paper === 'grid'
      ? `<path d="M ${size} 0 L 0 0 0 ${size}" fill="${themeWhiteboardTokens.strokeNoFill}" stroke="${escapeAttr(color)}" stroke-width="${themeWhiteboardTokens.paperLineWidthPx}"/>`
      : `<path d="M 0 ${size - themeWhiteboardTokens.paperLineWidthPx} H ${size}" fill="${themeWhiteboardTokens.strokeNoFill}" stroke="${escapeAttr(color)}" stroke-width="${themeWhiteboardTokens.paperLineWidthPx}"/>`;
  return {
    defs: `<defs><pattern id="whiteboard-paper-pattern" width="${size}" height="${size}" patternUnits="userSpaceOnUse">${mark}</pattern></defs>`,
    fill: '<rect width="100%" height="100%" fill="url(#whiteboard-paper-pattern)"/>',
  };
}

function renderElement(element: WhiteboardElement, bounds: ExportBounds): string {
  const x = element.x - bounds.x;
  const y = element.y - bounds.y;
  if (element.imageSrc) {
    return `<image href="${escapeAttr(element.imageSrc)}" x="${x}" y="${y}" width="${element.width}" height="${element.height}" preserveAspectRatio="xMidYMid slice"/>`;
  }
  return '';
}

interface ExportBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

function getExportBounds(elements: WhiteboardElement[], strokes: WhiteboardStroke[]): ExportBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const includeBounds = (x: number, y: number, width: number, height: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  };
  elements.forEach((element) => includeBounds(element.x, element.y, element.width, element.height));
  strokes.forEach((stroke) => {
    const bounds = getStrokeBounds(stroke);
    if (bounds) includeBounds(bounds.x, bounds.y, bounds.width, bounds.height);
  });
  if (!Number.isFinite(minX)) {
    return { height: themeWhiteboardTokens.exportEmptyHeightPx, width: themeWhiteboardTokens.exportEmptyWidthPx, x: 0, y: 0 };
  }
  const padding = themeWhiteboardTokens.exportPaddingPx;
  return {
    height: Math.ceil(maxY - minY + padding * 2),
    width: Math.ceil(maxX - minX + padding * 2),
    x: minX - padding,
    y: minY - padding,
  };
}

async function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        image.onload = null;
        image.onerror = null;
      };
      image.onload = () => {
        cleanup();
        resolve();
      };
      image.onerror = () => {
        cleanup();
        reject(new Error('Whiteboard export failed'));
      };
      const timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error('Whiteboard export image load timed out'));
      }, WHITEBOARD_EXPORT_IMAGE_LOAD_TIMEOUT_MS);
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function css(styles: CSSStyleDeclaration, name: string): string {
  return styles.getPropertyValue(name).trim();
}

function escapeAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}
