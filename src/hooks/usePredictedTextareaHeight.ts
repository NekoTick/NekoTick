import { useEffect, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import {
  measureTextareaContentHeight,
  resolveElementTextLayoutMetrics,
  type ElementTextLayoutMetrics,
} from '@/lib/text-layout';
import { themeTextAreaTokens } from '@/styles/themeTokens';

interface UsePredictedTextareaHeightOptions {
  maxHeight: number;
  maxPredictedLayoutChars?: number;
  minHeight: number;
  value: string;
}

export interface TextareaHeightController {
  syncHeight: (value?: string) => void;
}

function applyFallbackHeight(
  textarea: HTMLTextAreaElement,
  minHeight: number,
  maxHeight: number,
): void {
  textarea.style.height = themeTextAreaTokens.heightAuto;
  const nextHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight));
  textarea.style.height = `${nextHeight}px`;
}

export function usePredictedTextareaHeight(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  { maxHeight, maxPredictedLayoutChars, minHeight, value }: UsePredictedTextareaHeightOptions,
): TextareaHeightController {
  const latestOptionsRef = useRef({ maxHeight, maxPredictedLayoutChars, minHeight, value });
  const applyHeightRef = useRef<(value?: string) => void>(() => {});
  const observerRef = useRef<ResizeObserver | null>(null);
  const observedTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const metricsRef = useRef<{
    element: HTMLTextAreaElement;
    metrics: ElementTextLayoutMetrics;
  } | null>(null);
  const lastAppliedRef = useRef<{
    clampedToMax: boolean;
    height: string;
    maxHeight: number;
    maxPredictedLayoutChars?: number;
    minHeight: number;
    value: string;
    width: number;
  } | null>(null);
  const observedResizeFrameRef = useRef<number | null>(null);

  const clearPendingObservedResize = () => {
    if (observedResizeFrameRef.current !== null) {
      cancelAnimationFrame(observedResizeFrameRef.current);
      observedResizeFrameRef.current = null;
    }
  };

  const scheduleObservedResize = () => {
    const current = textareaRef.current;
    const lastApplied = lastAppliedRef.current;
    if (
      current &&
      lastApplied &&
      current.clientWidth === lastApplied.width &&
      current.style.height === lastApplied.height
    ) {
      return;
    }

    if (observedResizeFrameRef.current !== null) {
      return;
    }

    observedResizeFrameRef.current = requestAnimationFrame(() => {
      observedResizeFrameRef.current = null;
      const nextCurrent = textareaRef.current;
      const nextLastApplied = lastAppliedRef.current;
      if (
        nextCurrent &&
        nextLastApplied &&
        nextCurrent.clientWidth === nextLastApplied.width &&
        nextCurrent.style.height === nextLastApplied.height
      ) {
        return;
      }

      applyHeightRef.current();
    });
  };

  useLayoutEffect(() => {
    latestOptionsRef.current = { maxHeight, maxPredictedLayoutChars, minHeight, value };

    const applyHeight = (overrideValue?: string) => {
      const current = textareaRef.current;
      if (!current) {
        return;
      }

      const {
        maxHeight: nextMaxHeight,
        maxPredictedLayoutChars: nextMaxPredictedLayoutChars,
        minHeight: nextMinHeight,
        value: measuredValue,
      } = latestOptionsRef.current;
      const nextValue = overrideValue ?? measuredValue;

      if (nextMaxHeight <= 0) {
        return;
      }

      const width = current.clientWidth;
      if (width <= 0) {
        return;
      }

      try {
        const lastApplied = lastAppliedRef.current;
        if (
          nextMaxPredictedLayoutChars !== undefined
          && nextValue.length > nextMaxPredictedLayoutChars
        ) {
          const nextStyleHeight = `${nextMaxHeight}px`;
          if (current.style.height !== nextStyleHeight) {
            current.style.height = nextStyleHeight;
          }
          lastAppliedRef.current = {
            clampedToMax: true,
            height: nextStyleHeight,
            maxHeight: nextMaxHeight,
            maxPredictedLayoutChars: nextMaxPredictedLayoutChars,
            minHeight: nextMinHeight,
            value: nextValue,
            width,
          };
          return;
        }

        if (
          lastApplied?.clampedToMax &&
          lastApplied.width === width &&
          lastApplied.maxHeight === nextMaxHeight &&
          lastApplied.maxPredictedLayoutChars === nextMaxPredictedLayoutChars &&
          lastApplied.minHeight === nextMinHeight &&
          nextValue.length > lastApplied.value.length &&
          nextValue.startsWith(lastApplied.value)
        ) {
          if (current.style.height !== lastApplied.height) {
            current.style.height = lastApplied.height;
          }
          lastAppliedRef.current = {
            ...lastApplied,
            value: nextValue,
          };
          return;
        }

        let metrics = metricsRef.current?.element === current
          ? metricsRef.current.metrics
          : null;
        if (!metrics) {
          metrics = resolveElementTextLayoutMetrics(current);
          metricsRef.current = { element: current, metrics };
        }
        const nextHeight = measureTextareaContentHeight(nextValue, width, {
          font: metrics.font,
          lineHeight: metrics.lineHeight,
          minHeight: Math.max(0, nextMinHeight - metrics.paddingBlock),
          maxHeight: Math.max(0, nextMaxHeight - metrics.paddingBlock),
        });
        const nextStyleHeight = `${nextHeight + metrics.paddingBlock}px`;
        if (current.style.height !== nextStyleHeight) {
          current.style.height = nextStyleHeight;
        }
        lastAppliedRef.current = {
          clampedToMax: nextHeight + metrics.paddingBlock >= nextMaxHeight,
          height: nextStyleHeight,
          maxHeight: nextMaxHeight,
          maxPredictedLayoutChars: nextMaxPredictedLayoutChars,
          minHeight: nextMinHeight,
          value: nextValue,
          width,
        };
      } catch {
        applyFallbackHeight(current, nextMinHeight, nextMaxHeight);
        const fallbackHeight = Number.parseFloat(current.style.height);
        lastAppliedRef.current = {
          clampedToMax: Number.isFinite(fallbackHeight) && fallbackHeight >= nextMaxHeight,
          height: current.style.height,
          maxHeight: nextMaxHeight,
          maxPredictedLayoutChars: nextMaxPredictedLayoutChars,
          minHeight: nextMinHeight,
          value: nextValue,
          width,
        };
      }
    };

    applyHeightRef.current = applyHeight;
    applyHeight();

    const textarea = textareaRef.current;
    if (
      !textarea ||
      observedTextareaRef.current === textarea ||
      typeof ResizeObserver === 'undefined'
    ) {
      return;
    }

    observerRef.current?.disconnect();
    const resizeObserver = new ResizeObserver(scheduleObservedResize);
    resizeObserver.observe(textarea);
    observerRef.current = resizeObserver;
    observedTextareaRef.current = textarea;
  }, [maxHeight, maxPredictedLayoutChars, minHeight, textareaRef, value]);

  useEffect(() => {
    return () => {
      clearPendingObservedResize();
      observerRef.current?.disconnect();
      observerRef.current = null;
      observedTextareaRef.current = null;
      metricsRef.current = null;
      lastAppliedRef.current = null;
    };
  }, []);

  return {
    syncHeight: (nextValue) => {
      clearPendingObservedResize();
      applyHeightRef.current(nextValue);
    },
  };
}
