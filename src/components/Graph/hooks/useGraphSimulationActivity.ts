import { useEffect } from 'react';

export function prefersGraphReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function useGraphSimulationActivity(
  active: boolean,
  pause: () => void,
  resume: () => void,
) {
  useEffect(() => {
    const syncVisibility = () => {
      if (active && document.visibilityState !== 'hidden') resume();
      else pause();
    };
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => document.removeEventListener('visibilitychange', syncVisibility);
  }, [active, pause, resume]);
}
