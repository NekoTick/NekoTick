import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  SETTINGS_NOTES_CHAT_FLOATING_MAX_HEIGHT,
  SETTINGS_NOTES_CHAT_FLOATING_MAX_WIDTH,
  SETTINGS_NOTES_CHAT_FLOATING_MIN_HEIGHT,
  SETTINGS_NOTES_CHAT_FLOATING_MIN_WIDTH,
} from './unifiedStorageSaveTypes';
import {
  normalizeSettingsNotesChatFloatingSize,
  sanitizeUnifiedData,
} from './unifiedStorageMainNormalize';
import { createDefaultUnifiedData, type UnifiedData } from './unifiedStorageTypes';

function dataWithCodeLineNumberSetting(value: unknown): UnifiedData {
  const data = createDefaultUnifiedData();
  return {
    ...data,
    settings: {
      ...data.settings,
      markdown: {
        ...data.settings.markdown,
        codeBlock: { showLineNumbers: value },
      },
    },
  } as unknown as UnifiedData;
}

describe('main settings normalization', () => {
  it('uses the current disabled default for a missing code line-number setting', () => {
    const data = createDefaultUnifiedData();
    const markdown = data.settings.markdown as typeof data.settings.markdown & {
      codeBlock?: { showLineNumbers?: boolean };
    };
    Reflect.deleteProperty(markdown, 'codeBlock');

    expect(sanitizeUnifiedData(data).settings.markdown.codeBlock.showLineNumbers).toBe(false);
  });

  it('enables code line numbers only for an explicit true value', () => {
    fc.assert(fc.property(fc.anything(), (value) => {
      const normalized = sanitizeUnifiedData(dataWithCodeLineNumberSetting(value));
      expect(normalized.settings.markdown.codeBlock.showLineNumbers).toBe(value === true);
    }));
  });

  it('keeps every finite floating size bounded, integral, and idempotent', () => {
    const fallback = createDefaultUnifiedData().settings.ui!.notesChatFloatingSize;
    fc.assert(fc.property(
      fc.record({
        width: fc.double({ noNaN: true, noDefaultInfinity: true }),
        height: fc.double({ noNaN: true, noDefaultInfinity: true }),
      }),
      (size) => {
        const normalized = normalizeSettingsNotesChatFloatingSize(size, fallback);
        expect(Number.isInteger(normalized!.width)).toBe(true);
        expect(Number.isInteger(normalized!.height)).toBe(true);
        expect(normalized!.width).toBeGreaterThanOrEqual(SETTINGS_NOTES_CHAT_FLOATING_MIN_WIDTH);
        expect(normalized!.width).toBeLessThanOrEqual(SETTINGS_NOTES_CHAT_FLOATING_MAX_WIDTH);
        expect(normalized!.height).toBeGreaterThanOrEqual(SETTINGS_NOTES_CHAT_FLOATING_MIN_HEIGHT);
        expect(normalized!.height).toBeLessThanOrEqual(SETTINGS_NOTES_CHAT_FLOATING_MAX_HEIGHT);
        expect(normalizeSettingsNotesChatFloatingSize(normalized, fallback)).toEqual(normalized);
      },
    ));
  });
});
