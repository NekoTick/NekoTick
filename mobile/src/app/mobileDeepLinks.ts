import type { MobileViewMode } from './mobilePlatform';

export interface MobileDeepLink {
  view: MobileViewMode;
}

const MOBILE_VIEWS = new Set<MobileViewMode>(['notes', 'chat', 'whiteboard', 'graph']);

export function parseMobileDeepLink(rawUrl: string): MobileDeepLink | null {
  if (!rawUrl || rawUrl.length > 2048) return null;
  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== 'vlaina:'
      || url.hostname !== 'open'
      || url.username
      || url.password
      || url.port
      || url.search
      || url.hash
    ) {
      return null;
    }
    const view = url.pathname.replace(/^\/+|\/+$/g, '') as MobileViewMode;
    return MOBILE_VIEWS.has(view) ? { view } : null;
  } catch {
    return null;
  }
}
