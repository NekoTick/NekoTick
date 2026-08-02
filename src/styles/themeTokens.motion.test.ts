import { describe, expect, it } from 'vitest';
import { FLOATING_CHAT_WINDOW_VARIANTS } from '@/lib/animations';
import { themeBackdropTokens, themeMotionTokens } from './themeTokens';

describe('theme motion tokens', () => {
  it('keeps modal entrance durations snappy', () => {
    expect(themeBackdropTokens.settingsModalDurationSeconds).toBeLessThanOrEqual(0.1);
    expect(themeMotionTokens.settingsModalDuration).toBeLessThanOrEqual(0.1);
    expect(themeBackdropTokens.createNotesRootDurationSeconds).toBeLessThanOrEqual(0.1);
    expect(themeMotionTokens.notesRootModalDuration).toBeLessThanOrEqual(0.1);
  });

  it('keeps embedded sidebar overlay fades snappy', () => {
    expect(themeMotionTokens.chatEmbeddedOverlayDuration).toBeLessThanOrEqual(0.1);
  });

  it('shares a settled sidebar slide spring', () => {
    expect(themeMotionTokens.sidebarSlideHiddenX).toBe('-100%');
    expect(themeMotionTokens.sidebarSlideRightHiddenX).toBe('100%');
    expect(themeMotionTokens.sidebarSlideSpringStiffness).toBe(520);
    expect(themeMotionTokens.sidebarSlideSpringDamping).toBe(44);
    expect(themeMotionTokens.sidebarSlideSpringMass).toBe(0.82);
    expect(FLOATING_CHAT_WINDOW_VARIANTS.hidden).toEqual({ x: '100%', opacity: 0 });
    expect(FLOATING_CHAT_WINDOW_VARIANTS.visible).toEqual({ x: 0, opacity: 1 });
  });
});
