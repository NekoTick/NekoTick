import { themeWhiteboardTokens } from '@/styles/themeTokens';
import type { WhiteboardElement, WhiteboardPoint } from '@/components/Whiteboard/model/core/whiteboardModel';

export interface WhiteboardTextMetrics {
  height: number;
  lines: string[];
  width: number;
}

export function createWhiteboardTextElement(
  point: WhiteboardPoint,
  color: string,
  id = `wb-text-${crypto.randomUUID()}`,
): WhiteboardElement {
  const fontSize = themeWhiteboardTokens.whiteboardTextFontSizePx;
  const lineHeight = themeWhiteboardTokens.whiteboardTextLineHeight;
  return {
    color,
    fontSize,
    height: fontSize * lineHeight,
    id,
    lineHeight,
    text: '',
    type: 'text',
    width: themeWhiteboardTokens.whiteboardTextEditorMinWidthPx,
    x: point.x,
    y: point.y - fontSize * lineHeight / 2,
  };
}

export function measureWhiteboardText(
  text: string,
  fontSize: number = themeWhiteboardTokens.whiteboardTextFontSizePx,
  lineHeight: number = themeWhiteboardTokens.whiteboardTextLineHeight,
): WhiteboardTextMetrics {
  const lines = text.split('\n');
  const context = getMeasurementContext(fontSize);
  const width = context
    ? Math.max(...lines.map((line) => context.measureText(line || ' ').width))
    : Math.max(...lines.map((line) => Array.from(line || ' ').length * fontSize * 0.6));
  return {
    height: Math.max(fontSize * lineHeight, lines.length * fontSize * lineHeight),
    lines,
    width: Math.max(themeWhiteboardTokens.whiteboardTextEditorMinWidthPx, width),
  };
}

export function getWhiteboardTextCaretIndex(
  element: WhiteboardElement,
  point: WhiteboardPoint,
): number | null {
  if (element.type !== 'text') return null;
  if (!element.text) return 0;
  const fontSize = element.fontSize ?? themeWhiteboardTokens.whiteboardTextFontSizePx;
  const lineHeightPx = fontSize * (element.lineHeight ?? themeWhiteboardTokens.whiteboardTextLineHeight);
  const localPoint = getWhiteboardTextLocalPoint(element, point);
  const lines = element.text.split('\n');
  const lineIndex = Math.max(0, Math.min(lines.length - 1, Math.floor(localPoint.y / lineHeightPx)));
  const line = lines[lineIndex];
  const lineStart = lines.slice(0, lineIndex).reduce((offset, current) => offset + current.length + 1, 0);
  if (!line) return lineStart;
  const context = getMeasurementContext(fontSize);
  const lineWidth = context?.measureText(line).width ?? Array.from(line).length * fontSize * 0.6;
  const direction = getWhiteboardTextDirection(line);
  const lineX = direction === 'rtl' ? element.width - lineWidth : 0;
  const targetX = localPoint.x - lineX;
  const nativeOffset = getNativeCaretOffset(line, targetX, direction, fontSize, lineHeightPx);
  return lineStart + (nativeOffset ?? getMeasuredCaretOffset(line, targetX, direction, context, fontSize));
}

export function finalizeWhiteboardTextElement(element: WhiteboardElement, text: string): WhiteboardElement | null {
  if (element.type !== 'text' || text.trim().length === 0) return null;
  const fontSize = element.fontSize ?? themeWhiteboardTokens.whiteboardTextFontSizePx;
  const lineHeight = element.lineHeight ?? themeWhiteboardTokens.whiteboardTextLineHeight;
  const metrics = measureWhiteboardText(text, fontSize, lineHeight);
  return { ...element, fontSize, height: metrics.height, lineHeight, text, width: metrics.width };
}

export function loadWhiteboardTextFonts(
  text: string,
  fontSize: number = themeWhiteboardTokens.whiteboardTextFontSizePx,
): Promise<FontFace[]> | null {
  if (typeof document === 'undefined' || !document.fonts?.load) return null;
  return document.fonts.load(`${fontSize}px ${themeWhiteboardTokens.whiteboardTextFontFamily}`, text);
}

