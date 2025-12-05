import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

interface UseResizableSidebarOptions {
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  texts?: string[];
  font?: string;
  padding?: number;
}

interface UseResizableSidebarReturn {
  width: number;
  isResizing: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  handleMouseDown: () => void;
  setWidth: (width: number) => void;
  minSidebarWidth: number;
}

/**
 * Measure text width using canvas
 */
function measureTextWidth(text: string, font: string): number {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return 0;
  context.font = font;
  return context.measureText(text).width;
}

/**
 * Hook for managing resizable sidebar width
 */
export function useResizableSidebar({
  initialWidth = 200,
  minWidth = 150,
  maxWidth = 400,
  texts = [],
  font = '14px sans-serif',
  padding = 100,
}: UseResizableSidebarOptions = {}): UseResizableSidebarReturn {
  const [sidebarWidth, setSidebarWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const currentWidthRef = useRef<number>(initialWidth);

  // Sync ref with state
  useEffect(() => {
    currentWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  // Calculate minimum width based on text content
  const minSidebarWidth = useMemo(() => {
    let maxTextWidth = minWidth;
    
    texts.forEach(text => {
      const textWidth = measureTextWidth(text, font);
      const totalWidth = textWidth + padding;
      if (totalWidth > maxTextWidth) {
        maxTextWidth = totalWidth;
      }
    });
    
    return Math.min(maxTextWidth, maxWidth);
  }, [texts, font, padding, minWidth, maxWidth]);

  const handleMouseDown = useCallback(() => {
    currentWidthRef.current = sidebarWidth;
    setIsResizing(true);
  }, [sidebarWidth]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    animationFrameRef.current = requestAnimationFrame(() => {
      const newWidth = Math.min(Math.max(e.clientX, minSidebarWidth), maxWidth);
      currentWidthRef.current = newWidth;
      
      // Direct DOM manipulation for smooth resizing
      if (containerRef.current) {
        containerRef.current.style.width = `${newWidth}px`;
      }
    });
  }, [isResizing, minSidebarWidth, maxWidth]);

  const handleMouseUp = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    setSidebarWidth(currentWidthRef.current);
    setIsResizing(false);
  }, []);

  // Attach/detach mouse event listeners
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return {
    width: sidebarWidth,
    isResizing,
    containerRef,
    handleMouseDown,
    setWidth: setSidebarWidth,
    minSidebarWidth,
  };
}
