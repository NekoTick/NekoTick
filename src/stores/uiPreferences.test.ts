import * as fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOTES_CHAT_FLOATING_DEFAULT_SIZE,
  NOTES_CHAT_FLOATING_MAX_SIZE,
  NOTES_CHAT_FLOATING_MIN_SIZE,
  UI_FONT_SIZE_DEFAULT,
  UI_FONT_SIZE_MAX,
  UI_FONT_SIZE_MIN,
} from './uiSliceTypes';
import {
  clampNotesChatFloatingSize,
  loadBoolean,
  normalizeFontSize,
} from './uiPreferences';

vi.mock('@/stores/unified/useUnifiedStore', () => ({
  useUnifiedStore: {
    getState: () => ({ setLastAppViewMode: vi.fn() }),
  },
}));

describe('UI preference normalization', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses the supplied boolean default for invalid stored values', () => {
    fc.assert(fc.property(
      fc.string().filter((value) => value !== 'true' && value !== 'false'),
      fc.boolean(),
      (stored, fallback) => {
        localStorage.setItem('test-boolean-setting', stored);
        expect(loadBoolean('test-boolean-setting', fallback)).toBe(fallback);
      },
    ));
  });

  it('normalizes arbitrary font sizes to a finite, bounded integer', () => {
    fc.assert(fc.property(
      fc.double({ noNaN: true, noDefaultInfinity: true }),
      (value) => {
        const normalized = normalizeFontSize(value);
        expect(Number.isInteger(normalized)).toBe(true);
        expect(normalized).toBeGreaterThanOrEqual(UI_FONT_SIZE_MIN);
        expect(normalized).toBeLessThanOrEqual(UI_FONT_SIZE_MAX);
        expect(normalizeFontSize(normalized)).toBe(normalized);
      },
    ));
    expect(normalizeFontSize(Number.NaN)).toBe(UI_FONT_SIZE_DEFAULT);
    expect(normalizeFontSize(Number.POSITIVE_INFINITY)).toBe(UI_FONT_SIZE_DEFAULT);
    expect(normalizeFontSize(Number.NEGATIVE_INFINITY)).toBe(UI_FONT_SIZE_DEFAULT);
  });

  it('normalizes arbitrary floating panel sizes to finite bounded integers', () => {
    fc.assert(fc.property(
      fc.record({
        width: fc.double({ noNaN: true, noDefaultInfinity: true }),
        height: fc.double({ noNaN: true, noDefaultInfinity: true }),
      }),
      (size) => {
        const normalized = clampNotesChatFloatingSize(size);
        expect(Number.isInteger(normalized.width)).toBe(true);
        expect(Number.isInteger(normalized.height)).toBe(true);
        expect(normalized.width).toBeGreaterThanOrEqual(NOTES_CHAT_FLOATING_MIN_SIZE.width);
        expect(normalized.width).toBeLessThanOrEqual(NOTES_CHAT_FLOATING_MAX_SIZE.width);
        expect(normalized.height).toBeGreaterThanOrEqual(NOTES_CHAT_FLOATING_MIN_SIZE.height);
        expect(normalized.height).toBeLessThanOrEqual(NOTES_CHAT_FLOATING_MAX_SIZE.height);
        expect(clampNotesChatFloatingSize(normalized)).toEqual(normalized);
      },
    ));

    expect(clampNotesChatFloatingSize({ width: Number.NaN, height: Number.POSITIVE_INFINITY }))
      .toEqual(NOTES_CHAT_FLOATING_DEFAULT_SIZE);
  });
});
