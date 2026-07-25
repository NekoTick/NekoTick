import { useEffect, useRef, type PointerEvent, type RefObject } from 'react';

interface DockItemLayout {
  center: number;
  element: HTMLElement;
  lastTranslateX: number;
  renderedTransform: string;
  renderedZoom: string;
  visual: HTMLElement;
  width: number;
}

interface WhiteboardDockMagnificationOptions {
  activationResponseMs: number;
  enabled?: boolean;
  maxScale: number;
  pointerResponseMs: number;
  radiusPx: number;
}

interface WhiteboardDockMagnification {
  onPointerCancel: () => void;
  onPointerEnter: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerLeave: () => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  ref: RefObject<HTMLDivElement | null>;
}

type SpringState = { value: number; velocity: number };

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const POINTER_EPSILON = 0.01;
const STRENGTH_EPSILON = 0.0001;
const supportsDockHover = (pointerType: string) => pointerType === 'mouse' || pointerType === 'pen';

export function useWhiteboardDockMagnification({
  activationResponseMs,
  enabled = true,
  maxScale,
  pointerResponseMs,
  radiusPx,
}: WhiteboardDockMagnificationOptions): WhiteboardDockMagnification {
  const ref = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<DockItemLayout[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const geometryDirtyRef = useRef(true);
  const pointerInsideRef = useRef(false);
  const pointerTargetRef = useRef(0);
  const pointerDisplayRef = useRef(0);
  const pointerVelocityRef = useRef(0);
  const strengthRef = useRef(0);
  const strengthTargetRef = useRef(0);
  const strengthVelocityRef = useRef(0);
  const lastFrameTimeRef = useRef<number | null>(null);
  const rootLeftRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const reducedMotionRef = useRef<boolean | null>(null);
  const scheduleRenderRef = useRef<() => void>(() => undefined);

  const cancelAnimation = () => {
    if (animationFrameRef.current !== null) {
      if (typeof window !== 'undefined') window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    lastFrameTimeRef.current = null;
  };

  const measureItems = () => {
    const root = ref.current;
    if (!root) {
      itemsRef.current = [];
      geometryDirtyRef.current = false;
      return;
    }
    const previousItems = new Map(itemsRef.current.map((item) => [item.element, item]));
    const rootBounds = root.getBoundingClientRect();
    const rootLeft = rootBounds.left;
    const scrollLeft = root.scrollLeft;
    rootLeftRef.current = rootLeft;
    scrollLeftRef.current = scrollLeft;
    itemsRef.current = Array.from(root.querySelectorAll<HTMLElement>('[data-whiteboard-dock-item="true"]')).flatMap((element) => {
      const visual = element.querySelector<HTMLElement>('[data-whiteboard-dock-visual="true"]');
      if (!visual) return [];
      const bounds = element.getBoundingClientRect();
      const previous = previousItems.get(element);
      const lastTranslateX = previous?.lastTranslateX ?? readTranslateX(element.style.transform);
      return [{
        center: bounds.left - rootLeft + scrollLeft - lastTranslateX + bounds.width / 2,
        element,
        lastTranslateX,
        renderedTransform: previous?.renderedTransform ?? element.style.transform,
        renderedZoom: previous?.renderedZoom ?? visual.style.zoom,
        visual,
        width: bounds.width,
      }];
    });
    geometryDirtyRef.current = false;
  };

  const render = () => {
    if (geometryDirtyRef.current) measureItems();
    const items = itemsRef.current;
    if (items.length === 0) return;

    const pointerX = pointerDisplayRef.current - rootLeftRef.current + scrollLeftRef.current;
    const strength = strengthRef.current;
    const scales = items.map(({ center }) => {
      const distance = Math.abs(pointerX - center);
      const influence = distance >= radiusPx
        ? 0
        : (1 + Math.cos(Math.PI * distance / radiusPx)) / 2;
      return 1 + strength * (maxScale - 1) * influence;
    });
    const totalExpansion = scales.reduce((sum, scale, index) => sum + items[index]!.width * (scale - 1), 0);
    let precedingExpansion = 0;
    items.forEach((item, index) => {
      const scale = scales[index]!;
      const expansion = item.width * (scale - 1);
      const translateX = precedingExpansion + expansion / 2 - totalExpansion / 2;
      const renderedTranslateX = Number(formatNumber(translateX, 3));
      const transform = `translate3d(${renderedTranslateX.toFixed(3)}px, 0, 0)`;
      const zoom = formatNumber(scale, 4);
      if (item.renderedTransform !== transform) {
        item.element.style.transform = transform;
        item.renderedTransform = transform;
      }
      if (item.renderedZoom !== zoom) {
        item.visual.style.zoom = zoom;
        item.renderedZoom = zoom;
      }
      item.lastTranslateX = renderedTranslateX;
      precedingExpansion += expansion;
    });
  };

  const snapToTargets = () => {
    cancelAnimation();
    pointerDisplayRef.current = pointerTargetRef.current;
    pointerVelocityRef.current = 0;
    strengthRef.current = strengthTargetRef.current;
    strengthVelocityRef.current = 0;
    render();
  };

  const isSettled = (state: SpringState, target: number, responseMs: number, epsilon: number) =>
    Math.abs(state.value - target) <= epsilon && Math.abs(state.velocity) * Math.max(1, responseMs) <= epsilon;

  const animate = (time: number) => {
    animationFrameRef.current = null;
    if (reducedMotionRef.current) {
      snapToTargets();
      return;
    }

    const elapsedMs = Math.min(64, Math.max(0, time - (lastFrameTimeRef.current ?? time - 16.667)));
    lastFrameTimeRef.current = time;
    const pointerState = advanceSpring(
      pointerDisplayRef.current, pointerTargetRef.current, pointerVelocityRef.current,
      pointerResponseMs, elapsedMs,
    );
    const strengthState = advanceSpring(
      strengthRef.current, strengthTargetRef.current, strengthVelocityRef.current,
      activationResponseMs, elapsedMs,
    );
    pointerDisplayRef.current = pointerState.value;
    pointerVelocityRef.current = pointerState.velocity;
    strengthRef.current = strengthState.value;
    strengthVelocityRef.current = strengthState.velocity;
    if (isSettled(pointerState, pointerTargetRef.current, pointerResponseMs, POINTER_EPSILON)) {
      pointerDisplayRef.current = pointerTargetRef.current;
      pointerVelocityRef.current = 0;
    }
    if (isSettled(strengthState, strengthTargetRef.current, activationResponseMs, STRENGTH_EPSILON)) {
      strengthRef.current = strengthTargetRef.current;
      strengthVelocityRef.current = 0;
    }
    render();

    const settled = pointerDisplayRef.current === pointerTargetRef.current
      && strengthRef.current === strengthTargetRef.current;
    if (settled) {
      lastFrameTimeRef.current = null;
      return;
    }
    animationFrameRef.current = window.requestAnimationFrame(animate);
  };

  const scheduleRender = () => {
    if (reducedMotionRef.current) {
      snapToTargets();
      return;
    }
    if (animationFrameRef.current === null) {
      animationFrameRef.current = window.requestAnimationFrame(animate);
    }
  };
  scheduleRenderRef.current = scheduleRender;

  const recordPointer = (event: PointerEvent<HTMLDivElement>): boolean => {
    const coalescedEvents = typeof event.nativeEvent.getCoalescedEvents === 'function'
      ? event.nativeEvent.getCoalescedEvents()
      : [];
    const lastEvent = coalescedEvents.length > 0 ? coalescedEvents[coalescedEvents.length - 1] : undefined;
    const nextPointer = lastEvent?.clientX ?? event.clientX;
    const changed = nextPointer !== pointerTargetRef.current;
    pointerTargetRef.current = nextPointer;
    return changed;
  };

  const onPointerEnter = (event: PointerEvent<HTMLDivElement>) => {
    if (!supportsDockHover(event.pointerType)) return;
    pointerInsideRef.current = true;
    recordPointer(event);
    measureItems();
    pointerDisplayRef.current = pointerTargetRef.current;
    pointerVelocityRef.current = 0;
    strengthTargetRef.current = 1;
    scheduleRender();
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointerInsideRef.current || !supportsDockHover(event.pointerType)) return;
    if (recordPointer(event)) scheduleRender();
  };
  const onPointerLeave = () => {
    if (!pointerInsideRef.current && strengthTargetRef.current === 0) return;
    pointerInsideRef.current = false;
    strengthTargetRef.current = 0;
    scheduleRender();
  };
  const onPointerCancel = onPointerLeave;

  useEffect(() => {
    if (!enabled) return undefined;
    const root = ref.current;
    if (!root) return undefined;

    const invalidateGeometry = () => {
      geometryDirtyRef.current = true;
      if (pointerInsideRef.current) scheduleRenderRef.current();
    };
    const handleScroll = () => {
      scrollLeftRef.current = root.scrollLeft;
      if (pointerInsideRef.current) scheduleRenderRef.current();
    };
    root.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', invalidateGeometry, { passive: true });

    const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(invalidateGeometry);
    mutationObserver?.observe(root, { childList: true, subtree: true });
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(invalidateGeometry);
    resizeObserver?.observe(root);

    let motionQuery: MediaQueryList | null = null;
    let handleMotionChange: (() => void) | null = null;
    if (typeof window.matchMedia === 'function') {
      motionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
      reducedMotionRef.current = motionQuery.matches;
      handleMotionChange = () => {
        reducedMotionRef.current = motionQuery?.matches ?? false;
        if (reducedMotionRef.current) snapToTargets();
        else if (pointerInsideRef.current) scheduleRenderRef.current();
      };
      motionQuery.addEventListener?.('change', handleMotionChange);
    } else {
      reducedMotionRef.current = false;
    }

    return () => {
      root.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', invalidateGeometry);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      if (motionQuery && handleMotionChange) motionQuery.removeEventListener?.('change', handleMotionChange);
      cancelAnimation();
    };
  }, [enabled]);

  return { onPointerCancel, onPointerEnter, onPointerLeave, onPointerMove, ref };
}

function advanceSpring(current: number, target: number, velocity: number, responseMs: number, elapsedMs: number): SpringState {
  // Critical damping preserves velocity across pointer updates without introducing oscillation.
  const omega = 2 / Math.max(1, responseMs);
  const decay = Math.exp(-omega * elapsedMs);
  const offset = current - target;
  const temp = (velocity + omega * offset) * elapsedMs;
  return {
    value: target + (offset + temp) * decay,
    velocity: (velocity - omega * temp) * decay,
  };
}

function formatNumber(value: number, decimals: number): string {
  return Number(value.toFixed(decimals)).toFixed(decimals);
}

function readTranslateX(transform: string): number {
  const match = transform.match(/translate3d\(([-\d.]+)px/);
  return match ? Number(match[1]) : 0;
}
