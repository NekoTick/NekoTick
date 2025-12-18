/**
 * 日历缩放 Hook
 */

import { useEffect, useRef } from 'react';
import { useCalendarStore } from '@/stores/useCalendarStore';
import { CALENDAR_CONSTANTS } from '../utils/timeUtils';

const { MIN_HOUR_HEIGHT, MAX_HOUR_HEIGHT, ZOOM_FACTOR } = CALENDAR_CONSTANTS;

export function useCalendarZoom() {
  const { viewMode, hourHeight, setHourHeight } = useCalendarStore();
  const hourHeightRef = useRef(hourHeight);
  hourHeightRef.current = hourHeight;

  // 窗口大小变化时，自动调整 hourHeight 以填满容器
  useEffect(() => {
    if (viewMode === 'month') return;

    const handleResize = () => {
      const scrollContainer = document.getElementById('time-grid-scroll');
      if (!scrollContainer) return;

      const containerHeight = scrollContainer.clientHeight;
      const minHourHeightForContainer = containerHeight / 24;
      const currentHourHeight = hourHeightRef.current;

      if (currentHourHeight < minHourHeightForContainer) {
        setHourHeight(minHourHeightForContainer);
      }
    };

    window.addEventListener('resize', handleResize);
    setTimeout(handleResize, 100);

    return () => window.removeEventListener('resize', handleResize);
  }, [viewMode, setHourHeight]);

  // Ctrl+滚轮缩放时间刻度
  useEffect(() => {
    const handleZoomWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;

      const gridContainer = document.getElementById('time-grid-container');
      if (!gridContainer || !gridContainer.contains(e.target as Node)) return;

      if (viewMode === 'month') return;

      e.preventDefault();
      e.stopPropagation();

      const scrollContainer = document.getElementById('time-grid-scroll');
      const currentHourHeight = hourHeightRef.current;

      const containerHeight = scrollContainer?.clientHeight || 600;
      const dynamicMinHourHeight = Math.max(MIN_HOUR_HEIGHT, containerHeight / 24);

      const delta = e.deltaY > 0 ? -1 : 1;
      const newHourHeight = Math.max(
        dynamicMinHourHeight,
        Math.min(MAX_HOUR_HEIGHT, currentHourHeight * (delta > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR))
      );

      if (Math.abs(newHourHeight - currentHourHeight) < 0.1) return;

      // 锚点缩放：保持鼠标指向的时间点不变
      if (scrollContainer) {
        const rect = scrollContainer.getBoundingClientRect();
        const mouseY = e.clientY - rect.top;
        const scrollTop = scrollContainer.scrollTop;
        const mouseTimePosition = scrollTop + mouseY;
        const mouseTimeHours = mouseTimePosition / currentHourHeight;
        const newMouseTimePosition = mouseTimeHours * newHourHeight;
        const newScrollTop = newMouseTimePosition - mouseY;

        requestAnimationFrame(() => {
          scrollContainer.scrollTop = Math.max(0, newScrollTop);
        });
      }

      setHourHeight(newHourHeight);
    };

    document.addEventListener('wheel', handleZoomWheel, { passive: false, capture: true });
    return () => {
      document.removeEventListener('wheel', handleZoomWheel, { capture: true });
    };
  }, [setHourHeight, viewMode]);
}
