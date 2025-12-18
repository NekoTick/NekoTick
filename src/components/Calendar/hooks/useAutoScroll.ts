/**
 * 自动滚动 Hook
 * 
 * 当拖动元素接近容器边缘时自动滚动
 */

import { useRef, useCallback } from 'react';
import { CALENDAR_CONSTANTS } from '../utils/timeUtils';

const { AUTO_SCROLL_THRESHOLD, AUTO_SCROLL_SPEED } = CALENDAR_CONSTANTS;

interface UseAutoScrollOptions {
  containerId: string;
  onScroll?: () => void;
}

export function useAutoScroll({ containerId, onScroll }: UseAutoScrollOptions) {
  const scrollDirectionRef = useRef<'up' | 'down' | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const getScrollContainer = useCallback(() => {
    return document.getElementById(containerId);
  }, [containerId]);

  const stopAutoScroll = useCallback(() => {
    scrollDirectionRef.current = null;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const startAutoScroll = useCallback((direction: 'up' | 'down') => {
    if (scrollDirectionRef.current === direction) return;
    
    scrollDirectionRef.current = direction;
    
    const scrollStep = () => {
      const scrollContainer = getScrollContainer();
      if (!scrollDirectionRef.current || !scrollContainer) return;

      const scrollAmount = scrollDirectionRef.current === 'down' ? AUTO_SCROLL_SPEED : -AUTO_SCROLL_SPEED;
      scrollContainer.scrollTop += scrollAmount;
      
      onScroll?.();

      if (scrollDirectionRef.current) {
        animationFrameRef.current = requestAnimationFrame(scrollStep);
      }
    };

    if (!animationFrameRef.current) {
      animationFrameRef.current = requestAnimationFrame(scrollStep);
    }
  }, [getScrollContainer, onScroll]);

  const checkAutoScroll = useCallback((elementRect: DOMRect) => {
    const scrollContainer = getScrollContainer();
    if (!scrollContainer) return;

    const containerRect = scrollContainer.getBoundingClientRect();

    const touchesTop = elementRect.top <= containerRect.top + AUTO_SCROLL_THRESHOLD;
    const touchesBottom = elementRect.bottom >= containerRect.bottom - AUTO_SCROLL_THRESHOLD;

    if (touchesTop && scrollContainer.scrollTop > 0) {
      startAutoScroll('up');
    } else if (touchesBottom && scrollContainer.scrollTop < scrollContainer.scrollHeight - scrollContainer.clientHeight) {
      startAutoScroll('down');
    } else {
      stopAutoScroll();
    }
  }, [getScrollContainer, startAutoScroll, stopAutoScroll]);

  return {
    checkAutoScroll,
    stopAutoScroll,
    getScrollContainer,
  };
}
