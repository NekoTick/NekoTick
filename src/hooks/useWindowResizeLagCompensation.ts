import { useEffect } from 'react';
import { isNativeWindows } from '@/lib/desktop/platform';
import {
  getElectronBridge,
  isElectronRuntime,
} from '@/lib/electron/bridge';

const COMPENSATION_CSS_VARIABLE = '--vlaina-window-resize-compensation-x';
const CONTENT_COMPENSATION_CSS_VARIABLE = '--vlaina-window-resize-content-compensation-x';
const MAX_COMPENSATION_PX = 4096;

export function calculateWindowResizeCompensationPx({
  innerWidth,
  targetContentWidth,
}: {
  innerWidth: number;
  targetContentWidth: number;
}) {
  if (!Number.isFinite(innerWidth) || !Number.isFinite(targetContentWidth)) {
    return 0;
  }

  const compensation = Math.round(targetContentWidth - innerWidth);
  if (Math.abs(compensation) < 1) {
    return 0;
  }
  return Math.max(-MAX_COMPENSATION_PX, Math.min(MAX_COMPENSATION_PX, compensation));
}

export function useWindowResizeLagCompensation() {
  useEffect(() => {
    if (!isElectronRuntime() || !isNativeWindows()) {
      return undefined;
    }

    const root = document.documentElement;
    const baselineGap = window.outerWidth - window.innerWidth;
    let frameId: number | null = null;
    let lastCompensation = Number.NaN;
    let nativeContentWidth = window.innerWidth;
    let hasNativeBoundsSignal = false;

    const applyCompensation = () => {
      if (!hasNativeBoundsSignal) {
        nativeContentWidth = window.outerWidth - baselineGap;
      }
      const compensation = calculateWindowResizeCompensationPx({
        innerWidth: window.innerWidth,
        targetContentWidth: nativeContentWidth,
      });

      if (compensation !== lastCompensation) {
        lastCompensation = compensation;
        root.style.setProperty(COMPENSATION_CSS_VARIABLE, `${compensation}px`);
        root.style.setProperty(CONTENT_COMPENSATION_CSS_VARIABLE, `${compensation / 2}px`);
      }
    };

    const scheduleCompensation = () => {
      applyCompensation();
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        applyCompensation();
      });
    };

    const removeBoundsChangedListener = getElectronBridge()?.window.onBoundsChanged?.((bounds) => {
      if (!Number.isFinite(bounds?.width)) return;
      hasNativeBoundsSignal = true;
      nativeContentWidth = Number.isFinite(bounds.contentWidth)
        ? bounds.contentWidth!
        : bounds.width - baselineGap;
      scheduleCompensation();
    });

    applyCompensation();
    window.addEventListener('resize', scheduleCompensation, true);
    window.visualViewport?.addEventListener('resize', scheduleCompensation, true);
    window.visualViewport?.addEventListener('scroll', scheduleCompensation, true);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
      window.removeEventListener('resize', scheduleCompensation, true);
      window.visualViewport?.removeEventListener('resize', scheduleCompensation, true);
      window.visualViewport?.removeEventListener('scroll', scheduleCompensation, true);
      removeBoundsChangedListener?.();
      root.style.removeProperty(COMPENSATION_CSS_VARIABLE);
      root.style.removeProperty(CONTENT_COMPENSATION_CSS_VARIABLE);
    };
  }, []);
}
