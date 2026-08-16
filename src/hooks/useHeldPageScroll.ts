import { RefObject, useEffect, useRef } from 'react';
import { isEditableShortcutTarget } from '@/lib/shortcuts/editableGuards';
import {
  CONTINUOUS_SCROLL_SPEED,
  HOLD_SCROLL_DELAY_MS,
  SCROLL_EASING_MS,
  VELOCITY_RESPONSE_MS,
  clampTargetScrollTop,
  getInitialScrollDelta,
  isEventWithinRoot,
  type HeldPageScrollState,
  type UseHeldPageScrollOptions,
} from './heldPageScrollMetrics';

const passiveCaptureListenerOptions = { capture: true, passive: true } as const;

export function useHeldPageScroll(
  scrollRootRef: RefObject<HTMLDivElement | null>,
  {
    enabled = true,
    scopeRef,
    ignoreEditableTargets = false,
  }: UseHeldPageScrollOptions = {},
) {
  const stateRef = useRef<HeldPageScrollState>({
    activeKey: null,
    direction: 0,
    continuousActive: false,
    isHovering: false,
    currentVelocity: 0,
    holdTimerId: null,
    rafId: null,
    lastTimestamp: null,
    targetScrollTop: null,
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const stopScrolling = () => {
      const state = stateRef.current;

      if (state.holdTimerId !== null) {
        window.clearTimeout(state.holdTimerId);
        state.holdTimerId = null;
      }

      if (state.rafId !== null) {
        cancelAnimationFrame(state.rafId);
        state.rafId = null;
      }

      state.activeKey = null;
      state.direction = 0;
      state.continuousActive = false;
      state.currentVelocity = 0;
      state.lastTimestamp = null;
      state.targetScrollTop = null;
    };

    const stopHolding = () => {
      const state = stateRef.current;
      if (state.holdTimerId !== null) {
        window.clearTimeout(state.holdTimerId);
        state.holdTimerId = null;
      }
      state.activeKey = null;
      state.direction = 0;
      state.continuousActive = false;
      if (state.rafId === null && Math.abs(state.currentVelocity) > 0.01) {
        ensureAnimation();
      }
    };

    const ensureAnimation = () => {
      if (stateRef.current.rafId !== null) {
        return;
      }

      const tick = (timestamp: number) => {
        const container = scrollRootRef.current;
        const state = stateRef.current;

        if (!container) {
          stopScrolling();
          return;
        }

        const deltaMs = state.lastTimestamp === null ? 16 : Math.min(timestamp - state.lastTimestamp, 32);
        state.lastTimestamp = timestamp;

        const baseTarget = state.targetScrollTop ?? container.scrollTop;
        const desiredVelocity =
          state.continuousActive && state.direction !== 0
            ? state.direction * CONTINUOUS_SCROLL_SPEED
            : 0;
        const velocityEase = 1 - Math.exp(-deltaMs / VELOCITY_RESPONSE_MS);
        state.currentVelocity += (desiredVelocity - state.currentVelocity) * velocityEase;

        if (state.continuousActive && state.direction !== 0) {
          state.targetScrollTop = clampTargetScrollTop(
            container,
            baseTarget + state.currentVelocity * deltaMs,
          );
        } else {
          state.targetScrollTop = clampTargetScrollTop(container, baseTarget);
        }

        const targetScrollTop = state.targetScrollTop;
        const currentScrollTop = container.scrollTop;
        const distance = targetScrollTop - currentScrollTop;

        if (Math.abs(distance) <= 0.5) {
          container.scrollTop = targetScrollTop;
        } else {
          const easing = 1 - Math.exp(-deltaMs / SCROLL_EASING_MS);
          container.scrollTop = clampTargetScrollTop(container, currentScrollTop + distance * easing);
        }

        const remainingDistance = Math.abs((state.targetScrollTop ?? container.scrollTop) - container.scrollTop);
        if (
          state.activeKey !== null ||
          state.continuousActive ||
          remainingDistance > 0.5 ||
          Math.abs(state.currentVelocity) > 0.01
        ) {
          state.rafId = requestAnimationFrame(tick);
          return;
        }

        state.rafId = null;
        state.lastTimestamp = null;
        state.targetScrollTop = null;
        state.currentVelocity = 0;
      };

      stateRef.current.rafId = requestAnimationFrame(tick);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return;
      }

      if (event.key !== 'PageUp' && event.key !== 'PageDown') {
        return;
      }

      const container = scrollRootRef.current;
      const scopeRoot = scopeRef?.current ?? container;
      const isHoverTriggered =
        stateRef.current.isHovering && !!container && !isEventWithinRoot(container, event.target);
      if (
        !container ||
        !scopeRoot ||
        (!stateRef.current.isHovering && !isEventWithinRoot(scopeRoot, event.target))
      ) {
        return;
      }

      if (ignoreEditableTargets && isEditableShortcutTarget(event.target) && !isHoverTriggered) {
        return;
      }

      if (container.scrollHeight <= container.clientHeight) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const nextKey = event.key;
      const nextDirection = nextKey === 'PageDown' ? 1 : -1;
      const state = stateRef.current;

      if (state.activeKey === nextKey) {
        return;
      }

      if (state.holdTimerId !== null) {
        window.clearTimeout(state.holdTimerId);
        state.holdTimerId = null;
      }
      state.continuousActive = false;
      state.lastTimestamp = null;
      state.activeKey = nextKey;
      state.direction = nextDirection;
      const baseTarget = state.targetScrollTop ?? container.scrollTop;
      state.targetScrollTop = clampTargetScrollTop(
        container,
        baseTarget + nextDirection * getInitialScrollDelta(container),
      );
      ensureAnimation();
      state.holdTimerId = window.setTimeout(() => {
        if (stateRef.current.activeKey !== nextKey) {
          return;
        }
        stateRef.current.holdTimerId = null;
        stateRef.current.continuousActive = true;
        stateRef.current.lastTimestamp = null;
        ensureAnimation();
      }, HOLD_SCROLL_DELAY_MS);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'PageUp' && event.key !== 'PageDown') {
        return;
      }

      if (stateRef.current.activeKey !== event.key) {
        return;
      }

      stopHolding();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopScrolling();
      }
    };

    const handleManualScrollIntent = (event: Event) => {
      const scopeRoot = scopeRef?.current ?? scrollRootRef.current;
      if (!scopeRoot || !isEventWithinRoot(scopeRoot, event.target)) {
        return;
      }

      if (
        stateRef.current.activeKey === null &&
        !stateRef.current.continuousActive &&
        Math.abs(stateRef.current.currentVelocity) <= 0.01 &&
        stateRef.current.targetScrollTop === null
      ) {
        return;
      }

      stopScrolling();
    };

    const hoverRoot = scopeRef?.current ?? scrollRootRef.current;
    const handlePointerEnter = () => {
      stateRef.current.isHovering = true;
    };
    const handlePointerLeave = () => {
      stateRef.current.isHovering = false;
    };

    hoverRoot?.addEventListener('pointerenter', handlePointerEnter);
    hoverRoot?.addEventListener('pointerleave', handlePointerLeave);

    window.addEventListener('blur', stopScrolling);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keyup', handleKeyUp, true);
    document.addEventListener('wheel', handleManualScrollIntent, passiveCaptureListenerOptions);
    document.addEventListener('pointerdown', handleManualScrollIntent, true);
    document.addEventListener('touchstart', handleManualScrollIntent, passiveCaptureListenerOptions);
    document.addEventListener('touchmove', handleManualScrollIntent, passiveCaptureListenerOptions);

    return () => {
      hoverRoot?.removeEventListener('pointerenter', handlePointerEnter);
      hoverRoot?.removeEventListener('pointerleave', handlePointerLeave);
      stateRef.current.isHovering = false;
      window.removeEventListener('blur', stopScrolling);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keyup', handleKeyUp, true);
      document.removeEventListener('wheel', handleManualScrollIntent, passiveCaptureListenerOptions);
      document.removeEventListener('pointerdown', handleManualScrollIntent, true);
      document.removeEventListener('touchstart', handleManualScrollIntent, passiveCaptureListenerOptions);
      document.removeEventListener('touchmove', handleManualScrollIntent, passiveCaptureListenerOptions);
      stopScrolling();
    };
  }, [enabled, ignoreEditableTargets, scopeRef, scrollRootRef]);
}
