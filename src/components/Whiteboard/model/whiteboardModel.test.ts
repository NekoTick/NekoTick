import { describe, expect, it } from 'vitest';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { clampWhiteboardZoom, resizeBrushSize } from './whiteboardModel';

describe('clampWhiteboardZoom', () => {
  it('keeps the minimum zoom without imposing a maximum', () => {
    expect(clampWhiteboardZoom(0)).toBe(themeWhiteboardTokens.minZoom);
    expect(clampWhiteboardZoom(8.567)).toBe(8.57);
  });
});

describe('resizeBrushSize', () => {
  it('keeps increasing past the former maximum without dropping below the minimum', () => {
    expect(resizeBrushSize(4, -1)).toBe(4.12);
    expect(resizeBrushSize(themeWhiteboardTokens.minBrushSize, 1)).toBe(themeWhiteboardTokens.minBrushSize);
  });
});