function getMeasurementContext(fontSize: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  const context = document.createElement('canvas').getContext('2d');
  if (context) {
    context.font = `${fontSize}px ${themeWhiteboardTokens.whiteboardTextFontFamily}`;
  }
  return context;
}

function getWhiteboardTextLocalPoint(element: WhiteboardElement, point: WhiteboardPoint): WhiteboardPoint {
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  const angle = -(element.rotation ?? 0);
  const dx = point.x - centerX;
  const dy = point.y - centerY;
  const rotatedX = centerX + dx * Math.cos(angle) - dy * Math.sin(angle);
  const rotatedY = centerY + dx * Math.sin(angle) + dy * Math.cos(angle);
  const x = rotatedX - element.x;
  const y = rotatedY - element.y;
  return {
    x: element.flipX ? element.width - x : x,
    y: element.flipY ? element.height - y : y,
  };
}

function getNativeCaretOffset(
  text: string,
  targetX: number,
  direction: 'ltr' | 'rtl',
  fontSize: number,
  lineHeightPx: number,
): number | null {
  if (typeof document === 'undefined' || !document.body || typeof document.createRange !== 'function') return null;
  const offsets = getCaretOffsets(text);
  const mirror = document.createElement('div');
  const textNode = document.createTextNode(text);
  const range = document.createRange();
  const positions: number[] = [];
  mirror.dir = direction;
  Object.assign(mirror.style, {
    border: '0',
    fontFamily: themeWhiteboardTokens.whiteboardTextFontFamily,
    fontSize: `${fontSize}px`,
    left: '0',
    lineHeight: `${lineHeightPx}px`,
    margin: '0',
    opacity: '0',
    padding: '0',
    pointerEvents: 'none',
    position: 'fixed',
    top: '0',
    whiteSpace: 'pre',
  });
  mirror.append(textNode);
  document.body.append(mirror);
  try {
    for (const offset of offsets) {
      range.setStart(textNode, offset);
      range.setEnd(textNode, offset);
      const left = range.getBoundingClientRect().left;
      if (!Number.isFinite(left)) return null;
      positions.push(left);
    }
  } catch {
    return null;
  } finally {
    mirror.remove();
  }
  const leftEdge = Math.min(...positions);
  const rightEdge = Math.max(...positions);
  if (rightEdge - leftEdge < 0.01) return null;
  return getClosestCaretOffset(offsets, positions.map((position) => position - leftEdge), targetX);
}

function getMeasuredCaretOffset(
  text: string,
  targetX: number,
  direction: 'ltr' | 'rtl',
  context: CanvasRenderingContext2D | null,
  fontSize: number,
): number {
  const offsets = getCaretOffsets(text);
  const width = (offset: number) => context?.measureText(text.slice(0, offset)).width
    ?? Array.from(text.slice(0, offset)).length * fontSize * 0.6;
  const lineWidth = width(text.length);
  const positions = offsets.map((offset) => direction === 'rtl' ? lineWidth - width(offset) : width(offset));
  return getClosestCaretOffset(offsets, positions, targetX);
}

function getClosestCaretOffset(offsets: number[], positions: number[], targetX: number): number {
  let closestOffset = offsets[0];
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < offsets.length; index += 1) {
    const distance = Math.abs(positions[index] - targetX);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestOffset = offsets[index];
    }
  }
  return closestOffset;
}

function getCaretOffsets(text: string): number[] {
  if (typeof Intl.Segmenter === 'function') {
    const offsets = [0];
    for (const segment of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
      offsets.push(segment.index + segment.segment.length);
    }
    return offsets;
  }
  const offsets = [0];
  for (const character of Array.from(text)) offsets.push(offsets.at(-1)! + character.length);
  return offsets;
}

function getWhiteboardTextDirection(text: string): 'ltr' | 'rtl' {
  for (const character of Array.from(text)) {
    if (/[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/u.test(character)) return 'rtl';
    if (/\p{Letter}/u.test(character)) return 'ltr';
  }
  return 'ltr';
}
