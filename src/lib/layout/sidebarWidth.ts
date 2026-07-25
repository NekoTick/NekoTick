import { themeSidebarTokens } from '@/styles/themeTokens';

export const APP_VIEW_MODE_SWITCH_MIN_WIDTH = 220;
export const SIDEBAR_CAPSULE_HORIZONTAL_CHROME_WIDTH = 40;
export const SIDEBAR_MIN_WIDTH =
  APP_VIEW_MODE_SWITCH_MIN_WIDTH + SIDEBAR_CAPSULE_HORIZONTAL_CHROME_WIDTH;
export const SIDEBAR_MAX_WIDTH = 560;
export const SIDEBAR_DEFAULT_WIDTH = themeSidebarTokens.defaultMinWidthPx;

export function clampSidebarWidth(width: number): number {
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, width));
}

export function getDefaultSidebarWidth(): number {
  if (typeof window === 'undefined') return clampSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
  const viewportWidth = Math.round(window.innerWidth * themeSidebarTokens.defaultViewportRatio);
  const defaultWidth = Math.max(
    themeSidebarTokens.defaultMinWidthPx,
    Math.min(themeSidebarTokens.defaultMaxWidthPx, viewportWidth),
  );
  return clampSidebarWidth(defaultWidth);
}
