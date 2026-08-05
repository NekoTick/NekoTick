import type { AppViewMode } from '@/stores/uiSlice';

export type MobileViewMode = Extract<AppViewMode, 'notes' | 'chat' | 'whiteboard' | 'graph'>;

export interface MobileShareOptions {
  title?: string;
  text?: string;
  url?: string;
  files?: string[];
}

export interface MobilePlatformHooks {
  onReady?: () => void | Promise<void>;
  onViewChange?: (view: MobileViewMode) => void;
  share?: (options: MobileShareOptions) => Promise<boolean>;
}

declare global {
  interface Window {
    __VLAINA_MOBILE_PLATFORM__?: MobilePlatformHooks;
  }
}

export function getMobilePlatformHooks(): MobilePlatformHooks {
  if (typeof window === 'undefined') return {};
  return window.__VLAINA_MOBILE_PLATFORM__ ?? {};
}
