export const OVERLAY_SCROLL_IDLE_EVENT = 'vlaina:overlay-scroll-idle';

export function dispatchOverlayScrollIdle(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OVERLAY_SCROLL_IDLE_EVENT));
}
